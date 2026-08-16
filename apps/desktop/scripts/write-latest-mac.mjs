#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const release = join(dirname(fileURLToPath(import.meta.url)), "..", "release");
const name = process.argv[2] ?? "DeepSeek-Gestalt-0.1.0-arm64.zip";
const zip = join(release, name);
const buf = await readFile(zip);
const sha = createHash("sha512").update(buf).digest("base64");
const size = (await stat(zip)).size;
const yml = [
  "version: 0.1.0",
  "files:",
  "  - url: " + name,
  "    sha512: " + sha,
  "    size: " + String(size),
  "path: " + name,
  "sha512: " + sha,
  "releaseDate: '" + new Date().toISOString() + "'",
  "",
].join("\n");
const out = join(release, "latest-mac.yml");
await writeFile(out, yml);
console.log(out);
