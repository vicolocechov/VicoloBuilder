import { useEffect, useRef, useState } from "react";
import type { ReactiveHistory } from "../history/ReactiveHistory.js";
import { useDocument } from "../history/useHistoryStore.js";
import { buildUpdateDocumentSeoCommand, type DocumentSeoKey } from "../write/buildUpdateDocumentPropsCommand.js";

/**
 * B4 (SEO og:* e lang) — mirror di `pages/PageManager.tsx` (sezione SEO) un
 * livello più in alto: `lang`/`og:site_name`/`og:type`/`og:locale` sono un
 * solo valore per l'intero sito (mai per pagina, a differenza di
 * `ogTitle`/`ogDescription`, che l'Open Graph definisce per-URL e restano
 * in `Page.props` - vedi `PageManager.tsx`). Stesso livello di `Document.
 * props.fonts` (Fase 16, `FontManager.tsx`): un file separato, non un
 * campo in più dentro `FontManager.tsx`, che resta scoped alla
 * registrazione dei font, non a ogni dato a livello documento.
 *
 * Nessun campo `og:url` qui né altrove: deriva sempre da `canonical`
 * (già in `Page.props`), mai un dato scritto - vedi
 * `write/buildUpdateDocumentPropsCommand.ts`/`buildUpdatePagePropsCommand.ts`.
 */

function SeoTextField({
  label,
  value,
  onCommit,
}: {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
}): JSX.Element {
  const [text, setText] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
      <span>{label}</span>
      <input
        type="text"
        value={text}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false;
          onCommit(text);
        }}
      />
    </label>
  );
}

export function SiteSeoManager({ store }: { readonly store: ReactiveHistory }): JSX.Element {
  const document = useDocument(store);

  function commitSeo(key: DocumentSeoKey, value: string): void {
    store.execute(buildUpdateDocumentSeoCommand({ [key]: value }));
  }

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontWeight: "bold" }}>SEO — sito</div>
      <SeoTextField
        label="lang"
        value={typeof document.props.lang === "string" ? document.props.lang : ""}
        onCommit={(s) => commitSeo("lang", s)}
      />
      <SeoTextField
        label="og:site_name"
        value={typeof document.props.ogSiteName === "string" ? document.props.ogSiteName : ""}
        onCommit={(s) => commitSeo("ogSiteName", s)}
      />
      <SeoTextField
        label="og:type"
        value={typeof document.props.ogType === "string" ? document.props.ogType : ""}
        onCommit={(s) => commitSeo("ogType", s)}
      />
      <SeoTextField
        label="og:locale"
        value={typeof document.props.ogLocale === "string" ? document.props.ogLocale : ""}
        onCommit={(s) => commitSeo("ogLocale", s)}
      />
    </div>
  );
}
