import * as vscode from 'vscode';

import {IHistoryFileProperties, HistoryController}  from './history.controller';
import {IHistorySettings} from './history.settings';

import path = require('path');

const enum EHistoryTreeItem {
    None = 0,
    Group,
    File
}

export default class HistoryTreeProvider implements vscode.TreeDataProvider<HistoryItem>  {

    /* tslint:disable */
    private _onDidChangeTreeData: vscode.EventEmitter<HistoryItem | undefined> = new vscode.EventEmitter<HistoryItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<HistoryItem | undefined> = this._onDidChangeTreeData.event;
    /* tslint:enable*/

    private currentHistoryFile: string;
    private historyFiles: Object; // {yesterday: IHistoryFileProperties[]}
    // save historyItem structure to be able to redraw
    private tree = {};  // {yesterday: {grp: HistoryItem, items: HistoryItem[]}}
    private selection: HistoryItem;
    private noLimit = false;
    private date;

    public readonly selectIconPath = {
        light: path.join(__filename, '..', '..', '..', 'resources', 'images', 'light', 'selection.png'),
        dark:  path.join(__filename, '..', '..', '..', 'resources', 'images', 'dark', 'selection.png')
    };

    constructor(private controller: HistoryController) {
    }

    getTreeItem(element: HistoryItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: HistoryItem): Promise<HistoryItem[]> {
        return new Promise(resolve => {

            // redraw
            const keys = Object.keys(this.tree);
            if (keys && keys.length) {
                if (!element) {
                    const items = [];
                    keys.forEach(key => items.push(this.tree[key].grp));
                    return resolve(items);
                } else if (this.tree[element.label].items) {
                    return resolve(this.tree[element.label].items);
                }
            }

            // rebuild
            let items: HistoryItem[] = [];

            if (!element) { // root
                if (!this.historyFiles) {
                    const filename = vscode.window.activeTextEditor.document.uri;
                    const settings = this.controller.getSettings(filename);
                    this.loadHistoryFile(filename, settings)
                        .then(() => {
                            items = this.loadHistoryGroups(this.historyFiles);
                            resolve(items);
                        });
                } else {
                    items = this.loadHistoryGroups(this.historyFiles);
                    resolve(items);
                }
            } else if (element.kind === EHistoryTreeItem.Group) {
                this.historyFiles[element.label].forEach((file) => {
                    items.push(new HistoryItem(file.date.toLocaleString(), vscode.Uri.file(file.file), element.label));
                });
                this.tree[element.label].items = items;
                resolve(items);
            }
        });
    }

    private loadHistoryFile(fileName: vscode.Uri, settings: IHistorySettings): Promise<Object> {
        return new Promise((resolve, reject) => {
            this.controller.findAllHistory(fileName.fsPath, settings, this.noLimit)
                .then(fileProperties => {
                    // Current file
                    const historyFile = this.controller.decodeFile(fileName.fsPath, settings);
                    this.currentHistoryFile = historyFile && historyFile.file;
                    // History files
                    this.historyFiles = {};
                    const files = fileProperties && fileProperties.history;
                    let grp;
                    if (files && files.length) {
                        for (let index = files.length - 1, file; index >= 0; index--) {
                            file = this.controller.decodeFile(files[index], settings)
                            if (grp !== 'Older') {
                                grp = this.getRelativeDate(file.date);
                                if (!this.historyFiles[grp])
                                this.historyFiles[grp] = [file]
                                else
                                this.historyFiles[grp].push(file);
                            } else {
                                this.historyFiles[grp].push(file);
                            }
                        }
                    }
                    return resolve(this.historyFiles);
                })
        })
    }

    private loadHistoryGroups(historyFiles: Object): HistoryItem[] {
        const items = [],
              keys = historyFiles && Object.keys(historyFiles);

        if (keys && keys.length > 0)
            keys.forEach((key) => {
                const item =  new HistoryItem(key);
                this.tree[key] = {grp: item};
                items.push(item);
            });
        else
            items.push(new HistoryItem());

        return items;
    }

    private getRelativeDate(fileDate: Date) {
        const hour = 60 * 60,
              day = hour * 24,
              ref = fileDate.getTime() / 1000;

        if (!this.date) {
            const dt = new Date(),
                  now =  dt.getTime() / 1000,
                  today = dt.setHours(0,0,0,0) / 1000; // clear current hour
            this.date = {
                now:  now,
                today: today,
                week: today - ((dt.getDay() || 7) - 1) * day, //  1st day of week (week start monday)
                month: dt.setDate(1) / 1000,        // 1st day of current month
                eLastMonth: dt.setDate(0) / 1000,          // last day of previous month
                lastMonth: dt.setDate(1) / 1000     // 1st day of previous month
            }
        }

        if (this.date.now - ref < hour)
            return 'In the last hour'
        else if (ref > this.date.today)
            return 'Today'
        else if (ref > this.date.today - day)
            return 'Yesterday'
        else if (ref > this.date.week)
            return 'This week'
        else if (ref > this.date.week - (day * 7))
            return 'Last week'
        else if (ref > this.date.month)
            return 'This month'
        else if (ref > this.date.lastMonth)
            return 'Last month'
        else
            return 'Older'
    }

    private changeItemSelection(select, item) {
        if (select)
            item.iconPath = this.selectIconPath
        else
            delete item.iconPath;
    }

    private redraw() {
        this._onDidChangeTreeData.fire();
    }

    public changeActiveFile() {
        const filename = vscode.window.activeTextEditor.document.uri;
        const settings = this.controller.getSettings(filename);
        const prop = this.controller.decodeFile(filename.fsPath, settings, false);
        if (!prop || prop.file !== this.currentHistoryFile)
            this.refresh();
    }

    public refresh(noLimit = false): void {
        this.tree = {};
        delete this.selection;
        this.noLimit = noLimit;
        delete this.currentHistoryFile;
        delete this.historyFiles;
        delete this.date;
        this._onDidChangeTreeData.fire();
    }

    public more(): void {
        if (!this.noLimit) {
            this.refresh(true);
        }
    }

    public deleteAll(): void {
        const keys = Object.keys(this.historyFiles);
        if (keys && keys.length) {
            const items = [];
            keys.forEach((key) => Array.prototype.push.apply(items, this.historyFiles[key]));
            this.controller.deleteFiles(items)
                .then(() => this.refresh());
        }
    }

    public show(file: vscode.Uri): void {
        vscode.commands.executeCommand('vscode.open', file);
    }

    public showSide(element: HistoryItem): void {
        if (element.kind === EHistoryTreeItem.File)
            vscode.commands.executeCommand('vscode.open', element.file, Math.min(vscode.window.activeTextEditor.viewColumn + 1, 3));
    }

    public delete(element: HistoryItem): void {
        if (element.kind === EHistoryTreeItem.File)
            this.controller.deleteFile(element.file.fsPath)
                .then(() => this.refresh());
        else  if (element.kind === EHistoryTreeItem.Group) {
            this.controller.deleteFiles(
                    this.historyFiles[element.label].map((value: IHistoryFileProperties) => value.file))
                .then(() => this.refresh());
        }
    }

    public compareToCurrent(element: HistoryItem): void {
        if (element.kind === EHistoryTreeItem.File)
            this.controller.compare(element.file, vscode.Uri.file(this.currentHistoryFile));
    }
    public select(element: HistoryItem): void {
        if (element.kind === EHistoryTreeItem.File) {
            if (this.selection)
                delete this.selection.iconPath;
            this.selection = element;
            this.selection.iconPath = this.selectIconPath;
            this.tree[element.grp].grp.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            this.redraw();
        }
    }
    public compare(element: HistoryItem): void {
        if (element.kind === EHistoryTreeItem.File) {
            if (this.selection)
                this.controller.compare(element.file, this.selection.file);
            else
                vscode.window.showErrorMessage('Select a history files to compare with');
        }
    }
}

class HistoryItem extends vscode.TreeItem {

    public readonly kind: EHistoryTreeItem;

    constructor(label: string = '', public readonly file?: vscode.Uri, public readonly grp: string = '') {
        super(label != '' ? label : 'No history',
              file || !label ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed
        );
        this.kind = label ? (file ? EHistoryTreeItem.File : EHistoryTreeItem.Group) : EHistoryTreeItem.None;
        switch (this.kind) {
            case EHistoryTreeItem.File:
                this.contextValue = 'localHistoryItem';
                break;
            case EHistoryTreeItem.Group:
                this.contextValue = 'localHistoryGrp';
                break;
            default: // EHistoryTreeItem.None
                this.contextValue = 'localHistoryNone';
        }

        // this.command = this.kind === EHistoryTreeItem.File ? {
        //     command: 'treeLocalHistory.showEntry',
        //     title: 'Open Local History',
        //     arguments: [file]
        // } : undefined;

        this.command = this.kind === EHistoryTreeItem.File ? {
            command: 'treeLocalHistory.compareToCurrentEntry',
            title: 'Compare with current version',
            arguments: [this]
        } : undefined;
    }
}
