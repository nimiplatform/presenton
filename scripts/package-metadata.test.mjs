import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse as parseYaml } from "yaml";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const require = createRequire(import.meta.url);
const { clearDirectoryContents } = require("./sync-presentation-export.cjs");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

test("Nimi App identity and package version stay aligned", async () => {
  const rootPackage = await readJson("package.json");
  const documents = await Promise.all([
    "nimi.app.yaml",
    ".nimi/config/app-identity.yaml",
    ".nimi/admission/submission.yaml",
  ].map(async (file) => parseYaml(await readFile(path.join(repoRoot, file), "utf8"))));
  for (const document of documents) {
    assert.equal(document.version, rootPackage.version);
    assert.equal(document.app_id, documents[0].app_id);
  }
  assert.equal(rootPackage.main, "dist-electron/main.js");
  assert.equal(rootPackage.private, true);
  assert.match(rootPackage.presentationExportVersion, /^v\d+\.\d+\.\d+$/);
});

test("workspace dependency declarations match the frozen pnpm lock", async () => {
  const lock = parseYaml(await readFile(path.join(repoRoot, "pnpm-lock.yaml"), "utf8"));
  const workspace = parseYaml(await readFile(path.join(repoRoot, "pnpm-workspace.yaml"), "utf8"));
  for (const member of workspace.packages) {
    const manifest = await readJson(path.join(member, "package.json"));
    const importer = lock.importers[member];
    assert.ok(importer, `Missing lock importer: ${member}`);
    for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
      for (const [name, declared] of Object.entries(manifest[section] || {})) {
        let expected = workspace.overrides?.[name] || declared;
        if (expected.startsWith("file:")) {
          expected = "file:" + path.relative(path.resolve(repoRoot, member), path.resolve(repoRoot, expected.slice(5))).split(path.sep).join("/");
        }
        assert.equal(importer[section]?.[name]?.specifier, expected, `${member}: ${name}`);
      }
    }
  }
});

test("presentation export sync preserves a mounted runtime root", async (t) => {
  const runtimeRoot = await mkdtemp(
    path.join(os.tmpdir(), "presenton-export-runtime-"),
  );
  t.after(() => rm(runtimeRoot, { recursive: true, force: true }));
  await mkdir(path.join(runtimeRoot, "node_modules", "stale"), {
    recursive: true,
  });
  await writeFile(path.join(runtimeRoot, "runner.mjs"), "stale");
  await writeFile(
    path.join(runtimeRoot, "node_modules", "stale", "package.json"),
    "{}",
  );

  clearDirectoryContents(runtimeRoot);

  await access(runtimeRoot);
  assert.deepEqual(await readdir(runtimeRoot), []);
});
