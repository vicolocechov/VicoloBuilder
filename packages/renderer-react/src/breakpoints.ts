import type { BreakpointName } from "@vicolobuilder/engine";

/**
 * Ordine dei nomi di fascia, dal più stretto al più largo. Duplica solo
 * l'ORDINE dei nomi (non i `minWidth`) della lista interna dell'Engine
 * (`resolver/breakpoints.ts`, non pubblica per D-010) — necessario qui sia
 * per i pulsanti di cambio vista sia per il meccanismo di congelamento
 * (Blocco D, Opzione A). Se le fasce cambiano lato Engine (PRODUCT_DESIGN.md
 * sez. 8 prevede un'estensione futura a 5), questa costante va aggiornata in
 * corrispondenza — rischio di disallineamento noto, non risolto qui.
 */
export const TIER_ORDER: readonly BreakpointName[] = ["mobile", "tablet", "desktop"];

/** Fascia base (la più larga): dove vivono i props "diretti" di un nodo, letti come i valori Desktop (Decisione 1). */
export const BASE_TIER: BreakpointName = TIER_ORDER[TIER_ORDER.length - 1]!;

/** Fasce più larghe di `active`, in ordine crescente (la prima è la più vicina). */
export function widerTiers(active: BreakpointName): readonly BreakpointName[] {
  const index = TIER_ORDER.indexOf(active);
  if (index === -1) {
    throw new Error(`widerTiers: fascia sconosciuta "${active}". Fasce note: ${TIER_ORDER.join(", ")}.`);
  }
  return TIER_ORDER.slice(index + 1);
}
