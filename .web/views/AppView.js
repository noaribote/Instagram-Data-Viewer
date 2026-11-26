(() => {
  "use strict";

  class AppView {
    constructor() {
      this.sidebar = document.querySelector("#app-sidebar");
      this.backdrop = document.querySelector(".mobile-backdrop");
      this.toggle = document.querySelector("#mobile-menu-toggle");
      this.currentFile = null;
    }

    showScreen(screen) {
      for (const id of ["dashboard-view", "page-view", "data-view"])
        document.getElementById(id).hidden = id !== screen;
    }

    setActiveNavigation(id) {
      document.querySelectorAll(".nav-main .nav-item").forEach((item) =>
        item.classList.toggle("active", item.id === id),
      );
    }

    closeMobileMenu() {
      this.sidebar.classList.remove("open");
      this.backdrop.hidden = true;
      this.toggle.setAttribute("aria-expanded", "false");
    }

    setReady(ready) {
      for (const selector of [
        "#import-button", "#filter-button", "#choose-files", "#choose-folder",
        "#file-picker", "#folder-picker", "#global-search", "[data-page]",
      ]) {
        document.querySelectorAll(selector).forEach((control) => {
          control.disabled = !ready;
        });
      }
      if (ready) document.body.removeAttribute("aria-busy");
      else document.body.setAttribute("aria-busy", "true");
      const status = document.querySelector("#search-status");
      if (status)
        status.textContent = ready
          ? "La recherche s’effectue dans votre navigateur."
          : "Préparation de l’index local…";
    }

    setIndexProgress({ message, current, total, complete = false, error = false }) {
      const progress = document.querySelector("#index-progress");
      const label = document.querySelector("#index-status-text");
      const banner = document.querySelector("#index-status");
      banner.classList.toggle("is-error", error);
      banner.classList.toggle("is-complete", complete);
      if (typeof current === "number" && typeof total === "number" && total > 0) {
        progress.max = total;
        progress.value = current;
      } else if (complete) {
        progress.max = 1;
        progress.value = 1;
      } else {
        progress.removeAttribute("value");
      }
      label.textContent = message;
    }

    toggleMobileMenu() {
      const isOpen = !this.sidebar.classList.contains("open");
      this.sidebar.classList.toggle("open", isOpen);
      this.backdrop.hidden = !isOpen;
      this.toggle.setAttribute("aria-expanded", String(isOpen));
    }

    updateStorage(files) {
      const bytes = files.reduce((total, file) => total + file.size, 0);
      document.querySelector("#storage-size").textContent =
        LocalDataModel.formatBytes(bytes);
      document.querySelector("#cleanup-button").disabled = files.length === 0;
    }

    renderFileLists(files, pins, filters) {
      const fileList = document.querySelector("#file-list");
      const pinnedList = document.querySelector("#pinned-list");
      fileList.replaceChildren();
      pinnedList.replaceChildren();

      const jsonFiles = files.filter(
        (file) =>
          file.hasJson &&
          filters.has(LocalDataModel.categoryFor(file.path)),
      );
      document.querySelector("#file-count").textContent = String(jsonFiles.length);

      for (const file of jsonFiles)
        fileList.append(this.createFileButton(file, "fa-database"));

      const pinnedFiles = [...pins]
        .map((path) => files.find((file) => file.path === path))
        .filter(Boolean);
      document.querySelector("#pinned-group").hidden = pinnedFiles.length === 0;
      for (const file of pinnedFiles)
        pinnedList.append(this.createFileButton(file, "fa-thumbtack"));
    }

    createFileButton(file, iconName) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.filePath = file.path;
      button.title = file.path;
      const icon = document.createElement("i");
      icon.className = `fa-solid ${iconName}`;
      const label = document.createElement("span");
      label.textContent = file.label;
      button.append(icon, label);
      return button;
    }

    renderJson(file, isPinned) {
      this.currentFile = file;
      const host = document.querySelector("#json-content");
      host.replaceChildren();
      const header = document.createElement("header");
      const eyebrow = document.createElement("span");
      eyebrow.className = "eyebrow";
      eyebrow.textContent =
        file.path.split(/[\\/]/).slice(0, -1).join(" / ") ||
        "Données Instagram";
      const title = document.createElement("h1");
      title.textContent = file.label;
      header.append(eyebrow, title);
      host.append(header);

      const pinButton = document.querySelector("#pin-current");
      pinButton.innerHTML = `<i class="fa-solid fa-thumbtack"></i> ${isPinned ? "Désépingler" : "Épingler"}`;

      const data = file.data;
      if (Array.isArray(data)) {
        host.append(this.createTable("Contenu", data));
      } else if (data && typeof data === "object") {
        const scalarFields = {};
        const tables = [];
        for (const [key, value] of Object.entries(data)) {
          if (Array.isArray(value)) tables.push([key, value]);
          else if (value && typeof value === "object") tables.push([key, [value]]);
          else scalarFields[key.replace(/[_-]/g, " ")] = value;
        }
        if (Object.keys(scalarFields).length) {
          const summary = document.createElement("section");
          summary.className = "summary-fields";
          for (const [label, value] of Object.entries(scalarFields).slice(0, 30)) {
            const item = document.createElement("div");
            item.className = "summary-item";
            const key = document.createElement("span");
            key.className = "muted";
            key.textContent = this.humanizeKey(label);
            const text = document.createElement("strong");
            text.textContent = this.formatValue(value, label);
            item.append(key, text);
            summary.append(item);
          }
          host.append(summary);
        }
        for (const [label, rows] of tables)
          host.append(this.createTable(label.replace(/[_-]/g, " "), rows));
        if (!Object.keys(scalarFields).length && !tables.length)
          host.append(this.createPre(data));
      } else {
        host.append(this.createPre(data));
      }
    }

    createPre(value, query = "") {
      const pre = document.createElement("pre");
      pre.className = "json-pre";
      pre.textContent = JSON.stringify(value, null, 2);
      if (!query) return pre;
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const parts = pre.textContent
        .replace(new RegExp(`(${escaped})`, "gi"), "\u0000$1\u0000")
        .split("\u0000");
      pre.replaceChildren(
        ...parts.map((part) => {
          if (part.toLocaleLowerCase() !== query.toLocaleLowerCase())
            return document.createTextNode(part);
          const mark = document.createElement("mark");
          mark.textContent = part;
          return mark;
        }),
      );
      return pre;
    }

    repairText(value) {
      const decodeSuspiciousRun = (run) => {
        if (!/[\u00c3\u00c2\u00e2\u00f0\u00ef][\u0080-\u00bf]|[\u00c3\u00c2]/.test(run)) return run;
        try {
          const bytes = Uint8Array.from(run, (character) => character.charCodeAt(0));
          const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          return /[\u00c3\u00c2\u00e2\u00f0\u00ef][\u0080-\u00bf]|[\u00c3\u00c2]/.test(decoded)
            ? run
            : decoded;
        } catch {
          return run;
        }
      };
      let output = "";
      let run = "";
      for (const character of String(value ?? "")) {
        if (character.charCodeAt(0) <= 255) run += character;
        else {
          output += decodeSuspiciousRun(run) + character;
          run = "";
        }
      }
      return output + decodeSuspiciousRun(run);
    }

    humanizeKey(key) {
      const name = this.repairText(key).replace(/[_-]+/g, " ").trim();
      const translations = {
        "sender name": "Envoyé par",
        timestamp: "Date",
        "timestamp ms": "Date",
        "creation timestamp": "Date de création",
        "created timestamp": "Date de création",
        content: "Contenu",
        "string list data": "Profil",
        "media list data": "Médias associés",
        uri: "Fichier",
        href: "Lien",
        fbid: "Identifiant",
        "audio files": "Fichiers audio",
        photos: "Photos",
        videos: "Vidéos",
        likes: "J’aime",
        comments: "Commentaires",
      };
      return translations[name.toLocaleLowerCase("fr-FR")] ||
        name.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("fr-FR"));
    }

    formatValue(value, key = "") {
      if (value === null || value === undefined || value === "") return "—";
      if (typeof value === "boolean") return value ? "Oui" : "Non";
      if (typeof value === "number" && /timestamp|date|time/i.test(key) && value > 0) {
        const milliseconds = value > 100000000000 ? value : value * 1000;
        const date = new Date(milliseconds);
        if (!Number.isNaN(date.getTime()))
          return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
      }
      return this.repairText(value);
    }

    flattenRecord(value, prefix = "", output = {}) {
      if (Array.isArray(value)) {
        value.forEach((item, index) =>
          this.flattenRecord(item, prefix ? `${prefix} ${index + 1}` : `Élément ${index + 1}`, output),
        );
      } else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          const label = this.humanizeKey(key);
          if (child && typeof child === "object") this.flattenRecord(child, label, output);
          else {
            let uniqueLabel = label;
            let duplicate = 2;
            while (Object.hasOwn(output, uniqueLabel)) uniqueLabel = `${label} (${duplicate++})`;
            output[uniqueLabel] = this.formatValue(child, key);
          }
        }
      } else if (prefix) output[prefix] = this.formatValue(value);
      return output;
    }

    createTable(title, rows) {
      const section = document.createElement("section");
      section.className = "table-section";
      const heading = document.createElement("div");
      heading.className = "section-heading";
      const titleElement = document.createElement("h2");
      titleElement.textContent = title;
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = rows.length.toLocaleString("fr-FR");
      heading.append(titleElement, count);

      const scroll = document.createElement("div");
      scroll.className = "table-scroll";
      if (!rows.length) {
        scroll.textContent = "Aucune donnée";
        section.append(heading, scroll);
        return section;
      }
      const objects = rows.map((row) => this.flattenRecord(row && typeof row === "object" ? row : { valeur: row }));
      const keys = [...new Set(objects.flatMap(Object.keys))];
      const priority = /^(envoyé par|date|contenu)$/i;
      const mediaPriority = /(fichiers audio|photos|vidéos|stickers?)/i;
      keys.sort((a, b) =>
        Number(priority.test(b)) - Number(priority.test(a)) ||
        Number(mediaPriority.test(b)) - Number(mediaPriority.test(a)),
      );
      const visibleKeys = keys.slice(0, 5);
      const controls = document.createElement("div");
      controls.className = "table-controls";
      const search = document.createElement("input");
      search.type = "search";
      search.className = "table-search";
      search.placeholder = "Rechercher dans cette liste";
      search.setAttribute("aria-label", `Rechercher dans ${title}`);
      const pageLabel = document.createElement("span");
      pageLabel.className = "muted";
      controls.append(search, pageLabel);
      section.append(controls);
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const key of visibleKeys) {
        const cell = document.createElement("th");
        cell.textContent = key;
        headRow.append(cell);
      }
      if (keys.length > visibleKeys.length) {
        const detailsHeading = document.createElement("th");
        detailsHeading.textContent = "Détails";
        headRow.append(detailsHeading);
      }
      head.append(headRow);
      const body = document.createElement("tbody");
      table.append(head, body);
      scroll.append(table);
      const footer = document.createElement("div");
      footer.className = "pagination";
      const previous = document.createElement("button");
      previous.type = "button";
      previous.textContent = "Précédent";
      const next = document.createElement("button");
      next.type = "button";
      next.textContent = "Suivant";
      footer.append(previous, next);
      section.append(heading, scroll, footer);
      const pageSize = 100;
      let page = 0;
      const renderRows = () => {
        const query = search.value.trim().toLocaleLowerCase("fr-FR");
        const filtered = objects.map((row, index) => ({ row, index })).filter(({ row }) =>
          Object.values(row).some((value) =>
            this.repairText(value).toLocaleLowerCase("fr-FR").includes(query),
          ),
        );
        const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
        page = Math.min(page, pageCount - 1);
        pageLabel.textContent = filtered.length
          ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, filtered.length)} sur ${filtered.length}`
          : "Aucun résultat";
        previous.disabled = page === 0;
        next.disabled = page >= pageCount - 1;
        body.replaceChildren();
        for (const entry of filtered.slice(page * pageSize, (page + 1) * pageSize)) {
          const row = entry.row;
          const tableRow = document.createElement("tr");
          for (const key of visibleKeys) {
            const cell = document.createElement("td");
            cell.textContent = row[key] ?? "—";
            tableRow.append(cell);
          }
          if (keys.length > visibleKeys.length) {
            const cell = document.createElement("td");
            const details = document.createElement("button");
            details.type = "button";
            details.className = "details-open";
            details.textContent = "Voir";
            details.addEventListener("click", () => this.showRecordDetails(title, row, entry.index));
            cell.append(details);
            tableRow.append(cell);
          }
          body.append(tableRow);
        }
      };
      search.addEventListener("input", () => { page = 0; renderRows(); });
      previous.addEventListener("click", () => { page--; renderRows(); });
      next.addEventListener("click", () => { page++; renderRows(); });
      renderRows();
      return section;
    }

    showRecordDetails(title, record, index) {
      const dialog = document.createElement("dialog");
      dialog.className = "web-dialog details-dialog";
      const header = document.createElement("header");
      const heading = document.createElement("h2");
      heading.textContent = `${title} · Élément ${index + 1}`;
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Fermer";
      close.addEventListener("click", () => dialog.close());
      header.append(heading, close);
      const list = document.createElement("dl");
      list.className = "details-modal-list";
      for (const [key, value] of Object.entries(record)) {
        const term = document.createElement("dt");
        term.textContent = key;
        const description = document.createElement("dd");
        description.textContent = value;
        list.append(term, description);
      }
      dialog.append(header, list);
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
      dialog.addEventListener("close", () => dialog.remove(), { once: true });
      document.body.append(dialog);
      dialog.showModal();
    }

    renderSearchResults(results, query, onOpen) {
      const host = document.querySelector("#search-results");
      host.replaceChildren();
      if (!query.trim()) {
        document.querySelector("#search-status").textContent =
          "La recherche s’effectue dans votre navigateur.";
        return;
      }
      document.querySelector("#search-status").textContent =
        `${results.length} fichier(s) trouvé(s).`;
      if (!results.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "Aucune correspondance dans les données importées.";
        host.append(empty);
        return;
      }
      for (const { file, count, excerpt: preview } of results) {
        const row = document.createElement("div");
        row.className = "search-result";
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = file.label;
        button.addEventListener("click", () => onOpen(file.path, query.trim()));
        const total = document.createElement("span");
        total.className = "search-match-count";
        total.textContent = `${count} correspondance(s)`;
        const excerpt = document.createElement("p");
        excerpt.textContent = `…${preview || ""}…`;
        row.append(button, total, excerpt);
        host.append(row);
      }
    }

    async renderPage(page, files, onOpen, getContent) {
      const host = document.querySelector("#page-view");
      host.replaceChildren();
      const configs = {
        stats: [
          "Statistiques du compte",
          "Vue d’ensemble de vos données importées.",
          "fa-chart-line",
        ],
        contacts: [
          "Liste de contacts",
          "Coordonnées et informations trouvées dans votre archive.",
          "fa-address-book",
        ],
        messages: [
          "Messages",
          "Recherchez et parcourez les conversations de votre archive.",
          "fa-comments",
        ],
        crawler: [
          "Autres utilisateurs",
          "Recherche de profils publics et contenus disponibles.",
          "fa-magnifying-glass",
        ],
        media: [
          "Médias importés",
          "Consultez et téléchargez les médias conservés dans ce navigateur.",
          "fa-images",
        ],
      };
      const [title, description, icon] = configs[page];
      const content = this.createPageShell(host, title, description, icon);
      const jsonFiles = files.filter((file) => file.hasJson);

      if (page === "media") {
        await this.renderMedia(content, files, getContent);
        return;
      }
      if (page === "crawler") {
        await this.renderCrawler(content);
        return;
      }
      if (!jsonFiles.length) {
        this.renderEmpty(
          content,
          "Aucune archive importée",
          "Ajoutez une archive ZIP ou un dossier décompressé pour afficher cette section.",
        );
        return;
      }
      if (page === "messages") {
        this.renderMessages(content, jsonFiles, onOpen);
        return;
      }
      this.renderSummary(content, page, files, jsonFiles, onOpen);
    }

    async renderCrawler(content) {
      const toolbar = document.createElement("form");
      toolbar.className = "page-toolbar crawler-toolbar";
      const input = document.createElement("input");
      input.type = "search";
      input.placeholder = "Nom d’utilisateur Instagram";
      input.setAttribute("aria-label", "Nom d’utilisateur Instagram");
      input.autocomplete = "off";
      const search = document.createElement("button");
      search.className = "primary-button";
      search.type = "submit";
      search.textContent = "Rechercher le profil";
      toolbar.append(input, search);

      const status = document.createElement("p");
      status.className = "page-status";
      status.setAttribute("role", "status");
      const profiles = document.createElement("div");
      profiles.className = "crawler-profiles";
      content.append(toolbar, status, profiles);

      const request = async (url, options) => {
        const response = await fetch(url, options);
        const payload = await response.json().catch(() => ({}));
        if (response.status === 404 && url.startsWith("/api/"))
          throw new Error("Le serveur web actif ne fournit pas l’API du scraper. Fermez le serveur statique et lancez node .web/server.js depuis la racine du projet.");
        if (!response.ok)
          throw new Error(payload.error || `Erreur du service local (${response.status}).`);
        return payload;
      };
      const drawProfiles = (users) => {
        profiles.replaceChildren();
        if (!users.length) {
          const empty = document.createElement("p");
          empty.className = "empty-state";
          empty.textContent = "Aucun profil n’est encore enregistré. Recherchez un nom d’utilisateur pour commencer.";
          profiles.append(empty);
          return;
        }
        for (const user of users) {
          const data = user.data || user;
          const card = document.createElement("article");
          card.className = "crawler-profile-card";
          const avatarUrl = data.profile_pic_url_hd || data.profile_pic_url || user.profilePic;
          if (avatarUrl) {
            const avatar = document.createElement("img");
            avatar.className = "crawler-avatar";
            avatar.src = avatarUrl;
            avatar.alt = "";
            avatar.loading = "lazy";
            card.append(avatar);
          }
          const details = document.createElement("div");
          details.className = "crawler-profile-details";
          const title = document.createElement("h2");
          title.textContent = data.full_name || `@${data.username || user.username}`;
          const username = document.createElement("p");
          username.className = "crawler-username";
          username.textContent = `@${data.username || user.username}`;
          details.append(title, username);
          const badges = [];
          if (data.is_verified) badges.push("Vérifié");
          if (data.is_private) badges.push("Compte privé");
          if (data.is_business_account || data.is_professional_account) badges.push("Professionnel");
          if (badges.length) {
            const badgeRow = document.createElement("p");
            badgeRow.className = "crawler-badges";
            badgeRow.textContent = badges.join(" · ");
            details.append(badgeRow);
          }
          const number = (value) => Number(value || 0).toLocaleString("fr-FR");
          const metrics = document.createElement("p");
          metrics.className = "crawler-metrics";
          metrics.textContent = `${number(data.follower_count ?? data.edge_followed_by?.count)} abonnés · ${number(data.following_count ?? data.edge_follow?.count)} abonnements · ${number(data.media_count ?? data.edge_owner_to_timeline_media?.count)} publications`;
          details.append(metrics);
          if (data.biography) {
            const biography = document.createElement("p");
            biography.className = "crawler-biography";
            biography.textContent = data.biography;
            details.append(biography);
          }
          const refresh = document.createElement("button");
          refresh.type = "button";
          refresh.className = "crawler-refresh";
          refresh.textContent = "Actualiser";
          refresh.addEventListener("click", async () => {
            refresh.disabled = true;
            status.textContent = `Actualisation du profil @${user.username}…`;
            try {
              await request(`/api/users/${encodeURIComponent(user.username)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh: true }),
              });
              await loadProfiles();
              status.textContent = `Profil @${user.username} actualisé et enregistré.`;
            } catch (error) {
              status.textContent = error.message;
            } finally {
              refresh.disabled = false;
            }
          });
          details.append(refresh);
          card.append(details);
          profiles.append(card);
        }
      };
      const loadProfiles = async () => {
        try {
          const users = await request("/api/users");
          drawProfiles(users);
          if (!status.textContent) status.textContent = `${users.length} profil(s) en cache local.`;
        } catch (_) {
          drawProfiles([]);
          status.textContent = "Le service du scraper n’est pas lancé. Démarrez la version web avec node .web/server.js pour rechercher et enregistrer des profils.";
        }
      };

      toolbar.addEventListener("submit", async (event) => {
        event.preventDefault();
        const username = input.value.trim().replace(/^@/, "");
        if (!username) {
          status.textContent = "Saisissez un nom d’utilisateur Instagram.";
          input.focus();
          return;
        }
        search.disabled = true;
        status.textContent = `Recherche du profil @${username}…`;
        try {
          const restrictedResponse = await request("/api/restricted-usernames");
          const restricted = Array.isArray(restrictedResponse)
            ? restrictedResponse
            : Array.isArray(restrictedResponse?.usernames)
              ? restrictedResponse.usernames
              : [];
          if (restricted.some((name) => String(name).replace(/^@/, "").toLowerCase() === username.toLowerCase()))
            throw new Error("Ce compte a demandé à préserver son anonymat.");
          const profile = await request(`/api/users/${encodeURIComponent(username)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh: false }),
          });
          if (String(profile.username || "").toLowerCase() !== username.toLowerCase())
            throw new Error("Instagram n’a pas renvoyé le compte exact demandé.");
          await loadProfiles();
          status.textContent = profile.is_private
            ? `@${username} est privé ; les informations accessibles ont été enregistrées.`
            : `Profil @${username} récupéré et enregistré localement.`;
        } catch (error) {
          status.textContent = error.message;
        } finally {
          search.disabled = false;
        }
      });
      await loadProfiles();
    }

    createPageShell(host, title, description, icon) {
      const main = document.createElement("main");
      main.className = "page-shell";
      const header = document.createElement("header");
      header.className = "page-header";
      const heading = document.createElement("div");
      heading.className = "page-heading";
      const kicker = document.createElement("p");
      kicker.className = "page-kicker";
      kicker.textContent = "INSTAGRAM DATA VIEWER";
      const titleElement = document.createElement("h1");
      const titleIcon = document.createElement("i");
      titleIcon.className = `fa-solid ${icon}`;
      titleElement.append(titleIcon, document.createTextNode(` ${title}`));
      const details = document.createElement("p");
      details.className = "page-description";
      details.textContent = description;
      heading.append(kicker, titleElement, details);
      const back = document.createElement("button");
      back.className = "page-back";
      back.type = "button";
      back.dataset.action = "home";
      back.textContent = "Retour";
      header.append(heading, back);
      const content = document.createElement("section");
      content.className = "page-content";
      main.append(header, content);
      host.append(main);
      return content;
    }

    renderEmpty(content, title, description) {
      const box = document.createElement("div");
      box.className = "empty-state";
      const heading = document.createElement("h2");
      heading.textContent = title;
      const details = document.createElement("p");
      details.textContent = description;
      box.append(heading, details);
      content.append(box);
    }

    renderMessages(content, files, onOpen) {
      const conversations = files.filter((file) => /message|inbox/i.test(file.path));
      if (!conversations.length) {
        this.renderEmpty(
          content,
          "Aucune conversation détectée",
          "Vérifiez que l’archive contient le dossier your_instagram_activity/messages.",
        );
        return;
      }
      const search = document.createElement("input");
      search.className = "page-search";
      search.type = "search";
      search.placeholder = "Filtrer les conversations";
      const list = document.createElement("div");
      list.className = "conversation-list";
      const draw = () => {
        list.replaceChildren();
        for (const file of conversations.filter((item) =>
          `${item.label} ${item.path}`
            .toLocaleLowerCase("fr-FR")
            .includes(search.value.toLocaleLowerCase("fr-FR")),
        )) {
          const button = document.createElement("button");
          button.className = "conversation-card";
          button.type = "button";
          const icon = document.createElement("i");
          icon.className = "fa-solid fa-comments";
          const label = document.createElement("span");
          label.textContent = file.label;
          const path = document.createElement("small");
          path.textContent = file.path;
          button.append(icon, label, path);
          button.addEventListener("click", () => onOpen(file.path));
          list.append(button);
        }
      };
      search.addEventListener("input", draw);
      content.append(search, list);
      draw();
    }

    renderSummary(content, page, files, jsonFiles, onOpen) {
      const count = (pattern) => jsonFiles.filter((file) => pattern.test(file.path)).length;
      const metrics = page === "stats"
        ? [
            ["Fichiers JSON", jsonFiles.length],
            [
              "Données importées",
              LocalDataModel.formatBytes(
                files.reduce((sum, file) => sum + file.size, 0),
              ),
            ],
            ["Conversations", count(/messages\/inbox/i)],
            ["Fichiers média", files.filter((file) => !file.hasJson).length],
          ]
        : [
            ["Fichiers de contacts", count(/contact|address/i)],
            ["Connexions", count(/connections|followers_and_following/i)],
            ["Fichiers JSON", jsonFiles.length],
          ];
      const grid = document.createElement("div");
      grid.className = "stats-detail-grid";
      for (const [label, value] of metrics) {
        const card = document.createElement("article");
        const name = document.createElement("span");
        name.textContent = label;
        const total = document.createElement("strong");
        total.textContent = typeof value === "number" ? value.toLocaleString("fr-FR") : value;
        card.append(name, total);
        grid.append(card);
      }
      content.append(grid);
      const matching = page === "contacts"
        ? jsonFiles.filter((file) => /contact|address|connections/i.test(file.path))
        : jsonFiles.filter((file) => /activity|connections|messages/i.test(file.path));
      for (const file of matching.slice(0, 50)) {
        const button = document.createElement("button");
        button.className = "feature-file";
        button.type = "button";
        button.dataset.filePath = file.path;
        button.textContent = file.label;
        button.addEventListener("click", () => onOpen(file.path));
        content.append(button);
      }
    }

    async renderMedia(content, files, getContent) {
      const mediaFiles = files.filter((file) => !file.hasJson);
      if (!mediaFiles.length) {
        this.renderEmpty(
          content,
          "Aucun média importé",
          "Importez une archive Instagram ou un dossier décompressé pour afficher ses médias.",
        );
        return;
      }
      const grid = document.createElement("div");
      grid.className = "web-media-grid";
      let visibleCount = Math.min(24, mediaFiles.length);
      let objectUrls = [];
      const draw = async () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls = [];
      grid.replaceChildren();
      for (const file of mediaFiles.slice(0, visibleCount)) {
        const payload = await getContent(file.path);
        if (!payload?.blob) continue;
        const card = document.createElement("article");
        card.className = "web-media-card";
        const url = URL.createObjectURL(payload.blob);
        objectUrls.push(url);
        const extension = file.path.split(".").pop().toLowerCase();
        const type = file.type || {
          jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
          gif: "image/gif", webp: "image/webp", mp4: "video/mp4",
          mov: "video/quicktime", mp3: "audio/mpeg", m4a: "audio/mp4",
          ogg: "audio/ogg",
        }[extension] || "";
        let preview;
        if (/^(image|video|audio)\//.test(type)) {
          preview = document.createElement(
            type.startsWith("video/") ? "video" : type.startsWith("audio/") ? "audio" : "img",
          );
          preview.src = url;
          if (preview.tagName === "IMG") preview.alt = file.label;
          else preview.controls = true;
        } else {
          preview = document.createElement("div");
          preview.className = "web-media-placeholder";
          preview.textContent = "Fichier";
        }
        const label = document.createElement("span");
        label.textContent = file.label;
        label.title = file.path;
        const download = document.createElement("a");
        download.href = url;
        download.download = file.path.split(/[\\/]/).pop();
        download.textContent = "Télécharger";
        card.append(preview, label, download);
        grid.append(card);
      }
      };
      content.append(grid);
      await draw();
      if (visibleCount < mediaFiles.length) {
        const more = document.createElement("button");
        more.className = "media-load-more";
        more.type = "button";
        more.textContent = "Afficher plus de médias";
        more.addEventListener("click", async () => {
          more.disabled = true;
          visibleCount = Math.min(visibleCount + 24, mediaFiles.length);
          await draw();
          if (visibleCount >= mediaFiles.length) more.remove();
          else more.disabled = false;
        });
        content.append(more);
      }
    }

    toast(message) {
      const notice = document.createElement("div");
      notice.className = "toast";
      notice.textContent = message;
      document.body.append(notice);
      setTimeout(() => notice.remove(), 3800);
    }
  }

  window.AppView = AppView;
})();
