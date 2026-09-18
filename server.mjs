import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = fileURLToPath(new URL(".", import.meta.url));
const DIST_DIR = resolve(PROJECT_DIR, "dist");
const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const hostIndex = args.indexOf("--host");
const PORT = Number.parseInt(portIndex >= 0 ? args[portIndex + 1] : process.env.PORT || "4173", 10);
const HOST = hostIndex >= 0 ? args[hostIndex + 1] : "127.0.0.1";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

async function getHelpers() {
  const helpersRoot = join(DIST_DIR, "helpers");
  const entries = await readdir(helpersRoot, { withFileTypes: true });
  const helpers = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    try {
      const manifestPath = join(helpersRoot, entry.name, "helper.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      helpers.push({
        ...manifest,
        slug: entry.name,
        href: `/helpers/${entry.name}/`,
      });
    } catch {
      // Folders without a valid helper.json are intentionally not listed.
    }
  }

  return helpers.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function resolvePublicPath(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }

  const cleanPath = normalize(pathname).replace(/^([/\\])+/, "");
  const candidate = resolve(DIST_DIR, cleanPath || "index.html");
  if (candidate !== DIST_DIR && !candidate.startsWith(`${DIST_DIR}${sep}`)) return null;
  return candidate;
}

const server = createServer(async (request, response) => {
  const requestUrl = request.url || "/";

  if (requestUrl.split("?")[0] === "/api/helpers") {
    try {
      send(response, 200, JSON.stringify(await getHelpers()), MIME_TYPES[".json"]);
    } catch {
      send(response, 500, JSON.stringify({ error: "Could not read helper manifests." }), MIME_TYPES[".json"]);
    }
    return;
  }

  let filePath = resolvePublicPath(requestUrl);
  if (!filePath) {
    send(response, 403, "Forbidden");
    return;
  }

  if (!extname(filePath)) filePath = join(filePath, "index.html");

  try {
    const body = await readFile(filePath);
    const contentType = MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
    send(response, 200, body, contentType);
  } catch {
    send(response, 404, "Not found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Text Helper Hub is running at http://localhost:${PORT}`);
});
