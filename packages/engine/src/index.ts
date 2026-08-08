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
} from "./runtime/commands.js";

export { History } from "./runtime/history.js";

export { resolveNode, resolveDocument } from "./resolver/resolveNode.js";
export { BREAKPOINTS, getBreakpoint, cascadingBreakpoints } from "./resolver/breakpoints.js";
export { VARIANT_TABLE } from "./resolver/variantTable.js";
export type { ResolvedNode, ResolvedModel, ResolverContext, Breakpoint, BreakpointName } from "./resolver/types.js";
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
