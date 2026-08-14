import { describe, expect, it } from "vitest";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import { initialPosition, navigatePage, navigateScene } from "../../src/preview/navigation.js";

function docWithScenes() {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s2", nodeType: "scene", parentId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s3", nodeType: "scene", parentId: "root" });
  return doc;
}

describe("initialPosition", () => {
  it("scena 0 per la pagina data", () => {
    expect(initialPosition("page-home")).toEqual({ pageId: "page-home", sceneIndex: 0 });
  });
});

describe("navigateScene", () => {
  it("avanza di una scena", () => {
    const doc = docWithScenes();
    const pos = initialPosition("page-home");
    expect(navigateScene(doc, pos, 1)).toEqual({ pageId: "page-home", sceneIndex: 1 });
  });

  it("clampato al confine superiore, nessun wrap (Punto 5/9 dell'analisi)", () => {
    const doc = docWithScenes();
    const pos = { pageId: "page-home", sceneIndex: 2 };
    expect(navigateScene(doc, pos, 1)).toBe(pos); // stesso riferimento: nessun cambiamento
  });

  it("clampato al confine inferiore, nessun wrap", () => {
    const doc = docWithScenes();
    const pos = initialPosition("page-home");
    expect(navigateScene(doc, pos, -1)).toBe(pos);
  });

  it("pagina senza scene -> nessun effetto", () => {
    const doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    const pos = initialPosition("page-home");
    expect(navigateScene(doc, pos, 1)).toBe(pos);
  });
});

describe("navigatePage", () => {
  it("avanza alla pagina successiva in pageOrder, resettando sceneIndex a 0", () => {
    let doc = docWithScenes();
    doc = applyCommand(doc, { type: "CREATE_PAGE", pageId: "page-2", name: "Seconda", rootNodeId: "root-2" });
    const pos = { pageId: "page-home", sceneIndex: 2 };
    expect(navigatePage(doc, pos, 1)).toEqual({ pageId: "page-2", sceneIndex: 0 });
  });

  it("clampato al confine, nessun wrap: un'unica pagina non cambia mai posizione", () => {
    const doc = docWithScenes();
    const pos = initialPosition("page-home");
    expect(navigatePage(doc, pos, 1)).toBe(pos);
    expect(navigatePage(doc, pos, -1)).toBe(pos);
  });

  it("pageId sconosciuto (fuori da pageOrder) -> nessun effetto", () => {
    const doc = docWithScenes();
    const pos = { pageId: "non-esiste", sceneIndex: 0 };
    expect(navigatePage(doc, pos, 1)).toBe(pos);
  });
});
