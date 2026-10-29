const { contextBridge, ipcRenderer, webUtils, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    copyFolder: (file) => {
        const filePath = webUtils.getPathForFile(file);
        return ipcRenderer.invoke('copy-folder', filePath);
    },

    openDirectory: (path) => {
      shell.openPath(path).then((err) => {
        if (err) console.error(err);
      });
    }
});

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }
  for (const type of ['chrome', 'node', 'electron']) { replaceText(`${type}-version`, process.versions[type]) }


  window.electronAPI.getDirectorySize('./private/clone')
      .then(size => console.log(size))
      .catch(console.error);
});
