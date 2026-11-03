const { ipcMain, dialog, shell } = require("electron");
const path = require("path");

class ModelController {
  constructor(repository, copyService, getWindow) {
    this.repository = repository;
    this.copyService = copyService;
    this.getWindow = getWindow;
  }

  register() {
    ipcMain.handle("open-model-directory", async () => {
      await this.repository.ensureRoot();
      const error = await shell.openPath(this.repository.rootPath);
      if (error) throw new Error(error);
      return { success: true };
    });
    ipcMain.handle("list-model-json", () => this.repository.listJson());
    ipcMain.handle("list-cached-users", () =>
      this.repository.listCachedUsers(),
    );
    ipcMain.handle("fetch-public-user", (_event, username, refresh) =>
      this.repository.fetchPublicUser(username, refresh),
    );
    ipcMain.handle("list-user-media", (_event, username) =>
      this.repository.listUserMedia(username),
    );
    ipcMain.handle("start-user-media-download", (event, username) =>
      this.repository.downloadUserMedia(username, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send("user-media-progress", progress);
      }),
    );
    ipcMain.on("cancel-user-media-download", () => this.repository.cancelUserMediaDownload());
    ipcMain.handle("delete-cached-user", (_event, username) =>
      this.repository.deleteCachedUser(username),
    );
    ipcMain.handle("get-heic-preview", (_event, relativePath) =>
      this.repository.getHeicPreview(relativePath),
    );
    ipcMain.handle("download-image", async (_event, source) => {
      let suggestedName = "image.jpg";
      try {
        suggestedName = source?.relativePath
          ? path.basename(source.relativePath)
          : path.basename(new URL(String(source?.url || "")).pathname) ||
            suggestedName;
      } catch {
        /* Use a safe generic filename if the source has no usable name. */
      }
      if (
        !suggestedName ||
        suggestedName === "." ||
        suggestedName === ".." ||
        suggestedName.length > 150
      )
        suggestedName = "image.jpg";
      const result = await dialog.showSaveDialog(this.getWindow(), {
        title: "Enregistrer l’image",
        defaultPath: suggestedName,
        filters: [
          {
            name: "Images",
            extensions: [
              "jpg",
              "jpeg",
              "png",
              "gif",
              "webp",
              "heic",
              "heif",
              "avif",
              "bmp",
            ],
          },
        ],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      return this.repository.downloadImage(source, result.filePath);
    });
    ipcMain.handle("delete-model-json", (_event, relativePath) =>
      this.repository.deleteJson(relativePath),
    );
    ipcMain.handle("toggle-pinned-json", (_event, relativePath) =>
      this.repository.togglePinned(relativePath),
    );
    ipcMain.handle("list-pinned-json", () => this.repository.listPinned());
    ipcMain.handle("list-contact-data", () => this.repository.listContacts());
    ipcMain.handle("get-dashboard-stats", () =>
      this.repository.getDashboardStats(),
    );
    ipcMain.handle("get-connection-comparison", () =>
      this.repository.getConnectionComparison(),
    );
    ipcMain.handle("search-model-json", (_event, query) =>
      this.repository.searchJson(query),
    );
    ipcMain.handle("list-model-non-json", () => this.repository.listNonJson());
    ipcMain.handle("delete-model-non-json", (event) =>
      this.repository.deleteNonJson((progress) =>
        event.sender.send("cleanup-progress", progress),
      ),
    );
    ipcMain.handle("select-model-folder", async () => {
      const result = await dialog.showOpenDialog(this.getWindow(), {
        properties: ["openDirectory", "multiSelections"],
      });
      return result.canceled || !result.filePaths.length
        ? { canceled: true }
        : { paths: result.filePaths };
    });
    ipcMain.handle("read-model-json", (_event, relativePath) =>
      this.repository.readJson(relativePath),
    );
    ipcMain.handle("start-copy", (event, sourcePaths) =>
      this.copyService.copy(event.sender, sourcePaths),
    );
    ipcMain.handle("get-directory-size", () => this.repository.getSize());
    ipcMain.on("cancel-copy", () => this.copyService.cancel());
    ipcMain.on("replace-choice", (_event, id, replace) =>
      this.copyService.chooseReplace(id, replace),
    );
  }
}

module.exports = ModelController;
