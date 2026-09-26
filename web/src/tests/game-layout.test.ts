// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const STYLES = join(import.meta.dirname, "../styles");

// Innermost rules only, with the @media condition they sit in.
function rules(css: string): Array<{ media: string; selector: string; body: string }> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: Array<{ media: string; selector: string; body: string }> = [];
  const media: string[] = [];
  let buffer = "";
  for (const char of clean) {
    if (char === "{") {
      const head = buffer.trim();
      buffer = "";
      media.push(head);
    } else if (char === "}") {
      const head = media.pop() ?? "";
      if (!head.startsWith("@")) {
        found.push({ media: media.filter((m) => m.startsWith("@media")).join(" "), selector: head, body: buffer });
      }
      buffer = "";
    } else if (char === ";" && media.length === 0) {
      buffer = "";
    } else {
      buffer += char;
    }
  }
  return found;
}

// The board, the side panel and what the panel holds.
const PANEL_SELECTOR =
  /\.game-layout|\.game-actions|-actions(?![\w-])|-controls|-message|-progress|-result|-verdict|mistakes-remaining|name-guess-(hud|options|play|toast)|virtual-keyboard/;

// Anything that would show the panel or its parts in another order than the
// DOM. A full-row span (grid-column: 1 / -1) keeps the order and is allowed.
const REORDER = [
  /(^|[\s;])order\s*:/,
  /flex-direction\s*:\s*[\w-]*-reverse/,
  /grid-(area|row)(-start|-end)?\s*:/,
  /grid-column(-start|-end)?\s*:(?!\s*1\s*\/\s*-1\s*(;|$))/,
  /grid-template-areas\s*:/,
  /grid-auto-flow\s*:[^;]*column/,
];

function reorderingRules(css: string) {
  return rules(css).filter(
    ({ selector, body }) => PANEL_SELECTOR.test(selector) && REORDER.some((pattern) => pattern.test(body)),
  );
}

const SHEETS = ["components.css", "games/connections.css", "games/grid.css", "games/name-guess.css"];
const read = (sheet: string) => readFileSync(join(STYLES, sheet), "utf-8");

describe("board and side panel layout", () => {
  it("catches each way of reordering the panel", () => {
    const samples = [
      ".game-layout-side { order: -1; }",
      "@media (min-width: 60rem) { .game-layout { flex-direction: column-reverse; } }",
      ".game-layout > .game-actions { grid-area: 1 / 1; }",
      ".connections-controls .btn-primary { grid-column: 1; }",
      ".grid-progress { grid-row: 1; }",
      ".game-layout { grid-template-areas: \"side board\"; }",
    ];
    for (const sample of samples) expect(reorderingRules(sample), sample).toHaveLength(1);
    expect(reorderingRules(".connections-controls .btn-primary { grid-column: 1 / -1; }")).toEqual([]);
    expect(reorderingRules(".map-pilot-answers { grid-area: list; }")).toEqual([]);
  });

  it("keeps the board and the panel in DOM order in the shared and game style sheets", () => {
    for (const sheet of SHEETS) expect(reorderingRules(read(sheet)), sheet).toEqual([]);
  });

  it("puts the panel beside the board from 60rem and stacks them below", () => {
    const layout = rules(read("components.css")).filter(({ selector }) => selector === ".game-layout");
    const narrow = layout.find(({ media }) => media === "");
    const wide = layout.find(({ media }) => media.includes("min-width: 60rem"));
    expect(narrow?.body).toMatch(/flex-direction:\s*column/);
    expect(wide?.body).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) var\(--game-side-width/);
    // Below 60rem the wrapper leaves no box, so the bar inside stays sticky.
    const side = rules(read("components.css")).find(
      ({ selector, media }) => selector === ".game-layout-side" && media === "",
    );
    expect(side?.body).toMatch(/display:\s*contents/);
  });

  it("drops the sticky bar only beside the board", () => {
    const panel = rules(read("components.css")).filter(({ selector }) =>
      selector.includes(".game-layout > .game-actions,"),
    );
    expect(panel).toHaveLength(1);
    expect(panel[0]!.media).toContain("min-width: 60rem");
    expect(panel[0]!.body).toMatch(/position:\s*relative/);
  });
});
