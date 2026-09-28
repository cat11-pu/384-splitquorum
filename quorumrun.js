// quorumrun.js：按共用处理预算处理事件，用尽连着载压账，收尾把账做完
import { countOf, majorOf } from "./quorum.js";

function codesOf(spec) {
  return {
    node: spec.bad_node_code || "E_BAD_NODE",
    side: spec.bad_side_code || "E_BAD_SIDE",
    dup: spec.dup_code || "E_DUP_PART",
    none: spec.none_code || "E_NO_SIDE",
    event: spec.event_error_code || "E_BAD_EVENT"
  };
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function cloneState(state) {
  state = state || {};
  return {
    sides: (state.sides || []).map((row) => [row[0], row[1]]),
    asks: (state.asks || []).map((row) => [row[0], row[1]]),
    ledger: (state.ledger || []).slice(),
    applied: (state.applied || []).slice()
  };
}

// 账上条目统一成三元组；id 挂在数组属性上，JSON 序列化不可见、重放去重用
function toTuple(event) {
  let tuple;
  if (event.kind === "ask") tuple = ["ask", null, event.side];
  else if (event.kind === "part") tuple = ["part", event.node, event.side];
  else tuple = [event.kind, event.node, event.side];
  if (event.id !== undefined) tuple.id = event.id;
  return tuple;
}

function isEmptySide(side) {
  return typeof side !== "string" || side.length === 0;
}

// 校验顺序：结构（E_BAD_EVENT）→ 空节点（E_BAD_NODE）→ 空侧（E_BAD_SIDE）
//         → 语义（重复划分 E_DUP_PART / 空侧询问 E_NO_SIDE，按当前划分表判）
function applyTuple(state, tuple, codes) {
  const kind = tuple[0];
  if (kind !== "part" && kind !== "ask") fail(codes.event);
  const side = tuple[2];
  if (kind === "part") {
    const node = tuple[1];
    if (typeof node !== "string" || node.length === 0) fail(codes.node);
    if (isEmptySide(side)) fail(codes.side);
    if (state.sides.some((row) => row[0] === node)) fail(codes.dup);
    let index = 0;
    while (index < state.sides.length && state.sides[index][0] < node) index += 1;
    state.sides.splice(index, 0, [node, side]);
  } else {
    if (isEmptySide(side)) fail(codes.side);
    const count = countOf(state.sides, side);
    if (count === 0) fail(codes.none);
    state.asks.push([side, majorOf(count, state.sides.length) ? 1 : 0]);
  }
  if (tuple.id !== undefined) state.applied.push(tuple.id);
}

function appendEvents(state, events) {
  for (const event of events || []) {
    if (event && event.id !== undefined && state.applied.includes(event.id)) continue;
    state.ledger.push(toTuple(event));
  }
}

export function step(spec) {
  const codes = codesOf(spec);
  const state = cloneState(spec.state);
  appendEvents(state, spec.events);
  const judgedBound = state.ledger.length;
  let budget = Number.isFinite(spec.budget) ? Math.trunc(spec.budget) : judgedBound;
  if (budget < 0) budget = 0;
  let served = 0;
  while (served < budget && state.ledger.length > 0) {
    const tuple = state.ledger[0];
    applyTuple(state, tuple, codes);
    state.ledger.shift();
    served += 1;
  }
  return {
    state,
    served,
    ledger_before: state.ledger.length,
    ledger: state.ledger,
    judged: served,
    judged_bound: judgedBound
  };
}

export function close(spec) {
  const codes = codesOf(spec);
  const state = cloneState(spec.state);
  let catchup = 0;
  while (state.ledger.length > 0) {
    const tuple = state.ledger.shift();
    applyTuple(state, tuple, codes);
    catchup += 1;
  }
  return { state, catchup };
}
