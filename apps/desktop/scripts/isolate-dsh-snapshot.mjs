#!/usr/bin/env node
/**
 * pnpm deploy of workspace packages leaves file: symlinks into the monorepo.
 * Copy those targets so a packed app can resolve dsh outside the repo.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copyTree } from "./copy-tree.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(process.argv[2] ?? joinDefault("dsh"));
const dest = resolve(process.argv[3] ?? joinDefault("dsh-isolated"));
await copyTree(src, dest);
console.log("isolated " + src + " -> " + dest);

function joinDefault(name) {
  return resolve(here, "..", "resources", name);
}
