import * as vscode from 'vscode';

import HistoryController  from './history.controller';
import HistoryContentProvider  from './historyContent.provider';

/**
* Activate the extension.
*/
export function activate(context: vscode.ExtensionContext) {
    const controller = new HistoryController();

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('local-history.showAll', controller.showAll, controller));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('local-history.showCurrent', controller.showCurrent, controller));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('local-history.compareToActive', controller.compareToActive, controller));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('local-history.compareToCurrent', controller.compareToCurrent, controller));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('local-history.compareToPrevious', controller.compareToPrevious, controller));

    // Create history on save document
    vscode.workspace.onDidSaveTextDocument(document => {
        controller.saveRevision(document);
    });

    // Show all local-history files
    const contentProvider = new HistoryContentProvider(controller);
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(HistoryContentProvider.scheme, contentProvider));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('local-history.showViewer', contentProvider.showViewer, contentProvider));
    // Commands call by html document
    context.subscriptions.push(vscode.commands.registerCommand('local-history.compare', contentProvider.compare, contentProvider));
}

// function deactivate() {
// }
