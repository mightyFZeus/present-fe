import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const load = createRequire(import.meta.url);
const { LandingStage, stageTopics } = load("../src/features/landing/LandingStage.tsx");

function nodes(tree, predicate) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) found.push(node);
    for (const child of [node.props?.children].flat(Infinity)) visit(child);
  }
  visit(tree);
  return found;
}
function text(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  return [node.props?.children].flat(Infinity).map(text).join("");
}
function cssBlock(css, marker) {
  const start = css.indexOf(marker);
  assert.ok(start >= 0, marker);
  const opening = css.indexOf("{", start);
  let depth = 1;
  let end = opening + 1;
  while (depth && end < css.length) {
    if (css[end] === "{") depth += 1;
    if (css[end] === "}") depth -= 1;
    end += 1;
  }
  assert.equal(depth, 0);
  return { content: css.slice(opening + 1, end - 1), start, end };
}

test("the stage server-renders a useful labelled example with native topic controls", () => {
  const html = renderToStaticMarkup(React.createElement(LandingStage));
  assert.match(html, /Illustrative example · no microphone needed/);
  assert.match(html, /Fictional campus plan/);
  assert.match(html, /Keep every drop useful/);
  assert.match(html, /leak alerts and rainwater/);
  assert.equal([...html.matchAll(/<button\b/g)].length, 3);
  assert.equal([...html.matchAll(/aria-pressed="true"/g)].length, 1);
  assert.match(html, /aria-live="polite" aria-atomic="true"/);
  assert.doesNotMatch(html, /autoplay|listening|recording|LIVE/);
});

test("topic choices update the quote and slide together in any order", (t) => {
  const original = React.useState;
  let selected = 1;
  React.useState = () => [selected, (index) => { selected = index; }];
  t.after(() => { React.useState = original; });
  for (const index of [2, 0, 1, 0]) {
    let tree = LandingStage();
    nodes(tree, (node) => node.type === "button")[index].props.onClick();
    tree = LandingStage();
    const buttons = nodes(tree, (node) => node.type === "button");
    assert.equal(buttons.filter((button) => button.props["aria-pressed"]).length, 1);
    assert.equal(buttons[index].props["aria-pressed"], true);
    assert.equal(buttons[index].props["aria-controls"], "landing-example-slide");
    assert.equal(nodes(tree, (node) => node.type === "blockquote")[0].key, stageTopics[index].id);
    for (const field of ["quote", "title", "detail"]) {
      assert.ok(text(tree).includes(stageTopics[index][field]));
    }
    assert.ok(text(tree).includes("Illustrative example · no microphone needed"));
  }
});

test("motion is scoped, progressive and removable for reduced motion", () => {
  const css = readFileSync(new URL("../src/features/landing/landing.css", import.meta.url), "utf8");
  const enabled = cssBlock(css, "@media (prefers-reduced-motion: no-preference)");
  const reduced = cssBlock(css, "@media (prefers-reduced-motion: reduce)");
  assert.match(enabled.content, /\.present-landing \.landing-stage-slide/);
  assert.match(reduced.content, /animation: none/);
  assert.match(reduced.content, /opacity: 1/);
  assert.match(reduced.content, /transition: none/);
  const resting = css.slice(0, enabled.start);
  assert.doesNotMatch(resting, /\banimation:|\btransition:|opacity:\s*0(?:;|\s)/);
  assert.doesNotMatch(css, /\binfinite\b|animation-timeline|scroll-timeline|will-change/);
  for (const name of ["landing-hero-enter", "landing-slide-handoff", "landing-quote-handoff"]) {
    const frames = cssBlock(css, `@keyframes ${name}`);
    const properties = [...frames.content.matchAll(/([a-z-]+)\s*:/g)];
    assert.ok(properties.every((match) => ["opacity", "transform"].includes(match[1])));
  }
});
