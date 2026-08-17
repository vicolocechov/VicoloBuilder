import { useState } from "react";
import type { ReactiveHistory } from "../history/ReactiveHistory.js";
import { useDocument } from "../history/useHistoryStore.js";
import { readRegisteredFonts } from "@vicolobuilder/render-conventions";
import { buildRegisterFontCommand, buildUnregisterFontCommand } from "../write/buildUpdateDocumentPropsCommand.js";
import { FileUploadButton } from "../fileUpload/FileUploadButton.js";

/**
 * Fase 16 (Font custom, Punto 1 - decisione esplicita del proprietario del
 * prodotto): registrazione a livello DOCUMENTO, non pagina - stesso motivo
 * per cui non va in `PageManager.tsx` (un font registrato è condiviso da
 * tutto il documento, non da una pagina) né nel `PropertyPanel` (non è una
 * proprietà di un nodo selezionato). Livello sottile sopra
 * `UPDATE_DOCUMENT_PROPS`, stesso stile di `PageManager.tsx`.
 */
export function FontManager({ store }: { readonly store: ReactiveHistory }): JSX.Element {
  const document = useDocument(store);
  const fonts = readRegisteredFonts(document);

  const [family, setFamily] = useState("");
  const [weight, setWeight] = useState("400");
  const [src, setSrc] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleRegister(): void {
    setError(null);
    try {
      store.execute(buildRegisterFontCommand(document, { family, weight, src }));
      setFamily("");
      setWeight("400");
      setSrc("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleUnregister(fontFamily: string, fontWeight: string): void {
    setError(null);
    try {
      store.execute(buildUnregisterFontCommand(document, fontFamily, fontWeight));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ padding: 8, borderBottom: "1px solid #e5e7eb", fontSize: 12 }}>
      <div style={{ fontWeight: "bold", marginBottom: 6 }}>Font</div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {fonts.map((font) => (
          <li key={`${font.family}:${font.weight}`} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ flex: 1 }}>
              {font.family} <em style={{ opacity: 0.6 }}>({font.weight})</em>
            </span>
            <button onClick={() => handleUnregister(font.family, font.weight)} title="Rimuovi">
              ×
            </button>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
        <input type="text" value={family} onChange={(e) => setFamily(e.target.value)} placeholder="Famiglia (es. Poppins)" style={{ flex: 1 }} />
        <input type="text" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Peso (es. 600)" style={{ width: 60 }} />
        <input type="text" value={src} onChange={(e) => setSrc(e.target.value)} placeholder="src (URL o data:)" style={{ flex: 2 }} />
        <button onClick={handleRegister}>+ Font</button>
      </div>
      {/* Blocco 5: stesso campo "src" sopra (una data-URI) - solo un modo
          più comodo di ottenerlo, non un percorso di registrazione
          separato. La registrazione vera resta "+ Font": l'upload compila
          solo il valore, l'autore conferma family/weight come già faceva. */}
      <div style={{ marginTop: 4 }}>
        <FileUploadButton accept=".ttf,.otf,.woff,.woff2,font/*" onLoaded={(dataUrl) => setSrc(dataUrl)} />
      </div>
      {error ? <div style={{ color: "#b91c1c", marginTop: 4 }}>{error}</div> : null}
    </div>
  );
}
