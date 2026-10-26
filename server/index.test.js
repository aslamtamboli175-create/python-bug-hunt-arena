import test from "node:test";
import assert from "node:assert/strict";
import { QUESTIONS } from "./questions.js";

test("the arena has exactly ten complete beginner challenges", () => {
  assert.equal(QUESTIONS.length, 10);
  for (const q of QUESTIONS) {
    assert.equal(typeof q.title, "string");
    assert.equal(typeof q.code, "string");
    assert.equal(q.options.length, 4);
    assert.ok(q.answer >= 0 && q.answer < q.options.length);
    assert.ok(q.explanation.length > 15);
  }
});
test("each challenge has a unique title", () => {
  assert.equal(new Set(QUESTIONS.map(q => q.title)).size, 10);
});
