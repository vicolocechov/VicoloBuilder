import type { BreakpointName, DocumentNode } from "@vicolobuilder/engine";
import { BASE_TIER } from "../breakpoints.js";
import type { GeometryKey } from "../write/buildUpdatePropsCommand.js";

/**
 * Indicatore ereditato/overridato (Decisione 5, PRODUCT_DESIGN.md sez. 6) -
 * SOLO per la geometria, come richiesto.
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
export type GeometryFieldState = "inherited" | "overridden-here";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function geometryFieldState(
  node: DocumentNode,
  activeBreakpoint: BreakpointName,
  key: GeometryKey,
): GeometryFieldState {
  // Alla fascia base non esiste "ereditato da una fascia più larga" (è la
  // più larga): il valore è sempre "proprio" del nodo.
  if (activeBreakpoint === BASE_TIER) return "overridden-here";

  const responsive = node.props.responsive;
  const tierOverride = isPlainObject(responsive) && isPlainObject(responsive[activeBreakpoint])
    ? responsive[activeBreakpoint]
    : undefined;

  return tierOverride?.[key] !== undefined ? "overridden-here" : "inherited";
}
