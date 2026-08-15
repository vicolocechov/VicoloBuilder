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
 */
export interface IR {
  readonly box: Box;
  readonly meta: {
    readonly pageId: PageId;
    readonly breakpoint: BreakpointName;
    readonly pageProps: Readonly<Record<string, unknown>>;
    readonly documentProps: Readonly<Record<string, unknown>>;
  };
}
