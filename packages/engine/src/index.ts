// Public API surface (RFC-000 §11). Everything reachable from here is
// versioned per semver; internal modules may change freely between minors.

export { createDocument, getNode, requireNode, getPage, collectSubtreeIds } from "./document/document.js";
export { CURRENT_SCHEMA_VERSION } from "./document/types.js";
export type { Document, DocumentNode, Page, NodeId, PageId } from "./document/types.js";

export { hashDocument, serializeDocument } from "./document/hash.js";

export {
  validateDocument,
  assertValidDocument,
  DocumentInvariantError,
} from "./document/invariants.js";
export type { InvariantViolation, InvariantCode } from "./document/invariants.js";

export { applyCommand, CommandError } from "./runtime/commands.js";
export type {
  Command,
  CreateNodeCommand,
  UpdatePropsCommand,
  DeleteNodeCommand,
  MoveNodeCommand,
  CreatePageCommand,
  DeletePageCommand,
  ReorderPagesCommand,
  UpdatePagePropsCommand,
  UpdateDocumentPropsCommand,
} from "./runtime/commands.js";

export { History } from "./runtime/history.js";

export { resolveNode, resolveDocument } from "./resolver/resolveNode.js";
export type { ResolvedNode, ResolvedModel, ResolverContext, Breakpoint, BreakpointName } from "./resolver/types.js";
/**
 * Fase 6 (D-019): superficie pubblica minima e mirata sulle fasce - non
 * `BREAKPOINTS` (l'array intero coi predicati resta interno, D-010
 * invariato nella sostanza), solo i nomi e la relazione di cascata
 * "più larga", perché renderer-react (consumer esterno reale) ne ha
 * bisogno per il pulsante di cambio vista e per il congelamento
 * Desktop-first - esattamente il trigger di rivalutazione che D-010 aveva
 * già previsto esplicitamente.
 *
 * Exporter Batch 4 (D-042): `getBreakpoint` aggiunta, stesso principio -
 * reversione MIRATA, non l'intero `BREAKPOINTS` grezzo. Il foglio di stile
 * "snapshot posizionale" dell'Exporter deve generare `@media` con le
 * soglie REALI di ciascuna fascia (`minWidth`/`maxWidth`/`orientation`/
 * `minHeight`/`maxHeight`), non solo il nome - il trigger di rivalutazione
 * che D-010 aveva già previsto testualmente ("quando emergerà un consumer
 * esterno reale... che necessiti" di più dei soli nomi).
 */
export { listBreakpointNames, widerBreakpoints, BASE_BREAKPOINT, getBreakpoint } from "./resolver/breakpoints.js";
export {
  validateResolvedModel,
  assertValidResolvedModel,
  ResolvedModelInvariantError,
} from "./resolver/invariants.js";
export type {
  ResolvedModelInvariantViolation,
  ResolvedModelInvariantCode,
} from "./resolver/invariants.js";

export { computeLayout } from "./layout/computeLayout.js";
export type { ComputeLayoutOptions } from "./layout/computeLayout.js";
export type { Box } from "./layout/types.js";
export { validateBox, assertValidBox, BoxInvariantError } from "./layout/invariants.js";
export type { BoxInvariantViolation, BoxInvariantCode } from "./layout/invariants.js";

export { deserializeDocument, DocumentParseError } from "./document/deserialize.js";

export { exportIR } from "./export/exportIR.js";
export type { IR, ExportContext } from "./export/types.js";
