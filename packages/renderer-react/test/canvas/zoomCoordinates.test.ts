import { describe, expect, it } from "vitest";
import { screenPointToDocument } from "../../src/canvas/zoomCoordinates.js";

// Blocco Z2 (Fit-to-screen/Zoom): conversione screen->documento per il
// gesto drag-and-drop strutturale (unico consumatore basato su `rect`).
describe("screenPointToDocument", () => {
  it("a zoom 100% (1) è una pura traslazione (nessuna scala)", () => {
    expect(screenPointToDocument(150, 220, { left: 50, top: 20 }, 1)).toEqual({ x: 100, y: 200 });
  });

  it("a zoom 50% (0.5), lo stesso punto SCHERMO corrisponde al DOPPIO in coordinate documento", () => {
    expect(screenPointToDocument(150, 220, { left: 50, top: 20 }, 0.5)).toEqual({ x: 200, y: 400 });
  });

  it("a zoom 150%, lo stesso punto schermo corrisponde a coordinate documento più piccole (2/3)", () => {
    const result = screenPointToDocument(200, 320, { left: 50, top: 20 }, 1.5);
    expect(result.x).toBeCloseTo(100, 10);
    expect(result.y).toBeCloseTo(200, 10);
  });

  it("l'origine (left/top del rect renderizzato) viene sempre sottratta PRIMA della scala, mai dopo", () => {
    // Se la divisione avvenisse prima della sottrazione il risultato sarebbe diverso - qui
    // verificato esplicitamente con un'origine non nulla e uno zoom non-unitario insieme.
    expect(screenPointToDocument(110, 70, { left: 10, top: 10 }, 2)).toEqual({ x: 50, y: 30 });
  });

  // Richiesto esplicitamente (approvazione Blocco Z2): un gesto FISICO
  // proporzionale (stesso spostamento in coordinate DOCUMENTO) deve
  // produrre lo stesso delta a qualunque livello di zoom - verificato qui
  // a livello di formula pura, complementare alla verifica end-to-end in
  // browser reale (jsdom non implementa una vera geometria scalata, quindi
  // non può sostituirla, solo affiancarla).
  it("un gesto fisico proporzionale produce lo STESSO delta documento a zoom 100%/50%/150%", () => {
    const origin = { left: 0, top: 0 };
    const startDoc = { x: 300, y: 150 };
    const deltaDoc = { x: 40, y: 20 };

    for (const zoom of [1, 0.5, 1.5]) {
      // Il punto SCHERMO corrispondente a una coordinata documento nota, a
      // QUESTO zoom, è documento*zoom (stessa relazione che la radice del
      // Canvas usa per rendersi: `transform: scale(zoom)`, origine 0,0).
      const startScreen = { x: startDoc.x * zoom, y: startDoc.y * zoom };
      const endScreen = { x: (startDoc.x + deltaDoc.x) * zoom, y: (startDoc.y + deltaDoc.y) * zoom };

      const start = screenPointToDocument(startScreen.x, startScreen.y, origin, zoom);
      const end = screenPointToDocument(endScreen.x, endScreen.y, origin, zoom);

      expect(end.x - start.x).toBeCloseTo(deltaDoc.x, 10);
      expect(end.y - start.y).toBeCloseTo(deltaDoc.y, 10);
    }
  });
});
