const fs = require("fs");
const path = require("path");
const { convertHeicToPng, isHeic, pngPath } = require("./ImageConversion");

class ModelRepository {
  constructor(rootPath) {
    this.rootPath = path.resolve(rootPath);
    this.messageLabelCache = new Map();
    this.dashboardStatsCache = null;
    this.mediaPreviewCache = new Map();
  }

  async ensureRoot() {
    await fs.promises.mkdir(this.rootPath, { recursive: true });
  }

  async ensureConfig() {
    await this.getConfig();
  }

  async listFiles(predicate = () => true) {
    await this.ensureRoot();
    await this.ensureConfig();
    const files = [];
    const walk = async (directory) => {
      let entries;
      try {
        entries = await fs.promises.readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") return;
        throw error;
      }
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(fullPath);
        else if (entry.isFile() && predicate(entry.name)) {
          try {
            const stats = await fs.promises.stat(fullPath);
            files.push({
              path: path.relative(this.rootPath, fullPath),
              name: entry.name,
              size: stats.size,
              mtimeMs: stats.mtimeMs,
            });
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }
      }
    };
    await walk(this.rootPath);
    return files;
  }

  async listJson() {
    const files = await this.listFiles(
      (name) => path.extname(name).toLowerCase() === ".json",
    );
    const result = [];
    const conversations = new Map();
    const messageFiles = [];
    for (const file of files) {
      if (file.path.replace(/\\/g, "/").toLowerCase() === "config.json")
        continue;
      if (file.path.replace(/\\/g, "/").toLowerCase().startsWith("users/"))
        continue;
      const label = path.basename(file.name, path.extname(file.name));
      if (!/^message_.+$/i.test(label)) {
        result.push({
          path: file.path,
          label,
          size: file.size,
          mtimeMs: file.mtimeMs,
        });
        continue;
      }
      messageFiles.push(file);

      const folder = path.basename(path.dirname(file.path));
      const folderName = folder
        .replace(/_\d{8,}$/, "")
        .replace(/[_-]+/g, " ")
        .trim();
      const participants = await this.getMessageParticipants(
        file.path,
        file.size,
        file.mtimeMs,
      );
      const key = participants.length
        ? participants
            .map((name) => name.trim().toLocaleLowerCase())
            .sort()
            .join("|")
        : path.dirname(file.path).toLocaleLowerCase();
      let conversation = conversations.get(key);
      if (!conversation) {
        const name =
          folderName && !/^\d+$/.test(folderName)
            ? folderName
            : participants.join(" et ");
        conversation = {
          path: file.path,
          paths: [],
          label: `Messages avec ${name.replace(/^./, (character) => character.toUpperCase()) || "un contact"}`,
          size: 0,
          mtimeMs: file.mtimeMs,
          messageGroup: true,
        };
        conversations.set(key, conversation);
        result.push(conversation);
      }
      conversation.paths.push(file.path);
      conversation.size += file.size;
      conversation.mtimeMs = Math.max(conversation.mtimeMs, file.mtimeMs);
    }
    if (messageFiles.length) {
      const conversationList = [...conversations.values()];
      const messageCollection = {
        path: messageFiles[0].path,
        paths: messageFiles.map((file) => file.path),
        conversations: conversationList.map(
          ({ path, paths, label, size, mtimeMs }) => ({
            path,
            paths,
            label,
            size,
            mtimeMs,
          }),
        ),
        label: "Messages",
        size: messageFiles.reduce((sum, file) => sum + file.size, 0),
        mtimeMs: Math.max(...messageFiles.map((file) => file.mtimeMs)),
        messageGroup: true,
        allMessages: true,
      };
      return result
        .filter((file) => !file.messageGroup)
        .concat(messageCollection);
    }
    return result;
  }

  async listCachedUsers() {
    const files = await this.listFiles(
      (name) => path.extname(name).toLowerCase() === ".json",
    );
    const users = [];
    for (const file of files.filter((entry) =>
      entry.path.replace(/\\/g, "/").toLowerCase().startsWith("users/"),
    )) {
      try {
        const data = await this.readJson(file.path);
        const expectedUsername = path.basename(
          file.name,
          path.extname(file.name),
        );
        if (
          data.username &&
          String(data.username).toLocaleLowerCase() !==
            expectedUsername.toLocaleLowerCase()
        )
          continue;
        users.push({
          path: file.path,
          username: data.username || path.basename(file.name, ".json"),
          fullName: data.full_name || "",
          profilePic: data.profile_pic_url_hd || data.profile_pic_url || "",
          updatedAt: file.mtimeMs,
          data,
        });
      } catch {
        /* Ignore incomplete cache files. */
      }
    }
    return users.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async fetchPublicUser(username, refresh = false) {
    const clean = String(username || "")
      .trim()
      .replace(/^@/, "");
    if (!/^[\w.]{1,30}$/.test(clean))
      throw new Error("Nom d’utilisateur invalide.");
    const usersDirectory = path.join(this.rootPath, "users");
    await fs.promises.mkdir(usersDirectory, { recursive: true });
    const filePath = path.join(usersDirectory, `${clean}.json`);
    if (!refresh) {
      try {
        const cached = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
        if (
          String(cached.username || "").toLocaleLowerCase() ===
          clean.toLocaleLowerCase()
        )
          return cached;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const { spawn } = require("child_process");
    await new Promise((resolve, reject) => {
      const child = spawn("python", ["services/scraper.py", clean], {
        cwd: path.resolve(__dirname, ".."),
        windowsHide: true,
      });
      let stderr = "";
      let stdout = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.once("error", (error) =>
        reject(new Error(`Impossible de lancer Python : ${error.message}`)),
      );
      child.once("close", async (code) => {
        if (code !== 0) {
          const details = stderr.trim();
          const lower = details.toLocaleLowerCase();
          if (/profilenotexists|not found|does not exist/.test(lower))
            return reject(new Error(`Le compte @${clean} n’existe pas.`));
          if (/private|login required|login_required/.test(lower))
            return reject(
              new Error(
                `Le compte @${clean} est privé ou Instagram ne rend pas ses données disponibles sans connexion.`,
              ),
            );
          return reject(
            new Error(
              details.split(/\r?\n/).at(-1) ||
                `Impossible de récupérer @${clean}.`,
            ),
          );
        }
        try {
          const actualUsername = stdout.trim().split(/\r?\n/).at(-1);
          if (
            actualUsername.toLocaleLowerCase() !== clean.toLocaleLowerCase()
          ) {
            return reject(
              new Error(
                `Instagram a renvoyé @${actualUsername || "un autre compte"} au lieu de @${clean}.`,
              ),
            );
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
    return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
  }

  async deleteCachedUser(username) {
    const clean = String(username || "")
      .trim()
      .replace(/^@/, "");
    if (!/^[\w.]{1,30}$/.test(clean))
      throw new Error("Nom d’utilisateur invalide.");
    const filePath = path.join(this.rootPath, "users", `${clean}.json`);
    let cached;
    try {
      cached = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return { success: false, missing: true };
      throw error;
    }
    const cachedUsername = String(
      cached.username || path.basename(filePath, path.extname(filePath)),
    );
    if (cachedUsername.toLocaleLowerCase() !== clean.toLocaleLowerCase())
      throw new Error("Le cache ne correspond pas au compte demandé.");
    await fs.promises.unlink(filePath);
    return { success: true };
  }

  async listUserMedia(username) {
    const clean = String(username || "").trim().replace(/^@/, "");
    if (!/^[\w.]{1,30}$/.test(clean)) throw new Error("Nom d’utilisateur invalide.");
    const mediaRoot = path.join(this.rootPath, "users", "media");
    const root = path.join(mediaRoot, clean);
    // Older downloads used safe_name(), which removed trailing underscores
    // from usernames (for example coline26_ was stored as coline26).
    const legacyRoot = path.join(mediaRoot, clean.replace(/_+$/, ""));
    const results = [];
    const walk = async (folder) => {
      let entries;
      try { entries = await fs.promises.readdir(folder, { withFileTypes: true }); }
      catch (error) { if (error.code === "ENOENT") return; throw error; }
      for (const entry of entries) {
        const fullPath = path.join(folder, entry.name);
        if (entry.isDirectory()) await walk(fullPath);
        else if (
          entry.isFile() &&
          /\.(?:jpe?g|png|gif|webp|avif|bmp|tiff?|heic|heif|mp4|mov|webm|m4v|3gp|mkv)$/i.test(entry.name)
        ) results.push({ path: path.relative(this.rootPath, fullPath).replace(/\\/g, "/"), name: entry.name, category: path.basename(folder) });
      }
    };
    await walk(root);
    if (legacyRoot !== root) await walk(legacyRoot);
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  downloadUserMedia(username, onProgress) {
    const clean = String(username || "").trim().replace(/^@/, "");
    if (!/^[\w.]{1,30}$/.test(clean)) throw new Error("Nom d’utilisateur invalide.");
    const { spawn } = require("child_process");
    const output = path.join(this.rootPath, "users", "media");
    const script = path.resolve(__dirname, "..", "services", "save--storiesig.py");
    return new Promise((resolve, reject) => {
      const child = spawn("python", [script, clean, "--output", output], {
        cwd: path.resolve(__dirname, ".."),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
      });
      let buffer = "";
      let stderr = "";
      const outputLines = [];
      let cancelled = false;
      const emit = (line) => {
        if (!line.trim()) return;
        outputLines.push(line.trim());
        try {
          onProgress(JSON.parse(line));
        } catch {
          onProgress({ phase: "step", message: line.trim() });
        }
      };
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();
        lines.forEach(emit);
      });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", (error) => reject(new Error(`Impossible de lancer Python : ${error.message}`)));
      child.once("close", async (code) => {
        if (buffer.trim()) emit(buffer);
        this.activeMediaDownload = null;
        if (cancelled) return resolve({ cancelled: true });
        if (code !== 0) {
          const reportedError = outputLines.map((line) => {
            try { return JSON.parse(line); } catch { return null; }
          }).find((entry) => entry?.phase === "error")?.message;
          stderr = reportedError || stderr.trim() || outputLines.at(-1) || "";
        }
        if (code !== 0) return reject(new Error(stderr.trim().split(/\r?\n/).at(-1) || "Le téléchargement des médias a échoué."));
        resolve({ success: true, files: await this.listUserMedia(clean) });
      });
      this.activeMediaDownload = { child, cancel: () => { cancelled = true; child.kill(); } };
    });
  }

  cancelUserMediaDownload() {
    this.activeMediaDownload?.cancel?.();
  }

  async getHeicPreview(relativePath) {
    if (typeof relativePath !== "string")
      throw new Error("Chemin de média invalide.");
    const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (
      !/^(?:media|your_instagram_activity)\//i.test(normalized) ||
      !/\.hei[cf]$/i.test(normalized) ||
      normalized
        .split("/")
        .some((part) => !part || part === "." || part === "..")
    )
      throw new Error("Ce fichier ne peut pas être converti en aperçu.");
    const fullPath = path.resolve(this.rootPath, normalized);
    if (!fullPath.startsWith(`${this.rootPath}${path.sep}`))
      throw new Error("Chemin de média invalide.");
    let fileStats;
    try {
      fileStats = await fs.promises.stat(fullPath);
    } catch (error) {
      if (error.code === "ENOENT") throw new Error("Fichier photo manquant.");
      throw error;
    }
    if (!fileStats.isFile()) throw new Error("Fichier photo manquant.");
    const cacheKey = `${normalized}:${fileStats.size}:${fileStats.mtimeMs}`;
    if (this.mediaPreviewCache.has(cacheKey))
      return this.mediaPreviewCache.get(cacheKey);
    const previewPromise = new Promise((resolve, reject) => {
      const { spawn } = require("child_process");
      let child;
      try {
        child = spawn(
          "ffmpeg",
          [
            "-v",
            "error",
            "-i",
            fullPath,
            "-frames:v",
            "1",
            "-q:v",
            "3",
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "pipe:1",
          ],
          { windowsHide: true },
        );
      } catch (error) {
        reject(
          new Error(
            `Conversion de la photo HEIC impossible : ${error.message}`,
          ),
        );
        return;
      }
      const chunks = [];
      let outputBytes = 0;
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        outputBytes += chunk.length;
        if (outputBytes > 25 * 1024 * 1024) {
          child.kill();
          reject(new Error("Aperçu photo trop volumineux."));
          return;
        }
        chunks.push(chunk);
      });
      child.stderr.on("data", (chunk) => {
        if (stderr.length < 4000) stderr += chunk.toString();
      });
      child.once("error", (error) =>
        reject(new Error(`Conversion HEIC indisponible : ${error.message}`)),
      );
      child.once("close", (code) => {
        if (code !== 0 || !outputBytes) {
          reject(
            new Error(
              stderr.trim().split(/\r?\n/).at(-1) ||
                "La photo HEIC ne peut pas être décodée.",
            ),
          );
          return;
        }
        resolve(
          `data:image/jpeg;base64,${Buffer.concat(chunks).toString("base64")}`,
        );
      });
    });
    this.mediaPreviewCache.set(cacheKey, previewPromise);
    try {
      return await previewPromise;
    } catch (error) {
      this.mediaPreviewCache.delete(cacheKey);
      throw error;
    }
  }

  async downloadImage(source, destinationPath) {
    if (
      !source ||
      typeof source !== "object" ||
      typeof destinationPath !== "string"
    )
      throw new Error("Demande de téléchargement invalide.");
    if (typeof source.relativePath === "string") {
      const normalized = source.relativePath
        .replace(/\\/g, "/")
        .replace(/^\/+/, "");
      const extension = path.extname(normalized).toLowerCase();
      if (
        !/^(?:media|your_instagram_activity)\//i.test(normalized) ||
        ![
          ".jpg",
          ".jpeg",
          ".png",
          ".gif",
          ".webp",
          ".heic",
          ".heif",
          ".avif",
          ".bmp",
        ].includes(extension) ||
        normalized
          .split("/")
          .some((part) => !part || part === "." || part === "..")
      )
        throw new Error("Chemin de photo invalide.");
      const fullPath = path.resolve(this.rootPath, normalized);
      if (!fullPath.startsWith(`${this.rootPath}${path.sep}`))
        throw new Error("Chemin de photo invalide.");
      const outputPath = isHeic(fullPath) ? pngPath(destinationPath) : destinationPath;
      try {
        if (isHeic(fullPath)) await convertHeicToPng(fullPath, outputPath);
        else await fs.promises.copyFile(fullPath, outputPath);
      } catch (error) {
        if (error.code === "ENOENT") throw new Error("Photo manquante.");
        throw error;
      }
      return { success: true, path: outputPath };
    }

    let url;
    try {
      url = new URL(String(source.url || ""));
    } catch {
      throw new Error("Adresse de photo invalide.");
    }
    const isInstagramImageHost = (hostname) => {
      const host = hostname.toLowerCase();
      return (
        host === "cdninstagram.com" ||
        host.endsWith(".cdninstagram.com") ||
        host === "fbcdn.net" ||
        host.endsWith(".fbcdn.net")
      );
    };
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !isInstagramImageHost(url.hostname)
    )
      throw new Error(
        "Seules les photos de profil Instagram peuvent être téléchargées depuis Internet.",
      );
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      redirect: "follow",
    });
    let finalUrl;
    try {
      finalUrl = new URL(response.url);
    } catch {
      throw new Error("Adresse de photo invalide.");
    }
    if (
      !response.ok ||
      finalUrl.protocol !== "https:" ||
      !isInstagramImageHost(finalUrl.hostname)
    )
      throw new Error("La photo distante est indisponible.");
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/"))
      throw new Error("La ressource demandée n’est pas une image.");
    const declaredSize = Number(response.headers.get("content-length") || 0);
    const maxBytes = 35 * 1024 * 1024;
    if (declaredSize > maxBytes)
      throw new Error(
        "Cette image dépasse la taille maximale de téléchargement.",
      );
    const chunks = [];
    let totalBytes = 0;
    if (!response.body) throw new Error("La photo distante est vide.");
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > maxBytes)
        throw new Error(
          "Cette image dépasse la taille maximale de téléchargement.",
        );
      chunks.push(buffer);
    }
    if (!totalBytes) throw new Error("La photo distante est vide.");
    const imageBuffer = Buffer.concat(chunks);
    if (isHeic(url.pathname, contentType)) {
      const outputPath = pngPath(destinationPath);
      const temporaryInput = `${destinationPath}.${process.pid}.${Date.now()}.heic`;
      try {
        await fs.promises.writeFile(temporaryInput, imageBuffer);
        await convertHeicToPng(temporaryInput, outputPath);
      } finally {
        await fs.promises.rm(temporaryInput, { force: true });
      }
      return { success: true, path: outputPath };
    }
    await fs.promises.writeFile(destinationPath, imageBuffer);
    return { success: true, path: destinationPath };
  }

  async deleteJson(relativePath) {
    if (
      typeof relativePath !== "string" ||
      path.extname(relativePath).toLowerCase() !== ".json"
    )
      throw new Error("Nom de fichier JSON invalide.");
    const normalizedPath = relativePath.replace(/\\/g, "/").toLowerCase();
    if (normalizedPath === "config.json" || normalizedPath.startsWith("users/"))
      throw new Error("Ce fichier JSON est protégé.");
    const fullPath = path.resolve(this.rootPath, relativePath);
    if (!fullPath.startsWith(`${this.rootPath}${path.sep}`))
      throw new Error("Chemin JSON invalide.");
    await fs.promises.unlink(fullPath);
    const config = await this.getConfig();
    config.pinnedJson = (
      Array.isArray(config.pinnedJson) ? config.pinnedJson : []
    ).filter(
      (entry) =>
        String(entry).replace(/\\/g, "/").toLowerCase() !== normalizedPath,
    );
    await fs.promises.writeFile(
      this.configFilePath(),
      JSON.stringify(config, null, 2),
    );
    return { success: true };
  }

  configFilePath() {
    return path.join(this.rootPath, "config.json");
  }

  async getConfig() {
    await this.ensureRoot();
    try {
      return JSON.parse(
        await fs.promises.readFile(this.configFilePath(), "utf8"),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const config = { pinnedJson: [] };
      await fs.promises.writeFile(
        this.configFilePath(),
        JSON.stringify(config, null, 2),
      );
      return config;
    }
  }

  async listPinned() {
    const config = await this.getConfig();
    return Array.isArray(config.pinnedJson) ? config.pinnedJson : [];
  }

  async togglePinned(relativePath) {
    const normalized = String(relativePath || "").replace(/\\/g, "/");
    if (
      !normalized.toLowerCase().endsWith(".json") ||
      normalized.toLowerCase() === "config.json" ||
      normalized.toLowerCase().startsWith("users/")
    )
      throw new Error("Ce fichier ne peut pas être épinglé.");
    const allFiles = await this.listFiles(
      (name) => path.extname(name).toLowerCase() === ".json",
    );
    if (!allFiles.some((file) => file.path.replace(/\\/g, "/") === normalized))
      throw new Error("Ce fichier JSON est introuvable.");
    const config = await this.getConfig();
    const files = Array.isArray(config.pinnedJson) ? config.pinnedJson : [];
    const index = files.indexOf(normalized);
    if (index >= 0) files.splice(index, 1);
    else files.push(normalized);
    config.pinnedJson = files;
    await fs.promises.writeFile(
      this.configFilePath(),
      JSON.stringify(config, null, 2),
    );
    return files;
  }

  async listContacts() {
    const files = await this.listFiles(
      (name) => path.extname(name).toLowerCase() === ".json",
    );
    const contacts = new Map();
    const visit = (value, source) => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item, source);
        return;
      }
      if (!value || typeof value !== "object") return;
      const emailEntry = Object.entries(value).find(
        ([key, item]) =>
          /email|e-mail|courriel/i.test(key) &&
          typeof item === "string" &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item),
      );
      const phoneEntry = Object.entries(value).find(
        ([key, item]) =>
          /phone|telephone|mobile/i.test(key) &&
          typeof item === "string" &&
          !/(?:user|account|profile|thread|fbid|id)/i.test(key) &&
          /^[+\d][\d\s().-]+$/.test(item) &&
          item.replace(/\D/g, "").length >= 7 &&
          item.replace(/\D/g, "").length <= 15,
      );
      const contactInfo = value.string_map_data?.["Contact Information"]?.value;
      const contactInfoIsEmail =
        typeof contactInfo === "string" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactInfo);
      const contactInfoIsPhone =
        typeof contactInfo === "string" &&
        /^[+\d][\d\s().-]+$/.test(contactInfo) &&
        contactInfo.replace(/\D/g, "").length >= 7 &&
        contactInfo.replace(/\D/g, "").length <= 15;
      const mention = Object.entries(value).find(
        ([key, item]) =>
          /username|user_name|mention/i.test(key) &&
          typeof item === "string" &&
          /^@?[\w.]{2,}$/.test(item),
      )?.[1];
      const email =
        emailEntry?.[1] || (contactInfoIsEmail ? contactInfo : null);
      const phone =
        phoneEntry?.[1] || (contactInfoIsPhone ? contactInfo : null);
      for (const [kind, entry] of [
        ["E-mail", email],
        ["Téléphone", phone],
        ["Mention", mention ? `@${mention.replace(/^@/, "")}` : null],
      ]) {
        if (entry)
          contacts.set(`${kind}:${entry}`, {
            type: kind,
            value: entry,
            source,
          });
      }
      for (const child of Object.values(value))
        if (child && typeof child === "object") visit(child, source);
    };
    for (const file of files) {
      if (
        file.path.replace(/\\/g, "/").toLowerCase() === "config.json" ||
        file.path.replace(/\\/g, "/").toLowerCase().startsWith("users/")
      )
        continue;
      try {
        visit(
          JSON.parse(
            await fs.promises.readFile(
              path.resolve(this.rootPath, file.path),
              "utf8",
            ),
          ),
          file.path,
        );
      } catch {
        /* Ignore malformed export files. */
      }
    }
    return [...contacts.values()];
  }

  async getMessageParticipants(relativePath, size, mtimeMs = 0) {
    const cacheKey = `${relativePath}:${size}:${mtimeMs}`;
    if (this.messageLabelCache.has(cacheKey))
      return this.messageLabelCache.get(cacheKey);
    let names = [];
    const fullPath = path.resolve(this.rootPath, relativePath);
    if (!fullPath.startsWith(`${this.rootPath}${path.sep}`)) return names;
    let handle;
    try {
      handle = await fs.promises.open(fullPath, "r");
      const buffer = Buffer.alloc(65536);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const header = buffer.toString("utf8", 0, bytesRead);
      const match = header.match(
        /\"participants\"\s*:\s*(\[[\s\S]*?\])\s*,\s*\"messages\"\s*:/,
      );
      if (match)
        names = [
          ...new Set(
            JSON.parse(match[1])
              .map((participant) => participant.name)
              .filter(Boolean),
          ),
        ];
    } catch {
      /* A conversation can still use its folder name as a label. */
    } finally {
      if (handle) await handle.close();
    }
    this.messageLabelCache.set(cacheKey, names);
    return names;
  }

  async getDashboardStats() {
    const files = await this.listFiles();
    const jsonFiles = files.filter(
      (file) => path.extname(file.name).toLowerCase() === ".json",
    );
    const signature = files
      .map((file) => `${file.path}:${file.size}:${file.mtimeMs}`)
      .join("|");
    if (this.dashboardStatsCache?.signature === signature) {
      return this.dashboardStatsCache.stats;
    }

    const messageFiles = jsonFiles.filter((file) => {
      const baseName = path.basename(file.name, path.extname(file.name));
      return /^message_.+$/i.test(baseName);
    });
    const conversationParticipants = new Map();

    for (const file of messageFiles) {
      const names = await this.getMessageParticipants(
        file.path,
        file.size,
        file.mtimeMs,
      );
      const participantKey = names
        .map((name) => name.toLocaleLowerCase())
        .sort()
        .join("|");
      const key = participantKey || path.dirname(file.path).toLocaleLowerCase();

      if (!conversationParticipants.has(key))
        conversationParticipants.set(key, names);
    }

    const participantFrequency = new Map();
    for (const names of conversationParticipants.values()) {
      for (const name of names) {
        participantFrequency.set(
          name,
          (participantFrequency.get(name) || 0) + 1,
        );
      }
    }

    const senderCounts = await this.countMessageSenders(messageFiles);
    const identities = await this.getProfileIdentities(jsonFiles);
    let sentMessageCount = [...identities].reduce((total, name) => {
      const count = senderCounts.get(name.toLocaleLowerCase()) || 0;
      return total + count;
    }, 0);

    if (!identities.size) {
      const owner = [...participantFrequency.keys()].sort(
        (a, b) =>
          participantFrequency.get(b) - participantFrequency.get(a) ||
          (senderCounts.get(b.toLocaleLowerCase()) || 0) -
            (senderCounts.get(a.toLocaleLowerCase()) || 0),
      )[0];
      sentMessageCount = owner
        ? senderCounts.get(owner.toLocaleLowerCase()) || 0
        : 0;
    }

    const friends = await this.countMutualFriends(jsonFiles);
    const extras = await this.getActivityStats(jsonFiles);
    const stats = {
      friendCount: friends,
      conversationCount: conversationParticipants.size,
      sentMessageCount,
      ...extras,
    };
    this.dashboardStatsCache = { signature, stats };
    return stats;
  }

  async getActivityStats(jsonFiles) {
    const counts = {
      likes: 0,
      likedComments: 0,
      comments: 0,
      stories: 0,
      storiesViewed: 0,
      storyLikes: 0,
      savedPosts: 0,
      savedMusic: 0,
      savedCollections: 0,
      profileSearches: 0,
      wordSearches: 0,
      postsViewed: 0,
      videosWatched: 0,
      followers: 0,
      following: 0,
      closeFriends: 0,
      pendingRequests: 0,
      recentFollowRequests: 0,
      recentlyUnfollowed: 0,
    };
    for (const file of jsonFiles) {
      const normalized = file.path.replace(/\\/g, "/").toLowerCase();
      if (normalized.startsWith("users/") || normalized === "config.json")
        continue;
      let field = null;
      if (/liked_posts\.json$/.test(normalized)) field = "likes";
      else if (/liked_comments\.json$/.test(normalized))
        field = "likedComments";
      else if (/post_comments.*\.json$/.test(normalized)) field = "comments";
      else if (/\/stories\.json$/.test(normalized)) field = "stories";
      else if (/story_interactions\/stories_viewed\.json$/.test(normalized))
        field = "storiesViewed";
      else if (/story_interactions\/story_likes\.json$/.test(normalized))
        field = "storyLikes";
      else if (/saved_posts\.json$/.test(normalized)) field = "savedPosts";
      else if (/saved_music\.json$/.test(normalized)) field = "savedMusic";
      else if (/saved_collections\.json$/.test(normalized))
        field = "savedCollections";
      else if (/recent_searches\/profile_searches\.json$/.test(normalized))
        field = "profileSearches";
      else if (
        /recent_searches\/word_or_phrase_searches\.json$/.test(normalized)
      )
        field = "wordSearches";
      else if (/ads_and_topics\/posts_viewed\.json$/.test(normalized))
        field = "postsViewed";
      else if (/ads_and_topics\/videos_watched\.json$/.test(normalized))
        field = "videosWatched";
      else if (
        /followers_and_following\/followers(?:_\d+)?\.json$/.test(normalized)
      )
        field = "followers";
      else if (/followers_and_following\/following\.json$/.test(normalized))
        field = "following";
      else if (/followers_and_following\/close_friends\.json$/.test(normalized))
        field = "closeFriends";
      else if (
        /followers_and_following\/pending_follow_requests\.json$/.test(
          normalized,
        )
      )
        field = "pendingRequests";
      else if (
        /followers_and_following\/recent_follow_requests\.json$/.test(
          normalized,
        )
      )
        field = "recentFollowRequests";
      else if (
        /followers_and_following\/recently_unfollowed_profiles\.json$/.test(
          normalized,
        )
      )
        field = "recentlyUnfollowed";
      if (!field) continue;
      try {
        const data = JSON.parse(
          await fs.promises.readFile(
            path.resolve(this.rootPath, file.path),
            "utf8",
          ),
        );
        const countItems = (value) =>
          Array.isArray(value)
            ? value.length
            : value && typeof value === "object"
              ? Object.values(value).reduce(
                  (sum, item) => sum + countItems(item),
                  0,
                )
              : 0;
        counts[field] += countItems(data);
      } catch {
        /* Ignore malformed export files. */
      }
    }
    return counts;
  }

  async countMutualFriends(jsonFiles) {
    const followers = new Set();
    const following = new Set();
    const normalizeName = (name) =>
      String(name || "")
        .trim()
        .replace(/^@/, "")
        .normalize("NFKC")
        .toLocaleLowerCase();

    const collectNames = (value, output) => {
      if (Array.isArray(value)) {
        for (const item of value) collectNames(item, output);
        return;
      }
      if (!value || typeof value !== "object") return;

      if (Array.isArray(value.string_list_data)) {
        for (const item of value.string_list_data) {
          const hrefName = item?.href?.match(
            /(?:instagram\.com\/(?:_u\/)?)([^/?#]+)/i,
          )?.[1];
          const name = item?.value || value.title || hrefName;
          if (name) output.add(normalizeName(name));
        }
      }

      for (const child of Object.values(value)) {
        if (child && typeof child === "object") collectNames(child, output);
      }
    };

    for (const file of jsonFiles) {
      const normalizedPath = file.path.replace(/\\/g, "/").toLowerCase();
      const isFollowerFile =
        /(?:^|\/)followers_and_following\/followers(?:_\d+)?\.json$/.test(
          normalizedPath,
        );
      const isFollowingFile =
        /(?:^|\/)followers_and_following\/following\.json$/.test(
          normalizedPath,
        );
      if (!isFollowerFile && !isFollowingFile) continue;

      try {
        const data = JSON.parse(
          await fs.promises.readFile(
            path.resolve(this.rootPath, file.path),
            "utf8",
          ),
        );
        collectNames(data, isFollowerFile ? followers : following);
      } catch {
        // An incomplete or removed connection export should not stop the dashboard.
      }
    }

    let count = 0;
    for (const name of followers) {
      if (following.has(name)) count++;
    }
    return count;
  }

  normalizeConnectionName(name) {
    return String(name || "")
      .trim()
      .replace(/^@/, "")
      .normalize("NFKC")
      .toLocaleLowerCase();
  }

  collectConnectionNames(value, output) {
    if (Array.isArray(value)) {
      for (const item of value) this.collectConnectionNames(item, output);
      return;
    }

    if (!value || typeof value !== "object") return;

    if (Array.isArray(value.string_list_data)) {
      for (const item of value.string_list_data) {
        const hrefName = item?.href?.match(
          /(?:instagram\.com\/(?:_u\/)?)([^/?#]+)/i,
        )?.[1];
        const username = item?.value || value.title || hrefName;
        const normalized = this.normalizeConnectionName(username);

        if (normalized) output.set(normalized, String(username).trim());
      }
    }

    for (const child of Object.values(value)) {
      if (child && typeof child === "object") {
        this.collectConnectionNames(child, output);
      }
    }
  }

  async getConnectionSets(jsonFiles) {
    const followers = new Map();
    const following = new Map();

    for (const file of jsonFiles) {
      const normalizedPath = file.path.replace(/\\/g, "/").toLowerCase();
      const isFollowerFile =
        /(?:^|\/)followers_and_following\/followers(?:_\d+)?\.json$/.test(
          normalizedPath,
        );
      const isFollowingFile =
        /(?:^|\/)followers_and_following\/following\.json$/.test(
          normalizedPath,
        );

      if (!isFollowerFile && !isFollowingFile) continue;

      try {
        const filePath = path.resolve(this.rootPath, file.path);
        const data = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
        const names = isFollowerFile ? followers : following;
        this.collectConnectionNames(data, names);
      } catch {
        // An incomplete or removed connection export should not block comparison.
      }
    }

    return { followers, following };
  }

  async getRecentlyUnfollowedNames(jsonFiles) {
    const file = jsonFiles.find((item) =>
      item.path
        .replace(/\\/g, "/")
        .toLowerCase()
        .endsWith("/followers_and_following/recently_unfollowed_profiles.json"),
    );

    if (!file) return new Map();

    try {
      const filePath = path.resolve(this.rootPath, file.path);
      const records = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
      const names = new Map();

      const collectProfileNames = (value) => {
        if (Array.isArray(value)) {
          for (const item of value) collectProfileNames(item);
          return;
        }

        if (!value || typeof value !== "object") return;

        if (Array.isArray(value.label_values)) {
          const profileName = value.label_values.find((item) => {
            return /nom de profil|profile name|username/i.test(
              item.label || "",
            );
          })?.value;

          if (profileName) {
            const normalized = this.normalizeConnectionName(profileName);
            names.set(normalized, String(profileName).trim());
          }
        }

        for (const child of Object.values(value)) {
          if (child && typeof child === "object") collectProfileNames(child);
        }
      };

      collectProfileNames(records);
      return names;
    } catch {
      return new Map();
    }
  }

  async getConnectionComparison() {
    const jsonFiles = await this.listFiles((name) => {
      return path.extname(name).toLowerCase() === ".json";
    });
    const { followers, following } = await this.getConnectionSets(jsonFiles);
    const recentlyUnfollowed = await this.getRecentlyUnfollowedNames(jsonFiles);

    const sortNames = (names) =>
      names.sort((left, right) => left.localeCompare(right, "fr"));
    const followingNotFollowingBack = sortNames(
      [...following]
        .filter(([username]) => !followers.has(username))
        .map(([, displayName]) => displayName),
    );
    const lostBothWays = sortNames(
      [...recentlyUnfollowed]
        .filter(
          ([username]) => !followers.has(username) && !following.has(username),
        )
        .map(([, displayName]) => displayName),
    );
    const followersNotFollowedBack = sortNames(
      [...followers]
        .filter(([username]) => !following.has(username))
        .map(([, displayName]) => displayName),
    );

    return {
      followingNotFollowingBack,
      lostBothWays,
      followersNotFollowedBack,
    };
  }

  async getProfileIdentities(jsonFiles) {
    const profile = jsonFiles.find((file) =>
      file.path
        .replace(/\\/g, "/")
        .toLowerCase()
        .endsWith(
          "/personal_information/personal_information/personal_information.json",
        ),
    );
    if (!profile) return new Set();
    try {
      const data = JSON.parse(
        await fs.promises.readFile(
          path.resolve(this.rootPath, profile.path),
          "utf8",
        ),
      );
      const identities = new Set();
      for (const user of data.profile_user || []) {
        const values = user.string_map_data || {};
        for (const key of ["Username", "Name"]) {
          const value = values[key]?.value;
          if (typeof value === "string" && value.trim())
            identities.add(value.trim());
        }
      }
      return identities;
    } catch {
      return new Set();
    }
  }

  async countMessageSenders(messageFiles) {
    const counts = new Map();
    const pattern = /"sender_name"\s*:\s*("(?:\\.|[^"\\])*")/g;
    const collect = (text, start, end) => {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) && match.index < end) {
        if (match.index < start) continue;
        try {
          const name = JSON.parse(match[1]);
          const normalizedName = name.toLocaleLowerCase();
          counts.set(normalizedName, (counts.get(normalizedName) || 0) + 1);
        } catch {
          /* Ignore an incomplete JSON string at a chunk edge. */
        }
      }
    };
    const overlap = 4096;
    for (const file of messageFiles) {
      let carry = "";
      let lastText = "";
      let lastStart = 0;
      const stream = fs.createReadStream(
        path.resolve(this.rootPath, file.path),
        { encoding: "utf8" },
      );
      try {
        for await (const chunk of stream) {
          const text = carry + chunk;
          const safeEnd = Math.max(0, text.length - overlap);
          collect(text, 0, safeEnd);
          carry = text.slice(safeEnd);
          lastText = text;
          lastStart = safeEnd;
        }
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      if (lastText) collect(lastText, lastStart, lastText.length);
    }
    return counts;
  }

  async searchJson(query) {
    const needle = String(query || "")
      .trim()
      .toLocaleLowerCase();
    if (!needle) return [];
    const overlap = needle.length + 40;
    const results = [];
    const files = await this.listFiles(
      (name) => path.extname(name).toLowerCase() === ".json",
    );
    for (const file of files) {
      const normalizedPath = file.path.replace(/\\/g, "/").toLowerCase();
      if (
        normalizedPath === "config.json" ||
        normalizedPath.startsWith("users/")
      )
        continue;
      if (file.path.toLocaleLowerCase().includes(needle)) {
        const index = file.path.toLocaleLowerCase().indexOf(needle);
        results.push({
          path: file.path,
          matchCount: 1,
          matches: [
            {
              before: file.path.slice(Math.max(0, index - 20), index),
              value: file.path.slice(index, index + needle.length),
              after: file.path.slice(
                index + needle.length,
                index + needle.length + 20,
              ),
            },
          ],
        });
        continue;
      }
      let carry = "";
      let pendingTail = "";
      let pendingTailStart = 0;
      let matchCount = 0;
      const matches = [];
      const stream = fs.createReadStream(
        path.resolve(this.rootPath, file.path),
        { encoding: "utf8" },
      );
      for await (const chunk of stream) {
        const text = carry + chunk;
        const searchable = text.toLocaleLowerCase();
        const safeEnd = Math.max(0, text.length - overlap);
        pendingTail = text;
        pendingTailStart = safeEnd;
        let index = searchable.indexOf(needle);
        while (index !== -1 && index < safeEnd) {
          matchCount++;
          if (matches.length < 100)
            matches.push({
              before: text.slice(Math.max(0, index - 20), index),
              value: text.slice(index, index + needle.length),
              after: text.slice(
                index + needle.length,
                index + needle.length + 20,
              ),
            });
          index = searchable.indexOf(
            needle,
            index + Math.max(needle.length, 1),
          );
        }
        carry = overlap ? text.slice(-overlap) : "";
      }
      const finalTail = pendingTail.slice(pendingTailStart);
      if (finalTail) {
        const searchableTail = finalTail.toLocaleLowerCase();
        let index = searchableTail.indexOf(needle);
        while (index !== -1) {
          matchCount++;
          if (matches.length < 100) {
            const absoluteIndex = pendingTailStart + index;
            matches.push({
              before: pendingTail.slice(
                Math.max(0, absoluteIndex - 20),
                absoluteIndex,
              ),
              value: pendingTail.slice(
                absoluteIndex,
                absoluteIndex + needle.length,
              ),
              after: pendingTail.slice(
                absoluteIndex + needle.length,
                absoluteIndex + needle.length + 20,
              ),
            });
          }
          index = searchableTail.indexOf(
            needle,
            index + Math.max(needle.length, 1),
          );
        }
      }
      if (matchCount) {
        results.push({ path: file.path, matchCount, matches });
      }
    }
    return results;
  }

  listNonJson() {
    return this.listFiles(
      (name) => path.extname(name).toLowerCase() !== ".json",
    );
  }

  async readJson(relativePath) {
    if (
      typeof relativePath !== "string" ||
      path.extname(relativePath).toLowerCase() !== ".json"
    )
      throw new Error("Nom de fichier JSON invalide.");
    const fullPath = path.resolve(this.rootPath, relativePath);
    if (!fullPath.startsWith(`${this.rootPath}${path.sep}`))
      throw new Error("Chemin JSON invalide.");
    return JSON.parse(await fs.promises.readFile(fullPath, "utf8"));
  }

  async deleteNonJson(onProgress = () => {}) {
    const files = await this.listNonJson();
    let deletedCount = 0;
    let freedBytes = 0;
    onProgress({
      phase: "starting",
      totalFiles: files.length,
      deletedFiles: 0,
    });
    for (const [index, file] of files.entries()) {
      const fullPath = path.resolve(this.rootPath, file.path);
      if (!fullPath.startsWith(`${this.rootPath}${path.sep}`))
        throw new Error("Chemin de fichier invalide.");
      try {
        await fs.promises.unlink(fullPath);
        deletedCount++;
        freedBytes += file.size;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      onProgress({
        phase: "deleting",
        totalFiles: files.length,
        deletedFiles: index + 1,
        freedBytes,
      });
    }
    onProgress({
      phase: "complete",
      totalFiles: files.length,
      deletedFiles: files.length,
      freedBytes,
    });
    return { deletedCount, freedBytes };
  }

  async getSize() {
    let total = 0;
    for (const file of await this.listFiles()) total += file.size;
    return total;
  }
}

module.exports = ModelRepository;
