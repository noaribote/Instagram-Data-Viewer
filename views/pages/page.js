(() => {
  const PAGE = document.body.dataset.page;
  const session = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let requestId = 0;
  const pending = new Map();
  const pendingMediaDownloads = new Map();
  const request = (method, ...args) =>
    new Promise((resolve, reject) => {
      const id = ++requestId;
      pending.set(id, { resolve, reject });
      window.parent.postMessage(
        { channel: "ig-view", type: "api-request", session, id, method, args },
        "*",
      );
    });
  const goHome = () =>
    window.parent.postMessage(
      { channel: "ig-view", type: "navigate-home" },
      "*",
    );
  const openJson = (selection) =>
    window.parent.postMessage(
      { channel: "ig-view", type: "open-json", selection },
      "*",
    );
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const makePage = (title, description, icon) => {
    const shell = document.createElement("main");
    shell.className = "page-shell";
    const header = node("header", "page-header");
    const heading = node("div", "page-heading");
    const titleNode = node("h1");
    const titleIcon = node("i", `fa-solid ${icon}`);
    titleNode.append(titleIcon, document.createTextNode(` ${title}`));
    heading.append(
      node("p", "page-kicker", "INSTAGRAM DATA VIEWER"),
      titleNode,
      node("p", "page-description", description),
    );
    const back = node("button", "page-back", "Retour");
    back.type = "button";
    back.addEventListener("click", goHome);
    if (PAGE === "messages") back.textContent = "Retour";
    header.append(heading, back);
    const content = node("section", "page-content");
    shell.append(header, content);
    document.body.append(shell);
    return content;
  };
  const showDialog = (title, content, actions = [], className = "") => {
    const dialog = node("dialog", `app-dialog ${className}`.trim());
    const header = node("header", "app-dialog-header");
    header.append(node("h2", "", title));
    const close = node("button", "", "Fermer");
    close.type = "button";
    close.addEventListener("click", () => dialog.close());
    header.append(close);
    const body = node("div", "app-dialog-body");
    body.append(content);
    dialog.append(header, body);
    if (actions.length) {
      const footer = node("footer", "dialog-actions");
      for (const action of actions) footer.append(action);
      dialog.append(footer);
    }
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.showModal();
    return dialog;
  };
  const formatDate = (timestamp) =>
    new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(timestamp);
  const makeProgress = (label = "Opération en cours…") => {
    const wrap = node("div", "operation-progress");
    const bar = node("progress");
    bar.removeAttribute("value");
    bar.max = 100;
    const message = node("span", "", label);
    wrap.append(bar, message);
    return { wrap, bar, message };
  };
  const addImageDownloadButton = (
    container,
    image,
    source,
    progressHost = container,
  ) => {
    container.classList.add("image-download-container");
    const button = node("button", "image-download-button");
    button.type = "button";
    button.title = "Télécharger cette image";
    button.setAttribute("aria-label", "Télécharger cette image");
    button.append(node("i", "fa-solid fa-download"));
    const progress = makeProgress("Préparation du téléchargement…");
    progress.wrap.hidden = true;
    progressHost.append(progress.wrap);
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      button.disabled = true;
      progress.wrap.hidden = false;
      progress.bar.removeAttribute("value");
      try {
        const result = await request("downloadImage", source);
        if (result?.canceled)
          progress.message.textContent = "Téléchargement annulé.";
        else {
          progress.bar.value = 100;
          progress.message.textContent = "Image enregistrée.";
        }
      } catch (error) {
        progress.bar.value = 100;
        progress.message.textContent = error.message;
      } finally {
        button.disabled = false;
        window.setTimeout(() => {
          progress.wrap.hidden = true;
        }, 2400);
      }
    });
    container.append(button);
    image.addEventListener(
      "error",
      () => {
        button.remove();
        progress.wrap.remove();
      },
      { once: true },
    );
  };
  const profileDialog = (profile) => {
    const content = node("div", "profile-detail");
    const hero = node("section", "profile-hero");
    const avatar = node("div", "profile-hero-avatar");
    const imageUrl = profile.profile_pic_url_hd || profile.profile_pic_url;
    if (imageUrl) {
      const image = node("img");
      image.src = imageUrl;
      image.alt = "";
      image.addEventListener(
        "error",
        () => {
          image.remove();
          avatar.append(node("i", "fa-solid fa-user"));
        },
        { once: true },
      );
      avatar.append(image);
      addImageDownloadButton(avatar, image, { url: imageUrl }, content);
    } else avatar.append(node("i", "fa-solid fa-user"));
    const identity = node("div", "profile-identity");
    identity.append(
      node("h3", "", profile.full_name || `@${profile.username || ""}`),
    );
    identity.append(
      node(
        "p",
        "profile-username",
        `@${profile.username || "identifiant indisponible"}`,
      ),
    );
    const badges = node("div", "profile-badges");
    if (profile.is_verified)
      badges.append(node("span", "profile-badge verified", "Compte vérifié"));
    if (profile.is_private)
      badges.append(node("span", "profile-badge", "Compte privé"));
    if (profile.is_business_account || profile.is_professional_account)
      badges.append(node("span", "profile-badge", "Compte professionnel"));
    if (profile.category_name || profile.category)
      badges.append(
        node(
          "span",
          "profile-badge",
          profile.category_name || profile.category,
        ),
      );
    if (badges.childElementCount) identity.append(badges);
    hero.append(avatar, identity);
    content.append(hero);

    const metrics = node("div", "profile-metrics");
    const metricValues = [
      ["Abonnés", profile.follower_count ?? profile.edge_followed_by?.count],
      ["Abonnements", profile.following_count ?? profile.edge_follow?.count],
      [
        "Publications",
        profile.media_count ?? profile.edge_owner_to_timeline_media?.count,
      ],
    ];
    for (const [label, value] of metricValues) {
      const metric = node("article", "profile-metric");
      metric.append(
        node(
          "strong",
          "",
          value == null ? "—" : Number(value).toLocaleString("fr-FR"),
        ),
        node("span", "", label),
      );
      metrics.append(metric);
    }
    content.append(metrics);

    if (
      profile.biography ||
      profile.external_url ||
      profile.bio_links?.length
    ) {
      const biography = node("section", "profile-panel");
      biography.append(node("h3", "", "À propos"));
      if (profile.biography)
        biography.append(node("p", "profile-biography", profile.biography));
      const links = node("div", "profile-bio-links");
      for (const item of profile.bio_links || []) {
        const url = String(item.url || item.lynx_url || "");
        if (!/^https?:\/\//i.test(url)) continue;
        const link = node("a", "profile-bio-link", item.title || url);
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.append(node("i", "fa-solid fa-arrow-up-right-from-square"));
        links.append(link);
      }
      if (links.childElementCount) biography.append(links);
      if (profile.external_url) {
        const url = String(profile.external_url);
        if (/^https?:\/\//i.test(url)) {
          const link = node("a", "profile-link", url);
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          biography.append(link);
        }
      }
      content.append(biography);
    }

    const highlightSection = node(
      "section",
      "profile-panel profile-highlights-panel",
    );
    highlightSection.append(node("h3", "", "Stories à la une"));
    const highlightGrid = node("div", "profile-highlights-grid");
    const highlights =
      profile.lox_highlights_connection?.edges || profile.highlights || [];
    for (const entry of highlights) {
      const highlight = entry.node || entry;
      const title = highlight.title || "Story à la une";
      const coverUrl =
        highlight.cover_media_cropped_thumbnail_url ||
        highlight.cover_url ||
        highlight.cover_media_url;
      const item = node("article", "profile-highlight");
      const cover = node("div", "profile-highlight-cover");
      if (coverUrl && /^https?:\/\//i.test(coverUrl)) {
        const coverImage = node("img");
        coverImage.src = coverUrl;
        coverImage.alt = "";
        coverImage.addEventListener(
          "error",
          () => {
            coverImage.remove();
            cover.append(node("i", "fa-regular fa-circle"));
          },
          { once: true },
        );
        cover.append(coverImage);
        addImageDownloadButton(cover, coverImage, { url: coverUrl }, content);
      } else cover.append(node("i", "fa-regular fa-circle"));
      item.append(cover, node("span", "", title));
      highlightGrid.append(item);
    }
    if (highlightGrid.childElementCount) highlightSection.append(highlightGrid);
    else
      highlightSection.append(
        node("p", "profile-empty-note", "Aucune story à la une disponible."),
      );
    if (!profile.is_private) content.append(highlightSection);

    const omitted = new Set([
      "profile_pic_url",
      "profile_pic_url_hd",
      "edge_followed_by",
      "edge_follow",
      "edge_owner_to_timeline_media",
      "recent_posts",
      "recent_posts_error",
      "biography",
      "external_url",
      "bio_links",
      "lox_highlights_connection",
      "highlights",
      "username",
      "full_name",
      "follower_count",
      "following_count",
      "media_count",
      "is_verified",
      "is_private",
      "is_business_account",
      "is_professional_account",
      "category",
      "category_name",
    ]);
    const hiddenProfileFields = new Set([
      "followedbyviewer",
      "followsviewer",
      "blockedbyviewer",
      "hasblockedviewer",
      "hasrequestedviewer",
      "requestedbyviewer",
      "pk",
      "isunpublished",
      "ismemorialized",
      "accountbadges",
      "showtextpostappbadge",
      "textpostappbadgelabel",
      "iscoppaenforced",
    ]);
    const translatedLabels = {
      all_media_count: "Nombre total de publications",
      latest_reel_media: "Dernière vidéo publiée",
      has_any_clips: "Vidéos disponibles",
      linked_fb_info: "Compte Facebook associé",
      pronouns: "Pronoms",
      id: "Identifiant Instagram",
      is_private: "Compte privé",
      is_verified: "Compte vérifié",
      is_business_account: "Compte professionnel",
      is_professional_account: "Compte professionnel",
      category_name: "Catégorie",
      category: "Catégorie",
    };
    const fields = node("section", "profile-panel");
    fields.append(node("h3", "", "Informations du compte"));
    const fieldGrid = node("div", "profile-information-grid");
    const labelFor = (key) => translatedLabels[key] || "Autre information";
    const addValue = (container, key, value) => {
      if (value === null || value === undefined || value === "") return;
      if (typeof value === "boolean") {
        container.textContent = value ? "Oui" : "Non";
        return;
      }
      if (typeof value === "number") {
        container.textContent = value.toLocaleString("fr-FR");
        return;
      }
      if (typeof value === "string") {
        if (/^https?:\/\//i.test(value)) {
          const link = node("a", "profile-link", value);
          link.href = value;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          container.append(link);
        } else container.textContent = value;
        return;
      }
      if (
        Array.isArray(value) &&
        value.every((item) => ["string", "number"].includes(typeof item))
      ) {
        container.textContent = value.map(String).join(" · ") || "—";
        return;
      }
      const count =
        value && typeof value === "object" && Number.isFinite(value.count)
          ? value.count
          : null;
      if (count !== null) {
        container.textContent = Number(count).toLocaleString("fr-FR");
        return;
      }
      const pre = node("pre", "profile-nested-value");
      try {
        pre.textContent = JSON.stringify(value, null, 2);
      } catch {
        pre.textContent = String(value);
      }
      container.append(pre);
    };
    for (const [key, value] of Object.entries(profile || {})) {
      if (
        omitted.has(key) ||
        hiddenProfileFields.has(key.replace(/[^a-z]/gi, "").toLocaleLowerCase())
      )
        continue;
      const item = node("article", "profile-information-item");
      item.append(node("span", "profile-field-label", labelFor(key)));
      const valueNode = node("div", "profile-field-value");
      addValue(valueNode, key, value);
      if (!valueNode.childNodes.length && !valueNode.textContent) continue;
      item.append(valueNode);
      fieldGrid.append(item);
    }
    if (fieldGrid.childElementCount) fields.append(fieldGrid);
    else
      fields.append(
        node(
          "p",
          "profile-empty-note",
          "Aucune autre information de profil n’est disponible.",
        ),
      );
    content.append(fields);

    if (Array.isArray(profile.recent_posts) && profile.recent_posts.length) {
      const posts = node("section", "profile-panel");
      posts.append(node("h3", "", "Publications récentes"));
      const postGrid = node("div", "profile-post-grid");
      for (const post of profile.recent_posts) {
        const card = node("article", "profile-post-card");
        card.append(
          node(
            "small",
            "",
            post.date
              ? new Date(post.date).toLocaleDateString("fr-FR")
              : "Date indisponible",
          ),
        );
        const postMetrics = node(
          "p",
          "profile-post-metrics",
          `${Number(post.likes || 0).toLocaleString("fr-FR")} J’aime · ${Number(post.comments || 0).toLocaleString("fr-FR")} commentaires`,
        );
        card.append(postMetrics);
        if (post.caption)
          card.append(node("p", "profile-post-caption", post.caption));
        postGrid.append(card);
      }
      posts.append(postGrid);
      content.append(posts);
    } else if (profile.recent_posts_error) {
      content.append(
        node(
          "p",
          "profile-empty-note",
          "Les publications récentes ne sont pas accessibles pour ce profil.",
        ),
      );
    }
    const mediaPanel = node("section", "profile-panel profile-downloaded-media");
    mediaPanel.append(node("h3", "", "Stories et publications (anonyme)"));
    const mediaList = node("div", "profile-media-grid");
    const renderMedia = async () => {
      mediaList.replaceChildren();
      const files = await request("listUserMedia", profile.username);
      if (!files.length) { mediaList.append(node("p", "profile-empty-note", "Aucun média téléchargé.")); return; }
      for (const file of files) {
        const card = node("article", "profile-media-card");
        const mediaLabels = {
          stories: "Story",
          highlights: "À la une",
          posts: "Post",
          reels: "Reel",
        };
        card.append(node("small", "", mediaLabels[file.category] || file.category));
        const source = `../../model/${file.path.split("/").map(encodeURIComponent).join("/")}`;
        if (/\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
          const player = node("video", "profile-downloaded-preview"); player.src = source; player.controls = true; player.preload = "metadata"; card.append(player);
        } else if (/\.(jpe?g|png|gif|webp|avif|bmp|tiff?|heic|heif)$/i.test(file.name)) {
          const image = node("img", "profile-downloaded-preview"); image.src = source; image.alt = file.name; card.append(image);
        } else {
          const link = node("a", "profile-empty-note", file.name); link.href = source; link.target = "_blank"; link.rel = "noopener noreferrer"; card.append(link);
        }
        mediaList.append(card);
      }
    };
    const startDownload = node("button", "secondary-button", "Tout télécharger");
    startDownload.type = "button";
    startDownload.addEventListener("click", async () => {
      const backdrop = node("dialog", "user-media-progress-dialog");
      backdrop.addEventListener("cancel", (event) => event.preventDefault());
      const popup = node("section", "copy-modal");
      const title = node("h2", "", "Téléchargement du contenu");
      const message = node("p", "", "Préparation…");
      const bar = node("progress"); bar.max = 100; bar.removeAttribute("value");
      const cancel = node("button", "", "Annuler"); cancel.type = "button";
      let finished = false;
      const closePopup = () => {
        backdrop.close();
        backdrop.remove();
        startDownload.disabled = false;
      };
      cancel.addEventListener("click", () => {
        if (finished) {
          closePopup();
          return;
        }
        window.parent.postMessage({ channel: "ig-view", type: "user-media-cancel" }, "*");
        message.textContent = "Annulation en cours…";
        cancel.disabled = true;
      });
      popup.append(title, message, bar, cancel); backdrop.append(popup); document.body.append(backdrop); backdrop.showModal();
      startDownload.disabled = true;
      const finish = async (result) => {
        pendingMediaDownloads.delete(session);
        finished = true;
        cancel.disabled = false;
        if (result.error) {
          message.textContent = result.error;
          bar.value = 100;
          return;
        }
        closePopup();
        if (!result.result?.cancelled) await renderMedia();
      };
      pendingMediaDownloads.set(session, {
        update: (progress) => {
          const oneLine = String(progress.message || "Téléchargement en cours…").replace(/\s+/g, " ").trim();
          const maxLength = 80;
          message.textContent = oneLine.length > maxLength ? `${oneLine.slice(0, maxLength - 1)}…` : oneLine;
          if (progress.total > 0) { bar.max = progress.total; bar.value = progress.current || 0; } else bar.removeAttribute("value");
        },
        finish,
      });
      window.parent.postMessage({ channel: "ig-view", type: "api-request", session, id: ++requestId, method: "startUserMediaDownload", args: [profile.username] }, "*");
    });
    if (!profile.is_private) {
      mediaPanel.append(startDownload, mediaList);
      content.append(mediaPanel);
      renderMedia().catch(() => {});
    }
    showDialog(
      profile.full_name || `Profil @${profile.username || ""}`,
      content,
      [],
      "profile-detail-dialog",
    );
  };
  const profileCard = (user, options = {}) => {
    const profile = user.data || user;
    const card = node("article", "page-card profile-card");
    const avatar = profile.profile_pic_url_hd || profile.profile_pic_url;
    if (avatar) {
      const imageWrap = node("div", "profile-card-avatar-wrap");
      const image = node("img", "profile-avatar");
      image.src = avatar;
      image.alt = "";
      image.addEventListener("error", () => imageWrap.remove(), { once: true });
      imageWrap.append(image);
      addImageDownloadButton(imageWrap, image, { url: avatar }, card);
      card.append(imageWrap);
    }
    card.append(node("h2", "", `@${profile.username || user.username || ""}`));
    if (profile.full_name) card.append(node("p", "", profile.full_name));
    const followers = profile.follower_count ?? profile.edge_followed_by?.count;
    const following = profile.following_count ?? profile.edge_follow?.count;
    card.append(
      node(
        "p",
        "",
        `${followers ?? "—"} abonnés · ${following ?? "—"} abonnements`,
      ),
    );
    if (profile.biography) card.append(node("p", "", profile.biography));
    const actions = node("div", "card-actions");
    const view = node("button", "secondary-button", "Voir le profil");
    view.type = "button";
    view.addEventListener("click", () => profileDialog(profile));
    actions.append(view);
    if (profile.is_private)
      card.append(
        node(
          "p",
          "page-status",
          "Compte privé : les données détaillées ne sont pas disponibles.",
        ),
      );
    if (options.cached) {
      card.append(
        node("small", "", `Mis à jour le ${formatDate(user.updatedAt)}`),
      );
      const updateProgress = makeProgress("Mise à jour du profil…");
      updateProgress.wrap.hidden = true;
      card.append(updateProgress.wrap);
      const update = node("button", "secondary-button", "↻");
      update.type = "button";
      update.addEventListener("click", async () => {
        update.disabled = true;
        updateProgress.wrap.hidden = false;
        updateProgress.bar.removeAttribute("value");
        updateProgress.message.textContent =
          "Suppression de l’ancien fichier en cache…";
        try {
          await request("deleteCachedUser", user.username);
          updateProgress.message.textContent =
            "Téléchargement des nouvelles informations…";
          const data = await request("fetchPublicUser", user.username, false);
          const users = await options.onRefresh?.();
          const fresh = users?.find(
            (entry) =>
              entry.username.toLocaleLowerCase() ===
              user.username.toLocaleLowerCase(),
          );
          updateProgress.bar.value = 100;
          updateProgress.message.textContent = "Profil actualisé.";
          card.replaceWith(
            profileCard(
              fresh || { ...data, path: user.path, updatedAt: Date.now() },
              { ...options, cached: true },
            ),
          );
          status.textContent = `@${user.username} a été actualisé.`;
        } catch (error) {
          updateProgress.bar.value = 100;
          updateProgress.message.textContent = error.message;
          status.textContent = error.message;
        } finally {
          update.disabled = false;
        }
      });
      actions.append(update);
      const remove = node("button", "danger-button", "Supprimer");
      remove.type = "button";
      remove.addEventListener("click", () => {
        const message = node(
          "p",
          "",
          `Supprimer le profil @${user.username} du cache local ?`,
        );
        const confirm = node("button", "danger-button", "Supprimer");
        confirm.type = "button";
        const dialog = showDialog("Supprimer le profil du cache", message, [
          confirm,
        ]);
        confirm.addEventListener("click", async () => {
          confirm.disabled = true;
          try {
            await request("deleteCachedUser", user.username);
            dialog.close();
            card.remove();
            status.textContent = `@${user.username} a été supprimé du cache.`;
          } catch (error) {
            confirm.disabled = false;
            status.textContent = error.message;
          }
        });
      });
      actions.append(remove);
    }
    card.append(actions);
    return card;
  };
  let status;
  const renderStats = async (content) => {
    content.replaceChildren();
    status = node("p", "page-status", "Chargement des statistiques…");
    content.append(status);
    const stats = await request("getDashboardStats");
    status.textContent = "Données locales à jour";
    const fields = [
      ["Amis", stats.friendCount],
      ["Conversations", stats.conversationCount],
      ["Messages envoyés", stats.sentMessageCount],
      ["Publications aimées", stats.likes],
      ["Commentaires aimés", stats.likedComments],
      ["Commentaires publiés", stats.comments],
      ["Stories publiées", stats.stories],
      ["Stories vues", stats.storiesViewed],
      ["Likes sur les stories", stats.storyLikes],
      ["Publications enregistrées", stats.savedPosts],
      ["Musiques enregistrées", stats.savedMusic],
      ["Collections enregistrées", stats.savedCollections],
      ["Profils recherchés", stats.profileSearches],
      ["Recherches de mots ou expressions", stats.wordSearches],
      ["Publications consultées", stats.postsViewed],
      ["Vidéos regardées", stats.videosWatched],
      ["Abonnés", stats.followers],
      ["Abonnements", stats.following],
      ["Amis proches", stats.closeFriends],
      ["Demandes envoyées", stats.pendingRequests],
      ["Demandes reçues", stats.recentFollowRequests],
      ["Profils désabonnés récemment", stats.recentlyUnfollowed],
    ];
    const grid = node("div", "stats-grid");
    for (const [label, value] of fields) {
      const card = node("article", "stats-card");
      card.append(
        node("span", "", label),
        node("strong", "", Number(value || 0).toLocaleString("fr-FR")),
      );
      grid.append(card);
    }
    const compare = node(
      "button",
      "primary-button",
      "Comparer les abonnements",
    );
    compare.type = "button";
    compare.addEventListener("click", async () => {
      compare.disabled = true;
      try {
        const data = await request("getConnectionComparison");
        const body = node("div", "comparison-grid");
        for (const [label, key] of [
          ["Vous suit, mais vous ne le suivez pas", "followersNotFollowedBack"],
          ["Vous suivez, mais ne vous suit pas", "followingNotFollowingBack"],
        ]) {
          const section = node("section", "comparison-group");
          section.append(node("h3", "", `${label} (${data[key].length})`));
          const list = node("ul");
          for (const name of data[key]) list.append(node("li", "", name));
          section.append(list);
          body.append(section);
        }
        showDialog("Comparaison des abonnements", body);
      } catch (error) {
        status.textContent = error.message;
      } finally {
        compare.disabled = false;
      }
    });
    content.append(grid, compare);
  };
  const renderCrawler = async (content) => {
    content.replaceChildren();
    const toolbar = node("div", "page-toolbar");
    const input = node("input");
    input.type = "search";
    input.placeholder = "Nom d’utilisateur Instagram";
    const search = node("button", "primary-button", "Rechercher");
    search.type = "button";
    toolbar.append(input, search);
    status = node("p", "page-status");
    const result = node("div", "crawler-result");
    const grid = node("div", "card-grid crawler-grid");
    const lookupProgress = makeProgress("Recherche du profil…");
    lookupProgress.wrap.hidden = true;
    content.append(toolbar, lookupProgress.wrap, status, result, grid);
    let cachedUsers = [];
    const load = async () => {
      grid.setAttribute("aria-busy", "true");
      try {
        cachedUsers = await request("listCachedUsers");
      } finally {
        grid.removeAttribute("aria-busy");
      }
      grid.replaceChildren();
      if (!cachedUsers.length)
        grid.append(
          node(
            "p",
            "empty-state",
            "Aucun profil n’est encore enregistré dans le cache.",
          ),
        );
      else
        grid.append(
          ...cachedUsers.map((user) =>
            profileCard(user, { cached: true, onRefresh: load }),
          ),
        );
      return cachedUsers;
    };
    const lookup = async () => {
      const username = input.value.trim();
      if (!username) return;
      const normalizedUsername = username.replace(/^@/, "").toLowerCase();
      const listNoUsername = await request("getNoUsernameList");
      if (
        Array.isArray(listNoUsername) && listNoUsername.some(
          (blockedUsername) =>
            String(blockedUsername).replace(/^@/, "").toLowerCase() ===
            normalizedUsername,
        )
      ) {
        status.textContent =
          "L'utilisateur souhaite préserver son anonyma. Si vous pensez qu'il s'agit d'une erreur, veuillez contacter le développeur RIBOTE--MORAL Noa.";
        result.replaceChildren();
        return;
      }
      search.disabled = true;
      lookupProgress.wrap.hidden = false;
      lookupProgress.bar.removeAttribute("value");
      status.textContent = "Recherche du profil…";
      result.replaceChildren();
      try {
        const profile = await request("fetchPublicUser", username, false);
        if (
          String(profile.username || "").toLowerCase() !==
          username.replace(/^@/, "").toLowerCase()
        )
          throw new Error("Instagram n’a pas renvoyé le compte exact demandé.");
        status.textContent = profile.is_private
          ? "Compte privé : les données détaillées ne sont pas disponibles."
          : "Profil public trouvé et enregistré dans le cache.";
        await load();
        const cached = cachedUsers.find(
          (user) =>
            user.username.toLocaleLowerCase() ===
            username.replace(/^@/, "").toLocaleLowerCase(),
        );
        profileDialog(cached?.data || profile);
      } catch (error) {
        const message = String(error.message || "").toLowerCase();
        status.textContent =
          /profilenotexists|not found|does not exist|n’existe pas/.test(message)
            ? `Le compte @${username.replace(/^@/, "")} n’existe pas.`
            : /private|privé/.test(message)
              ? "Ce compte est privé ou ses données ne sont pas accessibles."
              : error.message;
      } finally {
        search.disabled = false;
        lookupProgress.bar.value = 100;
        lookupProgress.message.textContent = "Recherche terminée.";
        window.setTimeout(() => {
          lookupProgress.wrap.hidden = true;
        }, 1200);
      }
    };
    search.addEventListener("click", lookup);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") lookup();
    });
    await load();
  };
  const renderContacts = async (content) => {
    content.replaceChildren();
    const toolbar = node("div", "page-toolbar");
    const filter = node("input");
    filter.type = "search";
    filter.placeholder = "Filtrer les contacts";
    toolbar.append(filter);
    status = node("p", "page-status");
    const wrap = node("div", "page-table-wrap");
    const table = node("table", "page-table");
    const head = node("thead");
    const header = node("tr");
    for (const label of ["Type", "Valeur", "Fichier source"])
      header.append(node("th", "", label));
    head.append(header);
    const body = node("tbody");
    table.append(head, body);
    wrap.append(table);
    content.append(toolbar, status, wrap);
    let records = [];
    const draw = () => {
      const query = filter.value.trim().toLocaleLowerCase();
      body.replaceChildren();
      const visible = records.filter((entry) =>
        `${entry.type} ${entry.value} ${entry.source}`
          .toLocaleLowerCase()
          .includes(query),
      );
      for (const record of visible) {
        const row = node("tr");
        for (const value of [record.type, record.value, record.source])
          row.append(node("td", "", value));
        body.append(row);
      }
      status.textContent = `${visible.length.toLocaleString("fr-FR")} contact(s) affiché(s) sur ${records.length.toLocaleString("fr-FR")}`;
    };
    filter.addEventListener("input", draw);
    const refresh = async () => {
      records = await request("listContactData");
      draw();
    };
    await refresh();
    return refresh;
  };
  const renderMessages = async (content) => {
    content.replaceChildren();
    const toolbar = node("div", "page-toolbar");
    const filter = node("input");
    filter.type = "search";
    filter.placeholder = "Rechercher une conversation";
    toolbar.append(filter);
    status = node("p", "page-status");
    const grid = node("div", "card-grid");
    content.append(toolbar, status, grid);
    let conversations = [];
    const draw = () => {
      const query = filter.value.trim().toLocaleLowerCase();
      grid.replaceChildren();
      const visible = conversations.filter((item) =>
        `${item.label} ${item.path}`.toLocaleLowerCase().includes(query),
      );
      if (!visible.length)
        grid.append(
          node(
            "p",
            "empty-state",
            conversations.length
              ? "Aucune conversation ne correspond à la recherche."
              : "Aucune conversation dans les données importées.",
          ),
        );
      for (const conversation of visible) {
        const card = node("article", "page-card");
        card.append(
          node("h2", "", conversation.label),
          node("p", "", `${conversation.paths.length} fichier(s) JSON`),
        );
        const open = node("button", "primary-button", "Ouvrir la conversation");
        open.type = "button";
        open.addEventListener("click", () =>
          openJson({
            path: conversation.path,
            paths: conversation.paths,
            label: conversation.label,
            messageGroup: true,
          }),
        );
        card.append(open);
        grid.append(card);
      }
      status.textContent = `${conversations.length.toLocaleString("fr-FR")} conversations`;
    };
    filter.addEventListener("input", draw);
    const refresh = async () => {
      const files = await request("listModelJson");
      conversations =
        files.find((file) => file.allMessages)?.conversations || [];
      draw();
    };
    await refresh();
    return refresh;
  };

  window.addEventListener("message", (event) => {
    if (event.source === window.parent && event.data?.channel === "ig-view" && event.data.session === session && event.data.type === "user-media-progress") {
      pendingMediaDownloads.get(session)?.update(event.data.progress);
      return;
    }
    if (event.source === window.parent && event.data?.channel === "ig-view" && event.data.session === session && event.data.type === "user-media-finished") {
      pendingMediaDownloads.get(session)?.finish(event.data);
      return;
    }
    if (
      event.source === window.parent &&
      event.data?.channel === "ig-view" &&
      event.data.session === session &&
      event.data.type === "api-response"
    ) {
      const task = pending.get(event.data.id);
      if (!task) return;
      pending.delete(event.data.id);
      event.data.error
        ? task.reject(new Error(event.data.error))
        : task.resolve(event.data.result);
    }
    if (
      event.source === window.parent &&
      event.data?.channel === "ig-view-shell" &&
      event.data.type === "data-changed"
    ) {
      if (PAGE === "stats")
        renderStats(document.querySelector(".page-content")).catch((error) => {
          status && (status.textContent = error.message);
        });
      if (PAGE === "crawler")
        window.refreshCrawler?.().catch((error) => {
          status && (status.textContent = error.message);
        });
      if (PAGE === "contacts")
        window.refreshContacts?.().catch((error) => {
          status && (status.textContent = error.message);
        });
      if (PAGE === "messages")
        window.refreshMessages?.().catch((error) => {
          status && (status.textContent = error.message);
        });
    }
  });

  const configs = {
    stats: [
      "Statistiques du compte",
      "Amis, messages, conversations et activité de votre export.",
      "fa-chart-line",
      renderStats,
    ],
    crawler: [
      "Autres utilisateurs",
      "Rechercher, consulter, actualiser et gérer les profils en cache.",
      "fa-users",
      renderCrawler,
    ],
    contacts: [
      "Liste de contacts",
      "Numéros, e-mails et mentions trouvés dans les fichiers JSON.",
      "fa-address-book",
      renderContacts,
    ],
    messages: [
      "Messages",
      "Parcourir les conversations de votre export.",
      "fa-comments",
      renderMessages,
    ],
  };
  const config = configs[PAGE];
  if (config) {
    const content = makePage(config[0], config[1], config[2]);
    config[3](content)
      .then((refresh) => {
        if (PAGE === "crawler") window.refreshCrawler = refresh;
        if (PAGE === "messages") window.refreshMessages = refresh;
        if (PAGE === "contacts") window.refreshContacts = refresh;
      })
      .catch((error) => {
        status = node("p", "page-status", error.message);
        content.append(status);
      });
  }
})();
