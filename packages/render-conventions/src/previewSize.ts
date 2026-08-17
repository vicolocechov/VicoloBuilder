import type { BreakpointName } from "@vicolobuilder/engine";

/**
 * Larghezza/altezza di anteprima per fascia (Fase 6, Punto 3 dell'analisi
 * delle fondamenta). Non è la stessa cosa della "device preview" descritta
 * in PRODUCT_DESIGN.md sez. 10 (che resta un dato UI puro, non ancora
 * costruito): qui sono solo i due numeri che servono a `computeLayout`
 * (larghezza) e al contenitore del Canvas/della Preview (altezza minima)
 * per mostrare qualcosa di visivamente coerente con ciascuna delle 7
 * fasce - non un vero frame di dispositivo (niente clipping, niente
 * rotazione). Ogni coppia rispetta il predicato reale della propria fascia
 * (D-019) - verificato a mano, non a caso: es. "mobile-orizzontale" ha
 * altezza <= 550 (il vincolo `maxHeight` della fascia), "tablet-verticale"
 * ha altezza > larghezza (portrait). Costanti condivise, non una nuova
 * decisione di prodotto.
 *
 * Estratto in un modulo condiviso in Fase 7 (era locale a Canvas.tsx):
 * la Preview (Fase 7) ha bisogno esattamente delle stesse coppie, per
 * mostrare la fascia attiva in modo coerente con l'editing - duplicare la
 * mappa avrebbe rischiato un disallineamento silenzioso tra Canvas e
 * Preview.
 *
 * Exporter Batch 4 (decisione infrastrutturale #1): spostato da
 * `renderer-react/src/previewSize.ts` a questo pacchetto neutro, stesso
 * principio già applicato a `htmlTagFor` nel Batch 3 (D-038): l'Exporter
 * ha bisogno esattamente della stessa larghezza per fascia già usata da
 * Canvas/Preview per generare il foglio di stile "snapshot posizionale"
 * (una fascia CSS per ciascuna delle 7 fasce, D-019) - usare la stessa
 * tabella invece di ridefinirla evita un disallineamento silenzioso tra
 * l'anteprima nell'editor e l'HTML pubblicato. Nessun valore o soglia
 * modificato: stesse 7 coppie, stessi numeri. `renderer-react` importa ora
 * da qui invece di tenere una copia locale - zero cambi di comportamento.
 */
export const PREVIEW_SIZE: Record<BreakpointName, { readonly width: number; readonly height: number }> = {
  "mobile-verticale": { width: 375, height: 812 },
  "mobile-orizzontale": { width: 700, height: 400 },
  "tablet-verticale": { width: 834, height: 1194 },
  "tablet-orizzontale": { width: 1024, height: 768 },
  "laptop-compatto": { width: 1100, height: 700 },
  "desktop-compatto": { width: 1300, height: 800 },
  desktop: { width: 1600, height: 900 },
};
