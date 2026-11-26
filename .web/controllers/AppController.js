(() => {
  "use strict";

  class AppController {
    constructor(model, view) {
      this.model = model;
      this.view = view;
      this.files = [];
      this.current = null;
      this.filters = new Set(
        LocalDataModel.readList("ig-web-filter", [
          "connections", "activity", "personal", "other",
        ]),
      );
      this.pins = new Set(LocalDataModel.readList("ig-web-pins"));
      this.importCancelled = false;
      this.searchTimer = null;
      this.searchVersion = 0;
      this.ready = false;
    }

    async start() {
      this.bindEvents();
      const loaderMessage = document.querySelector("#app-loader span");
      loaderMessage.textContent = "Ouverture du stockage local…";
      this.view.setIndexProgress({ message: "Ouverture du stockage local…" });
      await this.model.connect((progress) => {
        if (progress.phase === "migrating") {
          loaderMessage.textContent = `Mise à jour de l’index local : ${progress.current} / ${progress.total}`;
          this.view.setIndexProgress({
            message: `Mise à jour de l’index local : ${progress.current} / ${progress.total}`,
            current: progress.current,
            total: progress.total,
          });
        }
      });
      this.loadOptionalAssets();
      loaderMessage.textContent = "Lecture de l’index local…";
      this.view.setIndexProgress({ message: "Lecture de l’index local…" });
      await this.refreshFiles();
      this.ready = true;
      this.view.setReady(true);
      document.body.classList.add("app-loaded");
      this.view.setIndexProgress({
        message: `Index prêt · ${this.files.length.toLocaleString("fr-FR")} fichiers`,
        complete: true,
      });
    }

    bindEvents() {
      document.querySelector("#home-button").addEventListener("click", () => this.showHome());
      document.querySelector("#dashboard-button").addEventListener("click", () => this.showHome());
      document.querySelector("#import-button").addEventListener("click", () => this.openPicker());
      document.querySelector("#filter-button").addEventListener("click", () => this.openFilters());
      document.querySelector("#cleanup-button").addEventListener("click", () => this.clearStorage());
      document
        .querySelector("#mobile-menu-toggle")
        .addEventListener("click", () => this.view.toggleMobileMenu());
      this.view.backdrop.addEventListener("click", () => this.view.closeMobileMenu());

      document.querySelectorAll("[data-page]").forEach((button) =>
        button.addEventListener("click", () => this.openPage(button.dataset.page)),
      );
      document.querySelector("#page-view").addEventListener("click", (event) => {
        if (event.target.closest('[data-action="home"]')) this.showHome();
        const fileButton = event.target.closest("button.feature-file");
        if (fileButton?.dataset.filePath) this.openJson(fileButton.dataset.filePath);
      });
      document.querySelector("#file-list").addEventListener("click", (event) =>
        this.handleFileListClick(event),
      );
      document.querySelector("#pinned-list").addEventListener("click", (event) =>
        this.handleFileListClick(event),
      );
      document.querySelector("#global-search").addEventListener("input", (event) => {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.search(event.target.value), 220);
      });

      const picker = document.querySelector("#file-picker");
      picker.addEventListener("change", () => {
        this.importFiles(picker.files);
        picker.value = "";
      });
      document.querySelector("#choose-files").addEventListener("click", () => picker.click());
      const folderPicker = document.querySelector("#folder-picker");
      document.querySelector("#choose-folder").addEventListener("click", () => folderPicker.click());
      folderPicker.addEventListener("change", () => {
        this.importFiles(folderPicker.files);
        folderPicker.value = "";
      });
      this.bindDropTarget();

      document.querySelector("#cancel-import").addEventListener("click", () => {
        const button = document.querySelector("#cancel-import");
        if (button.textContent === "Fermer") {
          document.querySelector("#progress-dialog").close();
        } else {
          this.importCancelled = true;
          button.disabled = true;
        }
      });
      document.querySelector("#apply-filter").addEventListener("click", () => this.applyFilters());
      document.querySelector("#data-back").addEventListener("click", () => this.showHome());
      document.querySelector("#pin-current").addEventListener("click", () => this.togglePin());
      document.querySelector("#delete-current").addEventListener("click", () => this.deleteCurrent());
    }

    bindDropTarget() {
      if (!window.matchMedia("(pointer: fine) and (min-width: 761px)").matches)
        return;
      const target = document.querySelector("#drop-target");
      for (const eventName of ["dragenter", "dragover"]) {
        target.addEventListener(eventName, (event) => {
          event.preventDefault();
          target.classList.add("drag-over");
        });
      }
      for (const eventName of ["dragleave", "drop"]) {
        target.addEventListener(eventName, (event) => {
          event.preventDefault();
          target.classList.remove("drag-over");
        });
      }
      target.addEventListener("drop", (event) => this.handleDrop(event));
      document.addEventListener("dragover", (event) => event.preventDefault());
      document.addEventListener("drop", (event) => {
        if (!event.target.closest("#drop-target")) event.preventDefault();
      });
    }

    async handleDrop(event) {
      const items = [...(event.dataTransfer?.items || [])];
      if (!items.some((item) => item.kind === "file")) {
        this.importFiles(event.dataTransfer?.files);
        return;
      }

      const dialog = document.querySelector("#progress-dialog");
      const progress = document.querySelector("#import-progress");
      const message = document.querySelector("#import-message");
      const count = document.querySelector("#import-count");
      const cancel = document.querySelector("#cancel-import");
      this.importCancelled = false;
      progress.removeAttribute("value");
      message.textContent = "Lecture des fichiers et dossiers…";
      count.textContent = "";
      cancel.textContent = "Annuler";
      cancel.disabled = false;
      dialog.showModal();

      try {
        const files = [];
        for (const item of items) {
          if (this.importCancelled) break;
          const entry = item.webkitGetAsEntry?.();
          if (entry) await this.collectDroppedEntry(entry, files);
          else {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
          message.textContent = `Lecture des fichiers… ${files.length} trouvé(s)`;
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (this.importCancelled) {
          message.textContent = "Import interrompu.";
          cancel.textContent = "Fermer";
          cancel.disabled = false;
          return;
        }
        dialog.close();
        await this.importFiles(files);
      } catch (error) {
        message.textContent = `Échec de la lecture : ${error.message}`;
        cancel.textContent = "Fermer";
        cancel.disabled = false;
      }
    }

    async collectDroppedEntry(entry, files) {
      if (this.importCancelled) return;
      if (entry.isFile) {
        const file = await new Promise((resolve, reject) =>
          entry.file(resolve, reject),
        );
        if (entry.fullPath && !file.webkitRelativePath) {
          try {
            Object.defineProperty(file, "webkitRelativePath", {
              value: entry.fullPath.replace(/^\/+/, ""),
            });
          } catch (_) {
            // Le chemin reste indicatif si le navigateur rend cette propriété non configurable.
          }
        }
        files.push(file);
        const message = document.querySelector("#import-message");
        const count = document.querySelector("#import-count");
        message.textContent = "Lecture des fichiers et dossiers…";
        count.textContent = `${files.length.toLocaleString("fr-FR")} fichier(s) trouvé(s)`;
        if (files.length % 25 === 0)
          await new Promise((resolve) => setTimeout(resolve, 0));
        return;
      }
      if (!entry.isDirectory) return;

      const reader = entry.createReader();
      while (!this.importCancelled) {
        const batch = await new Promise((resolve, reject) =>
          reader.readEntries(resolve, reject),
        );
        if (!batch.length) break;
        for (const child of batch) await this.collectDroppedEntry(child, files);
      }
    }

    async refreshFiles() {
      const records = await this.model.getAll();
      this.files = records
        .map((record) => ({ ...record, label: LocalDataModel.labelFor(record.path) }))
        .sort((a, b) => a.path.localeCompare(b.path, "fr"));
      this.view.renderFileLists(this.files, this.pins, this.filters);
      this.view.updateStorage(this.files);
    }

    handleFileListClick(event) {
      const button = event.target.closest("button[data-file-path]");
      if (button) this.openJson(button.dataset.filePath);
    }

    async openJson(path, query = "") {
      if (!this.ready) return;
      const file = this.files.find((item) => item.path === path);
      if (!file || !file.hasJson) return;
      const content = await this.model.getContent(path);
      if (!content?.jsonText) return;
      let data;
      try {
        data = JSON.parse(content.jsonText);
      } catch (error) {
        data = { erreur: error.message, contenu: content.jsonText };
      }
      this.current = { ...file, data, jsonText: content.jsonText, query };
      this.view.showScreen("data-view");
      this.view.setActiveNavigation("");
      this.view.renderJson(this.current, this.pins.has(path));
      this.view.closeMobileMenu();
    }

    showHome() {
      this.current = null;
      this.view.showScreen("dashboard-view");
      this.view.setActiveNavigation("dashboard-button");
      this.view.closeMobileMenu();
    }

    async openPage(page) {
      if (!this.ready) return;
      if (!["stats", "contacts", "messages", "crawler", "media"].includes(page)) return;
      this.view.showScreen("page-view");
      this.view.setActiveNavigation("");
      this.view.closeMobileMenu();
      try {
        await this.view.renderPage(
          page,
          this.files,
          (path) => this.openJson(path),
          (path) => this.model.getContent(path),
        );
      } catch (error) {
        this.view.toast(`Impossible de charger cette vue : ${error.message}`);
      }
    }

    async search(query) {
      const version = ++this.searchVersion;
      const term = query.trim();
      if (!term) {
        this.view.renderSearchResults([], "", (path, value) => this.openJson(path, value));
        return;
      }
      document.querySelector("#search-status").textContent = "Recherche dans les fichiers JSON…";
      document.querySelector("#search-results").replaceChildren();
      const results = await this.model.search(
        this.files,
        term,
        () => version !== this.searchVersion,
      );
      if (version !== this.searchVersion) return;
      this.view.renderSearchResults(results, term, (path, value) => this.openJson(path, value));
    }

    openPicker() {
      if (!this.ready) return;
      document.querySelector("#file-picker").click();
    }

    async importFiles(files) {
      if (!this.ready || !files?.length) return;
      this.importCancelled = false;
      const dialog = document.querySelector("#progress-dialog");
      const progress = document.querySelector("#import-progress");
      const message = document.querySelector("#import-message");
      const count = document.querySelector("#import-count");
      const cancel = document.querySelector("#cancel-import");
      progress.value = 0;
      message.textContent = "Lecture des fichiers sélectionnés…";
      count.textContent = "";
      cancel.textContent = "Annuler";
      cancel.disabled = false;
      dialog.showModal();
      try {
        const result = await this.model.importSelection(files, {
          isCancelled: () => this.importCancelled,
          onProgress: (status) => {
            if (status.message) message.textContent = status.message;
            if (status.total) {
              progress.value = (status.imported / status.total) * 100;
              message.textContent = `Import ${status.imported} / ${status.total}`;
              count.textContent = `${LocalDataModel.formatBytes(status.size)} · ${status.path}`;
            }
          },
        });
        await this.refreshFiles();
        message.textContent = result.cancelled ? "Import interrompu." : "Import terminé.";
        cancel.textContent = "Fermer";
        cancel.disabled = false;
        this.view.toast(
          result.cancelled
            ? "Import interrompu."
            : `${result.imported} fichier(s) ajoutés au stockage local.`,
        );
      } catch (error) {
        message.textContent = `Échec de l’import : ${error.message}`;
        cancel.textContent = "Fermer";
        cancel.disabled = false;
      }
    }

    openFilters() {
      const host = document.querySelector("#filter-options");
      host.replaceChildren();
      const categories = [
        ["connections", "Connexions"],
        ["activity", "Activité"],
        ["personal", "Informations personnelles"],
        ["other", "Autres fichiers"],
      ];
      for (const [key, label] of categories) {
        const row = document.createElement("label");
        row.append(document.createTextNode(label));
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = key;
        checkbox.checked = this.filters.has(key);
        row.append(checkbox);
        host.append(row);
      }
      document.querySelector("#filter-dialog").showModal();
    }

    applyFilters() {
      this.filters = new Set(
        [...document.querySelectorAll("#filter-options input:checked")].map(
          (input) => input.value,
        ),
      );
      LocalDataModel.writeList("ig-web-filter", [...this.filters]);
      this.view.renderFileLists(this.files, this.pins, this.filters);
    }

    togglePin() {
      if (!this.current) return;
      const path = this.current.path;
      if (this.pins.has(path)) this.pins.delete(path);
      else this.pins.add(path);
      LocalDataModel.writeList("ig-web-pins", [...this.pins]);
      this.view.renderFileLists(this.files, this.pins, this.filters);
      this.view.renderJson(this.current, this.pins.has(path));
    }

    async confirm(title, message) {
      const dialog = document.querySelector("#confirm-dialog");
      document.querySelector("#confirm-title").textContent = title;
      document.querySelector("#confirm-message").textContent = message;
      return new Promise((resolve) => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), {
          once: true,
        });
        dialog.showModal();
      });
    }

    async deleteCurrent() {
      if (!this.current) return;
      const accepted = await this.confirm(
        "Supprimer ce fichier",
        "Ce fichier sera supprimé du stockage de ce navigateur.",
      );
      if (!accepted) return;
      await this.model.delete(this.current.path);
      this.pins.delete(this.current.path);
      LocalDataModel.writeList("ig-web-pins", [...this.pins]);
      this.current = null;
      await this.refreshFiles();
      this.showHome();
    }

    async clearStorage() {
      if (!this.ready) return;
      const accepted = await this.confirm(
        "Libérer l’espace",
        "Supprimer tous les fichiers importés de ce navigateur ?",
      );
      if (!accepted) return;
      await this.model.clear();
      this.pins.clear();
      LocalDataModel.writeList("ig-web-pins", []);
      await this.refreshFiles();
      this.showHome();
      this.view.toast("Les données importées ont été supprimées.");
    }

    loadOptionalAssets() {
      const load = () => {
        const logo = document.querySelector(".brand img[data-src]");
        if (logo) {
          logo.src = logo.dataset.src;
          logo.removeAttribute("data-src");
        }
        const icons = document.createElement("link");
        icons.rel = "stylesheet";
        icons.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.3.1/css/all.css";
        document.head.append(icons);
      };
      if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 1200 });
      else window.setTimeout(load, 500);
    }
  }

  const start = async () => {
    const model = new LocalDataModel();
    const view = new AppView();
    const controller = new AppController(model, view);
    view.setReady(false);
    try {
      await controller.start();
    } catch (error) {
      console.error(error);
      document.querySelector("#app-loader span").textContent =
        `Le stockage local n’est pas disponible : ${error.message}`;
      view.setIndexProgress({
        message: `Échec de l’indexation : ${error.message}`,
        error: true,
      });
      view.toast(`Le stockage local n’est pas disponible : ${error.message}`);
    }
  };

  start();
})();
