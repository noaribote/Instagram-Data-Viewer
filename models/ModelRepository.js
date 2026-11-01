const fs = require('fs');
const path = require('path');

class ModelRepository {
    constructor(rootPath) {
        this.rootPath = path.resolve(rootPath);
        this.messageLabelCache = new Map();
        this.dashboardStatsCache = null;
    }

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
                        files.push({ path: path.relative(this.rootPath, fullPath), name: entry.name, size: stats.size, mtimeMs: stats.mtimeMs });
                    } catch (error) { if (error.code !== 'ENOENT') throw error; }
                }
            }
        };
        await walk(this.rootPath);
        return files;
    }

    async listJson() {
        const files = await this.listFiles((name) => path.extname(name).toLowerCase() === '.json');
        const result = [];
        const conversations = new Map();
        for (const file of files) {
            const label = path.basename(file.name, path.extname(file.name));
            if (!/^message_.+$/i.test(label)) {
                result.push({ path: file.path, label, size: file.size });
                continue;
            }

            const folder = path.basename(path.dirname(file.path));
            const folderName = folder.replace(/_\d{8,}$/, '').replace(/[_-]+/g, ' ').trim();
            const participants = await this.getMessageParticipants(file.path, file.size);
            const key = participants.length
                ? participants.map((name) => name.trim().toLocaleLowerCase()).sort().join('|')
                : path.dirname(file.path).toLocaleLowerCase();
            let conversation = conversations.get(key);
            if (!conversation) {
                const name = folderName && !/^\d+$/.test(folderName) ? folderName : participants.join(' et ');
                conversation = {
                    path: file.path,
                    paths: [],
                    label: `Messages avec ${name.replace(/^./, (character) => character.toUpperCase()) || 'un contact'}`,
                    size: 0,
                    messageGroup: true
                };
                conversations.set(key, conversation);
                result.push(conversation);
            }
            conversation.paths.push(file.path);
            conversation.size += file.size;
        }
        return result;
    }

    async getMessageParticipants(relativePath, size) {
        const cacheKey = `${relativePath}:${size}`;
        if (this.messageLabelCache.has(cacheKey)) return this.messageLabelCache.get(cacheKey);
        let names = [];
        const fullPath = path.resolve(this.rootPath, relativePath);
        if (!fullPath.startsWith(`${this.rootPath}${path.sep}`)) return names;
        let handle;
        try {
            handle = await fs.promises.open(fullPath, 'r');
            const buffer = Buffer.alloc(65536);
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
            const header = buffer.toString('utf8', 0, bytesRead);
            const match = header.match(/\"participants\"\s*:\s*(\[[\s\S]*?\])\s*,\s*\"messages\"\s*:/);
            if (match) names = [...new Set(JSON.parse(match[1]).map((participant) => participant.name).filter(Boolean))];
        } catch { /* A conversation can still use its folder name as a label. */ }
        finally { if (handle) await handle.close(); }
        this.messageLabelCache.set(cacheKey, names);
        return names;
    }

    async getDashboardStats() {
        const files = await this.listFiles();
        const jsonFiles = files.filter((file) => path.extname(file.name).toLowerCase() === '.json');
        const signature = files
            .map((file) => `${file.path}:${file.size}:${file.mtimeMs}`)
            .join('|');
        if (this.dashboardStatsCache?.signature === signature) {
            return this.dashboardStatsCache.stats;
        }

        const messageFiles = jsonFiles.filter((file) => {
            const baseName = path.basename(file.name, path.extname(file.name));
            return /^message_.+$/i.test(baseName);
        });
        const conversationParticipants = new Map();

        for (const file of messageFiles) {
            const names = await this.getMessageParticipants(file.path, file.size);
            const participantKey = names
                .map((name) => name.toLocaleLowerCase())
                .sort()
                .join('|');
            const key = participantKey || path.dirname(file.path).toLocaleLowerCase();

            if (!conversationParticipants.has(key)) conversationParticipants.set(key, names);
        }

        const participantFrequency = new Map();
        for (const names of conversationParticipants.values()) {
            for (const name of names) {
                participantFrequency.set(name, (participantFrequency.get(name) || 0) + 1);
            }
        }

        const senderCounts = await this.countMessageSenders(messageFiles);
        const identities = await this.getProfileIdentities(jsonFiles);
        let sentMessageCount = [...identities].reduce((total, name) => {
            const count = senderCounts.get(name.toLocaleLowerCase()) || 0;
            return total + count;
        }, 0);

        if (!identities.size) {
            const owner = [...participantFrequency.keys()].sort((a, b) =>
                participantFrequency.get(b) - participantFrequency.get(a) ||
                (senderCounts.get(b.toLocaleLowerCase()) || 0) -
                (senderCounts.get(a.toLocaleLowerCase()) || 0)
            )[0];
            sentMessageCount = owner ? senderCounts.get(owner.toLocaleLowerCase()) || 0 : 0;
        }

        const friends = await this.countMutualFriends(jsonFiles);
        const stats = {
            friendCount: friends,
            conversationCount: conversationParticipants.size,
            sentMessageCount
        };
        this.dashboardStatsCache = { signature, stats };
        return stats;
    }

    async countMutualFriends(jsonFiles) {
        const followers = new Set();
        const following = new Set();
        const normalizeName = (name) => String(name || '')
            .trim()
            .replace(/^@/, '')
            .normalize('NFKC')
            .toLocaleLowerCase();

        const collectNames = (value, output) => {
            if (Array.isArray(value)) {
                for (const item of value) collectNames(item, output);
                return;
            }
            if (!value || typeof value !== 'object') return;

            if (Array.isArray(value.string_list_data)) {
                for (const item of value.string_list_data) {
                    const hrefName = item?.href?.match(/(?:instagram\.com\/(?:_u\/)?)([^/?#]+)/i)?.[1];
                    const name = item?.value || value.title || hrefName;
                    if (name) output.add(normalizeName(name));
                }
            }

            for (const child of Object.values(value)) {
                if (child && typeof child === 'object') collectNames(child, output);
            }
        };

        for (const file of jsonFiles) {
            const normalizedPath = file.path.replace(/\\/g, '/').toLowerCase();
            const isFollowerFile = /(?:^|\/)followers_and_following\/followers(?:_\d+)?\.json$/.test(normalizedPath);
            const isFollowingFile = /(?:^|\/)followers_and_following\/following\.json$/.test(normalizedPath);
            if (!isFollowerFile && !isFollowingFile) continue;

            try {
                const data = JSON.parse(await fs.promises.readFile(path.resolve(this.rootPath, file.path), 'utf8'));
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

    async getProfileIdentities(jsonFiles) {
        const profile = jsonFiles.find((file) => file.path.replace(/\\/g, '/').toLowerCase().endsWith('/personal_information/personal_information/personal_information.json'));
        if (!profile) return new Set();
        try {
            const data = JSON.parse(await fs.promises.readFile(path.resolve(this.rootPath, profile.path), 'utf8'));
            const identities = new Set();
            for (const user of data.profile_user || []) {
                const values = user.string_map_data || {};
                for (const key of ['Username', 'Name']) {
                    const value = values[key]?.value;
                    if (typeof value === 'string' && value.trim()) identities.add(value.trim());
                }
            }
            return identities;
        } catch { return new Set(); }
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
                } catch { /* Ignore an incomplete JSON string at a chunk edge. */ }
            }
        };
        const overlap = 4096;
        for (const file of messageFiles) {
            let carry = '';
            let lastText = '';
            let lastStart = 0;
            const stream = fs.createReadStream(path.resolve(this.rootPath, file.path), { encoding: 'utf8' });
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
                if (error.code === 'ENOENT') continue;
                throw error;
            }
            if (lastText) collect(lastText, lastStart, lastText.length);
        }
        return counts;
    }

    async searchJson(query) {
        const needle = String(query || '').trim().toLocaleLowerCase();
        if (!needle) return [];
        const overlap = needle.length + 40;
        const results = [];
        const files = await this.listFiles((name) => path.extname(name).toLowerCase() === '.json');
        for (const file of files) {
            if (file.path.toLocaleLowerCase().includes(needle)) {
                const index = file.path.toLocaleLowerCase().indexOf(needle);
                results.push({ path: file.path, matchCount: 1, matches: [{ before: file.path.slice(Math.max(0, index - 20), index), value: file.path.slice(index, index + needle.length), after: file.path.slice(index + needle.length, index + needle.length + 20) }] });
                continue;
            }
            let carry = '';
            let pendingTail = '';
            let pendingTailStart = 0;
            let matchCount = 0;
            const matches = [];
            const stream = fs.createReadStream(path.resolve(this.rootPath, file.path), { encoding: 'utf8' });
            for await (const chunk of stream) {
                const text = carry + chunk;
                const searchable = text.toLocaleLowerCase();
                const safeEnd = Math.max(0, text.length - overlap);
                pendingTail = text;
                pendingTailStart = safeEnd;
                let index = searchable.indexOf(needle);
                while (index !== -1 && index < safeEnd) {
                    matchCount++;
                    if (matches.length < 100) matches.push({
                        before: text.slice(Math.max(0, index - 20), index),
                        value: text.slice(index, index + needle.length),
                        after: text.slice(index + needle.length, index + needle.length + 20)
                    });
                    index = searchable.indexOf(needle, index + Math.max(needle.length, 1));
                }
                carry = overlap ? text.slice(-overlap) : '';
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
                            before: pendingTail.slice(Math.max(0, absoluteIndex - 20), absoluteIndex),
                            value: pendingTail.slice(absoluteIndex, absoluteIndex + needle.length),
                            after: pendingTail.slice(absoluteIndex + needle.length, absoluteIndex + needle.length + 20)
                        });
                    }
                    index = searchableTail.indexOf(needle, index + Math.max(needle.length, 1));
                }
            }
            if (matchCount) {
                results.push({ path: file.path, matchCount, matches });
            }
        }
        return results;
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
