import { constants } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = [".git", ".turbo", "dist", "node_modules", "target", "proto/gen"];

function isIgnored(path) {
  const name = relative(root, path);
  return ignoredDirectories.some(
    (directory) => name === directory || name.startsWith(`${directory}/`),
  );
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (isIgnored(path)) {
      continue;
    }
    if (entry.isDirectory()) {
      // biome-ignore lint/performance/noAwaitInLoops: Recursive traversal keeps the checker deterministic.
      files.push(...(await markdownFiles(path)));
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      files.push(path);
    }
  }
  return files;
}

const files = await markdownFiles(root);
const failures = [];
const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;

for (const file of files) {
  // biome-ignore lint/performance/noAwaitInLoops: Link errors retain the source file order.
  const content = await readFile(file, "utf8");
  for (const match of content.matchAll(linkPattern)) {
    const [, rawTarget] = match;
    const [target = ""] = rawTarget.trim().replace(/^<|>$/g, "").split(/[\s#]/, 1);
    if (!target || /^(https?:|mailto:|#)/.test(target)) {
      continue;
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: Link errors retain the source file order.
      await access(resolve(dirname(file), target), constants.F_OK);
    } catch {
      failures.push(`${relative(root, file)} -> ${target}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Markdown link check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Markdown link check passed (${files.length} files).`);
}
