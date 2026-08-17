import { describe, expect, it } from "vitest";
import { computeResizedGeometry, resizeHandles } from "../../src/canvas/resizeGeometry.js";

const start = { x: 10, y: 20, width: 100, height: 50 };

describe("computeResizedGeometry", () => {
  it("est: allarga la larghezza, ancoraggio x invariato", () => {
    expect(computeResizedGeometry(start, { east: true }, 30, 0)).toEqual({ width: 130 });
  });

  it("ovest: riduce la larghezza E sposta x per tenere fermo il bordo destro", () => {
    // Trascinando il bordo ovest verso destra (dx positivo) di 30: larghezza -30, x +30.
    expect(computeResizedGeometry(start, { west: true }, 30, 0)).toEqual({ width: 70, x: 40 });
  });

  it("ovest: trascinato verso sinistra (dx negativo) allarga e sposta x indietro", () => {
    expect(computeResizedGeometry(start, { west: true }, -20, 0)).toEqual({ width: 120, x: -10 });
  });

  it("sud: allarga l'altezza, ancoraggio y invariato", () => {
    expect(computeResizedGeometry(start, { south: true }, 0, 15)).toEqual({ height: 65 });
  });

  it("nord: riduce l'altezza E sposta y per tenere fermo il bordo inferiore", () => {
    expect(computeResizedGeometry(start, { north: true }, 0, 15)).toEqual({ height: 35, y: 35 });
  });

  it("angolo sud-est: larghezza e altezza crescono insieme, nessun cambio di x/y (stesso comportamento della maniglia unica preesistente)", () => {
    expect(computeResizedGeometry(start, { south: true, east: true }, 30, 15)).toEqual({ width: 130, height: 65 });
  });

  it("angolo nord-ovest: entrambi gli assi si spostano, il bordo opposto (sud-est) resta fisso", () => {
    const result = computeResizedGeometry(start, { north: true, west: true }, 10, 5);
    expect(result).toEqual({ width: 90, x: 20, height: 45, y: 25 });
    // Verifica che il bordo opposto sia davvero rimasto fisso.
    expect(result.x! + result.width!).toBe(start.x + start.width);
    expect(result.y! + result.height!).toBe(start.y + start.height);
  });

  it("mai un box degenerato: la larghezza non scende mai sotto 1px anche con un delta enorme", () => {
    expect(computeResizedGeometry(start, { east: true }, -1000, 0).width).toBe(1);
    const westResult = computeResizedGeometry(start, { west: true }, 1000, 0);
    expect(westResult.width).toBe(1);
    // Il bordo destro resta comunque fisso anche quando la larghezza è stata bloccata a 1px.
    expect(westResult.x! + westResult.width!).toBe(start.x + start.width);
  });

  it("nessun asse attivo -> oggetto vuoto (nessuna chiave)", () => {
    expect(computeResizedGeometry(start, {}, 50, 50)).toEqual({});
  });
});

describe("resizeHandles", () => {
  it("un nodo in un genitore 'libero' (come la maniglia unica preesistente) ha tutte e 8 le maniglie visibili quando anche canResizeHeight è vero", () => {
    const handles = resizeHandles({ canMoveXY: true, canResizeWidth: true, canResizeHeight: true });
    expect(handles.filter((h) => h.visible).map((h) => h.key).sort()).toEqual(["e", "n", "ne", "nw", "s", "se", "sw", "w"]);
  });

  it("un figlio di un genitore 'pila' (canMoveXY/canResizeWidth false, canResizeHeight vero se foglia) ha SOLO la maniglia sud visibile", () => {
    const handles = resizeHandles({ canMoveXY: false, canResizeWidth: false, canResizeHeight: true });
    expect(handles.filter((h) => h.visible).map((h) => h.key)).toEqual(["s"]);
  });

  it("un contenitore non-foglia con modalità propria 'pila' dentro un genitore 'libero' (canResizeHeight falso) ha solo le maniglie orizzontali est/ovest", () => {
    const handles = resizeHandles({ canMoveXY: true, canResizeWidth: true, canResizeHeight: false });
    expect(handles.filter((h) => h.visible).map((h) => h.key).sort()).toEqual(["e", "w"]);
  });

  it("nessuna capacità -> nessuna maniglia visibile", () => {
    const handles = resizeHandles({ canMoveXY: false, canResizeWidth: false, canResizeHeight: false });
    expect(handles.every((h) => !h.visible)).toBe(true);
  });
});
