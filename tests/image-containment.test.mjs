import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import config from "../postcss.config.mjs";

const load = createRequire(import.meta.resolve("@tailwindcss/postcss"));
const postcss = load("postcss");
const sourceRoot = new URL("../src/features/workspace/", import.meta.url);

function declarations(result, selector) {
  const found = [];
  result.root.walkRules(selector, (rule) => rule.walkDecls((declaration) => {
    found.push(declaration);
  }));
  return found;
}

for (const [file, selector] of [
  ["workspace.css", ".stage-image"],
  ["presentation.css", ".presentation-active .stage-image"],
]) {
  test(`the real pipeline preserves whole-slide containment in ${file}`, async () => {
    const path = new URL(file, sourceRoot);
    const result = await postcss(config.plugins).process(readFileSync(path, "utf8"), {
      from: path.pathname,
    });
    const fit = declarations(result, selector).find((declaration) =>
      declaration.prop === "object-fit",
    );
    assert.equal(fit?.value, "contain");
    assert.equal(fit?.important, true);
    if (file === "workspace.css") {
      const thumbnail = declarations(result, ".thumbnail img").find((declaration) =>
        declaration.prop === "object-fit",
      );
      assert.equal(thumbnail?.value, "contain");
      assert.equal(!!thumbnail?.important, false);
    }
  });
}

test("the adapter leaves unrelated selectors, files and declarations alone", async () => {
  const css = [
    ".stage-image { object-fit: contain; color: red; }",
    ".photo { object-fit: cover; }",
    ".other { object-fit: contain; }",
  ].join("\n");
  const target = await postcss(config.plugins).process(css, {
    from: new URL("workspace.css", sourceRoot).pathname,
  });
  assert.equal(declarations(target, ".stage-image")[1].important, undefined);
  assert.equal(!!declarations(target, ".photo")[0].important, false);
  assert.equal(!!declarations(target, ".other")[0].important, false);
  const unrelated = await postcss(config.plugins).process(css, {
    from: new URL("../landing/landing.css", sourceRoot).pathname,
  });
  assert.equal(!!declarations(unrelated, ".stage-image")[0].important, false);
});

test("whole-slide priority is idempotent and does not duplicate existing important", async () => {
  const options = { from: new URL("workspace.css", sourceRoot).pathname };
  const first = await postcss(config.plugins).process(
    ".stage-image { object-fit: contain !important; }",
    options,
  );
  const second = await postcss(config.plugins).process(first.css, options);
  assert.equal(second.css, first.css);
  assert.equal((second.css.match(/!important/g) ?? []).length, 1);
});
