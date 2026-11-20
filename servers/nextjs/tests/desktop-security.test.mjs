import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const TOKEN = "a".repeat(64);
const symlinkSupport = { skip: process.platform === "win32" };
let security, directory, stateFile;
const originalFetch = globalThis.fetch;
const savedEnv = { ...process.env };

test.before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "presenton-desktop-security-"));
  const entry = path.join(directory, "entry.ts");
  const output = path.join(directory, "bundle.cjs");
  const source = (relative) => JSON.stringify(path.resolve(relative));
  await writeFile(entry, [
    `export * from ${source("lib/desktop-auth.ts")};`,
    `export * as configRoute from ${source("app/api/user-config/route.ts")};`,
    `export { handleSaveLLMConfig } from ${source("utils/storeHelpers.ts")};`,
    `export { store } from ${source("store/store.ts")};`,
    `export * as readFileRoute from ${source("app/api/read-file/route.ts")};`,
    `export * from ${source("lib/readable-local-file.ts")};`,
    `export * from ${source("proxy.ts")};`,
    `export * as electronAuth from ${source("../../electron/app/utils/desktop-auth.ts")};`,
    `export * as electronFiles from ${source("../../electron/app/utils/readable-file-access.ts")};`,
  ].join("\n"));
  await build({ entryPoints: [entry], outfile: output, bundle: true, platform: "node", format: "cjs", tsconfig: path.resolve("tsconfig.json"), logLevel: "silent", plugins: [{
    name: "test-runtime",
    setup(builder) {
      builder.onResolve({ filter: /^next\/server$/ }, () => ({ path: require.resolve("next/server"), external: true }));
      builder.onResolve({ filter: /^\.\/constants$/ }, (args) => args.importer.endsWith("readable-file-access.ts") ? { path: "electron-paths", namespace: "test-paths" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "test-paths" }, () => ({ contents: "export const getAppDataDir = () => process.env.APP_DATA_DIRECTORY; export const getTempDir = () => process.env.TEMP_DIRECTORY;", loader: "js" }));
    },
  }] });
  security = require(output);
  const dataDirectory = path.join(directory, "data");
  const tempDirectory = path.join(dataDirectory, "tmp");
  await mkdir(dataDirectory);
  await mkdir(tempDirectory, { recursive: true });
  stateFile = path.join(directory, "backend.json");
  await writeFile(stateFile, JSON.stringify({
    key: TOKEN,
    origin: "http://127.0.0.1:40000",
    dataDirectory,
    rendererOrigin: "http://127.0.0.1:40001",
    exportExecutable: "",
  }));
  Object.assign(process.env, {
    PRESENTON_ELECTRON: "true",
    PRESENTON_DESKTOP_TOKEN: TOKEN,
    PRESENTON_DESKTOP_ORIGINS: "http://127.0.0.1:40001,http://127.0.0.1:40000",
    PRESENTON_BACKEND_STATE: stateFile,
    DISABLE_AUTH: "true",
    NEXT_PUBLIC_URL: "http://127.0.0.1:40001",
    NEXT_PUBLIC_FAST_API: "http://127.0.0.1:40000",
    FAST_API_INTERNAL_URL: "http://127.0.0.1:40000",
    APP_DATA_DIRECTORY: dataDirectory,
    TEMP_DIRECTORY: tempDirectory,
  });
});

test.after(async () => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
  await rm(directory, { recursive: true, force: true });
});

function request(pathname = "/api/user-config", options = {}) {
  return new NextRequest(`http://127.0.0.1:40001${pathname}`, { ...options, headers: { host: "127.0.0.1:40001", ...options.headers } });
}
const authorized = { "x-presenton-desktop-token": TOKEN };
const nimiHostAuthorized = { "x-presenton-host": TOKEN };

test("Nimi proxy rejects anonymous callers across API, assets, and pdf-maker", async () => {
  for (const url of ["/api/user-config", "/api/read-file", "/api/v1/auth/status", "/app_data/fastapi.db", "/static/icon.svg", "/pdf-maker?exportSession=arbitrary"]) {
    assert.equal((await security.proxy(request(url))).status, 401, url);
  }
  const rewritten = await security.proxy(request("/api/v1/auth/status", { headers: nimiHostAuthorized }));
  assert.equal(rewritten.status, 200);
});

test("host and origin checks still reject requests with a valid desktop credential", () => {
  for (const headers of [{ origin: "https://attacker.example" }, { origin: "null" }, { host: "attacker.example:40001" }, { host: "127.0.0.1:40002" }, { host: "evil", "x-forwarded-host": "127.0.0.1:40001" }]) {
    assert.equal(security.desktopRequestDenied(request(undefined, { headers: { ...authorized, ...headers } })).status, 403);
  }
  assert.equal(security.desktopRequestDenied(request(undefined, { headers: { "x-presenton-desktop-token": "b".repeat(64) } })).status, 401);
  assert.equal(security.desktopRequestDenied(request(undefined, { headers: { cookie: `presenton_desktop_session=${TOKEN}` } })), null);
});

test("Nimi business settings route requires the Host credential and forwards authorized updates", async () => {
  const calls = [];
  let config = { IMAGE_PROVIDER: "nimi", DISABLE_IMAGE_GENERATION: false };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "PUT") config = { ...config, ...JSON.parse(options.body) };
    return Response.json(config);
  };
  const body = JSON.stringify({ IMAGE_PROVIDER: "pexels", PEXELS_API_KEY: "stock-key" });
  assert.equal((await security.configRoute.POST(request(undefined, { method: "POST", headers: { "content-type": "application/json" }, body }))).status, 401);
  assert.equal((await security.configRoute.GET(request())).status, 401);
  assert.equal(calls.length, 0);

  const response = await security.configRoute.POST(request(undefined, { method: "POST", headers: { ...nimiHostAuthorized, "content-type": "application/json" }, body }));
  assert.equal(response.status, 200);
  assert.equal(config.IMAGE_PROVIDER, "pexels");
  assert.equal(calls.at(-1).url, "http://127.0.0.1:40000/api/v1/ppt/business-settings");
  assert.equal(calls.at(-1).options.headers["X-Presenton-Host"], TOKEN);
});

test("document readers preserve previews but deny credentials, tasks, and traversal", async () => {
  const data = process.env.APP_DATA_DIRECTORY;
  const temp = process.env.TEMP_DIRECTORY;
  await mkdir(path.join(data, "uploads"), { recursive: true });
  const document = path.join(temp, "document.txt");
  const uploaded = path.join(data, "uploads", "document.txt");
  await writeFile(document, "document text");
  await writeFile(uploaded, "uploaded text");
  await writeFile(path.join(data, "private.txt"), "secret");
  await writeFile(path.join(data, "userConfig.json"), '{"AUTH_SECRET_KEY":"secret"}');
  const task = path.join(temp, "export_task.json");
  await writeFile(task, `{"cookieHeader":"presenton_session=${TOKEN}"}`);
  const scope = { userId: null, isAdmin: true, dataDirectory: data };
  for (const reader of [(f) => security.readReadableLocalFile(f, scope), security.electronFiles.readReadableLocalFile]) {
    assert.equal(reader(document), "document text");
    assert.equal(reader(uploaded), "uploaded text");
    for (const file of [path.join(data, "userConfig.json"), path.join(data, "private.txt"), task, path.join(data, "uploads", "..", "private.txt")]) {
      assert.throws(() => reader(file), /Access denied/);
    }
  }
  assert.throws(() => security.readReadableLocalFile(uploaded, { userId: null, isAdmin: true, dataDirectory: path.join(directory, "other-workspace") }), /Access denied/);
});

test("document readers reject symlink escapes", symlinkSupport, async () => {
  const data = process.env.APP_DATA_DIRECTORY;
  const temp = process.env.TEMP_DIRECTORY;
  const task = path.join(temp, "export_task.json");
  const alias = path.join(temp, "alias.txt");
  await symlink(task, alias);
  const escape = path.join(data, "uploads", "alias.txt");
  await symlink(path.join(data, "private.txt"), escape);
  const scope = { userId: null, isAdmin: true, dataDirectory: data };
  for (const reader of [(f) => security.readReadableLocalFile(f, scope), security.electronFiles.readReadableLocalFile]) {
    for (const file of [alias, escape]) assert.throws(() => reader(file), /Access denied/);
  }
});
