import { execFileSync } from "node:child_process";

const run = (command, args) => execFileSync(command, args, { stdio: "inherit" });

// Generated protobuf bindings are not tracked, so they must exist before any package builds.
run("pnpm", ["generate"]);
// Packages publish their dist/ output, so build every workspace package before uploading.
run("pnpm", ["build"]);
run("pnpm", ["exec", "changeset", "publish"]);
// Mirror the TypeScript packages to GitHub Packages. Versions already there are skipped.
run("node", ["scripts/publish-github-packages.mjs"]);
run("pnpm", ["release:publish:sdk"]);
