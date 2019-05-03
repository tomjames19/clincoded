'use strict';

// stdlib
import React from 'react';
import createReactClass from 'create-react-class';
import PropTypes from 'prop-types';

// third party lib
import _ from 'underscore';
import { Form, FormMixin, Input } from 'libs/bootstrap/form';
import { ContextualHelp } from 'libs/bootstrap/contextual_help';
import ModalComponent from 'libs/bootstrap/modal';
import moment from 'moment';

// Internal lib
import { EvidenceModalManager } from 'components/variant_central/interpretation/segregation/evidenceModalManager';
import { extraEvidence } from 'components/variant_central/interpretation/segregation/segregationData';
import { external_url_map } from 'components/globals';

let EvidenceTable = createReactClass({
    propTypes: {
        tableData: PropTypes.array,                 // Evidence data for this table
        allData: PropTypes.array,                   // All extra evidence we've collected
        subcategory: PropTypes.string,              // subcategory (usually the panel) the evidence is part of
        deleteEvidenceFunc: PropTypes.func,         // Function to call to delete an evidence
        evidenceCollectionDone: PropTypes.func,     // Function to call to add/edit an evidence
        criteriaList: PropTypes.array,              // ACMG criteria
        session: PropTypes.object,                  // Session object
        affiliation: PropTypes.object,              // User's affiliation
        viewOnly: PropTypes.bool,                   // If the page is in read-only mode
        canCurrUserModifyEvidence: PropTypes.func   // funcition to check if current logged in user can modify the given evidence
    },

    getInitialState() {
        let tableFormat = _.find(extraEvidence.tableCols(), (table) => table.subcategory == this.props.subcategory);

        return {
            tableFormat: tableFormat,
            rows: this.props.tableData,
            deleteBusy: false
        };
    },

    /**
     * Delete given evidence in this table row
     * 
     * @param {object} row   The evidence row
     */
    deleteEvidence(row) {
        this.setState({
            deleteBusy: true
        });
        this.props.deleteEvidenceFunc(row)
        .then(() => {
            this.setState({
                deleteBusy: false
            });
        });
    },

    /**
     * Check if current user can edit/delete the given evidence
     *
     * @param {object} row   The evidence row
     */
    canModify(row) {
        if (this.props.viewOnly === true) {
            return false;
        }
        return this.props.canCurrUserModifyEvidence(row);;
    },

    /**
     * Return the criteria codes that are mapped with given column
     * 
     * @param {string} colKey  The column key
     */
    getCriteriaCodes(colKey) {
        let criteriaCodes = extraEvidence.fieldToCriteriaCodeMapping.filter(o => o.key === colKey);
        return criteriaCodes;
    },

    /**
     * Return the number of criteria that has value in this evidence
     * 
     * @param {object} obj  The evidence source
     */
    getSubRowCount(obj) {
        let count = 0;
        if (obj['relevant_criteria']) {
            let relevantData = _.find(extraEvidence.sheetToTableMapping, o => o.subcategory === this.props.subcategory);
            let cols = relevantData.cols.map(o => o.key);
            cols.forEach(col => {
                if (obj[col] && obj[col] != '') {
                    count++;
                }
            });
        }
        return count;
    },

    /**
     * Return the formatted source title for given evidence
     * 
     * @param {object} metadata  The evidence source metadata
     */
    getSourceColumnContent(metadata) {
        let nodeContent = null;
        if (metadata['_kind_key'] === 'PMID') {
            let pmid = metadata.pmid;
            nodeContent = <a
                href = {external_url_map['PubMed'] + pmid}
                target = "_blank"
                title = {`PubMed Article ID: ${pmid}`}
            >
                PMID {pmid}
            </a>
        } else {
            let content = null;
            let help = null;
            switch (metadata['_kind_key']) {
                case 'clinical_lab':
                    content = metadata.lab_name;
                    help = `Clinvar/GTR LabID: ${metadata.clinvar_gtr_labid}, Contact: ${metadata.contact}`;
                    break;
                case 'clinic':
                    content = metadata.healthcare_provider;
                    help = `Institutional Affiliation: ${metadata.institutional_affiliation}, Department: ${metadata.department_affiliation}, ORCID ID: ${metadata.orcid_id}`;
                    break;
                case 'research_lab':
                    content = metadata.pi_lab_director;
                    help = `Institution: ${metadata.institution}, ORCID ID: ${metadata.orcid_id}`;
                    break;
                case 'public_database':
                    content = metadata.name;
                    help = metadata.url;
                    break;
                default:
                    content = Object.keys(metadata)
                        .filter(k => !k.startsWith('_'))
                        .map(k => metadata[k])
                        .join(', ');
                    help = metadata['_kind_title'];
                    break;
            }

            nodeContent = <span>
                {content} <ContextualHelp content={help}></ContextualHelp>
            </span>;
        }

        return nodeContent;
    },

    /**
     * Return the edit evidence button for this row
     * 
     * @param {object} row       Evidence in this row
     */
    getEditButton(row) {
        return (
            <EvidenceModalManager
                data = {row}
                allData = {this.props.allData}
                criteriaList = {row.source['relevant_criteria']}
                evidenceType = {row.source.metadata['_kind_key']}
                subcategory = {this.props.subcategory}
                evidenceCollectionDone = {this.props.evidenceCollectionDone}
                isNew = {false}
                disableActuator = {false}
                affiliation = {this.props.affiliation}
                session = {this.props.session}
                canCurrUserModifyEvidence = {this.props.canCurrUserModifyEvidence}
            >
            </EvidenceModalManager>
        );
    },

    /**
     * Return the delete evidence button for this row
     * 
     * @param {object} row       Evidence in this row
     */
    getDeleteButton(row) {
        return (
            <DeleteModal
                row = {row}
                deleteEvidence = {this.deleteEvidence}
                >
            </DeleteModal>
        );
    },

    /**
     * Return the add/edit buttons for given row if current user can modify this evidencew.
     * If not, return empty column.
     * 
     * @param {string} key       Table Column unique key
     * @param {object} row       Evidence in this row
     * @param {array}  inner     The table row columns content
     * @param {number} rowspan   Number of rows to span in this button column
     */
    addButtons(id, row, inner, rowspan=1) {
        if (this.canModify(row)) {
            let editButton = this.getEditButton(row);
            let deleteButton = this.getDeleteButton(row);
            let buttons = <td key={`editDelete_${id}`} rowSpan={rowspan}>
                {editButton} {deleteButton}
            </td>
            inner.push(buttons);
        } else {
            let emptyColumn = <td></td>
            inner.push(emptyColumn);
        }
    },

    /**
     * Add the given criteria row data to table
     *
     * @param {string} criteria  The criteria name to be added
     * @param {object} colNames  The table columns 
     * @param {object} obj       The evidence source
     * @param {number} key       Table column unique key
     */
    addAnotherCriteriaRow(criteria, colNames, obj, key) {
        const emptyColumnNoTopBorder = <td style={{borderTop: 'none'}}></td>
        let inner = [];
        let outer = [];
        let criteriaName = '';

        colNames.forEach(col => {
            let node = null;
            let nodeContent = null;
            let criteriaCodes = this.getCriteriaCodes(col);
            if (col in obj) {
                nodeContent = obj[col];
            }
            if (criteriaCodes.length > 0) {
                // If this column is for given criteria, display its value
                if (col === criteria) {
                    node = <td key={`cell_${key++}`} style={{borderTop: 'none'}}>
                        {nodeContent}
                    </td>
                    criteriaName = col;
                }
                else {
                    // Other criteria, output blank column
                    inner.push(emptyColumnNoTopBorder);
                }
            } else if (col === 'comments') {
                // Display the comment for given criteria
                let commentCol = criteriaName + '_comment';
                nodeContent = null;
                if (commentCol in obj) {
                    nodeContent = obj[commentCol];
                }
                node = <td className='word-break-all' key={`cell_${key++}`} style={{borderTop: 'none'}}>
                    {nodeContent}
                </td>
            }
            // Add column
            if (node) {
                inner.push(node);
            }
        });
        outer = <tr key={`row_${key++}`}>{inner}</tr>

        return outer;
    },

    /**
     * Display the evidences in the table for this panel
     */
    additionalEvidenceRows() {
        let i = 0;  // Hack for unique key
        let rows = [];

        let colNames = this.state.tableFormat.cols.map(col => col.key);
        // Don't read the kind_title property so we can handle each case separately.
        colNames.splice(colNames.indexOf('_kind_title'), 1);
        let tableData = this.props.tableData.filter(item => item.status != 'deleted');

        tableData.forEach(row => {
            if (this.showRow(row)) {
                let obj = row.source.data;
                let metadata = row.source.metadata;
                obj['last_modified'] = row['last_modified'];
                obj['_kind_title'] = metadata['_kind_title']
                obj['relevant_criteria'] = this.props.criteriaList.join(', ');
                obj['last_modified'] = moment(obj['last_modified']).format('YYYY MMM DD, h:mm a');
                obj['_submitted_by'] = row.source['_submitted_by'];

                // Get number of criteria that has value which determines the number of rows for this evidence
                let subRows = this.getSubRowCount(obj);
                let inner = [];
                let otherCriteria = [];
                let criteriaName = '';
                const emptyColumn = <td></td>

                // Add source column for this evidence
                inner.push(<td key={`cell_${i++}`} rowSpan={subRows}>{this.getSourceColumnContent(metadata)}</td>);

                // Add first available criteria in this evidence to the first row
                colNames.forEach(col => {
                    let node = null;
                    let nodeContent = null;
                    if (col in obj) {
                        nodeContent = obj[col];
                    }
                    let criteriaCodes = this.getCriteriaCodes(col);
                    // If this is a criteria column, display the first criteria only
                    if (criteriaCodes.length > 0) {
                        if (nodeContent) {
                            // If this is the first criteria column that has value, display in first row
                            if (criteriaName === '') {
                                node = <td key={`cell_${i++}`}>
                                    {nodeContent}
                                </td>
                                // Set the criteria name which is used to get its comment later
                                criteriaName = col;
                            }
                            else {
                                // If first row criteria has been set, display empty column
                                // And add this criteria to the list that will be added later
                                node = emptyColumn;
                                otherCriteria.push(col);
                            }
                        }
                        else {
                            // If criteria has no value, display empty column
                            node = emptyColumn;
                        }
                    }
                    else if (col === 'comments') {
                        // Display the comment for current criteria in this column
                        let commentCol = criteriaName + '_comment';
                        nodeContent = null;
                        if (commentCol in obj) {
                            nodeContent = obj[commentCol];
                        }
                        node = <td className='word-break-all' key={`cell_${i++}`}>
                            {nodeContent}
                        </td>
                    } else {
                        // Display value for other columns
                        node = <td key={`cell_${i++}`} rowSpan={subRows}>
                            {nodeContent}
                        </td>
                    }
                    inner.push(node);
                });
                // Add the edit/delete buttons if user can modify this evidence
                this.addButtons(i++, row, inner, subRows);
                let outer = <tr key={`row_${i++}`}>{inner}</tr>
                rows.push(outer);

                // Add other criteria rows if more is available for this evidence row.
                otherCriteria.forEach(criteria => {
                    outer = this.addAnotherCriteriaRow(criteria, colNames, obj, i);
                    rows.push(outer);
                    // Hack for unique key
                    i = i + 10;
                });
            }
        });
        return rows;
    },

    /**
     * Set the evidence table headers
     */
    tableHeader() {
        let cols = this.state.tableFormat.cols.map(col => {
            let criteriaCodes = this.getCriteriaCodes(col.key);
            if (criteriaCodes.length > 0) {
                criteriaCodes = criteriaCodes[0].codes;
                return <th key={col.key}>{`${col.title} [${criteriaCodes.join(',')}]`}</th>
            }
            return <th key={col.key}>{col.title}</th>;
        });
        cols.push(<th key="editDelete"></th>)
        return cols;
    },

    /**
     * Check if there is evidence to be displayed for this panel.
     */
    hasTableData() {
        // relevant columns non empty -> return true
        // relevant columns empty -> return False
        let relevantData = _.find(extraEvidence.sheetToTableMapping, o => o.subcategory === this.props.subcategory);
        let cols = relevantData.cols.map(o => o.key);
        let foundData = false;
        this.props.tableData.forEach(row => {
            let obj = row.source.data;
            if (foundData) {
                return;
            }
            cols.forEach(col => {
                if (obj[col] && obj[col] != '') {
                    foundData = true;
                    return;
                }
            });
        });
        return foundData;
    },

    /**
     * Check if any of the columns in given row has value to be displayed
     * 
     * @param {object} row The evidecne row
     */
    showRow(row) {
        // relevant columns non empty -> return True
        // relevant columns empty -> return False
        let relevantData = _.find(extraEvidence.sheetToTableMapping, o => o.subcategory === this.props.subcategory);
        let cols = relevantData.cols.map(o => o.key);
        let show = false;
        cols.forEach(col => {
            if (row.source.data[col] && row.source.data[col] != '') {
                show = true;
                return;
            }
        });
        return show;
    },

    render() {
        if (this.props.tableData.length == 0 || !this.hasTableData()) {
            return <div style={{paddingBottom: '5px'}}><span>&nbsp;&nbsp;No evidence added.</span></div>
        }
        return (
            <table className="table">
            <thead>
                <tr>
                    {this.tableHeader()}
                </tr>
            </thead>
            <tbody>
                {this.additionalEvidenceRows()}
            </tbody>
        </table>
        )
    }
});

/**
 * Modal to confirm before deleting an evidence.
 */
let DeleteModal = createReactClass({
    propTypes: {
        row: PropTypes.object,          // Selected evidence row to be deleted
        deleteEvidence: PropTypes.func  // Function to call to delete the evidence row
    },

    getInitialState() {
        return {
            row: this.props.row,
        }
    },
    
    handleModalClose() {
        this.child.closeModal();
    },

    cancel() {
        this.handleModalClose();
        this.setState({
            row: this.props.row
        });
    },

    /**
     * Delete given evidence row
     */
    clickConfirm() {
        this.props.deleteEvidence(this.state.row);
        this.handleModalClose();
        this.setState({
            row: null
        });
    },
    
    render() {
        return (
            <ModalComponent
                    modalTitle="Confirm evidence deletion"
                    modalClass="modal-default"
                    modalWrapperClass="confirm-interpretation-delete-segregation-evidence pull-right"
                    bootstrapBtnClass="btn btn-danger "
                    actuatorClass="interpretation-delete-segregation-evidence-btn"
                    actuatorTitle={"Delete"}
                    onRef={ref => (this.child = ref)}
                >
                <div>
                    <div className="modal-body">
                        <p>
                            Are you sure you want to delete this evidence?
                        </p>
                    </div>
                    <div className='modal-footer'>
                        <Input type="button" inputClassName="btn-primary btn-inline-spacer" clickHandler={this.clickConfirm} title="Confirm" />
                        <Input type="button" inputClassName="btn-default btn-inline-spacer" clickHandler={this.cancel} title="Cancel" />
                    </div>
                </div>
            </ModalComponent>
        );
    }
});

module.exports = {
    EvidenceTable: EvidenceTable
}