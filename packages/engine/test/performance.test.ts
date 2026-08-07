import { describe, expect, it } from "vitest";
import { createDocument } from "../src/document/document.js";
import { CURRENT_SCHEMA_VERSION, type Document, type DocumentNode } from "../src/document/types.js";
import { validateDocument } from "../src/document/invariants.js";
import { applyCommand, type Command } from "../src/runtime/commands.js";

// RFC-000 §6 budgeta operazioni singole a scala target (selezione<16ms,
// drag<30ms, undo<50ms, export preview<100ms, target 10.000 nodi) ma non
// nomina esplicitamente CREATE_NODE/UPDATE_PROPS/DELETE_NODE. Soglia scelta
// qui: 16ms (il piu' stretto dei quattro numeri RFC), applicata in modo
// uniforme a tutti e tre i comandi. Motivazione: (a) e' la scelta piu'
// conservativa in assenza di un numero esplicito per execute(); (b) copre
// anche l'analogia "drag<=30ms" per UPDATE_PROPS senza bisogno di una
// mappatura per-comando; (c) la MEDIANA misurata (vedi sotto) resta 5-6ms,
// >=2.6x di margine. Se il numero risulta sbagliato in pratica, è una
// singola costante da correggere qui, non una decisione sparsa nel codice.
const NODE_COUNT = 10_000;
const BUDGET_MS = 16;
const MEASURED_REPS = 15;

/**
 * Costruisce un Document valido da N nodi SENZA passare dal CommandBus.
 * Deliberato: qui misuriamo il costo di UN comando a scala N, non il costo
 * (già noto, O(n^2) cumulativo - vedi commenti in commands.ts) di costruire
 * N nodi via N comandi sequenziali, che è un problema diverso e già
 * documentato altrove. Il documento risultante viene comunque validato
 * esplicitamente prima dell'uso (vedi il primo `it` sotto).
 */
function buildFlatDocumentDirectly(n: number): Document {
  const nodes = new Map<string, DocumentNode>();
  const childrenIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `n${i}`;
    childrenIds.push(id);
    nodes.set(id, { id, type: "box", parentId: "root", childrenIds: [], props: {} });
  }
  nodes.set("root", { id: "root", type: "page-root", parentId: null, childrenIds, props: {} });

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    rootPageId: "page-home",
    nodes,
    pages: new Map([["page-home", { id: "page-home", name: "Home", rootNodeId: "root" }]]),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

describe(`performance budgets (RFC-000 §6) — execute() su un documento da ${NODE_COUNT} nodi`, () => {
  const baseDocument = buildFlatDocumentDirectly(NODE_COUNT);

  it("il documento-base condiviso dai tre test seguenti è invariant-valido prima di essere riusato", () => {
    expect(validateDocument(baseDocument)).toEqual([]);
  });

  // applyCommand non muta mai il suo input (verificato altrove in
  // commandBus.test.ts), quindi baseDocument può essere riusato senza
  // interferenze tra questi tre test indipendentemente dal loro ordine e
  // dal numero di volte in cui viene misurato.
  //
  // NOTA 1 su warm-up (scoperto scrivendo questo test, non nell'analisi
  // originale): la primissima chiamata di processo ad applyCommand contro un
  // documento da 10.000 nodi costa ~16-38ms (JIT/inline-cache "freddi" sulla
  // forma di una Map grande) - misurato direttamente. In una sessione reale
  // l'utente ha già emesso migliaia di comandi prima che il documento arrivi
  // a 10.000 nodi, quindi il JIT è già caldo: questo test misura quello
  // scenario (stato stazionario di sessione), non la latenza a freddo del
  // primissimo comando dopo il caricamento di un documento grande da disco -
  // domanda aperta, non coperta da RFC-000 §6, eventualmente da misurare a
  // parte quando esisterà un vero path di "load" (Fase 3, CLI).
  //
  // NOTA 2 sulla mediana (idem, scoperta implementando, non nell'analisi
  // originale): una singola misura dopo il solo warm-up resta occasionalmente
  // flaky in questo ambiente sandboxato (misurato: fino a ~21ms su singolo
  // campione, causa jitter dello scheduler/worker thread di vitest, non del
  // codice - uno script Node standalone con lo stesso identico warm-up resta
  // stabile sotto 8.3ms su 30 campioni). Si misura quindi la MEDIANA di
  // MEASURED_REPS campioni, robusta a un singolo picco isolato - non un
  // indebolimento della soglia, pratica standard per benchmark rumorosi.
  function warmUp(): void {
    let doc = createDocument({ rootNodeId: "root" });
    for (let i = 0; i < 20; i++) {
      doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: `warmup-${i}`, nodeType: "box", parentId: "root" });
    }
    applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "root", props: { warmup: true } });
    applyCommand(doc, { type: "DELETE_NODE", nodeId: "warmup-0" });
  }

  function measureMedian(makeCommand: (rep: number) => Command): number {
    warmUp();
    const timings: number[] = [];
    for (let rep = 0; rep < MEASURED_REPS; rep++) {
      const start = performance.now();
      applyCommand(baseDocument, makeCommand(rep));
      timings.push(performance.now() - start);
    }
    return median(timings);
  }

  it(`CREATE_NODE: mediana su ${MEASURED_REPS} ripetizioni resta sotto ${BUDGET_MS}ms`, () => {
    const m = measureMedian((rep) => ({ type: "CREATE_NODE", nodeId: `new-node-${rep}`, nodeType: "box", parentId: "root" }));
    expect(m).toBeLessThan(BUDGET_MS);
  });

  it(`UPDATE_PROPS: mediana su ${MEASURED_REPS} ripetizioni resta sotto ${BUDGET_MS}ms`, () => {
    const m = measureMedian((rep) => ({ type: "UPDATE_PROPS", nodeId: "root", props: { touched: rep } }));
    expect(m).toBeLessThan(BUDGET_MS);
  });

  it(`DELETE_NODE: mediana su ${MEASURED_REPS} ripetizioni resta sotto ${BUDGET_MS}ms`, () => {
    const m = measureMedian((rep) => ({ type: "DELETE_NODE", nodeId: `n${rep}` }));
    expect(m).toBeLessThan(BUDGET_MS);
  });
});
