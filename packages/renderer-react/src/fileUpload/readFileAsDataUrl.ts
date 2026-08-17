/**
 * Blocco 5 (upload asset, al posto di incollare URL/data-URI a mano):
 * converte un `File` scelto dall'autore nello STESSO valore che `src`
 * (immagini)/`document.props.fonts[].src` (font) già gestiscono oggi -
 * nessun concetto nuovo nel Document Model, solo un modo più comodo di
 * ottenere quel valore (istruzione esplicita del proprietario del
 * prodotto). `FileReader.readAsDataURL` produce già un `data:<mime>;
 * base64,...` corretto per qualunque tipo di file, MIME dedotto dal
 * browser dal file stesso - nessuna interpretazione o validazione di
 * formato qui, stesso trattamento "stringa opaca" già riservato a `src`
 * ovunque nel Renderer/Exporter (Canvas.tsx, Preview.tsx, `exporter/src/
 * fonts.ts` - nessun hint `format()` mai usato, verificato).
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Lettura del file non riuscita: risultato inatteso."));
      }
    };
    reader.onerror = () => reject(new Error("Lettura del file non riuscita."));
    reader.readAsDataURL(file);
  });
}
