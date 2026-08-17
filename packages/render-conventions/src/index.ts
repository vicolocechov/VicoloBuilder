/**
 * Barrel pubblico del pacchetto (RFC-000 §11, stesso principio già seguito
 * da `@vicolobuilder/engine`/`@vicolobuilder/exporter`): ogni consumer
 * (renderer-react, Exporter) importa solo da qui.
 */
export { htmlTagFor } from "./htmlTag.js";
export { PREVIEW_SIZE } from "./previewSize.js";
export { readRegisteredFonts } from "./fontRegistration.js";
export type { FontRegistration } from "./fontRegistration.js";
export { HOVER_KEYS, readHoverStyles } from "./hoverStyle.js";
export type { HoverKey, HoverStyle } from "./hoverStyle.js";
