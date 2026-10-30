const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getDirectorySize: (directoryPath) => ipcRenderer.invoke('get-directory-size', directoryPath),
    listModelJson: () => ipcRenderer.invoke('list-model-json'),
    selectModelFolder: () => ipcRenderer.invoke('select-model-folder'),
    startCopyPaths: (paths) => ipcRenderer.invoke('start-copy', paths),
    readModelJson: (relativePath) => ipcRenderer.invoke('read-model-json', relativePath),
    startCopy: (files) => {
        const filePaths = files.map((file) => webUtils.getPathForFile(file)).filter(Boolean);
        return ipcRenderer.invoke('start-copy', filePaths);
    },
    cancelCopy: () => ipcRenderer.send('cancel-copy'),
    chooseReplace: (requestId, replace) => ipcRenderer.send('replace-choice', requestId, replace),
    onCopyProgress: (callback) => {
        const listener = (_event, progress) => callback(progress);
        ipcRenderer.on('copy-progress', listener);
        return () => ipcRenderer.removeListener('copy-progress', listener);
    },

    openDirectory: () => ipcRenderer.invoke('open-model-directory')
});

