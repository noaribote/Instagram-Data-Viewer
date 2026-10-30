class ModelViewController {
    constructor(api, view) {
        this.api = api;
        this.view = view;
        this.sizeRefreshInProgress = false;
        this.jsonRefreshInProgress = false;
    }

    start() {
        this.refreshSize();
        this.refreshJson();
        window.setInterval(() => this.refreshSize(), 1000);
        window.setInterval(() => this.refreshJson(), 1500);
        this.view.selectFolderButton.addEventListener('click', () => window.dispatchEvent(new Event('select-model-folders')));
    }

    async refreshSize() {
        if (this.sizeRefreshInProgress) return;
        this.sizeRefreshInProgress = true;
        try {
            const [bytes, files] = await Promise.all([this.api.getDirectorySize('model'), this.api.listModelNonJson()]);
            this.view.updateStorage(bytes, bytes > 0 && files.length > 0);
        } catch (error) { console.error('Impossible de calculer la taille de model :', error); }
        finally { this.sizeRefreshInProgress = false; }
    }

    async refreshJson() {
        if (this.jsonRefreshInProgress) return;
        this.jsonRefreshInProgress = true;
        try {
            this.view.renderJsonFiles(await this.api.listModelJson(), (file) => this.selectJson(file));
        } catch (error) { console.error('Impossible de lister les fichiers JSON de model :', error); }
        finally { this.jsonRefreshInProgress = false; }
    }

    async selectJson(file) {
        try {
            const data = await this.api.readModelJson(file.path);
            window.dispatchEvent(new CustomEvent('model-json-selected', { detail: { path: file.path, data } }));
        } catch (error) { console.error(`Impossible de lire ${file.path} :`, error); }
    }
}

window.ModelViewController = ModelViewController;
