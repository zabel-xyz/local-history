import {
    workspace,
    Disposable,
    TextDocument,
    window,
    commands
} from 'vscode';

import fs = require('fs');
import path = require('path');

interface IHistorySettings {
    daysLimit: number;
    maxDisplay: number;
    exclude: string;
}

interface IHistoryActionValues {
    active: string;
    selected: string;
    previous: string;
}

interface IHistoryFileProperties {
    isHistory: boolean;
    dir: string;
    name: string;
    ext: string;
}

/**
* Activate the extension.
*/
export function activate(disposables: Disposable[]) {
    let controller = new HistoryController();

    commands.registerCommand('local-history.showAll', controller.ShowAll, controller);
    commands.registerCommand('local-history.showCurrent', controller.ShowCurrent, controller);
    commands.registerCommand('local-history.compareToActive', controller.CompareToActive, controller);
    commands.registerCommand('local-history.compareToCurrent', controller.CompareToCurrent, controller);
    commands.registerCommand('local-history.compareToPrevious', controller.CompareToPrevious, controller);

    // Create history on save document
    workspace.onDidSaveTextDocument(document => {
        controller.SaveRevision(document);
    }, undefined, disposables);
}

/**
 * Controller for handling history.
 */
class HistoryController {
    private settings: IHistorySettings;
    private mkdirp = require('mkdirp');

    constructor() {
        this.settings = this.readSettings();
    }

    public SaveRevision(document: TextDocument) {
        if (workspace.rootPath === null) {
            return;
        }

        if (!(document && /*document.isDirty &&*/ document.fileName)) {
            return;
        }

        let dir = this.getRelativePath(document.fileName),
            file;
        if (dir !== '')
            file = path.join(
                dir,
                path.basename(document.fileName)
            ).substr(1).replace(/\\/g, '/');
        else
            file = path.basename(document.fileName);

        // if it's an exclude file or folder don't do anything
        workspace.findFiles(file, this.settings.exclude)
            .then(files => {

                // exclude file
                if (!files.length) {
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
                        workspace.rootPath,
                        '.history',
                        dir,
                        revisionFile);
                if (me.mkDirRecursive(revisionFile))
                    fs.writeFile(revisionFile, document.getText(), function(err) {
                        if (err) {
                            window.showErrorMessage(
                                    'Can not save the revision of the file: '+document.fileName+
                                    ' Error: '+ err.toString());
                        } else {
                            if (me.settings.daysLimit > 0)
                                me.purge(document);
                        }
                    });

            })
    }

    public ShowAll() {
        this.internalShowAll(this.actionOpen);
    }
    public ShowCurrent() {
        if (workspace.rootPath === null)
            return;

        let document = (window.activeTextEditor && window.activeTextEditor.document);

        if (document)
            return this.internalOpen(this.findCurrent(document.fileName));
    }

    public CompareToActive() {
        this.internalShowAll(this.actionCompareToActive);
    }

   public CompareToCurrent() {
        this.internalShowAll(this.actionCompareToCurrent);
   }

    public CompareToPrevious() {
        this.internalShowAll(this.actionCompareToPrevious);
    }

    /* private */
    private internalShowAll(action) {

        if (workspace.rootPath === null)
            return;

        let me = this,
            document = (window.activeTextEditor && window.activeTextEditor.document),
            lengthToStripOff = workspace.rootPath.length + 1;

        if (!document)
            return;

        workspace.findFiles(me.buildRevisionPatternPath(document), '')
            .then(files => {
                if (files && files.length > 0) {
                    let displayFiles = [],
                        last = 0;
                    // show only x elements according to maxDisplay
                    if (me.settings.maxDisplay > 0 && me.settings.maxDisplay < files.length)
                        last = files.length - me.settings.maxDisplay;
                    // desc order history
                    for (let index = files.length - 1, file; index >= last; index--) {
                        file = files[index];
                        displayFiles.push({
                            description: file.fsPath.substring(lengthToStripOff),
                            label: me.getFileName(file.fsPath),
                            filePath: file.fsPath,
                            previous: files[index - 1]
                        });
                    }
                    window.showQuickPick(displayFiles)
                        .then(val=> {
                            if (val) {
                                let actionValues: IHistoryActionValues = {
                                        active: document.fileName,
                                        selected: val.filePath,
                                        previous: val.previous
                                    };
                                action.apply(me, [actionValues]);
                            }
                        });
                }
            });
    }

    private actionOpen(values: IHistoryActionValues) {
        return this.internalOpen(values.selected);
    }

    private actionCompareToActive(values: IHistoryActionValues) {
        return this.internalCompare(values.selected, values.active);
    }

    private actionCompareToCurrent(values: IHistoryActionValues) {
        return this.internalCompare(values.selected, this.findCurrent(values.active));
    }

    private actionCompareToPrevious(values: IHistoryActionValues) {
        return this.internalCompare(values.selected, values.previous);
    }

    private internalOpen(filePath) {
        if (filePath)
            return new Promise((resolve, reject) => {
                workspace.openTextDocument(filePath)
                    .then(d=> {
                        window.showTextDocument(d)
                            .then(()=>resolve(), (err)=>reject(err))
                    }, (err)=>reject(err));
            });
    }
    private internalCompare(file1, file2) {
        // cf. https://github.com/DonJayamanne/gitHistoryVSCode
        // The way the command "workbench.files.action.compareFileWith" works is:
        // It first selects the currently active editor for comparison
        // Then launches the open file dropdown
        // & as soon as a file/text document is opened, that is used as the text document for comparison
        // So, all we need to do is invoke the comparison command
        // Then open our file
        if (file1 && file2)
            return this.internalOpen(file1)
                .then(() => {
                    commands.executeCommand("workbench.files.action.compareFileWith");
                    this.internalOpen(file2)
                        .then(()=>{}, this.errorHandler);
                }, this.errorHandler);
    }

    private errorHandler(error) {
        window.showErrorMessage(error);
    }

    private internalDecodeFile(filePath: string): IHistoryFileProperties {
        let name, dir, ext,
            isHistory = false;

        dir = this.getRelativePath(filePath),
        name = path.parse(filePath).name;
        ext = path.extname(filePath);

        if (dir !== '' && (dir.startsWith('\\') || dir.startsWith('/'))) {
            dir = dir.substr(1);
            if (dir.startsWith('.history')) {
                dir = dir.substr(8);
                isHistory = true;
                if (/_\d{14}$/.test(name))
                    name = name.substr(0, name.length-15);
                else
                    return null; // file in history with bad pattern !
            }
        }

        return {
            isHistory: isHistory,
            dir: dir,
            name: name,
            ext: ext
        }
    }

    private buildRevisionPatternPath(document: TextDocument): string {
        let me = this,
            pattern = '_'+('[0-9]'.repeat(14)),
            fileProperties = me.internalDecodeFile(document.fileName);

        if (fileProperties === null)
            return;

        // if it's already a revision file, show other history available
        return path.join(
                '.history',
                fileProperties.dir,
                fileProperties.name + pattern + fileProperties.ext).replace(/\\/g, '/');
    }

    private findCurrent(activeFilename: string): string {
        let me = this,
            fileProperties = me.internalDecodeFile(activeFilename);

        if (fileProperties === null)
            return activeFilename;

        return path.join(
                workspace.rootPath,
                fileProperties.dir,
                fileProperties.name + fileProperties.ext).replace(/\\/g, '/');
    }

    private purge(document: TextDocument) {
        let me = this;

        workspace.findFiles(me.buildRevisionPatternPath(document), '')
            .then(files => {
                let stat: fs.Stats,
                    now: Number = new Date().getTime(),
                    endTime: Number;

                for (let file of files) {
                    stat = fs.statSync(file.fsPath);
                    if (stat && stat.isFile()) {
                        endTime = stat.birthtime.getTime() + me.settings.daysLimit * 24*60*60*1000;
                        if (now > endTime) {
                            fs.unlinkSync(file.fsPath);
                        }
                    }
                }
            });
    }

    private getRelativePath(fileName: string){
        let dir = path.dirname(fileName),
            relative = workspace.asRelativePath(dir);

        if (dir !== relative)
            return relative;
        else
            return '';
    }

    private mkDirRecursive(fileName: string): boolean {

        try {
            this.mkdirp.sync(path.dirname(fileName));
            return true;
        }
        catch(err) {
            window.showErrorMessage(
                'Error with mkdirp: '+err.toString()+' file '+fileName);
            return false;
        }



        // let paths = [],
        //     dirs, tmp, sep;

        // if (fileName.indexOf('\\')) {
        //     dirs = fileName.split('\\');
        //     sep = '\\';
        // } else {
        //     dirs = fileName.split('/');
        //     sep = '/';
        // }

        // while (dirs.length > 1) {
        //     paths.push(dirs.shift());
        //     if (paths[paths.length-1].indexOf(':') < 0) {
        //         tmp = paths.join(sep);
        //         if (!fs.existsSync(tmp))
        //             fs.mkdirSync(tmp);
        //     }
        // }
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
        let config = workspace.getConfiguration('local-history');

        return {
            daysLimit: <number>config.get('daysLimit') || 30,
            maxDisplay: <number>config.get('maxDisplay') || 10,
            exclude: <string>config.get("exclude") || "{.history,.vscode,**/node_modules,typings}"
        }
    }
}