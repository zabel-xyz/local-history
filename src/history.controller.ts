'use strict';

import * as vscode from 'vscode';

import fs = require('fs');
import path = require('path');

const iconv = require('iconv-lite');
const glob = require('glob');
const mkdirp = require('mkdirp');

interface IHistorySettings {
    historyPath: string;
    daysLimit: number;
    maxDisplay: number;
    exclude: string;
    enabled: boolean;
}

interface IHistoryActionValues {
    active: string;
    selected: vscode.Uri;
    previous: vscode.Uri;
}

interface IHistoryFileProperties {
    isHistory: boolean;
    dir: string;
    name: string;
    ext: string;
    file: string;
    date?: Date;
}

/**
 * Controller for handling history.
 */
export default class HistoryController {
    // private mkdirp = require('mkdirp');
    private settings: IHistorySettings;

    constructor() {
        this.settings = this.readSettings();
    }

    public saveRevision(document: vscode.TextDocument) {
        if (!this.settings.historyPath || !this.settings.enabled) {
            return;
        }

        if (!(document && /*document.isDirty &&*/ document.fileName)) {
            return;
        }

        let dir = this.getRelativePath(document.fileName),
            file;
        if (dir !== '') {
            file = path.join(
                dir,
                path.basename(document.fileName)
            ).replace(/\\/g, '/');
        } else
            file = path.basename(document.fileName);

        // if it's an exclude file or folder don't do anything
        vscode.workspace.findFiles(file, this.settings.exclude)
            .then(files => {

                // exclude file
                if (!files || !files.length) {
                    return;
                }

                // files.length must be 1 and
                // files[0].fsPath === document.fileName

                let me = this,
                    now, revisionFile;

                now = new Date();
                revisionFile =  // toto_20151213215326.js
                        path.parse(document.fileName).name+'_'+
                        String(10000*now.getFullYear() + 100*(now.getMonth()+1) + now.getDate()) +
                        (now.getHours() < 10 ? '0' : '') +
                        String(10000*now.getHours() + 100*now.getMinutes() + now.getSeconds()) +
                        path.extname(document.fileName);


                revisionFile = path.join(
                        this.settings.historyPath,
                        '.history',
                        dir,
                        revisionFile);
                if (me.mkDirRecursive(revisionFile)) {
                    // const iconv = require('iconv-lite');

                    // Convert from js string to an encoded buffer.
                    const encoding = this.getEncoding();
                    const text = document.getText();
                    let buf = text;
                    if (!encoding.startsWith('utf8')) // utf8 or utf8bom
                        buf = iconv.encode(text, encoding);

                    fs.writeFile(revisionFile, buf,
                    // fs.writeFile(revisionFile, document.getText(), {encoding: this.getEncoding()},
                        (err) => {
                            if (err) {
                                vscode.window.showErrorMessage(
                                        'Can not save the revision of the file: '+document.fileName+
                                        ' Error: '+ err.toString());
                            } else {
                                if (me.settings.daysLimit > 0)
                                    me.purge(document);
                            }
                        }
                    );
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

    public findAllHistory(fileName: string): Thenable<string[]> {
        // No max, findFiles must retrive all files, and then the display is limited
        // Warning : the limitation is on a descending order

        fileName = this.buildRevisionPatternPath(fileName);
        // Dont's use workspace, history can be saved in another location
        // return vscode.workspace.findFiles(fileName, '');

        return new Promise((resolve, reject) => {
        //    const glob = require('glob');
            const historyPath = this.settings.historyPath.replace(/\\/g, '/');
            glob(fileName, {cwd: historyPath}, (err, files) => {
                if (!err)
                    resolve(files); // return path relative to cwd
                    // TODO: return fspath or absolute path
                    // TODO: limitation, order...
                else
                    reject(err);
            });
        });
    }

    public decodeFile(filePath: string): IHistoryFileProperties {
        return this.internalDecodeFile(filePath);
    }

    get maxDisplay() {
        return this.settings.maxDisplay;
    }

    /* private */
    private internalShowAll(action, editor: vscode.TextEditor) {

        if (!this.settings.historyPath)
            return;

        let me = this,
            document = (editor && editor.document),
            lengthToStripOff = this.settings.historyPath.length + 1;

        if (!document)
            return;

        me.findAllHistory(document.fileName)
            .then(files => {

                if (!files || !files.length) {
                    return;
                }

                let displayFiles = [],
                    last;

                // show only x elements according to maxDisplay
                if (me.settings.maxDisplay > 0 && me.settings.maxDisplay < files.length) {
                    last = files.length - me.settings.maxDisplay;
                } else
                    last = 0;
                // desc order history
                for (let index = files.length - 1, file; index >= last; index--) {
                    file = files[index];
                    displayFiles.push({
                        description: file.fsPath.substring(lengthToStripOff),
                        label: me.getFileName(file.fsPath),
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
        return this.internalOpen(values.selected, editor.viewColumn);
    }

    private actionCompareToActive(values: IHistoryActionValues, editor: vscode.TextEditor) {
        return this.internalCompare(values.selected, vscode.Uri.file(values.active));
    }

    private actionCompareToCurrent(values: IHistoryActionValues, editor: vscode.TextEditor) {
        return this.internalCompare(values.selected, this.findCurrent(values.active));
    }

    private actionCompareToPrevious(values: IHistoryActionValues, editor: vscode.TextEditor) {
        return this.internalCompare(values.selected, values.previous);
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
        // cf. https://github.com/DonJayamanne/gitHistoryVSCode
        // The way the command "workbench.files.action.compareFileWith" works is:
        // It first selects the currently active editor for comparison
        // Then launches the open file dropdown
        // & as soon as a file/text document is opened, that is used as the text document for comparison
        // So, all we need to do is invoke the comparison command
        // Then open our file
        //
        // Alternative use vscode.diff (same column as active)
        //
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

                // this.internalOpen(file1, column)
                //     .then(() => {
                //         vscode.commands.executeCommand('workbench.files.action.compareFileWith');
                //         this.internalOpen(file2, column)
                //             .then(() => {}, this.errorHandler);
                //     }, this.errorHandler);
        }
    }

    private internalDecodeFile(filePath: string, history?: boolean): IHistoryFileProperties {
        let name, dir, ext, date, file,
            isHistory = false;

        dir = this.getRelativePath(filePath);
        name = path.parse(filePath).name;
        ext = path.extname(filePath);

        if (dir !== '' && dir.startsWith('.history')) {
            dir = dir.substr(8);
            isHistory = true;
            let index = name.match(/_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
            if (index) {
                date = new Date(index[1],index[2]-1,index[3],index[4],index[5],index[6]);
                name = name.substring(0, index.index);
            } else
                return null; // file in history with bad pattern !
        }

        if (history)
            file = this.joinPath('.history', dir, name, ext, '_'+('[0-9]'.repeat(14)) );
        else
            file = this.joinPath(this.settings.historyPath, dir, name, ext);

        return {
            isHistory: isHistory,
            dir: dir,
            name: name,
            ext: ext,
            file: file,
            date: date
        };
    }

    private joinPath(root: string, dir: string, name: string, ext: string, pattern?: string): string {
        return path.join(root, dir, name + pattern + ext).replace(/\\/g, '/');
    }

    private buildRevisionPatternPath(fileName: string): string {
        let fileProperties = this.internalDecodeFile(fileName, true);
        if (fileProperties !== null)
            return fileProperties.file;
        else
            return;
    }

    private findCurrent(activeFilename: string): vscode.Uri {
        if (!this.settings.historyPath)
          return vscode.Uri.file(activeFilename);

        let fileProperties = this.internalDecodeFile(activeFilename);
        if (fileProperties !== null)
            return vscode.Uri.file(fileProperties.file);
        else
            return vscode.Uri.file(activeFilename);
    }

    private purge(document: vscode.TextDocument) {
        let me = this;

        // TODO : better search ?
        me.findAllHistory(document.fileName)
            .then(files => {

                if (!files || !files.length) {
                    return;
                }

                let stat: fs.Stats,
                    now: Number = new Date().getTime(),
                    endTime: Number;

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
        let dir = path.dirname(fileName),
            relative = vscode.workspace.asRelativePath(dir);

        if (dir !== relative) {
            if (relative !== '' && (relative.startsWith('\\') || relative.startsWith('/')))
                relative = relative.substr(1);
            return relative;
        } else
          return '';
    }

    private mkDirRecursive(fileName: string): boolean {

        try {
            let filePath = path.dirname(fileName);
            if (!fs.existsSync(filePath))
                mkdirp.sync(path.dirname(filePath));
            return true;
        }
        catch (err) {
            vscode.window.showErrorMessage(
                'Error with mkdirp: '+err.toString()+' file '+fileName);
            return false;
        }
    }

    private getFileName(file: string): string {
         let forwardSlash = file.lastIndexOf('/'),
             backSlash = file.lastIndexOf('\\');

         if (forwardSlash === -1 && backSlash === -1) {
             return file;
         }
         return file.substring((forwardSlash > backSlash) ? forwardSlash + 1 : backSlash + 1);
     }

    private readSettings(): IHistorySettings {
        let config = vscode.workspace.getConfiguration('local-history');

        return {
            historyPath: <string>config.get('path') || vscode.workspace.rootPath,
            daysLimit: <number>config.get('daysLimit') || 30,
            maxDisplay: <number>config.get('maxDisplay') || 10,
            exclude: <string>config.get('exclude') || '{.history,.vscode,**/node_modules,typings,out}',
            enabled: <boolean>config.get('enabled')
        };
    }

    private getEncoding(): string {
        // Use settings, because in api get/set encoding doesn't exist yet (see #824)
        let config = vscode.workspace.getConfiguration('files');
        if (config)
            return <string>config.get('encoding');
    }
}
