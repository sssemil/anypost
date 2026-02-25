#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const electronRoot = path.resolve(__dirname, "..");
const webDist = path.resolve(electronRoot, "../anypost-web/dist");
const target = path.resolve(electronRoot, "dist/renderer");
const preloadTargetDir = path.resolve(electronRoot, "dist/preload");
const preloadSource = path.resolve(electronRoot, "src/preload/preload.cjs");
const preloadTarget = path.resolve(preloadTargetDir, "preload.cjs");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(webDist, target, { recursive: true });

const indexPath = path.join(target, "index.html");
const indexHtml = await readFile(indexPath, "utf8");
const normalizedIndexHtml = indexHtml
  .replace(/(src|href)="\/assets\//g, '$1="./assets/');
if (normalizedIndexHtml !== indexHtml) {
  await writeFile(indexPath, normalizedIndexHtml, "utf8");
}

await mkdir(preloadTargetDir, { recursive: true });
await cp(preloadSource, preloadTarget, { force: true });

console.log(`[electron] Copied web build from ${webDist} -> ${target}`);
