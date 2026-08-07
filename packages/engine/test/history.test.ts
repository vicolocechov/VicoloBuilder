import { describe, expect, it } from "vitest";
import { createDocument, getNode } from "../src/document/document.js";
import { hashDocument } from "../src/document/hash.js";
import { validateDocument } from "../src/document/invariants.js";
import { History } from "../src/runtime/history.js";
import type { Command } from "../src/runtime/commands.js";

function baseDocument() {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

describe("History", () => {
  it("starts with canUndo/canRedo both false", () => {
    const history = new History(baseDocument());
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("undo reverts the last command; redo re-applies it", () => {
    const history = new History(baseDocument());
    history.execute({ type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" });

    expect(getNode(history.document, "a")).toBeDefined();

    history.undo();
    expect(getNode(history.document, "a")).toBeUndefined();
    expect(history.canRedo).toBe(true);

    history.redo();
    expect(getNode(history.document, "a")).toBeDefined();
  });

  it("executing a new command after undo clears the redo stack", () => {
    const history = new History(baseDocument());
    history.execute({ type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" });
    history.undo();
    history.execute({ type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "root" });

    expect(history.canRedo).toBe(false);
    expect(getNode(history.document, "a")).toBeUndefined();
    expect(getNode(history.document, "b")).toBeDefined();
  });

  it("undo/redo beyond the available history is a no-op", () => {
    const history = new History(baseDocument());
    const initialHash = hashDocument(history.document);

    history.undo(); // nothing to undo
    expect(hashDocument(history.document)).toBe(initialHash);

    history.redo(); // nothing to redo
    expect(hashDocument(history.document)).toBe(initialHash);
  });

  it("undo followed by redo always restores the exact same Document hash (RFC-000 §12)", () => {
    const history = new History(baseDocument());
    const commands: Command[] = [
      { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" },
      { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a", props: { content: "hi", size: 12 } },
      { type: "UPDATE_PROPS", nodeId: "b", props: { content: "hello" } },
      { type: "CREATE_NODE", nodeId: "c", nodeType: "text", parentId: "a" },
      { type: "DELETE_NODE", nodeId: "c" },
      { type: "UPDATE_PROPS", nodeId: "a", props: { visible: true } },
    ];

    const hashesAfterEachCommand: string[] = [];
    for (const command of commands) {
      history.execute(command);
      hashesAfterEachCommand.push(hashDocument(history.document));
    }

    // Undo everything, one step at a time, then redo everything, one step
    // at a time: at every point the hash must match what it was the first
    // time around, and the Document must remain invariant-valid.
    for (let i = commands.length - 1; i >= 0; i--) {
      history.undo();
      expect(validateDocument(history.document)).toEqual([]);
    }

    for (let i = 0; i < commands.length; i++) {
      history.redo();
      expect(hashDocument(history.document)).toBe(hashesAfterEachCommand[i]);
      expect(validateDocument(history.document)).toEqual([]);
    }

    // Full round trip: undo everything, redo everything, must land back on
    // the exact same hash as right after the original command sequence.
    for (let i = 0; i < commands.length; i++) history.undo();
    for (let i = 0; i < commands.length; i++) history.redo();

    expect(hashDocument(history.document)).toBe(hashesAfterEachCommand[hashesAfterEachCommand.length - 1]);
  });

  it("partial undo/redo round trips also preserve the hash invariant", () => {
    const history = new History(baseDocument());
    history.execute({ type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    history.execute({ type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a" });
    history.execute({ type: "UPDATE_PROPS", nodeId: "b", props: { content: "x" } });

    const hashBeforeUndo = hashDocument(history.document);

    history.undo();
    history.undo();
    history.redo();
    history.redo();

    expect(hashDocument(history.document)).toBe(hashBeforeUndo);
  });
});
