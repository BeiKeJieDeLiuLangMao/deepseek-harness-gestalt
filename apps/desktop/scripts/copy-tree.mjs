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
  await copyEntry(root, target, root, new Map([[await realpath(root), target]]));
}

/**
 * @param {string} from
 * @param {string} to
 * @param {string} root
 * @param {Map<string, string>} materialized
 */
async function copyEntry(from, to, root, materialized) {
  const stat = await lstat(from);
  if (stat.isSymbolicLink()) {
    const target = await readlink(from);
    const abs = isAbsolute(target) ? target : resolve(dirname(from), target);
    if (isInside(root, abs)) {
      await mkdir(dirname(to), { recursive: true });
      await symlink(target, to);
      return;
    }
    const real = await realpath(abs);
    const existing = materialized.get(real);
    if (existing !== undefined) {
      await mkdir(dirname(to), { recursive: true });
      await symlink(relative(dirname(to), existing), to);
      return;
    }
    materialized.set(real, to);
    await copyEntry(real, to, root, materialized);
    return;
  }
  if (stat.isDirectory()) {
    await mkdir(to, { recursive: true });
    for (const name of await readdir(from)) {
      await copyEntry(join(from, name), join(to, name), root, materialized);
    }
    return;
  }
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to, { force: true });
}

function isInside(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
