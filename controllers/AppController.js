const path = require("path");
const { app, BrowserWindow, Menu, nativeTheme, shell } = require("electron");
const ModelRepository = require("../models/ModelRepository");
const CopyService = require("../models/CopyService");
const ModelController = require("./ModelController");

class AppController {
  constructor() {
    this.mainWindow = null;
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1420,
      height: 880,
      minWidth: 1100,
      minHeight: 700,
      fullscreen: false,
      resizable: true,
      show: false,
      webPreferences: {
        devTools: true,
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    Menu.setApplicationMenu(null);
    this.mainWindow.setIcon(
      path.join(__dirname, "..", "assets/images/logo.png"),
    );
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const parsed = new URL(url);
        if (
          ["http:", "https:"].includes(parsed.protocol) &&
          parsed.hostname &&
          !parsed.username &&
          !parsed.password
        ) {
          shell
            .openExternal(parsed.href)
            .catch((error) =>
              console.error("Impossible d’ouvrir le lien externe :", error),
            );
        }
      } catch (error) {
        console.error("Lien externe invalide :", error);
      }
      return { action: "deny" };
    });
    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow.maximize();
      this.mainWindow.show();
    });
    this.mainWindow.loadFile(path.join(__dirname, "..", "views/home.html"));
    return this.mainWindow;
  }

  start() {
    const repository = new ModelRepository(path.join(__dirname, "..", "model"));
    const copyService = new CopyService(repository.rootPath);
    new ModelController(
      repository,
      copyService,
      () => this.mainWindow,
    ).register();
    app.whenReady().then(() => {
      this.createWindow();
      nativeTheme.themeSource = "dark";
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
      });
    });
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
  }
}

module.exports = AppController;
