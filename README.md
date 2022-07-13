# Local History

A visual source code plugin for maintaining local history of files.

This fork is identical to the latest commit as of 10/06/2022, version 1.8.1, with a small change:
Added a boolean option called **`includeWorkspaceFolders`** . This option allows you to create subfolders inside your main history folder for every workspace folder you have in your project.
For example, say you have this workspace config in your root folder:

```json
{
  "folders": [
    {
      "path": "./"
    },
    {
      "name": "Service 1",
      "path": "./services/service_1"
    },
    {
      "name": "Service 2",
      "path": "./services/service_1"
    }
  ],
  "settings": {
    "local.history.path": "${workspaceFolder: 0}"
  }
}
```

Now let's say you want to keep a single history folder for your entire project, instead of creating a folder inside each workspace, you can set the option **`includeWorkspaceFolders`** to true, which when combined with a specified history directory, will create workspace subfolders inside of your main folder. So it will look like this:

```folder
root
│   my.code-workspace    
┣───services
│   │
│   ┣───service_1
│   │   │   ...
│   │
│   └───service_2
│       │   ...
│   
└───.history
    │   
    ┣───root
    │   │   ...
    │
    ┣───service_1
    │   │   ...
    │
    ┣───service_2
    │    │   ...
    │
```

So it'll be useful if you have lots of workspaces but you want to specify a single directory inside .gitignore or something...