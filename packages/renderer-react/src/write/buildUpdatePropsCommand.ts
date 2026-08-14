import { requireNode, resolveNode, widerBreakpoints } from "@vicolobuilder/engine";
import type { BreakpointName, Document, NodeId, UpdatePropsCommand } from "@vicolobuilder/engine";
import { BASE_TIER } from "../breakpoints.js";

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
 * fascia attiva, poi - per ciascuna fascia in cui l'edit si propagherebbe
 * (`widerBreakpoints`, Fase 6/D-019) e per ciascuna chiave cambiata priva
 * già di un override proprio LÌ - congela il valore RISOLTO per quella
 * fascia (via `resolveNode`, non il valore di base), così l'edit non si
 * propaga oltre (rischio descritto in PRODUCT_DESIGN.md sez. 6, Decisione 1).
 *
 * Fase 6: `widerBreakpoints` restituisce solo i vicini DIRETTI (un passo),
 * non l'intera catena - e questo basta, non serve risalire oltre: una volta
 * che una fascia T ha un override esplicito (preesistente o appena
 * congelato), quell'override vince per costruzione ogni volta che T stessa
 * compare nella cascata di una fascia ancora più larga - quindi qualunque
 * fascia "a valle" di T riceve comunque il valore corretto quando viene
 * risolta, senza bisogno di congelarla esplicitamente qui.
 *
 * A differenza della Fase 5 (dove ogni fascia aveva AL PIÙ una fascia più
 * larga, una semplice catena), Fase 6 introduce fasce con PIÙ vicini diretti
 * indipendenti in linea di principio - per questo ogni fascia restituita da
 * `widerBreakpoints` viene congelata INDIPENDENTEMENTE con l'intero insieme
 * di chiavi cambiate (non un pool che si esaurisce dopo la prima fascia
 * processata, bug presente nella versione Fase 5 e mai emerso allora solo
 * perché nessuna fascia aveva più di un vicino diretto).
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

  for (const tier of widerBreakpoints(activeBreakpoint)) {
    const tierExisting = isPlainObject(existingResponsive[tier]) ? existingResponsive[tier] : undefined;
    const toFreeze = Object.keys(geometryChanges).filter((key) => tierExisting?.[key] === undefined);

    if (toFreeze.length > 0) {
      const resolvedAtTier = resolveNode(node, { breakpoint: tier }).resolvedProps;
      const freeze: Record<string, unknown> = {};
      for (const key of toFreeze) freeze[key] = resolvedAtTier[key];
      nextResponsive[tier] = { ...(tierExisting ?? {}), ...freeze };
    }
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
