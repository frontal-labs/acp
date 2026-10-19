import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const python = process.env.PYTHON ?? "python3";
const dryRun = process.argv.includes("--dry-run");
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit" });

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
  .filter((entry) => entry.endsWith(".whl") || entry.endsWith(".tar.gz"))
  .map((entry) => resolve(pythonDist, entry));

if (artifacts.length === 0) {
  throw new Error(`No Python distributions found in ${pythonDist}`);
}

if (dryRun) {
  console.log("Dry run: built the Rust and Python SDK distributions.");
} else {
  run(python, ["-m", "twine", "upload", ...artifacts]);
}
