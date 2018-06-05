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
    saveDelay: number;
    maxDisplay: number;
    dateLocale: string;
    exclude: string[];
    enabled: boolean;
    historyPath: string;
    absolute: boolean;
    filename: string;
    filenamePattern: RegExp[];
    maxVersionCount: number;
    saveOneStepAhead: boolean;
}

export function EscapeRegExp(text: string): string {
    return text.replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, '\\$&');
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
        let folder;
        // const wsFolder = vscode.workspace.getWorkspaceFolder(file);
        // temporary code to resolve bug https://github.com/Microsoft/vscode/issues/36221
        const wsFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file.fsPath));
        if (wsFolder)
            folder = wsFolder.uri;

        /*
        let folder = vscode.workspace.rootPath ? vscode.Uri.file(vscode.workspace.rootPath) : undefined;
        if (folder) {
            // if file is not a child of workspace => undefined
            const relativeFile = vscode.workspace.asRelativePath(file.fsPath);
            if (relativeFile === file.fsPath.replace(/\\/g, '/'))
                folder = undefined;
        }
        */

        let settings = this.settings.find((value, index, obj) => {
            if (folder && value.folder)
                return (value.folder.fsPath === folder.fsPath);
            else
                return (folder === value.folder);
        });
        if (!settings) {
            settings = this.read(folder, file);
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
    private read(workspacefolder: vscode.Uri, file: vscode.Uri): IHistorySettings {

        // for now no ressource configurations
        // let config = vscode.workspace.getConfiguration('local-history', file),
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

                // start with
                // ${workspaceFolder} => current workspace
                // ${workspaceFolder: name} => workspace find by name
                // ${workspaceFolder: index} => workspace find by index
                const match = historyPath.match(/\${workspaceFolder(?:\s*:\s*(.*))?}/i);
                let historyWS: vscode.Uri;
                if (match) {
                    if (match.index > 1) {
                        vscode.window.showErrorMessage(`\${workspaceFolder} must starts settings local-history.path ${historyPath}`);
                        return;
                    }
                    const wsId = match[1];
                    if (wsId) {
                        const find = vscode.workspace.workspaceFolders.find(
                            (ws) => Number.isInteger(wsId - 1) ? ws.index === Number.parseInt(wsId, 10) : ws.name === wsId);
                        if (!find) {
                            vscode.window.showErrorMessage(`workspaceFolder not found ${historyPath}`);
                            return;
                        }
                        historyWS = find.uri;
                    } else
                        historyWS = workspacefolder;
                    historyPath = historyPath.replace(match[0], historyWS.fsPath);
                }

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
                        (historyWS && this.pathIsInside(workspacefolder.fsPath, historyWS.fsPath) ? '' : path.basename(workspacefolder.fsPath))
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

        const saveOneStepAhead = <boolean>config.get('saveOneStepAhead');
        let filename = (<string>config.get('filename') || '').replace(/[<>*?":|]/g, '').replace('\\', '/'); // windows characters not allowed in file names, allow '\' | '/' for writing in sub folders;

        while (filename.indexOf('/') === 0) {
            filename = filename.slice(1);
        }

        if (filename.lastIndexOf('${workspaceFolder}') > 0 || filename.lastIndexOf('$p') > 0) {
            filename = '';
        }

        return {
            folder: workspacefolder,
            daysLimit: <number>config.get('daysLimit') || 30,
            saveDelay: <number>config.get('saveDelay') || 0,
            maxDisplay: <number>config.get('maxDisplay') || 10,
            dateLocale: <string>config.get('dateLocale') || undefined,
            exclude: <string[]>config.get('exclude') || ['**/.history/**','**/.vscode/**','**/node_modules/**','**/typings/**','**/out/**'],
            enabled: historyPath != null && historyPath !== '' || !!filename,
            historyPath: historyPath,
            absolute: absolute,
            filename: filename,
            filenamePattern: this.filenamePatternToRexExp(<string[]>config.get('filenamePattern')) || [new RegExp('.*')],
            maxVersionCount: <number>config.get('maxVersionCount') || -1,
            saveOneStepAhead: saveOneStepAhead == null ? true : saveOneStepAhead
        };
    }

    private filenamePatternToRexExp(filenamePattern: string[]): RegExp[] {
        const regexValue = {
            '\\*': '[^\\.]*',
            '\\*\\*': '.*'
        };

        return filenamePattern.map( y => {
            let pattern = EscapeRegExp(y).replace(/\\\*\\\*|\\\*/, match => regexValue[match]);
            if (pattern[0] === '!') {
                pattern = `((?!${pattern.slice(1)}).)`;
            }
            return new RegExp(`^${pattern}$`);
        });
    }

    private pathIsInside(test, parent) {
        return require('path-is-inside')(test, parent);
    }
}
