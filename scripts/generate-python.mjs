import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Pinned to the protoc release used by CI (.github/workflows/ci.yml). Generated headers embed the
// protobuf runtime version, so a different protoc rewrites every Python binding file.
const PROTOC_VERSION = "35.0";
const root = resolve(import.meta.dirname, "..");
const protoc = process.env.PROTOC ?? "protoc";
const run = (command, args) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

const found = run(protoc, ["--version"]).trim();
if (found !== `libprotoc ${PROTOC_VERSION}`) {
  throw new Error(
    `generate:python requires protoc ${PROTOC_VERSION}, found "${found}". ` +
      "Install that release or set PROTOC to its binary.",
  );
}

const protos = run("find", ["proto/ocp", "-name", "*.proto", "-print"]).split("\n").filter(Boolean);
mkdirSync(resolve(root, "proto/gen/python"), { recursive: true });
execFileSync(protoc, ["--proto_path=proto", "--python_out=proto/gen/python", ...protos], {
  cwd: root,
  stdio: "inherit",
});
