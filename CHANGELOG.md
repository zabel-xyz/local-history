## 1.3.0
* Add first file version, before changed format `.history/foo/bar/myFile_00000000000000.t`
=======
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
