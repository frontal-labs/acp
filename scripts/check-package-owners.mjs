import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Confirms that the registry names we are about to publish belong to the expected owners.
// npm and crates.io expose owners publicly, so they are verified here. PyPI's public API does
// not list project owners, so the operator must confirm it with OCP_PYPI_OWNER.
const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

const npmName = JSON.parse(read("sdks/typescript/package.json")).name;
const crateName = read("sdks/rust/Cargo.toml").match(/^name = "([^"]+)"/m)?.[1];
const pypiName = read("sdks/python/pyproject.toml").match(/^name = "([^"]+)"/m)?.[1];

const failures = [];
const notes = [];

const expected = {
  crates: process.env.OCP_CRATES_OWNER,
  npm: process.env.OCP_NPM_OWNER,
  pypi: process.env.OCP_PYPI_OWNER,
};
for (const [registry, owner] of Object.entries(expected)) {
  if (!owner) {
    failures.push(
      `OCP_${registry.toUpperCase()}_OWNER is not set; set it to the expected ${registry} owner`,
    );
  }
}

const fetchJson = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: { "user-agent": "ocp-owner-check", ...init.headers },
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response.json();
};

if (npmName && expected.npm) {
  const pkg = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(npmName)}`);
  if (pkg === null) {
    notes.push(`npm: ${npmName} is unclaimed; this publish will claim it for ${expected.npm}`);
  } else if (pkg.maintainers?.some((m) => m.name === expected.npm)) {
    notes.push(`npm: ${npmName} is maintained by ${expected.npm}`);
  } else {
    const owners = (pkg.maintainers ?? []).map((m) => m.name).join(", ") || "none";
    failures.push(`npm: ${npmName} is owned by [${owners}], not ${expected.npm}`);
  }
}

if (crateName && expected.crates) {
  const owners = await fetchJson(`https://crates.io/api/v1/crates/${crateName}/owners`);
  if (owners === null) {
    notes.push(
      `crates.io: ${crateName} is unclaimed; this publish will claim it for ${expected.crates}`,
    );
  } else if (owners.users?.some((u) => u.login === expected.crates)) {
    notes.push(`crates.io: ${crateName} is owned by ${expected.crates}`);
  } else {
    const logins = (owners.users ?? []).map((u) => u.login).join(", ") || "none";
    failures.push(`crates.io: ${crateName} is owned by [${logins}], not ${expected.crates}`);
  }
}

if (pypiName && expected.pypi) {
  const project = await fetchJson(`https://pypi.org/pypi/${pypiName}/json`);
  if (project === null) {
    notes.push(`PyPI: ${pypiName} is unclaimed; this publish will claim it for ${expected.pypi}`);
  } else {
    const owners = (project.ownership?.roles ?? [])
      .filter((role) => role.role === "Owner")
      .map((role) => role.user);
    if (owners.includes(expected.pypi)) {
      notes.push(`PyPI: ${pypiName} is owned by ${expected.pypi}`);
    } else {
      failures.push(
        `PyPI: ${pypiName} is owned by [${owners.join(", ") || "none"}], not ${expected.pypi}`,
      );
    }
  }
}

for (const note of notes) {
  console.log(`✓ ${note}`);
}
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`✗ ${failure}`);
  }
  process.exit(1);
}
console.log("Package owner check passed.");
