/**
 * Copy the isolated dsh snapshot after Electron packs the shell.
 * extraResources cannot reliably copy the snapshot's node_modules.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { copyTree } from "./copy-tree.mjs";

/**
 * @param {import("electron-builder").AfterPackContext} context
 */
export default async function afterPack(context) {
  const src = join(context.packager.projectDir, "resources", "dsh-isolated");
  if (!existsSync(src)) {
    throw new Error("missing resources/dsh-isolated; run isolate-dsh-snapshot.mjs first");
  }
  const name = context.packager.appInfo.productFilename;
  const dest = context.electronPlatformName === "darwin"
    ? join(context.appOutDir, name + ".app", "Contents", "Resources", "dsh")
    : join(context.appOutDir, "resources", "dsh");
  await copyTree(src, dest);
}
