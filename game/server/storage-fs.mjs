/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE ENGINE'S STORAGE ON A DISK: one file per key under one folder.
 *
 * `game/engine/storage.mjs` defines the contract (get, put, delete, list) and keeps Node out of the engine;
 * this is the implementation for anything that runs on a machine with a filesystem -- the local host while
 * it lasts (M9 retires it), the playtest tooling, and the suite that proves a checkpoint taken in one process
 * resumes in another (`tests/engine-storage.mjs`). The cloud's implementation wraps a Durable Object's own
 * storage in M5 and needs nothing from here.
 *
 * A key's slash-separated parts become folders, and the last part a file ending in `.json`. `checkKey` has
 * already refused anything that could climb out of the folder; the resolved path is checked again anyway.
 * A write goes to a temporary file first and is renamed into place, so a crash mid-write leaves the old
 * value or the new one, never half of one.
 */
import {mkdir, readFile, writeFile, rename, rm, readdir} from "node:fs/promises";
import path from "node:path";
import {checkKey} from "../engine/storage.mjs";

/**
 * @param {string} dir  the folder that holds this store; created on the first write
 */
export function fileStorage(dir) {
  const root = path.resolve(dir);
  const fileFor = (key) => {
    const full = path.resolve(root, ...checkKey(key).split("/")) + ".json";
    if (!full.startsWith(root + path.sep)) throw new Error(`The key ${JSON.stringify(key)} resolves outside the store`);
    return full;
  };
  async function walk(folder, prefix, out) {
    let entries;
    try { entries = await readdir(folder, {withFileTypes: true}); } catch { return out; }
    for (const e of entries) {
      if (e.isDirectory()) await walk(path.join(folder, e.name), `${prefix}${e.name}/`, out);
      else if (e.name.endsWith(".json")) out.push(prefix + e.name.slice(0, -5));
    }
    return out;
  }
  let tmp = 0;
  return {
    kind: "file",
    dir: root,
    async get(key) {
      try { return await readFile(fileFor(key), "utf8"); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
    },
    async put(key, value) {
      if (typeof value !== "string") throw new Error("Storage holds strings; the match store writes JSON");
      const file = fileFor(key);
      await mkdir(path.dirname(file), {recursive: true});
      const partial = `${file}.${process.pid}.${tmp++}.partial`;
      await writeFile(partial, value, "utf8");
      await rename(partial, file);
    },
    async delete(key) {
      try { await rm(fileFor(key)); return true; } catch (e) { if (e.code === "ENOENT") return false; throw e; }
    },
    async list(prefix = "") {
      if (prefix) checkKey(prefix.replace(/\/$/, ""));
      return (await walk(root, "", [])).filter((k) => k.startsWith(prefix)).sort();
    },
  };
}
