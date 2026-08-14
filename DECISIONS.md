# Decision Log

Registro versionato delle decisioni architetturali rilevanti, con la loro motivazione, l'evidenza disponibile al momento della decisione, e quando vanno rivalutate. Non sostituisce le RFC (`PROJECT_BRIEF.md`) — le RFC definiscono i vincoli, questo file registra le scelte fatte dentro lo spazio che le RFC lasciano aperto.

Le voci D-001/D-002/D-003/D-004 sono un backfill delle decisioni prese durante la Fase 1 (Document + CommandBus + History), non ancora registrate in un log persistente prima d'ora. Le voci D-005+ sono emerse durante l'analisi di apertura della Fase 2.

---

## D-001 — Immutabilità runtime (Document)

**Stato**: nessuna immutabilità runtime per ora (`Object.freeze` o equivalente non implementato). `readonly`/`ReadonlyMap` restano garanzie solo compile-time.

**Motivazione**: nessun consumer esterno esiste ancora che possa violare "Command Bus unico punto di scrittura" (RFC-000 §3) bypassando `applyCommand` — il CLI è Fase 3, il renderer-react è Fase 5. L'Engine stesso non muta mai il proprio input (verificato via grep diretto sugli import/pattern vietati + test di purezza).

**Evidenza disponibile**: analizzate 4 opzioni indipendenti (nessuna / freeze solo dev / freeze completo / freeze solo test harness). Un freeze completo naive (l'intero Document risultante, non solo gli oggetti nuovi) misura +2,8ms per comando a N=10.000 nodi (+40% sopra il costo base di ~6,5ms), riducendo il margine sulla soglia di 16ms da 2,4× a ~1,7×. L'opzione "freeze solo in development" è risultata tecnicamente in conflitto con `purity.test.ts` (che vieta la lettura di `process.env` dentro `packages/engine/src`, coerente con RFC-000 §2/§10) a meno di essere implementata come opt-in esplicito lato-consumer. Traccia scritta anche in `packages/engine/src/document/types.ts` (commento sopra l'interfaccia `Document`).

**Rivalutazione**: esplicitamente all'inizio della Fase 3, con l'introduzione del CLI (primo consumer esterno reale).

---

## D-002 — Cold-start di `execute()`

**Stato**: non è un problema dimostrato per la Fase 2.

**Motivazione**: Resolver e LayoutEngine, per come descritti in RFC-003/RFC-004, non chiamano `execute()`/`applyCommand` — leggono un Document già esistente e producono un output derivato, senza passare dal CommandBus. Il dato misurato riguarda un componente diverso (`applyCommand`), non trasferibile 1:1 a codice non ancora scritto.

**Evidenza disponibile**: la primissima chiamata di processo ad `applyCommand` contro un Document da 10.000 nodi costa ~16-38ms, contro ~5-8ms dalla seconda/terza chiamata sulla stessa "forma" di dato. **Correzione rispetto alla formulazione iniziale**: l'attribuzione di questo costo a "JIT/inline-cache di V8" non è stata isolata sperimentalmente (nessun uso di `--jitless`/`--trace-opt`/`--trace-deopt`) — è un'inferenza plausibile basata sull'osservazione di un pattern di convergenza su chiamate ripetute, non una causa dimostrata. La conclusione operativa (non è un problema per Fase 2) non dipende dalla causa esatta, solo dal fatto che il componente misurato (`applyCommand`) è diverso da quello che la Fase 2 introdurrà.

**Rivalutazione**: quando esisterà un vero path di caricamento/import di un documento salvato (Fase 3, CLI) — lì la domanda diventa misurabile con dati reali invece che per analogia.

---

## D-003 — Costo O(n) delle mutazioni del Document (`new Map(document.nodes)`)

**Stato**: nessuna riscrittura della struttura dati; il costo O(n) per comando (O(n²) cumulativo su sequenze lunghe) è accettato e documentato, non ottimizzato.

**Motivazione**: misurato che il costo marginale di un singolo comando (`CREATE_NODE`/`UPDATE_PROPS`/`DELETE_NODE`) a N=10.000 nodi resta entro tutti i budget di RFC-000 §6 con margine ≥1,9× anche sul più stretto (16ms). Il costo cumulativo O(n²) (fino a ~27s per costruire 10.000 nodi via comandi sequenziali) esiste ma non corrisponde a nessun requisito esplicito di RFC-000 (nessuna sezione della RFC, riletta per intero, parla di throughput/bulk-import/limiti temporali cumulativi). Riscrivere ora la struttura dati (es. persistent map/HAMT) sarebbe ottimizzazione senza una violazione misurata da correggere.

**Evidenza disponibile**: benchmark isolati per comando a 1.000/2.000/4.000/8.000/10.000 nodi (Fase 1, Priorità 1.1); scomposizione della cascata di `DELETE_NODE` che esclude `collectSubtreeIds` come causa (cancellare un sottoalbero da 5.000 nodi costa ~7,9ms contro ~6,0ms per uno da 10 nodi, a documento totale fisso). Commento in-code su tutti e 3 i siti (`packages/engine/src/runtime/commands.ts`, righe 68/87/103 circa).

**Rivalutazione**: se il target nodi cresce molto oltre 10.000, oppure se viene introdotta un'operazione di bulk-edit che emette molti comandi senza pause di rendering.

---

## D-004 — Metodologia dei benchmark di performance

**Stato**: ogni benchmark su operazioni sub-16ms misura la MEDIANA su più ripetizioni dopo un warm-up esplicito, mai un singolo campione a soglia temporale diretta.

**Motivazione**: un design a singola misura si è dimostrato flaky in questo ambiente sandboxato (fino a ~21ms su singolo campione contro una mediana reale di 5-6ms), per rumore dello scheduler/worker-thread di vitest — non per un difetto del codice misurato (uno script Node standalone con lo stesso identico warm-up è rimasto stabile sotto 8,3ms su 30 campioni).

**Evidenza disponibile**: `packages/engine/test/performance.test.ts` — 15 esecuzioni consecutive verdi dopo l'adozione di mediana-su-15-ripetizioni, contro un tasso di fallimento di circa 2/5 con singolo campione anche dopo warm-up generico.

**Rivalutazione**: non prevista salvo emerga nuova flakiness; in quel caso il primo intervento è aumentare il numero di ripetizioni misurate, non aggiungere altro warm-up non giustificato da una misura.

---

## D-005 — Immutabilità runtime estesa a ResolvedModel/Box Tree (Fase 2)

**Stato**: nessuna immutabilità runtime, stessa conclusione di D-001, estesa qui con motivazione propria.

**Motivazione**: vale anche qui perché nessun consumer esterno esiste ancora che possa mutare accidentalmente un `ResolvedModel` o un Box Tree — la stessa condizione fattuale di D-001 (CLI = Fase 3, renderer-react = Fase 5), non un'eredità automatica della conclusione di D-001. La premessa è verificata indipendentemente: né RFC-003 né RFC-004 menzionano consumer di Resolver/Layout prima della Fase 5.

**Evidenza disponibile**: nessuna misura specifica su ResolvedModel/Box Tree (non esistono ancora); il ragionamento è per analogia sulla premessa (assenza di consumer), non sul costo (il costo di un eventuale freeze su una struttura diversa da Document non è stato misurato).

**Rivalutazione**: stessa di D-001 — inizio Fase 3.

---

## D-006 — Nessuna soglia numerica fissata ora per il costo combinato Resolver+Layout

**Stato**: non viene fissata una soglia in millisecondi per Resolver+Layout in questa fase di analisi.

**Motivazione**: RFC-000 §6 dà un solo numero complessivo ("export preview <100ms") che copre concettualmente Resolver+Layout+Exporter insieme; Exporter non esiste ancora e non è chiaro quanto budget si riserverà. Fissare ora una frazione arbitraria di quel numero per Resolver+Layout ripeterebbe esattamente l'errore che l'utente ha chiesto di evitare in Fase 1 (soglie non motivate da un dato).

**Evidenza disponibile**: nessuna — è l'assenza di dato a motivare l'assenza di soglia.

**Rivalutazione**: quando si scriverà il benchmark reale in fase di implementazione di Fase 2, o quando l'Exporter avrà una forma concreta che permetta di ripartire il budget.

---

## D-007 — Layout incrementale vs completo

**Stato**: LayoutEngine ricalcola sempre l'intero Box Tree da zero (nessun ricalcolo incrementale/parziale) per ora.

**Motivazione**: stesso schema già usato in D-003 per il costo O(n) del `Map`-copy del Document — si accetta la soluzione più semplice e corretta finché un benchmark reale non dimostra una violazione, invece di introdurre in anticipo la complessità di un ricalcolo incrementale (short-circuit sulle sole porzioni del Document cambiate da un comando) senza un dato che la giustifichi.

**Evidenza disponibile**: nessuna — LayoutEngine non esiste ancora, il costo di Resolver+Layout a scala target (proprietà 12 della matrice di apertura Fase 2) non è stato ancora misurato.

**Rivalutazione**: quando il benchmark della proprietà 12 (una volta implementato) mostrerà che il ricalcolo completo viola il budget assegnato a Resolver+Layout — budget la cui soglia numerica non è ancora stata fissata (D-006). Non prima, per evitare di introdurre la complessità dell'incrementale senza una prova che serva.

---

## D-008 — Debito verso RFC-002 (tabella incorporata invece del Capability/Property Registry)

**Stato**: il Resolver di Fase 2 usa un mapping dichiarativo semplice incorporato (`variantTable.ts`), non il Capability Registry + Property Registry completo descritto in RFC-002.

**Motivazione**: coerente con lo scope "Resolver base" del piano operativo di Fase 2 (righe 129-136 del brief), che non menziona un registro — solo "risoluzione breakpoint + variant semantico". Costruire il registro completo ora sarebbe anticipare lavoro di RFC-002 non richiesto dal vertical slice, con il rischio di indovinare una forma sbagliata prima di avere un secondo caso d'uso reale che la vincoli.

**Evidenza disponibile**: nessuna misura — è una scelta di scope, non di prestazioni. Costo di migrazione noto e accettato: quando esisterà il registro completo, andrà toccato ciò che oggi consuma la tabella incorporata (`resolver/resolveNode.ts`).

**Rivalutazione**: quando/se si costruirà il registro completo (RFC-002, fuori dallo scope della Fase 2 del vertical slice).

---

## D-009 — Convenzione `props.responsive` per gli override per breakpoint

**Stato**: un nodo rappresenta gli override responsive con una proprietà riservata `props.responsive = { <breakpointName>: { ...override } }` (es. `props.responsive = { desktop: { padding: 24 } }`). È il meccanismo dichiarativo incorporato usato dal Resolver di Fase 2 per applicare la cascata mobile-first tra breakpoint (`resolver/resolveNode.ts`, `applyBreakpointOverrides`).

**Motivazione**: il Resolver deve poter risolvere "breakpoint" (Fase 2, riga 131 del piano operativo) contro un Document i cui nodi hanno un'unica `props: Record<string, unknown>` piatta (RFC-002/Fase 1) — senza un campo dedicato nel modello dati per gli override, serve una convenzione su come questi vengono rappresentati dentro `props` stessa. `responsive` è la chiave scelta, consumata durante la risoluzione e mai presente in `resolvedProps` (l'output finale non la espone).

**Natura della decisione**: è una convenzione interna e minimale, non un Capability/Property Registry completo — nessuna validazione dichiarativa della forma degli override, nessun controllo che le chiavi dentro `responsive` siano breakpoint noti (un nome sconosciuto viene semplicemente ignorato, non segnalato). Stessa scelta di scope di D-008: sufficiente per il vertical slice, non la forma finale.

**Evidenza disponibile**: nessuna misura — è una scelta di rappresentazione dei dati, non di prestazioni. Testata in `test/resolver/breakpoints.test.ts` (cascata mobile-first, assenza della chiave `responsive` in `resolvedProps`, comportamento invariato per nodi senza override).

**Rivalutazione**: quando una fonte successiva (RFC-002 completo, o una revisione di RFC-003) definirà una forma diversa per rappresentare gli override responsive, o quando arriverà il Capability/Property Registry completo (D-008) che potrebbe rendere questa convenzione ridondante o sostituirla con una rappresentazione validata.

---

## D-010 — Superficie pubblica semver: `BREAKPOINTS`/`VARIANT_TABLE` restano dettagli interni

**Stato**: `BREAKPOINTS`, `getBreakpoint`, `cascadingBreakpoints` e `VARIANT_TABLE` non sono esportati da `packages/engine/src/index.ts` (la superficie pubblica versionata per semver, RFC-000 §9/§11). Restano importabili internamente dai moduli dell'Engine e dai test tramite i loro percorsi diretti (`resolver/breakpoints.js`, `resolver/variantTable.js`), invariati.

**Motivazione**: sono strutture dati esplicitamente provvisorie (D-008 per `VARIANT_TABLE`; la lista fissa di breakpoint condivide la stessa natura di scelta di scope minimale per il vertical slice) e non esiste oggi alcun consumer esterno reale che ne richieda l'esposizione — verificato: nessun file nella suite di test importa alcunché dal barrel `src/index.ts`, nemmeno per gli export di Fase 1. Legare a semver (RFC-000 §9: "breaking change = major bump") dati grezzi che si sa già dover cambiare forma esporrebbe l'Engine a un costo di rottura evitabile.

**Nota di simmetria con Fase 1**: a differenza di questi due, i validator/error type di Resolver e Layout (`validateResolvedModel`, `assertValidResolvedModel`, `ResolvedModelInvariantError`, `validateBox`, `assertValidBox`, `BoxInvariantError`, e i relativi tipi) **restano esportati**, per coerenza diretta con l'equivalente già stabilito in Fase 1 (`validateDocument`/`assertValidDocument`/`DocumentInvariantError` sono già Public API dalla Fase 1, senza riserva di provvisorietà) e perché RFC-000 assegna esplicitamente al Test Runner (Fase 4) il compito di verificare gli invariant dall'esterno del package.

**Evidenza disponibile**: nessuna misura — è una scelta di scope della Public API, non di prestazioni.

**Rivalutazione**: quando emergerà un consumer esterno reale (CLI, Fase 3; renderer-react, Fase 5; Test Runner, Fase 4) che necessiti di conoscere i nomi di breakpoint/variant validi dall'esterno del package, o quando una fonte architetturale (es. RFC-002 completo, o una revisione di RFC-003 sul meccanismo di plugin) definirà la forma definitiva di queste strutture. In quel momento la superficie esposta andrà progettata intenzionalmente (es. solo nomi validi, non l'intera struttura dati interna), non ricavata automaticamente da ciò che oggi esiste internamente.

---

## D-011 — Limite di profondità ricorsiva condiviso (Document, Resolver, Layout)

**Stato**: rischio strutturale registrato, nessuna correzione applicata in questo momento.

**Motivazione**: esistono quattro punti ricorsivi indipendenti che condividono la stessa vulnerabilità a `RangeError: Maximum call stack size exceeded` su alberi molto profondi, distribuiti tra Fase 1 e Fase 2: `document/invariants.ts` (`visit()` per il rilevamento cicli, Fase 1, invocato incondizionatamente da ogni `applyCommand`), `resolver/invariants.ts` (stessa struttura, Fase 2), `layout/computeLayout.ts` (`layoutNode()`, ricorsione di costruzione, Fase 2), `layout/invariants.ts` (`visit()` per il controllo dei bound, Fase 2). Nessuna fonte (RFC-000 §6, RFC-004, RFC-002) specifica che il target di 10.000 nodi debba reggere indipendentemente dalla forma dell'albero — il requisito è silente sulla struttura, non la esclude né la impone. Il vettore realistico per raggiungere le profondità coinvolte (migliaia di livelli) tramite normale interazione drag-and-drop è valutato molto basso (analisi di prodotto, non garanzia verificabile — il renderer-react di Fase 5 non esiste ancora); un vettore più concreto è la costruzione programmatica di un Document (CLI di Fase 3 che legge JSON arbitrario, o un'estensione futura del test property-based di Fase 1 oltre le 40 operazioni attuali).

**Evidenza disponibile**: misurato in processi Node isolati (non nello stesso processo, che altera la soglia osservata): `computeLayout` fallisce su una catena tra N=3500 (OK) e N=4000 (FAIL); `resolveDocument` tra N=5000 e N=5200; `validateDocument`/`assertValidDocument` (Fase 1) tra N=5000 e N=5500. Un albero bilanciato (branching=8) da 10.000 nodi — l'intera capacità target di RFC-000 §6 — non mostra alcun problema. La dimensione dello stack V8/Node non è specificata da ECMAScript ed è nota per essere dipendente dall'ambiente (OS, versione, flag di avvio, persino dallo stato del processo) — questi numeri non sono una costante universale.

**Rivalutazione**: verificato end-to-end (non solo per analogia) su `builder export`: un JSON esterno con catena a 6.000 nodi (sopra le soglie storiche di `validateDocument`, 5000-5500) produce un errore CLI pulito (exit 1, nessuno stack trace) grazie alla cattura del `RangeError` al confine CLI (Opzione 3, nessuna modifica ai 4 punti ricorsivi dell'Engine). La deserializzazione stessa (`document/deserialize.ts`) è iterativa per costruzione — nessun quinto punto introdotto, confermato anche nell'implementazione reale, non solo nell'analisi. Prossima rivalutazione: se in futuro si sceglierà un formato di caricamento non piatto, o se emergerà un vettore diverso dai 4+CLI già coperti.

---

## D-012 — Formato dell'IR ("Meta") e formato di deserializzazione JSON→Document

**Stato**: `Meta = { pageId, breakpoint }`; `exportIR(document, context): IR` con `context.breakpoint`, `context.pageId` e `context.viewportWidth` obbligatori ed espliciti (nessun default nascosto dentro l'Engine); Box Tree invariato da Fase 2 (`{nodeId,x,y,width,height,children}`); deserializzazione JSON→Document piatta/iterativa, simmetrica a `serializeDocument`; nessun `export/invariants.ts` dedicato per ora.

**Motivazione**: `pageId` e `breakpoint` sono richiesti da bisogni già presenti nel codice — `computeLayout` è già oggi single-page per costruzione (`options.pageId`, `packages/engine/src/layout/computeLayout.ts`), `ResolverContext.breakpoint` è già oggi un campo obbligatorio (`packages/engine/src/resolver/types.ts`) — non da usi futuri ipotetici, coerentemente con D-006/D-007. `viewportWidth` è stato aggiunto per lo stesso motivo dopo la stesura iniziale del piano: `ComputeLayoutOptions.viewportWidth` è già oggi un campo obbligatorio senza default in `computeLayout`, quindi `exportIR()` non può ometterlo. `pageName`/`schemaVersion` restano esclusi da Meta: nessuna funzione della pipeline li consuma oggi, sarebbero giustificati solo da un uso futuro ipotetico (stesso principio di D-006/D-007). Formato piatto per la deserializzazione preferito perché elimina strutturalmente (non solo mitiga) il rischio di un quinto punto ricorsivo rilevante per D-011 (nessuna fonte impone un formato annidato). Nessun validator dedicato perché `resolveDocument`/`computeLayout` validano già i propri output prima di restituirli, e Meta non introduce una struttura a grafo propria.

**Natura della decisione**: convenzione minimale per il vertical slice, non la forma finale/completa dell'IR prevista da RFC-005 — stessa natura di scelta-di-scope di D-008/D-009. Non copre i valori di default lato CLI per `breakpoint`/`viewportWidth` (`"desktop"`/`1280`, precedente informale dello script demo di Fase 2, non una relazione architetturale Engine): quella è una scelta UX del consumer CLI, documentata con un commento inline nel codice, non in questa voce.

**Evidenza disponibile**: nessuna misura di prestazioni — scelta di rappresentazione dati, verificata sul codice esistente (citazioni sopra).

**Rivalutazione**: quando un vero Exporter (HTML/React/Vue, fuori scope) rivelerà un bisogno concreto non coperto da questa Meta minimale, o quando RFC-005 verrà completata.

---

## D-013 — `Document.pageOrder` esplicito (Fase 5, Blocco A)

**Stato**: `Document` porta un campo `pageOrder: readonly PageId[]`, obbligatorio sul tipo in memoria, opzionale nel formato JSON esterno (`deserializeDocument` calcola un fallback alfabetico se assente). `serializeDocument` lo scrive preservando l'ordine reale (non riordinato alfabeticamente, a differenza di `pages`/`nodes`). Nuovi comandi `CREATE_PAGE`/`DELETE_PAGE`/`REORDER_PAGES` lo mantengono coerente (append in coda, rimozione, sostituzione completa via permutazione validata).

**Motivazione**: l'ordine di inserimento in una `Map` non sopravvive alla serializzazione (`serializeDocument` ordina `pages`/`nodes` alfabeticamente per id, di proposito, per il determinismo dell'hash — vedi `document/hash.ts`), esattamente lo stesso problema già risolto in Fase 1 per i figli di un nodo con `childrenIds`. Il riordino di pagine è un requisito esplicito di prodotto (PRODUCT_DESIGN.md, Decisione 4) che richiede un ordine osservabile e persistente, non solo un ordine implicito di iterazione.

**Natura della decisione**: `DELETE_PAGE` rifiuta di eliminare la pagina che coincide con `Document.rootPageId`, oltre a rifiutare l'eliminazione dell'ultima pagina rimasta — scelta conservativa emersa durante l'implementazione (non nel piano originale, segnalata a parte): nessun comando oggi permette di riassegnare `rootPageId`, quindi eliminarne la pagina lascerebbe il Document privo di una pagina predefinita valida (violazione `ROOT_PAGE_NOT_FOUND`) senza modo di ripararlo.

**Evidenza disponibile**: nessuna misura di prestazioni — scelta di rappresentazione dati, stessa natura di D-009. Verificato: rendere il campo obbligatorio sul tipo `Document` (non opzionale) richiede che ogni `Document` costruito a mano nei test esistenti lo includa — 3 file (`hash.test.ts`, `history.test.ts`, `performance.test.ts`) aggiornati di conseguenza; nessun consumer reale (`packages/cli`, `packages/test-runner`) costruisce `Document` a mano (solo `createDocument`/`deserializeDocument`), quindi nessuna rottura effettiva nonostante il campo sia obbligatorio e non opzionale sul tipo. Testato in `test/pages.test.ts` (12 test), estensioni a `test/invariants.test.ts` e `test/deserialize.test.ts`.

**Rivalutazione**: quando emergerà un comando per riassegnare `rootPageId` — a quel punto va deciso esplicitamente cosa succede a `DELETE_PAGE` sulla pagina che era radice.

---

## D-014 — `Box.mode` e condizionalità di `CHILD_OUT_OF_BOUNDS` (Fase 5, Blocco B)

**Stato**: `Box` porta un campo opzionale `mode?: "pila" | "libero"`, impostato da `layoutNode()` in base a `resolvedProps.layoutMode` del nodo stesso (non del genitore) — descrive come QUEL nodo dispone i propri figli. `layout/invariants.ts` applica `CHILD_OUT_OF_BOUNDS` solo se il genitore ha `mode !== "libero"` (quindi anche quando `mode` è assente, per compatibilità con l'algoritmo a pila preesistente).

**Motivazione**: tre assunzioni strutturali del LayoutEngine di Fase 2 (documentate in PRODUCT_DESIGN.md, sez. 6, decisione 3) bloccavano il posizionamento libero: il controllo dei bordi si applicava incondizionatamente a ogni livello; la larghezza era un parametro sempre ereditato top-down, mai letto dalle proprietà di un nodo; un contenitore non leggeva mai proprie dimensioni esplicite. Aggiungere un campo di modalità al `Box` (anziché, ad esempio, dedurre la modalità dalla sola presenza di `x`/`y` su un figlio) rende la biforcazione pila/libero determinata esplicitamente dalla modalità propria del GENITORE, non dalla presenza casuale di un prop su un figlio — scelta esplicitamente verificata per evitare che una `width` esplicita su un figlio possa silenziosamente alterare il comportamento a pila già testato.

**Natura della decisione**: campo verificato additivo prima dell'implementazione (nessun test esistente confrontava la forma esatta di un `Box` con `toStrictEqual`/`toEqual` contro un letterale scritto a mano senza questo campo — l'unico punto a rischio, `test/layout/invariants.ts`, costruisce `Box` a mano solo per `validateBox()`, mai confrontato con l'output di `computeLayout()`). Il comportamento a pila resta byte-per-byte invariato quando `layoutMode` è assente, verificato con un test di regressione a `toEqual` sull'intero Box Tree (`test/layout/libero.test.ts`).

**Evidenza disponibile**: 10 nuovi test in `test/layout/libero.test.ts` — posizionamento esplicito, ancora del contenitore che trascina i figli liberi, bounds-check condizionale, oltre ai casi in D-015.

**Rivalutazione**: quando le guide di allineamento avanzate (PRODUCT_DESIGN.md, sez. 7) richiederanno di leggere `mode` per decidere quali box offrono snap; quando/se emergerà una terza modalità di disposizione (es. griglia — PRODUCT_DESIGN.md, sez. D, "griglia che va a capo", esplicitamente non ancora analizzata).

---

## D-015 — Coordinate locali e dimensionamento esplicito-o-automatico in modalità libera (Fase 5, Blocco B)

**Stato**: un figlio posizionato liberamente ha `resolvedProps.x`/`y` interpretati come offset LOCALE rispetto all'ancora assoluta del proprio contenitore (default 0 se assente), sommato all'ancora per ottenere la posizione assoluta nel Box Tree. La larghezza è obbligatoria senza default per un nodo senza figli propri posizionato liberamente (nessun fallback), estesa anche a un nodo CON figli la cui modalità propria è "pila" (una pila non ha un concetto di larghezza calcolata dal contenuto, eredita sempre dall'alto — quindi, priva di un'ereditarietà disponibile perché il genitore è libero, non ha alcun modo di determinare la propria larghezza se non esplicito). Un contenitore la cui modalità propria è "libero", senza `width`/`height` esplicite, usa un riquadro automatico che racchiude i figli: l'ancora del contenitore resta il punto di riferimento e il riquadro si allarga solo verso l'esterno per includere ogni figlio (anche con offset negativo), senza mai ri-basare le coordinate dei figli.

**Motivazione**: coordinate locali (anziché assolute) scelte esplicitamente perché rendono "gratuito" lo spostamento di un contenitore che trascina con sé i figli liberi, e preservano l'economia Desktop-first (non serve ri-overridare ogni figlio quando si sposta un contenitore su una fascia più stretta). Il riquadro automatico ancorato (anziché un bounding-box puro dei soli figli) è stato necessario per restare compatibile con un genitore a pila: un bounding-box che ignora l'ancora del genitore fa "vagare" il contenitore rispetto alla posizione che la pila gli ha assegnato, rompendo il contenimento anche senza alcuno sconfinamento negativo — verificato empiricamente durante l'implementazione (primo giro di test fallito, corretto prima del commit).

**Natura della decisione**: due default impliciti non decisi esplicitamente altrove, applicati per coerenza interna: offset locale assente → 0; altezza di un figlio libero senza figli propri, se assente, → `DEFAULT_LEAF_HEIGHT` (40, la stessa costante già usata in modalità pila), non un valore obbligatorio come la larghezza (la Decisione 3 del proprietario del prodotto restringeva l'obbligo alla sola larghezza).

**Evidenza disponibile**: `test/layout/libero.test.ts` — riquadro automatico con e senza sconfinamento negativo, larghezza obbligatoria (leaf e contenitore-a-pila-senza-larghezza-ereditabile), conseguenza collaterale testata esplicitamente: un contenitore libero che si espande in negativo può comunque violare `CHILD_OUT_OF_BOUNDS` se il SUO genitore è a pila (comportamento corretto e voluto, non un bug).

**Rivalutazione**: quando le guide di allineamento (non ancora implementate, vedi analisi separata di questo turno) definiranno come vengono proposti gli snap sui bordi di un riquadro automatico che si sposta a ogni modifica dei figli.

---

## D-016 — Selezione separata da undo/redo dentro `History` (Fase 5, Blocco C)

**Stato**: `History` possiede `#selection: NodeId | null` (singola, non un insieme), con `select()`/`deselect()`/`get selection()`. Campo indipendente da `#past`/`#present`/`#future`: `select()`/`deselect()` non chiamano mai `applyCommand`, non creano una voce di undo/redo, non vengono toccati da `execute()`/`undo()`/`redo()`.

**Motivazione**: il codice di `History` dichiara esplicitamente se stesso come "il livello di stato 'Workspace'" a cui fa riferimento RFC-000 §1 (No Hidden State) — la selezione è stato di sessione dell'editor, non deve vivere in `useState` locale della UI. Verificato prima dell'implementazione che l'estensione fosse strutturalmente sicura: `undo()`/`redo()` in Fase 1-2 toccano solo i tre array esistenti, senza possibilità di toccare un campo indipendente aggiunto in seguito, per costruzione.

**Natura della decisione**: conseguenza esplicita e voluta del disaccoppiamento, non decisa altrove: la selezione NON viene convalidata contro il Document corrente. Se il nodo selezionato scompare (`DELETE_NODE`, o `undo()` di una `CREATE_NODE`), la selezione resta "pendente" (punta a un `nodeId` inesistente) finché qualcosa non chiama di nuovo `select()`/`deselect()`. Un consumer (renderer-react) deve trattare `selection` come potenzialmente non risolvibile — gestito esplicitamente in `PropertyPanel.tsx`.

**Evidenza disponibile**: `test/selection.test.ts` (8 test) — inclusa la verifica esplicita che `undo()`/`redo()` non toccano la selezione anche quando il nodo selezionato scompare.

**Rivalutazione**: se in una fase futura si deciderà selezione multipla (esplicitamente fuori scope per Fase 5, PRODUCT_DESIGN.md Decisione 5) — la forma `NodeId | null` andrebbe sostituita, non estesa.

---

## D-017 — `History.activeBreakpoint` (Fase 5, Blocco D)

**Stato**: `History` possiede `#activeBreakpoint: BreakpointName`, default `"desktop"`, con `get activeBreakpoint()`/`setActiveBreakpoint()`. Stesse garanzie di `#selection` (D-016): separato da undo/redo, nessun comando. A differenza della selezione, `setActiveBreakpoint()` convalida il nome contro l'elenco dei breakpoint noti (`resolver/breakpoints.ts`, interno — D-010), lanciando su un nome sconosciuto.

**Motivazione**: decide se una scrittura di un consumer va sui props base di un nodo (vista "desktop", la fascia di default per la convenzione Desktop-first di PRODUCT_DESIGN.md, Decisione 1) o dentro `props.responsive.<fascia>` (viste più strette) — è stato di sessione dell'editor con lo stesso status della selezione, non un valore locale della UI, per lo stesso principio RFC-000 §1 di D-016. La convalida (a differenza della selezione) è stata scelta perché un nome di fascia sconosciuto non ha un "nodo scomparso" plausibile da tollerare: è quasi certamente un refuso di chi chiama.

**Evidenza disponibile**: `test/activeBreakpoint.test.ts` (6 test).

**Rivalutazione**: quando le fasce responsive verranno estese oltre le 3 attuali (PRODUCT_DESIGN.md, sez. 8) — `setActiveBreakpoint` non richiede modifiche (già generico), ma la costante di sola UI `renderer-react/src/breakpoints.ts` (che duplica l'ORDINE dei nomi, non i `minWidth`, perché quell'ordine non è pubblico — D-010) andrebbe aggiornata in corrispondenza.

---

## D-018 — Adattatore di scrittura Desktop-first: separazione geometria/contenuto e congelamento automatico (Fase 5, Blocco D)

**Stato**: `renderer-react` (non l'Engine) implementa `buildUpdatePropsCommand`, che instrada ogni scrittura in base a due elenchi CHIUSI: GEOMETRIA (`x`, `y`, `width`, `height`, `layoutMode`) e CONTENUTO (`text`, `color`); qualunque altra chiave lancia un errore esplicito. Il CONTENUTO scrive sempre sui props base, indipendentemente dalla vista attiva. La GEOMETRIA, se la vista attiva è la fascia base, scrive direttamente sui props base; altrimenti scrive sulla fascia attiva e "congela" automaticamente (Opzione A) la prima fascia più larga priva di override proprio per quella chiave, al suo valore RISOLTO per quella fascia (via `resolveNode`, non il valore di base) — un solo comando `UPDATE_PROPS` per gesto, anche quando tocca più fasce.

**Motivazione**: il Resolver (Fase 2, invariato) applica una cascata tecnicamente mobile-first (un override lasciato solo su una fascia stretta si propaga verso le fasce più larghe se queste non hanno un proprio override) — comportamento verificato e documentato in PRODUCT_DESIGN.md, sez. 6, Decisione 1, che richiede esplicitamente che l'editor imponga la convenzione Desktop-first invece di lasciarla ambigua. Senza congelamento, un cambiamento fatto solo su una fascia stretta (es. Mobile) si propagherebbe silenziosamente anche a Tablet/Desktop — verificato concretamente prima di scegliere l'Opzione A (vedi turno di analisi dedicato). Il congelamento usa il valore RISOLTO per fascia (non il valore di base) su richiesta esplicita del proprietario del prodotto, per non perdere un override già presente su una fascia intermedia. La separazione geometria/contenuto (due elenchi chiusi, non un'euristica) e "il contenuto non varia mai per fascia sullo stesso nodo" sono entrambe decisioni esplicite del proprietario del prodotto, non dedotte dal codice.

**Natura della decisione**: vive interamente in `renderer-react` (`src/write/buildUpdatePropsCommand.ts`), non nell'Engine — coerente con PRODUCT_DESIGN.md riga 79 ("vincolo di design della UI derivato da un comportamento del motore, non un cambiamento del motore stesso"). L'algoritmo esamina solo la prima fascia più larga priva di override proprio per una chiave (non tutte le fasce più larghe): una volta che una chiave ha un override esplicito su una fascia T (preesistente o appena congelato), quell'override vince per costruzione su ogni fascia ancora più larga nella cascata del Resolver, quindi non serve congelare oltre — dimostrato in `DECISIONS.md` con un ragionamento per induzione, verificato dai test (congelamento su Mobile non tocca Desktop quando Tablet ha già un override proprio).

**Conseguenza nota, non risolta**: l'indicatore "ereditato vs cambiato" (PRODUCT_DESIGN.md, Decisione 5) può distinguere solo 2 stati su 3 possibili (ereditato / con override su questa fascia) — un override scritto a mano e uno scritto dal congelamento automatico hanno esattamente la stessa forma nel Document, quindi non sono distinguibili senza un metadato di provenienza non ancora progettato (vedi PRODUCT_DESIGN.md, sez. 6, aggiornamento Blocco D, Opzione 1 preferita per il futuro).

**Evidenza disponibile**: `test/write/buildUpdatePropsCommand.test.ts` (11 test, inclusi i casi di congelamento per-chiave indipendente e "Tablet ha già un override proprio"). Verificato anche in un browser reale (Vite + Chromium via CDP): trascinamento su Mobile → congelamento corretto su Tablet al valore preesistente → Desktop invariato → un solo `undo()` annulla l'intero gesto (compreso il congelamento).

**Rivalutazione**: se si deciderà di implementare il metadato di provenienza (sopra) — toccherebbe l'Engine (il Resolver dovrebbe "spacchettare" il metadato prima di leggere il valore), quindi meriterebbe una propria voce di decisione quando ripreso.

---

## D-019 — Resolver multi-asse: 7 fasce nominate, ordine di cascata curato a mano (Fase 6)

**Stato**: le 3 fasce lineari di Fase 2 (`mobile`/`tablet`/`desktop`, solo `minWidth`) sono sostituite da 7 fasce nominate — `mobile-verticale`, `mobile-orizzontale`, `tablet-verticale`, `tablet-orizzontale`, `laptop-compatto`, `desktop-compatto`, `desktop` — ciascuna con un predicato descrittivo proprio (`minWidth?`/`maxWidth?`/`orientation?`/`minHeight?`/`maxHeight?`, tutti opzionali e indipendenti). Soglie prese *verbatim* dall'audit del sito reale Vicolo Cechov (Fase 6A, righe 62-69 del sorgente HTML), non stimate. `BASE_BREAKPOINT` (= `"desktop"`) sostituisce il precedente concetto implicito di fascia base. Sostituzione pulita, non convivenza: `CURRENT_SCHEMA_VERSION` passa da 1 a 2 (`document/types.ts`).

**Motivazione — perché "combinazioni nominate" e non assi ortogonali indipendenti o predicati stile media-query**: verificato contro i 7 dati reali (non assunto): 3 delle 7 fasce non hanno alcun vincolo di orientamento, e le fasce si sovrappongono (es. "Laptop compatto" 1025-1199 senza vincolo e "Tablet orizzontale" 768-1199 landscape+altezza≥551 coprono entrambe un landscape largo 1100px alto 600px) — il CSS reale risolve questo con l'ordine di dichiarazione nel foglio di stile, non con una partizione pulita. Un modello ad assi ortogonali pienamente indipendenti avrebbe costruito una capacità (ogni combinazione width×orientation indirizzabile) che i dati reali non usano. Un modello a predicati stile media-query (matching contro un viewport reale) risolverebbe un problema che oggi non ha alcun consumer: `ResolverContext.breakpoint` è sempre un nome già scelto (dall'autore, tramite un pulsante), mai una larghezza grezza da far combaciare — nessun punto del codice fa mai matching pixel-reali→fascia; quel bisogno esisterà solo con un runtime pubblicato (l'Exporter), esplicitamente fuori scope. Le "combinazioni nominate" sono la generalizzazione minima del sistema già approvato: le 3 fasce di Fase 2 erano già, letteralmente, un caso degenere di questo stesso schema.

**Ordine di cascata (Punto 2 dell'analisi delle fondamenta)**: non derivato da una formula su larghezza/orientamento/altezza — verificato con un caso concreto che una formula ingenua sbaglierebbe (un override lasciato su una fascia stretta CON vincolo di orientamento, es. `mobile-verticale`, non deve propagarsi a una fascia larga SENZA vincolo, es. `desktop`, anche se "più larga" in termini di soli pixel: un override pensato per un telefono in verticale non ha senso su un monitor desktop). Regola curata a mano, verificata voce per voce: le due catene nella stessa diramazione di orientamento cascatano (`mobile-verticale`→`tablet-verticale`; `mobile-orizzontale`→`tablet-orizzontale`), le tre fasce senza vincolo di orientamento (`laptop-compatto`, `desktop-compatto`, `desktop`) sono bende indipendenti, nessuna eredita dalle altre né da fasce con vincolo di orientamento.

**Superficie pubblica (reversione mirata di D-010)**: `BREAKPOINTS` (l'array intero coi predicati) resta interno, invariato nella sostanza di D-010. Aggiunte 3 funzioni pubbliche minime — `listBreakpointNames()`, `widerBreakpoints(name)`, `BASE_BREAKPOINT` — perché `renderer-react` (consumer esterno reale) ne ha bisogno per il pulsante di cambio vista e per il congelamento Desktop-first, esattamente il trigger di rivalutazione che D-010 aveva già previsto esplicitamente ("quando emergerà un consumer esterno reale... che necessiti di conoscere i nomi di breakpoint validi dall'esterno del package"). `renderer-react/src/breakpoints.ts` non duplica più localmente l'ordine dei nomi (rischio già segnalato in D-017/Blocco D, ora risolto invece che solo documentato).

**Difetto trovato e corretto durante la re-derivazione**: l'algoritmo di congelamento di D-018 (`buildFrozenResponsive`) esaminava solo il *primo* elemento di `widerTiers()`, assumendo (vero per una catena lineare a 3 fasce, mai verificato esplicitamente per il caso generale) che bastasse. Con `widerBreakpoints` potenzialmente in grado di restituire più vicini diretti indipendenti (non ancora il caso con le 7 fasce attuali, ma non escluso in futuro), quell'assunzione sarebbe stata sbagliata: congelare solo il primo vicino e ignorare gli altri lascerebbe una fascia indipendente non protetta. Riscritto per processare ogni vicino diretto indipendentemente (l'intero insieme di chiavi cambiate, non un pool che si esaurisce) — dimostrato corretto anche per un grafo non lineare: una fascia ancora più larga che include un vicino diretto (ora congelato) nella propria cascata riceve comunque il valore corretto durante la propria risoluzione, senza bisogno di risalire la catena qui.

**Evidenza disponibile**: `test/resolver/breakpoints.test.ts` (19 test: predicati di tutte le 7 fasce, ordine di cascata verificato voce per voce incluso il caso "non si propaga tra diramazioni diverse", `widerBreakpoints`). `test/write/buildUpdatePropsCommand.test.ts` (14 test, riscritti sulle 7 fasce, incluso il caso "editare una fascia senza vicini più larghi non congela nulla" - comportamento nuovo rispetto a Fase 5, dove ogni fascia aveva sempre un "successivo"). Verificato anche in un browser reale: trascinamento su `mobile-verticale` → congelamento corretto su `tablet-verticale` al valore preesistente → `laptop-compatto`/`desktop` invariati (non solo "schermati dal congelamento", isolati per costruzione); trascinamento su `laptop-compatto` (nessun vicino più largo) → nessun congelamento, `desktop` invariato. Suite complete del monorepo verdi (Engine 163, CLI 20, Test Runner 3, renderer-react 59).

**Rivalutazione**: se emergerà un vero consumer che deve far combaciare un viewport reale contro le fasce (l'Exporter) — a quel punto servirà un valutatore di predicati, esplicitamente non costruito qui. Se le fasce reali del sito cambieranno (nuove soglie, nuovi dispositivi), `BREAKPOINTS`/`CASCADE_ORDER` vanno aggiornati insieme, a mano, con la stessa verifica voce-per-voce fatta qui - non c'è una formula da cui i due si derivano automaticamente.

---

## D-020 — Motore di navigazione pagine/scene: convenzione `type==="scene"`, transizioni CSS, nessuna estensione del Document Model o di History (Fase 7)

**Stato**: nuovo pacchetto di funzionalità interamente in `renderer-react`, nessuna modifica all'Engine. Una "scena" (Punto 1 dell'analisi, Opzione B) è un figlio diretto della radice di una pagina il cui `DocumentNode.type` vale `"scene"` — nessuno schema dedicato, `type` resta la stringa libera che è da Fase 1 (`preview/scenes.ts`, `sceneNodeIds()`). `ElementType` (renderer-react) si estende con `"scene"` (`elements/createElementCommand.ts`), sempre creata come figlia diretta della radice pagina indipendentemente dalla selezione corrente (`ElementPalette.tsx`), a differenza di "testo"/"contenitore" che rispettano un contenitore libero selezionato. Un nuovo componente `Preview.tsx` (non un riuso di `Canvas.tsx`) renderizza staticamente l'albero di una pagina (riusa `flattenBoxes`, non la logica di drag/resize/selezione) e naviga pagine/scene con le frecce tastiera, transizioni `transition` CSS native (nessun motore rAF/easing custom), un unico lock (`isTransitioning`) che ignora input durante una transizione in corso. Stato di navigazione (`PreviewPosition {pageId, sceneIndex}`) locale al componente `Preview`, non aggiunto a `History`.

**Motivazione — perché una convenzione e non uno schema dedicato**: coerente con la raccomandazione già scritta in PRODUCT_DESIGN.md sez. 2 ("Scena: convenzione, nessuno schema dedicato"), ed evita di forzare ogni pagina esistente/futura a essere "a scene" per costruzione (l'alternativa strutturale — ogni figlio diretto della radice è una scena — avrebbe reso navigabile per forza anche un header fisso o altro contenuto non pensato per lo scorrimento). Nessuna modifica allo schema (`DocumentNode.type` è già libero), quindi nessun bump di `CURRENT_SCHEMA_VERSION`.

**Motivazione — perché stato locale e non `History`**: stesso principio di D-016/D-017 applicato nella direzione opposta — qui la posizione di navigazione NON è stato di sessione dell'editor allo stesso titolo di selezione/fascia attiva, è "dove sto guardando", non "cosa ho modificato": un `undo()` durante la navigazione in Preview non deve annullarla né esserne influenzato. Per analogia diretta e verificata col precedente già stabilito per `activePageId` in Fase 5 Blocco E (stato locale di `App.tsx`, non `History`, per lo stesso tipo di motivazione).

**Motivazione — perché `transition` CSS e non il motore rAF del sito reale**: il motore rAF/easing custom del sito reale (Fase 6A) esiste lì solo per sincronizzare `aggiornaColoreHeader()` (inversione chiaro/scuro dell'header) frame-per-frame con la posizione di scroll — funzionalità esplicitamente fuori scope qui, rimandata a B/S7/Fase 13 (stato/variabili, non ancora decisa architetturalmente). Senza quel requisito, una `transition` dichiarativa è sufficiente e enormemente più semplice. Per il cambio scena (stesso albero di pagina) basta una sola `transition: transform` sull'unico elemento montato. Per il cambio pagina (albero diverso, radice diversa) una dissolvenza incrociata a due fasi (opacità a 0 → sostituzione contenuto a opacità 0 → opacità a 1, sequenziata con un doppio `requestAnimationFrame` per garantire che il nuovo contenuto sia dipinto a opacità 0 prima di animare verso 1) evita di dover montare contemporaneamente due alberi di pagina per un semplice scorrimento orizzontale — dettaglio implementativo lasciato aperto dall'analisi (Punto 4 non specificava il meccanismo per asse), deciso qui.

**Difetto trovato e corretto durante la verifica in browser**: i default approvati per il nuovo tipo "scene" inizialmente includevano solo `height` (assumendo che la radice pagina fosse sempre in modalità "pila", dove `x`/`y`/`width` di un figlio sono irrilevanti — ereditati dall'alto). Verificato in browser sul documento demo esistente (la cui radice è esplicitamente "libero", per il demo di drag libero delle card di Blocco B/D): `computeLayout` lanciava un errore ("width" obbligatoria assente) creando una scena lì, perché un figlio senza propri figli posizionato in modalità libera dal genitore richiede `width` esplicita (Decisione 3, D-014/D-015) — caso non coperto dai test unitari esistenti, che non creano mai un elemento sotto una radice "libero". Corretto aggiungendo `x:0, y:0, width:800` ai default (ignorati quando il genitore è "pila", dove contano comunque solo per un fallback comunque innocuo). Un secondo effetto collaterale osservato nello stesso test in browser (non un bug, un limite noto): sotto una radice "libero", scene create in sequenza si sovrappongono tutte a `(0,0)` invece di impilarsi (l'impilamento automatico è una proprietà della sola modalità "pila") — per questo l'uso previsto delle scene presuppone una pagina con radice "pila" (il default per una pagina nuova), non la pagina demo esistente, il cui scopo resta quello originale (drag libero) e non è pensata per la navigazione a scene.

**Evidenza disponibile**: `test/preview/scenes.test.ts` (4 test — filtro per convenzione, ordine, esclusione di un nipote non diretto), `test/preview/navigation.test.ts` (8 test — avanzamento, clamp ai confini senza wrap su entrambi gli assi, reset di `sceneIndex` al cambio pagina, pagina/nodo sconosciuti), `test/elements/createElementCommand.test.ts` (+4 test: default della scena, regressione del difetto sopra sotto entrambe le modalità di radice). Verificato in un browser reale (Vite + Chromium via CDP): 3 scene create su una pagina nuova (radice "pila") → apertura Preview → `ArrowDown` sposta `translateY` di -400px (l'altezza di una scena) per volta, clampato a -800px oltre la terza scena (nessun wrap) → `ArrowUp` torna a -400px → `ArrowLeft` verso la pagina "Home" (senza scene) mostra correttamente il fallback statico dell'intera pagina (Punto 1) → `ArrowRight` torna a "Landing" → `Escape` chiude la Preview e ripristina il Canvas di editing, zero errori console durante l'intero percorso. Suite complete del monorepo verdi (Engine 163, CLI 20, Test Runner 3, renderer-react 74).

**Rivalutazione**: quando verrà affrontata l'architettura di stato/variabili (B/S7/Fase 13) — la posizione di navigazione costruita qui (`PreviewPosition`) è il punto di aggancio naturale per una futura funzionalità che debba reagire alla scena/pagina corrente (es. l'inversione dell'header, rimandata); quando (e se) verrà introdotto routing/deep-link (Punto 7, rimandato) — riguarderà un output pubblicato, non l'editor, da rivalutare con l'Exporter.
