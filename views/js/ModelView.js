class ModelView {
    constructor() {
        this.jsonContainer = document.getElementById('divContentJSON');
        this.dashboard = document.getElementById('dashboard-view');
        this.selectFolderButton = document.getElementById('select-model-folder');
        this.sizeDisplay = document.getElementById('qteGO');
        this.freeSpaceButton = document.getElementById('libEspace');
        this.jsonFileCount = document.getElementById('json-file-count');
        this.contentFrame = document.getElementById('json-view');
        this.dropTarget = document.getElementById('drop-target');
        this.homeButton = document.getElementById('home-button');
        this.dashboardButton = document.getElementById('dashboard-button');
        this.pendingSelection = null;
        this.contentFrame.addEventListener('load', () => {
            if (this.pendingSelection) this.contentFrame.contentWindow.postMessage(this.pendingSelection, '*');
        });
        this.homeButton.addEventListener('click', () => this.showHome());
        this.dashboardButton.addEventListener('click', () => this.showHome());
        window.addEventListener('model-json-selected', (event) => this.showJson(event.detail));
    }

    renderJsonFiles(files, bytes, onSelect) {
        this.jsonFileCount.textContent = files.length + ' fichier' + (files.length > 1 ? 's' : '') + ' de donn\u00e9es (' + window.AppDom.formatBytes(bytes) + ')';
        this.jsonContainer.querySelectorAll('button[data-json-path]').forEach((button) => button.remove());
        this.selectFolderButton.hidden = files.length > 0;
        for (const file of files) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.jsonPath = file.path;
            button.title = file.path;
            button.innerHTML = '<i class="fa-solid fa-database"></i>';
            const prefix = 'Messages avec ';
            const buttonLabel = file.label.startsWith(prefix) && file.label.length > 28
                ? `${prefix}${file.label.slice(prefix.length, 25)}...`
                : file.label.length > 28 ? `${file.label.slice(0, 25)}...` : file.label;
            button.append(document.createTextNode(buttonLabel));
            button.addEventListener('click', () => onSelect(file));
            this.jsonContainer.append(button);
        }
    }

    updateStorage(bytes, enabled) {
        this.sizeDisplay.textContent = window.AppDom.formatGigabytes(bytes);
        this.freeSpaceButton.disabled = !enabled;
    }

    showJson(selection) {
        this.pendingSelection = { type: 'instagram-json', path: selection.path, label: selection.label, data: selection.data, searchQuery: selection.searchQuery };
        this.dashboard.hidden = true;
        this.contentFrame.hidden = false;
        this.contentFrame.contentWindow.postMessage(this.pendingSelection, '*');
    }

    showHome() {
        window.dispatchEvent(new Event('dashboard-search-reset'));
        this.pendingSelection = null;
        this.contentFrame.hidden = true;
        this.dashboard.hidden = false;
    }
}

window.ModelView = ModelView;
