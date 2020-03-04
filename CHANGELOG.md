## 1.8.1
* Fix error "Cannot find module 'path-is-inside'" [#102](https://github.com/zabel-xyz/local-history/issues/102)

## 1.8.0
### Improvements
* Change settings dynamically [#38](https://github.com/zabel-xyz/local-history/issues/38)
* Icon in side bar (use of svg) [#48](https://github.com/zabel-xyz/local-history/issues/48)
* Icon for treeView (use of vscode builtin icons) [#95](https://github.com/zabel-xyz/local-history/issues/95)
### Bugs fixed
* Fix use of character ~ on linux system [#47](https://github.com/zabel-xyz/local-history/issues/47)
* Use of fs.mkdirSync, fs.copyFile inplace of third library usage [#75](https://github.com/zabel-xyz/local-history/issues/75)
* local-history.treeLocation not working [#98](https://github.com/zabel-xyz/local-history/issues/98)
* Remove commands for tree in the command panel [#94](https://github.com/zabel-xyz/local-history/issues/94)

## 1.7.0
### New features
* 3 different history views (current, all, specific)
* SubMenu item for restoring files [#23](https://github.com/zabel-xyz/local-history/issues/23)
* Local history as activity bar item, use settings `local-history.treeLocation` [#41](https://github.com/zabel-xyz/local-history/issues/41)
* Remove html document
### Bugs fixed
* Fix cannot read property 'document' of undefined [#31](https://github.com/zabel-xyz/local-history/issues/31)
* Fix Cannot read property 'fsPath' of undefined [#35](https://github.com/zabel-xyz/local-history/issues/35)

## 1.6.2
### New features
* Add variable ${workspaceFolder} for setting "local-history.path"
* Add variable ${workspaceFolder: 0} for setting "local-history.path in multi-root workspace"
* Support for multi-root workspace

## 1.6.1
* Fix vscode.workspace.getWorkspaceFolder(file) return null when open from command line [#24](https://github.com/zabel-xyz/local-history/issues/24)

## 1.6.0
### Bugs fixed
* Fix delete file history in treeView.
### New features
* New setting `local-history.saveDelay` to add a delay (in seconds) on history generation.
According to request [#20](https://github.com/zabel-xyz/local-history/issues/20)
* New setting `local-history.dateLocale` to specify the locale to use when displaying date

## 1.5.2
* Fix error "Cannot read property 'document' of undefined" when opening a folder

## 1.5.1
* Fix calculate relative date

## 1.5.0
* Displays a local-history tree in the explorer pane [#21](https://github.com/zabel-xyz/local-history/issues/21)

## 1.4.0
* Add first file version [#9-#19](https://github.com/zabel-xyz/local-history/issues/19)
* The minimum supported version of VS Code is now 1.15.0 (to support multi-root)

## 1.3.0
### Bugs fixed
* Fix file naming generation, length under 14 chars [#18](https://github.com/zabel-xyz/local-history/issues/18)
### Breaking changes
* Setting `enabled` is a number (previously boolean) <BR>
  (0: never, 1: always, 2: limited to workspaceFolder)
* Setting `exclude` is an array (previously string) <BR>
  array of folder or files to not save (glob)
### New features
* Save single files, without workspacefolder [#8](https://github.com/zabel-xyz/local-history/issues/8)
* Setting `absolute` to allow saving absolute path in `local-history.path` [#16](https://github.com/zabel-xyz/local-history/issues/16)
### Other changes
* The minimum supported version of VS Code is now 1.14.0

## 1.2.1
* Fix issue with variables like %AppData% in local-history.path [#15](https://github.com/zabel-xyz/local-history/issues/15)
* Replace jade by pug
* Improve html viewer (display settings, add buttons, ...)
* Refresh html viewer when save file (if viewer is visible)
* Compare: force current file on right part to allow edition
* Use new version of TypeScript, VSCode, vsce...

## 1.1.1
* Fix issue with no workspace [#12](https://github.com/zabel-xyz/local-history/issues/12)

## 1.1.0
* New setting `local-history.path` to specify another location for .history folder [#4](https://github.com/zabel-xyz/local-history/issues/4)
* Fix an issue: history files can no longer be save in a deep-level structure (vscode 1.7.1, windows)
  (caused by vscode.workspace.findfiles) [#5](https://github.com/zabel-xyz/local-history/issues/5)
* Use new version of TypeScript, VSCode, vsce...

## 1.0.2
* Fix an issue with vscode.workspace.asRelativePath (vscode 1.6)

## 1.0.1
* Fix an issue with save encoding [#3](https://github.com/zabel-xyz/local-history/issues/3)

## 1.0.0
* New command `local-history.showViewer` to show the local history in a html document to the side

## 0.0.6
* New setting `local-history.enabled` to desactivate this extension
* Show text document in active column

## 0.0.3
* Fix an issue when create directory structure [#1](https://github.com/zabel-xyz/local-history/issues/1)

## 0.0.2
* New commands:
  * `local-history.showCurrent`       to show current version (if history version is active)
  * `local-history.compareToCurrent`  to compare current version with another version in history
  * `local-history.compareToActive`   to compare active file with another version in history
  * `local-history.compareToPrevious` to compare a version in history with its previous version
