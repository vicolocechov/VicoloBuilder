import { requireNode, resolveNode } from "@vicolobuilder/engine";
import type { BreakpointName, Document, NodeId, UpdatePropsCommand } from "@vicolobuilder/engine";
import { BASE_TIER, widerTiers } from "../breakpoints.js";

/**
 * Fase 5, Blocco D — regola Desktop-first di scrittura (PRODUCT_DESIGN.md,
 * sez. 6, Decisione 1) + separazione geometria/contenuto (decisione del
 * proprietario del prodotto, turno di approvazione dell'Opzione A).
 *
 * Due elenchi CHIUSI: nessun'altra chiave entra senza approvazione esplicita
 * (vedi `buildUpdatePropsCommand`, che lancia su qualunque chiave fuori da
 * questi due elenchi).
 */
export const GEOMETRY_KEYS = ["x", "y", "width", "height", "layoutMode"] as const;
export const CONTENT_KEYS = ["text", "color"] as const;

export type GeometryKey = (typeof GEOMETRY_KEYS)[number];
export type ContentKey = (typeof CONTENT_KEYS)[number];
export type EditableKey = GeometryKey | ContentKey;

const GEOMETRY_KEY_SET: ReadonlySet<string> = new Set(GEOMETRY_KEYS);
const CONTENT_KEY_SET: ReadonlySet<string> = new Set(CONTENT_KEYS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Ricostruisce `props.responsive` per una scrittura di geometria su una
 * fascia diversa dalla base (Opzione A, "congelamento"): scrive l'edit sulla
 * fascia attiva, poi - per ciascuna chiave cambiata priva già di un override
 * proprio sulla prima fascia più larga - congela lì il valore RISOLTO per
 * quella fascia (via `resolveNode`, non il valore di base), così l'edit non
 * si propaga verso le fasce più larghe (rischio descritto in
 * PRODUCT_DESIGN.md sez. 6, Decisione 1).
 *
 * Perché basta esaminare solo la prima fascia più larga priva di override
 * proprio (non serve iterare oltre): una volta che una chiave ha un
 * override esplicito su una fascia T (preesistente o appena congelato),
 * quell'override vince per costruzione su ogni fascia ancora più larga di T
 * nella cascata del resolver (`cascadingBreakpoints`, ordine crescente,
 * l'ultimo che scrive vince) - quindi ogni fascia oltre T resta corretta
 * senza bisogno di un proprio congelamento esplicito. La `for` sotto
 * comunque itera esplicitamente (non si ferma "per assunzione" al primo
 * giro) così il codice resta corretto anche se in futuro le fasce
 * diventassero più di 3 (PRODUCT_DESIGN.md, sez. 8).
 */
function buildFrozenResponsive(
  document: Document,
  nodeId: NodeId,
  activeBreakpoint: BreakpointName,
  geometryChanges: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const node = requireNode(document, nodeId);
  const existingResponsive = isPlainObject(node.props.responsive) ? node.props.responsive : {};
  const nextResponsive: Record<string, unknown> = { ...existingResponsive };

  const existingActiveTier = isPlainObject(existingResponsive[activeBreakpoint])
    ? existingResponsive[activeBreakpoint]
    : {};
  nextResponsive[activeBreakpoint] = { ...existingActiveTier, ...geometryChanges };

  let remaining: readonly string[] = Object.keys(geometryChanges);

  for (const tier of widerTiers(activeBreakpoint)) {
    if (remaining.length === 0) break;

    const tierExisting = isPlainObject(existingResponsive[tier]) ? existingResponsive[tier] : undefined;
    const toFreeze = remaining.filter((key) => tierExisting?.[key] === undefined);

    if (toFreeze.length > 0) {
      const resolvedAtTier = resolveNode(node, { breakpoint: tier }).resolvedProps;
      const freeze: Record<string, unknown> = {};
      for (const key of toFreeze) freeze[key] = resolvedAtTier[key];
      nextResponsive[tier] = { ...(tierExisting ?? {}), ...freeze };
    }

    // Ogni chiave rimasta è ora "sistemata" a questa fascia, o perché aveva
    // già un override proprio (tierExisting), o perché l'abbiamo appena
    // congelata (toFreeze): nessuna delle due deve essere ricontrollata su
    // una fascia ancora più larga (vedi il commento sopra la funzione).
    remaining = [];
  }

  return nextResponsive;
}

/**
 * Costruisce il comando `UPDATE_PROPS` per un singolo gesto di editing
 * (un trascinamento, un campo del pannello proprietà). Non esegue nulla:
 * il chiamante lo passa a `History.execute()`.
 *
 * - Chiavi di GEOMETRIA: se la vista attiva è la fascia base (`desktop`),
 *   scrivono direttamente sui props del nodo (nessun congelamento
 *   necessario: non esiste una fascia più larga della base). Altrimenti
 *   passano da `buildFrozenResponsive` (Opzione A).
 * - Chiavi di CONTENUTO: scrivono sempre sui props base, indipendentemente
 *   dalla vista attiva (nessuna variazione di contenuto per fascia sullo
 *   stesso nodo - decisione del proprietario del prodotto).
 * - Qualunque altra chiave: errore esplicito, non un default silenzioso.
 */
export function buildUpdatePropsCommand(
  document: Document,
  nodeId: NodeId,
  activeBreakpoint: BreakpointName,
  changedProps: Readonly<Partial<Record<EditableKey, unknown>>>,
): UpdatePropsCommand {
  const keys = Object.keys(changedProps);
  if (keys.length === 0) {
    throw new Error("buildUpdatePropsCommand: changedProps è vuoto - nessuna modifica da scrivere.");
  }

  const geometryChanges: Record<string, unknown> = {};
  const contentChanges: Record<string, unknown> = {};

  for (const key of keys) {
    if (GEOMETRY_KEY_SET.has(key)) {
      geometryChanges[key] = changedProps[key as EditableKey];
    } else if (CONTENT_KEY_SET.has(key)) {
      contentChanges[key] = changedProps[key as EditableKey];
    } else {
      throw new Error(
        `buildUpdatePropsCommand: proprietà "${key}" non riconosciuta. Deve essere geometria ` +
          `(${GEOMETRY_KEYS.join(", ")}) o contenuto (${CONTENT_KEYS.join(", ")}) - elenchi chiusi.`,
      );
    }
  }

  const props: Record<string, unknown> = { ...contentChanges };

  if (Object.keys(geometryChanges).length > 0) {
    if (activeBreakpoint === BASE_TIER) {
      Object.assign(props, geometryChanges);
    } else {
      props.responsive = buildFrozenResponsive(document, nodeId, activeBreakpoint, geometryChanges);
    }
  }

  return { type: "UPDATE_PROPS", nodeId, props };
}
