import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const python = process.env.PYTHON ?? "python3";
const dryRun = process.argv.includes("--dry-run");
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit" });

run(process.execPath, ["scripts/check-package-owners.mjs"]);

// Remove output from earlier builds (including pre-rename open_channel artifacts) so only this build is uploaded.
for (const dir of ["sdks/python/build", "sdks/python/dist"]) {
  rmSync(resolve(root, dir), { force: true, recursive: true });
}
const pythonName = readFileSync(resolve(root, "sdks/python/pyproject.toml"), "utf8").match(
  /^name = "([^"]+)"/m,
)?.[1];
const pythonVersion = readFileSync(resolve(root, "sdks/python/pyproject.toml"), "utf8").match(
  /^version = "([^"]+)"/m,
)?.[1];
const distPrefix = `${pythonName.replace(/-/g, "_")}-${pythonVersion}`;

run("cargo", [
  "publish",
  "--locked",
  "--manifest-path",
  "sdks/rust/Cargo.toml",
  ...(dryRun ? ["--dry-run"] : []),
]);

run(python, ["-m", "build", "--sdist", "--wheel", "sdks/python"]);

const pythonDist = resolve(root, "sdks/python/dist");
if (!existsSync(pythonDist)) {
  throw new Error(`Python build did not create ${pythonDist}`);
}

const artifacts = readdirSync(pythonDist)
  .filter(
    (entry) =>
      (entry.endsWith(".whl") || entry.endsWith(".tar.gz")) && entry.startsWith(distPrefix),
  )
  .map((entry) => resolve(pythonDist, entry));

if (artifacts.length !== 2) {
  throw new Error(
    `Expected one sdist and one wheel named ${distPrefix}* in ${pythonDist}, found ${artifacts.length}`,
  );
}

if (dryRun) {
  console.log("Dry run: built the Rust and Python SDK distributions.");
} else {
  run(python, ["-m", "twine", "upload", ...artifacts]);
}
