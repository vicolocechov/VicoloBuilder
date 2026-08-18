import { describe, expect, it } from "vitest";
import { fieldLabel, frozenStateLabel } from "../../src/panel/fieldLabels.js";

// Blocco 6 (rifinitura UI/UX, Punto 4 dell'audit): ogni etichetta di campo
// nel PropertyPanel era il nome camelCase grezzo della proprietà - questi
// test coprono solo la mappatura pura (il rendering reale è verificato in
// browser, stesso principio già seguito per Outline/ElementPalette: nessun
// test di componente React in questo pacchetto).
describe("fieldLabel", () => {
  it("traduce le chiavi tecniche note in etichette italiane", () => {
    expect(fieldLabel("x")).toBe("Posizione orizzontale (X)");
    expect(fieldLabel("borderWidth")).toBe("Spessore bordo");
    expect(fieldLabel("layoutMode")).toBe("Disposizione dei figli");
  });

  it("ricade sulla chiave stessa per una chiave non mappata (nessun errore silenzioso)", () => {
    expect(fieldLabel("chiave-inesistente")).toBe("chiave-inesistente");
  });
});

describe("frozenStateLabel", () => {
  it("traduce i due valori di FrozenFieldState in italiano", () => {
    expect(frozenStateLabel("inherited")).toBe("ereditato da una vista più larga");
    expect(frozenStateLabel("overridden-here")).toBe("impostato per questa vista");
  });
});
