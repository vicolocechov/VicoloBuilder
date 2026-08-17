/**
 * Barrel pubblico del pacchetto (RFC-000 §11, stesso principio già seguito
 * da `@vicolobuilder/engine`): un consumer esterno (CLI, o chiunque altro)
 * importa solo da qui, mai dai percorsi interni.
 */
export { escapeHtmlText, escapeHtmlAttribute, escapeCssText } from "./escape.js";
export { renderMarkup, DuplicateAnchorIdError } from "./markup.js";
export { renderGeometryStylesheet } from "./stylesheet.js";
