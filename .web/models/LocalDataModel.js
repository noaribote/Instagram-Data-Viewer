(() => {
  "use strict";

  class LocalDataModel {
    constructor() {
      this.databaseName = "instagram-data-viewer-web";
      this.metadataStore = "files";
      this.contentStore = "contents";
      this.database = null;
    }

    async connect(onProgress = () => {}) {
      this.database = await new Promise((resolve, reject) => {
        const request = indexedDB.open(this.databaseName, 2);
        request.onupgradeneeded = (event) => {
          const database = request.result;
          if (event.oldVersion < 1)
            database.createObjectStore(this.metadataStore, { keyPath: "path" });
          if (event.oldVersion < 2) {
            const contentStore = database.createObjectStore(this.contentStore, { keyPath: "path" });
            if (event.oldVersion === 1) {
              const metadata = contentStore.transaction.objectStore(this.metadataStore);
              const countRequest = metadata.count();
              countRequest.onsuccess = () => {
                const total = countRequest.result;
                let current = 0;
                onProgress({ phase: "migrating", current, total });
                const cursorRequest = metadata.openCursor();
                cursorRequest.onsuccess = () => {
                  const cursor = cursorRequest.result;
                  if (!cursor) return;
                  const record = cursor.value;
                  contentStore.put({
                    path: record.path,
                    jsonText: record.jsonText ?? null,
                    blob: record.blob ?? null,
                  });
                  record.hasJson = typeof record.jsonText === "string";
                  delete record.jsonText;
                  delete record.blob;
                  cursor.update(record);
                  current++;
                  if (current % 20 === 0 || current === total)
                    onProgress({ phase: "migrating", current, total });
                  cursor.continue();
                };
              };
            }
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return this;
    }

    getAll() {
      return new Promise((resolve, reject) => {
        const request = this.database
          .transaction(this.metadataStore)
          .objectStore(this.metadataStore)
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    write(storeNames, mode, operation) {
      return new Promise((resolve, reject) => {
        const transaction = this.database.transaction(storeNames, mode);
        const stores = Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]));
        let result;
        try {
          result = operation(stores);
        } catch (error) {
          reject(error);
          return;
        }
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    }

    put(record) {
      const { jsonText, blob, ...metadata } = record;
      metadata.hasJson = jsonText !== null;
      return this.write([this.metadataStore, this.contentStore], "readwrite", (stores) => {
        stores[this.metadataStore].put(metadata);
        stores[this.contentStore].put({ path: record.path, jsonText, blob });
      });
    }

    delete(path) {
      return this.write([this.metadataStore, this.contentStore], "readwrite", (stores) => {
        stores[this.metadataStore].delete(path);
        stores[this.contentStore].delete(path);
      });
    }

    clear() {
      return this.write([this.metadataStore, this.contentStore], "readwrite", (stores) => {
        stores[this.metadataStore].clear();
        stores[this.contentStore].clear();
      });
    }

    getContent(path) {
      return new Promise((resolve, reject) => {
        const request = this.database
          .transaction(this.contentStore)
          .objectStore(this.contentStore)
          .get(path);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    }

    static readList(key, fallback = []) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "null");
        return Array.isArray(value) ? value : fallback;
      } catch {
        return fallback;
      }
    }

    static writeList(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }

    static formatBytes(value) {
      if (!value) return "0 o";
      const units = ["o", "Ko", "Mo", "Go", "To"];
      let index = 0;
      while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index++;
      }
      return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${units[index]}`;
    }

    static labelFor(path) {
      return path
        .split(/[\\/]/)
        .pop()
        .replace(/\.json$/i, "")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("fr-FR"));
    }

    static categoryFor(path) {
      const normalized = path.toLowerCase();
      if (
        normalized.includes("connections") ||
        normalized.includes("followers_and_following")
      )
        return "connections";
      if (
        normalized.includes("activity") ||
        normalized.includes("ads_and_topics") ||
        normalized.includes("recent_searches")
      )
        return "activity";
      if (normalized.includes("personal_information")) return "personal";
      return "other";
    }

    async search(files, query, isStale = () => false) {
      const needle = query.toLocaleLowerCase("fr-FR");
      const results = [];
      for (const file of files) {
        if (!file.hasJson) continue;
        if (isStale()) return [];
        const content = await this.getContent(file.path);
        if (!content?.jsonText) continue;
        const text = content.jsonText.toLocaleLowerCase("fr-FR");
        let offset = 0;
        let count = 0;
        while ((offset = text.indexOf(needle, offset)) !== -1 && count < 100) {
          count++;
          offset += needle.length || 1;
        }
        if (count) {
          const matchIndex = text.indexOf(needle);
          const excerptStart = Math.max(0, matchIndex - 65);
          const excerptEnd = matchIndex + needle.length + 100;
          const excerpt = content.jsonText
            .slice(excerptStart, excerptEnd)
            .replace(/[\r\n]+/g, " ");

          results.push({ file, count, excerpt });
        }
      }
      return results.sort((a, b) => b.count - a.count).slice(0, 100);
    }

    async importSelection(fileList, { onProgress, isCancelled }) {
      const initial = [...fileList].map((file) => ({
        file,
        path: file.webkitRelativePath || file.name,
      }));
      const selected = [];

      for (const item of initial) {
        if (/\.zip$/i.test(item.file.name)) {
          onProgress?.({ message: `Ouverture de ${item.file.name}…` });
          selected.push(...(await this.expandZip(item.file)));
        } else {
          selected.push(item);
        }
      }

      if (!selected.length) throw new Error("Aucun fichier exploitable dans la sélection.");
      let imported = 0;
      for (const item of selected) {
        if (isCancelled()) break;
        const { file } = item;
        let jsonText = null;
        if (/\.json$/i.test(file.name)) jsonText = await file.text();
        const blob = item.blob || file.blob || (jsonText === null ? file : null);
        await this.put({
          path: item.path,
          size: file.size,
          type: file.type,
          jsonText,
          blob,
        });
        imported++;
        onProgress?.({
          imported,
          total: selected.length,
          path: item.path,
          size: file.size,
        });
        if (imported % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return { imported, cancelled: isCancelled() };
    }

    async expandZip(file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const view = new DataView(bytes.buffer);
      let endRecord = -1;
      for (
        let index = bytes.length - 22;
        index >= Math.max(0, bytes.length - 65558);
        index--
      ) {
        if (view.getUint32(index, true) === 0x06054b50) {
          endRecord = index;
          break;
        }
      }
      if (endRecord < 0)
        throw new Error(`L’archive ${file.name} ne semble pas être un ZIP valide.`);

      const entries = view.getUint16(endRecord + 10, true);
      const centralDirectoryOffset = view.getUint32(endRecord + 16, true);
      const expanded = [];
      let cursor = centralDirectoryOffset;

      for (let index = 0; index < entries; index++) {
        if (view.getUint32(cursor, true) !== 0x02014b50)
          throw new Error("L’index central de l’archive est invalide.");
        const method = view.getUint16(cursor + 10, true);
        const compressedSize = view.getUint32(cursor + 20, true);
        const nameLength = view.getUint16(cursor + 28, true);
        const extraLength = view.getUint16(cursor + 30, true);
        const commentLength = view.getUint16(cursor + 32, true);
        const localHeaderOffset = view.getUint32(cursor + 42, true);
        const name = new TextDecoder().decode(
          bytes.subarray(cursor + 46, cursor + 46 + nameLength),
        );
        cursor += 46 + nameLength + extraLength + commentLength;
        if (name.endsWith("/")) continue;

        const localNameLength = view.getUint16(localHeaderOffset + 26, true);
        const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
        const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
        const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
        const content = await this.inflateZipEntry(compressed, method);
        const blob = new Blob([content]);
        const path = `${file.name.replace(/\.zip$/i, "")}/${name}`;
        expanded.push({
          path,
          blob,
          file: {
            name: name.split("/").pop(),
            size: content.byteLength,
            type: "",
            blob,
            text: () => blob.text(),
          },
        });
      }
      return expanded;
    }

    async inflateZipEntry(bytes, method) {
      if (method === 0) return bytes;
      if (method !== 8)
        throw new Error(`Compression ZIP non prise en charge (${method}).`);
      if (typeof DecompressionStream === "undefined")
        throw new Error("Ce navigateur ne sait pas décompresser les archives ZIP.");
      const stream = new Blob([bytes])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
  }

  window.LocalDataModel = LocalDataModel;
})();
