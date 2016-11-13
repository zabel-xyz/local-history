'use strict';

import * as vscode from 'vscode';

import fs = require('fs');
import path = require('path');

const glob = require('glob');
const mkdirp = require('mkdirp');

const enum EHistorySaveMode {
    None = 1,
    Internal,
    External,
}

interface IHistorySettings {
    historyPath: string;
    saveMode: EHistorySaveMode;
    daysLimit: number;
    maxDisplay: number;
    exclude: string;
    enabled: boolean;
}

interface IHistoryActionValues {
    active: string;
    selected: string;
    previous: string;
}

interface IHistoryFileProperties {
    dir: string;
    name: string;
    ext: string;
    file?: string;
    date?: Date;
}

/**
 * Controller for handling history.
 */
export default class HistoryController {

    private settings: IHistorySettings;

    private pattern = '_'+('[0-9]'.repeat(14));
    private regExp = /_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;

    constructor() {
        this.settings = this.readSettings();
    }

    public saveRevision(document: vscode.TextDocument) {
        if (this.settings.saveMode === EHistorySaveMode.None || !this.settings.enabled) {
            return;
        }

        if (!(document && /*document.isDirty &&*/ document.fileName)) {
            return;
        }

        // don't save without workspace (cause exclude is relative to workspace)
        if (vscode.workspace.rootPath === null)
            return;

        // fix for 1.7.1 : use charater \ with findFiles to work with subfolder in windows
        let relativeFile = this.getRelativePath(document.fileName).replace(/\//g, path.sep);

        // if it's an exclude file or folder don't do anything
        vscode.workspace.findFiles(relativeFile, this.settings.exclude)
            .then(files => {
                // exclude file
                if (!files || !files.length) {
                    return;
                }

                // files.length must be 1 and
                // files[0].fsPath === document.fileName

                let me = this,
                    now, revisionFile,
                    p: path.ParsedPath;

                now = new Date();
                p = path.parse(document.fileName);
                revisionFile =  // toto_20151213215326.js
                        p.name+'_'+
                        String(10000*now.getFullYear() + 100*(now.getMonth()+1) + now.getDate()) +
                        (now.getHours() < 10 ? '0' : '') +
                        String(10000*now.getHours() + 100*now.getMinutes() + now.getSeconds()) +
                        p.ext ;

                revisionFile = path.join(
                        me.settings.historyPath,
                        path.dirname(relativeFile),
                        revisionFile);

                if (me.mkDirRecursive(revisionFile) &&
                    me.copyFile(document.fileName, revisionFile)) {

                    if (me.settings.daysLimit > 0)
                        me.purge(document, revisionFile);
                };
            });
    }

    public showAll(editor: vscode.TextEditor) {
        this.internalShowAll(this.actionOpen, editor);
    }
    public showCurrent(editor: vscode.TextEditor) {
        let document = (editor && editor.document);

        if (document)
            return this.internalOpen(this.findCurrent(document.fileName), editor.viewColumn);
    }

    public compareToActive(editor: vscode.TextEditor) {
        this.internalShowAll(this.actionCompareToActive, editor);
    }

    public compareToCurrent(editor: vscode.TextEditor) {
        this.internalShowAll(this.actionCompareToCurrent, editor);
    }

    public compareToPrevious(editor: vscode.TextEditor) {
        this.internalShowAll(this.actionCompareToPrevious, editor);
    }

    public compare(file1: vscode.Uri, file2: vscode.Uri, column?: string) {
        return this.internalCompare(file1, file2, column);
    }

    public findAllHistory(fileName: string, noLimit?: boolean): Thenable<string[]> {
        let fileProperties = this.decodeFile(fileName, true);
        return this.getHistoryFiles(fileProperties && fileProperties.file, noLimit);
    }

    public decodeFile(filePath: string, history?: boolean): IHistoryFileProperties {
        return this.internalDecodeFile(filePath, history);
    }

    /* private */
    private getHistoryFiles(patternFilePath: string, noLimit?: boolean): Thenable<string[]> {

        return new Promise((resolve, reject) => {
            if (!patternFilePath)
                reject('no pattern path');

            // glob must use character /
            const historyPath = this.settings.historyPath.replace(/\\/g, '/');
            glob(patternFilePath, {cwd: historyPath}, (err, files: string[]) => {
                if (!err) {
                    if (files && files.length) {
                        // files are sorted in ascending order
                        // limitation
                        if (this.settings.maxDisplay && !noLimit)
                            files = files.slice(this.settings.maxDisplay * -1);
                        // files are absolute
                    }
                    resolve(files);
                } else
                    reject(err);
            });
        });
    }

    private internalShowAll(action, editor: vscode.TextEditor) {

        if (this.settings.saveMode === EHistorySaveMode.None)
            return;

        let me = this,
            document = (editor && editor.document);

        if (!document)
            return;

        me.findAllHistory(document.fileName)
            .then(files => {

                if (!files || !files.length) {
                    return;
                }

                let displayFiles = [];
                let file, relative, properties;

                // desc order history
                for (let index = files.length - 1; index >= 0; index--) {
                    file = files[index];
                    relative = path.relative(me.settings.historyPath, file);
                    properties = me.decodeFile(file);
                    displayFiles.push({
                        description: relative,
                        label: properties.date.toLocaleString(),
                        filePath: file,
                        previous: files[index - 1]
                    });
                }

                vscode.window.showQuickPick(displayFiles)
                    .then(val=> {
                        if (val) {
                            let actionValues: IHistoryActionValues = {
                                active: document.fileName,
                                selected: val.filePath,
                                previous: val.previous
                            };
                            action.apply(me, [actionValues, editor]);
                        }
                    });
            });
    }

    private actionOpen(values: IHistoryActionValues, editor: vscode.TextEditor) {
        return this.internalOpen(vscode.Uri.file(values.selected), editor.viewColumn);
    }

    private actionCompareToActive(values: IHistoryActionValues, editor: vscode.TextEditor) {
        return this.internalCompare(vscode.Uri.file(values.selected), vscode.Uri.file(values.active));
    }

    private actionCompareToCurrent(values: IHistoryActionValues, editor: vscode.TextEditor) {
        return this.internalCompare(vscode.Uri.file(values.selected), this.findCurrent(values.active));
    }

    private actionCompareToPrevious(values: IHistoryActionValues, editor: vscode.TextEditor) {
        return this.internalCompare(vscode.Uri.file(values.selected), vscode.Uri.file(values.previous));
    }

    private internalOpen(filePath: vscode.Uri, column: number) {
        if (filePath)
            return new Promise((resolve, reject) => {
                vscode.workspace.openTextDocument(filePath)
                    .then(d=> {
                        vscode.window.showTextDocument(d, column)
                            .then(()=>resolve(), (err)=>reject(err));
                    }, (err)=>reject(err));
            });
    }

    private internalCompare(file1: vscode.Uri, file2: vscode.Uri, column?: string) {
        if (file1 && file2) {
            if (column) {
                // Set focus on the column
                switch (Number.parseInt(column, 10)) {
                    case 1:
                        vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
                        break;
                    case 2:
                        vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
                        break;
                    default:
                        vscode.commands.executeCommand('workbench.action.focusThirdEditorGroup');
                }
            }
            // Diff on the active column
            let title = path.basename(file1.fsPath)+'<->'+path.basename(file2.fsPath);
            vscode.commands.executeCommand('vscode.diff', file1, file2, title);
        }
    }

    private internalDecodeFile(filePath: string, history?: boolean): IHistoryFileProperties {
        let me = this,
            file, p,
            date,
            isHistory = false;

        p = path.parse(filePath);

        if (filePath.includes('/.history/') || filePath.includes('\\.history\\') ) { //startsWith(this.settings.historyPath))
            isHistory = true;
            let index = p.name.match(me.regExp);
            if (index) {
                date = new Date(index[1],index[2]-1,index[3],index[4],index[5],index[6]);
                p.name = p.name.substring(0, index.index);
            } else
                return null; // file in history with bad pattern !
        }

        if (history != null) {
            let root = '';

            if (history !== isHistory) {
                if (history === true) {
                    root = me.settings.historyPath;
                    p.dir =  path.relative(vscode.workspace.rootPath, p.dir);
                } else { // if (history === false)
                    root = vscode.workspace.rootPath;
                    p.dir = path.relative(me.settings.historyPath, p.dir);
                }
            }
            file = me.joinPath(root, p.dir, p.name, p.ext, history);
        }
        else
            file = filePath;

        return {
            dir: p.dir,
            name: p.name,
            ext: p.ext,
            file: file,
            date: date
        };
    }

    private joinPath(root: string, dir: string, name: string, ext: string, history: boolean): string {
        let pattern = history === true ? this.pattern : '';
        return path.join(root, dir, name + pattern + ext);
    }

    private findCurrent(activeFilename: string): vscode.Uri {
        if (this.settings.saveMode === EHistorySaveMode.None)
          return vscode.Uri.file(activeFilename);

        let fileProperties = this.decodeFile(activeFilename, false);
        if (fileProperties !== null)
            return vscode.Uri.file(fileProperties.file);
        else
            return vscode.Uri.file(activeFilename);
    }

    private purge(document: vscode.TextDocument, historyFile?: string) {
        let me = this,
            dir, name, ext,
            pattern;

        if (historyFile) {
            dir = path.dirname(historyFile);
            ext = path.extname(document.fileName);
            name = path.basename(document.fileName, ext);
            pattern = me.joinPath('', dir, name, ext, true);
        } else {
            let fileProperties = this.decodeFile(document.fileName, true);
            pattern = fileProperties && fileProperties.file;
        }

        me.getHistoryFiles(pattern, true)
            .then(files => {

                if (!files || !files.length) {
                    return;
                }

                let stat: fs.Stats,
                    now: number = new Date().getTime(),
                    endTime: number;

                for (let file of files) {
                    stat = fs.statSync(file);
                    if (stat && stat.isFile()) {
                        endTime = stat.birthtime.getTime() + me.settings.daysLimit * 24*60*60*1000;
                        if (now > endTime) {
                            fs.unlinkSync(file);
                        }
                    }
                }
            });
    }

    private getRelativePath(fileName: string) {
        let relative = vscode.workspace.asRelativePath(fileName);

        if (fileName !== relative) {
            return relative;
        } else
            return path.basename(fileName);
    }

    private mkDirRecursive(fileName: string): boolean {
        try {
            mkdirp.sync(path.dirname(fileName));
            return true;
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error with mkdir: '${err.toString()}' file '${fileName}`);
            return false;
        }
    }

    private copyFile(source, target): boolean {
        try {
            fs.writeFileSync(target, fs.readFileSync(source));
            return true;
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error with copyFile: '${err.toString()} ${source} => ${target}`);
            return false;
        }
    }

    private readSettings(): IHistorySettings {
        let config = vscode.workspace.getConfiguration('local-history'),
            historyPath,
            saveMode = EHistorySaveMode.None;

        if (vscode.workspace.rootPath !== null) {
            historyPath = <string>config.get('path');
            if (historyPath) {
                historyPath = path.join (
                    historyPath,
                    '.history',
                    path.basename(vscode.workspace.rootPath));
                saveMode = EHistorySaveMode.External;
            } else {
                historyPath = path.join(
                    vscode.workspace.rootPath,
                    '.history'
                );
                saveMode = EHistorySaveMode.Internal;
            };
            // in windows replace / by \ (character returns by all node functions)
            if (historyPath)
                historyPath = historyPath.replace(/\//g, path.sep);
        }

        return {
            historyPath: historyPath,
            saveMode: saveMode,
            daysLimit: <number>config.get('daysLimit') || 30,
            maxDisplay: <number>config.get('maxDisplay') || 10,
            exclude: <string>config.get('exclude') || '{.history,.vscode,**/node_modules,typings,out}',
            enabled: <boolean>config.get('enabled')
        };
    }

}
