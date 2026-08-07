import { describe, expect, it } from "vitest";
import { createDocument } from "../src/document/document.js";
import { hashDocument, serializeDocument } from "../src/document/hash.js";
import { validateDocument } from "../src/document/invariants.js";
import { applyCommand, type Command } from "../src/runtime/commands.js";

// Distinto dai test di undo/redo in history.test.ts: History è snapshot-based
// (undo/redo restituiscono un Document già calcolato, non ri-eseguono i
// comandi), quindi la sua uguaglianza di hash non dimostra che l'ENGINE sia
// deterministico sotto replay. Questo test lo verifica direttamente: stessa
// sequenza di comandi, applicata a due Document indipendenti creati da zero,
// deve produrre risultati indistinguibili.
describe("determinismo del replay dei comandi", () => {
  it("la stessa sequenza di comandi applicata a due createDocument() indipendenti produce hash, struttura e invarianti identici", () => {
    const commands: Command[] = [
      { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root", props: { background: "#fff" } },
      { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a", props: { content: "hi", size: 12 } },
      { type: "UPDATE_PROPS", nodeId: "b", props: { content: "hello" } },
      { type: "CREATE_NODE", nodeId: "c", nodeType: "text", parentId: "a" },
      { type: "DELETE_NODE", nodeId: "c" },
      { type: "CREATE_NODE", nodeId: "d", nodeType: "box", parentId: "root" },
      { type: "UPDATE_PROPS", nodeId: "root", props: { visible: true } },
    ];

    let docA = createDocument({ rootNodeId: "root" });
    let docB = createDocument({ rootNodeId: "root" });

    for (const command of commands) {
      docA = applyCommand(docA, command);
      docB = applyCommand(docB, command);
    }

    expect(validateDocument(docA)).toEqual([]);
    expect(validateDocument(docB)).toEqual([]);
    expect(hashDocument(docA)).toBe(hashDocument(docB));
    expect(serializeDocument(docA)).toBe(serializeDocument(docB)); // uguaglianza strutturale, non solo hash
  });
});
