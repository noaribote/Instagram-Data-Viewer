class ImportViewController {
    constructor(api, view, modelController) {
        this.api = api;
        this.view = view;
        this.modelController = modelController;
        this.startedAt = 0;
        this.finished = false;
        this.cancelled = false;
        this.closeAfterCancel = false;
        this.replaceRequestId = null;
    }

    start() {
        this.view.dropTarget.addEventListener('dragover', (event) => {
            event.preventDefault(); event.stopPropagation(); this.view.dropTarget.classList.add('drag-over');
        });
        this.view.dropTarget.addEventListener('dragleave', (event) => {
            event.preventDefault(); event.stopPropagation(); this.view.dropTarget.classList.remove('drag-over');
        });
        this.view.dropTarget.addEventListener('drop', (event) => {
            event.preventDefault(); event.stopPropagation(); this.view.dropTarget.classList.remove('drag-over');
            const files = [...event.dataTransfer.files];
            if (files.length) this.copy(files, true);
        });
        this.view.dropTarget.addEventListener('click', () => this.selectFolders());
        document.getElementById('select-model-folder').addEventListener('click', () => this.selectFolders());
        document.getElementById('replace-yes').addEventListener('click', () => this.answerReplace(true));
        document.getElementById('replace-no').addEventListener('click', () => this.answerReplace(false));
        this.view.cancelButton.addEventListener('click', () => this.cancel());
        this.api.onCopyProgress((progress) => this.onProgress(progress));
        document.getElementById('directory-open').addEventListener('click', (event) => {
            event.preventDefault();
            this.api.openDirectory().catch((error) => console.error('Impossible d’ouvrir le dossier model :', error));
        });
    }

    async selectFolders() {
        try {
            const result = await this.api.selectModelFolder();
            if (result.paths?.length) await this.copy(result.paths);
        } catch (error) { console.error('Impossible de sélectionner les dossiers :', error); }
    }

    async copy(paths, areFiles = false) {
        if (!paths.length) return;
        this.startedAt = Date.now();
        this.finished = this.cancelled = this.closeAfterCancel = false;
        this.view.show();
        try {
            const result = areFiles ? await this.api.startCopy(paths) : await this.api.startCopyPaths(paths);
            if (!result.success && !result.cancelled) { this.finished = true; this.view.update({ phase: 'error', error: result.error }); this.view.cancelButton.textContent = 'Fermer'; }
        } catch (error) { this.finished = true; this.view.update({ phase: 'error', error: error.message }); this.view.cancelButton.textContent = 'Fermer'; }
    }

    onProgress(progress) {
        this.view.update(progress, (Date.now() - this.startedAt) / 1000);
        if (progress.phase === 'conflict') this.replaceRequestId = progress.requestId;
        if (progress.phase === 'complete') {
            this.finished = true;
            this.modelController.refreshSize(); this.modelController.refreshJson();
            window.setTimeout(() => { if (this.finished && !this.cancelled) this.view.modal.hidden = true; }, 700);
        } else if (progress.phase === 'cancelled') {
            this.finished = true;
            this.modelController.refreshSize();
            if (this.closeAfterCancel || this.cancelled) this.view.modal.hidden = true;
            else this.view.cancelButton.textContent = 'Fermer';
        } else if (progress.phase === 'error') {
            this.finished = true;
            this.view.cancelButton.textContent = 'Fermer';
        }
    }

    answerReplace(replace) {
        if (!this.replaceRequestId) return;
        this.api.chooseReplace(this.replaceRequestId, replace);
        this.replaceRequestId = null;
        this.view.replacePrompt.hidden = true;
        this.view.replaceActions.hidden = true;
        this.view.estimate.hidden = this.view.progress.hidden = this.view.status.hidden = false;
        this.view.cancelButton.hidden = false;
        if (!replace) { this.cancelled = true; this.view.status.textContent = 'Annulation de la copie…'; }
    }

    cancel() {
        if (this.finished) { this.view.modal.hidden = true; return; }
        this.closeAfterCancel = this.cancelled = true;
        this.view.cancelButton.hidden = true;
        this.view.status.textContent = 'Annulation de la copie…';
        this.api.cancelCopy();
    }
}

window.ImportViewController = ImportViewController;
