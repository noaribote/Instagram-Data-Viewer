const dropTarget = document.getElementById('drop-target');
const directoryOpen = document.getElementById('directory-open');
const copyModal = document.getElementById('copy-modal');
const copyEstimate = document.getElementById('copy-estimate');
const copyProgress = document.getElementById('copy-progress');
const copyStatus = document.getElementById('copy-status');
const cancelCopyButton = document.getElementById('cancel-copy');
let copyStartedAt = 0;
let closeModalAfterCancel = false;
let copyFinished = false;
let cancellationRequested = false;

if (window.electronAPI?.getDirectorySize) {
    window.electronAPI.getDirectorySize('model').catch(console.error);
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

    copyStartedAt = Date.now();
    closeModalAfterCancel = false;
    copyFinished = false;
    cancellationRequested = false;
    copyModal.hidden = false;
    copyProgress.value = 0;
    copyStatus.textContent = 'Analyse des fichiers…';
    copyEstimate.textContent = 'Estimation de la taille et de la durée…';
    cancelCopyButton.disabled = false;
    cancelCopyButton.textContent = 'Annuler';
    cancelCopyButton.hidden = false;
    const result = await window.electronAPI.startCopy(files);
    if (!result.success && !result.cancelled) {
        copyStatus.textContent = `Erreur : ${result.error}`;
        copyFinished = true;
        cancelCopyButton.textContent = 'Fermer';
    }
});

window.electronAPI.onCopyProgress((progress) => {
    if (progress.phase === 'scanning') {
        copyStatus.textContent = 'Analyse des fichiers en cours…';
        copyEstimate.textContent = 'Calcul du volume total…';
    } else if (progress.phase === 'copying') {
        const percent = progress.totalBytes ? Math.min(100, progress.copiedBytes / progress.totalBytes * 100) : 100;
        copyProgress.value = percent;
        const elapsed = (Date.now() - copyStartedAt) / 1000;
        const speed = progress.copiedBytes / Math.max(elapsed, 0.25);
        const remaining = speed > 0 ? (progress.totalBytes - progress.copiedBytes) / speed : 0;
        copyEstimate.textContent = `${formatBytes(progress.totalBytes)} au total · durée estimée : ${formatDuration(progress.totalBytes / Math.max(speed, 1))}`;
        copyStatus.textContent = `${formatBytes(progress.copiedBytes)} copiés sur ${formatBytes(progress.totalBytes)} · ${formatDuration(remaining)} restantes`;
    } else if (progress.phase === 'complete') {
        copyProgress.value = 100;
        copyEstimate.textContent = `${formatBytes(progress.totalBytes)} copiés.`;
        copyStatus.textContent = `Copie terminée : ${progress.totalFiles} fichier(s).`;
        copyFinished = true;
        cancelCopyButton.textContent = 'Fermer';
    } else if (progress.phase === 'cancelled') {
        copyStatus.textContent = 'Copie annulée et fichiers copiés supprimés.';
        copyFinished = true;
        if (closeModalAfterCancel || cancellationRequested) copyModal.hidden = true;
        else cancelCopyButton.textContent = 'Fermer';
    } else if (progress.phase === 'error') {
        copyStatus.textContent = `Erreur : ${progress.error}`;
        copyFinished = true;
        cancelCopyButton.textContent = 'Fermer';
    }
});

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
    window.electronAPI.openDirectory(directoryOpen.dataset.path);
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