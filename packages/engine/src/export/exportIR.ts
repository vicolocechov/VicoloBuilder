import { resolveDocument } from "../resolver/resolveNode.js";
import { computeLayout } from "../layout/computeLayout.js";
import type { Document, NodeId } from "../document/types.js";
import type { Box } from "../layout/types.js";
import type { ExportContext, IR } from "./types.js";
import type { ResolvedModel } from "../resolver/types.js";

/**
 * Batch 1 dell'Exporter: raccoglie gli id di TUTTI i nodi del Box Tree già
 * calcolato (il perimetro esatto della pagina esportata - `computeLayout`
 * ha già fatto la stessa scelta di scope prima di questa funzione, qui la
 * si riusa invece di ricalcolarla). Nessuna nuova visita del Document, solo
 * di un `Box` già in memoria - non è "un nuovo percorso parallelo
 * Resolver -> Exporter", è una lettura di ciò che `computeLayout` ha già
 * prodotto.
 */
function collectBoxNodeIds(box: Box, out: NodeId[]): void {
  out.push(box.nodeId);
  for (const child of box.children) collectBoxNodeIds(child, out);
}

/**
 * Document -> ResolvedModel -> IR (RFC-005). Pura: compone resolveDocument
 * e computeLayout, entrambe già pure e già validate internamente
 * (assertValidResolvedModel/assertValidBox) prima di restituire - nessun
 * validator dedicato qui (D-012): Meta è piatta, nessuna nuova struttura a
 * grafo da controllare.
 *
 * Batch 1 dell'Exporter (analisi "come estendere l'IR", Opzione B
 * approvata): `nodes` - dizionario piatto `nodeId -> resolvedProps`,
 * limitato ai nodi della pagina esportata (via `collectBoxNodeIds` sopra),
 * MAI un `DocumentNode` sorgente (solo `resolvedNode.resolvedProps`, già
 * calcolato da `resolveDocument` - nessuna nuova logica di risoluzione).
 * Ordinato esplicitamente per `nodeId` prima di scrivere l'oggetto -
 * stesso motivo di `serializeNode`/`sortedEntries` in `document/hash.ts`:
 * l'ordine di inserimento in `model.nodes` (una `Map`) non è un dato
 * significativo, va reso indipendente per il determinismo byte-per-byte
 * dell'output serializzato. `box`/`computeLayout`/il contratto geometrico
 * restano interamente invariati - questa funzione legge `model`/`box`,
 * non li modifica.
 */
/**
 * Trovato verificando il determinismo byte-per-byte (non assunto):
 * `resolvedProps` è costruito da `UPDATE_PROPS` via merge incrementale
 * (`{...vecchie, ...nuove}`) - l'ORDINE delle chiavi dell'oggetto JS
 * risultante riflette l'ordine con cui le proprietà sono state scritte nel
 * tempo, non il loro contenuto logico. Finché `resolvedProps` non entrava
 * in alcun output serializzato, questo era invisibile; ora che `IR.nodes`
 * lo espone, due Document con lo stesso stato finale ma costruiti con
 * `UPDATE_PROPS` in ordine diverso produrrebbero `JSON.stringify` diversi.
 * Stesso problema già risolto una volta per `Page.props`/`Document.props`/
 * `node.props` in `document/hash.ts` (`sortedEntries`) - qui riordina le
 * chiavi esplicitamente prima di scrivere l'oggetto, stesso principio,
 * shape diversa (un oggetto piatto normale, non un array di coppie: l'IR
 * espone `resolvedProps` come oggetto per l'ergonomia dei consumer, non
 * come lo fa il formato di serializzazione del Document).
 */
function sortedProps(props: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(props).sort()) {
    sorted[key] = props[key];
  }
  return sorted;
}

function collectResolvedProps(model: ResolvedModel, box: Box): Readonly<Record<NodeId, Readonly<Record<string, unknown>>>> {
  const nodeIds: NodeId[] = [];
  collectBoxNodeIds(box, nodeIds);
  nodeIds.sort();

  const nodes: Record<NodeId, Readonly<Record<string, unknown>>> = {};
  for (const nodeId of nodeIds) {
    const resolvedNode = model.nodes.get(nodeId);
    if (resolvedNode) {
      nodes[nodeId] = sortedProps(resolvedNode.resolvedProps);
    }
  }
  return nodes;
}

export function exportIR(document: Document, context: ExportContext): IR {
  const model = resolveDocument(document, { breakpoint: context.breakpoint });
  const box = computeLayout(model, { pageId: context.pageId, viewportWidth: context.viewportWidth });

  return {
    box,
    nodes: collectResolvedProps(model, box),
    meta: {
      pageId: context.pageId,
      breakpoint: context.breakpoint,
      // `computeLayout` sopra ha già lanciato se la pagina non esistesse -
      // qui è garantita presente. Fallback a {} solo per non introdurre
      // un'asserzione non-null per un caso già escluso dalla riga precedente.
      pageProps: document.pages.get(context.pageId)?.props ?? {},
      // Fase 16: sempre presente (Document.props non è opzionale sul tipo),
      // nessun fallback necessario qui a differenza di pageProps sopra.
      documentProps: document.props,
    },
  };
}
