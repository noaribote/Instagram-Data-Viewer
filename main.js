const { app, BrowserWindow, Menu, globalShortcut, ipcMain, shell, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 880,
    minWidth: 1420,
    minHeight: 880,
    fullscreen: false,
    resizable: true,
    webPreferences: {
      devTools: true,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
  });
  Menu.setApplicationMenu(null);
  mainWindow.setIcon(path.join(__dirname, 'assets/images/logo.ico'));
  mainWindow.loadFile('views/home.html');
  mainWindow.webContents.openDevTools();
}
ipcMain.on('open-external-link', (event, url) => {
  shell.openExternal(url);
});



ipcMain.handle('copy-folder', async (event, sourceFolder) => {
    console.log('Chemin reçu par MAIN :', sourceFolder);
    if (!sourceFolder) {
        return {
            success: false,
            error: 'Le chemin du dossier est vide.'
        };
    } try {
        const depotPath = path.resolve(
            __dirname,
            'private/clone'
        );
        await fs.promises.mkdir(depotPath, {
            recursive: true
        });
        const stats = await fs.promises.stat(sourceFolder);
        if (!stats.isDirectory()) {
            return {
                success: false,
                error: 'L’élément déposé n’est pas un dossier.'
            };
        }
        await copyFolderContents(
            sourceFolder,
            depotPath
        );
        return {
            success: true,
            message: 'Dossier copié avec succès.'
        };
    } catch (error) {
        console.error('Erreur copie dossier:', error);
        return {
            success: false,
            error: error.message
        };
    }
});












async function copyFolderContents(source, destination) {
    const entries = await fs.promises.readdir(source, {
        withFileTypes: true
    });
    for (const entry of entries) {
        const sourcePath = path.join(
            source,
            entry.name
        );
        const destinationPath = path.join(
            destination,
            entry.name
        );
        if (entry.isDirectory()) {
            await fs.promises.mkdir(destinationPath, { recursive: true });
            await copyFolderContents(sourcePath, destinationPath);
        } else if (entry.isFile()) {
            console.log('Copie :', sourcePath, '>', destinationPath);
            await fs.promises.copyFile(sourcePath, destinationPath);
        }
    }
};
async function getDirectorySize(dirPath) {
    let totalSize = 0;
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            totalSize += await getDirectorySize(fullPath);
        } else if (entry.isFile()) {
            const stats = await fs.stat(fullPath);
            totalSize += stats.size;
        }
    }

    return totalSize;
};














app.whenReady().then(() => {
  createWindow();
  nativeTheme.themeSource = 'dark'
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
