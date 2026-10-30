(() => {
    const api = window.electronAPI;
    const modelController = new window.ModelViewController(api, new window.ModelView());
    const importController = new window.ImportViewController(api, new window.ImportView(), modelController);
    const cleanupController = new window.CleanupViewController(api, new window.CleanupView(), modelController);

    modelController.start();
    importController.start();
    cleanupController.start();
})();
