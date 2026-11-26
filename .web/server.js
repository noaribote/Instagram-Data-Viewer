const fs = require("fs");
const http = require("http");
const path = require("path");
const webRoot = __dirname;
const parentRoot = path.resolve(webRoot, "..");
const projectRoot = fs.existsSync(path.join(parentRoot, "models", "ModelRepository.js"))
  ? parentRoot
  : webRoot;
const repositoryPath = path.join(projectRoot, "models", "ModelRepository.js");
const ModelRepository = fs.existsSync(repositoryPath) ? require(repositoryPath) : null;
const localPython = process.platform === "win32"
  ? path.join(projectRoot, ".venv", "Scripts", "python.exe")
  : path.join(projectRoot, ".venv", "bin", "python");
if (!process.env.PYTHON && fs.existsSync(localPython)) process.env.PYTHON = localPython;
const repository = ModelRepository
  ? new ModelRepository(path.join(projectRoot, "model"))
  : null;
const restrictedUsersPath = path.join(projectRoot, "models", "listNoUsername.json");
const restrictedUsers = fs.existsSync(restrictedUsersPath) ? require(restrictedUsersPath) : [];
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16 * 1024) throw Object.assign(new Error("Requête trop volumineuse."), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Corps JSON invalide."), { status: 400 });
  }
}

async function handleApi(request, response, url) {
  if (!repository && url.pathname !== "/api/restricted-usernames") {
    return sendJson(response, 503, { error: "Le service de profils nécessite les fichiers du projet de bureau." });
  }
  if (request.method === "GET" && url.pathname === "/api/users") {
    return sendJson(response, 200, await repository.listCachedUsers());
  }
  if (request.method === "GET" && url.pathname === "/api/restricted-usernames") {
    return sendJson(response, 200, restrictedUsers);
  }
  const match = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (request.method === "POST" && match) {
    const username = decodeURIComponent(match[1]).trim().replace(/^@/, "");
    if (restrictedUsers.some((name) => String(name).toLowerCase() === username.toLowerCase()))
      return sendJson(response, 403, { error: "Ce compte a demandé à préserver son anonymat." });
    const body = await readBody(request);
    const profile = await repository.fetchPublicUser(username, body.refresh === true);
    return sendJson(response, 200, profile);
  }
  return sendJson(response, 404, { error: "Route introuvable." });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname.startsWith("/api/")) return await handleApi(request, response, url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405);
      return response.end("Method Not Allowed");
    }
    const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const filePath = path.resolve(webRoot, `.${requestedPath}`);
    if (!filePath.startsWith(`${webRoot}${path.sep}`) && filePath !== path.join(webRoot, "index.html")) {
      response.writeHead(403);
      return response.end("Forbidden");
    }
    const stats = await fs.promises.stat(filePath).catch(() => null);
    if (!stats?.isFile()) {
      response.writeHead(404);
      return response.end("Not Found");
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": stats.size,
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") return response.end();
    fs.createReadStream(filePath).pipe(response);
  } catch (error) {
    if (!response.headersSent)
      sendJson(response, error.status || 500, { error: error.message || "Erreur du serveur local." });
    else response.destroy(error);
  }
});

const port = Number(process.env.PORT || 8000);
server.listen(port, "127.0.0.1", () => {
  console.log(`Instagram Data Viewer web : http://127.0.0.1:${port}`);
});
