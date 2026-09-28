// quorumrun.js：按处理预算处理划分/询问事件，预算用尽连着载账，close 把账做完
import { countOf, majorOf } from "./quorum.js";

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function isBlank(value) {
  return typeof value !== "string" || value.trim() === "";
}

// 压账用的规范化三元组：[kind, node|null, side|null]
function serialize(entry) {
  return entry.kind === "part"
    ? ["part", entry.node, entry.side]
    : ["ask", null, entry.side];
}

// 结构与空名校验（整批先做，优先级：结构 -> 空节点 -> 空侧）
function validate(events, spec) {
  const badNode = spec.bad_node_code || "E_BAD_NODE";
  const badSide = spec.bad_side_code || "E_BAD_SIDE";
  const badEvent = spec.event_error_code || "E_BAD_EVENT";
  for (const event of events) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw err(badEvent);
    }
    if (event.kind !== "part" && event.kind !== "ask") {
      throw err(badEvent);
    }
    if (event.kind === "part") {
      if (isBlank(event.node)) throw err(badNode);
      if (isBlank(event.side)) throw err(badSide);
    }
    if (event.kind === "ask" && isBlank(event.side)) throw err(badSide);
  }
}

// 真正处理一条（有预算时调用，按当前划分表判重复/空侧）
function applyEntry(entry, state, spec) {
  const dup = spec.dup_code || "E_DUP_PART";
  const none = spec.none_code || "E_NO_SIDE";
  if (entry.kind === "part") {
    if (state.sides.some((row) => row[0] === entry.node)) throw err(dup);
    state.sides.push([entry.node, entry.side]);
    state.sides.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  } else {
    const count = countOf(state.sides, entry.side);
    if (count === 0) throw err(none);
    state.asks.push([entry.side, majorOf(count, state.sides.length) ? 1 : 0]);
  }
}

function cloneState(state) {
  return {
    sides: (state.sides || []).map((row) => [row[0], row[1]]),
    asks: (state.asks || []).map((row) => [row[0], row[1]]),
    ledger: (state.ledger || []).map((row) => [row[0], row[1], row[2]]),
    applied: (state.applied || []).slice()
  };
}

export function step(spec) {
  const events = spec.events || [];
  validate(events, spec);

  const state = cloneState(spec.state || {});
  const appliedSet = new Set(state.applied.map(String));
  const budget = Number.isFinite(spec.budget) ? spec.budget : events.length;

  const queue = [];
  // 旧账优先（拆两轮时账上事件先补齐，语义始终按当前划分表判）
  for (const row of state.ledger) {
    queue.push({ kind: row[0], node: row[1], side: row[2], id: null, ledger: true });
  }
  state.ledger = [];
  // 再接新事件；已处理过的（重放）静默跳过，不占预算
  for (const event of events) {
    if (event.id !== undefined && event.id !== null && appliedSet.has(String(event.id))) continue;
    queue.push({ kind: event.kind, node: event.node, side: event.side, id: event.id, ledger: false });
  }

  let served = 0;
  let remaining = budget;
  for (const item of queue) {
    if (remaining > 0) {
      applyEntry(item, state, spec);
      if (item.id !== undefined && item.id !== null) state.applied.push(item.id);
      remaining -= 1;
      served += 1;
    } else {
      // 预算用尽：后面的事件连着载压账
      state.ledger.push(serialize(item));
    }
  }

  return {
    state,
    served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map((row) => [row[0], row[1], row[2]]),
    judged: served,
    judged_bound: queue.length
  };
}

// 收尾对账：每个在最终状态里留下效果（划分行/裁定行）的事件都应计入 applied
function reconcileApplied(state, events) {
  const appliedSet = new Set(state.applied.map(String));
  const askRows = state.asks.map((row) => [row[0], row[1]]);
  const sideNodes = new Set(state.sides.map((row) => row[0]));
  for (const event of events) {
    if (event.id === undefined || event.id === null || appliedSet.has(String(event.id))) continue;
    if (event.kind === "part") {
      if (sideNodes.has(event.node)) {
        state.applied.push(event.id);
        appliedSet.add(String(event.id));
      }
    } else {
      let idx = askRows.findIndex((row) => row[0] === event.side && row[1] === (majorOf(countOf(state.sides, event.side), state.sides.length) ? 1 : 0));
      if (idx < 0) idx = askRows.findIndex((row) => row[0] === event.side);
      if (idx >= 0) {
        askRows.splice(idx, 1);
        state.applied.push(event.id);
        appliedSet.add(String(event.id));
      }
    }
  }
}

export function close(spec) {
  const events = spec.events || [];
  validate(events, spec);

  const state = cloneState(spec.state || {});
  const backlog = state.ledger.map((row) => [row[0], row[1], row[2]]);
  state.ledger = [];

  let catchup = 0;
  for (const row of backlog) {
    applyEntry({ kind: row[0], node: row[1], side: row[2] }, state, spec);
    catchup += 1;
  }
  // 旧账条目不带 id，按最终状态与事件清单对账，补齐 applied
  reconcileApplied(state, events);

  return { state, catchup };
}
