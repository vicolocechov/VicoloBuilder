import { describe, expect, it } from "vitest";
import { getBreakpoint } from "@vicolobuilder/engine";
import { describeBreakpoint } from "../src/breakpoints.js";

// Blocco 6 (rifinitura UI/UX, Punto 6 dell'audit): i bottoni fascia
// mostravano solo il nome, senza alcuna indicazione della dimensione
// reale. `describeBreakpoint` deriva SEMPRE dal predicato reale della
// fascia (`getBreakpoint`, engine/resolver/breakpoints.ts) - questi test
// verificano la formattazione per ciascuna delle 7 combinazioni reali di
// vincoli (non tutte le fasce hanno un vincolo di larghezza).
describe("describeBreakpoint", () => {
  it("mobile-verticale: solo maxWidth + orientamento verticale", () => {
    expect(describeBreakpoint(getBreakpoint("mobile-verticale"))).toBe("fino a 767px, verticale");
  });

  it("mobile-orizzontale: nessun vincolo di larghezza, solo orientamento + altezza massima", () => {
    expect(describeBreakpoint(getBreakpoint("mobile-orizzontale"))).toBe("orizzontale, altezza fino a 550px");
  });

  it("tablet-verticale: min+maxWidth + orientamento verticale", () => {
    expect(describeBreakpoint(getBreakpoint("tablet-verticale"))).toBe("768–1024px, verticale");
  });

  it("tablet-orizzontale: min+maxWidth + orientamento + altezza minima", () => {
    expect(describeBreakpoint(getBreakpoint("tablet-orizzontale"))).toBe("768–1199px, orizzontale, altezza da 551px");
  });

  it("laptop-compatto: solo min+maxWidth, nessun vincolo di orientamento/altezza", () => {
    expect(describeBreakpoint(getBreakpoint("laptop-compatto"))).toBe("1025–1199px");
  });

  it("desktop-compatto: solo min+maxWidth", () => {
    expect(describeBreakpoint(getBreakpoint("desktop-compatto"))).toBe("1200–1399px");
  });

  it("desktop: solo minWidth (fascia base, nessun limite superiore)", () => {
    expect(describeBreakpoint(getBreakpoint("desktop"))).toBe("da 1200px");
  });

  it("nessun vincolo dichiarato -> messaggio esplicito, non una stringa vuota", () => {
    expect(describeBreakpoint({ name: "qualunque" })).toBe("nessun vincolo");
  });
});
