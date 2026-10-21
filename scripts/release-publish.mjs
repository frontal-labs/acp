import { execFileSync } from "node:child_process";

const run = (command, args) => execFileSync(command, args, { stdio: "inherit" });

// Packages publish their dist/ output, so build every workspace package before uploading.
run("pnpm", ["build"]);
run("pnpm", ["exec", "changeset", "publish"]);
run("pnpm", ["release:publish:sdk"]);
