import { useEffect } from "react";
import type { NodeId } from "@vicolobuilder/engine";
import { type HoverKey, type HoverStyle } from "@vicolobuilder/render-conventions";

/**
 * Rende effettive le regole `:hover` di `readHoverStyles` (Fase 17, Punto
 * 1 - decisione esplicita: CSS reale, non una simulazione JS via
 * onMouseEnter/onMouseLeave). Costruisce le regole via CSSOM
 * (`insertRule` + assegnazione PROGRAMMATICA delle singole proprietà su
 * `rule.style`), NON per interpolazione di testo CSS - stesso principio
 * di sicurezza già scelto per la Font Loading API in Fase 16 (D-029):
 * `color`/`background`/`transform`/`borderColor` sono campi di testo
 * liberi dell'utente, mai concatenati in una stringa CSS grezza (rischio
 * di CSS injection, es. una `background` contenente `';}body{...}`).
 *
 * Selettore basato su `[data-node-id="..."]` (attributo già presente su
 * ogni `Tag` renderizzato, Fase 5/9/15) - non serve inventare uno schema
 * di className. `nodeId` è generato programmaticamente (`uniqueId`, mai
 * testo libero dell'utente), ma passato comunque da `CSS.escape` per
 * difesa in profondità, a costo trascurabile.
 *
 * Ogni proprietà è scritta con priorità `important`: il `Tag` porta
 * SEMPRE uno style inline (es. `background: backgroundColor ?? "transparent"`
 * in `Preview.tsx`, per il prop `color` del nodo) - uno style inline batte
 * QUALUNQUE regola di un foglio esterno indipendentemente dal selettore,
 * `:hover` incluso (specificità CSS). Senza `important`, l'hover su una
 * proprietà già impostata inline (tipicamente `background`) non avrebbe
 * mai effetto - bug trovato verificando in browser durante questa fase,
 * non dai test unitari (nessuno rende davvero il DOM).
 *
 * Chiamato SOLO da `Preview.tsx` (Fase 17, Punto 3 - decisione esplicita):
 * un `:hover`/`transition` applicato anche nel `Canvas` confliggerebbe con
 * il trascinamento dal vivo (Fase 5, Blocco D - `style.left`/`top`
 * aggiornati ad ogni pointermove, una `transition` introdurrebbe un
 * ritardo percepito) e con l'overlay di selezione (Fase 15, D-028 -
 * posizionato su coordinate risolte, non affette da un `transform` CSS
 * applicato al tag). Il montaggio/smontaggio di `Preview` (App.tsx)
 * aggiunge/rimuove lo stesso `<style>` in automatico via cleanup
 * dell'effect - un solo punto di chiamata basta, non serve duplicarlo.
 */
export function useHoverStyles(hoverStyles: ReadonlyMap<NodeId, HoverStyle>): void {
  useEffect(() => {
    const styleEl = window.document.createElement("style");
    window.document.head.appendChild(styleEl);
    const sheet = styleEl.sheet;

    if (sheet) {
      const cssPropertyByKey: Record<HoverKey, string> = {
        color: "color",
        background: "background",
        transform: "transform",
        borderColor: "border-color",
      };

      for (const [nodeId, hover] of hoverStyles) {
        const index = sheet.insertRule(`[data-node-id="${CSS.escape(nodeId)}"]:hover {}`, sheet.cssRules.length);
        const rule = sheet.cssRules[index];
        if (rule instanceof CSSStyleRule) {
          for (const key of Object.keys(hover) as HoverKey[]) {
            const value = hover[key];
            if (typeof value === "string") {
              // `important`: il Tag renderizzato porta SEMPRE uno style
              // inline (es. `background: backgroundColor ?? "transparent"`,
              // Preview.tsx) - uno style inline batte QUALUNQUE regola di un
              // foglio esterno indipendentemente dal selettore, `:hover`
              // incluso (specificità CSS). Senza `important`, un hover su
              // `background`/`color` non avrebbe mai effetto se il nodo ha
              // già un valore base per quella stessa proprietà - trovato
              // verificando in browser (il colore/transform funzionavano,
              // "background" no, perché è l'unica delle tre già impostata
              // inline da Preview.tsx per il prop "color" del nodo).
              rule.style.setProperty(cssPropertyByKey[key], value, "important");
            }
          }
        }
      }
    }

    return () => {
      styleEl.remove();
    };
  }, [hoverStyles]);
}
