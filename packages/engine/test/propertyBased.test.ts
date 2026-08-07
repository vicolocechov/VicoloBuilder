import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDocument } from "../src/document/document.js";
import { hashDocument, serializeDocument } from "../src/document/hash.js";
import { validateDocument } from "../src/document/invariants.js";
import { History } from "../src/runtime/history.js";
import type { Command } from "../src/runtime/commands.js";

// Seed fisso: ogni esecuzione (locale o CI) percorre esattamente la stessa
// sequenza pseudo-casuale, quindi un fallimento è riproducibile deterministicamente
// invece di essere un flake intermittente. Se questo test fallisce, fast-check
// stampa comunque il seed usato e il controesempio minimizzato nel messaggio
// di errore — utile se in futuro si vuole indagare con un seed diverso.
const FIXED_SEED = 424242;

// 500 run in locale, 250 in CI (i runner CI condivisi sono più lenti e più
// rumorosi; 250 run di sequenze fino a 40 comandi su documenti piccoli
// restano comunque nell'ordine dei millisecondi complessivi).
const NUM_RUNS = process.env.CI ? 250 : 500;

// Ogni "step" è pura casualità fornita da fast-check (nessun Math.random()
// nel corpo della property: la riproducibilità dipende dal seed sopra).
// La traduzione in un Command concreto e valido avviene dentro la property,
// usando lo stato REALE del documento a quel punto della sequenza — così
// fast-check non deve conoscere i vincoli del dominio (parent esistente,
// non cancellare la root, ecc.), li rispetta sempre chi genera il comando.
const stepArbitrary = fc.record({
  action: fc.integer({ min: 0, max: 2 }), // 0=CREATE 1=UPDATE 2=DELETE
  pick: fc.nat({ max: 1_000_000 }), // ridotto modulo la lunghezza corrente per scegliere un nodo esistente
  nodeType: fc.constantFrom("box", "text"),
  propKey: fc.constantFrom("color", "content", "size", "visible", "background"),
  propValue: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
});

const sequenceArbitrary = fc.array(stepArbitrary, { minLength: 1, maxLength: 40 });

function pickAt<T>(items: readonly T[], pick: number): T {
  return items[pick % items.length] as T;
}

describe("property-based: sequenze casuali di comandi (Priorità 2)", () => {
  it(`preserva gli invarianti dopo ogni comando e il round-trip undo/redo, su ${NUM_RUNS} sequenze casuali (seed=${FIXED_SEED})`, () => {
    fc.assert(
      fc.property(sequenceArbitrary, (steps) => {
        const history = new History(createDocument({ rootNodeId: "root" }));
        const initialHash = hashDocument(history.document);
        const initialSerialized = serializeDocument(history.document);

        let nextId = 0;
        let applied = 0;

        for (const step of steps) {
          const existingIds = [...history.document.nodes.keys()];
          const nonRootIds = existingIds.filter((id) => history.document.nodes.get(id)!.parentId !== null);

          let command: Command;
          if (step.action === 2 && nonRootIds.length > 0) {
            command = { type: "DELETE_NODE", nodeId: pickAt(nonRootIds, step.pick) };
          } else if (step.action === 1 && existingIds.length > 0) {
            command = {
              type: "UPDATE_PROPS",
              nodeId: pickAt(existingIds, step.pick),
              props: { [step.propKey]: step.propValue },
            };
          } else {
            // action === 0, oppure fallback quando DELETE/UPDATE non hanno un target valido
            command = {
              type: "CREATE_NODE",
              nodeId: `p${nextId++}`,
              nodeType: step.nodeType,
              parentId: pickAt(existingIds, step.pick),
              props: { [step.propKey]: step.propValue },
            };
          }

          history.execute(command); // se un comando "costruito valido" lancia, è un bug reale
          applied += 1;
          expect(validateDocument(history.document)).toEqual([]);
        }

        const hashAfterCommands = hashDocument(history.document);
        const serializedAfterCommands = serializeDocument(history.document);

        // Undo completo: N undo dopo N comandi deve riportare ESATTAMENTE
        // allo stato iniziale (deep equality via serializzazione + hash).
        for (let i = 0; i < applied; i++) history.undo();

        // Se questo confronto fallisse, prima verificare (come richiesto)
        // che non sia un artefatto di serializzazione instabile: hash.test.ts
        // copre già ordine-Map/ordine-props indipendentemente da questo test,
        // quindi un fallimento qui con hash.test.ts verde punterebbe a un
        // bug reale in applyCommand/History, non nella serializzazione.
        expect(serializeDocument(history.document)).toBe(initialSerialized);
        expect(hashDocument(history.document)).toBe(initialHash);
        expect(validateDocument(history.document)).toEqual([]);

        // Redo completo: N redo dopo gli N undo deve riportare ESATTAMENTE
        // allo stato immediatamente precedente agli undo.
        for (let i = 0; i < applied; i++) history.redo();

        expect(serializeDocument(history.document)).toBe(serializedAfterCommands);
        expect(hashDocument(history.document)).toBe(hashAfterCommands);
        expect(validateDocument(history.document)).toEqual([]);
      }),
      { seed: FIXED_SEED, numRuns: NUM_RUNS },
    );
  });
});
