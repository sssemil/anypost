#!/usr/bin/env node

import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const electronRoot = path.resolve(__dirname, "..");
const webDist = path.resolve(electronRoot, "../anypost-web/dist");
const target = path.resolve(electronRoot, "dist/renderer");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(webDist, target, { recursive: true });

console.log(`[electron] Copied web build from ${webDist} -> ${target}`);
