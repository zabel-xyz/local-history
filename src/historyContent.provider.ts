'use strict';

import * as vscode from 'vscode';

import HistoryController  from './history.controller';

import path = require('path');

export default class HistoryContentProvider implements vscode.TextDocumentContentProvider {

    static scheme = 'local-history';

    // private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    private seq = 0;

    constructor(private controller: HistoryController) {
    }

    // dispose() {
    //     this._onDidChange.dispose();
    // }

    /**
     * Expose an event to signal changes of _virtual_ documents
     * to the editor
     */
    // get onDidChange() {
    //     return this._onDidChange.event;
    // }

    // public update(uri: vscode.Uri) {
    //     this._onDidChange.fire(uri);
    // }

    public showViewer(editor: vscode.TextEditor) {
        const uri = this.encodeEditor(editor);

        return vscode.commands.executeCommand('vscode.previewHtml', uri, Math.min(editor.viewColumn + 1, 3), 'Local history')
            .then(
                (success) => {
            },  (reason) => {
                vscode.window.showErrorMessage(reason);
            });
    }

    public compare(file1, file2: vscode.Uri, column: number) {
        if (file1 && file2)
            this.controller.internalCompare(file1, file2, column)
        else
            vscode.window.showErrorMessage('Select 2 history files to compare');
    }



    /**
     * Provider method that takes an uri of the scheme and
     * resolves its content by creating the html document
     */
    provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
        const [filename, column] = this.decodeEditor(uri);

        return new Promise((resolve, reject) => {

            this.controller.findAllHistory(filename)
                .then(files => {

                    if (!files || !files.length) {
                        return resolve ('No history');
                    }

                    let result: string;
                    result =
                    `
                    <!DOCTYPE html>
                    <html>
                        <head>
                            <style>
                                #history {
                                    border-collapse: collapse;
                                    background-color: white;
                                    width: 90%;
                                }
                                #history td, #history th {
                                    border: 1px solid #ddd;
                                    padding: 4px;
                                }
                                #history .compare {
                                    vertical-align: middle;
                                    text-align: center;
                                }
                                #history input[type='checkbox'] {
                                    width: 15px;
                                    height: 15px;
                                }
                                #history tr:nth-child(odd){
                                    background-color: #f2f2f2;
                                }
                                #history th {
                                    padding-top: 6px;
                                    padding-bottom: 6px;
                                    text-align: left;
                                    background-color: #e5e5e5;
                                    color: black;
                                }
                                #history .th-compare {
                                    width: 80px;
                                }
                                #history a {
                                    text-decorations: none;
                                    color: black;
                                }
                                #history a:hover {
                                    font-weight: bold;
                                }
                            </style>

                            <script type="text/javascript">
                                var objects = {file1: null, file2: null},
                                    objHRef = null;

                                function initialize() {
                                    var object = document.querySelector("input[type='checkbox']:checked");
                                    if (object)
                                        chkCompareClick(object);
                                }

                                function updateHRef() {
                                    var file1, file2;

                                    if (objHRef === null)
                                        objHRef = document.getElementById('diffHRef');

                                    if (objects.file1 === null || objects.file1 === null) {
                                        objHRef.setAttribute('href', encodeURI('command:local-history.compare?'));
                                        return;
                                    }

                                    // if file1 is current version, inverse files, to be not readOnly in compare
                                    if (objects.file1.getAttribute('data-current')) {
                                        file1 = objects.file2;
                                        file2 = objects.file1;
                                    } else {
                                        file1 = objects.file1;
                                        file2 = objects.file2;
                                    }
                                    file1 = JSON.parse(decodeURI(file1.getAttribute('data-historyFile')));
                                    file2 = JSON.parse(decodeURI(file2.getAttribute('data-historyFile')));

                                    column = objHRef.getAttribute('data-column');
                                    objHRef.setAttribute('href', encodeURI('command:local-history.compare?'+JSON.stringify([file1, file2, column])));
                                }

                                function chkCompareClick(object) {
                                    if (object.checked) {
                                        if (objects.file1 === null) {
                                            objects.file1 = object;
                                        } else {
                                            if (objects.file2 !== null)
                                                objects.file2.checked = false;
                                            objects.file2 = object;
                                        }
                                    } else {
                                        if (object === objects.file1) {
                                            objects.file1 = objects.file2;
                                            objects.file2 = null;
                                        } else if (object === objects.file2) {
                                            objects.file2 = null;
                                        } else
                                            console.log('Something go wrong');
                                    }
                                    updateHRef();
                                }
                            </script>

                        </head>
                        <body onload="initialize()">
                            <H2>Local history</H1>
                            <H3>${filename}</H2>

                            <table id="history">
                                <tr>
                                    <th class="th-compare">Compare</th>
                                    <th>History</th>
                                </tr>
                                <tr>
                                    <td>
                                        <a href="${encodeURI('command:local-history.compare?')}" id="diffHRef" data-column="${column}">
                                            <input type="button" class="button-css" value="Compare"/>
                                        </a>
                                    </td>
                                </tr>
                                ${this.buildHtmlFiles(filename, column, filename)}
                                ${this.buildHtmlFiles(files, column, filename)}
                            </table>
                        </body>
                    </html>
                    `
                    return resolve(result);
                })
        })
    }

    private buildHtmlFiles(files, column, current: string): string {
        let result: string = '',
            last;

        if (!(files instanceof Array)) {
            const properties = this.controller.internalDecodeFile(files);
            let file = path.join(vscode.workspace.rootPath, properties.dir, properties.name + properties.ext);
            result += this.getHtmlFile(vscode.Uri.file(file), column, properties.name + properties.ext, current === file, true);
        } else {
            // TODO: unlimited display
            // show only x elements according to maxDisplay
            if (this.controller.maxDisplay > 0 && this.controller.maxDisplay < files.length)
                last = files.length - this.controller.maxDisplay;
            else
                last = 0;
            // desc order history
            for (let index = files.length - 1, file; index >= last; index--) {
                file = files[index];
                const properties = this.controller.internalDecodeFile(file.fsPath);
                result += this.getHtmlFile(file, column, properties.date.toLocaleString(), current === file.fsPath);
            }
        }
        return result;
    }

    private getHtmlFile(file, column, caption, checked, current?: boolean): string {
        const link = encodeURI(`command:vscode.open?${JSON.stringify([file, column])}`),
              uriFile = encodeURI(JSON.stringify(file)),
              fileName = path.basename(file.fsPath);
        return `
            <tr>
                <td class="compare">
                    <input type="checkbox" ${checked ? 'checked' : ''} onclick="chkCompareClick(this);" data-historyFile="${uriFile}" ${current ? 'data-current="1"' : ''} />
                </td>
                <td>
                    <a href="${link}">${caption}</a>
                </td>
            </tr>
        `
    }

    private encodeEditor(editor: vscode.TextEditor): vscode.Uri {
        const query = JSON.stringify([editor.document.fileName, editor.viewColumn]);
        return vscode.Uri.parse(`${HistoryContentProvider.scheme}:Viewer.local-history?${query}#${this.seq++}`);
    }
    private decodeEditor(uri: vscode.Uri): [string, number] {
        let [filename, column] = <[string, number]>JSON.parse(uri.query);
        return [filename, column];
    }

}
