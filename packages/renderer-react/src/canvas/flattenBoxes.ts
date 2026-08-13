import type { Box } from "@vicolobuilder/engine";

/**
 * Fase 5, Blocco D (Decisione D1): il Canvas è un unico livello assoluto,
 * non DOM annidato secondo l'albero dei nodi - questo appiattisce il Box
 * Tree (coordinate già assolute per costruzione, vedi layout/computeLayout.ts)
 * in una lista piatta, portando con sé il parent e la sua modalità (servono
 * per le regole di trascinamento/ridimensionamento, Decisione D3).
 */
export interface FlatBoxEntry {
  readonly box: Box;
  readonly parentBox: Box | null;
  readonly parentMode: "pila" | "libero";
}

export function flattenBoxes(
  box: Box,
  parentBox: Box | null = null,
  parentMode: "pila" | "libero" = "pila",
): FlatBoxEntry[] {
  const ownMode: "pila" | "libero" = box.mode === "libero" ? "libero" : "pila";
  const entries: FlatBoxEntry[] = [{ box, parentBox, parentMode }];
  for (const child of box.children) {
    entries.push(...flattenBoxes(child, box, ownMode));
  }
  return entries;
}

export interface DragCapabilities {
  /** Trascinabile su x/y solo se il PARENT è in modalità "libero" (Decisione D3). */
  readonly canMoveXY: boolean;
  /** Ridimensionabile in larghezza solo se il PARENT è "libero" (in "pila" la larghezza è sempre ereditata). */
  readonly canResizeWidth: boolean;
  /** Ridimensionabile in altezza se è una foglia (qualunque modalità) o un contenitore la cui modalità propria è "libero". */
  readonly canResizeHeight: boolean;
}

export function dragCapabilities(entry: FlatBoxEntry, isLeaf: boolean): DragCapabilities {
  const ownMode: "pila" | "libero" = entry.box.mode === "libero" ? "libero" : "pila";
  return {
    canMoveXY: entry.parentMode === "libero",
    canResizeWidth: entry.parentMode === "libero",
    canResizeHeight: isLeaf || ownMode === "libero",
  };
}
