import { readFile } from "node:fs/promises";
import { createRequire, findPackageJSON } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Resolve from cf, since its supported format may differ from the root dependency.
export async function loadCfBuildOutputReader(projectRoot = process.cwd()) {
  const require = createRequire(pathToFileURL(resolve(projectRoot, "package.json")));
  const cfManifestPath = require.resolve("cf/package.json");
  const readerManifestPath = findPackageJSON(
    "@cloudflare/build-output-utils",
    pathToFileURL(cfManifestPath),
  );
  if (!readerManifestPath) {
    throw new Error("Cannot find the build-output reader used by cf.");
  }

  const manifest = JSON.parse(await readFile(readerManifestPath, "utf8"));
  const entry = manifest.exports?.["."]?.import;
  const importPath = typeof entry === "string" ? entry : entry?.default;
  if (typeof importPath !== "string") {
    throw new Error("The cf build-output reader has no supported import entry.");
  }

  const reader = await import(new URL(importPath, pathToFileURL(readerManifestPath)).href);
  return {
    reader,
    readerVersion: manifest.version,
  };
}

export async function checkCloudflareBuild(projectRoot = process.cwd()) {
  const { reader, readerVersion } = await loadCfBuildOutputReader(projectRoot);
  const output = await reader.readBuildOutput(projectRoot);
  return {
    version: output.version,
    workers: Object.keys(output.workers).length,
    readerVersion,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await checkCloudflareBuild();
    console.log(
      `Cloudflare build accepted: ${result.version}, ${result.workers} worker(s) ` +
      `(cf reader ${result.readerVersion}).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Cloudflare build validation failed.");
    process.exitCode = 1;
  }
}
