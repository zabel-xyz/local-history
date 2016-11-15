## 1.1.0
    * New setting `local-history.path` to specify another location for .history folder [#4](https://github.com/zabel-xyz/local-history/issues/4)
    * Fix an issue unable to save in history files in deep level structure (vscode 1.7.1, windows)
      (caused by vscode.workspace.findfiles()) [#5](https://github.com/zabel-xyz/local-history/issues/5)

## 1.0.2
    * Fix an issue with vscode.workspace.asRelativePath (vscode 1.6)

## 1.0.1
    * Fix an issue with save encoding [#3] (https://github.com/zabel-xyz/local-history/issues/3)

## 1.0.0
    * New command `local-history.showViewer` to show the local history in a html document to the side

## 0.0.6
    * New setting `local-history.enabled` to desactivate this extenstion
    * Show text document in current column

## 0.0.3
    * Fix issue when create directory structure [#1] (https://github.com/zabel-xyz/local-history/issues/1)

## 0.0.2
    * New commands:
      `local-history.showCurrent`       to show current version (if history version is active)
      `local-history.compareToCurrent`  to compare current version with another version in history
      `local-history.compareToActive`   to compare active file with another version in history
      `local-history.compareToPrevious` to compare a version in history with its previous version
