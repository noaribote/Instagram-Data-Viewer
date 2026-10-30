const { app, BrowserWindow, Menu, globalShortcut, ipcMain, shell, nativeTheme } = require('electron');
const fs = require('fs');
const { dialog } = require('electron');
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

ipcMain.handle('open-model-directory', async () => {
    const modelPath = path.resolve(__dirname, 'model');
    await fs.promises.mkdir(modelPath, { recursive: true });
    const error = await shell.openPath(modelPath);
    if (error) throw new Error(error);
    return { success: true };
});

ipcMain.handle('list-model-json', async () => {
    const modelPath = path.resolve(__dirname, 'model');
    await fs.promises.mkdir(modelPath, { recursive: true });
    const jsonFiles = [];
    async function walk(directory) {
        let entries;
        try { entries = await fs.promises.readdir(directory, { withFileTypes: true }); }
        catch (error) { if (error.code === 'ENOENT') return; throw error; }
        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) await walk(fullPath);
            else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
                const relativePath = path.relative(modelPath, fullPath);
                jsonFiles.push({ path: relativePath, label: path.basename(entry.name, path.extname(entry.name)) });
            }
        }
    }
    await walk(modelPath);
    return jsonFiles;
});

async function listModelNonJsonFiles() {
    const modelPath = path.resolve(__dirname, 'model');
    await fs.promises.mkdir(modelPath, { recursive: true });
    const files = [];
    async function walk(directory) {
        let entries;
        try { entries = await fs.promises.readdir(directory, { withFileTypes: true }); }
        catch (error) { if (error.code === 'ENOENT') return; throw error; }
        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) await walk(fullPath);
            else if (entry.isFile() && path.extname(entry.name).toLowerCase() !== '.json') {
                try {
                    files.push({ path: path.relative(modelPath, fullPath), size: (await fs.promises.stat(fullPath)).size });
                } catch (error) { if (error.code !== 'ENOENT') throw error; }
            }
        }
    }
    await walk(modelPath);
    return files;
}

ipcMain.handle('list-model-non-json', listModelNonJsonFiles);
ipcMain.handle('delete-model-non-json', async (event) => {
    const modelPath = path.resolve(__dirname, 'model');
    const files = await listModelNonJsonFiles();
    let deletedCount = 0;
    let freedBytes = 0;
    event.sender.send('cleanup-progress', { phase: 'starting', totalFiles: files.length, deletedFiles: 0 });
    for (const [index, file] of files.entries()) {
        const fullPath = path.resolve(modelPath, file.path);
        if (!fullPath.startsWith(`${modelPath}${path.sep}`)) throw new Error('Chemin de fichier invalide.');
        try {
            await fs.promises.unlink(fullPath);
            deletedCount++;
            freedBytes += file.size;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        event.sender.send('cleanup-progress', {
            phase: 'deleting', totalFiles: files.length, deletedFiles: index + 1,
            freedBytes
        });
    }
    event.sender.send('cleanup-progress', { phase: 'complete', totalFiles: files.length, deletedFiles: files.length, freedBytes });
    return { deletedCount, freedBytes };
});

ipcMain.handle('select-model-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'multiSelections'] });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { paths: result.filePaths };
});

ipcMain.handle('read-model-json', async (_event, relativePath) => {
    if (typeof relativePath !== 'string' || !relativePath.toLowerCase().endsWith('.json')) {
        throw new Error('Nom de fichier JSON invalide.');
    }
    const modelPath = path.resolve(__dirname, 'model');
    const jsonPath = path.resolve(modelPath, relativePath);
    if (!jsonPath.startsWith(`${modelPath}${path.sep}`)) throw new Error('Chemin JSON invalide.');
    const content = await fs.promises.readFile(jsonPath, 'utf8');
    return JSON.parse(content);
});



ipcMain.handle('start-copy', async (event, sourcePaths) => {
    if (activeCopy) return { success: false, error: 'A copy is already running.' };
    if (!Array.isArray(sourcePaths) || !sourcePaths.length) return { success: false, error: 'No valid files to copy.' };

    const job = { cancelled: false, destination: path.resolve(__dirname, 'model'), copiedPaths: [], createdDirectories: new Set(), copiedBytesDelta: 0, replace: false };
    activeCopy = job;
    try {
        event.sender.send('copy-progress', { phase: 'scanning' });
        const files = [];
        for (const sourcePath of sourcePaths) await collectFiles(sourcePath, files);
        if (job.cancelled) { event.sender.send('copy-progress', { phase: 'cancelled' }); return { success: false, cancelled: true }; }
        const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
        const existingPaths = [];
        for (const file of files) {
            const targetPath = getTargetPath(job.destination, file);
            try { await fs.promises.access(targetPath); existingPaths.push(targetPath); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        if (existingPaths.length) {
            const replace = await waitForReplaceChoice(event.sender, existingPaths.length, job);
            if (job.cancelled || !replace) {
                event.sender.send('copy-progress', { phase: 'cancelled' });
                return { success: false, cancelled: true };
            }
            job.replace = true;
        }
        await fs.promises.mkdir(job.destination, { recursive: true });
        const existingSize = await getDirectorySize(job.destination).catch(() => 0);
        event.sender.send('copy-progress', { phase: 'copying', totalBytes, existingSize, copiedBytes: 0, totalFiles: files.length, copiedFiles: 0 });
        let copiedBytes = 0;
        for (let index = 0; index < files.length; index++) {
            if (job.cancelled) break;
            const file = files[index];
            const targetPath = getTargetPath(job.destination, file);
            await ensureDirectory(path.dirname(targetPath), job.createdDirectories);
            const previousStat = job.replace ? await fs.promises.stat(targetPath).catch(() => null) : null;
            await fs.promises.copyFile(file.path, targetPath, job.replace ? 0 : fs.constants.COPYFILE_EXCL);
            job.copiedPaths.push(targetPath);
            job.copiedBytesDelta += file.size - (previousStat?.size || 0);
            job.copiedBytesDelta ??= 0;
            copiedBytes += file.size;
            event.sender.send('copy-progress', { phase: 'copying', totalBytes, existingSize, copiedBytes, copiedBytesDelta: job.copiedBytesDelta, totalFiles: files.length, copiedFiles: index + 1 });
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

ipcMain.on('cancel-copy', () => {
    if (!activeCopy) return;
    activeCopy.cancelled = true;
    activeCopy.resolveReplace?.(false);
});

const replaceWaiters = new Map();
function waitForReplaceChoice(sender, count, job) {
    const requestId = `${Date.now()}-${Math.random()}`;
    return new Promise((resolve) => {
        const finish = (replace) => {
            replaceWaiters.delete(requestId);
            job.resolveReplace = null;
            resolve(replace);
        };
        replaceWaiters.set(requestId, finish);
        job.resolveReplace = finish;
        sender.send('copy-progress', { phase: 'conflict', requestId, count });
    });
}

ipcMain.on('replace-choice', (_event, requestId, replace) => {
    const resolve = replaceWaiters.get(requestId);
    if (!resolve) return;
    resolve(Boolean(replace));
});

function getTargetPath(destination, file) {
    return path.join(destination, path.basename(file.root), path.relative(file.root, file.path));
}

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
