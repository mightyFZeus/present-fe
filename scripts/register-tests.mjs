import Module, { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const load = createRequire(import.meta.url);
const ts = load("typescript");
const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const frameworkAliases = new Map([
  ["next/navigation", "vinext/shims/navigation"],
  ["next/link", "vinext/shims/link"],
  ["next/image", "vinext/shims/image"],
  ["next/font/local", "vinext/shims/font-local"],
].map(([request, target]) => [request, fileURLToPath(import.meta.resolve(target))]));
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  const target = frameworkAliases.get(request) ?? (
    request.startsWith("@/") ? sourceRoot + request.slice(2) : request
  );
  return resolve.call(this, target, parent, ...rest);
};
for (const extension of [".ts", ".tsx"]) {
  Module._extensions[extension] = (module, filename) => {
    const result = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    module._compile(result.outputText, filename);
  };
}
