import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const python = process.env.PYTHON ?? "python3";
const dryRun = process.argv.includes("--dry-run");
const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: root, stdio: "inherit", ...options });

const cargoArgs = ["publish", "--locked", "--manifest-path"];
run("cargo", [...cargoArgs, "sdks/rust/Cargo.toml", ...(dryRun ? ["--dry-run"] : [])]);
run("cargo", [...cargoArgs, "crates/acp-cli/Cargo.toml", ...(dryRun ? ["--dry-run"] : [])]);

run(python, ["-m", "build", "--sdist", "--wheel", "sdks/python"]);

const dist = resolve(root, "sdks/python/dist");
const artifacts = existsSync(dist)
  ? readdirSync(dist).filter((file) => file.endsWith(".whl") || file.endsWith(".tar.gz"))
  : [];
if (artifacts.length === 0) {
  throw new Error("Python build did not produce a wheel or source distribution");
}

if (dryRun) {
  console.log(`Dry run: built ${artifacts.length} Python distribution artifacts.`);
} else {
  run(python, ["-m", "twine", "upload", ...artifacts.map((file) => `sdks/python/dist/${file}`)]);
}
