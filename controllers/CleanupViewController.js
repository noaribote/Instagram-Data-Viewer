class CleanupViewController {
  constructor(api, view, modelController) {
    this.api = api;
    this.view = view;
    this.modelController = modelController;
    this.inProgress = false;
  }

  start() {
    document
      .getElementById("libEspace")
      .addEventListener("click", () => this.confirm());
    this.view.noButton.addEventListener("click", () => this.view.close());
    this.view.yesButton.addEventListener("click", () => this.removeFiles());
    this.api.onCleanupProgress((progress) => this.view.update(progress));
  }

  async confirm() {
    if (document.getElementById("libEspace").disabled) return;
    try {
      const files = await this.api.listModelNonJson();
      if (!files.length) {
        await this.modelController.refreshSize();
        return;
      }
      this.view.showConfirmation(
        files.length,
        files.reduce((total, file) => total + file.size, 0),
      );
    } catch (error) {
      console.error("Impossible de vérifier les fichiers à supprimer :", error);
    }
  }

  async removeFiles() {
    if (this.inProgress) return;
    this.inProgress = true;
    this.view.start();
    try {
      const result = await this.api.deleteModelNonJson();
      await Promise.all([
        this.modelController.refreshSize(),
        this.modelController.refreshJson(),
      ]);
      this.view.finish(result);
      window.setTimeout(() => this.view.close(), 700);
    } catch (error) {
      this.view.fail(error);
    } finally {
      this.inProgress = false;
    }
  }
}

window.CleanupViewController = CleanupViewController;
