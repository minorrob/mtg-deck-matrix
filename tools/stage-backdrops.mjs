#!/usr/bin/env node
/* THE 3D TABLE'S BACKDROP VIDEOS, FROM A FOLDER OF CLIPS.
 *
 *   node tools/stage-backdrops.mjs [<folder>] [--fade 1] [--keep] [--assets <dir>] [--stage <file>]
 *
 * Rob, 2026-10-26: "Replace the current background videos in the CrankMagic Play 3D with those in this folder. Adjust as
 * required. Maintain resolution in line with settings selection with 2k at max resolution." Every video in <folder>
 * (default design/art-source/backdrops/; .mp4 .mov .m4v .webm .mkv .avi), in name order, becomes one backdrop:
 *
 *   1. framed at 16:9, the stage's shape (crankmagic-stage.css): scaled to cover it and cropped to its center;
 *   2. made to loop without a seam: the last --fade seconds (default 1; 0 for none) cross-fade into the first, so the
 *      clip ends on what it begins with. A clip shorter than three fades is left as it is;
 *   3. kept at 720, 1080 and 1440 lines (1280x720, 1920x1080, 2560x1440), never larger than the source: the stage plays
 *      the smallest that fills the backdrop at the Graphics resolution kept in Settings, 1440 (2K) at the most
 *      (crankmagic-stage.js, backdropLines). A source under 720 lines is kept at its own height only;
 *   4. encoded VP9 in WebM without sound, at most 30 frames a second, at constrained quality (CRF 32 under a ceiling of
 *      2.5, 5 and 9 Mbit/s); any file over 24 MiB fails the run (Cloudflare serves a static file of 25 MiB at most);
 *   5. given a poster, a 1280-pixel JPEG of its first frame, shown while it loads and, blurred, around it.
 *
 * Then the list between the backdrops:begin and backdrops:end markers in crankmagic-stage.js is written again, the first
 * backdrop being the default, each file named with a ?v= of its contents. The videos it replaces under
 * assets/environments/ are deleted unless --keep. The ids are the files' names, so a person's saved choice of an old
 * backdrop that is gone falls back to the first.
 *
 * Needs ffmpeg and ffprobe on the PATH (on Windows: winget install Gyan.FFmpeg). Nothing is uploaded. */
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LINES = [720, 1080, 1440];
const CEILING = {720: "2500k", 1080: "5000k", 1440: "9000k"};
const MAX_BYTES = 24 * 1024 * 1024;
const VIDEO = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;

function options(argv) {
  const o = {folder: path.join(ROOT, "design/art-source/backdrops"), fade: 1, keep: false,
    assets: path.join(ROOT, "assets/environments"), stage: path.join(ROOT, "crankmagic-stage.js")};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fade") o.fade = Number(argv[++i]);
    else if (a === "--keep") o.keep = true;
    else if (a === "--assets") o.assets = path.resolve(argv[++i]);
    else if (a === "--stage") o.stage = path.resolve(argv[++i]);
    else if (a.startsWith("--")) throw new Error(`stage-backdrops: unknown option ${a}`);
    else o.folder = path.resolve(a);
  }
  if (!Number.isFinite(o.fade) || o.fade < 0) throw new Error("stage-backdrops: --fade takes seconds, 0 or more");
  return o;
}

const run = (cmd, args) => execFileSync(cmd, args, {stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26}).toString();

/** An id from a file's name: lowercase words joined by hyphens. */
export const slug = name => name.replace(VIDEO, "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "backdrop";
/** A name for the Background menu: the file's words, without a size tag (4K, 1080p, UHD), capitalized where left lowercase. */
export const title = name => name.replace(VIDEO, "").replace(/[_-]+/g, " ").replace(/\b(\d{3,4}p|[248]k|uhd|fhd|qhd|hd)\b/gi, " ").replace(/\s+/g, " ").trim()
  .replace(/(^|\s)(\p{Ll})/gu, (_, a, c) => a + c.toUpperCase()) || "Backdrop";
/** The heights kept for a source of `height` lines: 720, 1080 and 1440 up to it, or its own (even) height under 720. */
export const linesFor = height => {const kept = LINES.filter(n => n <= height);return kept.length ? kept : [Math.max(2, height - height % 2)];};

function probe(file) {
  const info = JSON.parse(run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries",
    "stream=width,height,r_frame_rate:stream_side_data=rotation:stream_tags=rotate:format=duration", "-of", "json", file]));
  const v = info.streams?.[0];
  if (!v) throw new Error(`stage-backdrops: ${file} has no video`);
  const turn = Math.abs(Number(v.tags?.rotate ?? v.side_data_list?.find(d => "rotation" in d)?.rotation ?? 0)) % 180 === 90;
  const [n, d] = String(v.r_frame_rate || "30/1").split("/").map(Number);
  return {width: turn ? v.height : v.width, height: turn ? v.width : v.height, fps: d ? n / d : 30, duration: Number(info.format?.duration) || 0};
}

/** The height the 16:9 frame cut from a source can have without enlarging it. */
const frameHeight = ({width, height}) => Math.floor(Math.min(height, width * 9 / 16));

function encode(src, info, lines, out, fade) {
  const w = Math.round(lines * 16 / 9 / 2) * 2, fps = Math.min(30, Math.round(info.fps * 1000) / 1000);
  const frame = `fps=${fps},scale=${w}:${lines}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${lines},setsar=1,format=yuv420p`;
  const loop = fade > 0 && info.duration > fade * 3;
  const graph = loop
    ? `[0:v]${frame},split[a][b];[a]trim=start=${fade},setpts=PTS-STARTPTS[m];[b]trim=end=${fade},setpts=PTS-STARTPTS[t];`
      + `[m][t]xfade=transition=fade:duration=${fade}:offset=${(info.duration - 2 * fade).toFixed(3)}[v]`
    : `[0:v]${frame}[v]`;
  run("ffmpeg", ["-y", "-v", "error", "-i", src, "-filter_complex", graph, "-map", "[v]", "-an",
    "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", CEILING[lines] || "9000k", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2",
    "-g", String(Math.round(fps * 2)), "-pix_fmt", "yuv420p", out]);
  return loop;
}

const version = file => createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8);
const asset = (assets, file) => `${path.relative(ROOT, path.join(assets, file)).split(path.sep).join("/")}?v=${version(path.join(assets, file))}`;

export function catalogLine(entries) {
  const one = e => `{id:${JSON.stringify(e.id)},name:${JSON.stringify(e.name)},poster:${JSON.stringify(e.poster)},video:{${
    Object.entries(e.video).map(([n, src]) => `${n}:${JSON.stringify(src)}`).join(",")}}}`;
  return `  const BACKDROPS=[${entries.map(one).join(",")}];`;
}

export function writeCatalog(stageFile, entries) {
  const text = readFileSync(stageFile, "utf8");
  const re = /(\/\* backdrops:begin \*\/\n)[\s\S]*?(\n\s*\/\* backdrops:end \*\/)/;
  if (!re.test(text)) throw new Error(`stage-backdrops: no backdrops:begin/end markers in ${stageFile}`);
  writeFileSync(stageFile, text.replace(re, (_, a, b) => a + catalogLine(entries) + b));
}

function main() {
  const o = options(process.argv.slice(2));
  try {run("ffmpeg", ["-version"]);run("ffprobe", ["-version"]);}
  catch {throw new Error("stage-backdrops: ffmpeg and ffprobe are needed on the PATH (on Windows: winget install Gyan.FFmpeg)");}
  if (!existsSync(o.folder)) throw new Error(`stage-backdrops: no folder ${o.folder}`);
  const files = readdirSync(o.folder).filter(f => VIDEO.test(f) && statSync(path.join(o.folder, f)).isFile())
    .sort((a, b) => a.localeCompare(b, "en-US", {numeric: true}));
  if (!files.length) throw new Error(`stage-backdrops: no videos in ${o.folder}`);
  mkdirSync(o.assets, {recursive: true});
  const entries = [], made = new Set(), seen = new Set();
  for (const f of files) {
    let id = slug(f);
    for (let k = 2; seen.has(id); k++) id = `${slug(f)}-${k}`;
    seen.add(id);
    const src = path.join(o.folder, f), info = probe(src), lines = linesFor(frameHeight(info)), video = {};
    let looped = false;
    for (const n of lines) {
      const out = `${id}-${n}.webm`;
      looped = encode(src, info, n, path.join(o.assets, out), o.fade);
      const bytes = statSync(path.join(o.assets, out)).size;
      if (bytes > MAX_BYTES) throw new Error(`stage-backdrops: ${out} is ${(bytes / 1048576).toFixed(1)} MiB, over 24 MiB; shorten ${f}`);
      video[n] = asset(o.assets, out);made.add(out);
      console.log(`  ${out}: ${(bytes / 1048576).toFixed(1)} MiB`);
    }
    const poster = `${id}-poster.jpg`, from = path.join(o.assets, `${id}-${lines.at(-1)}.webm`);
    run("ffmpeg", ["-y", "-v", "error", "-i", from, "-frames:v", "1", "-vf", "scale=1280:-2:flags=lanczos", "-q:v", "3", path.join(o.assets, poster)]);
    made.add(poster);
    entries.push({id, name: title(f), poster: asset(o.assets, poster), video});
    console.log(`${title(f)} (${id}): ${info.width}x${info.height}, ${info.duration.toFixed(1)} s, kept at ${lines.join(", ")} lines${looped ? `, looped over ${o.fade} s` : ""}`);
  }
  if (!o.keep) for (const f of readdirSync(o.assets)) if (!made.has(f) && /\.(webm|mp4|jpg|jpeg|png|webp)$/i.test(f)) {
    rmSync(path.join(o.assets, f));console.log(`  removed ${f}`);
  }
  writeCatalog(o.stage, entries);
  console.log(`stage-backdrops: ${entries.length} backdrops written to ${path.relative(ROOT, o.stage) || o.stage}; the first, ${entries[0].name}, is the default`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {main();} catch (e) {console.error(e.message);process.exit(1);}
}
