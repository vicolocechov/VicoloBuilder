import { describe, expect, it } from "vitest";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import type { Document } from "@vicolobuilder/engine";
import { buildStructuralMoveCommand } from "../../src/canvas/buildStructuralMoveCommand.js";
import type { DropTarget } from "../../src/canvas/dropTarget.js";

// Documento di prova: root -> containerA[a1,a2,a3], containerB (vuoto).
function baseDoc(): Document {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "containerA", nodeType: "box", parentId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "containerB", nodeType: "box", parentId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a1", nodeType: "text", parentId: "containerA" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a2", nodeType: "text", parentId: "containerA" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a3", nodeType: "text", parentId: "containerA" });
  return doc;
}

describe("buildStructuralMoveCommand", () => {
  it("'into' produce un MOVE_NODE senza index (append in coda, come il vecchio 'Sposta dentro…')", () => {
    const doc = baseDoc();
    const target: DropTarget = { kind: "into", targetNodeId: "containerB", parentNodeId: "containerB" };
    const command = buildStructuralMoveCommand(doc, "a1", target);
    expect(command).toEqual({ type: "MOVE_NODE", nodeId: "a1", newParentId: "containerB" });
  });

  it("'before' su un fratello di un ALTRO genitore calcola l'indice della posizione del fratello", () => {
    const doc = baseDoc();
    const target: DropTarget = { kind: "before", targetNodeId: "a2", parentNodeId: "containerA" };
    // a1 non è ancora figlio di containerA in questo scenario (viene da fuori) - qui però lo è già:
    // testiamo lo scenario "riparent da un altro genitore" spostando un nodo nuovo, non a1/a2/a3.
    let docWithOutsider = doc;
    docWithOutsider = applyCommand(docWithOutsider, { type: "CREATE_NODE", nodeId: "outsider", nodeType: "text", parentId: "containerB" });
    const command = buildStructuralMoveCommand(docWithOutsider, "outsider", target);
    expect(command).toEqual({ type: "MOVE_NODE", nodeId: "outsider", newParentId: "containerA", index: 1 });
  });

  it("'after' su un fratello calcola indice+1", () => {
    const doc = baseDoc();
    const target: DropTarget = { kind: "after", targetNodeId: "a2", parentNodeId: "containerA" };
    let docWithOutsider = applyCommand(doc, { type: "CREATE_NODE", nodeId: "outsider", nodeType: "text", parentId: "containerB" });
    const command = buildStructuralMoveCommand(docWithOutsider, "outsider", target);
    expect(command).toEqual({ type: "MOVE_NODE", nodeId: "outsider", newParentId: "containerA", index: 2 });
  });

  it("riordino nello STESSO genitore: l'indice esclude il nodo trascinato (stessa semantica di applyMoveNode)", () => {
    const doc = baseDoc();
    // Sposto a1 dopo a3 (ordine attuale [a1,a2,a3]) - trascinando a1 su "after a3".
    const target: DropTarget = { kind: "after", targetNodeId: "a3", parentNodeId: "containerA" };
    const command = buildStructuralMoveCommand(doc, "a1", target);
    // childrenIds SENZA a1: [a2,a3] - indice di a3 è 1, "after" -> 2.
    expect(command).toEqual({ type: "MOVE_NODE", nodeId: "a1", newParentId: "containerA", index: 2 });

    // Verifica end-to-end: eseguendo il comando, l'ordine finale è davvero [a2,a3,a1].
    const next = applyCommand(doc, command);
    const containerA = next.nodes.get("containerA");
    expect(containerA?.childrenIds).toEqual(["a2", "a3", "a1"]);
  });

  it("riordino nello stesso genitore verso 'before' il primo fratello riporta il nodo in testa", () => {
    const doc = baseDoc();
    // Sposto a3 prima di a1 (ordine attuale [a1,a2,a3]).
    const target: DropTarget = { kind: "before", targetNodeId: "a1", parentNodeId: "containerA" };
    const command = buildStructuralMoveCommand(doc, "a3", target);
    expect(command).toEqual({ type: "MOVE_NODE", nodeId: "a3", newParentId: "containerA", index: 0 });

    const next = applyCommand(doc, command);
    expect(next.nodes.get("containerA")?.childrenIds).toEqual(["a3", "a1", "a2"]);
  });

  it("fratello di riferimento non trovato (caso limite) -> nessun index, append in coda", () => {
    const doc = baseDoc();
    const target: DropTarget = { kind: "before", targetNodeId: "non-esiste-piu", parentNodeId: "containerA" };
    const command = buildStructuralMoveCommand(doc, "a1", target);
    expect(command).toEqual({ type: "MOVE_NODE", nodeId: "a1", newParentId: "containerA" });
  });
});
