const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getDirectorySize: (directoryPath) =>
    ipcRenderer.invoke("get-directory-size", directoryPath),
  listModelJson: () => ipcRenderer.invoke("list-model-json"),
  listCachedUsers: () => ipcRenderer.invoke("list-cached-users"),
  fetchPublicUser: (username, refresh = false) =>
    ipcRenderer.invoke("fetch-public-user", username, refresh),
  deleteCachedUser: (username) =>
    ipcRenderer.invoke("delete-cached-user", username),
  getHeicPreview: (relativePath) =>
    ipcRenderer.invoke("get-heic-preview", relativePath),
  downloadImage: (source) => ipcRenderer.invoke("download-image", source),
  deleteModelJson: (relativePath) =>
    ipcRenderer.invoke("delete-model-json", relativePath),
  togglePinnedJson: (relativePath) =>
    ipcRenderer.invoke("toggle-pinned-json", relativePath),
  listPinnedJson: () => ipcRenderer.invoke("list-pinned-json"),
  listContactData: () => ipcRenderer.invoke("list-contact-data"),
  getDashboardStats: () => ipcRenderer.invoke("get-dashboard-stats"),
  getConnectionComparison: () =>
    ipcRenderer.invoke("get-connection-comparison"),
  searchModelJson: (query) => ipcRenderer.invoke("search-model-json", query),
  listModelNonJson: () => ipcRenderer.invoke("list-model-non-json"),
  deleteModelNonJson: () => ipcRenderer.invoke("delete-model-non-json"),
  onCleanupProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("cleanup-progress", listener);
    return () => ipcRenderer.removeListener("cleanup-progress", listener);
  },
  selectModelFolder: () => ipcRenderer.invoke("select-model-folder"),
  startCopyPaths: (paths) => ipcRenderer.invoke("start-copy", paths),
  readModelJson: (relativePath) =>
    ipcRenderer.invoke("read-model-json", relativePath),
  startCopy: (files) => {
    const filePaths = files
      .map((file) => webUtils.getPathForFile(file))
      .filter(Boolean);
    return ipcRenderer.invoke("start-copy", filePaths);
  },
  cancelCopy: () => ipcRenderer.send("cancel-copy"),
  chooseReplace: (requestId, replace) =>
    ipcRenderer.send("replace-choice", requestId, replace),
  onCopyProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("copy-progress", listener);
    return () => ipcRenderer.removeListener("copy-progress", listener);
  },

  openDirectory: () => ipcRenderer.invoke("open-model-directory"),
});
