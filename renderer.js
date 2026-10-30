const dropTarget = document.getElementById('drop-target');
const directoryOpen = document.getElementById('directory-open');
const copyModal = document.getElementById('copy-modal');
const copyEstimate = document.getElementById('copy-estimate');
const copyProgress = document.getElementById('copy-progress');
const copyStatus = document.getElementById('copy-status');
const cancelCopyButton = document.getElementById('cancel-copy');
const modelSizeDisplay = document.getElementById('qteGO');
const freeSpaceButton = document.getElementById('libEspace');
const cleanupPrompt = document.getElementById('cleanup-prompt');
const cleanupMessage = document.getElementById('cleanup-message');
const cleanupProgress = document.getElementById('cleanup-progress');
const cleanupStatus = document.getElementById('cleanup-status');
const cleanupYesButton = document.getElementById('cleanup-yes');
const cleanupNoButton = document.getElementById('cleanup-no');
const jsonContainer = document.getElementById('divContentJSON');
const selectModelFolderButton = document.getElementById('select-model-folder');
const replacePrompt = document.getElementById('replace-prompt');
const replaceActions = document.getElementById('replace-actions');
const replaceYesButton = document.getElementById('replace-yes');
const replaceNoButton = document.getElementById('replace-no');
let copyStartedAt = 0;
let closeModalAfterCancel = false;
let copyFinished = false;
let cancellationRequested = false;
let currentReplaceRequestId = null;
let modelSizeRefreshInProgress = false;
let jsonRefreshInProgress = false;
let cleanupInProgress = false;

if (window.electronAPI?.getDirectorySize) {
    refreshModelSize();
    window.setInterval(refreshModelSize, 1000);
    refreshJSONButtons();
    window.setInterval(refreshJSONButtons, 1500);
}

dropTarget.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropTarget.classList.add('drag-over');
});
dropTarget.addEventListener('dragleave', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropTarget.classList.remove('drag-over');
});
dropTarget.addEventListener('drop', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropTarget.classList.remove('drag-over');
    const files = [...event.dataTransfer.files];
    if (!files.length) return;

    startCopy(files, true);
});

dropTarget.addEventListener('click', () => {
    selectAndCopyModelFolders();
});

async function selectAndCopyModelFolders() {
    try {
        const result = await window.electronAPI.selectModelFolder();
        if (result.paths?.length) await startCopy(result.paths);
    } catch (error) {
        console.error('Impossible de sélectionner les dossiers :', error);
    }
}

async function startCopy(paths, areFiles = false) {
    if (!paths.length) return;
    copyStartedAt = Date.now();
    closeModalAfterCancel = false;
    copyFinished = false;
    cancellationRequested = false;
    copyModal.hidden = false;
    replacePrompt.hidden = true;
    replaceActions.hidden = true;
    copyEstimate.hidden = false;
    copyProgress.hidden = false;
    copyStatus.hidden = false;
    copyProgress.value = 0;
    copyStatus.textContent = 'Analyse des fichiers…';
    copyEstimate.textContent = 'Estimation de la taille et de la durée…';
    cancelCopyButton.disabled = false;
    cancelCopyButton.textContent = 'Annuler';
    cancelCopyButton.hidden = false;
    try {
        const result = areFiles
            ? await window.electronAPI.startCopy(paths)
            : await window.electronAPI.startCopyPaths(paths);
        if (!result.success && !result.cancelled) {
            copyStatus.textContent = `Erreur : ${result.error}`;
            copyFinished = true;
            cancelCopyButton.textContent = 'Fermer';
        }
    } catch (error) {
        copyStatus.textContent = `Erreur : ${error.message}`;
        copyFinished = true;
        cancelCopyButton.textContent = 'Fermer';
    }
}

window.electronAPI.onCopyProgress((progress) => {
    if (progress.phase === 'scanning') {
        copyStatus.textContent = 'Analyse des fichiers en cours…';
        copyEstimate.textContent = 'Calcul du volume total…';
    } else if (progress.phase === 'conflict') {
        currentReplaceRequestId = progress.requestId;
        copyEstimate.hidden = true;
        copyProgress.hidden = true;
        copyStatus.hidden = true;
        replacePrompt.textContent = `Les fichiers existent déjà (${progress.count}) : voulez-vous les remplacer ?`;
        replacePrompt.hidden = false;
        replaceActions.hidden = false;
        cancelCopyButton.hidden = true;
    } else if (progress.phase === 'copying') {
        const percent = progress.totalBytes ? Math.min(100, progress.copiedBytes / progress.totalBytes * 100) : 100;
        copyProgress.value = percent;
        modelSizeDisplay.textContent = formatGigabytes((progress.existingSize || 0) + (progress.copiedBytesDelta || 0));
        const elapsed = (Date.now() - copyStartedAt) / 1000;
        const speed = progress.copiedBytes / Math.max(elapsed, 0.25);
        const remaining = speed > 0 ? (progress.totalBytes - progress.copiedBytes) / speed : 0;
        copyEstimate.textContent = `${formatBytes(progress.totalBytes)} au total`;
        copyStatus.textContent = `${formatBytes(progress.copiedBytes)} copiés sur ${formatBytes(progress.totalBytes)} · ${formatDuration(remaining)} restantes`;
    } else if (progress.phase === 'complete') {
        copyProgress.value = 100;
        copyEstimate.textContent = `${formatBytes(progress.totalBytes)} copiés.`;
        copyStatus.textContent = `Copie terminée : ${progress.totalFiles} fichier(s).`;
        copyFinished = true;
        refreshModelSize();
        refreshJSONButtons();
        window.setTimeout(() => {
            if (copyFinished && !cancellationRequested) copyModal.hidden = true;
        }, 700);
    } else if (progress.phase === 'cancelled') {
        copyStatus.textContent = 'Copie annulée et fichiers copiés supprimés.';
        copyFinished = true;
        refreshModelSize();
        if (closeModalAfterCancel || cancellationRequested) copyModal.hidden = true;
        else cancelCopyButton.textContent = 'Fermer';
    } else if (progress.phase === 'error') {
        copyStatus.textContent = `Erreur : ${progress.error}`;
        copyFinished = true;
        cancelCopyButton.textContent = 'Fermer';
    }
});

window.electronAPI.onCleanupProgress((progress) => {
    if (progress.phase === 'starting') {
        cleanupProgress.max = Math.max(progress.totalFiles, 1);
        cleanupProgress.value = 0;
        cleanupProgress.hidden = false;
        cleanupStatus.hidden = false;
        cleanupStatus.textContent = `Suppression de 0 sur ${progress.totalFiles} fichier(s)…`;
    } else if (progress.phase === 'deleting') {
        cleanupProgress.max = Math.max(progress.totalFiles, 1);
        cleanupProgress.value = progress.deletedFiles;
        cleanupStatus.textContent = `Suppression de ${progress.deletedFiles} sur ${progress.totalFiles} fichier(s)…`;
    } else if (progress.phase === 'complete') {
        cleanupProgress.value = cleanupProgress.max;
        cleanupStatus.textContent = `${progress.totalFiles} fichier(s) supprimé(s).`;
    }
});

async function refreshModelSize() {
    if (modelSizeRefreshInProgress) return;
    modelSizeRefreshInProgress = true;
    try {
        const bytes = await window.electronAPI.getDirectorySize('model');
        modelSizeDisplay.textContent = formatGigabytes(bytes);
        const files = await window.electronAPI.listModelNonJson();
        freeSpaceButton.disabled = !(bytes > 0 && files.length > 0);
    } catch (error) {
        console.error('Impossible de calculer la taille de model :', error);
    } finally {
        modelSizeRefreshInProgress = false;
    }
}

freeSpaceButton.addEventListener('click', async () => {
    if (freeSpaceButton.disabled) return;
    try {
        const files = await window.electronAPI.listModelNonJson();
        if (!files.length) {
            freeSpaceButton.disabled = true;
            return;
        }
        const totalBytes = files.reduce((total, file) => total + file.size, 0);
        cleanupMessage.textContent = `Supprimer ${files.length} média(s) et libérer ${formatBytes(totalBytes)} ?`;
        cleanupPrompt.hidden = false;
    } catch (error) {
        console.error('Impossible de vérifier les fichiers à supprimer :', error);
    }
});

cleanupNoButton.addEventListener('click', () => {
    cleanupPrompt.hidden = true;
    cleanupYesButton.hidden = false;
    cleanupYesButton.disabled = false;
    cleanupNoButton.textContent = 'Annuler';
});
cleanupYesButton.addEventListener('click', async () => {
    if (cleanupInProgress) return;
    cleanupInProgress = true;
    cleanupYesButton.disabled = true;
    cleanupNoButton.disabled = true;
    cleanupMessage.textContent = 'Préparation de la suppression…';
    cleanupProgress.hidden = false;
    cleanupProgress.max = 1;
    cleanupProgress.value = 0;
    cleanupStatus.hidden = false;
    cleanupStatus.textContent = 'Préparation…';
    try {
        const result = await window.electronAPI.deleteModelNonJson();
        await refreshModelSize();
        await refreshJSONButtons();
        cleanupStatus.textContent = `${result.deletedCount} fichier(s) supprimé(s), ${formatBytes(result.freedBytes)} libérés.`;
        window.setTimeout(() => { cleanupPrompt.hidden = true; }, 700);
    } catch (error) {
        cleanupMessage.textContent = `Erreur : ${error.message}`;
        cleanupStatus.hidden = true;
        cleanupProgress.hidden = true;
        cleanupYesButton.hidden = true;
        cleanupNoButton.textContent = 'Fermer';
    } finally {
        cleanupYesButton.disabled = false;
        cleanupNoButton.disabled = false;
        cleanupInProgress = false;
    }
});

function formatGigabytes(bytes) {
    const gigabytes = bytes / (1024 ** 3);
    if (gigabytes < 0.10) {
        return `${(bytes / (1024 ** 2)).toFixed(2).replace('.', ',')} Mo`;
    }
    return `${gigabytes.toFixed(2).replace('.', ',')} Go`;
}

function answerReplacePrompt(replace) {
    if (!currentReplaceRequestId) return;
    window.electronAPI.chooseReplace(currentReplaceRequestId, replace);
    currentReplaceRequestId = null;
    replacePrompt.hidden = true;
    replaceActions.hidden = true;
    copyEstimate.hidden = false;
    copyProgress.hidden = false;
    copyStatus.hidden = false;
    cancelCopyButton.hidden = false;
    if (!replace) {
        cancellationRequested = true;
        copyStatus.textContent = 'Annulation de la copie…';
    }
}

replaceYesButton.addEventListener('click', () => answerReplacePrompt(true));
replaceNoButton.addEventListener('click', () => answerReplacePrompt(false));

selectModelFolderButton.addEventListener('click', async () => {
    await selectAndCopyModelFolders();
});

async function refreshJSONButtons() {
    if (jsonRefreshInProgress) return;
    jsonRefreshInProgress = true;
    try {
        const files = await window.electronAPI.listModelJson();
        jsonContainer.querySelectorAll('button[data-json-path]').forEach((button) => button.remove());
        selectModelFolderButton.hidden = files.length > 0;
        for (const file of files) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.jsonPath = file.path;
            button.title = file.path;
            button.innerHTML = '<i class="fa-solid fa-database"></i>';
            const visibleLabel = file.label.length > 18 ? `${file.label.slice(0, 15)}...` : file.label;
            button.append(document.createTextNode(visibleLabel));
            button.addEventListener('click', async () => {
                try {
                    const data = await window.electronAPI.readModelJson(file.path);
                    window.dispatchEvent(new CustomEvent('model-json-selected', { detail: { path: file.path, data } }));
                } catch (error) {
                    console.error(`Impossible de lire ${file.path} :`, error);
                }
            });
            jsonContainer.append(button);
        }
    } catch (error) {
        console.error('Impossible de lister les fichiers JSON de model :', error);
    } finally {
        jsonRefreshInProgress = false;
    }
}

cancelCopyButton.addEventListener('click', () => {
    if (copyFinished) {
        copyModal.hidden = true;
        return;
    }
    closeModalAfterCancel = true;
    cancellationRequested = true;
    cancelCopyButton.hidden = true;
    copyStatus.textContent = 'Annulation de la copie…';
    window.electronAPI.cancelCopy();
});

directoryOpen.addEventListener('click', (event) => {
    event.preventDefault();
    window.electronAPI.openDirectory().catch((error) => {
        console.error('Impossible d’ouvrir le dossier model :', error);
    });
});

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} o`;
    const units = ['Ko', 'Mo', 'Go', 'To'];
    let size = bytes / 1024;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
    return `${size.toFixed(1)} ${units[unit]}`;
}

function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return 'calcul en cours';
    const value = Math.max(0, Math.ceil(seconds));
    if (value < 60) return `${value} s`;
    if (value < 3600) return `${Math.floor(value / 60)} min ${value % 60} s`;
    return `${Math.floor(value / 3600)} h ${Math.floor(value % 3600 / 60)} min`;
}
