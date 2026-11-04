(() => {
  const app = document.getElementById("app");
  const PAGE_SIZE = 100;
  let activeSearchQuery = "";
  let mediaPreviewRequestId = 0;
  const pendingMediaPreviews = new Map();
  const pendingImageDownloads = new Map();
  const mediaPreviewRequests = new Map();

  function requestHeicPreview(relativePath) {
    if (mediaPreviewRequests.has(relativePath))
      return mediaPreviewRequests.get(relativePath);
    const promise = new Promise((resolve, reject) => {
      const id = ++mediaPreviewRequestId;
      const timeout = window.setTimeout(() => {
        pendingMediaPreviews.delete(id);
        reject(new Error("La conversion de l’aperçu a expiré."));
      }, 60000);
      pendingMediaPreviews.set(id, {
        resolve: (value) => {
          window.clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          window.clearTimeout(timeout);
          reject(error);
        },
      });
      window.parent.postMessage(
        {
          channel: "ig-media",
          type: "preview-request",
          id,
          path: relativePath,
        },
        "*",
      );
    });
    mediaPreviewRequests.set(relativePath, promise);
    promise.catch(() => mediaPreviewRequests.delete(relativePath));
    return promise;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.data?.channel !== "ig-media")
      return;
    if (event.data.type === "preview-response") {
      const pending = pendingMediaPreviews.get(event.data.id);
      if (!pending) return;
      pendingMediaPreviews.delete(event.data.id);
      event.data.error
        ? pending.reject(new Error(event.data.error))
        : pending.resolve(event.data.result);
    } else if (event.data.type === "download-response") {
      const pending = pendingImageDownloads.get(event.data.id);
      if (!pending) return;
      pendingImageDownloads.delete(event.data.id);
      event.data.error
        ? pending.reject(new Error(event.data.error))
        : pending.resolve(event.data.result);
    }
  });

  function makeImageDownloadable(image, source) {
    const frame = document.createElement("span");
    frame.className = "media-image-frame";
    image.replaceWith(frame);
    frame.append(image);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "image-download-button";
    button.title = "Télécharger cette image";
    button.setAttribute("aria-label", "Télécharger cette image");
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-download";
    button.append(icon);
    const progress = document.createElement("progress");
    progress.className = "image-download-progress";
    progress.max = 100;
    progress.removeAttribute("value");
    progress.hidden = true;
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      progress.hidden = false;
      button.title = "Téléchargement en cours…";
      const id = ++mediaPreviewRequestId;
      try {
        const result = await new Promise((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            pendingImageDownloads.delete(id);
            reject(new Error("Le téléchargement a expiré."));
          }, 60000);
          pendingImageDownloads.set(id, {
            resolve: (value) => {
              window.clearTimeout(timeout);
              resolve(value);
            },
            reject: (error) => {
              window.clearTimeout(timeout);
              reject(error);
            },
          });
          window.parent.postMessage(
            { channel: "ig-media", type: "download-request", id, source },
            "*",
          );
        });
        progress.value = 100;
        icon.className = result?.canceled
          ? "fa-solid fa-xmark"
          : "fa-solid fa-check";
        button.title = result?.canceled
          ? "Téléchargement annulé"
          : "Image enregistrée";
      } catch (error) {
        icon.className = "fa-solid fa-triangle-exclamation";
        button.title = error.message;
      } finally {
        button.disabled = false;
        window.setTimeout(() => {
          progress.hidden = true;
          progress.removeAttribute("value");
          icon.className = "fa-solid fa-download";
        }, 2200);
      }
    });
    frame.append(button, progress);
    return frame;
  }
  const translations = {
    "sender name": "Envoy\u00e9 par",
    timestamp: "Date",
    "timestamp ms": "Date",
    "creation timestamp": "Date de cr\u00e9ation",
    "created timestamp": "Date de cr\u00e9ation",
    value: "Valeur",
    content: "Contenu",
    title: "Titre",
    name: "Nom",
    label: "Libell\u00e9",
    href: "Lien",
    uri: "Fichier",
    participants: "Participants",
    messages: "Messages",
    media: "M\u00e9dias",
    "label values": "Informations",
    "string list data": "Profil",
    "media list data": "M\u00e9dias associ\u00e9s",
    fbid: "Identifiant",
    "units transferred": "Unit\u00e9s transf\u00e9r\u00e9es",
    "data units": "Unit\u00e9s de donn\u00e9es",
    "date sent": "Date d\u2019envoi",
    "date created": "Date de cr\u00e9ation",
    "your instagram activity": "Votre activit\u00e9 Instagram",
    "your activity off meta": "Votre activit\u00e9 en dehors de Meta",
    "post comments": "Commentaires",
    "liked posts": "Publications aim\u00e9es",
    "liked comments": "Commentaires aim\u00e9s",
    "saved posts": "Publications enregistr\u00e9es",
    "saved music": "Musiques enregistr\u00e9es",
    "saved collections": "Collections enregistr\u00e9es",
    "stories viewed": "Stories vues",
    "story likes": "Mentions J\u2019aime sur les stories",
    followers: "Abonn\u00e9s",
    following: "Abonnements",
    "close friends": "Amis proches",
    "pending follow requests": "Invitations envoy\u00e9es",
    "recent follow requests": "Invitations re\u00e7ues",
    "recently unfollowed profiles":
      "Profils r\u00e9cemment d\u00e9sabonn\u00e9s",
    "removed suggestions": "Suggestions supprim\u00e9es",
    "profile searches": "Profils recherch\u00e9s",
    "word or phrase searches": "Mots ou expressions recherch\u00e9s",
    "your instants": "Vos instants",
    "instants interactions": "Interactions avec les instants",
    "other content": "Autres contenus",
    "profile photos": "Photos de profil",
    "recently deleted content": "Contenus supprim\u00e9s r\u00e9cemment",
    "ig stories": "Stories Instagram",
    "audience insights": "Statistiques sur l\u2019audience",
    "content interactions": "Interactions avec le contenu",
    "profiles reached": "Profils touch\u00e9s",
    "link history": "Historique des liens",
    "notification preferences": "Pr\u00e9f\u00e9rences de notification",
    "your topics": "Vos sujets",
    "personal information": "Informations personnelles",
    "profile information": "Informations du profil",
    "profile changes": "Modifications du profil",
    "login activity": "Activit\u00e9 de connexion",
    "signup details": "Informations d\u2019inscription",
    "password change activity": "Modifications du mot de passe",
    "synced contacts": "Contacts synchronis\u00e9s",
    "checkout payment information": "Informations de paiement",
    "ads clicked": "Publicit\u00e9s cliqu\u00e9es",
    "ads viewed": "Publicit\u00e9s vues",
    "videos watched": "Vid\u00e9os regard\u00e9es",
    "posts viewed": "Publications consult\u00e9es",
    message: "Message",
    "thread path": "Conversation",
    "is still participant": "Est toujours participant",
    "is geoblocked for viewer": "Acc\u00e8s bloqu\u00e9 dans votre r\u00e9gion",
    "creation timestamp": "Date de cr\u00e9ation",
    "media metadata": "Informations du m\u00e9dia",
    "cross post source": "Source du partage",
    "dubbing info": "Informations de doublage",
    "media variants": "Versions du m\u00e9dia",
    "camera metadata": "Informations de l\u2019appareil photo",
    "video metadata": "Informations de la vid\u00e9o",
    "exif data": "Donn\u00e9es EXIF",
    "device information": "Informations sur l\u2019appareil",
    "apps and websites": "Applications et sites web",
    "business objectives": "Objectifs professionnels",
    "locations of interest": "Lieux d\u2019int\u00e9r\u00eat",
    privacy: "Confidentialit\u00e9",
    "timestamp value": "Date",
    "media list data": "M\u00e9dias associ\u00e9s",
    "string map data": "Informations",
    "your stars transfers": "Transferts d\u2019\u00e9toiles",
    checkout: "Paiement",
    notifications: "Notifications",
    username: "Nom d\u2019utilisateur",
    account: "Compte",
    description: "Description",
    type: "Type",
    status: "\u00c9tat",
    "timestamp value": "Date",
    date: "Date",
    duration: "Dur\u00e9e",
    location: "Lieu",
    platform: "Plateforme",
    source: "Source",
    action: "Action",
    id: "Identifiant",
    url: "Lien",
    email: "Adresse e-mail",
    "phone number": "Num\u00e9ro de t\u00e9l\u00e9phone",
    address: "Adresse",
    category: "Cat\u00e9gorie",
    size: "Taille",
    count: "Nombre",
    total: "Total",
    year: "Ann\u00e9e",
    month: "Mois",
    day: "Jour",
    time: "Heure",
  };
  const wordTranslations = {
    your: "vos",
    you: "vous",
    and: "et",
    of: "de",
    for: "pour",
    with: "avec",
    on: "sur",
    in: "dans",
    off: "hors",
    other: "autre",
    recent: "r\u00e9cent",
    recently: "r\u00e9cemment",
    deleted: "supprim\u00e9",
    viewed: "consult\u00e9",
    sent: "envoy\u00e9",
    received: "re\u00e7u",
    liked: "aim\u00e9",
    saved: "enregistr\u00e9",
    list: "liste",
    data: "donn\u00e9es",
    information: "informations",
    activity: "activit\u00e9",
    interactions: "interactions",
    profile: "profil",
    profiles: "profils",
    post: "publication",
    posts: "publications",
    comment: "commentaire",
    comments: "commentaires",
    story: "story",
    stories: "stories",
    follower: "abonn\u00e9",
    followers: "abonn\u00e9s",
    following: "abonnements",
    request: "invitation",
    requests: "invitations",
    search: "recherche",
    searches: "recherches",
    media: "m\u00e9dia",
    content: "contenu",
    message: "message",
    messages: "messages",
    thread: "conversation",
    inbox: "bo\u00eete de r\u00e9ception",
    notification: "notification",
    notifications: "notifications",
    settings: "param\u00e8tres",
    preference: "pr\u00e9f\u00e9rence",
    preferences: "pr\u00e9f\u00e9rences",
    privacy: "confidentialit\u00e9",
    account: "compte",
    personal: "personnel",
    business: "professionnel",
    device: "appareil",
    devices: "appareils",
    login: "connexion",
    password: "mot de passe",
    change: "modification",
    changes: "modifications",
    creation: "cr\u00e9ation",
    timestamp: "date",
    transfer: "transfert",
    transfers: "transferts",
    units: "unit\u00e9s",
    unit: "unit\u00e9",
    clicked: "cliqu\u00e9",
    watched: "regard\u00e9",
    music: "musique",
    collection: "collection",
    collections: "collections",
    close: "proche",
    friends: "amis",
    friend: "ami",
    synced: "synchronis\u00e9",
    contacts: "contacts",
    videos: "vid\u00e9os",
    video: "vid\u00e9o",
    photos: "photos",
    photo: "photo",
    payment: "paiement",
    checkout: "paiement",
    details: "d\u00e9tails",
    label: "libell\u00e9",
    values: "valeurs",
    value: "valeur",
    name: "nom",
    title: "titre",
    sender: "exp\u00e9diteur",
    uri: "fichier",
    href: "lien",
    media_list: "m\u00e9dias",
    viewed: "consult\u00e9",
    audience: "audience",
    insights: "statistiques",
    reached: "touch\u00e9",
    topic: "sujet",
    topics: "sujets",
    location: "lieu",
    locations: "lieux",
    interest: "int\u00e9r\u00eat",
    interests: "int\u00e9r\u00eats",
    story_interactions: "interactions stories",
    ads: "publicit\u00e9s",
    ad: "publicit\u00e9",
    information: "informations",
    information_about_you: "informations vous concernant",
    instagram: "Instagram",
    ig: "Instagram",
    exif: "EXIF",
    fbid: "identifiant",
    is: "est",
    still: "encore",
    participant: "participant",
    unsent: "non envoy\u00e9",
    image: "image",
    messenger: "Messenger",
    kid: "enfant",
    parent: "parent",
    has: "a",
    enabled: "activ\u00e9",
    disabled: "d\u00e9sactiv\u00e9",
    first: "premier",
    last: "dernier",
    known: "connu",
    country: "pays",
    camera: "appareil photo",
    metadata: "informations",
    app: "application",
    website: "site web",
    websites: "sites web",
    off: "hors",
    meta: "Meta",
    seen: "vu",
    transferred: "transf\u00e9r\u00e9",
    sent: "envoy\u00e9",
    exported: "export\u00e9",
    archived: "archiv\u00e9",
    archived: "archiv\u00e9",
    requests: "invitations",
    viewer: "spectateur",
    blocked: "bloqu\u00e9",
    geoblocked: "bloqu\u00e9 par r\u00e9gion",
  };

  function repairText(value) {
    const decodeSuspiciousRun = (run) => {
      if (
        !/[\u00c3\u00c2\u00e2\u00f0\u00ef][\u0080-\u00bf]|[\u00c3\u00c2]/.test(
          run,
        )
      )
        return run;
      try {
        const bytes = Uint8Array.from(run, (character) =>
          character.charCodeAt(0),
        );
        const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return /[\u00c3\u00c2\u00e2\u00f0\u00ef][\u0080-\u00bf]|[\u00c3\u00c2]/.test(
          decoded,
        )
          ? run
          : decoded;
      } catch {
        return run;
      }
    };
    let output = "";
    let run = "";
    for (const character of String(value)) {
      if (character.charCodeAt(0) <= 255) run += character;
      else {
        output += decodeSuspiciousRun(run) + character;
        run = "";
      }
    }
    return output + decodeSuspiciousRun(run);
  }
  const humanize = (value) => {
    const words = repairText(value)
      .replace(/\.json$/i, "")
      .split(/[\\/_-]+/)
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .replace(/\s+\d+$/, "");
    return (
      translations[words] ||
      words
        .split(" ")
        .map((word) => wordTranslations[word] || word)
        .join(" ")
        .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
    );
  };
  const timestampFormat = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function display(value, key = "") {
    if (value === null || value === undefined || value === "") return "\u2014";
    if (typeof value === "boolean") return value ? "Oui" : "Non";
    if (
      typeof value === "number" &&
      /timestamp|date|time/i.test(key) &&
      value > 0
    ) {
      const milliseconds = value > 100000000000 ? value : value * 1000;
      const date = new Date(milliseconds);
      if (!Number.isNaN(date.getTime())) return timestampFormat.format(date);
    }
    return repairText(value);
  }

  function safeUrl(value) {
    if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return null;
    try {
      const parsed = new URL(value);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password
      )
        return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function localMediaReference(value, key) {
    if (typeof value !== "string") return null;

    const relativePath = repairText(value)
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    const segments = relativePath.split("/");
    if (
      segments.some(
        (segment) => !segment || segment === "." || segment === "..",
      )
    )
      return null;
    if (!/^(?:media|your_instagram_activity)\//i.test(relativePath))
      return null;

    const extension =
      segments
        .at(-1)
        .match(/\.([^.]+)$/)?.[1]
        ?.toLowerCase() || "";
    const typeByExtension = {
      jpg: "image",
      jpeg: "image",
      png: "image",
      gif: "image",
      webp: "image",
      heic: "image",
      heif: "image",
      mp4: "video",
      mov: "video",
      ogg: "audio",
      mp3: "audio",
      m4a: "audio",
      wav: "audio",
      aac: "audio",
    };

    let type = typeByExtension[extension];
    if (!type && /audio|vocal/i.test(key)) type = "audio";
    if (!type && /video/i.test(key)) type = "video";
    if (!type && /photo|image/i.test(key)) type = "image";
    if (!type) return null;

    return {
      url: new URL(
        `../model/${segments.map(encodeURIComponent).join("/")}`,
        document.baseURI,
      ).href,
      relativePath,
      type,
      needsHeicPreview: type === "image" && /\.hei[cf]$/i.test(relativePath),
    };
  }

  function createMediaAttachment(reference) {
    const wrapper = document.createElement("div");
    wrapper.className = `media-attachment media-${reference.type}`;
    if (!reference.needsHeicPreview) {
      const check =
        reference.type === "image"
          ? new Image()
          : document.createElement(reference.type);
      if (reference.type !== "image") check.preload = "metadata";
      check.addEventListener(
        "error",
        () => {
          const missing = document.createElement("span");
          missing.className = "media-missing";
          missing.textContent =
            reference.type === "video"
              ? "Vidéo manquante ou illisible"
              : reference.type === "image"
                ? "Photo manquante ou illisible"
                : "Fichier manquant ou illisible";
          wrapper.replaceChildren(missing);
        },
        { once: true },
      );
      check.src = reference.url;
      if (reference.type !== "image") check.load();
    }
    const createPlayer = (fullSize = false) => {
      let player;
      if (reference.type === "image") {
        player = document.createElement("img");
        player.alt = "Média Instagram";
        player.loading = "lazy";
      } else if (reference.type === "video") {
        player = document.createElement("video");
        player.controls = true;
        player.preload = "none";
        player.playsInline = true;
      } else {
        player = document.createElement("audio");
        player.controls = true;
        player.preload = "none";
      }
      player.className = fullSize ? "media-full" : "media-thumbnail";
      player.addEventListener(
        "error",
        () => {
          const missing = document.createElement("span");
          missing.className = "media-missing";
          missing.textContent =
            reference.type === "video"
              ? "Vidéo manquante"
              : reference.type === "image"
                ? "Photo manquante"
                : "Fichier manquant";
          (player.closest(".media-image-frame") || player).replaceWith(missing);
        },
        { once: true },
      );
      const renderedPlayer =
        reference.type === "image"
          ? makeImageDownloadable(player, {
              relativePath: reference.relativePath,
            })
          : player;
      if (reference.needsHeicPreview) {
        requestHeicPreview(reference.relativePath)
          .then((previewUrl) => {
            player.src = previewUrl;
          })
          .catch((error) => {
            const missing = document.createElement("span");
            missing.className = "media-missing";
            missing.textContent = /manquant|introuvable/i.test(error.message)
              ? "Photo manquante"
              : `Aperçu HEIC indisponible : ${error.message}`;
            (player.closest(".media-image-frame") || player).replaceWith(
              missing,
            );
          });
      } else player.src = reference.url;
      return renderedPlayer;
    };
    if (reference.type !== "audio") wrapper.append(createPlayer());
    const button = document.createElement("button");
    button.type = "button";
    button.className = "media-open";
    button.textContent =
      reference.type === "audio" ? "Écouter le média" : "Afficher en entier";
    const dialog = document.createElement("dialog");
    dialog.className = "app-dialog media-preview-dialog";
    const header = document.createElement("header");
    const title = document.createElement("h2");
    title.textContent = "Aperçu du média";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Fermer";
    close.addEventListener("click", () => dialog.close());
    header.append(title, close);
    const body = document.createElement("div");
    body.className = "app-dialog-body";
    body.append(createPlayer(true));
    dialog.append(header, body);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      const player = dialog.querySelector("video, audio");
      if (player) player.pause();
      dialog.remove();
    });
    document.body.append(dialog);
    button.addEventListener("click", () => {
      if (!dialog.isConnected) document.body.append(dialog);
      dialog.showModal();
    });
    wrapper.append(button);
    return wrapper;
  }

  function appendValue(container, value, query = activeSearchQuery, key = "") {
    const media = localMediaReference(value, key);
    if (media) {
      container.append(createMediaAttachment(media));
      return;
    }
    const text = String(value);
    const matches = [...text.matchAll(/https?:\/\/[^\s<>"']+/gi)];
    if (!matches.length) {
      appendHighlighted(container, text, query);
      return;
    }
    let cursor = 0;
    for (const match of matches) {
      const rawUrl = match[0];
      const url = safeUrl(rawUrl);
      if (!url) continue;
      appendHighlighted(container, text.slice(cursor, match.index), query);
      const link = document.createElement("a");
      link.href = rawUrl;
      appendHighlighted(
        link,
        rawUrl.replace(/\?utm_source=ig[\s\S]*$/i, "..."),
        query,
      );
      link.title = rawUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      container.append(link);
      cursor = match.index + rawUrl.length;
    }
    if (!cursor) appendHighlighted(container, text, query);
    else appendHighlighted(container, text.slice(cursor), query);
  }

  function appendHighlighted(container, text, searchQuery = activeSearchQuery) {
    const value = String(text);
    const query = String(searchQuery || "").toLocaleLowerCase();
    if (!query) {
      container.append(document.createTextNode(value));
      return;
    }
    const lower = value.toLocaleLowerCase();
    let cursor = 0;
    let index = lower.indexOf(query);
    while (index !== -1) {
      container.append(document.createTextNode(value.slice(cursor, index)));
      const mark = document.createElement("mark");
      mark.textContent = value.slice(index, index + query.length);
      container.append(mark);
      cursor = index + query.length;
      index = lower.indexOf(query, cursor);
    }
    container.append(document.createTextNode(value.slice(cursor)));
  }

  function flatten(value, prefix = "", output = {}) {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        flatten(
          item,
          prefix ? `${prefix} ${index + 1}` : `\u00c9l\u00e9ment ${index + 1}`,
          output,
        ),
      );
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        const label = humanize(key);
        if (child && typeof child === "object") flatten(child, label, output);
        else {
          let uniqueLabel = label;
          let duplicate = 2;
          while (Object.hasOwn(output, uniqueLabel))
            uniqueLabel = `${label} (${duplicate++})`;
          output[uniqueLabel] = display(child, key);
        }
      }
    } else if (prefix) output[prefix] = display(value);
    return output;
  }

  function createTable(title, records) {
    const section = document.createElement("section");
    section.className = "table-section";
    const heading = document.createElement("div");
    heading.className = "section-heading";
    const h2 = document.createElement("h2");
    h2.textContent = humanize(title);
    const badge = document.createElement("span");
    badge.className = "count";
    badge.textContent = records.length.toLocaleString("fr-FR");
    heading.append(h2, badge);
    section.append(heading);

    if (!records.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Aucun \u00e9l\u00e9ment";
      section.append(empty);
      return section;
    }

    const rows = records.map((record) => flatten(record));
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const priority = /^(sender name|timestamp|content)$/i;
    const mediaPriority = /(audio files|photos|videos|gifs|sticker)/i;
    keys.sort(
      (a, b) =>
        Number(priority.test(b)) - Number(priority.test(a)) ||
        Number(mediaPriority.test(b)) - Number(mediaPriority.test(a)),
    );
    const visibleKeys = keys.slice(0, 5);

    const controls = document.createElement("div");
    controls.className = "table-controls";
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Rechercher dans cette liste";
    search.setAttribute("aria-label", `Rechercher dans ${humanize(title)}`);
    const pageLabel = document.createElement("span");
    pageLabel.className = "muted";
    controls.append(search, pageLabel);
    section.append(controls);

    const scroll = document.createElement("div");
    scroll.className = "table-scroll";
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const key of visibleKeys) {
      const th = document.createElement("th");
      appendHighlighted(th, key);
      headerRow.append(th);
    }
    if (keys.length > visibleKeys.length) {
      const th = document.createElement("th");
      th.textContent = "D\u00e9tails";
      headerRow.append(th);
    }
    thead.append(headerRow);
    const tbody = document.createElement("tbody");
    table.append(thead, tbody);
    scroll.append(table);
    section.append(scroll);

    const footer = document.createElement("div");
    footer.className = "pagination";
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "Pr\u00e9c\u00e9dent";
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Suivant";
    footer.append(previous, next);
    section.append(footer);

    let page = 0;
    let filtered = rows.map((row, index) => ({ row, index }));
    let tableSearchQuery = "";
    const renderPage = () => {
      const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      page = Math.min(page, pageCount - 1);
      pageLabel.textContent = filtered.length
        ? (page * PAGE_SIZE + 1).toLocaleString("fr-FR") +
          " - " +
          Math.min((page + 1) * PAGE_SIZE, filtered.length).toLocaleString(
            "fr-FR",
          ) +
          " sur " +
          filtered.length.toLocaleString("fr-FR")
        : "Aucun r\u00e9sultat";
      previous.disabled = page === 0;
      next.disabled = page >= pageCount - 1;
      tbody.replaceChildren();
      for (const entry of filtered.slice(
        page * PAGE_SIZE,
        (page + 1) * PAGE_SIZE,
      )) {
        const tr = document.createElement("tr");
        for (const key of visibleKeys) {
          const td = document.createElement("td");
          appendValue(td, entry.row[key] ?? "\u2014", tableSearchQuery, key);
          td.title = td.textContent;
          tr.append(td);
        }
        if (keys.length > visibleKeys.length) {
          const td = document.createElement("td");
          const openDetails = document.createElement("button");
          openDetails.type = "button";
          openDetails.className = "details-open";
          openDetails.textContent = "Voir";
          const extraFields = [];
          for (const [key, value] of Object.entries(entry.row)) {
            if (visibleKeys.includes(key)) continue;
            if (
              value === "\u2014" ||
              value === "" ||
              value === null ||
              value === undefined
            )
              continue;
            extraFields.push([key, value]);
          }
          openDetails.disabled = extraFields.length === 0;
          if (openDetails.disabled) {
            openDetails.title = "Aucun détail disponible";
          } else {
            openDetails.addEventListener("click", () => {
              const rowName =
                entry.row["Nom d’utilisateur"] ||
                entry.row["Nom d'utilisateur"] ||
                entry.row["Envoyé par"] ||
                entry.row["Titre"] ||
                entry.row[visibleKeys[0]] ||
                `Élément ${entry.index + 1}`;
              const dialog = document.createElement("dialog");
              dialog.className = "app-dialog details-dialog";
              const headingId = `details-title-${entry.index}-${page}`;
              dialog.setAttribute("aria-labelledby", headingId);
              const modalHeader = document.createElement("header");
              modalHeader.className = "app-dialog-header";
              const modalTitle = document.createElement("h2");
              modalTitle.id = headingId;
              modalTitle.textContent = `${humanize(title)} · ${String(rowName).slice(0, 72)}`;
              const close = document.createElement("button");
              close.type = "button";
              close.textContent = "Fermer";
              close.addEventListener("click", () => dialog.close());
              modalHeader.append(modalTitle, close);

              const body = document.createElement("div");
              body.className = "app-dialog-body";
              const list = document.createElement("dl");
              list.className = "details-modal-list";
              for (const [key, value] of extraFields) {
                const dt = document.createElement("dt");
                appendHighlighted(dt, key);
                const dd = document.createElement("dd");
                appendValue(dd, value, tableSearchQuery, key);
                list.append(dt, dd);
              }
              body.append(list);
              dialog.append(modalHeader, body);
              dialog.addEventListener("click", (event) => {
                if (event.target === dialog) dialog.close();
              });
              dialog.addEventListener("close", () => dialog.remove(), {
                once: true,
              });
              document.body.append(dialog);
              dialog.showModal();
            });
          }
          td.append(openDetails);
          tr.append(td);
        }
        tbody.append(tr);
      }
    };
    search.addEventListener("input", () => {
      const query = search.value.trim().toLocaleLowerCase("fr-FR");
      tableSearchQuery = query;
      filtered = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) =>
          Object.values(row).some((value) =>
            value.toLocaleLowerCase("fr-FR").includes(query),
          ),
        );
      page = 0;
      renderPage();
    });
    previous.addEventListener("click", () => {
      page--;
      renderPage();
    });
    next.addEventListener("click", () => {
      page++;
      renderPage();
    });
    renderPage();
    return section;
  }

  let activeMessageGroup = false;
  function renderDocument(path, data, label) {
    app.replaceChildren();
    const header = document.createElement("header");
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent =
      path
        .split(/[\\/]/)
        .slice(0, -1)
        .map(humanize)
        .join(" / ") || "Donn\u00e9es Instagram";
    const title = document.createElement("h1");
    appendHighlighted(title, label || humanize(path.split(/[\/]/).pop()));
    if (activeMessageGroup) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "message-back-button";
      back.textContent = "Retour";
      back.addEventListener("click", () =>
        window.parent.postMessage(
          { channel: "ig-view-shell", type: "messages-back" },
          "*",
        ),
      );
      const titleRow = document.createElement("div");
      titleRow.className = "message-group-title-row";
      titleRow.append(title, back);
      header.append(eyebrow, titleRow);
    } else {
      header.append(eyebrow, title);
    }
    app.append(header);

    if (Array.isArray(data)) {
      app.append(createTable("Contenu", data));
      return;
    }
    if (!data || typeof data !== "object") {
      app.append(createTable("Valeur", [{ valeur: data }]));
      return;
    }
    const scalarFields = {};
    const tables = [];
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value))
        tables.push({ key, view: createTable(key, value) });
      else if (value && typeof value === "object")
        tables.push({ key, view: createTable(key, [value]) });
      else scalarFields[humanize(key)] = display(value, key);
    }
    if (Object.keys(scalarFields).length) {
      const summary = document.createElement("section");
      summary.className = "summary-fields";
      for (const [key, value] of Object.entries(scalarFields)) {
        const item = document.createElement("div");
        item.className = "summary-item";
        const label = document.createElement("span");
        label.className = "muted";
        appendHighlighted(label, key);
        const text = document.createElement("strong");
        appendValue(text, value);
        item.append(label, text);
        summary.append(item);
      }
      app.insertBefore(summary, app.children[1] || null);
    }
    if (tables.length > 1) {
      const tabs = document.createElement("nav");
      tabs.className = "table-tabs";
      tables.forEach(({ key, view }, index) => {
        view.hidden = index !== 0;
        const tab = document.createElement("button");
        tab.type = "button";
        tab.textContent = humanize(key);
        tab.addEventListener("click", () => {
          tables.forEach((item, tabIndex) => {
            item.view.hidden = tabIndex !== index;
            tabs.children[tabIndex].setAttribute(
              "aria-selected",
              String(tabIndex === index),
            );
          });
        });
        tab.setAttribute("aria-selected", String(index === 0));
        tabs.append(tab);
      });
      app.append(tabs);
    }
    for (const { view } of tables) app.append(view);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.data?.type !== "instagram-json")
      return;
    activeMessageGroup = event.data.messageGroup === true;
    activeSearchQuery = repairText(event.data.searchQuery || "");
    renderDocument(event.data.path, event.data.data, event.data.label);
  });
})();
