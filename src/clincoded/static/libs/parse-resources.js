'use strict';
// Derived from:
// https://github.com/standard-analytics/pubmed-schema-org/blob/master/lib/pubmed.js
var _ = require('underscore');
var moment = require('moment');

module.exports.parseClinvar = parseClinvar;

function parseClinvar(xml){
    var variant = {};
    variant.extraData = {};
    var doc = new DOMParser().parseFromString(xml, 'text/xml');

    var $ClinVarResult = doc.getElementsByTagName('ClinVarResult-Set')[0];
    if ($ClinVarResult) {
        var $VariationReport = $ClinVarResult.getElementsByTagName('VariationReport')[0];
        if ($VariationReport) {
            // Get the ID (just in case) and Preferred Title
            variant.clinvarVariantId = $VariationReport.getAttribute('VariationID');
            variant.clinvarVariantTitle = $VariationReport.getAttribute('VariationName');
            var $Allele = $VariationReport.getElementsByTagName('Allele')[0];
            if ($Allele) {
                var $HGVSlist_raw = $Allele.getElementsByTagName('HGVSlist')[0];
                if ($HGVSlist_raw) {
                    // get the HGVS entries
                    var $HGVSlist = $HGVSlist_raw.getElementsByTagName('HGVS');
                    variant.extraData.hgvs = [];
                    _.map($HGVSlist, $HGVS => {
                        let temp_hgvs = $HGVS.textContent;
                        let assembly = $HGVS.getAttribute('Assembly');
                        if (assembly) {
                            temp_hgvs = temp_hgvs + ' (' + assembly + ')';
                        }
                        variant.extraData.hgvs.push(temp_hgvs);
                    });
                }
            }
            /*
            // code snippet for grabbing dbSNP from ClinVar. Disable for now
            var $Allele = $VariationReport.getElementsByTagName('Allele')[0];
            if ($Allele) {
                var $XRefList = $Allele.getElementsByTagName('XRefList')[0];
                var $XRef = $XRefList.getElementsByTagName('XRef');
                for(var i = 0; i < $XRef.length; i++) {
                    if ($XRef[i].getAttribute('DB') === 'dbSNP') {
                        variant.dbSNPId = $XRef[i].getAttribute('ID');
                    }
                }
            }
            */
        }
    }

    return variant;
}

module.exports.parseCAR = parseCAR;

function parseCAR(json) {
    var data = {};
    // set carId in payload, since we'll always have this from a CAR response
    data.carId = json['@id'].substring(json['@id'].indexOf('CA'));
    if (json.externalRecords) {
        // extract ClinVar data if available
        if (json.externalRecords.ClinVar && json.externalRecords.ClinVar.length > 0) {
            data.clinvarVariantId = json.externalRecords.ClinVar[0].variationId;
            data.clinvarVariantTitle = json.externalRecords.ClinVar[0].preferredName;
        }
    }
    var temp_gr_hgvs = {};
    var temp_other_hgvs = [];
    if (json.genomicAlleles && json.genomicAlleles.length > 0) {
        json.genomicAlleles.map(function(genomicAllele, i) {
            if (genomicAllele.hgvs && genomicAllele.hgvs.length > 0) {
                // check the genomicAlleles hgvs terms
                genomicAllele.hgvs.map(function(hgvs_temp, j) {
                    // skip the hgvs term if it starts with 'CM'
                    if (!hgvs_temp.startsWith('CM')) {
                        if (hgvs_temp.startsWith('NC')) {
                            // special handling for 'NC' hgvs terms
                        } else {
                            temp_other_hgvs.push(hgvs_temp);
                        }
                    }
                });
            }
        });
    }
    if (json.transcriptAlleles && json.transcriptAlleles.length > 0) {
        json.transcriptAlleles.map(function(transcriptAllele, i) {
            if (transcriptAllele.hgvs && transcriptAllele.hgvs.length > 0) {
                transcriptAllele.hgvs.map(function(hgvs_temp, j) {
                    temp_other_hgvs.push(hgvs_temp);
                });
            }
        });
    }

    var temp_hgvs = {};
    if (temp_other_hgvs.length > 0) {
        temp_hgvs.others = temp_other_hgvs;
    }
    if (temp_hgvs != {}) {
        data.hgvsNames = temp_hgvs;
    }
    console.log(data);
    return data;
}
