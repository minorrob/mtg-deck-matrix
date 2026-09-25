/* SERVE A BUILT RELEASE FOLDER THE WAY A STATIC HOST DOES, for the acceptance walk before a deploy.
 *
 *   node tools/serve-folder.mjs <folder> [port]            (port defaults to 8790)
 *
 * It listens on 127.0.0.1 and ::1, so http://crankmagic.localhost:<port> reaches it. A *.localhost name is a
 * secure context, which the service worker and CompressionStream both need, and it is the address the walk
 * and docs/release-pages.md use. A request's path is resolved and then held inside the folder, so a ../
 * cannot read the machine. An address with no extension is tried as .html too, the way Cloudflare's static
 * assets answer /privacy for privacy.html. Every 404 is logged, because a file the app asks for and the
 * release lacks is exactly what the walk exists to catch. */
import {createServer} from "node:http";
import {readFile, stat} from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] || "");
const PORT = Number(process.argv[3] || 8790);
if (!process.argv[2]) { console.error("usage: node tools/serve-folder.mjs <folder> [port]"); process.exit(2); }

const TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".mp3": "audio/mpeg", "": "text/plain; charset=utf-8"};

async function fileFor(rel) {
  for (const candidate of [rel, path.extname(rel) ? null : rel + ".html"].filter(Boolean)) {
    const full = path.resolve(ROOT, candidate);
    if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
    try { if ((await stat(full)).isFile()) return full; } catch { /* try the next */ }
  }
  return null;
}

const handler = async (req, res) => {
  let rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
  if (!rel || rel.endsWith("/")) rel += "index.html";
  const full = await fileFor(rel);
  if (!full) { console.log(`404 ${req.headers.host}${req.url}`); res.writeHead(404, {"content-type": "text/plain"}).end("not found"); return; }
  res.writeHead(200, {"content-type": TYPES[path.extname(full)] ?? "application/octet-stream", "cache-control": "max-age=600"}).end(await readFile(full));
};
for (const host of ["127.0.0.1", "::1"]) {
  createServer(handler).listen(PORT, host, () => console.log(`serving ${ROOT} on ${host}:${PORT}`)).on("error", (e) => console.log(`${host}: ${e.message}`));
}
