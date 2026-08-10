import { resolveDocument } from "../resolver/resolveNode.js";
import { computeLayout } from "../layout/computeLayout.js";
import type { Document } from "../document/types.js";
import type { ExportContext, IR } from "./types.js";

/**
 * Document -> ResolvedModel -> IR (RFC-005). Pura: compone resolveDocument
 * e computeLayout, entrambe già pure e già validate internamente
 * (assertValidResolvedModel/assertValidBox) prima di restituire - nessun
 * validator dedicato qui (D-012): Meta è piatta, nessuna nuova struttura a
 * grafo da controllare.
 */
export function exportIR(document: Document, context: ExportContext): IR {
  const model = resolveDocument(document, { breakpoint: context.breakpoint });
  const box = computeLayout(model, { pageId: context.pageId, viewportWidth: context.viewportWidth });

  return {
    box,
    meta: {
      pageId: context.pageId,
      breakpoint: context.breakpoint,
    },
  };
}
