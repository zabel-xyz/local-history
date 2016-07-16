'use strict';

import * as vscode from 'vscode';
// import ReferencesDocument from './referencesDocument';

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

    public showViewer(editor: vscode.TextEditor) {
        const uri = this.encodeEditor(editor);

        return vscode.commands.executeCommand('vscode.previewHtml', uri, editor.viewColumn + 1, 'Local history')
            .then(
                (success) => {
            },  (reason) => {
                vscode.window.showErrorMessage(reason);
            });
    }

    // call by html
    // public callDiff(file1, file2) {
    //     return vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(file1), vscode.Uri.file(file2));
    // }
    // public callOpen(file, column) {
    //     return vscode.commands.executeCommand('vscode.open', file, column);
    //     //return vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file), column);
    // }

    // TEST
    public test() {
        console.log('TEST');
    }

    // public update(uri: vscode.Uri) {
    //     this._onDidChange.fire(uri);
    // }


    /**
     * Provider method that takes an uri of the scheme and
     * resolves its content by creating the html document
     */
    provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
        const [filename, column] = this.decodeEditor(uri);

        return new Promise((resolve, reject) => {

            this.controller.findAllHistory(filename, undefined)
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
                                function updateHRef() {
                                    document.getElementById('hrefDiff').setAttribute('href', encodeURI('command:local-history.test?'+JSON.stringify(['toto', 1])));
                                }

                                function chkCompareClick(object) {
                                    updateHRef();
                                    if (obj.checked) {
                                        // some code when it is unchecked
                                    } else {
                                        // some other code when it is unchecked
                                    }
                                }
                            </script>

                        </head>
                        <body>
                            <H2>Local history</H1>
                            <H3>${filename}</H2>

                            <table id="history">
                                <tr>
                                    <th class="th-compare">Compare</th>
                                    <th>History</th>
                                </tr>
                                <tr>
                                    <td>
                                        <a href="#" id="hrefDiff">
                                            <input type="button" class="button-css" value="Compare"/>
                                        </a>
                                    </td>
                                </tr>
                                ${this.buildHtmlFiles(filename, column)}
                                ${this.buildHtmlFiles(files, column)}
                            </table>
                        </body>
                    </html>
                    `
// a = document.getElementById('hrefDiff');
// a.setAttribute('href', encodeURI('command:local-history.test?'+JSON.stringify(['toto', 1])));
                                        // <button onClick="location.href='${encodeURI('command:local-history.test?'+JSON.stringify(['toto', 1]))}'">Compare</button>
                                        // <a href="${encodeURI('command:local-history.test?'+JSON.stringify(['toto', 1]))}">Compare</a>
                    return resolve(result);
                })
        })
    }

    private buildHtmlFiles(files, column): string {
        let result: string = '';

        if (!(files instanceof Array)) {
            const properties = this.controller.internalDecodeFile(files);
            let file = path.join(vscode.workspace.rootPath, properties.dir, properties.name + properties.ext);
            result += this.getHtmlFile(vscode.Uri.file(file), column, properties.name + properties.ext);
        } else {
            // desc order history
            const last = files.length;
            for (let index = files.length - 1, file; index >= 0; index--) {
                file = files[index];
                const properties = this.controller.internalDecodeFile(file.fsPath);
                result += this.getHtmlFile(file, column, properties.date.toLocaleString());
            }
        }
        return result;
    }

    private getHtmlFile(file, column, caption): string {
        const args = JSON.stringify([file, column]),
              link = encodeURI(`command:vscode.open?${args}`);
        return `
            <tr>
                <td class="compare">
                    <input type="checkbox" onclick="chkCompareClick(this);"/>
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
