import * as vscode from 'vscode';

import fs = require('fs');
import path = require('path');
import Timeout from './timeout';

import glob = require('glob');
import rimraf = require('rimraf');
// import mkdirp = require('mkdirp');
import anymatch = require('anymatch');

// node 8.5 has natively fs.copyFile
// import copyFile = require('fs-copy-file');

import {IHistorySettings, HistorySettings} from './history.settings';

interface IHistoryActionValues {
    active: string;
    selected: string;
    previous: string;
}

export interface IHistoryFileProperties {
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
export class HistoryController {

    private settings: HistorySettings;
    private saveBatch;

    private pattern = '_'+('[0-9]'.repeat(14));
    private regExp = /_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;

    constructor() {
        this.settings = new HistorySettings();
        this.saveBatch = new Map();
    }

    public saveFirstRevision(document: vscode.TextDocument) {
        // Put a timeout of 1000 ms, cause vscode wait until a delay and then continue the saving.
        // Timeout avoid to save a wrong version, because it's to late and vscode has already saved the file.
        // (if an error occured 3 times this code will not be called anymore.)
        // cf. https://github.com/Microsoft/vscode/blob/master/src/vs/workbench/api/node/extHostDocumentSaveParticipant.ts
        return this.internalSave(document, true, new Timeout(1000));
    }

    public saveRevision(document: vscode.TextDocument): Promise<vscode.TextDocument> {
        return this.internalSave(document);
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

    public compare(file1: vscode.Uri, file2: vscode.Uri, column?: string, range?: vscode.Range) {
        return this.internalCompare(file1, file2, column, range);
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

    public findGlobalHistory(find: string, findFile: boolean, settings: IHistorySettings, noLimit?: boolean): Promise<string[]> {
        return new Promise((resolve, reject) => {

            if (!settings.enabled)
                resolve();

            if (findFile)
                this.findAllHistory(find, settings, noLimit)
                    .then(fileProperties => resolve(fileProperties && fileProperties.history));
            else
                this.getHistoryFiles(find, settings, noLimit)
                    .then(files => {
                        resolve(files);
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

    public clearSettings() {
        this.settings.clear();
    }

    public deleteFile(fileName: string): Promise<void> {
        return this.deleteFiles([fileName]);
    }

    public deleteFiles(fileNames: string[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.internalDeleteHistory(fileNames)
                .then(() => resolve())
                .catch((err) => reject());
        });
    }

    public deleteAll(fileHistoryPath: string) {
        return new Promise((resolve, reject) => {
            rimraf(fileHistoryPath, err => {
                if (err)
                    return reject(err);
                return resolve();
            });
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

    public restore(fileName: vscode.Uri) {
        const src = fileName.fsPath;
        const settings = this.getSettings(vscode.Uri.file(src));
        const fileProperties = this.decodeFile(src, settings, false);
        if (fileProperties && fileProperties.file) {
            return new Promise((resolve, reject) => {
                // Node v.8.5 has fs.copyFile
                // const fnCopy = fs.copyFile || copyFile;

                fs.copyFile(src, fileProperties.file, err => {
                    if (err)
                        return reject(err);
                    return resolve();
                });
            });
        }
    }

    /* private */
    private internalSave(document: vscode.TextDocument, isOriginal?: boolean, timeout?: Timeout): Promise<vscode.TextDocument> {

        const settings = this.getSettings(document.uri);

        if (!this.allowSave(settings, document)) {
            return Promise.resolve(undefined);
        }

        if (!isOriginal && settings.saveDelay) {
            if (!this.saveBatch.get(document.fileName)) {
                this.saveBatch.set(document.fileName, document);
                return this.timeoutPromise(this.internalSaveDocument, settings.saveDelay * 1000, [document, settings]);
            } else return Promise.reject(undefined); // waiting
        }

        return this.internalSaveDocument(document, settings, isOriginal, timeout);
    }

    private timeoutPromise(f, delay, args): Promise<any> {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                f.apply(this, args)
                    .then(value => resolve(value))
                    .catch(value => reject(value));
            }, delay);
        });
    }

    private internalSaveDocument(document: vscode.TextDocument, settings: IHistorySettings, isOriginal?: boolean, timeout?: Timeout): Promise<vscode.TextDocument> {

        return new Promise((resolve, reject) => {

            let revisionDir;
            if (!settings.absolute) {
                revisionDir = path.dirname(this.getRelativePath(document.fileName).replace(/\//g, path.sep));
            } else {
                revisionDir = this.normalizePath(path.dirname(document.fileName), false);
            }

            const p = path.parse(document.fileName);
            if(!!settings.includeWorkspaceFolders) {
              revisionDir += `/${this.getWorkspaceFolder(document)}`;
            }
            const revisionPattern = this.joinPath(settings.historyPath, revisionDir, p.name, p.ext);     // toto_[0-9]...

            if (isOriginal) {
                // if already some files exists, don't save an original version (cause: the really original version is lost) !
                // (Often the case...)
                const files = glob.sync(revisionPattern, {cwd: settings.historyPath.replace(/\\/g, '/')});
                if (files && files.length > 0)
                    return resolve();

                if (timeout && timeout.isTimedOut()) {
                    vscode.window.showErrorMessage(`Timeout when internalSave: ' ${document.fileName}`);
                    return reject('timedout');
                }
            }
            else if (settings.saveDelay)
                this.saveBatch.delete(document.fileName);

            let now = new Date(),
                nowInfo;
            if (isOriginal) {
                // find original date (if any)
                const state = fs.statSync(document.fileName);
                if (state)
                    now = state.mtime;
            }
            // remove 1 sec to original version, to avoid same name as currently version
            now = new Date(now.getTime() - (now.getTimezoneOffset() * 60000) - (isOriginal ? 1000 : 0));
            nowInfo = now.toISOString().substring(0, 19).replace(/[-:T]/g, '');

            const revisionFile = this.joinPath(settings.historyPath, revisionDir, p.name, p.ext, `_${nowInfo}`); // toto_20151213215326.js

            if (this.mkDirRecursive(revisionFile) && this.copyFile(document.fileName, revisionFile, timeout)) {
                if (settings.daysLimit > 0 && !isOriginal)
                    this.purge(document, settings, revisionPattern);
                return resolve(document);
            } else
                return reject('Error occured');
        });
    }

    private allowSave(settings: IHistorySettings, document: vscode.TextDocument): boolean {
        if (!settings.enabled) {
            return false;
        }

        if (!(document && /*document.isDirty &&*/ document.fileName)) {
            return false;
        }

        // Use '/' with glob
        const docFile = document.fileName.replace(/\\/g, '/');
        // @ts-ignore
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
            glob(patternFilePath, {cwd: historyPath, absolute: true}, (err, files: string[]) => {
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
                        label: properties.date.toLocaleString(settings.dateLocale),
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

    private internalCompare(file1: vscode.Uri, file2: vscode.Uri, column?: string, range?: vscode.Range) {
        if (file1 && file2) {
            const option: any = {};
            if (column)
                option.viewColumn = Number.parseInt(column, 10);
            option.selection = range;
            // Diff on the active column
            let title = path.basename(file1.fsPath)+'<->'+path.basename(file2.fsPath);
            vscode.commands.executeCommand('vscode.diff', file1, file2, title, option);
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
            file = me.joinPath(root, p.dir, p.name, p.ext, history ? undefined : '' );
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

    private joinPath(root: string, dir: string, name: string, ext: string, pattern: string = this.pattern): string {
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
                    // Display 1st error
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

    private purge(document: vscode.TextDocument, settings: IHistorySettings, pattern: string) {
        let me = this;

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
        let relative = vscode.workspace.asRelativePath(fileName, false);

        if (fileName !== relative) {
            return relative;
        } else
            return path.basename(fileName);
    }

    private getWorkspaceFolder(document) {
      return vscode.workspace.getWorkspaceFolder(
        document.uri
      ).name;
    }

    private mkDirRecursive(fileName: string): boolean {
        try {
            fs.mkdirSync(path.dirname(fileName), {recursive: true});
            // mkdirp.sync(path.dirname(fileName));
            return true;
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error with mkdir: '${err.toString()}' file '${fileName}`);
            return false;
        }
    }

    private copyFile(source: string, target: string, timeout?: Timeout): boolean {
        try {
            let buffer;
            buffer = fs.readFileSync(source);

            if (timeout && timeout.isTimedOut()) {
                vscode.window.showErrorMessage(`Timeout when copyFile: ' ${source} => ${target}`);
                return false;
            }
            fs.writeFileSync(target, buffer);
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

