import { test } from "node:test";
import assert from "node:assert/strict";
import { applyWorkspaceVisibility, NAV_SECTION_IDS } from "../apps/web/src/services/shell-navigation.js";

function createMockDoc() {
  const sections = Object.fromEntries(NAV_SECTION_IDS.map((id) => [id, { attrs: new Set() }]));
  for (const node of Object.values(sections)) {
    node.toggleAttribute = function toggleAttribute(name, force) {
      if (force) this.attrs.add(name);
      else this.attrs.delete(name);
    };
  }
  return {
    getElementById(id) {
      return sections[id] ?? null;
    },
    sections
  };
}

test("applyWorkspaceVisibility hides inactive sections", () => {
  const doc = createMockDoc();
  assert.equal(applyWorkspaceVisibility(doc, "section-mission"), true);
  assert.ok(!doc.sections["section-mission"].attrs.has("hidden"));
  for (const sid of NAV_SECTION_IDS) {
    if (sid === "section-mission") continue;
    assert.ok(doc.sections[sid].attrs.has("hidden"));
  }
});

test("applyWorkspaceVisibility rejects unknown id", () => {
  const doc = createMockDoc();
  assert.equal(applyWorkspaceVisibility(doc, "section-unknown"), false);
});
