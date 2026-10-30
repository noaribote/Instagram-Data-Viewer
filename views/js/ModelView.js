class ModelView {
    constructor() {
        this.jsonContainer = document.getElementById('divContentJSON');
        this.selectFolderButton = document.getElementById('select-model-folder');
        this.sizeDisplay = document.getElementById('qteGO');
        this.freeSpaceButton = document.getElementById('libEspace');
        this.jsonFileCount = document.getElementById('json-file-count');
    }

    renderJsonFiles(files, onSelect) {
        this.jsonFileCount.textContent = `${files.length} fichier${files.length > 1 ? 's' : ''} de données`;
        this.jsonContainer.querySelectorAll('button[data-json-path]').forEach((button) => button.remove());
        this.selectFolderButton.hidden = files.length > 0;
        for (const file of files) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.jsonPath = file.path;
            button.title = file.path;
            button.innerHTML = '<i class="fa-solid fa-database"></i>';
            button.append(document.createTextNode(file.label.length > 18 ? `${file.label.slice(0, 15)}...` : file.label));
            button.addEventListener('click', () => onSelect(file));
            this.jsonContainer.append(button);
        }
    }

    updateStorage(bytes, enabled) {
        this.sizeDisplay.textContent = window.AppDom.formatGigabytes(bytes);
        this.freeSpaceButton.disabled = !enabled;
    }
}

window.ModelView = ModelView;
