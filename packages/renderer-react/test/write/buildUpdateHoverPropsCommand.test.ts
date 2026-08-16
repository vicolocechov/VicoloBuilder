import { describe, expect, it } from "vitest";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import { buildUpdateHoverPropsCommand } from "../../src/write/buildUpdateHoverPropsCommand.js";

function baseDoc() {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "link-1", nodeType: "link", parentId: "root" });
  return doc;
}

describe("buildUpdateHoverPropsCommand — chiavi non riconosciute", () => {
  it("lancia su una chiave fuori dall'elenco chiuso", () => {
    const doc = baseDoc();
    expect(() => buildUpdateHoverPropsCommand(doc, "link-1", { width: "100px" } as never)).toThrow();
  });

  it("il messaggio d'errore elenca le quattro chiavi ammesse", () => {
    const doc = baseDoc();
    expect(() => buildUpdateHoverPropsCommand(doc, "link-1", { width: "100px" } as never)).toThrow(
      /color.*background.*transform.*borderColor/i,
    );
  });

  it("lancia se changedProps è vuoto", () => {
    const doc = baseDoc();
    expect(() => buildUpdateHoverPropsCommand(doc, "link-1", {})).toThrow();
  });

  it("lancia se il nodo non esiste", () => {
    const doc = baseDoc();
    expect(() => buildUpdateHoverPropsCommand(doc, "ghost", { color: "red" })).toThrow();
  });
});

describe("buildUpdateHoverPropsCommand — scrittura", () => {
  it("costruisce UPDATE_PROPS con hover come chiave, nessuna cascata per fascia (nessun 'responsive' coinvolto)", () => {
    const doc = baseDoc();
    const command = buildUpdateHoverPropsCommand(doc, "link-1", { color: "red" });
    expect(command).toEqual({ type: "UPDATE_PROPS", nodeId: "link-1", props: { hover: { color: "red" } } });
  });

  it("aggiunge una chiave a un hover esistente senza perdere le altre già presenti", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, buildUpdateHoverPropsCommand(doc, "link-1", { color: "red" }));
    const command = buildUpdateHoverPropsCommand(doc, "link-1", { transform: "translateY(-6px)" });
    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "link-1",
      props: { hover: { color: "red", transform: "translateY(-6px)" } },
    });
  });

  it("sovrascrive una chiave hover già presente, lasciando intatte le altre", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, buildUpdateHoverPropsCommand(doc, "link-1", { color: "red", background: "blue" }));
    const command = buildUpdateHoverPropsCommand(doc, "link-1", { color: "green" });
    expect(command).toEqual({
      type: "UPDATE_PROPS",
      nodeId: "link-1",
      props: { hover: { color: "green", background: "blue" } },
    });
  });

  it("scrive sui props base indipendentemente dalla fascia (props.hover non prende activeBreakpoint in input)", () => {
    const doc = baseDoc();
    const command = buildUpdateHoverPropsCommand(doc, "link-1", { borderColor: "#000" });
    expect(command.props).not.toHaveProperty("responsive");
  });
});
