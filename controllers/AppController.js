const path = require('path');
const { app, BrowserWindow, Menu, nativeTheme } = require('electron');
const ModelRepository = require('../models/ModelRepository');
const CopyService = require('../models/CopyService');
const ModelController = require('./ModelController');

class AppController {
    constructor() { this.mainWindow = null; }

    createWindow() {
        this.mainWindow = new BrowserWindow({
            width: 1420, height: 880, minWidth: 1420, minHeight: 880,
            fullscreen: false, resizable: true,
            webPreferences: {
                devTools: true,
                preload: path.join(__dirname, '..', 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false
            }
        });
        Menu.setApplicationMenu(null);
        this.mainWindow.setIcon(path.join(__dirname, '..', 'assets/images/logo.ico'));
        this.mainWindow.loadFile(path.join(__dirname, '..', 'views/home.html'));
        this.mainWindow.webContents.openDevTools();
        return this.mainWindow;
    }

    start() {
        const repository = new ModelRepository(path.join(__dirname, '..', 'model'));
        const copyService = new CopyService(repository.rootPath);
        new ModelController(repository, copyService, () => this.mainWindow).register();
        app.whenReady().then(() => {
            this.createWindow();
            nativeTheme.themeSource = 'dark';
            app.on('activate', () => {
                if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
            });
        });
        app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
    }
}

module.exports = AppController;
