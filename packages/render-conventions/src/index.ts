/**
 * Barrel pubblico del pacchetto (RFC-000 §11, stesso principio già seguito
 * da `@vicolobuilder/engine`/`@vicolobuilder/exporter`): ogni consumer
 * (renderer-react, Exporter) importa solo da qui.
 */
export { htmlTagFor } from "./htmlTag.js";
