# Local History

A Visual Studio Code extension for maintaining a local history of modified files.

Every time you modify a file, a copy of the old contents is kept in the local history.
At any time, you can compare a file with any older version from the history.
It can help you out when you change or delete a file by accident.
The history can also help you out when your workspace has a catastrophic problem.
Each file revision is stored in a separate file inside the .history folder of your workspace directory
(you can also configure another location, see local-history.path).
e.g., `.history/foo/bar/myFile_20151212205930.ts`

You can easily navigate between history files with the `local-history tree` in the explorer pane.<BR>

When you click on a file, a comparison with the current version is displayed.<BR>
You can also access other commands via a context menu.<BR>

![Image of tree](images/Tree.png)

You have different views to filter:
- all
- current file (default)
- specific file (you can enter a search pattern)

![Image of tree](images/Tree2.png)

The files displayed depend on setting `local-history.maxDisplay` to see more, use search-plus icon.

## Settings

        "local-history.daysLimit":  30  // A day number to purge local history. (0: no purge)
        "local-history.maxDisplay": 10  // A max files to display with local history commands
        "local-history.saveDelay":   0  // A delay in seconds to save file in local history. {0: no delay}
        "local-history.dateLocale":     // The locale to use when displaying date (e.g.: "fr-CH" or "en-GB" or ...)

        "local-history.path":     // Specify another location for .history folder (null: use workspaceFolder)
            This settings must be an absolute path.

            You can start your path with:
            ${workspaceFolder}: current workspace folder
                e.g. ${workspaceFolder}/.vscode to save in each workspace folder .vscode/.history
            ${workspaceFolder: index}: specific workspace index
                e.g. workspace folders A, B, C. But save always in A/.history => ${workspaceFolder: 0}

            Your can also use specific variable in path:
            - %variable%: an environnement variable (e.g. %AppData%)
            - ~: the home directory (linux)

        "local-history.absolute": // Save absolute or relative path in local-history.path
            true:  (absolute) // <local-history.path>/.history/<absolutePath>
            false: (relative) // (default) <local-history.path>/.history/<workspaceFolder.basename>/<relativePath>

        "local-history.enabled":
            0: Never     // Possibillity to disabled the extension for some project
            1: Always    // (default) Save also single file with no workspaceFolder ("local-history.path" must be defined)
            2: Workspace // Save only files within workspaceFolder

        "local-history.exclude": // Files or folders to not save
            // (default) ['**/.history/**', '**/.vscode**', '**/node_modules/**', '**/typings/**', '**/out/**']

        "local-history.treeLocation": // Specify a location for tree view
            explorer (default): // Show tree in Explorer item
            localHistory:       // Show tree in a special active bar item

## Commands

    local-history.showAll // Show all history available to select (limited with maxDisplay settings)
    local-history.showCurrent // Show current version (if history version is active)
    local-history.compareToCurrent // compare current version with another version in history
    local-history.compareToActive // compare active file with another version in history
    local-history.compareToPrevious // compare a version in history with its previous version

## Note
When .history folder is stored in workspace, you can add a "files.exclude".
This hides .history folder and avoids some issues. (e.g. csproj extension)<BR>
Thanks to @pabloarista (issue [#13](https://github.com/zabel-xyz/local-history/issues/13))
