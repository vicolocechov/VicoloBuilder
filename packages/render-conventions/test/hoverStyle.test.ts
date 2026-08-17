import { describe, expect, it } from "vitest";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import { readHoverStyles } from "../src/hoverStyle.js";

function baseDoc() {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "link-1", nodeType: "link", parentId: "root" });
  return doc;
}

describe("readHoverStyles", () => {
  it("nessun nodo con hover -> mappa vuota", () => {
    expect(readHoverStyles(baseDoc())).toEqual(new Map());
  });

  it("legge props.hover di un nodo dopo UPDATE_PROPS", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "link-1", props: { hover: { color: "red", transform: "translateY(-6px)" } } });
    expect(readHoverStyles(doc)).toEqual(new Map([["link-1", { color: "red", transform: "translateY(-6px)" }]]));
  });

  it("scarta un nodo con props.hover vuoto ({})", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "link-1", props: { hover: {} } });
    expect(readHoverStyles(doc)).toEqual(new Map());
  });

  it("scarta un nodo la cui props.hover ha una forma inattesa (chiave non riconosciuta o valore non stringa)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "link-1", props: { hover: { width: 100 } } });
    expect(readHoverStyles(doc)).toEqual(new Map());

    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "link-1", props: { hover: { color: 42 } } });
    expect(readHoverStyles(doc)).toEqual(new Map());
  });

  it("scarta un nodo la cui props.hover non è un oggetto (es. un array o una stringa)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "link-1", props: { hover: "non-un-oggetto" } });
    expect(readHoverStyles(doc)).toEqual(new Map());
  });

  it("include solo i nodi con hover valido tra più nodi", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "link-2", nodeType: "link", parentId: "root" });
    doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "link-1", props: { hover: { color: "red" } } });
    expect(readHoverStyles(doc)).toEqual(new Map([["link-1", { color: "red" }]]));
  });
});
