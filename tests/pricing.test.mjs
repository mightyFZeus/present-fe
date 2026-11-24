import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const load = createRequire(import.meta.url);
load.extensions[".css"] = () => {};
const { PricingPage, pricingPlans } = load("../src/features/pricing/PricingPage.tsx");

test("pricing renders the approved NGN offers without suggesting a working checkout", () => {
  assert.deepEqual(pricingPlans.map(({ name, price }) => [name, price]), [
    ["Rehearsal", 0], ["Spotlight", 20000], ["Headline", 50000],
  ]);
  const html = renderToStaticMarkup(React.createElement(PricingPage));
  for (const value of ["₦20,000", "₦50,000", "30 voice minutes, one-time", "300 voice minutes per month", "1,000 voice minutes per month", "3 saved decks", "20 saved decks", "60 saved decks"]) assert.ok(html.includes(value), value);
  assert.equal([...html.matchAll(/<button[^>]*disabled/g)].length, 2);
  assert.match(html, /Paid plans coming soon/);
  assert.match(html, /usage limits are not enforced yet/);
  assert.match(html, /href="\/login"[^>]*>Start free/);
  assert.match(html, /<table>/);
  assert.match(html, /scope="row"/);
  assert.equal([...html.matchAll(/<details>/g)].length, 5);
  assert.match(html, /href="\/#features"/);
  assert.doesNotMatch(html, /href="\/pricing"/);
});
