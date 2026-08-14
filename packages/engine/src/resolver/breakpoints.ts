import type { Breakpoint, BreakpointName } from "./types.js";

/**
 * Fase 6 (DECISIONS.md, D-019) — 7 fasce nominate, sostituiscono le 3
 * lineari di Fase 2 (rottura esplicita e approvata, non una convivenza:
 * vedi il bump di CURRENT_SCHEMA_VERSION in document/types.ts). Soglie e
 * predicati presi dai 7 dati reali verificati nell'audit del sito Vicolo
 * Cechov (righe 62-69 del sorgente HTML) - non inventati, non stimati.
 *
 * Ogni fascia è un nome opaco (Breakpoint) con un predicato descrittivo
 * proprio - mai valutato contro un viewport reale qui (nessun consumer
 * esistente ne ha bisogno, vedi resolver/types.ts). "desktop" è
 * `BASE_BREAKPOINT`: dove vivono i props diretti di un nodo (convenzione
 * Desktop-first, invariata).
 */
export const BREAKPOINTS: readonly Breakpoint[] = [
  { name: "mobile-verticale", maxWidth: 767, orientation: "portrait" },
  { name: "mobile-orizzontale", orientation: "landscape", maxHeight: 550 },
  { name: "tablet-verticale", minWidth: 768, maxWidth: 1024, orientation: "portrait" },
  { name: "tablet-orizzontale", minWidth: 768, maxWidth: 1199, orientation: "landscape", minHeight: 551 },
  { name: "laptop-compatto", minWidth: 1025, maxWidth: 1199 },
  { name: "desktop-compatto", minWidth: 1200, maxWidth: 1399 },
  { name: "desktop", minWidth: 1200 },
];

export const BASE_BREAKPOINT: BreakpointName = "desktop";

/**
 * Ordine di cascata, CURATO A MANO (Fase 6, Punto 2 dell'analisi delle
 * fondamenta) - non derivato da una formula su minWidth/orientation/height,
 * perché una formula generica produce almeno un caso sbagliato (verificato
 * nell'analisi: "un override lasciato solo su una fascia stretta senza
 * vincolo di orientamento propagato verso una fascia larga senza vincolo
 * di orientamento" darebbe un risultato accettabile con una formula
 * ingenua, ma "un override lasciato su una fascia stretta CON vincolo di
 * orientamento propagato verso una fascia larga SENZA vincolo di
 * orientamento" no - un override pensato per un telefono in verticale non
 * deve propagarsi a un monitor desktop solo perché desktop "non esclude"
 * il verticale).
 *
 * Regola applicata, verificata voce per voce (non assunta):
 * - le due catene mobile→tablet nella STESSA diramazione di orientamento
 *   (verticale: mobile-verticale→tablet-verticale; orizzontale:
 *   mobile-orizzontale→tablet-orizzontale) cascatano, stessa logica
 *   mobile-first già in uso da Fase 2, ristretta alla propria diramazione;
 * - le fasce senza vincolo di orientamento (laptop-compatto,
 *   desktop-compatto, desktop) sono bende INDIPENDENTI l'una dall'altra e
 *   da qualunque fascia con vincolo di orientamento - nessuna delle due
 *   eredita dall'altra, ciascuna eredita solo dalla base (props diretti,
 *   sempre applicati per prima da `applyBreakpointOverrides`, indipendente
 *   da questa tabella).
 *
 * Ogni voce è la lista, in ordine crescente di priorità (l'ultima vince),
 * delle fasce che si applicano quando si risolve QUELLA fascia.
 */
const CASCADE_ORDER: Readonly<Record<BreakpointName, readonly BreakpointName[]>> = {
  "mobile-verticale": ["mobile-verticale"],
  "tablet-verticale": ["mobile-verticale", "tablet-verticale"],
  "mobile-orizzontale": ["mobile-orizzontale"],
  "tablet-orizzontale": ["mobile-orizzontale", "tablet-orizzontale"],
  "laptop-compatto": ["laptop-compatto"],
  "desktop-compatto": ["desktop-compatto"],
  desktop: ["desktop"],
};

export function getBreakpoint(name: BreakpointName): Breakpoint {
  const breakpoint = BREAKPOINTS.find((b) => b.name === name);
  if (!breakpoint) {
    throw new Error(`Unknown breakpoint "${name}". Known breakpoints: ${BREAKPOINTS.map((b) => b.name).join(", ")}.`);
  }
  return breakpoint;
}

/** Nomi di fascia validi, nell'ordine dichiarato in BREAKPOINTS (dalla più stretta di ciascuna diramazione alla base). */
export function listBreakpointNames(): readonly BreakpointName[] {
  return BREAKPOINTS.map((b) => b.name);
}

/**
 * Fasce applicabili, in ordine di cascata, quando si risolve `name`
 * (l'ultima della lista è `name` stesso e vince in caso di conflitto).
 * Sostituisce l'ordinamento per `minWidth` crescente di Fase 2 (non più
 * valido con fasce non totalmente ordinabili - vedi CASCADE_ORDER sopra).
 */
export function cascadingBreakpoints(name: BreakpointName): readonly Breakpoint[] {
  getBreakpoint(name); // valida il nome, lancia se sconosciuto
  const order = CASCADE_ORDER[name];
  if (!order) {
    throw new Error(`cascadingBreakpoints: nessun ordine di cascata definito per "${name}".`);
  }
  return order.map((n) => getBreakpoint(n));
}

/**
 * Inverso di CASCADE_ORDER: le fasce in cui l'override di `name` si
 * propaga (usato dal congelamento Desktop-first nel Renderer, D-018/D-019
 * - non più derivabile da un semplice slice di array come in Fase 2, dato
 * che l'ordine non è più totale). Basta restituire i vicini DIRETTI (un
 * solo passo): una fascia ancora più larga che include uno di questi
 * vicini nella propria cascata riceve comunque il valore congelato
 * correttamente durante la propria risoluzione, per costruzione - non
 * serve risalire la catena qui (dimostrato nell'analisi delle fondamenta
 * di Fase 6, verificato dai test).
 */
export function widerBreakpoints(name: BreakpointName): readonly BreakpointName[] {
  getBreakpoint(name); // valida il nome, lancia se sconosciuto
  const wider: BreakpointName[] = [];
  for (const [target, order] of Object.entries(CASCADE_ORDER)) {
    if (target !== name && order.includes(name)) wider.push(target);
  }
  return wider;
}
