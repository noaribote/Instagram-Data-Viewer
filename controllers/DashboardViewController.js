class DashboardViewController {
  constructor(api, view, modelController) {
    this.api = api;
    this.view = view;
    this.modelController = modelController;

    this.searchTimer = null;
    this.searching = false;
    this.pendingQuery = null;
    this.searchVersion = 0;

    this.files = [];
    this.statsRefreshInProgress = false;
    this.statsRefreshPending = false;
  }

  start() {
    this.view.onSearch((query) => this.queueSearch(query));
    this.view.onOpenResult((path, query) =>
      this.modelController.openJsonPath(path, query),
    );

    window.addEventListener("dashboard-search-reset", () => this.resetSearch());
    window.addEventListener("model-json-files-refreshed", (event) => {
      this.files = event.detail.files;
      this.refreshStats();
    });

    this.refreshStats();
  }

  async refreshStats() {
    if (this.statsRefreshInProgress) {
      this.statsRefreshPending = true;
      return;
    }

    this.statsRefreshInProgress = true;

    try {
      const stats = await this.api.getDashboardStats();
      this.view.updateStats(stats);
    } catch (error) {
      console.error("Impossible de charger les statistiques :", error);
    } finally {
      this.statsRefreshInProgress = false;

      if (this.statsRefreshPending) {
        this.statsRefreshPending = false;
        this.refreshStats();
      }
    }
  }

  queueSearch(query) {
    window.clearTimeout(this.searchTimer);
    this.searchVersion++;

    this.searchTimer = window.setTimeout(() => {
      this.pendingQuery = query.trim();
      this.runSearches();
    }, 350);
  }

  async runSearches() {
    if (this.searching) return;

    this.searching = true;

    try {
      while (this.pendingQuery !== null) {
        const query = this.pendingQuery;
        this.pendingQuery = null;

        if (!query) {
          this.view.clearResults();
          this.view.setSearchStatus("Recherche locale sur cet appareil.");
          continue;
        }

        this.view.setSearchStatus("Recherche en cours dans les fichiers JSON…");
        const version = this.searchVersion;
        const results = await this.api.searchModelJson(query);
        const queryIsCurrent =
          version === this.searchVersion && this.view.getQuery() === query;

        if (queryIsCurrent) {
          this.view.renderResults(results, this.files, query);
        }
      }
    } catch (error) {
      this.view.setSearchStatus("La recherche a échoué.");
      console.error("Impossible de rechercher dans les données JSON :", error);
    } finally {
      this.searching = false;

      if (this.pendingQuery !== null) {
        this.runSearches();
      }
    }
  }

  resetSearch() {
    window.clearTimeout(this.searchTimer);
    this.searchVersion++;
    this.pendingQuery = null;
    this.view.resetSearch();
  }
}

window.DashboardViewController = DashboardViewController;
