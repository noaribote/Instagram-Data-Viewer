const fs = require('fs');
const path = require('path');

class ModelRepository {
    constructor(rootPath) { this.rootPath = path.resolve(rootPath); }

    async ensureRoot() { await fs.promises.mkdir(this.rootPath, { recursive: true }); }

    async listFiles(predicate = () => true) {
        await this.ensureRoot();
        const files = [];
        const walk = async (directory) => {
            let entries;
            try { entries = await fs.promises.readdir(directory, { withFileTypes: true }); }
            catch (error) { if (error.code === 'ENOENT') return; throw error; }
            for (const entry of entries) {
                const fullPath = path.join(directory, entry.name);
                if (entry.isDirectory()) await walk(fullPath);
                else if (entry.isFile() && predicate(entry.name)) {
                    try {
                        const stats = await fs.promises.stat(fullPath);
                        files.push({ path: path.relative(this.rootPath, fullPath), name: entry.name, size: stats.size });
                    } catch (error) { if (error.code !== 'ENOENT') throw error; }
                }
            }
        };
        await walk(this.rootPath);
        return files;
    }

    async listJson() {
        return (await this.listFiles((name) => path.extname(name).toLowerCase() === '.json'))
            .map((file) => ({ path: file.path, label: path.basename(file.name, path.extname(file.name)), size: file.size }));
    }

    listNonJson() { return this.listFiles((name) => path.extname(name).toLowerCase() !== '.json'); }

    async readJson(relativePath) {
        if (typeof relativePath !== 'string' || path.extname(relativePath).toLowerCase() !== '.json') throw new Error('Nom de fichier JSON invalide.');
        const fullPath = path.resolve(this.rootPath, relativePath);
        if (!fullPath.startsWith(`${this.rootPath}${path.sep}`)) throw new Error('Chemin JSON invalide.');
        return JSON.parse(await fs.promises.readFile(fullPath, 'utf8'));
    }

    async deleteNonJson(onProgress = () => {}) {
        const files = await this.listNonJson();
        let deletedCount = 0;
        let freedBytes = 0;
        onProgress({ phase: 'starting', totalFiles: files.length, deletedFiles: 0 });
        for (const [index, file] of files.entries()) {
            const fullPath = path.resolve(this.rootPath, file.path);
            if (!fullPath.startsWith(`${this.rootPath}${path.sep}`)) throw new Error('Chemin de fichier invalide.');
            try { await fs.promises.unlink(fullPath); deletedCount++; freedBytes += file.size; }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
            onProgress({ phase: 'deleting', totalFiles: files.length, deletedFiles: index + 1, freedBytes });
        }
        onProgress({ phase: 'complete', totalFiles: files.length, deletedFiles: files.length, freedBytes });
        return { deletedCount, freedBytes };
    }

    async getSize() {
        let total = 0;
        for (const file of await this.listFiles()) total += file.size;
        return total;
    }
}

module.exports = ModelRepository;
