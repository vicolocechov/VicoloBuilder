import { useRef, useState } from "react";
import { readFileAsDataUrl } from "./readFileAsDataUrl.js";

/**
 * Blocco 5: nessuna libreria/galleria di asset - un singolo controllo che
 * legge UN file e produce UNA data-URI, riusato tale e quale sia per
 * immagini (PropertyPanel) sia per font (FontManager). Un limite di
 * dimensione ragionevole (5MB, generoso per un font o un'immagine tipica
 * di questo contesto - i font reali usati come riferimento in questo
 * progetto sono ~300-400KB) evita solo l'esito peggiore (un file enorme
 * incorporato per intero nel Document e poi nell'unico file HTML
 * pubblicato, Batch 9) - non è una gestione asset, solo una guardia
 * pragmatica.
 */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function FileUploadButton({
  accept,
  onLoaded,
}: {
  readonly accept: string;
  readonly onLoaded: (dataUrl: string) => void;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(): Promise<void> {
    const file = inputRef.current?.files?.[0];
    // Azzerato subito: senza questo, selezionare di nuovo LO STESSO file
    // non farebbe scattare un altro "change" (nessun cambiamento di
    // valore dal punto di vista del browser).
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File troppo grande (${Math.round(file.size / 1024)} KB, massimo ${Math.round(MAX_UPLOAD_BYTES / 1024)} KB).`);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setError(null);
      onLoaded(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} style={{ fontSize: 11 }} />
      {error ? <span style={{ color: "#b91c1c", fontSize: 11 }}>{error}</span> : null}
    </div>
  );
}
