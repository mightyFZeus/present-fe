import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

for (const file of [
  "src/features/auth/LoginScreen.tsx",
  "src/features/workspace/WorkspaceHeader.tsx",
]) {
  test(`${file} declares its client boundary before imports`, () => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const first = ast.statements[0];
    assert.ok(ts.isExpressionStatement(first));
    assert.ok(ts.isStringLiteral(first.expression));
    assert.equal(first.expression.text, "use client");
  });
}
