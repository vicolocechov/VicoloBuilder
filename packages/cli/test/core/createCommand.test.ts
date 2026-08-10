import { describe, expect, it } from "vitest";
import { createDocument, serializeDocument } from "@vicolobuilder/engine";
import { runCreate } from "../../src/core/createCommand.js";

describe("runCreate — core puro di `builder create`", () => {
  it("produce lo stesso output di createDocument()+serializeDocument() chiamati direttamente (riga #1/#9 matrice Fase 3: nessuna logica di dominio duplicata nel CLI)", () => {
    expect(runCreate()).toBe(serializeDocument(createDocument()));
  });

  it("è deterministico: due chiamate consecutive producono la stessa stringa (riga #7 matrice Fase 3)", () => {
    expect(runCreate()).toBe(runCreate());
  });
});
