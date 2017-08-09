import * as vscode from 'vscode';

import fs = require('fs');
import path = require('path');
import {IHistorySettings, HistorySettings} from './history.settings';

const glob = require('glob');
const mkdirp = require('mkdirp');
const anymatch = require('anymatch');

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
    history?: string[];
}

/**
 * Controller for handling history.
 */
export default class HistoryController {

    private settings: HistorySettings;

    private pattern = '_'+('[0-9]'.repeat(14));
    private regExp = /_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;

    constructor() {
        this.settings = new HistorySettings();
    }

    public saveRevision(document: vscode.TextDocument): Promise<vscode.TextDocument> {
        return new Promise((resolve, reject) => {

            const settings = this.getSettings(document.uri);

            if (!this.allowSave(settings, document)) {
                return resolve();
            }

            let now = new Date(),
                nowInfo;

            now = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
            nowInfo = now.toISOString().substring(0, 19).replace(/[-:T]/g, '');

            const p = path.parse(document.fileName);
            let   revisionFile = `${p.name}_${nowInfo}${p.ext}`;  // toto_20151213215326.js

            if (!settings.absolute) {
                const relativeFile = this.getRelativePath(document.fileName).replace(/\//g, path.sep);
                revisionFile = path.join(
                        settings.historyPath,
                        path.dirname(relativeFile),
                        revisionFile);
            } else {
                revisionFile = path.join(
                        settings.historyPath,
                        this.normalizePath(path.dirname(document.fileName), false),
                        revisionFile);
            }

            if (this.mkDirRecursive(revisionFile) && this.copyFile(document.fileName, revisionFile)) {
                if (settings.daysLimit > 0)
                    this.purge(document, settings, revisionFile);
                return resolve(document);
            } else
                return reject('Error occured');
        });
    }

    public saveFirstRevision(document: vscode.TextDocument): Promise<vscode.TextDocument> {
        return new Promise((resolve, reject) => {

        if (this.settings.saveMode === EHistorySaveMode.None || !this.settings.enabled) {
            return resolve();
        }

        if (!(document && /*document.isDirty &&*/ document.fileName)) {
            return resolve();
        }

        // don't save without workspace (cause exclude is relative to workspace)
        if (vscode.workspace.rootPath == null)
            return resolve();

        // fix for 1.7.1 : use charater \ with findFiles to work with subfolder in windows #15424
        let relativeFile = this.getRelativePath(document.fileName).replace(/\//g, path.sep);

        // if it's an exclude file or folder don't do anything
        return vscode.workspace.findFiles(relativeFile, this.settings.exclude)
            .then(files => {
                // exclude file
                if (!files || !files.length) {
                    return resolve();
                }

                // files.length must be 1 and
                // files[0].fsPath === document.fileName

                let me = this,
                    now, revisionFile,
                    p: path.ParsedPath;

                now = new Date();
                p = path.parse(document.fileName);
                revisionFile =  p.name + '_00000000000000' + p.ext;

                revisionFile = path.join(
                        me.settings.historyPath,
                        path.dirname(relativeFile),
                        revisionFile);

                fs.stat(revisionFile, (err, stats) => {
                    if (stats && stats.isFile()) {//file exists
                        return resolve(document);
                    }
                    else {
                        if (me.mkDirRecursive(revisionFile) &&
                            me.copyFile(document.fileName, revisionFile)) {
                            return resolve(document);
                        }else return reject('Error occured');
                    }
                });
                return resolve(document);
            });
        });
    }
    public showAll(editor: vscode.TextEditor) {
        this.internalShowAll(this.actionOpen, editor, this.getSettings(editor.document.uri));
    }
    public showCurrent(editor: vscode.TextEditor) {
        let document = (editor && editor.document);

        if (document)
            return this.internalOpen(this.findCurrent(document.fileName, this.getSettings(editor.document.uri)), editor.viewColumn);
    }

    public compareToActive(editor: vscode.TextEditor) {
        this.internalShowAll(this.actionCompareToActive, editor, this.getSettings(editor.document.uri));
    }

    public compareToCurrent(editor: vscode.TextEditor) {
        this.internalShowAll(this.actionCompareToCurrent, editor, this.getSettings(editor.document.uri));
    }

    public compareToPrevious(editor: vscode.TextEditor) {
        this.internalShowAll(this.actionCompareToPrevious, editor, this.getSettings(editor.document.uri));
    }

    public compare(file1: vscode.Uri, file2: vscode.Uri, column?: string) {
        return this.internalCompare(file1, file2, column);
    }

    public findAllHistory(fileName: string, settings: IHistorySettings, noLimit?: boolean): Promise<IHistoryFileProperties> {
        return new Promise((resolve, reject) => {

            if (!settings.enabled)
                resolve();

            let fileProperties = this.decodeFile(fileName, settings, true);
            this.getHistoryFiles(fileProperties && fileProperties.file, settings, noLimit)
                .then(files => {
                    fileProperties.history = files;
                    resolve(fileProperties);
                })
                .catch(err => reject(err));
        });
    }

    public decodeFile(filePath: string, settings: IHistorySettings, history?: boolean): IHistoryFileProperties {
        return this.internalDecodeFile(filePath, settings, history);
    }

    public getSettings(file: vscode.Uri): IHistorySettings {
        return this.settings.get(file);
    }

    public deleteFile(fileName: string): Promise<void> {
        const me = this;
        return new Promise<void>((resolve, reject) => {
            me.internalDeleteHistory([fileName])
                .then(() => resolve())
                .catch((err) => reject());
        });
    }
    public deleteHistory(fileName: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const settings = this.getSettings(vscode.Uri.file(fileName));
            const fileProperties = this.decodeFile(fileName, settings, true);
            this.getHistoryFiles(fileProperties && fileProperties.file, settings, true)
                .then((files) => this.internalDeleteHistory(files))
                .then(() => resolve())
                .catch((err) => reject());
        });
    }

    /* private */
    private allowSave(settings: IHistorySettings, document: vscode.TextDocument): boolean {
        if (!settings.enabled) {
            return false;
        }

        if (!(document && /*document.isDirty &&*/ document.fileName)) {
            return false;
        }

        // Use '/' with glob
        const docFile = document.fileName.replace(/\\/g, '/');
        if (settings.exclude && settings.exclude.length > 0 && anymatch(settings.exclude, docFile))
            return false;

        return true;
    }

    private getHistoryFiles(patternFilePath: string, settings: IHistorySettings, noLimit?: boolean):  Promise<string[]> {

        return new Promise((resolve, reject) => {

            if (!patternFilePath)
                reject('no pattern path');

            // glob must use character /
            const historyPath = settings.historyPath.replace(/\\/g, '/');
            glob(patternFilePath, {cwd: historyPath}, (err, files: string[]) => {
                if (!err) {
                    if (files && files.length) {
                        // files are sorted in ascending order
                        // limitation
                        if (settings.maxDisplay && !noLimit)
                            files = files.slice(settings.maxDisplay * -1);
                        // files are absolute
                    }
                    resolve(files);
                } else
                    reject(err);
            });
        });
    }

    private internalShowAll(action, editor: vscode.TextEditor, settings: IHistorySettings) {

        if (!settings.enabled)
            return;

        let me = this,
            document = (editor && editor.document);

        if (!document)
            return;

        me.findAllHistory(document.fileName, settings)
            .then(fileProperties => {
                const files = fileProperties.history;

                if (!files || !files.length) {
                    return;
                }

                let displayFiles = [];
                let file, relative, properties;

                // desc order history
                for (let index = files.length - 1; index >= 0; index--) {
                    file = files[index];
                    relative = path.relative(settings.historyPath, file);
                    properties = me.decodeFile(file, settings);
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

    private actionCompareToCurrent(values: IHistoryActionValues, editor: vscode.TextEditor, settings: IHistorySettings) {
        return this.internalCompare(vscode.Uri.file(values.selected), this.findCurrent(values.active, settings));
    }

    private actionCompareToPrevious(values: IHistoryActionValues, editor: vscode.TextEditor) {
        if (values.previous)
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

    private internalDecodeFile(filePath: string, settings: IHistorySettings, history?: boolean): IHistoryFileProperties {
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
                    root = settings.historyPath;
                    if (!settings.absolute)
                        p.dir = path.relative(settings.folder.fsPath, p.dir);
                    else
                        p.dir = this.normalizePath(p.dir, false);
                } else { // if (history === false)
                    p.dir = path.relative(settings.historyPath, p.dir);
                    if (!settings.absolute) {
                        root = settings.folder.fsPath;
                    } else {
                        root = '';
                        p.dir = this.normalizePath(p.dir, true);
                    }
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

    private findCurrent(activeFilename: string, settings: IHistorySettings): vscode.Uri {
        if (!settings.enabled)
          return vscode.Uri.file(activeFilename);

        let fileProperties = this.decodeFile(activeFilename, settings, false);
        if (fileProperties !== null)
            return vscode.Uri.file(fileProperties.file);
        else
            return vscode.Uri.file(activeFilename);
    }

    private internalDeleteFile(fileName: string): Promise<any> {
        return new Promise((resolve, reject) => {
            fs.unlink(fileName, err => {
                if (err)
                    // Not reject to avoid Promise.All to stop
                    return resolve({fileName: fileName, err: err});
                return resolve(fileName);
            });
        });
    }

    private internalDeleteHistory(fileNames: string[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            Promise.all(fileNames.map(file => this.internalDeleteFile(file)))
                .then(results => {
                    // Afficher la 1ère erreur

                    results.some((item: any) => {
                        if (item.err) {
                            vscode.window.showErrorMessage(`Error when delete files history: '${item.err}' file '${item.fileName}`);
                            return true;
                        }
                    });
                    resolve();
                })
                .catch(() => reject());
        });
    }

    private purge(document: vscode.TextDocument, settings: IHistorySettings, historyFile?: string) {
        let me = this,
            dir, name, ext,
            pattern;

        if (historyFile) {
            dir = path.dirname(historyFile);
            ext = path.extname(document.fileName);
            name = path.basename(document.fileName, ext);
            pattern = me.joinPath('', dir, name, ext, true);
        } else {
            let fileProperties = this.decodeFile(document.fileName, settings, true);
            pattern = fileProperties && fileProperties.file;
        }

        me.getHistoryFiles(pattern, settings, true)
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
                        endTime = stat.birthtime.getTime() + settings.daysLimit * 24*60*60*1000;
                        if (now > endTime) {
                            fs.unlinkSync(file);
                        }
                    }
                }
            });
    }

    private getRelativePath(fileName: string) {
        // TODO: multi-root
        // let relative = vscode.workspace.asRelativePath(fileName, false);
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

    private normalizePath(dir: string, withDrive: boolean) {
        if (process.platform === 'win32') {
            if (!withDrive)
                return dir.replace(':', '');
            else
                return dir.replace('\\', ':\\');
        } else
            return dir;
    }
}

