import { listBreakpointNames, BASE_BREAKPOINT } from "@vicolobuilder/engine";
import type { Breakpoint, BreakpointName } from "@vicolobuilder/engine";

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

/**
 * Blocco 6 (rifinitura UI/UX, Punto 6 dell'audit): i bottoni fascia
 * mostravano solo il nome (es. "mobile-orizzontale"), senza alcuna
 * indicazione della dimensione reale - verificato in browser che nessuno
 * ha un `title`. Le fasce NON sono tutte definite da una larghezza (tre
 * non hanno alcun vincolo di orientamento, alcune sono definite da
 * altezza+orientamento, non da larghezza - vedi engine/resolver/
 * breakpoints.ts) - un singolo numero "rappresentativo" inventato per
 * ognuna sarebbe fuorviante per quelle senza vincolo di larghezza.
 * Derivato SEMPRE dal predicato reale della fascia (`Breakpoint`, unica
 * fonte), mai un numero duplicato/mantenuto a mano qui.
 */
export function describeBreakpoint(bp: Breakpoint): string {
  const parts: string[] = [];
  if (bp.minWidth !== undefined && bp.maxWidth !== undefined) {
    parts.push(`${bp.minWidth}–${bp.maxWidth}px`);
  } else if (bp.maxWidth !== undefined) {
    parts.push(`fino a ${bp.maxWidth}px`);
  } else if (bp.minWidth !== undefined) {
    parts.push(`da ${bp.minWidth}px`);
  }
  if (bp.orientation) {
    parts.push(bp.orientation === "portrait" ? "verticale" : "orizzontale");
  }
  if (bp.minHeight !== undefined && bp.maxHeight !== undefined) {
    parts.push(`altezza ${bp.minHeight}–${bp.maxHeight}px`);
  } else if (bp.maxHeight !== undefined) {
    parts.push(`altezza fino a ${bp.maxHeight}px`);
  } else if (bp.minHeight !== undefined) {
    parts.push(`altezza da ${bp.minHeight}px`);
  }
  return parts.length > 0 ? parts.join(", ") : "nessun vincolo";
}
