import { execFileSync } from "node:child_process";

const run = (command, args) => execFileSync(command, args, { stdio: "inherit" });

run("pnpm", ["exec", "changeset", "publish"]);
run("pnpm", ["release:publish:sdk"]);
