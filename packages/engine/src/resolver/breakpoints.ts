import type { Breakpoint, BreakpointName } from "./types.js";

/**
 * Lista fissa di breakpoint (decisione D-log Fase 2, punto C): nome +
 * larghezza minima in px, passata esplicitamente come ResolverContext.
 * Mai letta da window/DOM/media query (RFC-000 §2/§10) - nessuna
 * infrastruttura di registrazione/plugin (decisione B, rimandata).
 */
export const BREAKPOINTS: readonly Breakpoint[] = [
  { name: "mobile", minWidth: 0 },
  { name: "tablet", minWidth: 768 },
  { name: "desktop", minWidth: 1024 },
];

export function getBreakpoint(name: BreakpointName): Breakpoint {
  const breakpoint = BREAKPOINTS.find((b) => b.name === name);
  if (!breakpoint) {
    throw new Error(`Unknown breakpoint "${name}". Known breakpoints: ${BREAKPOINTS.map((b) => b.name).join(", ")}.`);
  }
  return breakpoint;
}

/**
 * Breakpoint applicabili in ordine "mobile-first" fino a `name` incluso
 * (stesso concetto di min-width CSS a cascata): usato per applicare gli
 * override responsive di un nodo in ordine crescente di minWidth, così i
 * breakpoint più larghi sovrascrivono quelli più stretti.
 */
export function cascadingBreakpoints(name: BreakpointName): readonly Breakpoint[] {
  const target = getBreakpoint(name);
  return BREAKPOINTS.filter((b) => b.minWidth <= target.minWidth).sort((a, b) => a.minWidth - b.minWidth);
}
