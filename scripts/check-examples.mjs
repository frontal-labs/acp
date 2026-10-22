import { constants } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const examplesRoot = join(root, "examples");
const failures = [];

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(join(examplesRoot, "README.md")))) {
  failures.push("examples/README.md is missing");
}

const entries = await readdir(examplesRoot, { withFileTypes: true });
const exampleDirectories = entries.filter(
  (entry) => entry.isDirectory() && !entry.name.startsWith("_") && !entry.name.startsWith("."),
);

for (const entry of exampleDirectories) {
  const directory = join(examplesRoot, entry.name);
  // biome-ignore lint/performance/noAwaitInLoops: Diagnostics retain example directory order.
  const files = await readdir(directory);
  if (!files.includes("README.md")) {
    failures.push(`examples/${entry.name}/README.md is missing`);
  }

  const hasRunner =
    files.includes("main.py") ||
    files.includes("main.ts") ||
    (await exists(join(directory, "src/main.ts")));
  const hasRustRunner =
    files.includes("Cargo.toml") && (await exists(join(directory, "src/main.rs")));
  if (!(hasRunner || hasRustRunner)) {
    failures.push(`examples/${entry.name} needs main.py, main.ts, src/main.ts, or src/main.rs`);
  }

  const hasManifest = files.some((file) =>
    ["requirements.txt", "pyproject.toml", "package.json", "Cargo.toml"].includes(file),
  );
  if (!hasManifest) {
    failures.push(`examples/${entry.name} needs a dependency manifest`);
  }

  if (files.includes("package.json")) {
    try {
      const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
      if (manifest.private !== true) {
        failures.push(`examples/${entry.name}/package.json must be private`);
      }
    } catch (error) {
      failures.push(
        `examples/${entry.name}/package.json is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

if (exampleDirectories.length < 3) {
  failures.push("examples/ must contain native TypeScript, Python, and Rust examples");
}

if (failures.length > 0) {
  console.error("Example layout check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Example layout check passed (${exampleDirectories.length} examples).`);
}
