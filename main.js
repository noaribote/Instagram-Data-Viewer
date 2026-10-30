const { app, BrowserWindow, Menu, globalShortcut, ipcMain, shell, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
let mainWindow;
let activeCopy = null;
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



ipcMain.handle('start-copy', async (event, sourcePaths) => {
    if (activeCopy) return { success: false, error: 'A copy is already running.' };
    if (!Array.isArray(sourcePaths) || !sourcePaths.length) return { success: false, error: 'No valid files to copy.' };

    const job = { cancelled: false, destination: path.resolve(__dirname, 'model'), copiedPaths: [], createdDirectories: new Set() };
    activeCopy = job;
    try {
        event.sender.send('copy-progress', { phase: 'scanning' });
        const files = [];
        for (const sourcePath of sourcePaths) await collectFiles(sourcePath, files);
        if (job.cancelled) { event.sender.send('copy-progress', { phase: 'cancelled' }); return { success: false, cancelled: true }; }
        const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
        await fs.promises.mkdir(job.destination, { recursive: true });
        event.sender.send('copy-progress', { phase: 'copying', totalBytes, copiedBytes: 0, totalFiles: files.length, copiedFiles: 0 });
        let copiedBytes = 0;
        for (let index = 0; index < files.length; index++) {
            if (job.cancelled) break;
            const file = files[index];
            const targetPath = path.join(job.destination, path.basename(file.root), path.relative(file.root, file.path));
            await ensureDirectory(path.dirname(targetPath), job.createdDirectories);
            await fs.promises.copyFile(file.path, targetPath, fs.constants.COPYFILE_EXCL);
            job.copiedPaths.push(targetPath);
            copiedBytes += file.size;
            event.sender.send('copy-progress', { phase: 'copying', totalBytes, copiedBytes, totalFiles: files.length, copiedFiles: index + 1 });
        }
        if (job.cancelled) {
            for (const copiedPath of job.copiedPaths) await fs.promises.rm(copiedPath, { force: true });
            for (const directory of [...job.createdDirectories].sort((a, b) => b.length - a.length)) {
                try { await fs.promises.rmdir(directory); } catch (error) { if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT') throw error; }
            }
            event.sender.send('copy-progress', { phase: 'cancelled' });
            return { success: false, cancelled: true };
        }
        event.sender.send('copy-progress', { phase: 'complete', totalBytes, copiedBytes, totalFiles: files.length, copiedFiles: files.length });
        return { success: true };
    } catch (error) {
        event.sender.send('copy-progress', { phase: 'error', error: error.message });
        return { success: false, error: error.message };
    } finally {
        activeCopy = null;
    }
});

ipcMain.on('cancel-copy', () => { if (activeCopy) activeCopy.cancelled = true; });

async function ensureDirectory(directory, createdDirectories) {
    const missing = [];
    let current = directory;
    while (true) {
        try { await fs.promises.access(current); break; }
        catch (error) {
            if (error.code !== 'ENOENT') throw error;
            missing.push(current);
            const parent = path.dirname(current);
            if (parent === current) break;
            current = parent;
        }
    }
    await fs.promises.mkdir(directory, { recursive: true });
    for (const missingDirectory of missing) createdDirectories.add(missingDirectory);
}

async function collectFiles(sourcePath, files) {
    const stats = await fs.promises.stat(sourcePath);
    if (stats.isFile()) { files.push({ path: sourcePath, root: sourcePath, size: stats.size }); return; }
    if (!stats.isDirectory()) return;
    async function walk(directory) {
        const entries = await fs.promises.readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) await walk(entryPath);
            else if (entry.isFile()) {
                const fileStats = await fs.promises.stat(entryPath);
                files.push({ path: entryPath, root: sourcePath, size: fileStats.size });
            }
        }
    }
    await walk(sourcePath);
}
ipcMain.handle('get-directory-size', async (event, directoryPath) => {
    try {
        const targetPath = path.resolve(__dirname, directoryPath || 'model');
        return await getDirectorySize(targetPath);
    } catch (error) {
        if (error.code === 'ENOENT') return 0;
        throw error;
    }
});












async function getDirectorySize(dirPath) {
    let totalSize = 0;
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            totalSize += await getDirectorySize(fullPath);
        } else if (entry.isFile()) {
            const stats = await fs.promises.stat(fullPath);
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
