import { describe, expect, it } from "vitest";
import { createDocument, getNode } from "../src/document/document.js";
import { validateDocument } from "../src/document/invariants.js";
import { applyCommand, CommandError, type Command } from "../src/runtime/commands.js";

function baseDocument() {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

describe("applyCommand — CREATE_NODE", () => {
  it("adds a node and links it to its parent's childrenIds", () => {
    const doc = baseDocument();
    const next = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "text-1",
      nodeType: "text",
      parentId: "root",
      props: { content: "Hello" },
    });

    expect(getNode(next, "text-1")).toMatchObject({
      id: "text-1",
      type: "text",
      parentId: "root",
      props: { content: "Hello" },
    });
    expect(getNode(next, "root")!.childrenIds).toEqual(["text-1"]);
  });

  it("does not mutate the input Document (pure function)", () => {
    const doc = baseDocument();
    applyCommand(doc, { type: "CREATE_NODE", nodeId: "text-1", nodeType: "text", parentId: "root" });

    expect(doc.nodes.has("text-1")).toBe(false);
    expect(getNode(doc, "root")!.childrenIds).toEqual([]);
  });

  it("respects an explicit insertion index", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "root", index: 0 });

    expect(getNode(doc, "root")!.childrenIds).toEqual(["b", "a"]);
  });

  it("rejects a duplicate node id", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" });

    expect(() =>
      applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" }),
    ).toThrow(CommandError);
  });

  it("rejects a non-existent parent", () => {
    const doc = baseDocument();
    expect(() =>
      applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "ghost" }),
    ).toThrow();
  });
});

describe("applyCommand — UPDATE_PROPS", () => {
  it("shallow-merges props into the existing node", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "a",
      nodeType: "text",
      parentId: "root",
      props: { color: "red", size: 12 },
    });
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "a", props: { color: "blue" } });

    expect(getNode(doc, "a")!.props).toEqual({ color: "blue", size: 12 });
  });

  it("rejects an update on a non-existent node", () => {
    const doc = baseDocument();
    expect(() => applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "ghost", props: {} })).toThrow();
  });
});

describe("applyCommand — DELETE_NODE", () => {
  it("removes a node and unlinks it from its parent", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" });
    doc = applyCommand(doc, { type: "DELETE_NODE", nodeId: "a" });

    expect(getNode(doc, "a")).toBeUndefined();
    expect(getNode(doc, "root")!.childrenIds).toEqual([]);
  });

  it("cascades deletion to descendants", () => {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a" });
    doc = applyCommand(doc, { type: "DELETE_NODE", nodeId: "a" });

    expect(getNode(doc, "a")).toBeUndefined();
    expect(getNode(doc, "b")).toBeUndefined();
  });

  it("refuses to delete a page's root node", () => {
    const doc = baseDocument();
    expect(() => applyCommand(doc, { type: "DELETE_NODE", nodeId: "root" })).toThrow(CommandError);
  });

  it("rejects deletion of a non-existent node", () => {
    const doc = baseDocument();
    expect(() => applyCommand(doc, { type: "DELETE_NODE", nodeId: "ghost" })).toThrow();
  });
});

describe("applyCommand — every command produces a valid Document", () => {
  it("holds across a mixed sequence of commands", () => {
    let doc = baseDocument();
    const commands: Command[] = [
      { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" },
      { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a", props: { content: "hi" } },
      { type: "CREATE_NODE", nodeId: "c", nodeType: "text", parentId: "a" },
      { type: "UPDATE_PROPS", nodeId: "b", props: { content: "hello" } },
      { type: "DELETE_NODE", nodeId: "c" },
    ];

    for (const command of commands) {
      doc = applyCommand(doc, command);
      expect(validateDocument(doc)).toEqual([]);
    }
  });
});
