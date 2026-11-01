class ModelViewController {
    constructor(api, view) {
        this.api = api;
        this.view = view;
        this.sizeRefreshInProgress = false;
        this.jsonRefreshInProgress = false;
        this.files = [];
    }

    start() {
        this.refreshSize();
        this.refreshJson();
        window.setInterval(() => this.refreshSize(), 1000);
        window.setInterval(() => this.refreshJson(), 1500);
        this.view.selectFolderButton.addEventListener('click', () => {
            window.dispatchEvent(new Event('select-model-folders'));
        });
    }

    async refreshSize() {
        if (this.sizeRefreshInProgress) return;
        this.sizeRefreshInProgress = true;
        try {
            const files = await this.api.listModelNonJson();
            const bytes = files.reduce((total, file) => total + file.size, 0);
            this.view.updateStorage(bytes, files.length > 0);
        } catch (error) {
            console.error('Impossible de calculer la taille de model :', error);
        } finally {
            this.sizeRefreshInProgress = false;
        }
    }

    async refreshJson() {
        if (this.jsonRefreshInProgress) return;
        this.jsonRefreshInProgress = true;
        try {
            const [files, totalBytes] = await Promise.all([
                this.api.listModelJson(),
                this.api.getDirectorySize('model')
            ]);

            this.files = files;
            this.view.renderJsonFiles(files, totalBytes, (file) => this.selectJson(file));
            window.dispatchEvent(new CustomEvent('model-json-files-refreshed', { detail: { files, totalBytes } }));
        } catch (error) {
            console.error('Impossible de lister les fichiers JSON de model :', error);
        } finally {
            this.jsonRefreshInProgress = false;
        }
    }

    async openJsonPath(path, searchQuery = '') {
        let file = this.files.find((entry) => entry.path === path || entry.paths?.includes(path));
        if (!file) {
            this.files = await this.api.listModelJson();
            file = this.files.find((entry) => entry.path === path || entry.paths?.includes(path));
        }
        return this.selectJson(file || { path, label: path.split(/[\\/]/).pop() }, searchQuery);
    }

    async selectJson(file, searchQuery = '') {
        window.dispatchEvent(new Event('dashboard-search-reset'));

        try {
            const paths = file.paths || [file.path];
            const documents = await Promise.all(paths.map((path) => this.api.readModelJson(path)));
            let data = documents[0];

            if (file.messageGroup) {
                const messages = documents
                    .flatMap((document) => Array.isArray(document.messages) ? document.messages : [])
                    .map((message) => {
                        if (typeof message.content === 'string' && message.content.trim()) {
                            return message;
                        }

                        const parts = [];

                        if (message.audio_files?.length) parts.push('Message vocal');
                        if (message.photos?.length) {
                            parts.push(message.photos.length > 1 ? `${message.photos.length} photos` : 'Photo');
                        }
                        if (message.videos?.length) {
                            parts.push(message.videos.length > 1 ? `${message.videos.length} vidéos` : 'Vidéo');
                        }
                        if (message.share?.link) parts.push(`Lien partagé : ${message.share.link}`);
                        if (message.reactions?.length) {
                            const reactions = message.reactions
                                .map((item) => item.reaction)
                                .filter(Boolean)
                                .join(' ');
                            parts.push(`Réaction : ${reactions}`);
                        }
                        if (message.gifs?.length) parts.push('GIF');
                        if (message.sticker) parts.push('Autocollant');
                        if (message.call_duration) parts.push('Appel');

                        return {
                            ...message,
                            content: parts.join(' · ') || 'Contenu textuel indisponible'
                        };
                    });

                messages.sort((a, b) => Number(a.timestamp_ms || 0) - Number(b.timestamp_ms || 0));
                data = { ...data, messages };
            }

            window.dispatchEvent(new CustomEvent('model-json-selected', {
                detail: { path: file.path, label: file.label, data, searchQuery }
            }));
        } catch (error) {
            console.error(`Impossible de lire ${file.path} :`, error);
        }
    }
}

window.ModelViewController = ModelViewController;
