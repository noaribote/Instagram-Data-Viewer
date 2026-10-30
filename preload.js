const { contextBridge, ipcRenderer, webUtils, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getDirectorySize: (directoryPath) => ipcRenderer.invoke('get-directory-size', directoryPath),
    startCopy: (files) => {
        const filePaths = files.map((file) => webUtils.getPathForFile(file)).filter(Boolean);
        return ipcRenderer.invoke('start-copy', filePaths);
    },
    cancelCopy: () => ipcRenderer.send('cancel-copy'),
    onCopyProgress: (callback) => {
        const listener = (_event, progress) => callback(progress);
        ipcRenderer.on('copy-progress', listener);
        return () => ipcRenderer.removeListener('copy-progress', listener);
    },

    openDirectory: (path) => {
      shell.openPath(path).then((err) => {
        if (err) console.error(err);
      });
    }
});

