import * as vscode from 'vscode';

import path = require('path');

const enum EHistoryEnabled {
    Never = 0,
    Always,
    Workspace // only when file is in the opened folder
}

export interface IHistorySettings {
    folder: vscode.Uri;
    daysLimit: number;
    maxDisplay: number;
    exclude: string[];
    enabled: boolean;
    historyPath: string;
    absolute: boolean;
}

/**
 * Settings for history.
 */
export class HistorySettings {

    private settings: IHistorySettings[];

    constructor() {
        this.settings = [];
    }

    public get(file: vscode.Uri) {

        // Find workspaceFolder corresponding to file
        // const folder = vscode.workspace.getWorkspaceFolder(file); // TODO multi-root
        let folder = vscode.workspace.rootPath ? vscode.Uri.file(vscode.workspace.rootPath) : undefined;
        if (folder) {
            // if file is not a child of workspace => undefined
            const relativeFile = vscode.workspace.asRelativePath(file.fsPath);
            if (relativeFile === file.fsPath.replace(/\\/g, '/'))
                folder = undefined;
        }

        let settings = this.settings.find((value, index, obj) => {
            if (folder && value.folder)
                return (value.folder.fsPath === folder.fsPath);
            else
                return (folder === value.folder);
        });
        if (!settings) {
            settings = this.read(folder);
            this.settings.push(settings);
        }
        return settings;
    }

    /*
    historyPath
       absolute
         saved in historyPath\.history\<absolute>
       not absolute
         saved in historyPath\.history\vscode.getworkspacefolder.basename\<relative>
         (no workspacefolder like absolute if always)
    no historyPath
       saved in vscode.getworkspacefolder\.history\<relative>
       (no workspacefolder => not saved)
    */
    private read(workspacefolder: vscode.Uri): IHistorySettings {

        let config = vscode.workspace.getConfiguration('local-history'),
            enabled = <EHistoryEnabled>config.get('enabled'),
            exclude =  <string[]>config.get('exclude'),
            historyPath,
            absolute,
            message = '';

        if (typeof enabled === 'boolean')
            message += 'local-history.enabled must be a number, ';
        if (typeof exclude === 'string')
            message += 'local-history.exclude must be an array, ';
        if (message)
            vscode.window.showWarningMessage(`Change setting: ${message.slice(0, -2)}`, {}, {title: 'Settings', isCloseAffordance: false, id: 0})
                .then((action) => {
                    if (action && action.id === 0)
                        vscode.commands.executeCommand('workbench.action.openGlobalSettings');
                });

        if (enabled !== EHistoryEnabled.Never) {
            historyPath = <string>config.get('path');
            if (historyPath) {
                // replace variables like %AppData%
                historyPath = historyPath.replace(/%([^%]+)%/g, (_, key) => process.env[key]);
                absolute = <boolean>config.get('absolute');
                if (absolute || (!workspacefolder && enabled === EHistoryEnabled.Always)) {
                    absolute = true;
                    historyPath = path.join (
                        historyPath,
                        '.history');
                } else if (workspacefolder) {
                    historyPath = path.join (
                        historyPath,
                        '.history',
                        path.basename(workspacefolder.fsPath)
                    );
                }
            } else if (workspacefolder) {
                // Save only files in workspace
                absolute = false;
                historyPath = path.join(
                    workspacefolder.fsPath,
                    '.history'
                );
            }
        }

        if (historyPath)
            historyPath = historyPath.replace(/\//g, path.sep);

        return {
            folder: workspacefolder,
            daysLimit: <number>config.get('daysLimit') || 30,
            maxDisplay: <number>config.get('maxDisplay') || 10,
            exclude: <string[]>config.get('exclude') || ['**/.history/**','**/.vscode/**','**/node_modules/**','**/typings/**','**/out/**'],
            enabled: historyPath != null && historyPath !== '',
            historyPath: historyPath,
            absolute: absolute
        };
    }

}
