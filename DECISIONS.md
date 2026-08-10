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

**Rivalutazione**: prima che la Fase 3 introduca un vero path di import/caricamento da JSON esterno o non fidato; se `test/propertyBased.test.ts` viene esteso a generare sequenze più lunghe delle attuali 40 operazioni; oppure se in Fase 5 emerge una funzionalità (es. duplicazione di struttura, incolla di contenuto annidato) che potrebbe costruire alberi profondi senza un'azione utente deliberata e consapevole per ogni livello.

---

## D-012 — Formato dell'IR ("Meta") e formato di deserializzazione JSON→Document

**Stato**: `Meta = { pageId, breakpoint }`; `exportIR(document, context): IR` con `context.breakpoint`, `context.pageId` e `context.viewportWidth` obbligatori ed espliciti (nessun default nascosto dentro l'Engine); Box Tree invariato da Fase 2 (`{nodeId,x,y,width,height,children}`); deserializzazione JSON→Document piatta/iterativa, simmetrica a `serializeDocument`; nessun `export/invariants.ts` dedicato per ora.

**Motivazione**: `pageId` e `breakpoint` sono richiesti da bisogni già presenti nel codice — `computeLayout` è già oggi single-page per costruzione (`options.pageId`, `packages/engine/src/layout/computeLayout.ts`), `ResolverContext.breakpoint` è già oggi un campo obbligatorio (`packages/engine/src/resolver/types.ts`) — non da usi futuri ipotetici, coerentemente con D-006/D-007. `viewportWidth` è stato aggiunto per lo stesso motivo dopo la stesura iniziale del piano: `ComputeLayoutOptions.viewportWidth` è già oggi un campo obbligatorio senza default in `computeLayout`, quindi `exportIR()` non può ometterlo. `pageName`/`schemaVersion` restano esclusi da Meta: nessuna funzione della pipeline li consuma oggi, sarebbero giustificati solo da un uso futuro ipotetico (stesso principio di D-006/D-007). Formato piatto per la deserializzazione preferito perché elimina strutturalmente (non solo mitiga) il rischio di un quinto punto ricorsivo rilevante per D-011 (nessuna fonte impone un formato annidato). Nessun validator dedicato perché `resolveDocument`/`computeLayout` validano già i propri output prima di restituirli, e Meta non introduce una struttura a grafo propria.

**Natura della decisione**: convenzione minimale per il vertical slice, non la forma finale/completa dell'IR prevista da RFC-005 — stessa natura di scelta-di-scope di D-008/D-009. Non copre i valori di default lato CLI per `breakpoint`/`viewportWidth` (`"desktop"`/`1280`, precedente informale dello script demo di Fase 2, non una relazione architetturale Engine): quella è una scelta UX del consumer CLI, documentata con un commento inline nel codice, non in questa voce.

**Evidenza disponibile**: nessuna misura di prestazioni — scelta di rappresentazione dati, verificata sul codice esistente (citazioni sopra).

**Rivalutazione**: quando un vero Exporter (HTML/React/Vue, fuori scope) rivelerà un bisogno concreto non coperto da questa Meta minimale, o quando RFC-005 verrà completata.
