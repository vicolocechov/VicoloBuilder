import type { NodeId } from "../document/types.js";

/**
 * RFC-004: "Layout produce Box Tree ({x,y,width,height,children}), mai CSS
 * diretto." `nodeId` è un'aggiunta rispetto alla forma letterale della RFC:
 * senza un riferimento al nodo sorgente il Box Tree non sarebbe utilizzabile
 * da un consumer (Fase 5) per sapere quale contenuto/interazione disegnare
 * in ciascun box. Dettaglio tecnico, non un cambiamento di RFC-004.
 */
export interface Box {
  readonly nodeId: NodeId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly children: readonly Box[];
  /**
   * Modalità con cui QUESTO nodo dispone i propri figli (Fase 5, Blocco B -
   * Decisione 1B): "pila" (stack verticale, comportamento storico, default
   * se assente) oppure "libero" (posizionamento libero dei figli via
   * offset locali). Opzionale: verificato additivo prima dell'implementazione
   * (nessun test esistente confronta la forma esatta di un Box con
   * `toStrictEqual`/`toEqual` contro un letterale scritto a mano senza
   * questo campo - vedi DECISIONS.md). Consumato da layout/invariants.ts
   * per decidere se CHILD_OUT_OF_BOUNDS si applica ai figli di questo nodo.
   */
  readonly mode?: "pila" | "libero";
}
