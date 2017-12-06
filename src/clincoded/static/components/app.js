'use strict';
import React from 'react';
import PropTypes from 'prop-types';
import createReactClass from 'create-react-class';
import url from 'url';
import { content_views } from './globals';
import { Auth0, HistoryAndTriggers } from './mixins';
import { NavbarMixin, Nav, Navbar, NavItem } from '../libs/bootstrap/navigation';
import jsonScriptEscape from '../libs/jsonScriptEscape';
import { RestMixin } from './rest';
import AffiliationModal from './affiliation/modal';
const AffiliationsList = require('./affiliation/affiliations.json');

var routes = {
    'curator': require('./curator').Curator
};


// Site information, including navigation
var portal = {
    portal_title: 'ClinGen',
    navUser: [
        {id: 'help', title: 'Help', url: '#'}, // dropdown Help menu button to both gene and variant help docs
        {id: 'variant', title: 'New Variant Curation', url: '/select-variant/'}, // link to VCI page /select-variant/
        {id: 'gene', title: 'New Gene Curation', url: '/create-gene-disease/'}, // link to GCI page /create-gene-disease/
        {id: 'space', title: 'space'}, // white space between
        {id: 'dashboard', title: 'Dashboard', icon: 'icon-home', url: '/dashboard/'},
        {id: 'demo', title: 'Demo Login'},
        {id: 'loginout', title: 'Login'}
        //{id: 'account', title: 'Account', url: '/account/'},
    ]
};


// Renders HTML common to all pages.
var App = module.exports = createReactClass({
    mixins: [Auth0, HistoryAndTriggers, RestMixin],

    triggers: {
        demo: 'triggerAutoLogin',
        login: 'triggerLogin',
        logout: 'triggerLogout'
    },

    // Note on context. state.context set from initial props. Navigating to other pages sets this state.
    // This state gets passed as a property to ContentView, so it should be referenced as props.context
    // from there.
    getInitialState: function() {
        var demoWarning = false;
        var productionWarning = false;
        if (/production.clinicalgenome.org/.test(url.parse(this.props.href).hostname)) {
            // check if production URL. Enable productionWarning if it is.
            productionWarning = true;
        } else if (!/^(www\.)?curation.clinicalgenome.org/.test(url.parse(this.props.href).hostname)) {
            // if neither production nor curation URL, enable demoWarning.
            demoWarning = true;
        }
        return {
            context: this.props.context, // Close to anti-pattern, but puts *initial* context into state
            slow: this.props.slow,
            href: this.props.href,
            errors: [],
            portal: portal,
            demoWarning: demoWarning,
            productionWarning: productionWarning,
            tempAffiliation: null, // Placeholder when user selects an option in the affiliation dropdown
            affiliation: {}, // Confirmed affiliation when user selects to continue in the modal
            affiliationModalButtonDisabled: true,
            isAffiliationModalOpen: false
        };
    },

    currentAction: function() {
        var href_url = url.parse(this.state.href);
        var hash = href_url.hash || '';
        var name;
        if (hash.slice(0, 2) === '#!') {
            name = hash.slice(2);
        }
        return name;
    },

    /**
     * Method to set states when the affiliation selection is changed
     * @param {event} e - Selection change event
     */
    handleOnChange(e) {
        this.setState({
            tempAffiliation: e.target.value !== 'Individual' ? JSON.parse(e.target.value) : {},
            affiliationModalButtonDisabled: false
        });
    },

    createCookie(name, value, days) {
        let expires = "";
        if (days) {
            let date = new Date();
            date.setTime(date.getTime() + (days*24*60*60*1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + value + expires + "; path=/";
    },

    toggleAffiliationModal() {
        this.setState({
            affiliation: this.state.tempAffiliation,
            isAffiliationModalOpen: !this.state.isAffiliationModalOpen
        }, () => {
            this.createCookie('affiliation', JSON.stringify(this.state.affiliation));
            this.setState({tempAffiliation: null});
        });
    },

    /**
     * Method to trim affiliation URIs and return an array of IDs
     * @param {array} affiliations - List of affiliation URIs
     */
    getAffiliationIds(affiliations) {
        let idArray = [];
        affiliations.forEach(item => {
            let id = item.substr(14, 5);
            idArray.push(id);
        });
        return idArray;
    },

    getUserAffiliations(affiliationIds, staticAffiliations) {
        let affiliationArray = [];
        affiliationIds.forEach(id=> {
            for (let affiliation of staticAffiliations) {
                if (affiliation.affiliation_id === id) {
                    affiliationArray.push(affiliation);
                }
            }
        });
        return affiliationArray;
    },

    renderAffiliationModal(affiliations) {
        let affiliationIds = this.getAffiliationIds(affiliations);
        let userAffiliations = this.getUserAffiliations(affiliationIds, AffiliationsList);
        return (
            <AffiliationModal show={this.state.isAffiliationModalOpen} onClose={this.toggleAffiliationModal}
                buttonDisabled={this.state.affiliationModalButtonDisabled}>
                <div className="affiliation-modal-body">
                    <h2>Continue as an individual or as a member of an affiliation.</h2>
                    <select className="form-control" defaultValue="none" onChange={this.handleOnChange}>
                        <option value="none" disabled="disabled">Select</option>
                        <option value="" disabled="disabled"></option>
                        <option value="Individual">Individual</option>
                        {userAffiliations.map((affiliation, i) => {
                            return <option key={i} value={JSON.stringify(affiliation)}>{affiliation.affiliation_abbreviation}</option>;
                        })}
                    </select>
                </div>
            </AffiliationModal>
        );
    },

    showAffiliationModal(affiliation) {
        this.setState({isAffiliationModalOpen: true}, () => {
            this.renderAffiliationModal(affiliation);
        });
    },

    render: function() {
        var content;
        var context = this.state.context;
        let session = this.state.session;
        let user_properties = session && session.user_properties;
        var href_url = url.parse(this.state.href);
        // Switching between collections may leave component in place
        var key = context && context['@id'];
        var current_action = this.currentAction();
        if (!current_action && context.default_page) {
            context = context.default_page;
        }
        if (context) {
            var ContentView = content_views.lookup(context, current_action);
            content = <ContentView {...this.props} context={context} href={this.state.href}
                loadingComplete={this.state.loadingComplete} session={session}
                portal={this.state.portal} navigate={this.navigate} href_url={href_url}
                demoVersion={this.state.demoWarning} affiliation={this.state.affiliation} />;
        }
        var errors = this.state.errors.map(function (error) {
            return <div className="alert alert-error"></div>;
        });

        var appClass = 'done';
        if (this.state.slow) {
            appClass = 'communicating';
        }

        var title = context.title || context.name || context.accession || context['@id'];
        if (title && title != 'Home') {
            title = title + ' – ' + portal.portal_title;
        } else {
            title = portal.portal_title;
        }

        var canonical = this.props.href;
        if (context.canonical_uri) {
            if (href_url.host) {
                canonical = (href_url.protocol || '') + '//' + href_url.host + context.canonical_uri;
            } else {
                canonical = context.canonical_uri;
            }
        }

        let affiliation_cookie = this.state.affiliation_cookie;

        return (
            <html lang="en">
                <head>
                    <meta charSet="utf-8" />
                    <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <title>ClinGen</title>
                    <link rel="canonical" href={canonical} />
                    <script async src='//www.google-analytics.com/analytics.js'></script>
                    <script src="https://cdn.auth0.com/js/lock/10.17.0/lock.min.js"></script>
                    <script data-prop-name="inline" dangerouslySetInnerHTML={{__html: this.props.inline}}></script>
                    <link rel="stylesheet" href="@@cssFile" />
                    <script src="@@bundleJsFile"></script>
                </head>
                <body onClick={this.handleClick} onSubmit={this.handleSubmit} className={this.state.demoWarning ? "demo-background" : ""}>
                    <script data-prop-name="context" type="application/ld+json" dangerouslySetInnerHTML={{
                        __html: '\n\n' + jsonScriptEscape(JSON.stringify(this.props.context)) + '\n\n'
                    }}></script>
                    <div>
                        <Header session={this.state.session} href={this.props.href} affiliation={this.state.affiliation} />
                        {this.state.demoWarning ?
                            <Notice noticeType='demo' noticeMessage={<span><strong>Note:</strong> This is a demo version of the site. Any data you enter will not be permanently saved.</span>} />
                            : null}
                        {this.state.productionWarning ?
                            <Notice noticeType='production' noticeMessage={<span><strong>Do not use this URL for entering data. Please use <a href="https://curation.clinicalgenome.org/">curation.clinicalgenome.org</a> instead.</strong></span>} />
                            : null}
                        {user_properties && user_properties.affiliation && this.state.affiliation && Object.keys(this.state.affiliation).length ?
                            <div className="affiliation-utility-container">
                                <div className="container affiliation-utility">
                                    <span className="curator-affiliation">Affiliation: <strong>{this.state.affiliation.affiliation_fullname}</strong></span>
                                    <span className="change-affiliation-button">
                                        <button type="button" className="btn btn-default btn-sm" onClick={this.showAffiliationModal.bind(null, user_properties.affiliation)}>Change Affiliation</button>
                                    </span>
                                </div>
                            </div>
                            : null}
                        {user_properties && user_properties.affiliation && user_properties.affiliation.length && !affiliation_cookie ?
                            this.renderAffiliationModal(user_properties.affiliation)
                            : null}
                        {content}
                    </div>
                </body>
            </html>
        );
    },

    statics: {
        // Get data to display from page <script> tag
        getRenderedProps: function (document) {
            var props = {};
            // Ensure the initial render is exactly the same
            props.href = document.querySelector('link[rel="canonical"]').href;
            var script_props = document.querySelectorAll('script[data-prop-name]');
            for (var i = 0; i < script_props.length; i++) {
                var elem = script_props[i];
                var value = elem.text;
                var elem_type = elem.getAttribute('type') || '';
                if (elem_type == 'application/json' || elem_type.slice(-5) == '+json') {
                    value = JSON.parse(value);
                }
                props[elem.getAttribute('data-prop-name')] = value;
            }
            return props;
        }
    }
});


// Render the common page header.
var Header = createReactClass({
    render: function() {
        return (
            <header className="site-header">
                <NavbarMain portal={portal} session={this.props.session} href={this.props.href} />
            </header>
        );
    }
});


// Render the notice bar, under header, if needed
// Usage: <Notice noticeType='[TYPE]' noticeMessage={<span>[MESSAGE]</span>} {noticeClosable} />
// Valid noticeTypes: success, info, warning, danger (bootstrap defaults), and demo, production (clingen customs)
var Notice = createReactClass({
    getInitialState: function () {
        return { noticeVisible: true };
    },
    onClick: function() {
        this.setState({ noticeVisible: false });
    },
    render: function() {
        var noticeClass = 'notice-bar alert alert-' + this.props.noticeType;
        if (this.state.noticeVisible) {
            return (
                <div className={noticeClass} role="alert">
                    <div className="container">
                        {this.props.noticeMessage}
                        {this.props.noticeClosable ?
                        <button type="button" className="close" onClick={this.onClick}>&times;</button>
                        : null}
                    </div>
                </div>
            );
        }
        else { return (null); }
    }
});


var NavbarMain = createReactClass({
    mixins: [NavbarMixin],

    propTypes: {
        portal: PropTypes.object.isRequired,
        href: PropTypes.string.isRequired
    },

    render: function() {
        var headerUrl = '/';
        if (this.props.session && this.props.session['auth.userid'] !== undefined) headerUrl = '/dashboard/';
        return (
            <div>
                <div className="container">
                    <NavbarUser portal={this.props.portal} session={this.props.session} href={this.props.href} />
                    <a href={headerUrl} className='navbar-brand'>ClinGen Dashboard</a>
                </div>
            </div>
        );
    }
});


var NavbarUser = createReactClass({
    render: function() {
        var session = this.props.session;
        var demoLoginEnabled = true;
        if (/curation.clinicalgenome.org/.test(url.parse(this.props.href).hostname) || /production.clinicalgenome.org/.test(url.parse(this.props.href).hostname)) {
            // check if production or curation URL. Disable demo login if true
            demoLoginEnabled = false;
        }

        return (
            <Nav navbarStyles='navbar-user' styles='navbar-right nav-user'>
                {this.props.portal.navUser.map(menu => {
                    if (menu.url || menu.title === 'space') {
                        if (menu.id === 'help') {
                            return <NavItem key={menu.id} href={menu.url} title={menu.title}>{menu.title}</NavItem>;
                        }
                        // Normal menu item; disabled if user is not logged in
                        if (session && session['auth.userid']) {
                            return <NavItem key={menu.id} href={menu.url} icon={menu.icon} title={menu.title} target={menu.target}>{menu.title}</NavItem>;
                        }
                    } else {
                        // Trigger menu item; set <a> data attribute to login or logout
                        var attrs = {};

                        // Item with trigger; e.g. login/logout
                        if (!(session && session['auth.userid'])) {
                            if (menu.id === 'loginout') {
                                // Logged out; render signin triggers
                                attrs['data-trigger'] = 'login';
                                return <NavItem {...attrs} key={menu.id}>{menu.title}</NavItem>;
                            } else if (menu.id === 'demo' && demoLoginEnabled) {
                                // Logged out; render signin triggers
                                attrs['data-trigger'] = 'demo';
                                return <NavItem {...attrs} key={menu.id}>{menu.title}</NavItem>;
                            }
                        } else {
                            if (menu.id === 'loginout') {
                                var fullname = (session.user_properties && session.user_properties.title) || 'unknown';
                                attrs['data-trigger'] = 'logout';
                                return <NavItem {...attrs} key={menu.id}>{'Logout ' + fullname}</NavItem>;
                            }
                        }
                    }
                })}
            </Nav>
        );
    }
});
