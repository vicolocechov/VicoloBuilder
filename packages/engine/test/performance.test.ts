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
  // NOTA 1 su warm-up. Cosa fa DAVVERO warmUp() (descrizione fedele al
  // codice sotto, non a un design precedente): 22 chiamate ad applyCommand
  // (20x CREATE_NODE nel loop + 1x UPDATE_PROPS + 1x DELETE_NODE) su un
  // documento PICCOLO che cresce da 0 a 22 nodi - NON su baseDocument (10.000
  // nodi). Il riscaldamento specifico sulla forma dati grande che viene
  // davvero misurata è demandato implicitamente alle prime ripetizioni del
  // ciclo di measureMedian() stesso (che chiama applyCommand su baseDocument
  // MEASURED_REPS volte, mediana inclusa): non esiste una funzione dedicata
  // di warm-up sul documento grande in questo file.
  //
  // Perché il warm-up esiste: la primissima chiamata di processo ad
  // applyCommand contro un documento da 10.000 nodi costa ~16-38ms, contro
  // ~5-8ms dalla seconda/terza chiamata in poi sulla stessa "forma" di dato -
  // misurato direttamente (script ad-hoc, non nel repo). La spiegazione più
  // plausibile è un costo di warm-up del motore V8 (spesso, in casi simili,
  // attribuito a compilazione JIT/inline cache "fredde" su un oggetto
  // grande) - ma è un'INFERENZA, non una causa isolata sperimentalmente:
  // l'esperimento fatto ha solo osservato che chiamate ripetute sulla stessa
  // forma di dato convergono monotonicamente verso un costo più basso: non
  // ho usato strumenti di isolamento (es. `--jitless`, `--trace-opt`,
  // `--trace-deopt`) che permetterebbero di escludere altre spiegazioni
  // altrettanto compatibili con lo stesso pattern osservato (effetti di
  // cache della CPU, promozione tra generazioni del garbage collector,
  // cambio di rappresentazione interna di una Map V8 di grandi dimensioni).
  // In una sessione reale l'utente ha già emesso migliaia di comandi prima
  // che il documento arrivi a 10.000 nodi, quindi qualunque sia la causa
  // esatta del costo "a freddo" essa è già stata pagata: questo test misura
  // quello scenario (stato stazionario di sessione), non la latenza a freddo
  // del primissimo comando dopo il caricamento di un documento grande da
  // disco - domanda aperta, non coperta da RFC-000 §6, eventualmente da
  // misurare a parte quando esisterà un vero path di "load" (Fase 3, CLI).
  //
  // Perché 20 iterazioni di warm-up e perché MEASURED_REPS=15: NESSUNA delle
  // due cifre è derivata da una misura specifica ("con 10 iterazioni fallisce,
  // con 20 no") - sono una scelta metodologica pragmatica (numeri tondi,
  // sufficienti a innescare la compilazione delle funzioni coinvolte prima
  // della misura), non un valore calibrato sui dati. La cifra effettivamente
  // verificata con misure ripetute è il RISULTATO (soglia 16ms rispettata in
  // 20+ esecuzioni consecutive della suite completa - vedi il changelog),
  // non i due parametri 20/15 in sé. Se in futuro emergesse flakiness, il
  // primo intervento ragionevole è aumentare MEASURED_REPS (la mediana
  // diventa più robusta con più campioni), non aggiungere altro codice di
  // warm-up non giustificato da una misura.
  //
  // NOTA 2 sulla mediana: una singola misura dopo il solo warm-up è risultata
  // occasionalmente flaky in questo ambiente sandboxato (misurato: fino a
  // ~21ms su singolo campione, causa jitter dello scheduler/worker thread di
  // vitest, non del codice - uno script Node standalone con lo stesso
  // identico warm-up è rimasto stabile sotto 8.3ms su 30 campioni). Si
  // misura quindi la MEDIANA di MEASURED_REPS campioni, robusta a un singolo
  // picco isolato - non un indebolimento della soglia, pratica standard per
  // benchmark rumorosi.
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
