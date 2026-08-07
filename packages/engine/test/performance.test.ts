import { describe, expect, it } from "vitest";
import { createDocument } from "../src/document/document.js";
import { History } from "../src/runtime/history.js";
import type { Command } from "../src/runtime/commands.js";

// RFC-000 §6 performance budgets that are meaningfully testable at the
// Document/CommandBus/History layer already built in Phase 1. Layout- and
// render-dependent budgets (drag, export preview) land in later phases.
const UNDO_BUDGET_MS = 50;
const NODE_COUNT = 2000;

describe("performance budgets (RFC-000 §6)", () => {
  it(`undo stays under ${UNDO_BUDGET_MS}ms after building a ${NODE_COUNT}-node document`, () => {
    const history = new History(createDocument({ rootNodeId: "root" }));

    for (let i = 0; i < NODE_COUNT; i++) {
      const command: Command = {
        type: "CREATE_NODE",
        nodeId: `node-${i}`,
        nodeType: "box",
        parentId: "root",
      };
      history.execute(command);
    }

    const start = performance.now();
    history.undo();
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(UNDO_BUDGET_MS);
  });
});
