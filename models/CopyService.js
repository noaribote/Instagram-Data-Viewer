const fs = require("fs");
const path = require("path");
const { convertHeicToPng, isHeic, pngPath } = require("./ImageConversion");

class CopyService {
  constructor(destination) {
    this.destination = path.resolve(destination);
    this.activeJob = null;
    this.replaceWaiters = new Map();
  }

  async copy(sender, sourcePaths) {
    if (this.activeJob)
      return { success: false, error: "A copy is already running." };
    if (!Array.isArray(sourcePaths) || !sourcePaths.length)
      return { success: false, error: "No valid files to copy." };
    const job = {
      cancelled: false,
      copiedPaths: [],
      createdDirectories: new Set(),
      copiedBytesDelta: 0,
      replace: false,
    };
    this.activeJob = job;
    try {
      sender.send("copy-progress", { phase: "scanning" });
      const files = [];
      for (const sourcePath of sourcePaths)
        await this.collectFiles(sourcePath, files);
      if (job.cancelled) return this.cancelled(sender);
      for (const file of files) {
        file.convert = isHeic(file.path);
        if (file.convert) file.outputName = path.basename(pngPath(file.path));
      }
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      const existingPaths = [];
      for (const file of files) {
        try {
          await fs.promises.access(this.getTargetPath(file));
          existingPaths.push(this.getTargetPath(file));
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      if (existingPaths.length) {
        const replace = await this.waitForReplaceChoice(
          sender,
          existingPaths.length,
          job,
        );
        if (job.cancelled || !replace) return this.cancelled(sender);
        job.replace = true;
      }
      await fs.promises.mkdir(this.destination, { recursive: true });
      const existingSize = await this.getDirectorySize(this.destination).catch(
        () => 0,
      );
      sender.send("copy-progress", {
        phase: "copying",
        totalBytes,
        existingSize,
        copiedBytes: 0,
        totalFiles: files.length,
        copiedFiles: 0,
      });
      let copiedBytes = 0;
      for (let index = 0; index < files.length; index++) {
        if (job.cancelled) break;
        const file = files[index];
        const targetPath = this.getTargetPath(file);
        await this.ensureDirectory(
          path.dirname(targetPath),
          job.createdDirectories,
        );
        const previousStat = job.replace
          ? await fs.promises.stat(targetPath).catch(() => null)
          : null;
        if (file.convert) {
          await convertHeicToPng(file.path, targetPath);
        } else {
          await fs.promises.copyFile(
            file.path,
            targetPath,
            job.replace ? 0 : fs.constants.COPYFILE_EXCL,
          );
        }
        job.copiedPaths.push(targetPath);
        job.copiedBytesDelta += file.size - (previousStat?.size || 0);
        copiedBytes += file.size;
        sender.send("copy-progress", {
          phase: "copying",
          totalBytes,
          existingSize,
          copiedBytes,
          copiedBytesDelta: job.copiedBytesDelta,
          totalFiles: files.length,
          copiedFiles: index + 1,
        });
      }
      if (job.cancelled) {
        for (const copiedPath of job.copiedPaths)
          await fs.promises.rm(copiedPath, { force: true });
        for (const directory of [...job.createdDirectories].sort(
          (a, b) => b.length - a.length,
        )) {
          try {
            await fs.promises.rmdir(directory);
          } catch (error) {
            if (!["ENOTEMPTY", "ENOENT"].includes(error.code)) throw error;
          }
        }
        return this.cancelled(sender);
      }
      sender.send("copy-progress", {
        phase: "complete",
        totalBytes,
        copiedBytes,
        totalFiles: files.length,
        copiedFiles: files.length,
      });
      return { success: true };
    } catch (error) {
      sender.send("copy-progress", { phase: "error", error: error.message });
      return { success: false, error: error.message };
    } finally {
      this.activeJob = null;
    }
  }

  cancel() {
    if (this.activeJob) {
      this.activeJob.cancelled = true;
      this.activeJob.resolveReplace?.(false);
    }
  }
  chooseReplace(id, replace) {
    this.replaceWaiters.get(id)?.(Boolean(replace));
  }
  cancelled(sender) {
    sender.send("copy-progress", { phase: "cancelled" });
    return { success: false, cancelled: true };
  }
  waitForReplaceChoice(sender, count, job) {
    const requestId = `${Date.now()}-${Math.random()}`;
    return new Promise((resolve) => {
      const finish = (replace) => {
        this.replaceWaiters.delete(requestId);
        job.resolveReplace = null;
        resolve(replace);
      };
      this.replaceWaiters.set(requestId, finish);
      job.resolveReplace = finish;
      sender.send("copy-progress", { phase: "conflict", requestId, count });
    });
  }
  getTargetPath(file) {
    if (file.root === file.path)
      return path.join(
        this.destination,
        file.outputName || path.basename(file.path),
      );
    return path.join(
      this.destination,
      path.basename(file.root),
      path.dirname(path.relative(file.root, file.path)),
      file.outputName || path.basename(file.path),
    );
  }

  async ensureDirectory(directory, createdDirectories) {
    const missing = [];
    let current = directory;
    while (true) {
      try {
        await fs.promises.access(current);
        break;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        missing.push(current);
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
    await fs.promises.mkdir(directory, { recursive: true });
    for (const item of missing) createdDirectories.add(item);
  }

  async collectFiles(sourcePath, files) {
    const stats = await fs.promises.stat(sourcePath);
    if (stats.isFile()) {
      files.push({ path: sourcePath, root: sourcePath, size: stats.size });
      return;
    }
    if (!stats.isDirectory()) return;
    const walk = async (directory) => {
      const entries = await fs.promises.readdir(directory, {
        withFileTypes: true,
      });
      for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(entryPath);
        else if (entry.isFile())
          files.push({
            path: entryPath,
            root: sourcePath,
            size: (await fs.promises.stat(entryPath)).size,
          });
      }
    };
    await walk(sourcePath);
  }

  async getDirectorySize(directory) {
    let total = 0;
    for (const entry of await fs.promises.readdir(directory, {
      withFileTypes: true,
    })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) total += await this.getDirectorySize(fullPath);
      else if (entry.isFile()) total += (await fs.promises.stat(fullPath)).size;
    }
    return total;
  }
}

module.exports = CopyService;
