class ModelViewController {
  constructor(api, view) {
    this.api = api;
    this.view = view;
    this.sizeRefreshInProgress = false;
    this.jsonRefreshInProgress = false;
    this.files = [];
    this.jsonSignature = null;
  }

  start() {
    this.refreshSize();
    this.refreshJson();
    window.setInterval(() => this.refreshSize(), 1000);
    window.setInterval(() => this.refreshJson(), 1500);
    window.addEventListener("open-sidebar-json", (event) =>
      event.detail && typeof event.detail === "object"
        ? this.selectJson(event.detail)
        : this.openJsonPath(event.detail),
    );
    window.addEventListener("model-json-selected", (event) => {
      this.currentPath = event.detail.path;
    });
    window.addEventListener("model-json-refresh-request", () =>
      this.refreshJson(),
    );
  }

  async refreshSize() {
    if (this.sizeRefreshInProgress) return;
    this.sizeRefreshInProgress = true;
    try {
      const files = await this.api.listModelNonJson();
      const bytes = files.reduce((total, file) => total + file.size, 0);
      this.view.updateStorage(bytes, files.length > 0);
    } catch (error) {
      console.error("Impossible de calculer la taille de model :", error);
    } finally {
      this.sizeRefreshInProgress = false;
    }
  }

  async refreshJson() {
    if (this.jsonRefreshInProgress) return;
    this.jsonRefreshInProgress = true;
    try {
      const files = await this.api.listModelJson();
      const signature = JSON.stringify(
        files.map((file) => [
          file.path,
          file.size,
          file.mtimeMs,
          file.paths?.length || 0,
          (file.conversations || []).map((conversation) => [
            conversation.path,
            conversation.size,
            conversation.mtimeMs,
          ]),
        ]),
      );
      if (signature === this.jsonSignature) return;
      this.jsonSignature = signature;
      this.files = files;
      this.view.renderJsonFiles(files);
      window.dispatchEvent(
        new CustomEvent("model-json-files-refreshed", { detail: { files } }),
      );
    } catch (error) {
      console.error("Impossible de lister les fichiers JSON de model :", error);
    } finally {
      this.jsonRefreshInProgress = false;
    }
  }

  async openJsonPath(path, searchQuery = "") {
    let file = this.files.find(
      (entry) => entry.path === path || entry.paths?.includes(path),
    );
    if (!file) {
      this.files = await this.api.listModelJson();
      file = this.files.find(
        (entry) => entry.path === path || entry.paths?.includes(path),
      );
    }
    if (file?.allMessages) {
      file = file.conversations?.find((conversation) =>
        conversation.paths.includes(path),
      ) || {
        path,
        paths: [path],
        label: path
          .split(/[\\/]/)
          .pop()
          .replace(/\.json$/i, ""),
        messageGroup: true,
      };
    }
    return this.selectJson(
      file || { path, label: path.split(/[\\/]/).pop() },
      searchQuery,
    );
  }

  async selectJson(file, searchQuery = "") {
    window.dispatchEvent(new Event("dashboard-search-reset"));

    try {
      const paths = file.paths || [file.path];
      const documents = await Promise.all(
        paths.map((path) => this.api.readModelJson(path)),
      );
      let data = documents[0];

      if (file.messageGroup || file.forceMessageGroup) {
        const messages = documents
          .flatMap((document) =>
            Array.isArray(document.messages) ? document.messages : [],
          )
          .map((message) => {
            if (typeof message.content === "string" && message.content.trim()) {
              return message;
            }

            const parts = [];

            if (message.audio_files?.length) parts.push("Message vocal");
            if (message.photos?.length) {
              parts.push(
                message.photos.length > 1
                  ? `${message.photos.length} photos`
                  : "Photo",
              );
            }
            if (message.videos?.length) {
              parts.push(
                message.videos.length > 1
                  ? `${message.videos.length} vidéos`
                  : "Vidéo",
              );
            }
            if (message.share?.link)
              parts.push(`Lien partagé : ${message.share.link}`);
            if (message.reactions?.length) {
              const reactions = message.reactions
                .map((item) => item.reaction)
                .filter(Boolean)
                .join(" ");
              parts.push(`Réaction : ${reactions}`);
            }
            if (message.gifs?.length) parts.push("GIF");
            if (message.sticker) parts.push("Autocollant");
            if (message.call_duration) parts.push("Appel");

            return {
              ...message,
              content: parts.join(" · ") || "Contenu textuel indisponible",
            };
          });

        messages.sort(
          (a, b) => Number(a.timestamp_ms || 0) - Number(b.timestamp_ms || 0),
        );
        data = { ...data, messages };
      }

      window.dispatchEvent(
        new CustomEvent("model-json-selected", {
          detail: {
            path: file.path,
            label: file.label,
            data,
            searchQuery,
            messageGroup: file.messageGroup || file.forceMessageGroup,
          },
        }),
      );
    } catch (error) {
      console.error(`Impossible de lire ${file.path} :`, error);
    }
  }
}

window.ModelViewController = ModelViewController;
