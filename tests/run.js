import assert from "node:assert";
import { countOf, majorOf } from "../quorum.js";
import { step, close } from "../quorumrun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { sides: [], asks: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "part", node: "a", side: "L" }],
  bad_node_code: "E_BAD_NODE", bad_side_code: "E_BAD_SIDE",
  dup_code: "E_DUP_PART", none_code: "E_NO_SIDE",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("countOf returns a number", () => {
  assert.strictEqual(typeof countOf([["a", "L"]], "L"), "number");
});

check("majorOf returns a boolean", () => {
  assert.strictEqual(typeof majorOf(2, 3), "boolean");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
