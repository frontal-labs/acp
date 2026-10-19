import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredCommands = [
  "node",
  "pnpm",
  "buf",
  "protoc",
  "cargo",
  "python3",
  "ruff",
  "rustfmt",
  "cargo-clippy",
];
const requiredFiles = [
  "package.json",
  "proto/v1/api/events.proto",
  ".changeset/config.json",
  ".frontal-code/settings.json",
  ".cursor/rules/acp-repository.mdc",
  ".claude/settings.json",
];
const failures = [];

for (const command of requiredCommands) {
  const result = spawnSync(command, ["--version"], { cwd: root, encoding: "utf8" });
  if (result.status === 0) {
    console.log(`${command}: ${result.stdout.trim().split("\n")[0]}`);
  } else {
    failures.push(`${command} is not available`);
  }
}

for (const file of requiredFiles) {
  try {
    // biome-ignore lint/performance/noAwaitInLoops: These checks produce clearer per-file diagnostics when read in order.
    await access(resolve(root, file), constants.F_OK);
  } catch {
    failures.push(`missing ${file}`);
  }
}

if (failures.length > 0) {
  console.error("ACP doctor found problems:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("ACP doctor passed.");
}
