import { useSyncExternalStore } from "react";
import type { BreakpointName, NodeId, Document } from "@vicolobuilder/engine";
import type { ReactiveHistory } from "./ReactiveHistory.js";

// Un hook per pezzo di stato osservabile, non un unico snapshot combinato:
// `useSyncExternalStore` richiede che `getSnapshot` restituisca lo stesso
// riferimento/valore quando nulla di quel pezzo è cambiato, altrimenti
// ri-renderizza ad ogni giro. `getDocument` rispetta già questa garanzia
// (History.document/undo/redo restituiscono lo stesso riferimento quando
// non c'è nulla da annullare/ripetere - verificato in history.test.ts);
// selection/activeBreakpoint/canUndo/canRedo sono primitivi, quindi
// l'uguaglianza per valore di React è già sufficiente.

export function useDocument(store: ReactiveHistory): Document {
  return useSyncExternalStore(store.subscribe, store.getDocument);
}

export function useSelection(store: ReactiveHistory): NodeId | null {
  return useSyncExternalStore(store.subscribe, store.getSelection);
}

export function useActiveBreakpoint(store: ReactiveHistory): BreakpointName {
  return useSyncExternalStore(store.subscribe, store.getActiveBreakpoint);
}

export function useCanUndo(store: ReactiveHistory): boolean {
  return useSyncExternalStore(store.subscribe, store.getCanUndo);
}

export function useCanRedo(store: ReactiveHistory): boolean {
  return useSyncExternalStore(store.subscribe, store.getCanRedo);
}
