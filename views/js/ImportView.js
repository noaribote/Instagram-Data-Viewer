class ImportView {
  constructor() {
    this.dropTarget = document.getElementById("drop-target");
    this.modal = document.getElementById("copy-modal");
    this.estimate = document.getElementById("copy-estimate");
    this.progress = document.getElementById("copy-progress");
    this.status = document.getElementById("copy-status");
    this.cancelButton = document.getElementById("cancel-copy");
    this.replacePrompt = document.getElementById("replace-prompt");
    this.replaceActions = document.getElementById("replace-actions");
  }

  show() {
    this.modal.hidden = false;
    this.replacePrompt.hidden = true;
    this.replaceActions.hidden = true;
    this.estimate.hidden = false;
    this.progress.hidden = false;
    this.status.hidden = false;
    this.progress.value = 0;
    this.status.textContent = "Analyse des fichiers…";
    this.estimate.textContent = "Estimation de la taille et de la durée…";
    this.cancelButton.disabled = false;
    this.cancelButton.textContent = "Annuler";
    this.cancelButton.hidden = false;
  }

  update(progress, elapsedSeconds) {
    if (progress.phase === "scanning") {
      this.status.textContent = "Analyse des fichiers en cours…";
      this.estimate.textContent = "Calcul du volume total…";
    } else if (progress.phase === "conflict") {
      this.estimate.hidden = this.progress.hidden = this.status.hidden = true;
      this.replacePrompt.textContent = `Les fichiers existent déjà (${progress.count}) : voulez-vous les remplacer ?`;
      this.replacePrompt.hidden = false;
      this.replaceActions.hidden = false;
      this.cancelButton.hidden = true;
    } else if (progress.phase === "copying") {
      this.progress.value = progress.totalBytes
        ? Math.min(100, (progress.copiedBytes / progress.totalBytes) * 100)
        : 100;
      const speed = progress.copiedBytes / Math.max(elapsedSeconds, 0.25);
      const remaining =
        speed > 0 ? (progress.totalBytes - progress.copiedBytes) / speed : 0;
      this.estimate.textContent = `${window.AppDom.formatBytes(progress.totalBytes)} au total`;
      this.status.textContent = `${window.AppDom.formatBytes(progress.copiedBytes)} copiés sur ${window.AppDom.formatBytes(progress.totalBytes)} · ${window.AppDom.formatDuration(remaining)} restantes`;
    } else if (progress.phase === "complete") {
      this.progress.value = 100;
      this.estimate.textContent = `${window.AppDom.formatBytes(progress.totalBytes)} copiés.`;
      this.status.textContent = `Copie terminée : ${progress.totalFiles} fichier(s).`;
    } else if (progress.phase === "cancelled")
      this.status.textContent = "Copie annulée et fichiers copiés supprimés.";
    else if (progress.phase === "error")
      this.status.textContent = `Erreur : ${progress.error}`;
  }
}

window.ImportView = ImportView;
