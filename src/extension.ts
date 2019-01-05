import * as vscode from 'vscode';

import {HistoryController}  from './history.controller';
import HistoryTreeProvider  from './historyTree.provider';

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

    // Tree
    const treeProvider = new HistoryTreeProvider(controller);
    vscode.window.registerTreeDataProvider('treeLocalHistory', treeProvider);
    vscode.commands.registerCommand('treeLocalHistory.deleteAll', treeProvider.deleteAll, treeProvider);
    vscode.commands.registerCommand('treeLocalHistory.refresh', treeProvider.refresh, treeProvider);
    vscode.commands.registerCommand('treeLocalHistory.more', treeProvider.more, treeProvider);

    vscode.commands.registerCommand('treeLocalHistory.forCurrentFile', treeProvider.forCurrentFile, treeProvider);
    vscode.commands.registerCommand('treeLocalHistory.forAll', treeProvider.forAll, treeProvider);
    vscode.commands.registerCommand('treeLocalHistory.forSpecificFile', treeProvider.forSpecificFile, treeProvider);

    vscode.commands.registerCommand('treeLocalHistory.showEntry', treeProvider.show, treeProvider);
    vscode.commands.registerCommand('treeLocalHistory.showSideEntry', treeProvider.showSide, treeProvider);
    vscode.commands.registerCommand('treeLocalHistory.deleteEntry', treeProvider.delete, treeProvider);
    vscode.commands.registerCommand('treeLocalHistory.compareToCurrentEntry', treeProvider.compareToCurrent, treeProvider);
    vscode.commands.registerCommand('treeLocalHistory.selectEntry', treeProvider.select, treeProvider);
    vscode.commands.registerCommand('treeLocalHistory.compareEntry', treeProvider.compare, treeProvider);
    vscode.commands.registerCommand('treeLocalHistory.restoreEntry', treeProvider.restore, treeProvider);

    // Create first history before save document
    vscode.workspace.onWillSaveTextDocument(
        e => e.waitUntil(controller.saveFirstRevision(e.document))
    );

    // Create history on save document
    vscode.workspace.onDidSaveTextDocument(document => {
        controller.saveRevision(document)
            .then ((saveDocument) => {
                // refresh viewer (if any)
                if (saveDocument) {
                    treeProvider.refresh();
                }
            });
    });

    vscode.window.onDidChangeActiveTextEditor(
        e => treeProvider.changeActiveFile()
    );

    vscode.workspace.onDidChangeConfiguration(configChangedEvent => {
        if ( configChangedEvent.affectsConfiguration('local-history.treeLocation') )
            treeProvider.initLocation();

        else if ( configChangedEvent.affectsConfiguration('local-history') ) {
            controller.clearSettings();
            treeProvider.refresh();
        }
    });
}

// function deactivate() {
// }
