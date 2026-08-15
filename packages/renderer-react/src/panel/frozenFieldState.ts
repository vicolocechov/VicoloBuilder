import type { BreakpointName, DocumentNode } from "@vicolobuilder/engine";
import { BASE_TIER } from "../breakpoints.js";
import type { GeometryKey, StyleKey } from "../write/buildUpdatePropsCommand.js";

/**
 * Indicatore ereditato/overridato (Decisione 5, PRODUCT_DESIGN.md sez. 6) -
 * per qualunque chiave "congelabile" (geometria O stile, Fase S1 - stesso
 * comportamento di congelamento in `buildUpdatePropsCommand.ts`, quindi
 * stesso indicatore). Rinominato da `geometryFieldState` (era limitato a
 * `GeometryKey`) quando `STYLE_KEYS` è stata introdotta come terza
 * categoria: chiamarlo ancora "geometry" sarebbe stato fuorviante per un
 * campo come `columns`, che non è geometria del box. Non copre le chiavi di
 * CONTENUTO (`text`/`color`): quelle scrivono sempre sulla base
 * indipendentemente dalla fascia (D-018), un indicatore "ereditato/
 * overridden per fascia" non avrebbe senso per loro.
 *
 * Stati implementati QUI: 2 su 3 di quelli richiesti. Il Document non porta
 * alcuna informazione di provenienza per un valore dentro
 * `props.responsive.<fascia>` - un override scritto a mano dall'utente e un
 * override scritto dal congelamento automatico (Opzione A) hanno
 * ESATTAMENTE la stessa forma nei dati, non sono distinguibili leggendo
 * solo il Document. Distinguerli richiederebbe una delle due strade,
 * nessuna delle due decisa qui, segnalate al proprietario del prodotto
 * prima di sceglierne una:
 * (a) cambiare la forma di `props.responsive` per portare un flag di
 *     provenienza (tocca l'Engine, il resolver dovrebbe "spacchettare" il
 *     flag prima di leggere il valore - non additivo in modo ovvio);
 * (b) tenere la provenienza SOLO in memoria locale di renderer-react per la
 *     sessione corrente (non sopravvive a un ricaricamento/persistenza) -
 *     ma è a sua volta uno stato "nascosto" fuori da Document/History, in
 *     tensione con RFC-000 §1.
 * Fino a una decisione, questo modulo restituisce solo "inherited" /
 * "overridden-here" (senza distinguere automatico da esplicito dentro
 * "overridden-here").
 */
export type FrozenFieldState = "inherited" | "overridden-here";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function frozenFieldState(
  node: DocumentNode,
  activeBreakpoint: BreakpointName,
  key: GeometryKey | StyleKey,
): FrozenFieldState {
  // Alla fascia base non esiste "ereditato da una fascia più larga" (è la
  // più larga): il valore è sempre "proprio" del nodo.
  if (activeBreakpoint === BASE_TIER) return "overridden-here";

  const responsive = node.props.responsive;
  const tierOverride = isPlainObject(responsive) && isPlainObject(responsive[activeBreakpoint])
    ? responsive[activeBreakpoint]
    : undefined;

  return tierOverride?.[key] !== undefined ? "overridden-here" : "inherited";
}
