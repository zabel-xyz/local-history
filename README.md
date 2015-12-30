## Local History

A visual source code plugin for maintaining local history of files.

Every time you modify a file, a copy of the old contents is kept in the local history.
At any time, you can compare a file with any older version from the history.
It can help you out when you change or delete a file by accident.
The history can also help you out when your workspace has a catastrophic problem.
Each file revision is stored in a separate file (with full path) inside the .history folder of your workspace directory.
e.g., `.history/foo/bar/myFile_20151212205930.ts`

#Settings
    {
        "local-history.daysLimit":  30, // A day number to purge local history. (0: no purge)
        "local-history.maxDisplay": 10, // A max files to display with local history commands
        "local-history.exclude": "{.history,.vscode,**/node_modules,typings}" // Files or folders not to save in local history
    }

#Commands
    local-history.showAll // Show all history available to select (limited with maxDisplay settings)

new in version 0.0.2:

    local-history.showCurrent // Show current version (if history version is active)
    local-history.compareToCurrent // compare current version with another version in history
    local-history.compareToActive // compare active file with another version in history
    local-history.compareToPrevious // compare a version in history with its previous version
