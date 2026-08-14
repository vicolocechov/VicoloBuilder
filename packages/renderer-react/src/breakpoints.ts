import { listBreakpointNames, BASE_BREAKPOINT } from "@vicolobuilder/engine";
import type { BreakpointName } from "@vicolobuilder/engine";

/**
 * Fase 6 (D-019): le 7 fasce nominate e la relazione "più larga" vivono
 * ora nell'Engine (superficie pubblica minima aggiunta apposta - vedi
 * index.ts dell'Engine) - questo file resta solo per non dover cambiare
 * ogni punto di importazione in renderer-react, non duplica più nulla
 * (a differenza della versione Fase 5, che duplicava l'ordine dei nomi
 * localmente - rischio già segnalato allora, risolto qui).
 */
export const TIER_NAMES: readonly BreakpointName[] = listBreakpointNames();
export const BASE_TIER: BreakpointName = BASE_BREAKPOINT;
