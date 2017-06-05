import * as vscode from 'vscode';

import HistoryController  from './history.controller';

import path = require('path');

interface IHistoryContentFile {
    caption: string;
    uri: vscode.Uri;
    isChecked: boolean;
    isCurrent: boolean;
}

export default class HistoryContentProvider implements vscode.TextDocumentContentProvider {
    static scheme = 'local-history';

    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    private contentSettings = new Map();

    constructor(private controller: HistoryController) {
    }

    public showViewer(editor: vscode.TextEditor) {
        const uri = this.encodeEditor(editor);
        this.contentSettings.delete(uri.toString());

        return vscode.commands.executeCommand('vscode.previewHtml', uri, Math.min(editor.viewColumn + 1, 3), 'Local history')
            .then(
                (success) => {
            },  (reason) => {
                vscode.window.showErrorMessage(reason);
            });
    }

    public compare(file1, file2: vscode.Uri, column: string) {

        if (file1 && file2)
            this.controller.compare(file1, file2, column);
        else
            vscode.window.showErrorMessage('Select 2 history files to compare');
    }

    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }
    // Called from HtmlPreview when click on refresh/more
    public refresh(providerUri: vscode.Uri, all?: boolean) {
        // TODO investigate server usage for better communication between extension and preivewHtml
        this.contentSettings.set(providerUri.toString(), {all: all});
        this._onDidChange.fire(providerUri);
    }
    // Called when save file
    public refreshDocument(document: vscode.TextDocument) {
        this._onDidChange.fire(this.encodeProviderUri(document.fileName, 1));
    }
    public delete(providerUri: vscode.Uri, fileUri: vscode.Uri, all?: boolean) {
        const fn = all ? this.controller.deleteHistory : this.controller.deleteFile;
        fn.call(this.controller, fileUri.fsPath)
            .then(() => this._onDidChange.fire(providerUri));
    }

    /**
     * Provider method that takes an uri of the scheme and
     * resolves its content by creating the html document
     */
    public provideTextDocumentContent(uri: vscode.Uri): string | Promise<string> {

        return new Promise((resolve, reject) => {

            const [filename, column] = this.decodeEditor(uri);
            const settings = this.contentSettings.get(uri.toString());

            // TODO security
            this.controller.findAllHistory(filename, (settings && settings.all) || false)
                .then(fileProperties => {
                    const files = fileProperties.history;
                    let contentFiles = [];

                    if (files && files.length) {
                        contentFiles = contentFiles.concat(this.buildContentFiles(filename, column, filename));
                        contentFiles = contentFiles.concat(this.buildContentFiles(files, column, filename));
                    }

                    // __dirname = out/src
                    const dirname = path.join(__dirname, '../../preview');

                    const pug = require('pug');
                    pug.renderFile(path.join(dirname, 'history.pug'), {
                        baseDir: path.join(dirname,'/'),
                        currentFile: vscode.Uri.file(filename),
                        currentSearch: path.relative(this.controller.getHistoryPath(), fileProperties.file),
                        column: column,
                        files: contentFiles,
                        workspaceRoot: vscode.workspace.rootPath,
                        historyPath: this.controller.getHistoryPath(),
                        providerUri: uri
                    }, function(err, html) {
                        if (err) {
                            console.log(err);
                            return reject(err);
                        }
                        return resolve(html);
                    });
                })
                .catch((err) => {
                    console.log(err);
                    return reject(err);
                });
        });
    }

    private buildContentFiles(files, column, current: string): IHistoryContentFile[] {
        let properties;

        if (!(files instanceof Array)) {
            properties = this.controller.decodeFile(files, false);
            return [this.getContentFile(properties.file, column, properties.name + properties.ext, current === properties.file, true)];
        } else {
            let result = [];

            // desc order history
            for (let index = files.length - 1, file; index >= 0; index--) {
                file = files[index].replace(/\//g, path.sep);
                properties = this.controller.decodeFile(file);
                result.push(this.getContentFile(properties.file, column, properties.date.toLocaleString(), current === properties.file));
            }
            return result;
        }
    }

    private getContentFile(file: string, column: number, caption: string, checked: boolean, current?: boolean): IHistoryContentFile {
        return {
            caption: caption,
            uri: vscode.Uri.file(file),
            isChecked: checked,
            isCurrent: current
        };
    }

    private encodeEditor(editor: vscode.TextEditor): vscode.Uri {
        return this.encodeProviderUri(editor.document.fileName, editor.viewColumn);
    }

    private encodeProviderUri(fileName: string, viewColumn: vscode.ViewColumn): vscode.Uri {
        const query = JSON.stringify([fileName, viewColumn]);
        return vscode.Uri.parse(`${HistoryContentProvider.scheme}:Viewer.local-history?${query}`);
    }

    private decodeEditor(uri: vscode.Uri): [string, number] {
        let [filename, column] = <[string, number]>JSON.parse(uri.query);
        return [filename, column];
    }

}
