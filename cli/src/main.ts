#!/usr/bin/env node

import { runCommand } from "./commands.js";

const code = await runCommand(process.argv.slice(2), {
  readStdin: () =>
    new Promise((resolve, reject) => {
      let value = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        value += chunk;
      });
      process.stdin.on("end", () => resolve(value));
      process.stdin.on("error", reject);
    }),
  stderr: (message) => console.error(message),
  stdout: (message) => console.log(message),
});

process.exitCode = code;
