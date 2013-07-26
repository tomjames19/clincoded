from PIL import Image
from base64 import b64encode
from typedsheets import cast_rows, remove_nulls
import logging
import mimetypes
import os.path
import xlrd
import xlreader
from zipfile import ZipFile
# http://www.lexicon.net/sjmachin/xlrd.html

logger = logging.getLogger('encoded')
logger.setLevel(logging.INFO)  # doesn't work to shut off sqla INFO

TYPE_URL = {
    # TODO This has appears in 3 places... maybe it shoudl be configged
    'organism': '/organisms/',
    'source': '/sources/',
    'target': '/targets/',
    'antibody_lot': '/antibody-lots/',
    'antibody_validation': '/validations/',
    'antibody_approval': '/antibodies/',
    'mouse_donor': '/mouse-donors/',
    'human_donor': '/human-donors/',
    'document': '/documents/',
    'biosample': '/biosamples/',
    'treatment': '/treatments/',
    'construct': '/constructs/',
    'construct_validation': '/construct-validations/',
    'colleague': '/users/',
    'lab': '/labs/',
    'award': '/awards/',
    'platform': '/platforms/',
    'library': '/libraries/',
    'replicate': '/replicates/',
    'software': '/software/',
    'file': '/files/',
    'dataset': '/datasets/',
    'experiment': '/experiments/',
    'rnai': '/rnai/',
}

ORDER = [
    'award',
    'lab',
    'colleague',
    'organism',
    'source',
    'target',
    'antibody_lot',
    'antibody_validation',
    'antibody_approval',
    'mouse_donor',
    'human_donor',
    'document',
    'treatment',
    'construct',
    'construct_validation',
    'rnai',
    'biosample',
    'platform',
    'library',
    'experiment',
    'replicate',
    # 'software',
    'file',
    # 'dataset',
]


def find_doc(docsdir, filename):
    path = None
    for dirpath in docsdir:
        candidate = os.path.join(dirpath, filename)
        if not os.path.exists(candidate):
            continue
        if path is not None:
            msg = 'Duplicate filenames: %s, %s' % (path, candidate)
            raise AssertionError(msg)
        path = candidate
    if path is None:
        raise ValueError('File not found: %s' % filename)
    return path


def trim(value):
    """ Shorten over long binary fields in error log
    """
    if isinstance(value, dict):
        return {k: trim(v) for k, v in value.iteritems()}
    if isinstance(value, list):
        return [trim(v) for v in value]
    if isinstance(value, basestring) and len(value) > 160:
        return value[:77] + '...' + value[-80:]
    return value


def read_single_sheet(filename, name):
    assert filename.endswith('.zip')
    zf = ZipFile(filename)
    filename = name + '.xlsx'
    f = zf.open(filename)
    book = xlrd.open_workbook(file_contents=f.read())
    sheet, = book.sheets()
    return xlreader.DictReader(sheet)


def filter_test_only(dictrows, filter_test_only=False, **settings):
    if filter_test_only:
        return _filter_test_only(dictrows)
    else:
        return dictrows


def _filter_test_only(dictrows):
    for row in dictrows:
        if row.get('test', True):
            yield row


def filter_skip(dictrows, **settings):
    for row in dictrows:
        if row.get('test', '') != 'skip':
            yield row


def filter_missing_key(dictrows, *keys):
    for row in dictrows:
        if any(key in row for key in keys):
            yield row


def remove_keys(dictrows, *keys):
    for row in dictrows:
        for key in keys:
            row.pop(key, None)
        yield row


def remove_unknown(dictrows):
    for row in dictrows:
        for k, v in list(row.iteritems()):
            if k != 'lot_id' and unicode(v).lower() == 'unknown':
                del row[k]
        yield row


def remove_blank(dictrows):
    for row in dictrows:
        yield {k: v for k, v in row.iteritems() if k != '' and v != ''}



def image_data(stream, filename=None):
    data = {}
    if filename is not None:
        data['download'] = filename
    im = Image.open(stream)
    im.verify()
    data['width'], data['height'] = im.size
    mime_type, _ = mimetypes.guess_type('name.%s' % im.format)
    data['type'] = mime_type
    data['href'] = data_uri(stream, mime_type)
    return data


def data_uri(stream, mime_type):
    stream.seek(0, 0)
    encoded_data = b64encode(stream.read())
    return 'data:%s;base64,%s' % (mime_type, encoded_data)


def update(testapp, url, value):
    res = testapp.post_json(url, value, status='*')
    if res.status_int == 200:
        logger.debug('%s UPDATED' % url)
    elif res.status_int == 404:
        logger.debug('%s not found for UPDATE, posting as new' % url)
    elif res.status_int == 409:
        logger.warn('Error CONFLICT for UPDATE %s: %s. Value:\n%r\n' % (url, res.json['detail'], trim(value)))
    elif res.status_int == 422:
        logger.warn('Error VALIDATING for UPDATE %s: %r. Value:\n%r\n' % (url, trim(res.json['errors']), trim(value)))
    else:
        logger.warn('Error UPDATING %s: %s. Value:\n%r\n' % (url, res.status, trim(value)))
    return res


def create(testapp, url, value):
    uuid = value['uuid']
    res = testapp.post_json(url, value, status='*')
    if res.status_int == 201:
        pass
    elif res.status_int == 409:
        logger.warn('Error CONFLICT NEW %s %s: %s. Value:\n%r\n' % (url, uuid, res.json['detail'], trim(value)))
    elif res.status_int == 422:
        logger.warn('Error VALIDATING NEW %s %s: %r. Value:\n%r\n' % (url, uuid, trim(res.json['errors']), trim(value)))
    else:
        logger.warn('Error SUBMITTING NEW %s %s: %s. Value:\n%r\n' % (url, uuid, res.status, trim(value)))
    return res


def post_collection(testapp, url, rows):
    count = 0
    nload = 0
    nupdate = 0
    nskipped = 0
    for row in rows:
        count += 1
        uuid = row['uuid']
        if row.pop('_skip', False):
            nskipped += 1
            logger.warn('Error PROCESSING NEW %s %s. Value:\n%r\n' % (url, uuid, trim(row)))
            continue
        update_url = url + uuid + '/'
        res = update(testapp, update_url, row)
        if res.status_int == 200:
            nupdate += 1
        if res.status_int != 404:
            continue
        res = create(testapp, url, row)
        if res.status_int == 201:
            nload += 1
    nerrors = count - nload - nupdate
    logger.info('Loaded %d for %s. NEW: %d, UPDATE: %d, ERRORS: %d' % (count, url, nload, nupdate, nerrors))


def check_attachment(docsdir, filename):

    _, ext = os.path.splitext(filename.lower())

    doc = {}
    if ext:
        stream = open(find_doc(docsdir, filename), 'rb')
        if ext in ('.png', '.jpg', '.jpeg', '.tiff', '.tif', '.gif'):
            doc = image_data(stream, filename)

        elif ext == '.pdf':
            mime_type = 'application/pdf'
            doc = {
                'download': filename,
                'type': mime_type,
                'href': data_uri(stream, mime_type)
            }
        elif ext == '.txt':
            mime_type = 'text/plain'
            doc = {
                'download': filename,
                'type': mime_type,
                'href': data_uri(stream, mime_type)
            }

        else:
            raise ValueError("Unknown file type for %s" % filename)

    return doc


def add_attachment(dictrows, docsdir=(), **settings):
    for row in dictrows:
        filename = row['attachment']
        try:
            row['attachment'] = check_attachment(docsdir, filename)
        except ValueError, e:
            logger.warn('Error adding attachment for %s: %r' % (row['uuid'], e))
            row['_skip'] = True
        yield row


def default_pipeline(pipeline, **settings):
    pipeline = remove_blank(pipeline)
    pipeline = cast_rows(pipeline)
    #pipeline = remove_nulls(pipeline)
    pipeline = filter_skip(pipeline)
    pipeline = filter_test_only(pipeline, **settings)
    pipeline = filter_missing_key(pipeline, 'uuid')
    pipeline = remove_keys(pipeline, 'schema_version')
    pipeline = remove_unknown(pipeline)
    pipeline = remove_keys(pipeline, 'test')
    return pipeline


def attachment_pipeline(pipeline, **settings):
    pipeline = add_attachment(pipeline, **settings)
    return pipeline


def bootstrap_colleagues_pipeline(pipeline, **settings):
    pipeline = remove_keys(pipeline, 'lab', 'submits_for')
    return pipeline


def biosamples_pipeline(pipeline, **settings):
    pipeline = remove_keys(pipeline, 'derived_from', 'contained_in')
    return pipeline


def biosamples_update_pipeline(pipeline, **settings):
    pipeline = filter_missing_key(pipeline, 'derived_from', 'contained_in')
    return pipeline


def experiments_pipeline(pipeline, **settings):
    pipeline = remove_keys(pipeline, 'files', 'possible_controls')
    return pipeline


def experiments_update_pipeline(pipeline, **settings):
    pipeline = filter_missing_key(pipeline, 'files', 'possible_controls')
    return pipeline


PIPELINE = {
    'antibody_validation': attachment_pipeline,
    'construct_validation': attachment_pipeline,
    'document': attachment_pipeline,
    'biosample': biosamples_pipeline,
    'experiment': experiments_pipeline
}

UPDATE_ORDER = [
    'biosample',
    'experiment',
]

UPDATE_PIPELINE = {
    'biosample': biosamples_update_pipeline,
    'experiment': experiments_update_pipeline
}


def load_all(testapp, filename, docsdir, test=False):
    import pdb
    import sys
    import traceback
    try:
        item_type = 'colleague'
        url = TYPE_URL[item_type]
        reader = read_single_sheet(filename, item_type)
        pipeline = default_pipeline(reader, docsdir=docsdir, filter_test_only=test)
        pipeline = bootstrap_colleagues_pipeline(pipeline)
        post_collection(testapp, url, pipeline)
        for item_type in ORDER:
            url = TYPE_URL[item_type]
            reader = read_single_sheet(filename, item_type)
            pipeline = default_pipeline(reader, docsdir=docsdir, filter_test_only=test)
            extra = PIPELINE.get(item_type)
            if extra is not None:
                pipeline = extra(pipeline, docsdir=docsdir, filter_test_only=test)
            post_collection(testapp, url, pipeline)
        for item_type in UPDATE_ORDER:
            url = TYPE_URL[item_type]
            reader = read_single_sheet(filename, item_type)
            pipeline = default_pipeline(reader, docsdir=docsdir, filter_test_only=test)
            extra = UPDATE_PIPELINE.get(item_type)
            if extra is not None:
                pipeline = extra(pipeline, docsdir=docsdir, filter_test_only=test)
            post_collection(testapp, url, pipeline)
    except:
        type, value, tb = sys.exc_info()
        traceback.print_exc()
        pdb.post_mortem(tb)
