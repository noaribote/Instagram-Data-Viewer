class ModelView {
  constructor() {
    this.fileList = document.getElementById("json-file-list");
    this.pinnedList = document.getElementById("pinned-json-list");
    this.pinnedGroup = document.getElementById("pinned-files-group");
    this.filterMenu = document.getElementById("data-filter-menu");
    this.filterDialog = document.getElementById("data-filter-dialog");
    this.dashboard = document.getElementById("dashboard-view");
    this.pageFrame = document.getElementById("page-view");
    this.selectFolderButton = document.getElementById("select-model-folder");
    this.sizeDisplay = document.getElementById("qteGO");
    this.freeSpaceButton = document.getElementById("libEspace");
    this.contentFrame = document.getElementById("json-view");
    this.filterKeys = ["connections", "activity", "personal", "other"];
    this.activeFilter = this.loadSavedFilter();
    this.draftFilter = new Set(this.activeFilter);
    this.pendingSelection = null;
    this.contentFrame.addEventListener(
      "load",
      () =>
        this.pendingSelection &&
        this.contentFrame.contentWindow.postMessage(this.pendingSelection, "*"),
    );

    document
      .getElementById("home-button")
      .addEventListener("click", () => this.showHome());
    document
      .getElementById("dashboard-button")
      .addEventListener("click", () => this.showHome());
    document
      .querySelectorAll("[data-page]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.openPage(button.dataset.page),
        ),
      );
    document
      .getElementById("data-filter-toggle")
      .addEventListener("click", () => this.openFilter());
    document
      .getElementById("filter-close")
      .addEventListener("click", () => this.filterDialog.close());
    document
      .getElementById("filter-cancel")
      .addEventListener("click", () => this.filterDialog.close());
    document
      .getElementById("filter-select-all")
      .addEventListener("click", () => this.setDraftFilter(this.filterKeys));
    document
      .getElementById("filter-select-none")
      .addEventListener("click", () => this.setDraftFilter([]));
    document
      .getElementById("filter-apply")
      .addEventListener("click", () => this.applyFilter());
    this.buildFilterToggles();

    this.sidebarOpen = (file) =>
      window.dispatchEvent(
        new CustomEvent("open-sidebar-json", { detail: file.path }),
      );
    this.fileList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-json-path]");
      if (!button) return;
      const file = this.files.find(
        (entry) => entry.path === button.dataset.jsonPath,
      );
      if (file) this.sidebarOpen(file);
    });
    this.pinnedList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-json-path]");
      if (!button) return;
      const file = this.pinnedFiles?.find(
        (entry) => entry.path === button.dataset.jsonPath,
      );
      if (file?.messageGroup)
        window.dispatchEvent(
          new CustomEvent("open-sidebar-json", { detail: file }),
        );
      else this.sidebarOpen(file || { path: button.dataset.jsonPath });
    });
    window.addEventListener("model-json-selected", (event) =>
      this.showJson(event.detail),
    );
    window.addEventListener("model-json-files-refreshed", async (event) => {
      this.files = event.detail.files;
      this.pinnedPaths = await window.electronAPI.listPinnedJson();
      this.renderFileButtons();
      if (!this.pageFrame.hidden)
        this.pageFrame.contentWindow.postMessage(
          { channel: "ig-view-shell", type: "data-changed" },
          "*",
        );
    });
    window.addEventListener("message", (event) =>
      this.handlePageMessage(event),
    );
  }

  loadSavedFilter() {
    try {
      const saved = JSON.parse(
        localStorage.getItem("instagram-view-filter") || "null",
      );
      if (Array.isArray(saved))
        return new Set(this.filterKeys.filter((key) => saved.includes(key)));
    } catch {
      /* Use the default filter when stored preferences are invalid. */
    }
    return new Set(this.filterKeys);
  }

  buildFilterToggles() {
    this.filterMenu.replaceChildren();
    this.filterInputs = new Map();
    const categories = [
      ["connections", "Connexions"],
      ["activity", "Activité"],
      ["personal", "Informations personnelles"],
      ["other", "Autres fichiers"],
    ];
    for (const [key, label] of categories) {
      const row = document.createElement("label");
      row.className = "filter-toggle-row";
      const text = document.createElement("span");
      text.textContent = label;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = key;
      input.checked = this.activeFilter.has(key);
      input.addEventListener("change", () =>
        input.checked
          ? this.draftFilter.add(key)
          : this.draftFilter.delete(key),
      );
      row.append(text, input);
      this.filterMenu.append(row);
      this.filterInputs.set(key, input);
    }
  }

  openFilter() {
    this.draftFilter = new Set(this.activeFilter);
    this.syncFilterToggles();
    this.filterDialog.showModal();
  }

  setDraftFilter(keys) {
    this.draftFilter = new Set(keys);
    this.syncFilterToggles();
  }

  syncFilterToggles() {
    for (const [key, input] of this.filterInputs)
      input.checked = this.draftFilter.has(key);
  }

  applyFilter() {
    this.activeFilter = new Set(this.draftFilter);
    try {
      localStorage.setItem(
        "instagram-view-filter",
        JSON.stringify([...this.activeFilter]),
      );
    } catch {
      /* Keep the applied filter in memory if file storage is unavailable. */
    }
    this.filterDialog.close();
    this.renderFileButtons();
  }

  renderJsonFiles(files) {
    this.files = files;
    this.selectFolderButton.hidden = files.length > 0;
    this.renderFileButtons();
  }

  renderFileButtons() {
    this.fileList.replaceChildren();
    this.pinnedList.replaceChildren();
    const normalizePath = (value) => String(value || "").replace(/\\/g, "/");
    const visible = (file) => {
      if (file.messageGroup) return false;
      const filePath = normalizePath(file.path).toLowerCase();
      if (
        filePath.includes("connections") ||
        filePath.includes("followers_and_following")
      )
        return this.activeFilter.has("connections");
      if (
        filePath.includes("activity") ||
        filePath.includes("ads_and_topics") ||
        filePath.includes("recent_searches")
      )
        return this.activeFilter.has("activity");
      if (filePath.includes("personal_information"))
        return this.activeFilter.has("personal");
      return this.activeFilter.has("other");
    };
    for (const file of (this.files || []).filter(visible)) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.jsonPath = file.path;
      button.title = file.path;
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-database";
      button.append(
        icon,
        document.createTextNode(
          file.label.length > 30 ? `${file.label.slice(0, 27)}...` : file.label,
        ),
      );
      this.fileList.append(button);
    }
    const pinned = this.pinnedPaths || [];
    const pinnedFiles = pinned.flatMap((pinnedPath) => {
      const entry = (this.files || []).find(
        (file) =>
          normalizePath(file.path) === normalizePath(pinnedPath) ||
          file.paths?.some(
            (item) => normalizePath(item) === normalizePath(pinnedPath),
          ),
      );
      if (!entry) return [];
      if (entry.allMessages)
        return [
          {
            ...entry,
            path: pinnedPath,
            paths: [pinnedPath],
            label: pinnedPath
              .split(/[\\/]/)
              .pop()
              .replace(/\.json$/i, ""),
            allMessages: false,
          },
        ];
      return [entry];
    });
    this.pinnedFiles = pinnedFiles;
    this.pinnedGroup.hidden = pinnedFiles.length === 0;
    for (const file of pinnedFiles) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.jsonPath = file.path;
      button.title = file.path;
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-thumbtack";
      button.append(icon, document.createTextNode(file.label));
      this.pinnedList.append(button);
    }
  }

  openPage(page) {
    if (!["stats", "crawler", "contacts", "messages"].includes(page)) return;
    this.dashboard.hidden = true;
    this.contentFrame.hidden = true;
    this.pageFrame.hidden = false;
    this.jsonActions?.remove();
    this.jsonActions = null;
    this.pendingSelection = null;
    this.pageFrame.src = `pages/${page}.html`;
  }

  async handlePageMessage(event) {
    if (
      event.source === this.contentFrame.contentWindow &&
      event.data?.channel === "ig-media" &&
      event.data.type === "preview-request"
    ) {
      try {
        const result = await window.electronAPI.getHeicPreview(event.data.path);
        event.source.postMessage(
          {
            channel: "ig-media",
            type: "preview-response",
            id: event.data.id,
            result,
          },
          "*",
        );
      } catch (error) {
        event.source.postMessage(
          {
            channel: "ig-media",
            type: "preview-response",
            id: event.data.id,
            error: error.message,
          },
          "*",
        );
      }
      return;
    }
    if (
      event.source === this.contentFrame.contentWindow &&
      event.data?.channel === "ig-media" &&
      event.data.type === "download-request"
    ) {
      try {
        const result = await window.electronAPI.downloadImage(
          event.data.source,
        );
        event.source.postMessage(
          {
            channel: "ig-media",
            type: "download-response",
            id: event.data.id,
            result,
          },
          "*",
        );
      } catch (error) {
        event.source.postMessage(
          {
            channel: "ig-media",
            type: "download-response",
            id: event.data.id,
            error: error.message,
          },
          "*",
        );
      }
      return;
    }
    if (
      event.source !== this.pageFrame.contentWindow ||
      event.data?.channel !== "ig-view"
    )
      return;
    const message = event.data;
    if (message.type === "navigate-home") {
      this.showHome();
      return;
    }
    if (message.type === "open-json") {
      window.dispatchEvent(
        new CustomEvent("open-sidebar-json", { detail: message.selection }),
      );
      return;
    }
    if (message.type === "user-media-cancel") {
      window.electronAPI.cancelUserMediaDownload();
      return;
    }
    if (message.type !== "api-request") return;
    const allowed = new Set([
      "getDashboardStats",
      "getConnectionComparison",
      "listCachedUsers",
      "fetchPublicUser",
      "deleteCachedUser",
      "listContactData",
      "listModelJson",
      "downloadImage",
      "listUserMedia",
      "startUserMediaDownload",
    ]);
    if (
      !allowed.has(message.method) ||
      typeof window.electronAPI[message.method] !== "function"
    ) {
      event.source.postMessage(
        {
          channel: "ig-view",
          type: "api-response",
          session: message.session,
          id: message.id,
          error: "Action indisponible.",
        },
        "*",
      );
      return;
    }
    try {
      if (message.method === "startUserMediaDownload") {
        const removeProgress = window.electronAPI.onUserMediaProgress((progress) => {
          if (event.source && !event.source.closed) event.source.postMessage({ channel: "ig-view", type: "user-media-progress", session: message.session, progress }, "*");
        });
        try {
          const result = await window.electronAPI.startUserMediaDownload(...(Array.isArray(message.args) ? message.args : []));
          event.source.postMessage({ channel: "ig-view", type: "user-media-finished", session: message.session, result }, "*");
        } catch (error) {
          event.source.postMessage({ channel: "ig-view", type: "user-media-finished", session: message.session, error: error.message }, "*");
        } finally { removeProgress(); }
        return;
      }
      const result = await window.electronAPI[message.method](
        ...(Array.isArray(message.args) ? message.args : []),
      );
      event.source.postMessage(
        {
          channel: "ig-view",
          type: "api-response",
          session: message.session,
          id: message.id,
          result,
        },
        "*",
      );
    } catch (error) {
      event.source.postMessage(
        {
          channel: "ig-view",
          type: "api-response",
          session: message.session,
          id: message.id,
          error: error.message,
        },
        "*",
      );
    }
  }

  confirmAction(title, message, confirmLabel = "Confirmer") {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "app-dialog confirm-dialog";
      const header = document.createElement("header");
      header.className = "app-dialog-header";
      const heading = document.createElement("h2");
      heading.textContent = title;
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Fermer";
      header.append(heading, close);
      const body = document.createElement("div");
      body.className = "app-dialog-body";
      const text = document.createElement("p");
      text.textContent = message;
      body.append(text);
      const footer = document.createElement("footer");
      footer.className = "dialog-actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Annuler";
      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "danger-button";
      confirm.textContent = confirmLabel;
      footer.append(cancel, confirm);
      dialog.append(header, body, footer);
      document.body.append(dialog);
      let accepted = false;
      const finish = () => {
        dialog.remove();
        resolve(accepted);
      };
      close.addEventListener("click", () => dialog.close());
      cancel.addEventListener("click", () => dialog.close());
      confirm.addEventListener("click", () => {
        accepted = true;
        dialog.close();
      });
      dialog.addEventListener("close", finish, { once: true });
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
      dialog.showModal();
    });
  }

  updateStorage(bytes, enabled) {
    this.sizeDisplay.textContent = window.AppDom.formatGigabytes(bytes);
    this.freeSpaceButton.disabled = !enabled;
  }

  showJson(selection) {
    this.pendingSelection = {
      type: "instagram-json",
      path: selection.path,
      label: selection.label,
      data: selection.data,
      searchQuery: selection.searchQuery,
    };
    this.dashboard.hidden = true;
    this.pageFrame.hidden = true;
    this.contentFrame.hidden = false;
    this.ensureJsonActions(selection);
    this.contentFrame.contentWindow.postMessage(this.pendingSelection, "*");
  }

  async ensureJsonActions(selection) {
    this.jsonActions?.remove();
    const actions = document.createElement("div");
    actions.className = "json-actions";
    const pin = document.createElement("button");
    pin.type = "button";
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-thumbtack";
    pin.append(icon, document.createTextNode(" Épingler"));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Supprimer ce JSON";
    const current = selection.path;
    const normalizePath = (value) => String(value || "").replace(/\\/g, "/");
    const pins = await window.electronAPI.listPinnedJson();
    if (this.pendingSelection?.path !== current) return;
    pin.lastChild.textContent = pins.includes(normalizePath(current))
      ? " Désépingler"
      : " Épingler";
    pin.addEventListener("click", async () => {
      const updated = await window.electronAPI.togglePinnedJson(current);
      this.pinnedPaths = updated;
      this.renderFileButtons();
      pin.lastChild.textContent = updated.includes(normalizePath(current))
        ? " Désépingler"
        : " Épingler";
    });
    remove.addEventListener("click", async () => {
      if (
        !(await this.confirmAction(
          "Supprimer ce fichier JSON",
          "Le fichier JSON actuellement ouvert sera supprimé du dossier model.",
        ))
      )
        return;
      try {
        await window.electronAPI.deleteModelJson(current);
        this.showHome();
        window.dispatchEvent(new Event("model-json-refresh-request"));
      } catch (error) {
        this.showError(error.message);
      }
    });
    actions.append(pin, remove);
    this.jsonActions = actions;
    document.body.append(actions);
  }

  showError(message) {
    const body = document.createElement("p");
    body.textContent = message;
    const dialog = document.createElement("dialog");
    dialog.className = "app-dialog";
    const header = document.createElement("header");
    header.className = "app-dialog-header";
    const title = document.createElement("h2");
    title.textContent = "Une erreur est survenue";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Fermer";
    close.addEventListener("click", () => dialog.close());
    const content = document.createElement("div");
    content.className = "app-dialog-body";
    content.append(body);
    header.append(title, close);
    dialog.append(header, content);
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
  }

  showHome() {
    window.dispatchEvent(new Event("dashboard-search-reset"));
    this.pendingSelection = null;
    this.contentFrame.hidden = true;
    this.pageFrame.hidden = true;
    this.dashboard.hidden = false;
    this.pageFrame.src = "about:blank";
    this.jsonActions?.remove();
    this.jsonActions = null;
  }
}

window.ModelView = ModelView;
