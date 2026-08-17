import { requireNode } from "@vicolobuilder/engine";
import type { Document, NodeId, UpdatePropsCommand } from "@vicolobuilder/engine";
import { HOVER_KEYS, type HoverKey } from "@vicolobuilder/render-conventions";

/**
 * Fase 17 (Transizioni CSS di base, Punto 2). `props.hover` è un quarto bag
 * (mirror di `props.responsive`, non integrato con esso) - questo builder
 * non passa dal congelamento Desktop-first di `buildUpdatePropsCommand`
 * (nessuna cascata per fascia, decisione approvata) ma, come
 * `buildRegisterFontCommand` (Fase 16), prende `document` in input: scrive
 * SEMPRE l'intero oggetto `hover`, quindi deve leggere quello esistente
 * prima di fondervi la modifica (`UPDATE_PROPS` fa uno shallow merge sui
 * PROPS del nodo, non un merge ricorsivo dentro `hover`).
 */
const HOVER_KEY_SET: ReadonlySet<string> = new Set(HOVER_KEYS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildUpdateHoverPropsCommand(
  document: Document,
  nodeId: NodeId,
  changedProps: Readonly<Partial<Record<HoverKey, string>>>,
): UpdatePropsCommand {
  const keys = Object.keys(changedProps);
  if (keys.length === 0) {
    throw new Error("buildUpdateHoverPropsCommand: changedProps è vuoto - nessuna modifica da scrivere.");
  }
  for (const key of keys) {
    if (!HOVER_KEY_SET.has(key)) {
      throw new Error(
        `buildUpdateHoverPropsCommand: proprietà "${key}" non riconosciuta. Deve essere una fra ` +
          `${HOVER_KEYS.join(", ")} - elenco chiuso.`,
      );
    }
  }

  const node = requireNode(document, nodeId);
  const existingHover = isPlainObject(node.props.hover) ? node.props.hover : {};
  const nextHover = { ...existingHover, ...changedProps };

  return { type: "UPDATE_PROPS", nodeId, props: { hover: nextHover } };
}
