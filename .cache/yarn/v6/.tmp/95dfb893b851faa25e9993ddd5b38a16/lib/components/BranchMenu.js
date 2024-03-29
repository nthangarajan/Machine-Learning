import { Dialog, showDialog, showErrorMessage } from '@jupyterlab/apputils';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ClearIcon from '@material-ui/icons/Clear';
import * as React from 'react';
import { FixedSizeList } from 'react-window';
import { classes } from 'typestyle';
import { hiddenButtonStyle } from '../style/ActionButtonStyle';
import { activeListItemClass, nameClass, filterClass, filterClearClass, filterInputClass, filterWrapperClass, listItemClass, listItemIconClass, newBranchButtonClass, wrapperClass } from '../style/BranchMenu';
import { branchIcon, mergeIcon, trashIcon } from '../style/icons';
import { CommandIDs, Level } from '../tokens';
import { ActionButton } from './ActionButton';
import { NewBranchDialog } from './NewBranchDialog';
const ITEM_HEIGHT = 24.8; // HTML element height for a single branch
const MIN_HEIGHT = 150; // Minimal HTML element height for the branches list
const MAX_HEIGHT = 400; // Maximal HTML element height for the branches list
/**
 * Callback invoked upon encountering an error when switching branches.
 *
 * @private
 * @param error - error
 * @param logger - the logger
 */
function onBranchError(error, logger, trans) {
    if (error.message.includes('following files would be overwritten')) {
        // Empty log message to hide the executing alert
        logger.log({
            message: '',
            level: Level.INFO
        });
        showDialog({
            title: trans.__('Unable to switch branch'),
            body: (React.createElement(React.Fragment, null,
                React.createElement("p", null, trans.__('Your changes to the following files would be overwritten by switching:')),
                React.createElement(List, null, error.message.split('\n').slice(1, -3).map(renderFileName)),
                React.createElement("span", null, trans.__('Please commit, stash, or discard your changes before you switch branches.')))),
            buttons: [Dialog.okButton({ label: trans.__('Dismiss') })]
        });
    }
    else {
        logger.log({
            level: Level.ERROR,
            message: trans.__('Failed to switch branch.'),
            error
        });
    }
}
/**
 * Renders a file name.
 *
 * @private
 * @param filename - file name
 * @returns React element
 */
function renderFileName(filename) {
    return React.createElement(ListItem, { key: filename }, filename);
}
/**
 * React component for rendering a branch menu.
 */
export class BranchMenu extends React.Component {
    /**
     * Returns a React component for rendering a branch menu.
     *
     * @param props - component properties
     * @returns React component
     */
    constructor(props) {
        super(props);
        this.CHANGES_ERR_MSG = this.props.trans.__('The current branch contains files with uncommitted changes. Please commit or discard these changes before switching to or creating another branch.');
        /**
         * Renders a menu item.
         *
         * @param props Row properties
         * @returns React element
         */
        this._renderItem = (props) => {
            const { data, index, style } = props;
            const branch = data[index];
            const isActive = branch.name === this.props.currentBranch;
            return (React.createElement(ListItem, { button: true, title: !isActive
                    ? this.props.trans.__('Switch to branch: %1', branch.name)
                    : '', className: classes(listItemClass, isActive ? activeListItemClass : null), onClick: this._onBranchClickFactory(branch.name), style: style },
                React.createElement(branchIcon.react, { className: listItemIconClass, tag: "span" }),
                React.createElement("span", { className: nameClass }, branch.name),
                !branch.is_remote_branch && !isActive && (React.createElement(React.Fragment, null,
                    React.createElement(ActionButton, { className: hiddenButtonStyle, icon: trashIcon, title: this.props.trans.__('Delete this branch locally'), onClick: (event) => {
                            event.stopPropagation();
                            this._onDeleteBranch(branch.name);
                        } }),
                    React.createElement(ActionButton, { className: hiddenButtonStyle, icon: mergeIcon, title: this.props.trans.__('Merge this branch into the current one'), onClick: (event) => {
                            event.stopPropagation();
                            this._onMergeBranch(branch.name);
                        } })))));
        };
        /**
         * Callback invoked upon a change to the menu filter.
         *
         * @param event - event object
         */
        this._onFilterChange = (event) => {
            this.setState({
                filter: event.target.value
            });
        };
        /**
         * Callback invoked to reset the menu filter.
         */
        this._resetFilter = () => {
            this.setState({
                filter: ''
            });
        };
        /**
         * Callback on delete branch name button
         *
         * @param branchName Branch name
         */
        this._onDeleteBranch = async (branchName) => {
            const acknowledgement = await showDialog({
                title: this.props.trans.__('Delete branch'),
                body: (React.createElement("p", null,
                    this.props.trans.__('Are you sure you want to permanently delete the branch '),
                    React.createElement("b", null, branchName),
                    "?",
                    React.createElement("br", null),
                    this.props.trans.__('This action cannot be undone.'))),
                buttons: [
                    Dialog.cancelButton({ label: this.props.trans.__('Cancel') }),
                    Dialog.warnButton({ label: this.props.trans.__('Delete') })
                ]
            });
            if (acknowledgement.button.accept) {
                try {
                    await this.props.model.deleteBranch(branchName);
                    await this.props.model.refreshBranch();
                }
                catch (error) {
                    console.error(`Failed to delete branch ${branchName}`, error);
                }
            }
        };
        /**
         * Callback on merge branch name button
         *
         * @param branchName Branch name
         */
        this._onMergeBranch = async (branch) => {
            await this.props.commands.execute(CommandIDs.gitMerge, { branch });
        };
        /**
         * Callback invoked upon clicking a button to create a new branch.
         *
         * @param event - event object
         */
        this._onNewBranchClick = () => {
            if (!this.props.branching) {
                showErrorMessage(this.props.trans.__('Creating a new branch is disabled'), this.CHANGES_ERR_MSG);
                return;
            }
            this.setState({
                branchDialog: true
            });
        };
        /**
         * Callback invoked upon closing a dialog to create a new branch.
         */
        this._onNewBranchDialogClose = () => {
            this.setState({
                branchDialog: false
            });
        };
        this.state = {
            filter: '',
            branchDialog: false
        };
    }
    /**
     * Renders the component.
     *
     * @returns React element
     */
    render() {
        return (React.createElement("div", { className: wrapperClass },
            this._renderFilter(),
            this._renderBranchList(),
            this._renderNewBranchDialog()));
    }
    /**
     * Renders a branch input filter.
     *
     * @returns React element
     */
    _renderFilter() {
        return (React.createElement("div", { className: filterWrapperClass },
            React.createElement("div", { className: filterClass },
                React.createElement("input", { className: filterInputClass, type: "text", onChange: this._onFilterChange, value: this.state.filter, placeholder: this.props.trans.__('Filter'), title: this.props.trans.__('Filter branch menu') }),
                this.state.filter ? (React.createElement("button", { className: filterClearClass },
                    React.createElement(ClearIcon, { titleAccess: this.props.trans.__('Clear the current filter'), fontSize: "small", onClick: this._resetFilter }))) : null),
            React.createElement("input", { className: newBranchButtonClass, type: "button", title: this.props.trans.__('Create a new branch'), value: this.props.trans.__('New Branch'), onClick: this._onNewBranchClick })));
    }
    /**
     * Renders a
     *
     * @returns React element
     */
    _renderBranchList() {
        // Perform a "simple" filter... (TODO: consider implementing fuzzy filtering)
        const filter = this.state.filter;
        const branches = this.props.branches.filter(branch => !filter || branch.name.includes(filter));
        return (React.createElement(FixedSizeList, { height: Math.min(Math.max(MIN_HEIGHT, branches.length * ITEM_HEIGHT), MAX_HEIGHT), itemCount: branches.length, itemData: branches, itemKey: (index, data) => data[index].name, itemSize: ITEM_HEIGHT, style: { overflowX: 'hidden', paddingTop: 0, paddingBottom: 0 }, width: 'auto' }, this._renderItem));
    }
    /**
     * Renders a dialog for creating a new branch.
     *
     * @returns React element
     */
    _renderNewBranchDialog() {
        return (React.createElement(NewBranchDialog, { currentBranch: this.props.currentBranch, branches: this.props.branches, logger: this.props.logger, open: this.state.branchDialog, model: this.props.model, onClose: this._onNewBranchDialogClose, trans: this.props.trans }));
    }
    /**
     * Returns a callback which is invoked upon clicking a branch name.
     *
     * @param branch - branch name
     * @returns callback
     */
    _onBranchClickFactory(branch) {
        const self = this;
        return onClick;
        /**
         * Callback invoked upon clicking a branch name.
         *
         * @private
         * @param event - event object
         * @returns promise which resolves upon attempting to switch branches
         */
        async function onClick() {
            if (!self.props.branching) {
                showErrorMessage(self.props.trans.__('Switching branches is disabled'), self.CHANGES_ERR_MSG);
                return;
            }
            const opts = {
                branchname: branch
            };
            self.props.logger.log({
                level: Level.RUNNING,
                message: self.props.trans.__('Switching branch…')
            });
            try {
                await self.props.model.checkout(opts);
            }
            catch (err) {
                return onBranchError(err, self.props.logger, self.props.trans);
            }
            self.props.logger.log({
                level: Level.SUCCESS,
                message: self.props.trans.__('Switched branch.')
            });
        }
    }
}
//# sourceMappingURL=BranchMenu.js.map