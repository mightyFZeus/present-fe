import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire, findPackageJSON } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  checkCloudflareBuild,
  loadCfBuildOutputReader,
} from "../scripts/check-cloudflare-build.mjs";

const projectRoot = new URL("../", import.meta.url).pathname;
const { reader } = await loadCfBuildOutputReader(projectRoot);

async function temporaryProject(t) {
  const root = await mkdtemp(join(tmpdir(), "present-cloudflare-format-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeValidOutput(root) {
  await reader.writeRootConfig({
    root,
    buildContext: {
      isPreview: false,
      mode: "production",
    },
    producer: {
      name: "present-test",
      version: "1.0.0",
    },
  });
  await reader.writeWorkerConfig({
    root,
    config: {
      name: "present-test",
      compatibilityDate: "2026-11-17",
    },
    manifest: {
      type: "partial",
      mainModule: "index.js",
      modules: {},
    },
  });
  const bundle = reader.getWorkerBundleDir(root);
  await mkdir(bundle, { recursive: true });
  await writeFile(
    join(bundle, "index.js"),
    'export default { fetch() { return new Response("fixture"); } };\n',
  );
}

test("the deployment reader accepts genuine v1 Worker output", async (t) => {
  const root = await temporaryProject(t);
  await writeValidOutput(root);
  const output = await reader.readBuildOutput(root);
  assert.equal(output.version, "v1");
  assert.equal(Object.keys(output.workers).length, 1);
  assert.equal(output.workers.default.config.name, "present-test");
});

test("the deployment reader rejects legacy v0 output before reading its schema", async (t) => {
  const root = await temporaryProject(t);
  await mkdir(join(root, ".cloudflare/output/v0"), { recursive: true });
  await assert.rejects(reader.readBuildOutput(root), {
    code: "older-version",
    foundVersions: ["v0"],
  });
});

test("the deployment reader rejects mixed cached v0 and fresh v1 output", async (t) => {
  const root = await temporaryProject(t);
  await writeValidOutput(root);
  await mkdir(join(root, ".cloudflare/output/v0"));
  await assert.rejects(reader.readBuildOutput(root), {
    code: "multiple-versions",
    foundVersions: ["v0", "v1"],
  });
});

test("a v1 directory alone cannot bypass deployment schema validation", async (t) => {
  const root = await temporaryProject(t);
  await writeValidOutput(root);
  await writeFile(reader.getRootConfigPath(root), JSON.stringify({ buildContext: "invalid" }));
  await assert.rejects(reader.readBuildOutput(root), { code: "invalid" });
});

test("validation uses cf's own nested reader instead of a different root dependency", async (t) => {
  const root = await temporaryProject(t);
  const cf = join(root, "node_modules/cf");
  const nestedReader = join(cf, "node_modules/@cloudflare/build-output-utils");
  const rootReader = join(root, "node_modules/@cloudflare/build-output-utils");
  await mkdir(dirname(nestedReader), { recursive: true });
  await mkdir(rootReader, { recursive: true });
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  await writeFile(join(cf, "package.json"), '{"name":"cf"}');
  await writeFile(
    join(rootReader, "package.json"),
    JSON.stringify({
      name: "@cloudflare/build-output-utils",
      type: "module",
      exports: { ".": { import: "./index.mjs" } },
    }),
  );
  await writeFile(join(rootReader, "index.mjs"), 'throw new Error("wrong root reader");');

  const require = createRequire(pathToFileURL(join(projectRoot, "package.json")));
  const manifestPath = findPackageJSON(
    "@cloudflare/build-output-utils",
    pathToFileURL(require.resolve("cf/package.json")),
  );
  await symlink(dirname(manifestPath), nestedReader, "dir");
  await writeValidOutput(root);
  const result = await checkCloudflareBuild(root);
  const actual = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(result, {
    version: "v1",
    workers: 1,
    readerVersion: actual.version,
  });
});
