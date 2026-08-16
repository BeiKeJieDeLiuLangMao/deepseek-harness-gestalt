/** Recursive copy that replaces outbound symlinks with real files. */
import { cp, lstat, mkdir, readdir, readlink, realpath, rm, symlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

/**
 * Copy `src` to `dest`, materializing any symlink that points outside `src`.
 * @param {string} src
 * @param {string} dest
 */
export async function copyTree(src, dest) {
  const root = resolve(src);
  const target = resolve(dest);
  await rm(dest, { recursive: true, force: true });
  await copyEntry(root, target, root, target, new Map([[await realpath(root), target]]));
}

/**
 * @param {string} from
 * @param {string} to
 * @param {string} root
 * @param {string} destinationRoot
 * @param {Map<string, string>} materialized
 */
async function copyEntry(from, to, root, destinationRoot, materialized) {
  const stat = await lstat(from);
  if (stat.isSymbolicLink()) {
    const target = await readlink(from);
    const abs = isAbsolute(target) ? target : resolve(dirname(from), target);
    if (isInside(root, abs)) {
      const projected = join(destinationRoot, relative(root, abs));
      const targetStat = await lstat(abs);
      if (!targetStat.isDirectory()) {
        await copyEntry(abs, to, root, destinationRoot, materialized);
        return;
      }
      await createDirectoryLink(to, projected);
      return;
    }
    const real = await realpath(abs);
    const realStat = await lstat(real);
    const existing = materialized.get(real);
    if (existing !== undefined) {
      if (!realStat.isDirectory()) {
        await copyEntry(real, to, root, destinationRoot, materialized);
        return;
      }
      await createDirectoryLink(to, existing);
      return;
    }
    materialized.set(real, to);
    await copyEntry(real, to, root, destinationRoot, materialized);
    return;
  }
  if (stat.isDirectory()) {
    await mkdir(to, { recursive: true });
    for (const name of await readdir(from)) {
      await copyEntry(join(from, name), join(to, name), root, destinationRoot, materialized);
    }
    return;
  }
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to, { force: true });
}

/**
 * Describe a directory link without depending on the host platform.
 * @param {string} linkPath
 * @param {string} targetPath
 * @param {NodeJS.Platform} platform
 * @returns {{ target: string, type: "dir" | "junction" }}
 */
export function directoryLinkSpec(linkPath, targetPath, platform = process.platform) {
  return platform === "win32"
    ? { target: resolve(targetPath), type: "junction" }
    : { target: relative(dirname(linkPath), targetPath), type: "dir" };
}

async function createDirectoryLink(linkPath, targetPath) {
  await mkdir(dirname(linkPath), { recursive: true });
  const spec = directoryLinkSpec(linkPath, targetPath);
  await symlink(spec.target, linkPath, spec.type);
}

function isInside(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
