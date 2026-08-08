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
}
