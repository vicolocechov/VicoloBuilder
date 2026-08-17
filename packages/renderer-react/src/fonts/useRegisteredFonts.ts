import { useEffect } from "react";
import type { FontRegistration } from "@vicolobuilder/render-conventions";

/**
 * Rende effettivamente disponibili al browser i font registrati in
 * `document.props.fonts` (Fase 16) - senza questo, `fontFamily` su un nodo
 * sarebbe un prop inerte: il browser non sa cosa sia una famiglia senza
 * una dichiarazione `@font-face` da qualche parte (fatto verificato
 * nell'analisi, confermato dal sito reale: "Oswald" è dichiarato ma mai
 * usato, la registrazione da sola non produce nulla di visibile).
 *
 * Implementato con la CSS Font Loading API (`FontFace`/`window.document.fonts`)
 * invece di iniettare un `<style>` con `@font-face` costruito per
 * interpolazione di stringa (l'idea abbozzata nell'analisi): `family`/
 * `weight`/`src` sono valori scelti dall'utente in un campo di testo libero
 * (stesso principio "nessun asset manager" di Fase 15) - interpolarli in
 * testo CSS grezzo dentro un `<style>` aprirebbe una superficie di CSS
 * injection (es. una `family` contenente `';}body{...}` altererebbe regole
 * CSS arbitrarie sulla pagina). La Font Loading API prende gli stessi
 * valori come DATI (argomenti di `new FontFace(...)`), non come testo CSS
 * da interpretare - stessa funzionalità, nessuna superficie di
 * interpolazione. Nessun'alternativa più semplice esisteva già (primo
 * punto di questo tipo in renderer-react), quindi non è stata una scelta
 * fra alternative di prodotto, solo l'esecuzione più sicura dell'obiettivo
 * già approvato ("un font registrato è visivamente renderizzato").
 *
 * `document.fonts` (il registro font del BROWSER, window.document - da non
 * confondere con `Document`, il modello dati dell'Engine) è globale alla
 * pagina: un solo punto di chiamata (in `App.tsx`) rende i font disponibili
 * sia al Canvas sia alla Preview, senza bisogno di duplicare la
 * registrazione in entrambi.
 */
export function useRegisteredFonts(fonts: readonly FontRegistration[]): void {
  useEffect(() => {
    const added: FontFace[] = [];
    for (const font of fonts) {
      const face = new FontFace(font.family, `url(${font.src})`, { weight: font.weight });
      document.fonts.add(face);
      added.push(face);
      // Best-effort: un font non caricabile (src non valido) non deve
      // interrompere nient'altro - il browser ricade sul fallback generico
      // già presente in ogni dichiarazione `fontFamily` a valle.
      face.load().catch(() => {});
    }
    return () => {
      for (const face of added) document.fonts.delete(face);
    };
  }, [fonts]);
}
