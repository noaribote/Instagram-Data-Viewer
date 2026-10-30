const { ipcMain, dialog, shell } = require('electron');

class ModelController {
    constructor(repository, copyService, getWindow) {
        this.repository = repository;
        this.copyService = copyService;
        this.getWindow = getWindow;
    }

    register() {
        ipcMain.handle('open-model-directory', async () => {
            await this.repository.ensureRoot();
            const error = await shell.openPath(this.repository.rootPath);
            if (error) throw new Error(error);
            return { success: true };
        });
        ipcMain.handle('list-model-json', () => this.repository.listJson());
        ipcMain.handle('list-model-non-json', () => this.repository.listNonJson());
        ipcMain.handle('delete-model-non-json', (event) => this.repository.deleteNonJson((progress) => event.sender.send('cleanup-progress', progress)));
        ipcMain.handle('select-model-folder', async () => {
            const result = await dialog.showOpenDialog(this.getWindow(), { properties: ['openDirectory', 'multiSelections'] });
            return result.canceled || !result.filePaths.length ? { canceled: true } : { paths: result.filePaths };
        });
        ipcMain.handle('read-model-json', (_event, relativePath) => this.repository.readJson(relativePath));
        ipcMain.handle('start-copy', (event, sourcePaths) => this.copyService.copy(event.sender, sourcePaths));
        ipcMain.handle('get-directory-size', () => this.repository.getSize());
        ipcMain.on('cancel-copy', () => this.copyService.cancel());
        ipcMain.on('replace-choice', (_event, id, replace) => this.copyService.chooseReplace(id, replace));
    }
}

module.exports = ModelController;
