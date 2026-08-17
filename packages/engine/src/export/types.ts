import type { NodeId, PageId } from "../document/types.js";
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
 * è minimale (D-012): solo i dati senza i quali l'IR non sarebbe
 * distinguibile da un altro - nessun campo giustificato solo da un uso
 * futuro ipotetico.
 *
 * Fase 14 (SEO per pagina, Punto 7 dell'analisi, approvato): `pageProps`
 * aggiunto per rendere `Page.props` osservabile end-to-end (`builder
 * export`) senza un Exporter HTML reale (fuori scope). Passato COSÌ COM'È,
 * senza interpretare `title`/`description`/`canonical` per nome: l'Engine
 * non ha mai interpretato il significato di una chiave di prop (stesso
 * principio già rispettato per `DocumentNode.props` - `text`/`color`/
 * `href`/`fontSize` non sono mai letti per nome qui) - la convenzione dei
 * nomi SEO vive solo in `renderer-react` (`write/buildUpdatePagePropsCommand.ts`),
 * non duplicata nell'Engine.
 *
 * Fase 16 (Font custom): `documentProps` aggiunto per lo stesso motivo,
 * stesso principio di passaggio opaco - rende `Document.props` (e la
 * chiave `fonts` che vi abita, convenzione di `renderer-react`)
 * osservabile end-to-end senza che l'Engine interpreti cosa sia un font.
 *
 * Batch 1 dell'Exporter (analisi "come estendere l'IR", Opzione B
 * approvata): `nodes` aggiunto, SIBLING di `box`/`meta` - non dentro
 * `meta` (che resta minimale per definizione, D-012; un dizionario di
 * stile per nodo è contenuto core, della stessa natura di `box`, non un
 * dato "senza il quale l'IR non sarebbe distinguibile"). `box` resta
 * ESATTAMENTE quello che `computeLayout` produce oggi, invariato -
 * nessuna modifica al contratto geometrico (RFC-004: "Layout produce Box
 * Tree... mai CSS diretto", mai violato). `nodes` è un dizionario piatto
 * `nodeId -> resolvedProps` (MAI un `DocumentNode` sorgente: solo i
 * valori già risolti dal Resolver, esattamente come already accade in
 * `ResolvedNode.resolvedProps`) - limitato ai soli nodi della pagina
 * esportata (stesso perimetro di `box`, mai l'intero `ResolvedModel`
 * multi-pagina), ordinato per `nodeId` per lo stesso motivo di
 * `serializeNode`/`sortedEntries` in `document/hash.ts`: l'ordine di
 * inserimento in una `Map` non è un dato significativo, va reso
 * indipendente esplicitamente per il determinismo byte-per-byte
 * dell'output serializzato.
 *
 * Batch 3 dell'Exporter (D-039): `types` aggiunto - trovato mancante
 * SOLO iniziando a scrivere il generatore di markup del Batch 3, non
 * previsto dall'analisi originaria "come estendere l'IR" (Batch 1),
 * concentrata solo su stile/contenuto (`resolvedProps`) e non
 * sull'identità del nodo. `htmlTagFor` (scelta del tag HTML) richiede
 * `DocumentNode.type`, che né `box` (pura geometria) né `nodes` (solo
 * `resolvedProps`, per vincolo esplicito di D-036) espongono. Stessa
 * disciplina di `nodes`: dizionario piatto `nodeId -> type` (una stringa,
 * MAI l'intero `DocumentNode`/`ResolvedNode` sorgente), limitato ai nodi
 * della pagina esportata, ordinato per `nodeId`. Sibling di `box`/`nodes`/
 * `meta`, stesso motivo di collocazione già dato per `nodes`.
 */
export interface IR {
  readonly box: Box;
  readonly nodes: Readonly<Record<NodeId, Readonly<Record<string, unknown>>>>;
  readonly types: Readonly<Record<NodeId, string>>;
  readonly meta: {
    readonly pageId: PageId;
    readonly breakpoint: BreakpointName;
    readonly pageProps: Readonly<Record<string, unknown>>;
    readonly documentProps: Readonly<Record<string, unknown>>;
  };
}
