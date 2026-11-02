class CleanupView {
  constructor() {
    this.modal = document.getElementById("cleanup-prompt");
    this.message = document.getElementById("cleanup-message");
    this.progress = document.getElementById("cleanup-progress");
    this.status = document.getElementById("cleanup-status");
    this.yesButton = document.getElementById("cleanup-yes");
    this.noButton = document.getElementById("cleanup-no");
  }

  showConfirmation(count, bytes) {
    this.message.textContent = `Supprimer ${count} média(s) et libérer ${window.AppDom.formatBytes(bytes)} ?`;
    this.progress.hidden = true;
    this.status.hidden = true;
    this.yesButton.hidden = false;
    this.noButton.textContent = "Annuler";
    this.modal.hidden = false;
  }

  start() {
    this.yesButton.disabled = true;
    this.noButton.disabled = true;
    this.message.textContent = "Préparation de la suppression…";
    this.progress.hidden = false;
    this.progress.max = 1;
    this.progress.value = 0;
    this.status.hidden = false;
    this.status.textContent = "Préparation…";
  }

  update(progress) {
    this.progress.max = Math.max(progress.totalFiles, 1);
    this.progress.hidden = false;
    this.status.hidden = false;
    if (progress.phase === "starting") {
      this.progress.value = 0;
      this.status.textContent = `Suppression de 0 sur ${progress.totalFiles} fichier(s)…`;
    } else if (progress.phase === "deleting") {
      this.progress.value = progress.deletedFiles;
      this.status.textContent = `Suppression de ${progress.deletedFiles} sur ${progress.totalFiles} fichier(s)…`;
    } else if (progress.phase === "complete") {
      this.progress.value = this.progress.max;
      this.status.textContent = `${progress.totalFiles} fichier(s) supprimé(s).`;
    }
  }

  finish(result) {
    this.status.textContent = `${result.deletedCount} fichier(s) supprimé(s), ${window.AppDom.formatBytes(result.freedBytes)} libérés.`;
  }
  fail(error) {
    this.message.textContent = `Erreur : ${error.message}`;
    this.status.hidden = true;
    this.progress.hidden = true;
    this.yesButton.hidden = true;
    this.noButton.textContent = "Fermer";
  }
  close() {
    this.modal.hidden = true;
    this.yesButton.hidden = false;
    this.yesButton.disabled = false;
    this.noButton.disabled = false;
    this.noButton.textContent = "Annuler";
  }
}

window.CleanupView = CleanupView;
