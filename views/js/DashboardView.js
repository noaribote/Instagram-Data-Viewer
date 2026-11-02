class DashboardView {
  constructor() {
    this.friendCount = document.getElementById("dashboard-friend-count");
    this.conversationCount = document.getElementById(
      "dashboard-conversation-count",
    );
    this.sentMessageCount = document.getElementById(
      "dashboard-sent-message-count",
    );
    this.searchInput = document.getElementById("global-search");
    this.searchStatus = document.getElementById("global-search-status");
    this.results = document.getElementById("global-search-results");
    this.detailsDialog = this.createDetailsDialog();
  }

  createDetailsDialog() {
    const dialog = document.createElement("dialog");
    dialog.className = "app-dialog search-details-dialog";
    const header = document.createElement("header");
    const title = document.createElement("h2");
    title.textContent = "Toutes les correspondances";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Fermer";
    close.addEventListener("click", () => dialog.close());
    header.append(title, close);
    const content = document.createElement("div");
    content.className = "search-details-content";
    dialog.append(header, content);
    document.body.append(dialog);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    this.detailsContent = content;
    return dialog;
  }

  onSearch(callback) {
    this.searchInput.addEventListener("input", () =>
      callback(this.searchInput.value),
    );
  }

  onOpenResult(callback) {
    this.results.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-json-path]");
      if (button) {
        callback(button.dataset.jsonPath, button.dataset.searchQuery || "");
      }
    });
  }

  getQuery() {
    return this.searchInput.value.trim();
  }

  resetSearch() {
    this.searchInput.value = "";
    this.clearResults();
    this.setSearchStatus("Recherche locale sur cet appareil.");
  }

  clearResults() {
    this.results.replaceChildren();
    this.results.parentElement.querySelector(".search-pagination")?.remove();
  }

  updateStats(stats) {
    if (this.friendCount)
      this.friendCount.textContent = stats.friendCount.toLocaleString("fr-FR");
    if (this.conversationCount)
      this.conversationCount.textContent =
        stats.conversationCount.toLocaleString("fr-FR");
    if (this.sentMessageCount)
      this.sentMessageCount.textContent =
        stats.sentMessageCount.toLocaleString("fr-FR");
  }

  setSearchStatus(message) {
    this.searchStatus.textContent = message;
  }

  appendMarkedText(container, text, query) {
    const value = String(text ?? "");
    const needle = String(query || "").toLocaleLowerCase();
    if (!needle) {
      container.append(document.createTextNode(value));
      return;
    }
    const lower = value.toLocaleLowerCase();
    let cursor = 0;
    let index = lower.indexOf(needle);
    while (index !== -1) {
      container.append(document.createTextNode(value.slice(cursor, index)));
      const mark = document.createElement("mark");
      mark.textContent = value.slice(index, index + needle.length);
      container.append(mark);
      cursor = index + needle.length;
      index = lower.indexOf(needle, cursor);
    }
    container.append(document.createTextNode(value.slice(cursor)));
  }

  createExcerpt(match, query, className = "search-json-excerpt") {
    const excerpt = document.createElement("p");
    excerpt.className = className;
    this.appendMarkedText(excerpt, match.before, query);
    this.appendMarkedText(excerpt, match.value || query, query);
    this.appendMarkedText(excerpt, match.after, query);
    return excerpt;
  }

  showAllMatches(item, query) {
    this.detailsContent.replaceChildren();
    const fileName = document.createElement("p");
    fileName.className = "search-details-file";
    fileName.textContent = item.file?.label || item.path;
    this.detailsContent.append(fileName);
    for (const match of item.matches) {
      this.detailsContent.append(this.createExcerpt(match, query));
    }
    if (item.matchCount > item.matches.length) {
      const note = document.createElement("p");
      note.className = "search-json-limit";
      note.textContent = `Les ${item.matches.length} premiers extraits sont affichés sur ${item.matchCount} correspondances.`;
      this.detailsContent.append(note);
    }
    this.detailsDialog.showModal();
  }

  renderResults(results, files, query) {
    this.clearResults();
    const grouped = new Map();
    for (const result of results) {
      const file = files.find(
        (entry) =>
          entry.path === result.path || entry.paths?.includes(result.path),
      );
      const key = file?.path || result.path;
      const current = grouped.get(key);
      if (current) {
        current.matchCount += result.matchCount;
        current.matches.push(
          ...result.matches.slice(0, Math.max(0, 100 - current.matches.length)),
        );
      } else {
        grouped.set(key, {
          file,
          path: result.path,
          matchCount: result.matchCount,
          matches: result.matches.slice(0, 100),
        });
      }
    }
    const items = [...grouped.values()];
    if (!items.length) {
      const empty = document.createElement("p");
      empty.textContent = "Aucun résultat.";
      this.results.append(empty);
      this.setSearchStatus("0 fichier trouvé.");
      return;
    }

    const pageSize = 2;
    let page = 0;
    const table = document.createElement("table");
    table.className = "global-search-table";
    const head = document.createElement("thead");
    const heading = document.createElement("tr");
    for (const label of ["Fichier", "Résultats", " "]) {
      const cell = document.createElement("th");
      cell.textContent = label;
      heading.append(cell);
    }
    head.append(heading);
    const body = document.createElement("tbody");
    table.append(head, body);

    const pagination = document.createElement("div");
    pagination.className = "search-pagination";
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "Précédent";
    const pageLabel = document.createElement("span");
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Suivant";
    pagination.append(previous, pageLabel, next);

    const renderPage = () => {
      const pageCount = Math.ceil(items.length / pageSize);
      pageLabel.textContent = `${page + 1} / ${pageCount}`;
      previous.disabled = page === 0;
      next.disabled = page >= pageCount - 1;
      body.replaceChildren();
      const pageItems = items.slice(page * pageSize, (page + 1) * pageSize);
      for (const item of pageItems) {
        const row = document.createElement("tr");
        const fileCell = document.createElement("td");
        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.dataset.jsonPath = item.path;
        openButton.dataset.searchQuery = query;
        this.appendMarkedText(openButton, item.file?.label || item.path, query);
        fileCell.append(openButton);

        const countCell = document.createElement("td");
        countCell.textContent = item.matchCount.toLocaleString("fr-FR");
        const jsonCell = document.createElement("td");
        const preview = document.createElement("div");
        preview.className = "search-match-preview";
        for (const match of item.matches) {
          preview.append(this.createExcerpt(match, query));
        }
        jsonCell.append(preview);
        const showAll = document.createElement("button");
        showAll.type = "button";
        showAll.className = "show-all-matches";
        showAll.textContent = "Afficher toutes les correspondances";
        showAll.hidden = true;
        showAll.addEventListener("click", () =>
          this.showAllMatches(item, query),
        );
        jsonCell.append(showAll);
        row.append(fileCell, countCell, jsonCell);
        body.append(row);
        requestAnimationFrame(() => {
          const hasMoreMatches = item.matchCount > item.matches.length;
          const previewIsTruncated =
            preview.scrollHeight > preview.clientHeight + 1;
          if (hasMoreMatches || previewIsTruncated) {
            showAll.hidden = false;
          }
        });
      }
    };
    previous.addEventListener("click", () => {
      page--;
      renderPage();
    });
    next.addEventListener("click", () => {
      page++;
      renderPage();
    });
    this.results.append(table);
    this.results.after(pagination);
    renderPage();
    this.setSearchStatus(`${items.length} fichier(s) trouvé(s).`);
  }
}

window.DashboardView = DashboardView;
