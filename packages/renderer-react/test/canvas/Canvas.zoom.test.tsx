import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { applyCommand, createDocument, serializeDocument } from "@vicolobuilder/engine";
import type { Document } from "@vicolobuilder/engine";
import { Canvas } from "../../src/canvas/Canvas.js";
import { ReactiveHistory } from "../../src/history/ReactiveHistory.js";

/**
 * Blocco Z1 (Fit-to-screen/Zoom, fondamenta visive): vincolo esplicito
 * verificato qui, non solo rispettato - lo zoom è SOLO una trasformazione
 * di vista. Nessuna interazione con i controlli di zoom deve MAI eseguire
 * un comando su `store`: né `computeLayout`/`resolveDocument` (mai
 * chiamati con un parametro di zoom - non esiste nemmeno una firma che lo
 * accetti), né il Document stesso. Stesso principio dei test di
 * determinismo dell'Exporter (stesso input -> stesso output, confrontato
 * direttamente) - qui "stesso input" è il Document PRIMA di toccare lo
 * zoom, "stesso output" è il Document DOPO, a qualunque livello di zoom.
 *
 * Prima volta che `@testing-library/react` viene usata in questo pacchetto
 * (già una devDependency, mai usata finora - il resto della suite copre
 * solo moduli di logica pura, la verifica dei componenti è sempre stata
 * fatta in browser reale). Qui è lo strumento giusto: la domanda è "questo
 * componente esegue MAI `store.execute` interagendo con QUESTI controlli",
 * una domanda sul comportamento del componente, non sul rendering visivo
 * (quello resta verificato in browser, come sempre).
 */

afterEach(() => cleanup());

function buildTestDocument(): Document {
  let doc = createDocument({ rootPageId: "page-test", rootNodeId: "root" });
  doc = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "root", props: { layoutMode: "libero" } });
  doc = applyCommand(doc, {
    type: "CREATE_NODE",
    nodeId: "box-1",
    nodeType: "box",
    parentId: "root",
    props: { x: 20, y: 20, width: 100, height: 50, color: "#dbeafe" },
  });
  return doc;
}

describe("Canvas — lo zoom è PURAMENTE una trasformazione di vista (Blocco Z1)", () => {
  it("+, −, 100%, 'Adatta allo schermo' non eseguono MAI alcun comando: il Document resta lo STESSO riferimento", () => {
    const store = new ReactiveHistory(buildTestDocument());
    const documentBefore = store.getDocument();

    render(<Canvas store={store} pageId="page-test" />);

    fireEvent.click(screen.getByTitle("Aumenta zoom"));
    fireEvent.click(screen.getByTitle("Aumenta zoom"));
    fireEvent.click(screen.getByTitle("Riduci zoom"));
    fireEvent.click(screen.getByRole("button", { name: "Adatta allo schermo" }));
    fireEvent.click(screen.getByRole("button", { name: "100%" }));

    // Riferimento, non solo deep-equal: più forte - dimostra che NESSUN
    // `store.execute` è mai stato chiamato (un Document dell'Engine è
    // immutabile per costruzione, cambia riferimento SOLO quando un
    // comando viene eseguito).
    expect(store.getDocument()).toBe(documentBefore);
  });

  it("il JSON serializzato del Document è identico prima e dopo aver cambiato zoom (confronto diretto, stesso principio dei test di determinismo dell'Exporter)", () => {
    const store = new ReactiveHistory(buildTestDocument());
    const serializedBefore = serializeDocument(store.getDocument());

    render(<Canvas store={store} pageId="page-test" />);

    fireEvent.click(screen.getByTitle("Aumenta zoom"));
    fireEvent.click(screen.getByTitle("Aumenta zoom"));
    fireEvent.click(screen.getByTitle("Aumenta zoom"));

    const serializedAfter = serializeDocument(store.getDocument());
    expect(serializedAfter).toBe(serializedBefore);
  });

  it("i bottoni +/− raggiungono i limiti (25%/200%) e si disabilitano, senza mai toccare il Document", () => {
    const store = new ReactiveHistory(buildTestDocument());
    const documentBefore = store.getDocument();

    render(<Canvas store={store} pageId="page-test" />);

    // `.disabled` diretto, non un matcher `toBeDisabled()` - questo
    // pacchetto non ha `@testing-library/jest-dom` tra le devDependencies,
    // non introdotto solo per un singolo assert.
    const zoomOut = screen.getByTitle("Riduci zoom") as HTMLButtonElement;
    for (let i = 0; i < 10; i++) fireEvent.click(zoomOut);
    expect(zoomOut.disabled).toBe(true);

    const zoomIn = screen.getByTitle("Aumenta zoom") as HTMLButtonElement;
    for (let i = 0; i < 25; i++) fireEvent.click(zoomIn);
    expect(zoomIn.disabled).toBe(true);

    expect(store.getDocument()).toBe(documentBefore);
  });
});
