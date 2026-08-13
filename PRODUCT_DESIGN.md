# PRODUCT_DESIGN.md — Documento di progettazione del prodotto

Registro versionato delle scelte di prodotto/architettura per VicoloBuilder, con lo stesso ruolo che `DECISIONS.md` ha per le singole decisioni tecniche: `PROJECT_BRIEF.md`/RFC definiscono i vincoli, `DECISIONS.md` registra le scelte tecniche fatte dentro lo spazio che le RFC lasciano aperto, questo file registra le scelte di **visione e scope del prodotto** fatte prima e durante la Fase 5, con lo stesso livello di motivazione ed evidenza.

## Nota metodologica

Ogni affermazione rilevante è etichettata con una delle quattro categorie seguenti:

- **[Requisito del proprietario del prodotto — sezione N]**: qualcosa scritto esplicitamente dal proprietario del prodotto nel prompt che ha originato questo documento o nei successivi, citata la sezione numerata.
- **[Decisione presa dal proprietario del prodotto]**: una delle scelte chiuse esplicitamente (non più una raccomandazione aperta). Dove poggia su un fatto verificato, la citazione resta comunque presente.
- **[Fatto verificato: file:riga]**: verificato leggendo direttamente il codice o `PROJECT_BRIEF.md`/`DECISIONS.md`.
- **[Raccomandazione]**: una proposta tecnica non ancora decisa. Non è un requisito né un fatto.

**Sezioni prevalentemente basate su raccomandazione, non su decisioni già chiuse o fatti stabiliti**: la forma esatta del comando di riordino pagine (sez. 4), la forma esatta dello slot di comportamento embed (sez. 11 — dichiarata esplicitamente come la più incerta), le sezioni su State/Interazione (sez. 12) e sul "Cervello di design" AI (sez. 12bis), sez. D (decisioni ancora aperte), sez. H (roadmap).

**Sezioni analizzate meno a fondo delle altre**: SEO (sez. 15/16 del prompt originale), pulsanti/stati visivi hover-active-disabled (sez. 14), tipografia fluida (sez. 9), lista concreta di dispositivi per l'anteprima (sez. 8) — invariato rispetto alla bozza precedente.

---

## 1. Visione del prodotto

**[Requisito del proprietario del prodotto — sezione 1]**: VicoloBuilder deve essere un builder generale (siti tradizionali, a sezioni, a scene, misti), non limitato al caso Vicolo Cechov, con la struttura Site → Pagine/Pannelli → Scene → Elementi come esempio guida.

**[Fatto verificato: `packages/engine/src/document/types.ts:7-13`]**: `DocumentNode` ha `type: string` e `props: Record<string, unknown>` completamente liberi — nessun elenco chiuso di tipi di nodo nel codice.

**[Raccomandazione]**: il grafo di nodi attuale è già abbastanza generale da rappresentare sia un sito "normale" sia un sito "a scene" senza differenze di schema.

---

## 2. Modello concettuale

| Concetto | Stato | Base dell'affermazione |
|---|---|---|
| **Site** | = `Document`, nessun nuovo tipo | **[Fatto verificato: `document/types.ts:32-37`]** |
| **Page** | Esiste; manca comando di creazione/eliminazione/riordino | Vedi sez. 4 — **[Decisione presa dal proprietario del prodotto]**: riordino dentro Fase 5 |
| **Scene** | Convenzione (`type:"scene"`), nessuno schema dedicato | **[Raccomandazione]** |
| **Container** | Nodo con figli, pattern già in uso (`type:"box"`) | **[Fatto verificato]** |
| **Element** | Nodo libero | **[Fatto verificato]** |
| **Component** (master/istanza) | Non ora, non riservato — nessuna azione richiesta | **[Fatto verificato]**: zero occorrenze nel codice, solo commenti che lo dichiarano fuori scope (`resolver/invariants.ts:19`, `document/invariants.ts:21`) |
| **Embed** (elemento + slot di comportamento) | **Riservato concettualmente, fuori scope implementativo** | **[Decisione presa dal proprietario del prodotto]** — vedi sez. 11 |
| **Responsive base+override** | Esiste (`props.responsive`), convenzione d'uso ora fissata: **Desktop-first** | **[Decisione presa dal proprietario del prodotto]** — vedi sez. 8 |
| **State / Interaction / Behavior** (preset navigazione scene) | **Riservati concettualmente, fuori scope implementativo** | **[Decisione presa dal proprietario del prodotto]** — vedi sez. 12 |
| **Condition** | Si sovrappone a State, nessun concetto a sé | **[Raccomandazione]** |
| **Cervello di design AI** | Direzione futura voluta, fuori scope, con un vincolo abilitante da rispettare già ora | **[Decisione presa dal proprietario del prodotto]** — vedi sez. 12bis |

---

## 3-4. Cosa esiste già / cosa manca

Sezione prevalentemente fattuale, invariata nella sostanza.

- **[Fatto verificato]**: Document/CommandBus/History completi e testati (132 test, commit `863fdff`).
- **[Fatto verificato: `resolver/resolveNode.ts:14-33`, riga 27]**: il merge di `props.responsive` è generico (`Object.assign(result, override)`), copre qualunque proprietà.
- **[Fatto verificato: `layout/computeLayout.ts:13`]**: l'algoritmo di layout è dichiarato nel codice stesso come "PLACEHOLDER minimale... non un motore flex/grid".
- **[Fatto verificato: `runtime/commands.ts:12-15`]**: nessun comando tocca `document.pages` — manca creazione/eliminazione pagina.
- **[Fatto verificato: `document/types.ts:36`]**: `pages: ReadonlyMap<PageId, Page>`, nessun campo di ordinamento.
- **[Fatto verificato: `runtime/history.ts:5-9`]**: il codice della Fase 1 dichiara esplicitamente `History` come "il livello di stato 'Workspace'" di cui parla RFC-000 §1 — rilevante per la Decisione 2 (sez. 9).

---

## 5. Canvas

Invariato: nessun gap Engine — userebbe `resolveDocument`+`computeLayout`, già pubblici.

**[Requisito del proprietario del prodotto — sezione 4]**: vedere una scena alla volta per default, con modalità alternative.

---

## 6. Posizionamento libero + responsive — DECISIONI 1, 3 e 5

Questa sezione registra tre decisioni chiuse insieme, perché sono strettamente collegate: il posizionamento libero (Decisione 3) diventa gestibile senza fragilità solo grazie alla convenzione Desktop-first (Decisione 1) e all'indicatore ereditato/overridato (Decisione 5).

### Decisione 1 — Convenzione responsive: Desktop-first

**[Decisione presa dal proprietario del prodotto]**: si lavora partendo da Desktop (schermo grande) e si personalizza verso Tablet/Mobile. I valori "di base" (fuori da `props.responsive`) vanno trattati come i valori di Desktop; gli override vanno scritti solo verso il basso.

**[Fatto verificato: `resolver/breakpoints.ts:29-32`, `resolver/resolveNode.ts:14-33`]**: il motore sotto è costruito mobile-first (cascata min-width dal più stretto al più largo — un override scritto su una fascia stretta senza fascia più larga si propaga verso l'alto). Questo NON viene modificato: resta la stessa identica logica già testata in Fase 2.

**Conseguenza obbligata per la UI [Decisione presa dal proprietario del prodotto]**: l'editor deve imporre esplicitamente la convenzione Desktop-first, non lasciarla ambigua — altrimenti l'utente rischia il comportamento simmetrico indesiderato (un override lasciato solo su Mobile si propaga verso Desktop). Questo è un vincolo di design della UI derivato da un comportamento del motore, non un cambiamento del motore stesso.

### Decisione 3 — Posizionamento libero in Fase 5: sì, scaglionato

**[Decisione presa dal proprietario del prodotto]**: in Fase 5 entrano posizionamento libero degli elementi, ridimensionamento con maniglie, e guide di allineamento **di base** (centro scena, centro rispetto a un altro elemento, bordi allineati, snap semplice). Restano fuori dal primo giro (rifinitura immediatamente successiva): guide avanzate (distanze uguali tra più elementi, snap fine).

**Verifica richiesta esplicitamente dal proprietario — assunzioni nascoste oltre CHILD_OUT_OF_BOUNDS**: eseguita in questo turno, leggendo `layout/computeLayout.ts` e `layout/invariants.ts` per intero. Risultato — **tre assunzioni strutturali**, non solo quella già nota:

1. **[Fatto verificato: `layout/invariants.ts:22-33`]**: la regola `CHILD_OUT_OF_BOUNDS` impone che ogni figlio stia interamente dentro i bordi del genitore, **applicata ricorsivamente a ogni livello di annidamento**, non solo una volta alla radice — quindi anche un elemento libero dentro un contenitore libero annidato dentro un altro sarebbe controllato. Con il posizionamento libero questo va rivisto, perché sconfinare dal contenitore è a volte voluto (es. un'immagine decorativa).
2. **[Fatto verificato: `layout/computeLayout.ts:38-53`, in particolare riga 48]**: la larghezza (`width`) non è mai letta dalle proprietà di un nodo — è un **parametro** passato dalla funzione al momento della chiamata ricorsiva, e oggi viene sempre passato identico a tutti i figli (tutti ereditano per intero la larghezza del genitore). Il posizionamento libero richiede che ogni figlio possa avere la propria larghezza, il che significa cambiare come i numeri "viaggiano" nella ricorsione, non solo aggiungere una lettura in più.
3. **[Fatto verificato: `layout/computeLayout.ts:38-53`]**: un nodo **con figli** (contenitore) oggi non legge mai nulla dalle proprie proprietà per calcolare la propria dimensione — la calcola sempre sommando le altezze dei figli. Solo un nodo **senza figli** (foglia) può oggi specificare un'altezza propria (mai una larghezza propria). Un contenitore libero che voglia una dimensione propria esplicita non ha oggi nessun modo di dichiararla.

**[Fatto verificato: `resolver/variantTable.ts`]**: controllato anche se le tabelle di variant esistenti (`primary`/`secondary`) definiscono già chiavi tipo posizione/dimensione che potrebbero entrare in conflitto — nessuna trovata (solo `background`, `color`, `padding`, `radius`).

**Nessuna rottura di test esistenti trovata**: **[Fatto verificato: `test/layout/shape.test.ts`]** il test che verifica la forma del Box Tree non fissa numeri specifici dell'algoritmo a pila (controlla solo forma e corrispondenza dei `nodeId`) — un nuovo modo di disporre gli elementi, aggiunto come opzione in più (non sostituendo il comportamento di default), non lo romperebbe. Non ho riletto altrettanto a fondo `layout/determinism.test.ts` e `layout/purity.test.ts` in questo turno (già letti nei turni precedenti, contenuto non ricontrollato riga per riga ora) — nessun segnale di conflitto dalla lettura precedente, ma lo segnalo come verifica meno fresca delle altre due.

**Nota di rischio, riportata come richiesto**: la riusabilità della macchina di selezione/trascinamento tra layout impilato e libero è una **previsione**, non un fatto (il Renderer non esiste ancora) — va verificata all'inizio dell'implementazione, non data per scontata.

### Decisione 5 — "Mostra ereditato vs cambiato": dentro la Fase 5

**[Decisione presa dal proprietario del prodotto]**: l'interfaccia deve poter mostrare, per ogni proprietà e per la fascia che si sta guardando, se il valore è ereditato dalla base (Desktop) o è un override proprio di quella fascia.

**[Fatto verificato: `resolver/resolveNode.ts:52-63`]**: il valore risolto finale (`resolvedProps`) è piatto e non porta l'informazione di provenienza — questa funzione **non arriva gratis dal motore**.

**[Raccomandazione, non ancora verificata costruendo nulla]**: l'informazione resta comunque calcolabile leggendo il dato grezzo (`node.props.responsive.<fascia>`, che è pubblico) senza modifiche all'Engine — va scritta esplicitamente nel Renderer come parte della Fase 5.

**Aggiornamento — Fase 5, Blocco D (implementato)**: con l'introduzione del congelamento automatico delle fasce più larghe (Opzione A, per la geometria — vedi sez. 6 sopra e DECISIONS.md), l'indicatore dovrebbe distinguere TRE stati, non due: ereditato dalla base; override esplicito scritto apposta su questa fascia; override creato automaticamente dal congelamento. **[Fatto verificato: `packages/renderer-react/src/panel/geometryFieldState.ts`]**: implementati solo i primi due — un override scritto a mano e uno scritto dal congelamento hanno esattamente la stessa forma in `props.responsive.<fascia>`, quindi il terzo stato non è distinguibile leggendo solo il Document.

**[Decisione presa dal proprietario del prodotto]**: terzo stato rimandato a un miglioramento futuro, non nel Blocco D. Tra le due strade individuate, **Opzione 1 preferita**:
1. **(preferita)** Un metadato di provenienza dentro `props.responsive.<fascia>.<chiave>` (tocca l'Engine: il resolver dovrebbe "spacchettare" il metadato prima di leggere il valore — non additivo in modo ovvio, richiede progettazione propria quando verrà ripresa).
2. (scartata) Provenienza tenuta solo in memoria locale del Renderer per la sessione corrente — scartata perché non sopravvive a un ricaricamento/persistenza ed è essa stessa uno stato "nascosto" fuori da Document/History, in tensione con RFC-000 §1.

---

## 7. Guide e allineamento

**[Decisione presa dal proprietario del prodotto — sez. 6]**: guide di base (centro scena, centro rispetto ad altro elemento, allineamento bordi, snap semplice) dentro Fase 5; guide avanzate (distanze uguali, snap fine) rimandate alla rifinitura immediatamente successiva.

**[Fatto verificato: `layout/types.ts:10-17`]**: ogni `Box` porta già `x,y,width,height` — i dati grezzi necessari alle guide esistono già. La logica di calcolo (chi è "vicino" a chi, soglie di snap) va scritta nel Renderer.

---

## 8. Responsive: base + override ereditato

Confermato (invariato) il meccanismo esistente (`props.responsive`, D-009 in `DECISIONS.md`). La direzione d'uso è ora fissata dalla Decisione 1 (sez. 6): base = Desktop.

**[Requisito del proprietario del prodotto — sezione 7]**: fasce dati da prevedere (Desktop, Desktop compatto, Laptop compatto, Tablet P/L, Mobile P/L); v1 UI ridotta (Desktop/Tablet/Mobile).

**[Fatto verificato: `resolver/breakpoints.ts:9-13`]**: oggi 3 fasce hardcoded (`mobile:0, tablet:768, desktop:1024`). **[Raccomandazione]**: estendere la lista è additivo, non una riscrittura — nessun altro punto del codice assume che siano esattamente 3 oltre a un'asserzione di test (`test/resolver/breakpoints.test.ts:13`), normale da aggiornare quando si estende intenzionalmente.

Divisione di un testo in più parti per fascia: **[Fatto verificato: `document/types.ts:7-13`]** nessun concetto nuovo richiesto, sono più nodi `type:"text"`.

---

## 9. Selezione — DECISIONE 2

**[Decisione presa dal proprietario del prodotto]**: la selezione (e lo stato di sessione dell'editor) vive dentro `History` — l'oggetto che il codice stesso già dichiara essere il "Workspace" di RFC-000 §1. Sostituisce l'opzione A proposta nella bozza precedente di questo documento.

**[Fatto verificato: `runtime/history.ts:5-9`]**: il commento nel codice dice testualmente che `History` "is the 'Workspace'-level state the RFC-000 §1 (No Hidden State) principle refers to".

**Verifica richiesta esplicitamente — separazione da Undo/Redo**: **[Fatto verificato: `runtime/history.ts:11-56`]**, l'intera classe `History` oggi ha solo tre campi privati (`#past`, `#present`, `#future`, tutti array di `Document`) e tre metodi che li toccano (`execute`, `undo`, `redo`). Non esiste ancora nessun campo di selezione. **Perché questo garantisce la separazione richiesta**: `undo()`/`redo()` spostano solo `Document` tra `#past`/`#present`/`#future` — se un futuro campo `#selection` venisse aggiunto come campo indipendente (non incluso negli snapshot che viaggiano tra `#past`/`#future`), `undo()`/`redo()` non lo toccherebbero mai per costruzione, perché quei metodi non guardano altro che i tre array esistenti. Questa è una **[Raccomandazione]** sulla forma dell'estensione (non ancora implementata), verificata solo come "compatibile con la struttura attuale", non come codice scritto.

---

## 10. Device preview vs fascia salvata

Invariato: **[Requisito del proprietario del prodotto — sezione 8]** distinzione dispositivo-di-anteprima (puro dato UI) vs fascia-salvata (dato Engine) — non toccata dalle 5 decisioni. Lista concreta di dispositivi: domanda ancora aperta (vedi sez. G del turno precedente).

---

## 11. Elementi ed Embed — RISERVATO, FUORI SCOPE

**[Decisione presa dal proprietario del prodotto]**: l'embed (sia come elemento nel Canvas sia come slot di comportamento a livello pagina/scena) resta un concetto **riservato nel modello, implementazione rimandata** — né Fase 5 né necessariamente Fase 6.

- **Elemento embed**: `type:"embed"`, `props.code` contiene il codice grezzo — **[Raccomandazione]**, non implementata.
- **Slot di comportamento pagina/scena**: **la forma esatta resta esplicitamente aperta** — era la decisione più incerta del documento precedente (D4) e il proprietario del prodotto ha confermato che resta tale, non l'ha chiusa.
- **Isolamento** (iframe raccomandato su Shadow DOM per isolare anche l'esecuzione JS) e **responsive-solo-se-il-codice-lo-prevede**: **[Raccomandazione]**, invariate dalla bozza precedente, non implementate.

---

## 12. State, interazioni, comportamento di navigazione — RISERVATI, FUORI SCOPE

**[Decisione presa dal proprietario del prodotto]**: sia lo State/Interaction applicativo (es. toggle sedi) sia i preset di comportamento di navigazione tra scene (scroll verticale/orizzontale, snap, transizioni) restano **solo slot vuoti riservati nel modello**, nessun editor di comportamento ora.

**[Fatto verificato: ricerca testuale su `packages/engine/src`]**: nessuna rappresentazione di stato applicativo, interazione o comportamento esiste nel codice attuale.

**[Raccomandazione, non implementata]**: forma di riserva proposta — `props.byState` (analogo a `props.responsive`) per lo State; un campo tipo `props.sceneBehavior` su nodi `type:"scene"` per i preset di navigazione. Nessuna delle due è stata scritta.

---

## 12bis. Cervello di design AI — direzione futura, con vincolo abilitante da rispettare ORA

**[Decisione presa dal proprietario del prodotto]**: un assistente AI che proponga/curi il layout (tipo Lovable) è una direzione futura esplicitamente voluta, ma è un prodotto a sé, da costruire **dopo** che il motore ha le capacità manuali e i controlli su cui un assistente possa operare.

**[Fatto verificato: `PROJECT_BRIEF.md` riga 50]**: "provider AI" è esplicitamente elencato tra ciò che l'Engine non deve fare — quindi questo vincolo non è solo una scelta del proprietario, è già imposto dalla fonte architetturale.

**Vincolo abilitante da rispettare fin da ora, non solo in futuro [Decisione presa dal proprietario del prodotto]**: ogni azione dell'editor deve sempre passare dai comandi puliti e registrati del Command Bus, mai da scorciatoie nascoste — così un futuro assistente AI troverà una "tastiera" completa già pronta. **Questo è un vincolo di disciplina per l'implementazione della Fase 5 stessa**, non solo per il futuro: se il codice della Fase 5 introducesse una scorciatoia che modifica il Document senza passare da `applyCommand`, violerebbe questo vincolo già ora, non solo in prospettiva.

---

## A/B. Architettura Engine/UI/Electron/SEO/AI

Invariata rispetto alla bozza precedente, con un'aggiunta:

| Cosa | Dove vive | Base |
|---|---|---|
| Cervello di design AI (sez. 12bis) | **Mai nell'Engine** — servizio/prodotto separato che opera SOLO tramite Command Bus | **[Fatto verificato: `PROJECT_BRIEF.md` riga 50]** + **[Decisione presa dal proprietario del prodotto]** sul vincolo abilitante |

Il resto della tabella (Document/CommandBus/Resolver/Layout nell'Engine; interpretazione visiva/selezione/SEO deterministico/AI nel Renderer o fuori; filesystem in Electron) resta come nella bozza precedente, non ripetuta qui per brevità.

---

## C. Gap dell'Engine attuale

Invariata nella sostanza rispetto alla bozza precedente — vedi sez. 3-4.

---

## D. Decisioni ancora aperte (non chiuse da questo turno)

- **Forma esatta del comando/campo di riordino pagine** — **[Decisione presa dal proprietario del prodotto]**: il riordino entra in Fase 5; **[Raccomandazione, non ancora proposta in dettaglio]**: la forma tecnica (nuovo comando `REORDER_PAGES` vs campo esplicito `pageOrder` sul `Document`) va proposta nel piano tecnico del prossimo turno, non qui.
- **Forma esatta dello slot di comportamento embed** (sez. 11) — resta esplicitamente aperta.
- **Lista concreta di dispositivi di anteprima** (sez. 10) — non ancora affrontata.
- **"Griglia che va a capo" (layoutMode aggiuntivo, non-AI)** — **[Requisito del proprietario del prodotto]**: segnalato come possibile capacità intermedia, valutabile per Fase 5 o 6. Il proprietario del prodotto ha chiesto esplicitamente di essere interpellato prima di deciderne la collocazione — **non ancora analizzato**, in attesa di conferma se procedere con un'analisi dedicata.
- **Quanto Layout Engine costruire esattamente** (dettaglio tecnico di come implementare la Decisione 3) — rimandato al piano tecnico.
- **Registro di Capability/Property** — confermato non necessario ora (debito D-008 già accettato), invariato.

---

## E. Scope Fase 5 (aggiornato con le decisioni chiuse)

**[Requisito del proprietario del prodotto, vincolo confermato]**: l'implementazione della Fase 5 deve restare piccola e concreta, anche se il documento guarda alla visione intera.

Rispetto alla bozza precedente, lo scope si allarga su alcuni punti per effetto delle decisioni chiuse, e resta invariato/ristretto sugli altri:

**Dentro Fase 5 (aggiornato)**:
1. Scaffolding `packages/renderer-react/`.
2. Canvas che disegna i Box reali, una pagina/scena alla volta.
3. Pochi tipi di elemento (testo, immagine, contenitore).
4. Pannello proprietà minimale (non auto-generato).
5. Undo/redo (binding su `History`).
6. **Selezione dentro `History`, separata dagli snapshot di undo/redo (Decisione 2).**
7. Responsive: 3 fasce (Desktop/Tablet/Mobile), **convenzione Desktop-first imposta esplicitamente in UI (Decisione 1)**, **indicatore ereditato/overridato (Decisione 5).**
8. **Posizionamento libero, ridimensionamento con maniglie, guide di base (Decisione 3)** — con revisione della regola `CHILD_OUT_OF_BOUNDS` e delle tre assunzioni strutturali trovate in sez. 6.
9. Comando pagina: creazione/eliminazione **+ riordino (Decisione 4)**.
10. Vincolo invariato: nessuna modifica alla Public API Engine esistente.
11. **Vincolo di disciplina (sez. 12bis): ogni azione passa dal Command Bus, nessuna scorciatoia diretta sul Document.**

**Esplicitamente FUORI dalla Fase 5** (confermato, ora esplicitamente "porte future riservate"): embed, State/Interaction/Behavior di navigazione, Cervello di design AI, Component, SEO Assistant, Exporter reale, device preview realistico con cornici/notch, guide avanzate, tipografia fluida, Capability Registry completo, "griglia che va a capo" (in attesa di conferma se analizzarla).

---

## F. Rischi architetturali

Invariati dalla bozza precedente, con l'aggiunta delle tre assunzioni strutturali trovate in sez. 6 (parametro larghezza ereditato per costruzione, contenitori senza dimensione propria dichiarabile, controllo bordi ricorsivo a ogni livello) come rischi concreti da affrontare esplicitamente nel piano tecnico, non durante l'implementazione.

---

## G. Domande ancora aperte per il proprietario del prodotto

Ridotte rispetto alla bozza precedente (5 delle 6 domande originarie sono state risolte dalle decisioni chiuse). Restano aperte:

- Quali elementi vuoi assolutamente nella primissima versione (Domanda 4 del turno precedente, non toccata dalle 5 decisioni).
- Quali dispositivi vuoi nella lista di anteprima (Domanda 6, non toccata).
- Se vuoi che la "griglia che va a capo" venga analizzata come capacità a parte ora, prima di deciderne la collocazione (nuova domanda, sez. D).

---

## H. Roadmap proposta

Aggiornata per riflettere le decisioni chiuse — **[Raccomandazione]**, non ancora un piano tecnico:

**FASE 5**: vedi sez. E (elenco aggiornato).

**FASE 6**: guide avanzate; device preview realistico; fasce responsive estese oltre le 3 base; pannello proprietà più ricco; forma definitiva del riordino pagine se non completata in Fase 5.

**FASI FUTURE**: embed (elemento + slot di comportamento, forma ancora aperta); State/Interaction/Behavior di navigazione reali; Cervello di design AI (subordinato al rispetto del vincolo Command-Bus-only fin da ora); Component; Capability/Property Registry completo; SEO Assistant completo; Exporter HTML/React/Vue reale; auto-fit testo; Electron App.

---

*Documento persistito su richiesta del proprietario del prodotto. Non ancora committato — in attesa di conferma esplicita prima del commit, come da istruzione. Il piano tecnico dettagliato della Fase 5 sarà oggetto di un turno successivo, non di questo documento.*
