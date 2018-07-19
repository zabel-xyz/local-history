import * as vscode from 'vscode';

import fs = require('fs');
import path = require('path');
import {IHistorySettings, HistorySettings, EscapeRegExp} from './history.settings';
import Timeout from './timeout';

const os = require('os');
import glob = require('glob');
import rimraf = require('rimraf');
import mkdirp = require('mkdirp');
import anymatch = require('anymatch');
const counterRegExp = new RegExp(/\$(\d*)c/);
const winattr = require("winattr/lib");

// node 8.5 has natively fs.copyFile
import copyFile = require('fs-copy-file');

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
                const fnCopy = fs.copyFile || copyFile;

                fnCopy(src, fileProperties.file, err => {
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

    private useFileName(file: string, settings: IHistorySettings): boolean {
        return !!settings.filename && settings.filenamePattern.some(pattern => pattern.test(file));
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
            // if already some files exists, don't save an original version (cause: the really original version is lost) !
            // (Often the case...)
            let files: string[];
            let revisionPattern;

            if (this.useFileName(p.base, settings)) {
                files = this.getFilesFromFilename(document, settings);
            } else {
                let cwdPath = settings.historyPath.replace(/\\/g, '/');
                let revisionPattern = this.joinPath(settings.historyPath, revisionDir, p.name, p.ext);     // toto_[0-9]...
                files = glob.sync(revisionPattern, {cwd: cwdPath});
            }

            if (!settings.saveOneStepAhead) {
                if (!isOriginal) {
                    return resolve();
                }

                if (timeout && timeout.isTimedOut()) {
                    vscode.window.showErrorMessage(`Timeout when internalSave: ' ${document.fileName}`);
                    return reject('timeout');
                }
            }
            else if (isOriginal) {
                if (files && files.length > 0)
                    return resolve();

                if (timeout && timeout.isTimedOut()) {
                    vscode.window.showErrorMessage(`Timeout when internalSave: ' ${document.fileName}`);
                    return reject('timeout');
                }
            }
            else if (settings.saveDelay)
                this.saveBatch.delete(document.fileName);

            this.maxVersions(document, settings, files);

            const revisionFile = this.getNewFileName(document, settings, files, revisionDir, isOriginal);
            if (this.mkDirRecursive(revisionFile) && this.copyFile(document.fileName, revisionFile, timeout)) {
                if (settings.daysLimit > 0 && !isOriginal && revisionPattern)
                    this.purge(document, settings, revisionPattern);
                return resolve(document);
            } else
                return reject('Error occurred');
        });
    }

    private maxVersions(document: vscode.TextDocument, settings: IHistorySettings, files: string[]): void {
        const p = path.parse(document.fileName);
        const filename = settings.filename;

        let maxVersionCount = settings.maxVersionCount - 1; // -1 space for new file
        if (maxVersionCount >= -1 && files && files.length >= maxVersionCount) {
            let oldFiles = maxVersionCount <= 0 ? files : files.slice(0, -maxVersionCount);
            if (this.useFileName(p.base, settings)) {
                const fileBase = filename.slice(0, filename.lastIndexOf('/') + 1).replace('/', '\\');
                let path: string;
                const dir = p.dir + '\\';
                const workspace = settings.folder ? (settings.folder.fsPath + '\\') : p.dir;
                if (fileBase) {
                    if (!fileBase.includes('$p') && !fileBase.includes('${workspaceFolder}')) {
                        path = dir + fileBase;
                    }
                    else {
                        path = fileBase.replace(/(\$p|\${workspaceFolder})\\?/g, match => {
                            return match === '${workspaceFolder}' ? workspace : dir;
                        });
                    }
                } else {
                    path = filename.includes('${workspaceFolder}') ? workspace : dir;
                }

                oldFiles = oldFiles.map(file => `${path}\\${file}`.replace('\\\\', '\\'));
            }
            this.deleteFiles(oldFiles);
        }
    }

    private getNewFileName(document: vscode.TextDocument, settings: IHistorySettings, files: string[], revisionDir: string, isOriginal?: boolean): string {
        const p = path.parse(document.fileName);
        let now = new Date();
        let fullPath: string;

        if (this.useFileName(p.base, settings)) {
            const FN = settings.filename;
            const fileName = FN.slice(FN.lastIndexOf('/') + 1);
            const fileBase = FN.slice(0, FN.lastIndexOf('/') + 1);

            const minCLength = parseInt(counterRegExp.exec(fileName)[1], 10) || 1;
            let $c = Array(minCLength + 1).join('0');

            if (counterRegExp.test(fileName)) {
                if (files && files.length) {
                    const fileMatcher = new RegExp(this.getRevisionPatternByFilename(document, settings));
                    const currentCount = parseInt(fileMatcher.exec(files[files.length - 1])[1], 10);

                    if (currentCount != null) {
                        const maxCountStr = (currentCount + 1).toString();
                        $c = maxCountStr.length < minCLength ? ($c + maxCountStr).slice(-minCLength) : maxCountStr;
                    }
                }
            }

            const dir: string = p.dir.replace(/\\/g, '/') + '/';
            const workspace: string = settings.folder ? (settings.folder.fsPath.replace(/\\/g, '/') + '/') : dir;

            const values: { [key: string]: string } = {
                '$b': p.base,
                '$p': dir,
                '$n': p.name,
                '$e': p.ext,
                '${workspaceFolder}': workspace,
                '$c': $c,
                '$H': `0${now.getHours()}`.slice(-2),
                '$M': `0${now.getMinutes()}`.slice(-2),
                '$d': `0${now.getDate()}`.slice(-2),
                '$m': `0${now.getMonth() + 1}`.slice(-2),
                '$Y': now.getFullYear().toString(),
                '$u': os.userInfo().username,
                '$s': vscode.env.sessionId
            };

            fullPath = fileName.replace(/(\$b|\$p\/?|\$n|\$e|\${workspaceFolder}\/?|\$\d*c|\$H|\$M|\$d|\$m|\$Y|\$u|\$s)/g, match => {
                if (new RegExp(/\$\d*c/).test(match)) {
                    return values['$c'];
                }
                return values[match];
            });

            if (fileBase) {
                if (!fileBase.includes('$p') && !fileBase.includes('${workspaceFolder}')) {
                    fullPath = [dir, (fileBase + fullPath)].join('/');
                }
                else {
                    fullPath = fileBase.replace(/(\$p|\${workspaceFolder})\/?/g, match => {
                        if (match === '${workspaceFolder}') {
                            return workspace
                        }
                        return dir;
                    }) + fullPath;
                }
            } else if (!FN.includes('$p') && !FN.includes('${workspaceFolder}')) {
                fullPath = [dir, fullPath].join('/');
            }
        } else {
            let nowInfo;
            if (isOriginal) {
                // find original date (if any)
                const state = fs.statSync(document.fileName);
                if (state)
                    now = state.mtime;
            }
            // remove 1 sec to original version, to avoid same name as currently version
            now = new Date(now.getTime() - (now.getTimezoneOffset() * 60000) - (isOriginal ? 1000 : 0));
            nowInfo = now.toISOString().substring(0, 19).replace(/[-:T]/g, '');

            fullPath = this.joinPath(settings.historyPath, revisionDir, p.name, p.ext, `_${nowInfo}`); // toto_20151213215326.js
        }

        return fullPath.replace(/\\/g, '/').replace('//', '/');
    }

    private getRevisionPatternByFilename(document: vscode.TextDocument, settings: IHistorySettings): string {
        let fileName = settings.filename.slice(settings.filename.lastIndexOf('/') + 1);
        if (!fileName) {
            return '';
        }

        const p = path.parse(document.fileName);
        const values: { [key: string]: string } = {
            '$b': EscapeRegExp(p.base),
            '$p': '',
            '$n': EscapeRegExp(p.name),
            '$e': EscapeRegExp(p.ext),
            '${workspaceFolder}': '',
            '$c': '([0-9]*)',
            '$H': '(?:|[0-1][0-9]|2[0-4])',
            '$M': '(?:[0-5][0-9])',
            '$d': '(?:0[1-9]|[1-2][0-9]|3[0-1])',
            '$m': '(?:0[1-9]|1[0-2])',
            '$Y': '(?:[0-9]{4})',
            '$u': EscapeRegExp(os.userInfo().username),
            '$s': EscapeRegExp(vscode.env.sessionId),
        };

        return `^${fileName.replace(/(\$b|\$p|\$n|\$e|\${workspaceFolder}|\$\d*c|\$H|\$M|\$d|\$m|\$Y|\$u|\$s)/g, match => {
            if (counterRegExp.test(match)) {
                match = '$c'
            }
            return values[match];
        })}$`;
    }

    private getFilesFromFilename(document: vscode.TextDocument, settings: IHistorySettings): Array<string> {
        const filename = settings.filename;

        if (!filename) {
            return [];
        }

        const p = path.parse(document.fileName);
        const dir: string = p.dir + '\\';
        const workspace: string = settings.folder ? (settings.folder.fsPath + '\\') : p.dir;
        const baseDir = filename.slice(0, filename.lastIndexOf('/') + 1);
        const fileMatcher = new RegExp(this.getRevisionPatternByFilename(document, settings));

        let cwdPath: string;
        if (baseDir) {
            if (!baseDir.includes('$p') && !baseDir.includes('${workspaceFolder}')) {
                cwdPath = dir + baseDir;
            }
            else {
                cwdPath = baseDir.replace(/(\$p|\${workspaceFolder})\/?/g, match => {
                    if (match === '${workspaceFolder}') {
                        return workspace
                    }
                    return dir;
                });
            }
        } else {
            cwdPath = filename.includes('${workspaceFolder}') ? workspace : dir;
        }

        let files = glob.sync('*', {nodir: true, absolute: false ,cwd: cwdPath.replace(/\//g, '\\').replace('\\\\', '\\')}).filter(file => fileMatcher.test(file));

        if (files && files.length > 1) {
            if (new RegExp(/\$(\d?)c/).test(filename)) {
                let count:{[file: string]: number} = {};
                files.forEach(file => count[file] = parseInt(fileMatcher.exec(file)[1], 10));
                files.sort((a, b) => (count[a] - count[b]));
            } else {
                let details:{[file: string]: fs.Stats} = {};
                files.forEach(file => details[file] = fs.statSync(file));
                files.sort((a, b) => (details[a].birthtime.getTime() - details[b].birthtime.getTime()));
            }
        }

        return files;
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

    private copyFile(source: string, target: string, timeout?: Timeout): boolean {
        try {
            let buffer;
            buffer = fs.readFileSync(source);
            const stat = fs.statSync(source);
            if (timeout && timeout.isTimedOut()) {
                vscode.window.showErrorMessage(`Timeout when copyFile: ' ${source} => ${target}`);
                return false;
            }
            fs.writeFileSync(target, buffer);
            fs.utimesSync(target, stat.atime, stat.mtime);
            fs.chmodSync(target, stat.mode);
            winattr.setSync(target, winattr.getSync(source));
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

