import type { PageId } from "../document/types.js";
import type { BreakpointName } from "../resolver/types.js";
import type { Box } from "../layout/types.js";

/**
 * Parametri di esportazione (RFC-005: Document -> ResolvedModel -> IR).
 * Tutti e tre obbligatori ed espliciti (D-012): ciascuno cambia l'output
 * prodotto, quindi nessun default nascosto dentro l'Engine - un eventuale
 * default è una scelta del chiamante (consumer), non dell'Engine.
 */
export interface ExportContext {
  readonly breakpoint: BreakpointName;
  readonly pageId: PageId;
  readonly viewportWidth: number;
}

/**
 * IR (Intermediate Representation, RFC-005): "Box Tree + Meta". Il Box Tree
 * è esattamente il tipo Box già definito/testato in Fase 2, invariato. Meta
 * è minimale (D-012): solo i due dati senza i quali l'IR non sarebbe
 * distinguibile da un altro (quale pagina, quale breakpoint) - nessun campo
 * giustificato solo da un uso futuro ipotetico.
 */
export interface IR {
  readonly box: Box;
  readonly meta: {
    readonly pageId: PageId;
    readonly breakpoint: BreakpointName;
  };
}
