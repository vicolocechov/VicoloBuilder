# Progetto: Site Builder Visuale — Project Brief

## Obiettivo del prodotto (per chi legge senza contesto tecnico)

Un software che permette a un utente senza competenze di programmazione di creare
siti web trascinando elementi su una pagina (testo, bottoni, immagini, sezioni),
personalizzandoli con controllo totale (colori, dimensioni, spaziature, stile)
tramite un pannello visivo, e infine pubblicare il sito. In una fase successiva si
aggiungerà la possibilità di inserire logica (form, interazioni, automazioni) con
assistenza AI.

L'utente finale del prodotto non deve mai vedere codice. Tutta la complessità
descritta sotto serve a rendere il prodotto solido, estendibile e mantenibile nel
tempo — non è visibile all'utente finale.

## Stato del progetto

Fase di design conclusa. Architettura congelata dopo un ciclo di review
approfondito. Prossimo passo: implementazione del Vertical Slice per validare le
RFC con codice reale prima di procedere allo sviluppo completo.

## RFC-000 — Engineering Principles (vincolanti, in ordine di priorità)

1. **No Hidden State** (principio fondante): ogni stato di dominio (selezione,
   tema, documento, undo, clipboard) vive in `Workspace` o `Document`. Vietato
   stato locale (`useState`, singleton) per questi dati nei componenti UI.
   Enforced con lint rule + test architetturale.
2. **Core/Engine indipendente da UI**: il package `engine/` non importa React,
   DOM, Electron, filesystem, networking. CI fallisce la build se violato.
3. **Command Bus unico punto di scrittura**: ogni modifica al Document passa da
   un comando serializzabile (mai mutazione diretta dello stato).
4. **Schema Version obbligatorio**: ogni documento ha `schemaVersion`. Migrazioni
   idempotenti, con dry-run e backup pre-migrazione.
5. **Testabilità senza UI**: ogni modulo di `engine/` ha unit test eseguibili
   senza React/DOM/Canvas.
6. **Performance Budget** (numerico, verificato in CI): selezione <16ms, drag
   <30ms, undo <50ms, export preview <100ms, target 10.000 nodi.
7. **Plugin non modificano direttamente il modello**: passano dal Command Bus.
   Sandboxing rimandato ma da progettare obbligatoriamente prima di un eventuale
   marketplace plugin.
8. **Design system via proprietà semantiche**: `variant`, `size`, `tone` sono
   `PropertyDefinition` con resolver uno-a-molti (es. `variant:"primary"` →
   `background`, `color`, `padding`, `radius`). Nessun layer "Intent" separato: è
   un'estensione del Property/Resolver system, non un nuovo concetto
   architetturale.
9. **Versionamento semantico** per il pacchetto pubblicabile `@progetto/engine`.
   Le API pubbliche seguono semver; breaking change = major bump.
10. **Out of Scope per l'Engine** (esplicito, per prevenire erosione del
    confine): l'Engine NON è responsabile di rendering React, drag&drop, pannelli
    UI, filesystem, Electron, networking, provider AI, autenticazione, hosting,
    sync cloud.
11. **Stabilità delle API**: distinzione esplicita tra Public API
    (`createDocument()`, `executeCommand()`, `resolveNode()`, `exportIR()` —
    stabili, versionate) e Internal API (libere di cambiare). Applicata anche
    meccanicamente via `exports` map nel `package.json`.
12. **Invariants del sistema** (da trasformare in test automatici, priorità
    massima nel vertical slice):
    * Un nodo ha un solo parent.
    * Non esistono cicli nel grafo dei nodi.
    * Ogni `childrenId` esiste nella Map dei nodi.
    * Ogni `parentId` esiste.
    * Ogni Page ha un `rootNodeId` valido.
    * Ogni Component ha un root valido.
    * Ogni Command produce sempre un Document valido.
    * Undo seguito da Redo restituisce lo stesso hash del Document (invariant di
      sistema, non di struttura dati — è il test più importante).
    * Resolver puro (nessun side effect).
    * LayoutEngine puro.
    * Exporter senza side effect.

Regola di governance: RFC-000 è modificabile solo con consenso esplicito
dell'utente/maintainer, va versionata.

## Architettura: Core/Engine vs Core App

```
packages/
  engine/           # @progetto/engine — pubblicabile, zero dipendenze UI
    document/        # Node, Page, Component, grafo Map
    runtime/          # CommandBus, EventBus tipizzato, History
    resolver/         # Pipeline registrabile con priorità (breakpoint, tema, variant...)
    layout/            # Produce Box Tree, non CSS
    export/             # IR (Intermediate Representation) stabile
    extension/            # Extension points, contratti, eventi (RFC-001)
  renderer-react/   # Consumer 1: UI editor (drag&drop, pannelli) — consuma l'Engine
  cli/              # Consumer 2: creazione/export da riga di comando, per test headless
  test-runner/      # Consumer 3: suite di test che verifica gli invariant senza DOM/React
  electron-app/     # App desktop finale che impacchetta renderer-react
```

Principio guida: se un domani serve una versione web, mobile, collaborativa o
un'API server, l'Engine non si riscrive — si aggiunge un nuovo consumer.

## RFC sintetiche (per riferimento durante l'implementazione)

* **RFC-001** (Extension Model): prima gli extension point (dove si può
  estendere, quali contratti, quali eventi, quali API sono stabili), poi i
  plugin come meccanismo di distribuzione sopra quei contratti.
* **RFC-002** (Document Model): grafo di nodi su `Map` (non albero annidato),
  `Page` con metadata, `Component` master/istanza, Capability Registry +
  Property Registry (validazione dichiarativa, non funzioni JS per garantire
  serializzabilità), `schemaVersion`.
* **RFC-003** (Runtime Engine): CommandBus, EventBus tipizzato, Resolver
  Pipeline registrabile con priorità esplicita tra resolver di plugin diversi,
  History (undo/redo).
* **RFC-004** (Rendering Pipeline): Layout produce Box Tree
  (`{x,y,width,height,children}`), mai CSS diretto. Il renderer React (o altro)
  disegna i Box, non calcola layout. PropertyPanel generato automaticamente
  dalle Capability dichiarate da ogni NodeType.
* **RFC-005** (Export Pipeline): `Document → ResolvedModel → IR (Box Tree +
  Meta) → Exporter`. Ogni exporter (HTML, React, Vue…) riceve solo l'IR, mai
  l'intero modello interno.

## Piano del Vertical Slice (prossimo obiettivo concreto)

Obiettivo: validare le RFC con un'implementazione minima ma reale, prima del
renderer React, per evitare che il design dell'Engine venga influenzato dalle
esigenze della UI.

### Ordine di implementazione

**Fase 1 — Document + CommandBus + History (solo test, niente UI)**

* Document Model: Node, Page, grafo su Map.
* CommandBus: comandi `CREATE_NODE`, `UPDATE_PROPS`, `DELETE_NODE`.
* History: undo/redo.
* Test: tutti gli invariant elencati sopra, incluso l'hash undo↔redo.

**Fase 2 — Resolver + Layout (ancora niente React)**

* Resolver base: risoluzione breakpoint + variant semantico (es. `primary` →
  proprietà reali).
* Layout Engine: produce Box Tree da un Document risolto.
* Test: purezza di Resolver e Layout (stesso input → stesso output, nessun side
  effect).

**Fase 3 — CLI (consumer 2)**

* `builder create demo.json`
* `builder export demo.json`
* Verifica: l'Engine funziona identico fuori da qualunque contesto UI.

**Fase 4 — Test Runner (consumer 3)**

* Suite Jest/Vitest che crea un documento, lo modifica, fa undo/redo, esporta —
  senza DOM, React o Electron.

**Fase 5 — Renderer React (consumer 1, solo ora)**

* Canvas minimo: creare pagina, aggiungere testo, modificare proprietà (via
  variant), undo/redo, selezione.
* Deve consumare l'Engine esistente senza modificarne l'API pubblica.

### Criteri di successo del Vertical Slice

* [ ] Test unitari Engine passano senza alcuna dipendenza UI.
* [ ] Benchmark performance: 10.000 nodi entro i budget definiti nel punto 6 di
  RFC-000.
* [ ] CI verifica che `engine/` non importi React/DOM (build fallisce
  altrimenti).
* [ ] Undo/redo funziona in modo identico da CLI e da Renderer React.
* [ ] Export IR è identico byte-per-byte se generato da UI o da CLI con lo
  stesso Document.
* [ ] Tutti gli invariant di RFC-000 punto 12 sono test automatici verdi.

Se il vertical slice passa senza richiedere modifiche alle RFC, l'architettura
si considera validata e si procede all'implementazione completa a partire da
RFC-002 (Document Model).

## Note per Claude Code

* L'utente che guida questo progetto non ha competenze di programmazione. Le
  decisioni tecniche di dettaglio (nomi di funzioni, struttura interna dei
  moduli) non richiedono la sua approvazione. Le decisioni che riguardano
  l'esperienza d'uso finale (come si comporta undo/redo dal punto di vista
  dell'utente, come sono organizzate le pagine, cosa vede nel pannello
  proprietà) vanno invece presentate con demo cliccabili, non con codice o
  spiegazioni tecniche.
* Ad ogni fase del Vertical Slice completata, produrre se possibile una demo
  interattiva (anche HTML standalone come quella già mostrata in chat) per
  validazione prima di procedere alla fase successiva.
