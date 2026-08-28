/* ============================================================================
   VICOLO CECHOV - Pannello di controllo visuale (v3)
   Novita v3:
   - Breakpoint con NOMI standard (Desktop/Laptop/Tablet/Mobile) + orientamento.
   - Catalogo dispositivi REALI per marca (iPhone/iPad/Samsung/Pixel/Desktop),
     verticale e orizzontale, con misure CSS reali. Il breakpoint giusto si
     seleziona da solo in base alla misura.
   - GUIDE "area utile": notch/isola, barra browser, home indicator -> vedi
     l'area davvero visibile dall'utente.
   - A destra compare SOLO la slide che stai vedendo (con frecce e "segui").
   - Selezione/evidenzia/parole funzionano ovunque: il pannello legge dal CSS
     QUALE classe usa QUALE variabile (anche .hero-title, .paura, ecc.).
   - Nascosto: #admin nell'URL oppure Ctrl+Shift+E. Nell'export lo script non c'e.
   ============================================================================ */
(function () {
  'use strict';
  var IS_PREVIEW = location.hash.indexOf('vc-preview') !== -1;
  if (IS_PREVIEW) { runSlave(); return; }

  var ADMIN_ON = (location.hash.indexOf('admin') !== -1) ||
                 (function(){ try { return localStorage.getItem('vc-admin') === '1'; } catch(e){ return false; } })();
  if (location.hash.indexOf('admin') !== -1) { try { localStorage.setItem('vc-admin','1'); } catch(e){} }
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      try { var on = localStorage.getItem('vc-admin') === '1'; localStorage.setItem('vc-admin', on ? '0' : '1'); } catch(err){}
      location.reload();
    }
  });
  if (!ADMIN_ON) return;
  if (window.__vcAdminLoaded) return;
  window.__vcAdminLoaded = true;

  var STORAGE_KEY = 'vc-admin-overrides-v1';

  /* ---- Breakpoint (media = quelle del tuo CSS; label = standard) ---- */
  var ZONES = [
    { id:'base', label:'Desktop (>=1400)',                 media:'(min-width:1400px)' },
    { id:'lg',   label:'Desktop largo (1200-1399)',        media:'(min-width:1200px) and (max-width:1399px)' },
    { id:'lap',  label:'Laptop / compatto (1025-1199)',    media:'(min-width:1025px) and (max-width:1199px)' },
    { id:'tabV', label:'Tablet verticale (768-1024)',      media:'(min-width:768px) and (max-width:1024px) and (orientation:portrait)' },
    { id:'tabO', label:'Orizzontale compatta (fino a 1199, h>=551)', media:'(max-width:1199px) and (orientation:landscape) and (min-height:551px)' },
    { id:'mobV', label:'Mobile verticale (<=767)',         media:'(max-width:767px) and (orientation:portrait)' },
    { id:'mobO', label:'Mobile orizzontale (alt.<=550)',   media:'(orientation:landscape) and (max-height:550px)' }
  ];
  function zoneForViewport(w,h){
    var landscape = w>h;
    if (landscape && h<=550) return 'mobO';
    if (w<=767 && !landscape) return 'mobV';
    if (w>=768 && w<=1024 && !landscape) return 'tabV';
    if (w<=1199 && landscape && h>=551) return 'tabO';
    if (w>=1025 && w<=1199) return 'lap';
    if (w>=1200 && w<=1399) return 'lg';
    return 'base';
  }

  /* ---- Catalogo dispositivi reali (misure CSS, verticale) ---- */
  var CATS = [
    { cat:'Modifica diretta', items:[ {id:'live', label:'Sulla pagina (finestra)', w:0, h:0} ] },
    { cat:'Desktop / Laptop', items:[
      {id:'d1920', label:'Desktop 1920x1080', w:1920, h:1080, kind:'desktop'},
      {id:'d1440', label:'Desktop 1440x900',  w:1440, h:900,  kind:'desktop'},
      {id:'mba13', label:'MacBook Air 13"',   w:1280, h:832,  kind:'desktop'},
      {id:'lap13', label:'Laptop 1366x768',   w:1366, h:768,  kind:'desktop'},
      {id:'lap12', label:'Laptop 1280x800',   w:1280, h:800,  kind:'desktop'}
    ]},
    { cat:'Apple iPhone', items:[
      {id:'ipse',  label:'iPhone SE (375x667)',        w:375, h:667, kind:'phone'},
      {id:'ip16',  label:'iPhone 16 / 15 / 14 (390x844)', w:390, h:844, kind:'phone', island:true},
      {id:'ip15p', label:'iPhone 15 Pro (393x852)',    w:393, h:852, kind:'phone', island:true},
      {id:'ip16p', label:'iPhone 16 Pro (402x874)',    w:402, h:874, kind:'phone', island:true},
      {id:'ip15pm',label:'iPhone 15 Pro Max (430x932)',w:430, h:932, kind:'phone', island:true},
      {id:'ip16pm',label:'iPhone 16 Pro Max (440x956)',w:440, h:956, kind:'phone', island:true}
    ]},
    { cat:'Apple iPad', items:[
      {id:'ipad',  label:'iPad 10.9 (820x1180)',   w:820,  h:1180, kind:'tablet'},
      {id:'ipadm', label:'iPad mini (744x1133)',   w:744,  h:1133, kind:'tablet'},
      {id:'ipadp11',label:'iPad Pro 11 (834x1194)',w:834,  h:1194, kind:'tablet'},
      {id:'ipadp13',label:'iPad Pro 13 (1024x1366)',w:1024,h:1366, kind:'tablet'}
    ]},
    { cat:'Samsung Galaxy', items:[
      {id:'s25',   label:'Galaxy S25 / S24 (360x780)', w:360, h:780, kind:'phone', hole:true},
      {id:'s24u',  label:'Galaxy S24 Ultra (384x832)', w:384, h:832, kind:'phone', hole:true},
      {id:'sa',    label:'Galaxy A / medio (360x800)', w:360, h:800, kind:'phone', hole:true}
    ]},
    { cat:'Google Pixel', items:[
      {id:'px9',   label:'Pixel 9 (412x916)',      w:412, h:916, kind:'phone', hole:true},
      {id:'px9p',  label:'Pixel 9 Pro (427x952)',  w:427, h:952, kind:'phone', hole:true},
      {id:'px8',   label:'Pixel 8 (412x915)',      w:412, h:915, kind:'phone', hole:true}
    ]},
    { cat:'Android generico', items:[
      {id:'a360',  label:'Android 360x800', w:360, h:800, kind:'phone', hole:true},
      {id:'a412',  label:'Android 412x915', w:412, h:915, kind:'phone', hole:true}
    ]}
  ];
  function findDevice(id){ for(var i=0;i<CATS.length;i++){ for(var j=0;j<CATS[i].items.length;j++){ if(CATS[i].items[j].id===id) return CATS[i].items[j]; } } return null; }

  var SLIDE_NAMI = { 1:'Hero',2:'La domanda',3:'Le paure',4:'Posto giusto',5:'Le porte',6:'Voci',7:'Slide 7',8:'Slide 8' };
  var PROP_INFO = {
    'scale':      { label:'Dimensione (scala)', kind:'num',  min:0.3,  max:3,   step:0.01, def:1 },
    'num-scale':  { label:'Dimensione (scala)', kind:'num',  min:0.3,  max:3,   step:0.01, def:1 },
    'fs-base':    { label:'Font-size (px)',     kind:'px',   min:8,    max:320, step:1 },
    'pad-v-base': { label:'Padding vert. (px)', kind:'px',   min:0,    max:80,  step:1 },
    'pad-h-base': { label:'Padding oriz. (px)', kind:'px',   min:0,    max:120, step:1 },
    'x':          { label:'Sposta <- -> (px)',  kind:'px',   min:-500, max:500, step:1, def:0 },
    'y':          { label:'Sposta su/giu (px)', kind:'px',   min:-500, max:500, step:1, def:0 },
    'lh':         { label:'Interlinea',         kind:'num',  min:0.5,  max:3,   step:0.01 },
    'ls':         { label:'Spaziatura (px)',    kind:'px',   min:-6,   max:24,  step:0.1 },
    'color':        { label:'Colore',           kind:'color' },
    'color-viva':   { label:'Colore acceso',    kind:'color' },
    'color-spenta': { label:'Colore spento',    kind:'color' },
    'bg':           { label:'Colore sfondo',    kind:'color' },
    'zoom':         { label:'Scala bottone intero (testo incluso)', kind:'num', min:0.3, max:3, step:0.01, def:1 },
    'uscale':       { label:'Scala bottone intero (testo incluso)', kind:'num', min:0.3, max:3, step:0.01, def:1 },
    'padh':         { label:'Padding orizzontale (px)', kind:'px', min:0, max:120, step:1 },
    'padv':         { label:'Padding verticale (px)',   kind:'px', min:0, max:120, step:1 }
  };
  var PROP_ORDER = ['zoom','uscale','scale','num-scale','fs-base','x','y','padh','padv','lh','ls','pad-v-base','pad-h-base','color','color-viva','color-spenta','bg'];

  /* ===================== SCOPERTA VARIABILI + MAPPA SELETTORI ===================== */
  var SELMAP = {}; // "s{sec}/{slide}/{family}" -> [selettori .classe]
  function famKeyOf(sec,slide,family){ return 's'+sec+'/'+slide+'/'+family; }
  function stripProp(rest){ for(var i=0;i<PROP_ORDER.length;i++){ var s='-'+PROP_ORDER[i]; if(rest.length>s.length && rest.slice(-s.length)===s) return rest.slice(0,-s.length); } var pm=rest.match(/-([a-z0-9]+)$/i); return pm?rest.slice(0,-(pm[1].length+1)):rest; }

  function scanVariables() {
    var found = {}; SELMAP = {};
    var reVarUse = /var\(\s*(--s\d+-slide\d+-[a-z0-9-]+?)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/gi;
    var reDeclKey = /^--s\d+-slide\d+-[a-z0-9-]+$/i;
    var reFamInText = /--s(\d+)-slide(\d+)-([a-z0-9-]+)/gi;

    function classify(name, defRaw) {
      var m = name.match(/^--s(\d+)-slide(\d+)-(.+)$/i); if (!m) return null;
      var sec=+m[1], slide=+m[2], rest=m[3], prop=null, family=rest;
      for (var i=0;i<PROP_ORDER.length;i++){ var suf='-'+PROP_ORDER[i]; if(rest.length>suf.length && rest.slice(-suf.length)===suf){ prop=PROP_ORDER[i]; family=rest.slice(0,-suf.length); break; } }
      if(!prop){ var pm=rest.match(/-([a-z0-9]+)$/i); prop=pm?pm[1]:rest; family=pm?rest.slice(0,-(pm[1].length+1)):rest; return {sec:sec,slide:slide,family:family,prop:prop,defRaw:(defRaw||'').trim(),generic:true}; }
      return {sec:sec,slide:slide,family:family,prop:prop,defRaw:(defRaw||'').trim()};
    }
    function record(name, defRaw){ var info=classify(name,defRaw); if(!info) return; if(!found[name]) found[name]=info; else if(!found[name].defRaw && defRaw) found[name].defRaw=defRaw.trim(); }
    function addSel(sec,slide,family,selText){
      if(!selText) return;
      selText.split(',').forEach(function(part){
        part = part.trim();
        // solo selettori basati su classe, senza stato/pseudo per il matching base
        if(part.indexOf('.')===-1) return;
        // togli pseudo-classi/elementi finali e stati comuni per avere l'elemento base
        var clean = part.replace(/::?[a-z-]+(\([^)]*\))?/gi,'').replace(/\.(viva|is-active|open|active)\b/g,'').trim();
        if(!clean || clean.indexOf('.')===-1) return;
        var k = famKeyOf(sec,slide,family);
        (SELMAP[k] = SELMAP[k] || []);
        if(SELMAP[k].indexOf(clean)===-1) SELMAP[k].push(clean);
      });
    }
    var sheets=document.styleSheets;
    for(var s=0;s<sheets.length;s++){ var rules; try{ rules=sheets[s].cssRules; }catch(e){ continue; } if(rules) walk(rules); }
    function walk(rules){ for(var r=0;r<rules.length;r++){ var rule=rules[r];
      if(rule.cssRules) walk(rule.cssRules);
      if(rule.style) for(var k=0;k<rule.style.length;k++){ var p=rule.style[k]; if(reDeclKey.test(p)) record(p, rule.style.getPropertyValue(p)); }
      if(rule.cssText){
        var t=rule.cssText, mm; reVarUse.lastIndex=0; while((mm=reVarUse.exec(t))) record(mm[1],mm[2]);
        // mappa selettore -> famiglie citate nel corpo della regola
        if(rule.selectorText){
          var fm; reFamInText.lastIndex=0; var seen={};
          while((fm=reFamInText.exec(t))){ var fam=stripProp(fm[3]); var key=fm[1]+'|'+fm[2]+'|'+fam; if(seen[key]) continue; seen[key]=1; addSel(+fm[1],+fm[2],fam, rule.selectorText); }
        }
      }
    } }
    return found;
  }

  var VARS = scanVariables();

  /* ====== ESTENSIONI: header, sfondo bottoni, centratura, testi ====== */
  var TXT_KEY='vc-admin-text-v1', WORD_KEY='vc-admin-words-v1';
  var BTXT_KEY='vc-btn-text-v1';
  var btnText = jload_btn();   // solo testo dei bottoni: { famKey: {sel, text} }
  function jload_btn(){ try{ var r=localStorage.getItem(BTXT_KEY); if(r) return JSON.parse(r);}catch(e){} return {}; }
  var textOverrides = {};   // disattivato: non tocchiamo mai il testo/HTML originale
  var wordSplits    = {};   // disattivato
  function jload(k){ try{ var r=localStorage.getItem(k); if(r) return JSON.parse(r);}catch(e){} return {}; }
  function jsave(k,o){ try{ localStorage.setItem(k, JSON.stringify(o)); }catch(e){} }

  var baseEl=document.createElement('style'); baseEl.id='vc-admin-base'; document.head.appendChild(baseEl);
  var BASECSS='';

  var HEADER_ITEMS = [
    { fam:'logo', sel:'.brand',       origin:'left center'  },
    { fam:'menu', sel:'.main-nav',    origin:'center'       },
    { fam:'pill', sel:'.sede-toggle', origin:'right center' }
  ];

  function cstyle(sel, prop){ try{ var el=document.querySelector(sel); if(el) return getComputedStyle(el)[prop]; }catch(e){} return ''; }
  function toHexSafe(c){ return toHex(c||'#000000'); }

  // aggiunge le variabili "finte" a VARS e costruisce le regole base persistenti
  function regSynthFamily(sec,slide,fam,sel){
    SELMAP['s'+sec+'/'+slide+'/'+fam]=[sel];
    ['scale','x','y','lh','ls','color'].forEach(function(p){
      var nm='--vcx-'+sec+'-'+slide+'-'+fam+'-'+p;
      VARS[nm]={sec:sec,slide:slide,family:fam,prop:p,synth:true,__sel:sel,
        defRaw:(p==='scale'?'1':(p==='lh'?'1.3':(p==='color'?toHexSafe(cstyle(sel,'color')):'0px')))};
    });
  }
  function addSynthetic(){
    // Header e voci menu: registrati come SYNTH -> si applicano SOLO se li tocchi (nessuna regola base)
    HEADER_ITEMS.forEach(function(it){ regSynthFamily(0,0,it.fam,it.sel); });
    var links=[]; try{ links=document.querySelectorAll('.main-nav a'); }catch(e){}
    for(var k=1;k<=links.length;k++){ regSynthFamily(0,0,'menu-'+k, '.main-nav a:nth-of-type('+k+')'); }
    // Bottoni: solo variabile sfondo (il picker); si applica come regola SOLO quando la cambi
    var btnFams={};
    Object.keys(VARS).forEach(function(nm){ var v=VARS[nm]; if(/btn/.test(v.family)){ btnFams[('s'+v.sec+'/'+v.slide+'/'+v.family)]=v; } });
    Object.keys(btnFams).forEach(function(fk){
      var sels=SELMAP[fk]; if(!sels||!sels.length) return; var sel=sels[0]; var v=btnFams[fk];
      var bgName='--s'+v.sec+'-slide'+v.slide+'-'+v.family+'-bg'; if(!VARS[bgName]) VARS[bgName]={sec:v.sec,slide:v.slide,family:v.family,prop:'bg',defRaw:toHexSafe(cstyle(sel,'backgroundColor'))};
      if(/card\d*-btn/.test(v.family)){
        // Bottone dentro una card: altezza fissa + larghezza stirata -> zoom si deforma.
        // Scala uniforme via transform (composta col loro spostamento) + padding che libera l'altezza.
        var xv='--s'+v.sec+'-slide'+v.slide+'-'+v.family+'-x', yv='--s'+v.sec+'-slide'+v.slide+'-'+v.family+'-y';
        var un='--vcx-'+v.sec+'-'+v.slide+'-'+v.family+'-uscale'; if(!VARS[un]) VARS[un]={sec:v.sec,slide:v.slide,family:v.family,prop:'uscale',defRaw:'1',synth:true,__sel:sel,__movevars:[xv,yv]};
        var ph='--vcx-'+v.sec+'-'+v.slide+'-'+v.family+'-padh'; if(!VARS[ph]) VARS[ph]={sec:v.sec,slide:v.slide,family:v.family,prop:'padh',defRaw:'15px',synth:true,__sel:sel,__release:true};
        var pv='--vcx-'+v.sec+'-'+v.slide+'-'+v.family+'-padv'; if(!VARS[pv]) VARS[pv]={sec:v.sec,slide:v.slide,family:v.family,prop:'padv',defRaw:'9px',synth:true,__sel:sel,__release:true};
      } else {
        var zName='--vcx-'+v.sec+'-'+v.slide+'-'+v.family+'-zoom'; if(!VARS[zName]) VARS[zName]={sec:v.sec,slide:v.slide,family:v.family,prop:'zoom',defRaw:'1',synth:true,__sel:sel};
      }
    });
    BASECSS=''; baseEl.textContent=''; // NESSUNA regola base: il sito resta identico all'originale finche' non tocchi qualcosa
    fillSynthetic();
    detectCards(); // "Card N (intera)" e "Tutte le card (blocco)"
    detectPageBlocks(); // "Tutta la pagina (tutti gli elementi)" per ogni slide + "Header (tutto insieme)"
  }
  function selFor(sec,slide,family){ var s=SELMAP[famKeyOf(sec,slide,family)]; return (s&&s[0])||null; }

  // registra una famiglia SYNTH con un set di proprieta' scelto (si applica solo quando la tocchi)
  function regSynthProps(sec,slide,fam,sel,props){
    if(!sel) return;
    SELMAP['s'+sec+'/'+slide+'/'+fam]=[sel];
    props.forEach(function(p){ var nm='--vcx-'+sec+'-'+slide+'-'+fam+'-'+p; if(VARS[nm]) return; VARS[nm]={sec:sec,slide:slide,family:fam,prop:p,synth:true,__sel:sel,defRaw:((p==='zoom'||p==='scale')?'1':(p==='lh'?'1.3':(p==='color'?'#000000':'0px')))}; });
  }
  function _firstClass(el){ if(!el||!el.className||!String(el.className).split) return null; var c=String(el.className).trim().split(/\s+/)[0]; return c||null; }
  function _nthChild(el){ var n=1,s=el; while(s=s.previousElementSibling) n++; return n; }
  // dato un sotto-elemento della card, ricava il selettore del CONTENITORE della singola card e di TUTTE le card
  function _wrapperSel(subEl){ var wrap=subEl.parentElement, cont=wrap&&wrap.parentElement; var wc=_firstClass(wrap); if(!wc) return null; var cc=_firstClass(cont); return (cc?'.'+cc+' > ':'')+'.'+wc+':nth-child('+_nthChild(wrap)+')'; }
  function _containerSel(subEl){ var wrap=subEl.parentElement, cont=wrap&&wrap.parentElement; var cc=_firstClass(cont); return cc?'.'+cc:null; }
  function detectCards(){
    var byGroup={}; // 'sec/slide' -> {sec,slide,cards:{K:subFamily}}
    Object.keys(VARS).forEach(function(nm){ var v=VARS[nm]; var m=(v.family||'').match(/^card(\d+)-/); if(!m) return; var gk=v.sec+'/'+v.slide; (byGroup[gk]=byGroup[gk]||{sec:v.sec,slide:v.slide,cards:{}}); if(!byGroup[gk].cards[m[1]]) byGroup[gk].cards[m[1]]=v.family; });
    Object.keys(byGroup).forEach(function(gk){
      var G=byGroup[gk]; var contSel=null;
      Object.keys(G.cards).sort(function(a,b){return (+a)-(+b);}).forEach(function(K){
        var sel = selFor(G.sec,G.slide,'card'+K+'-tit') || selFor(G.sec,G.slide,G.cards[K]);
        if(!sel) return; var el=null; try{ el=document.querySelector(sel); }catch(e){}
        if(!el) return;
        var wsel=_wrapperSel(el); if(wsel) regSynthProps(G.sec,G.slide,'cardblocco'+K, wsel, ['scale','x','y']);
        if(!contSel) contSel=_containerSel(el);
      });
      if(contSel) regSynthProps(G.sec,G.slide,'cardblocco', contSel, ['zoom','x','y']);
    });
  }
  // "Tutta la pagina" (tutti gli elementi della slide, escluso header) + "Header (tutto insieme)"
  function detectPageBlocks(){
    var groups={}; // 'sec/slide' -> {sec,slide}
    Object.keys(VARS).forEach(function(nm){ var v=VARS[nm]; if(+v.sec===0) return; groups[v.sec+'/'+v.slide]={sec:v.sec,slide:v.slide}; });
    Object.keys(groups).forEach(function(gk){
      var G=groups[gk]; var sel='#s'+G.sec+'-slide'+G.slide+' > *'; var el=null; try{ el=document.querySelector(sel); }catch(e){}
      if(el) regSynthProps(G.sec,G.slide,'paginablocco', sel, ['scale','x','y']);
    });
    // Header intero (logo+menu+pillola insieme)
    var hsel=null; try{ if(document.querySelector('.header-inner')) hsel='.header-inner'; else if(document.querySelector('.site-header')) hsel='.site-header'; }catch(e){}
    if(hsel) regSynthProps(0,0,'headerblocco', hsel, ['zoom','x','y']);
  }

  // aggiunge, dove mancano, i controlli lh/ls/colore (+ scala/sposta se assenti del tutto) a QUALSIASI elemento
  function fillSynthetic(){
    var fams={}; // famKey -> {sec,slide,family,props:{}}
    Object.keys(VARS).forEach(function(nm){ var v=VARS[nm]; var fk='s'+v.sec+'/'+v.slide+'/'+v.family; (fams[fk]=fams[fk]||{sec:v.sec,slide:v.slide,family:v.family,props:{}}); fams[fk].props[v.prop]=1; });
    Object.keys(fams).forEach(function(fk){
      var f=fams[fk]; var sel=(SELMAP[fk]||[])[0]; if(!sel) return;
      function add(prop, def){ var nm='--vcx-'+f.sec+'-'+f.slide+'-'+f.family+'-'+prop; if(VARS[nm]) return; VARS[nm]={sec:f.sec,slide:f.slide,family:f.family,prop:prop,defRaw:def,synth:true,__sel:sel}; }
      if(!f.props['lh']) add('lh','1.3');
      if(!f.props['ls']) add('ls','0px');
      if(!f.props['color'] && !f.props['color-viva']) add('color', toHexSafe(cstyle(sel,'color')));
      // scala/sposta solo se l'elemento non ne ha proprio nessuno (evita conflitti di transform)
      if(!f.props['scale'] && !f.props['x'] && !f.props['y']){ add('scale','1'); add('x','0px'); add('y','0px'); }
    });
  }

  function registerWordVars(fk, w){
    var p=fk.split('/'); var sec=+p[0].replace('s',''), slide=+p[1], family=p[2];
    var base='s'+sec+'-slide'+slide+'-'+family; var css='';
    for(var i=1;i<=w.words.length;i++){
      var wf=family+'-w'+i; var wordCol=(w.words[i-1] && w.words[i-1].color) ? w.words[i-1].color : 'inherit';
      VARS['--'+base+'-w'+i+'-scale']={sec:sec,slide:slide,family:wf,prop:'scale',defRaw:'1'};
      VARS['--'+base+'-w'+i+'-x']    ={sec:sec,slide:slide,family:wf,prop:'x',defRaw:'0px'};
      VARS['--'+base+'-w'+i+'-y']    ={sec:sec,slide:slide,family:wf,prop:'y',defRaw:'0px'};
      VARS['--'+base+'-w'+i+'-lh']   ={sec:sec,slide:slide,family:wf,prop:'lh',defRaw:'1.3'};
      VARS['--'+base+'-w'+i+'-ls']   ={sec:sec,slide:slide,family:wf,prop:'ls',defRaw:'0px'};
      VARS['--'+base+'-w'+i+'-color']={sec:sec,slide:slide,family:wf,prop:'color',defRaw:toHexSafe(wordCol==='inherit'?'#000000':wordCol)};
      SELMAP['s'+sec+'/'+slide+'/'+wf]=['.'+base+'-w'+i];
      css+='.'+base+'-w'+i+'{display:inline-block;'+
        'transform:translate(var(--'+base+'-w'+i+'-x,0px),var(--'+base+'-w'+i+'-y,0px)) scale(var(--'+base+'-w'+i+'-scale,1));'+
        'line-height:var(--'+base+'-w'+i+'-lh,inherit);letter-spacing:var(--'+base+'-w'+i+'-ls,inherit);'+
        'color:var(--'+base+'-w'+i+'-color,'+wordCol+');}';
    }
    w.css=css;
  }

  function refreshVars(){ VARS=scanVariables(); addSynthetic(); detectHardFontSize(); }
  addSynthetic(); detectHardFontSize();

  /* La compensazione automatica e' stata rimossa: leggeva la variabile globale del titolo
     e faceva "sconfinare" la modifica desktop sul mobile, rompendo l'indipendenza tra i device.
     L'indipendenza per breakpoint torna prioritaria. (Il fix per la scala del titolo su mobile,
     se serve, va fatto nel CSS del sito, non qui.) */
  function detectHardFontSize(){ /* no-op: nessuna regola permanente */ }

  var overrides = loadOverrides();
  var currentZone = 'base';
  var currentDevice = 'live';
  var orientation = 'portrait';
  var showGuides = true;
  var showNotch = true;
  var previewOn = true;

  var activeGroupKey = null;   // solo la slide corrente
  var follow = true;           // segui lo scroll

  function loadOverrides(){ try{ var raw=localStorage.getItem(STORAGE_KEY); if(raw) return JSON.parse(raw); }catch(e){} var o={}; ZONES.forEach(function(z){o[z.id]={};}); return o; }
  function saveOverrides(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides)); }catch(e){} }

  /* Migrazione una tantum: prima del fix "zona base confinata" (min-width:1400px),
     'base' era globale e i suoi override erano visibili anche su laptop/tablet/mobile.
     Per non far sparire modifiche esistenti, li ricopiamo (solo dove la zona di
     destinazione non ha gia' un proprio valore) nelle altre zone, una volta sola. */
  function migrateBaseZoneIfNeeded(){
    var FLAG='vc-admin-basezone-migrated-v1';
    try{
      if(localStorage.getItem(FLAG)) return;
      var baseOv=overrides.base||{};
      var baseKeys=Object.keys(baseOv);
      if(baseKeys.length){
        ['lg','lap','tabV','tabO','mobV','mobO'].forEach(function(zid){
          if(!overrides[zid]) overrides[zid]={};
          baseKeys.forEach(function(k){ if(!(k in overrides[zid])) overrides[zid][k]=baseOv[k]; });
        });
        saveOverrides();
      }
      localStorage.setItem(FLAG,'1');
    }catch(e){}
  }
  migrateBaseZoneIfNeeded();

  var styleEl=document.createElement('style'); styleEl.id='vc-admin-overrides'; document.head.appendChild(styleEl);
  var previewEl=document.createElement('style'); previewEl.id='vc-admin-preview'; document.head.appendChild(previewEl);

  function splitZoneKeys(ov){
    var rootDecls=[], rules=[], synthBySel={};
    Object.keys(ov).forEach(function(k){
      var hm=k.match(/^--vchide-(\d+)-(\d+)-(.+)$/);
      if(hm){
        var hsel=selFor(+hm[1],+hm[2],hm[3]);
        if(hsel) rules.push(hsel+'{'+(ov[k]==='none'?'display:none':'visibility:hidden')+'}');
        return;
      }
      var v=VARS[k];
      if(v && v.synth && v.__sel){
        var g=synthBySel[v.__sel]=synthBySel[v.__sel]||{tx:{},decls:[]};
        if(v.prop==='scale') g.tx.scale=ov[k];
        else if(v.prop==='x') g.tx.x=ov[k];
        else if(v.prop==='y') g.tx.y=ov[k];
        else if(v.prop==='lh') g.decls.push('line-height:'+ov[k]);
        else if(v.prop==='ls') g.decls.push('letter-spacing:'+ov[k]);
        else if(v.prop==='color') g.decls.push('color:'+ov[k]);
        else if(v.prop==='bg') g.decls.push('background:'+ov[k]+';border-color:'+ov[k]);
        else if(v.prop==='zoom') g.decls.push('zoom:'+ov[k]);
        else if(v.prop==='padh'){ g.decls.push('padding-left:'+ov[k]+';padding-right:'+ov[k]); if(v.__release) g.release=true; }
        else if(v.prop==='padv'){ g.decls.push('padding-top:'+ov[k]+';padding-bottom:'+ov[k]); if(v.__release) g.release=true; }
        else if(v.prop==='uscale'){ var mv=v.__movevars||[]; var mx=mv[0]?('var('+mv[0]+',0px)'):'0px', my=mv[1]?('var('+mv[1]+',0px)'):'0px'; g.uscale='translate('+mx+','+my+') scale('+ov[k]+')'; }
        return;
      }
      if(/-bg$/.test(k) && /^--s\d+-slide\d+-/.test(k)){
        var m=k.match(/^--s(\d+)-slide(\d+)-(.+)-bg$/); if(m){ var sel=selFor(+m[1],+m[2],m[3]); if(sel){ rules.push(sel+'{background:'+ov[k]+';border-color:'+ov[k]+';}'); return; } }
      }
      rootDecls.push(k+':'+ov[k]);
    });
    Object.keys(synthBySel).forEach(function(sel){ var g=synthBySel[sel]; var d=g.decls.slice();
      if(g.release) d.push('height:auto','min-height:0');
      if(g.tx.scale||g.tx.x||g.tx.y){ d.push('transform:translate('+(g.tx.x||'0px')+','+(g.tx.y||'0px')+') scale('+(g.tx.scale||'1')+')'); }
      else if(g.uscale){ d.push('transform:'+g.uscale); }
      if(d.length) rules.push(sel+'{'+d.join(';')+';}');
    });
    return { root: rootDecls, rules: rules };
  }
  function buildCss(){ var out=''; ZONES.forEach(function(z){ var ov=overrides[z.id]; if(!ov) return; var keys=Object.keys(ov); if(!keys.length) return; var sp=splitZoneKeys(ov); var body=''; if(sp.root.length) body+=':root{'+sp.root.join(';')+'}'; if(sp.rules.length) body+=sp.rules.join(''); if(!body) return; out+= z.media?('@media '+z.media+'{'+body+'}\n'):(body+'\n'); }); return out; }
  function applyLive(){ styleEl.textContent=buildCss(); applyLocalPreview(); syncFrame(); }
  function applyLocalPreview(){ if(currentDevice!=='live'||!previewOn||currentZone==='base'){ previewEl.textContent=''; return; } var ov=overrides[currentZone]||{}; var keys=Object.keys(ov); previewEl.textContent= keys.length? (':root{'+keys.map(function(k){return k+':'+ov[k]+' !important';}).join(';')+'}') : ''; }

  function defaultFor(name){ var v=VARS[name], info=PROP_INFO[v.prop]||{}, raw=(v.defRaw||'').trim();
    if(info.kind==='color') return /^#|^rgb|^hsl/i.test(raw)?raw:'#000000';
    if(info.kind==='num'){ var n=parseFloat(raw); return isNaN(n)?(info.def!=null?info.def:1):n; }
    var px=raw.match(/(-?\d+(?:\.\d+)?)px/); if(px) return parseFloat(px[1]); if(info.def!=null) return info.def; return null; }
  function currentValue(name){ var ov=overrides[currentZone]||{}; return (name in ov)?ov[name]:null; }
  function currentNumeric(name){ var raw=currentValue(name), v=VARS[name], info=PROP_INFO[v.prop]||{}; if(raw!=null){ var m=String(raw).match(/(-?\d+(?:\.\d+)?)/); if(m) return parseFloat(m[1]); } var d=defaultFor(name); return (d==null)?(info.min!=null?info.min:0):d; }
  function setOverride(name,val){ if(!overrides[currentZone]) overrides[currentZone]={}; overrides[currentZone][name]=val; saveOverrides(); applyLive(); }
  function clearOverride(name){ if(overrides[currentZone]) delete overrides[currentZone][name]; saveOverrides(); applyLive(); }

  /* ---- Nascondi elemento: per zona, 'none' (rimuove spazio) | 'hidden' (mantiene spazio) | assente = visibile ---- */
  function hideKeyFor(sec,slide,family){ return '--vchide-'+sec+'-'+slide+'-'+family; }
  function currentHideMode(sec,slide,family){ var k=hideKeyFor(sec,slide,family); var v=(overrides[currentZone]||{})[k]; return (v==='none'||v==='hidden')?v:'visible'; }
  function setHideMode(sec,slide,family,mode){
    var k=hideKeyFor(sec,slide,family);
    if(!overrides[currentZone]) overrides[currentZone]={};
    if(mode==='visible') delete overrides[currentZone][k]; else overrides[currentZone][k]=mode;
    saveOverrides(); applyLive();
  }

  /* ===================== UI ===================== */
  var host=document.createElement('div'); host.id='vc-admin-host';
  host.style.cssText='all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647';
  document.body.appendChild(host);
  var root=host.attachShadow({mode:'open'});
  root.innerHTML =
    '<style>'+PANEL_CSS()+'</style>'+
    '<div id="stage" class="hidden"><div id="frameScaler"><div id="chromeTop" class="chrome top"></div><iframe id="frame" title="Anteprima"></iframe><div id="chromeBottom" class="chrome bottom"></div></div><div id="stagelabel"></div></div>'+
    '<button id="fab" title="Pannello (Ctrl+Shift+E per nascondere)">\u2699</button>'+
    '<div id="drawer" class="closed">'+
      '<header><div class="ttl">Pannello di controllo</div><button id="close">\u2715</button></header>'+
      '<div id="devbar">'+
        '<div class="drow"><select id="cat"></select><select id="model"></select></div>'+
        '<div class="drow"><div id="orient" class="seg"><button data-o="portrait" class="on">Verticale</button><button data-o="landscape">Orizzontale</button></div></div>'+
        '<div id="zonechip"></div>'+
      '</div>'+
      '<div id="navrow">'+
        '<button id="prevSlide" class="nav">\u2039</button>'+
        '<div id="curSlide">-</div>'+
        '<button id="nextSlide" class="nav">\u203a</button>'+
        '<button id="followBtn" class="follow on" title="Segui lo scroll">\ud83d\udd12 Segui</button>'+
      '</div>'+
      '<div id="toolrow"><label class="chk"><input type="checkbox" id="prev" checked> Anteprima</label><button id="pick" class="mini">Seleziona sul sito</button></div>'+
      '<div id="search"><input type="text" id="q" placeholder="Cerca in tutte le slide..."></div>'+
      '<div id="body"></div>'+
      '<footer>'+
        '<button id="exportFull">Scarica sito completo</button>'+
        '<button id="exportCss" class="ghost">CSS</button>'+
        '<button id="rescan" class="ghost">Ricarica</button>'+
        '<button id="resetzone" class="ghost danger">Azzera</button>'+
      '</footer>'+
    '</div>'+
    '<div id="modal" class="hidden"><div class="sheet">'+
      '<div class="mhead"><b id="mtitle">Esporta</b><button id="mclose">\u2715</button></div>'+
      '<p class="hint" id="mhint"></p><textarea id="csv" readonly></textarea>'+
      '<div class="mfoot"><button id="copy">Copia</button><span id="copied"></span></div>'+
    '</div></div>';

  var $=function(s){return root.querySelector(s);};
  var frame=$('#frame'), stage=$('#stage'), scaler=$('#frameScaler');

  $('#fab').addEventListener('click', openDrawer);
  $('#close').addEventListener('click', closeDrawer);
  function openDrawer(){ $('#drawer').classList.remove('closed'); $('#fab').style.display='none'; }
  function closeDrawer(){ $('#drawer').classList.add('closed'); $('#fab').style.display='flex'; }
  // rotella del mouse sul pannello -> scorre la lista (e non fa scorrere il sito sotto)
  $('#drawer').addEventListener('wheel', function(e){
    var b=$('#body'); if(b){ var d = e.deltaMode===1 ? e.deltaY*16 : e.deltaY; b.scrollTop += d; }
    e.stopPropagation(); e.preventDefault();
  }, {passive:false});

  // popola categorie/modelli
  var catSel=$('#cat'), modelSel=$('#model');
  CATS.forEach(function(c,i){ var o=document.createElement('option'); o.value=i; o.textContent=c.cat; catSel.appendChild(o); });
  function fillModels(catIndex){ modelSel.innerHTML=''; CATS[catIndex].items.forEach(function(it){ var o=document.createElement('option'); o.value=it.id; o.textContent=it.label; modelSel.appendChild(o); }); }
  fillModels(0);
  catSel.addEventListener('change', function(){ fillModels(+catSel.value); selectDevice(modelSel.value); });
  modelSel.addEventListener('change', function(){ selectDevice(modelSel.value); });

  $('#orient').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; orientation=b.dataset.o; Array.prototype.forEach.call($('#orient').children,function(c){c.classList.toggle('on',c===b);}); selectDevice(currentDevice); });

  function selectDevice(id){
    var d=findDevice(id); if(!d){ return; }
    currentDevice=id;
    if(id==='live'){ currentZone='base'; closeStage(); renderNav(); renderBody(); applyLive(); return; }
    var w=d.w, h=d.h; if(orientation==='landscape'){ var t=w; w=h; h=t; }
    currentZone=zoneForViewport(w,h);
    openStage(d,w,h);
    renderNav(); renderBody(); applyLive();
  }

  function openStage(d,w,h){
    stage.classList.remove('hidden');
    var src=location.href.split('#')[0]+'#vc-preview';
    if(frame.getAttribute('data-src')!==src){ frame.setAttribute('data-src',src); frame.src=src; }
    scaler.dataset.w=w; scaler.dataset.h=h; scaler.dataset.kind=d.kind||''; scaler.dataset.island=d.island?'1':''; scaler.dataset.hole=d.hole?'1':'';
    drawChrome();
    $('#stagelabel').textContent=d.label+'  -  '+zoneLabel(currentZone);
    $('#zonechip').textContent='Modifichi: '+zoneLabel(currentZone);
    frame.onload=function(){ syncFrame(); };
  }
  function closeStage(){ stage.classList.add('hidden'); $('#zonechip').textContent=''; }
  function fitStage(w,h){ var availW=window.innerWidth-360-48, availH=window.innerHeight-80; var k=Math.min(1, availW/w, availH/h); scaler.style.transform='scale('+k+')'; scaler.style.width=w+'px'; scaler.style.height=h+'px'; }
  window.addEventListener('resize', function(){ if(currentDevice!=='live'){ drawChrome(); } });
  function syncFrame(){ if(currentDevice==='live') return; try{
    frame.contentWindow.postMessage({__vc:'css', css:(BASECSS||'')+'\n'+buildCss()}, '*');
    frame.contentWindow.postMessage({__vc:'pickmap', map:SELMAP}, '*');
    frame.contentWindow.postMessage({__vc:'textmap', text:textOverrides, words:wordSplits}, '*');
    Object.keys(btnText).forEach(function(fk){ var o=btnText[fk]; frame.contentWindow.postMessage({__vc:'settext', sel:o.sel, text:o.text}, '*'); });
  }catch(e){} }

  /* ---- Anteprima: schermo INTERO del device alla misura reale, senza barre ---- */
  function drawChrome(){
    if(currentDevice==='live') return;
    var w=+scaler.dataset.w, h=+scaler.dataset.h;
    var ct=$('#chromeTop'), cb=$('#chromeBottom');
    if(ct){ ct.style.display='none'; ct.innerHTML=''; ct.style.height='0'; }
    if(cb){ cb.style.display='none'; cb.innerHTML=''; cb.style.height='0'; }
    frame.style.width=w+'px'; frame.style.height=h+'px';
    scaler.style.width=w+'px'; scaler.style.height=h+'px';
    fitStage(w,h);
  }

  window.addEventListener('message', function(e){ var m=e.data; if(!m||!m.__vc) return;
    if(m.__vc==='inview') setActiveFromScroll(m.sec, m.slide);
    if(m.__vc==='picked') openElementCard(m.sec, m.slide, m.family);
    if(m.__vc==='ready') syncFrame();
  });

  $('#prev').addEventListener('change', function(e){ previewOn=e.target.checked; applyLocalPreview(); });
  $('#q').addEventListener('input', function(){ renderBody(); });
  $('#rescan').addEventListener('click', function(){ refreshVars(); renderNav(); renderBody(); syncFrame(); flash($('#rescan')); });
  $('#resetzone').addEventListener('click', function(){ if(!confirm('Azzerare le modifiche della zona "'+zoneLabel(currentZone)+'"?')) return; overrides[currentZone]={}; saveOverrides(); applyLive(); renderBody(); });
  $('#pick').addEventListener('click', startPick);
  $('#exportCss').addEventListener('click', function(){ openExport(); });
  $('#exportFull').addEventListener('click', downloadFullSite);
  $('#mclose').addEventListener('click', function(){ $('#modal').classList.add('hidden'); });
  $('#copy').addEventListener('click', function(){ var ta=$('#csv'); ta.select(); try{ document.execCommand('copy'); }catch(e){} if(navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(function(){}); $('#copied').textContent='Copiato'; setTimeout(function(){ $('#copied').textContent=''; },1500); });
  $('#prevSlide').addEventListener('click', function(){ stepSlide(-1); });
  $('#nextSlide').addEventListener('click', function(){ stepSlide(1); });
  $('#followBtn').addEventListener('click', function(){ follow=!follow; $('#followBtn').classList.toggle('on',follow); });

  function startPick(){ if(currentDevice==='live'){ alert('Scegli prima un dispositivo di anteprima: la selezione al clic funziona nel riquadro.'); return; } try{ frame.contentWindow.postMessage({__vc:'pickmap', map:SELMAP}, '*'); frame.contentWindow.postMessage({__vc:'startpick'}, '*'); }catch(e){} $('#pick').classList.add('on'); setTimeout(function(){ $('#pick').classList.remove('on'); },4000); }
  function zoneLabel(id){ for(var i=0;i<ZONES.length;i++) if(ZONES[i].id===id) return ZONES[i].label; return id; }
  function flash(el){ el.style.background='#fcc454'; setTimeout(function(){ el.style.background=''; },250); }

  function familyLabel(f){
    if(f==='paginablocco') return '★★ Tutta la pagina (tutti gli elementi)';
    if(f==='headerblocco') return '★ Header (tutto insieme)';
    if(f==='cardblocco') return '★ Tutte le card (blocco intero)';
    var _cm=f.match(/^cardblocco(\d+)$/); if(_cm) return '★ Card '+_cm[1]+' (intera)';
    return f.replace(/-/g,' ')
    .replace(/\btitolo\b/,'Titolo').replace(/\bsub\b/,'Sottotitolo').replace(/\bcorpo\b/,'Testo')
    .replace(/\beyebrow\b/,'Occhiello').replace(/\bfrase\b/,'Frase').replace(/\bbtn\b/,'Bottone')
    .replace(/\bcard\b/,'Card').replace(/\bvoce\b/,'Voce').replace(/\bnum\b/,'Numero')
    .replace(/\btit\b/,'Titolo').replace(/\btesto\b/,'Testo').replace(/\bnome\b/,'Nome')
    .replace(/\bimmagine\b/,'Immagine').replace(/\bw(\d+)\b/,'Parola $1')
    .replace(/\b\w/g, function(c){ return c.toUpperCase(); }); }
  function groupLabel(sec,slide){ if(+sec===0) return 'Header (logo · menu · pillola)'; if(+sec===1) return 'Slide '+slide+(SLIDE_NAMI[slide]?' - '+SLIDE_NAMI[slide]:''); return 'Sez '+sec+' - Slide '+slide; }
  function groupKey(sec,slide){ return 's'+sec+'sl'+slide; }

  function buildTree(){ var tree={}; Object.keys(VARS).forEach(function(name){ var v=VARS[name], k=groupKey(v.sec,v.slide); (tree[k]=tree[k]||{sec:v.sec,slide:v.slide,fams:{}}); (tree[k].fams[v.family]=tree[k].fams[v.family]||[]).push({name:name,prop:v.prop}); }); return tree; }
  function sortedGroupKeys(tree){ function ord(s){ return s===0?999:s; } return Object.keys(tree).sort(function(a,b){ return (ord(tree[a].sec)-ord(tree[b].sec))||(tree[a].slide-tree[b].slide); }); }

  function setActiveFromScroll(sec,slide){ var gk=groupKey(sec,slide); if(!follow) return; if(gk===activeGroupKey) return; activeGroupKey=gk; renderNav(); renderBody(); }
  function stepSlide(dir){ var tree=buildTree(); var keys=sortedGroupKeys(tree); if(!keys.length) return; var i=keys.indexOf(activeGroupKey); if(i<0) i=0; i=Math.max(0,Math.min(keys.length-1,i+dir)); activeGroupKey=keys[i]; follow=false; $('#followBtn').classList.remove('on'); renderNav(); renderBody(); }

  function renderNav(){ var tree=buildTree(); var keys=sortedGroupKeys(tree); if(!keys.length){ $('#curSlide').textContent='-'; return; } if(!activeGroupKey || keys.indexOf(activeGroupKey)<0) activeGroupKey=keys[0]; var g=tree[activeGroupKey]; $('#curSlide').textContent=groupLabel(g.sec,g.slide); }

  function renderBody(){
    var body=$('#body');
    // memorizza quali elementi sono aperti e la posizione di scroll, per non richiudere/saltare
    var openSet={}; var prevScroll=0;
    try{ prevScroll=body.scrollTop; Array.prototype.forEach.call(root.querySelectorAll('.elem.open'), function(el){ var grp=el.closest('.grp'); var gk=grp?grp.dataset.gk:''; openSet[gk+'|'+el.dataset.fam]=1; }); }catch(e){}
    body.innerHTML='';
    var tree=buildTree(); var q=($('#q').value||'').trim().toLowerCase();
    var keys=sortedGroupKeys(tree);
    if(!keys.length){ body.innerHTML='<div class="empty">Nessuna variabile trovata.</div>'; return; }
    if(!activeGroupKey || keys.indexOf(activeGroupKey)<0) activeGroupKey=keys[0];

    var showKeys;
    if(q){ showKeys=keys; } // ricerca: mostra tutte le slide con match
    else { showKeys=[activeGroupKey]; } // normale: solo slide corrente

    showKeys.forEach(function(gk){
      var g=tree[gk], famKeys=Object.keys(g.fams).sort();
      var visible=famKeys.filter(function(f){ return !q || (groupLabel(g.sec,g.slide)+' '+familyLabel(f)+' '+f).toLowerCase().indexOf(q)!==-1; });
      if(!visible.length) return;
      var sec=document.createElement('div'); sec.className='grp open'; sec.dataset.gk=gk;
      if(q){ var h=document.createElement('div'); h.className='grphead'; h.innerHTML='<span>'+groupLabel(g.sec,g.slide)+'</span>'; sec.appendChild(h); }
      var wrap=document.createElement('div'); wrap.className='grpbody'; sec.appendChild(wrap);
      visible.forEach(function(family){
        var el=document.createElement('div'); el.className='elem'; el.dataset.fam=family;
        var eh=document.createElement('div'); eh.className='elemhead';
        var touched=g.fams[family].some(function(p){ return (overrides[currentZone]||{})[p.name]!=null; }) || currentHideMode(g.sec,g.slide,family)!=='visible';
        eh.innerHTML='<span>'+familyLabel(family)+'</span>'+(touched?'<span class="dot"></span>':'');
        var ctrls=document.createElement('div'); ctrls.className='ctrls';
        eh.addEventListener('click', function(){ el.classList.toggle('open'); });
        el.appendChild(eh); el.appendChild(ctrls);
        g.fams[family].sort(function(a,b){ return PROP_ORDER.indexOf(a.prop)-PROP_ORDER.indexOf(b.prop); }).forEach(function(p){ ctrls.appendChild(makeControl(p.name,p.prop)); });
        // --- Testo: modificabile su QUALSIASI elemento-foglia (niente contenitori con struttura interna) ---
        var bfk=famKeyOf(g.sec,g.slide,family);
        var bsel=(SELMAP[bfk]||[])[0];
        var bel=null; try{ bel=bsel?document.querySelector(bsel):null; }catch(e){}
        var isLeafText = bel && bel.children.length===0 && (bel.textContent||'').trim().length>0;
        if(isLeafText){
          var te=document.createElement('div'); te.className='texted';
          var lbl=document.createElement('div'); lbl.className='clab'; lbl.innerHTML='<span>Testo</span>';
          var ta=document.createElement('textarea'); ta.className='tbox'; ta.rows=(/btn|titolo|frase|corpo|testo/.test(family)?2:1);
          ta.value=(btnText[bfk]?btnText[bfk].text:(bel.textContent||'').trim());
          (function(fkk,sll){ ta.addEventListener('input', function(){ setBtnText(fkk, sll, ta.value); }); })(bfk,bsel);
          te.appendChild(lbl); te.appendChild(ta); el.appendChild(te);
        }
        // --- Nascondi: per zona, su qualsiasi elemento che il pannello riconosce (usa il selettore gia' in SELMAP) ---
        if(bsel && bel){
          var hrow=document.createElement('div'); hrow.className='ctrl';
          var hlab=document.createElement('div'); hlab.className='clab'; hlab.innerHTML='<span>Visibilita\'</span>';
          var hreset=document.createElement('button'); hreset.className='x'; hreset.textContent='↺'; hreset.title='Ripristina in questa zona';
          hreset.addEventListener('click', function(){ setHideMode(g.sec,g.slide,family,'visible'); renderBody(); }); hlab.appendChild(hreset);
          hrow.appendChild(hlab);
          var hseg=document.createElement('div'); hseg.className='seg';
          var hmodes=[['visible','Visibile','Nessuna modifica'],['none','No spazio','display:none - l\'elemento sparisce e il layout si ricompatta'],['hidden','Con spazio','visibility:hidden - invisibile ma lo spazio resta occupato']];
          var hcur=currentHideMode(g.sec,g.slide,family);
          hmodes.forEach(function(hm){
            var hb=document.createElement('button'); hb.textContent=hm[1]; hb.title=hm[2]; if(hm[0]===hcur) hb.classList.add('on');
            hb.addEventListener('click', function(){ setHideMode(g.sec,g.slide,family,hm[0]); renderBody(); });
            hseg.appendChild(hb);
          });
          hrow.appendChild(hseg); el.appendChild(hrow);
        }
        wrap.appendChild(el);
      });
      body.appendChild(sec);
    });
    if(!body.children.length) body.innerHTML='<div class="empty">Nessun elemento.</div>';
    // riapri gli elementi che erano aperti e ripristina lo scroll
    try{ Array.prototype.forEach.call(root.querySelectorAll('.elem'), function(el){ var grp=el.closest('.grp'); var gk=grp?grp.dataset.gk:''; if(openSet[gk+'|'+el.dataset.fam]) el.classList.add('open'); }); body.scrollTop=prevScroll; }catch(e){}
    if(pendingFocus){ focusFamily(pendingFocus); pendingFocus=null; }
  }

  var pendingFocus=null;
  function focusFamily(fam){ var el=root.querySelector('.grp[data-gk="'+fam.gk+'"] .elem[data-fam="'+fam.family+'"]'); if(!el){ // magari non e la slide attiva: passa a quella slide
      activeGroupKey=fam.gk; renderNav(); renderBody(); el=root.querySelector('.grp[data-gk="'+fam.gk+'"] .elem[data-fam="'+fam.family+'"]'); if(!el) return; }
    el.classList.add('open'); el.classList.add('justpicked'); setTimeout(function(){ el.classList.remove('justpicked'); },1400); el.scrollIntoView({block:'center',behavior:'smooth'}); }
  function openElementCard(sec,slide,family){ openDrawer(); follow=false; $('#followBtn').classList.remove('on'); activeGroupKey=groupKey(sec,slide); pendingFocus={gk:groupKey(sec,slide),family:family}; renderNav(); renderBody(); }

  function makeControl(name,prop){
    var info=PROP_INFO[prop]||{kind:'num',label:prop,min:-500,max:500,step:1};
    var row=document.createElement('div'); row.className='ctrl';
    var lab=document.createElement('div'); lab.className='clab'; lab.innerHTML='<span>'+(info.label||prop)+'</span>';
    var reset=document.createElement('button'); reset.className='x'; reset.textContent='\u21ba'; reset.title='Ripristina in questa zona';
    reset.addEventListener('click', function(){ clearOverride(name); renderBody(); }); lab.appendChild(reset); row.appendChild(lab);
    if(info.kind==='color'){
      var cur=currentValue(name)||defaultFor(name)||'#000000';
      var w=document.createElement('div'); w.className='colorwrap';
      var col=document.createElement('input'); col.type='color'; col.value=toHex(cur);
      var hex=document.createElement('input'); hex.type='text'; hex.className='hex'; hex.value=cur;
      col.addEventListener('input', function(){ hex.value=col.value; setOverride(name,col.value); markTouched(row); });
      hex.addEventListener('change', function(){ var v=hex.value.trim(); if(v){ setOverride(name,v); if(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) col.value=toHex(v); markTouched(row); } });
      w.appendChild(col); w.appendChild(hex); row.appendChild(w);
    } else {
      var unit=(info.kind==='px')?'px':''; var val=currentNumeric(name);
      var sl=document.createElement('input'); sl.type='range'; sl.min=info.min; sl.max=info.max; sl.step=info.step; sl.value=clamp(val,info.min,info.max);
      var nu=document.createElement('input'); nu.type='number'; nu.step=info.step; nu.value=round(val); nu.className='num';
      var u=document.createElement('span'); u.className='unit'; u.textContent=unit;
      function push(v){ setOverride(name, (info.kind==='px')?(v+'px'):String(v)); markTouched(row); }
      sl.addEventListener('input', function(){ nu.value=sl.value; push(parseFloat(sl.value)); });
      nu.addEventListener('input', function(){ var v=parseFloat(nu.value); if(!isNaN(v)){ sl.value=clamp(v,info.min,info.max); push(v); } });
      var line=document.createElement('div'); line.className='sliderline'; line.appendChild(sl);
      var nb=document.createElement('div'); nb.className='numbox'; nb.appendChild(nu); nb.appendChild(u); line.appendChild(nb); row.appendChild(line);
      if(defaultFor(name)==null && currentValue(name)==null){ var note=document.createElement('div'); note.className='note'; note.textContent='Base = clamp() responsivo - muovi per fissare'; row.appendChild(note); }
    }
    return row;
  }
  function markTouched(row){ var elem=row.closest&&row.closest('.elem'); if(!elem) return; var head=elem.querySelector('.elemhead'); if(head&&!head.querySelector('.dot')){ var d=document.createElement('span'); d.className='dot'; head.appendChild(d); } }

  /* ===================== EXPORT ===================== */
  function buildExportCss(){ var out='';
    ZONES.forEach(function(z){ var ov=overrides[z.id]; if(!ov) return; var keys=Object.keys(ov); if(!keys.length) return;
      var sp=splitZoneKeys(ov);
      var block='';
      if(sp.root.length){ var decls=sp.root.sort().map(function(d){ return '    '+d.replace(':',': ')+';'; }).join('\n'); block+='  :root{\n'+decls+'\n  }\n'; }
      if(sp.rules.length){ block+='  '+sp.rules.join('\n  ')+'\n'; }
      if(!block) return;
      out+='/* '+z.label+' */\n';
      out+= z.media?('@media '+z.media+'{\n'+block+'}\n\n'):(block.replace(/^  /gm,'')+'\n');
    }); return out.trim(); }
  function openExport(){ var css=buildExportCss(); var base=BASECSS?('/* Regole base (header, centratura bottoni, parole) */\n'+BASECSS+'\n'):''; $('#mtitle').textContent='Solo le modifiche (CSS)'; $('#mhint').innerHTML='Incolla nel tuo foglio di stile. Le regole base vanno messe una volta sola; i blocchi @media nei rispettivi punti.'; $('#csv').value=(base+css)||'/* Nessuna modifica ancora. */'; $('#modal').classList.remove('hidden'); }

  function downloadFullSite(){
    var css=buildExportCss(); var base=BASECSS||'';
    var hasText=Object.keys(textOverrides).length, hasWords=Object.keys(wordSplits).length, hasBtn=Object.keys(btnText).length;
    if(!css && !base && !hasText && !hasWords && !hasBtn){ alert('Non hai ancora fatto modifiche da esportare.'); return; }
    var styleBlock='\n<!-- Modifiche dal pannello di controllo -->\n<style id="vc-admin-applied">\n'+(base? base+'\n':'')+css+'\n</style>\n';
    fetch(location.href.split('#')[0]).then(function(r){ return r.text(); }).then(function(txt){
      var clean=stripPanel(txt);
      var doc;
      try{ doc=new DOMParser().parseFromString(clean,'text/html'); }catch(e){ doc=null; }
      if(doc && (hasText||hasWords||hasBtn)){
        // testi
        Object.keys(textOverrides).forEach(function(fk){ var o=textOverrides[fk]; try{ var el=doc.querySelector(o.sel); if(el) el.textContent=o.text; }catch(e){} });
        // testo bottoni
        Object.keys(btnText).forEach(function(fk){ var o=btnText[fk]; try{ var el=doc.querySelector(o.sel); if(el && el.children.length===0) el.textContent=o.text; }catch(e){} });
        // parole spezzate
        Object.keys(wordSplits).forEach(function(fk){ var w=wordSplits[fk]; try{ var el=doc.querySelector(w.sel); if(el) el.innerHTML=wordSpans(w); }catch(e){} });
        // inietta lo stile
        var head=doc.querySelector('head'); if(head){ var st=doc.createElement('style'); st.id='vc-admin-applied'; st.textContent='\n'+(base?base+'\n':'')+css+'\n'; head.appendChild(st); }
        triggerDownload('<!DOCTYPE html>\n'+doc.documentElement.outerHTML,'sito_completo.html');
      } else {
        var outHtml= clean.indexOf('</head>')!==-1 ? clean.replace('</head>', styleBlock+'</head>') : (clean+styleBlock);
        triggerDownload(outHtml,'sito_completo.html');
      }
    }).catch(function(){
      var clone=document.documentElement.cloneNode(true);
      Array.prototype.forEach.call(clone.querySelectorAll('#vc-admin-host,#vc-admin-overrides,#vc-admin-preview,#vc-admin-base,script[src*="vc-admin-panel"]'), function(n){ n.remove(); });
      var head=clone.querySelector('head'); if(head){ var st=document.createElement('style'); st.id='vc-admin-applied'; st.textContent='\n'+(base?base+'\n':'')+css+'\n'; head.appendChild(st); }
      triggerDownload('<!DOCTYPE html>\n'+clone.outerHTML,'sito_completo.html');
      $('#mtitle').textContent='Scaricato (modalita copia locale)'; $('#mhint').innerHTML='Aperto da file:// -> ho clonato la pagina (i testi modificati SONO inclusi, ma per un export pulito apri da server locale: <code>npm run dev</code>).'; $('#csv').value=''; $('#modal').classList.remove('hidden');
    });
  }
  function stripPanel(txt){ return txt.replace(/<script[^>]*src=["'][^"']*vc-admin-panel[^"']*["'][^>]*>\s*<\/script>\s*/gi,''); }
  function triggerDownload(text,filename){ var blob=new Blob([text],{type:'text/html;charset=utf-8'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1500); }

  /* ---- Testo del blocco: leggi/scrivi dal vivo (top + anteprima) ---- */
  function readText(sel){ try{ var el=document.querySelector(sel); return el? el.textContent.trim() : ''; }catch(e){ return ''; } }
  function setText(fk, sel, text){
    textOverrides[fk]={sel:sel, text:text}; jsave(TXT_KEY, textOverrides);
    try{ var el=document.querySelector(sel); if(el) el.textContent=text; }catch(e){}
    try{ frame.contentWindow.postMessage({__vc:'settext', sel:sel, text:text}, '*'); }catch(e){}
  }
  function setWordText(sec, slide, wfamily, sel, text){
    var m=wfamily.match(/^(.*)-w(\d+)$/); if(!m) return; var parentFk=famKeyOf(sec,slide,m[1]); var idx=+m[2]-1;
    var w=wordSplits[parentFk]; if(!w||!w.words[idx]) return;
    if(typeof w.words[idx]==='string') w.words[idx]={text:text,color:'inherit'}; else w.words[idx].text=text;
    jsave(WORD_KEY, wordSplits);
    try{ var el=document.querySelector(sel); if(el) el.textContent=text; }catch(e){}
    try{ frame.contentWindow.postMessage({__vc:'settext', sel:sel, text:text}, '*'); }catch(e){}
  }

  /* ---- Spezza in parole AUTOMATICO, conservando i colori originali ---- */
  function wordSpans(w){ return w.words.map(function(word,i){ var t=(word && word.text!=null)?word.text:word; return '<span class="'+w.base+'-w'+(i+1)+'">'+escapeHtml(t)+'</span>'; }).join(' '); }
  function captureWords(el){
    var out=[];
    (function walk(node, col){ for(var i=0;i<node.childNodes.length;i++){ var ch=node.childNodes[i];
      if(ch.nodeType===3){ var parts=(ch.textContent||'').split(/\s+/).filter(Boolean); parts.forEach(function(p){ out.push({text:p, color:col}); }); }
      else if(ch.nodeType===1){ var c=col; try{ c=getComputedStyle(ch).color||col; }catch(e){} walk(ch, c); }
    } })(el, (function(){ try{ return getComputedStyle(el).color; }catch(e){ return 'inherit'; } })());
    return out;
  }
  function splitWordsAuto(fk, sel){
    var p=fk.split('/'); var sec=+p[0].replace('s',''), slide=+p[1], family=p[2];
    var base='s'+sec+'-slide'+slide+'-'+family;
    var el=null; try{ el=document.querySelector(sel); }catch(e){}
    var words;
    if(textOverrides[fk]){ words=textOverrides[fk].text.split(/\s+/).filter(Boolean).map(function(t){ return {text:t, color:'inherit'}; }); }
    else if(el){ words=captureWords(el); }
    if(!words || !words.length){ alert('Non trovo il testo di questo elemento.'); return; }
    wordSplits[fk]={sel:sel, base:base, words:words}; jsave(WORD_KEY, wordSplits);
    var html=wordSpans(wordSplits[fk]);
    try{ if(el) el.innerHTML=html; }catch(e){}
    try{ frame.contentWindow.postMessage({__vc:'sethtml', sel:sel, html:html}, '*'); }catch(e){}
    addSynthetic(); syncFrame(); renderBody();
  }
  function unsplitWords(fk){
    var w=wordSplits[fk]; if(!w) return; var text=w.words.map(function(x){ return (x&&x.text!=null)?x.text:x; }).join(' ');
    delete wordSplits[fk]; jsave(WORD_KEY, wordSplits);
    try{ var el=document.querySelector(w.sel); if(el) el.textContent=text; }catch(e){}
    try{ frame.contentWindow.postMessage({__vc:'settext', sel:w.sel, text:text}, '*'); }catch(e){}
    refreshVars(); syncFrame(); renderBody();
  }

  function clamp(v,a,b){ v=parseFloat(v); if(isNaN(v)) return a; return Math.min(b,Math.max(a,v)); }
  function round(v){ return Math.round(v*1000)/1000; }
  function escapeHtml(s){ return s.replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
  function toHex(c){ c=String(c).trim(); if(/^#([0-9a-f]{6})$/i.test(c)) return c; if(/^#([0-9a-f]{3})$/i.test(c)) return '#'+c[1]+c[1]+c[2]+c[2]+c[3]+c[3]; var m=c.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i); if(m) return '#'+[m[1],m[2],m[3]].map(function(n){ return ('0'+(+n).toString(16)).slice(-2); }).join(''); return '#000000'; }

  function PANEL_CSS(){ return (
    ':host,*{box-sizing:border-box}'+
    '#fab{position:fixed;top:14px;right:14px;width:44px;height:44px;border-radius:50%;border:none;background:#1b1b1b;color:#fcc454;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,.28);font-family:system-ui,Arial,sans-serif}'+
    '#drawer{position:fixed;top:0;right:0;height:100vh;width:360px;max-width:94vw;background:#fbfbf9;color:#1b1b1b;display:flex;flex-direction:column;box-shadow:-8px 0 30px rgba(0,0,0,.18);transition:transform .22s ease;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:13px}'+
    '#drawer.closed{transform:translateX(102%)}'+
    'header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#1b1b1b;color:#fff}'+
    'header .ttl{font-weight:600}#close{background:transparent;border:none;color:#fff;font-size:16px;cursor:pointer}'+
    '#devbar{padding:9px;background:#efeee9;border-bottom:1px solid #e2e0d8}'+
    '.drow{display:flex;gap:6px;align-items:center;margin-bottom:6px}'+
    '#cat,#model{flex:1;padding:6px 7px;border:1px solid #d5d3c9;border-radius:8px;font-size:12px;background:#fff;min-width:0}'+
    '.seg{display:flex;border:1px solid #d5d3c9;border-radius:8px;overflow:hidden}'+
    '.seg button{border:none;background:#fff;padding:5px 9px;font-size:11px;cursor:pointer}'+
    '.seg button.on{background:#1b1b1b;color:#fcc454}'+
    '.chk{display:flex;align-items:center;gap:4px;color:#555;font-size:11.5px;cursor:pointer}'+
    '#zonechip{font-size:11px;color:#7a5c12;background:#fdf3d6;border:1px solid #ecd9a3;border-radius:6px;padding:3px 7px;display:inline-block;margin-top:2px;min-height:0}'+
    '#zonechip:empty{display:none}'+
    '#navrow{display:flex;align-items:center;gap:6px;padding:8px 12px 2px}'+
    '.nav{border:1px solid #d5d3c9;background:#fff;border-radius:8px;width:30px;height:30px;font-size:16px;cursor:pointer}'+
    '#curSlide{flex:1;text-align:center;font-weight:600;font-size:13px}'+
    '.follow{border:1px solid #d5d3c9;background:#fff;border-radius:8px;padding:5px 8px;font-size:11px;cursor:pointer}'+
    '.follow.on{background:#fcc454;border-color:#e0a92e}'+
    '#toolrow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px 4px}'+
    '.mini{border:1px solid #d5d3c9;background:#fff;border-radius:8px;padding:5px 9px;font-size:11.5px;cursor:pointer}.mini.on{background:#fcc454;border-color:#e0a92e}'+
    '#search{padding:4px 12px 10px}#search input{width:100%;padding:7px 9px;border:1px solid #d5d3c9;border-radius:8px;font-size:12px;background:#fff}'+
    '#body{flex:1;overflow:auto;padding:0 8px 8px}'+
    '.grp{border:1px solid #e6e4dc;border-radius:10px;margin:8px 4px;overflow:hidden;background:#fff}'+
    '.grphead{padding:8px 12px;font-weight:600;background:#f4f3ee;font-size:12px}'+
    '.grpbody{padding:4px 8px 8px}'+
    '.elem{border-top:1px solid #eee}.elemhead{display:flex;align-items:center;gap:8px;padding:8px 6px;cursor:pointer;font-weight:500}'+
    '.elem.justpicked{background:#fdf3d6}'+
    '.dot{width:8px;height:8px;border-radius:50%;background:#fcc454;box-shadow:0 0 0 2px #1b1b1b inset;display:inline-block}'+
    '.ctrls{display:none;padding:2px 6px 6px}.elem.open .ctrls{display:block}'+
    '.eltools{display:none;padding:0 6px 10px}.elem.open .eltools{display:block}'+
    '.wtool{border:1px dashed #cbb26a;background:#fdf7e6;color:#7a5c12;border-radius:7px;padding:4px 8px;font-size:11px;cursor:pointer}'+
    '.texted{padding:8px 6px 4px;border-top:1px dashed #eee}.elem.open .texted{display:block}.texted{display:none}'+
    '.tbox{width:100%;border:1px solid #d5d3c9;border-radius:8px;padding:6px 8px;font-size:12px;font-family:inherit;resize:vertical;background:#fffdf7}'+
    '.eltools2{margin-top:6px}'+
    '.ctrl{padding:7px 0;border-top:1px dashed #eee}'+
    '.clab{display:flex;justify-content:space-between;align-items:center;color:#444;margin-bottom:5px;font-size:12px}'+
    '.clab .x{border:none;background:transparent;cursor:pointer;color:#999;font-size:13px}.clab .x:hover{color:#1b1b1b}'+
    '.sliderline{display:flex;align-items:center;gap:8px}.sliderline input[type=range]{flex:1;accent-color:#1b1b1b}'+
    '.numbox{display:flex;align-items:center;gap:2px}.num{width:62px;padding:4px 6px;border:1px solid #d5d3c9;border-radius:6px;font-size:12px;text-align:right}'+
    '.unit{color:#999;font-size:11px;width:16px}'+
    '.colorwrap{display:flex;align-items:center;gap:8px}.colorwrap input[type=color]{width:38px;height:28px;border:1px solid #d5d3c9;border-radius:6px;background:#fff;cursor:pointer;padding:2px}'+
    '.hex{flex:1;padding:5px 8px;border:1px solid #d5d3c9;border-radius:6px;font-size:12px;font-family:ui-monospace,Menlo,monospace}'+
    '.note{color:#a08a4a;font-size:10.5px;margin-top:4px}.empty{padding:24px;text-align:center;color:#999}'+
    'footer{display:flex;gap:6px;padding:10px;border-top:1px solid #e2e0d8;background:#efeee9}'+
    'footer button{padding:9px 8px;border-radius:8px;border:1px solid #1b1b1b;background:#1b1b1b;color:#fcc454;font-size:12px;cursor:pointer;font-weight:600}'+
    '#exportFull{flex:1}footer button.ghost{background:#fff;color:#333;border-color:#d5d3c9;font-weight:500}footer button.danger:hover{border-color:#c0392b;color:#c0392b}'+
    '#stage{position:fixed;top:0;left:0;right:360px;bottom:0;background:#2a2a28;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px}'+
    '#stage.hidden{display:none}'+
    '#frameScaler{position:relative;transform-origin:top center;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.5);border-radius:6px;overflow:hidden;flex:0 0 auto;display:flex;flex-direction:column}'+
    '.chrome{width:100%;flex:0 0 auto;position:relative;overflow:hidden;box-sizing:border-box}'+
    '.chrome.top{background:#000;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 22px;font:600 13px system-ui}'+
    '.chrome.top.tablet,.chrome.top.desktop{background:#e9e9ec;color:#444;padding:0 14px;gap:10px}'+
    '.chrome .clock{font-weight:700}.chrome .stat{font-size:12px;letter-spacing:1px}'+
    '.chrome .island{position:absolute;left:50%;top:9px;transform:translateX(-50%);width:118px;height:32px;background:#000;border:1px solid #000;border-radius:18px}'+
    '.chrome .hole{position:absolute;left:50%;top:12px;transform:translateX(-50%);width:14px;height:14px;background:#000;border-radius:50%}'+
    '.chrome .tabs{color:#999;font-size:12px;white-space:nowrap}'+
    '.chrome .urlbar{background:#fff;border:1px solid #d8d8dc;border-radius:16px;padding:6px 18px;color:#333;font:500 13px system-ui;max-width:78%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:center}'+
    '.chrome.top .urlbar{flex:1;margin:0 4px}'+
    '.chrome.bottom{background:#f6f6f8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border-top:1px solid #e2e2e6}'+
    '.chrome.bottom .urlrow{display:flex;align-items:center;justify-content:center;gap:14px;width:100%;padding:0 18px}'+
    '.chrome.bottom .nav{color:#555;font-size:20px}'+
    '.chrome.bottom .homebar{width:130px;height:5px;background:#111;border-radius:3px;opacity:.85}'+
    '#frame{border:0;display:block;width:100%;background:#fff;flex:0 0 auto}'+
    '#stagelabel{position:fixed;top:10px;left:16px;color:#fcc454;font-family:system-ui,Arial;font-size:12px;background:#1b1b1b;padding:5px 10px;border-radius:999px}'+
    '#modal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}#modal.hidden{display:none}'+
    '.sheet{width:660px;max-width:92vw;max-height:82vh;background:#fff;border-radius:12px;padding:16px;display:flex;flex-direction:column;font-family:system-ui,Arial,sans-serif}'+
    '.mhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}.mhead button{border:none;background:transparent;font-size:16px;cursor:pointer}'+
    '.hint{font-size:12px;color:#666;margin:0 0 8px}.hint code{background:#f2f0e8;padding:1px 4px;border-radius:4px}'+
    '#csv{flex:1;min-height:200px;width:100%;font-family:ui-monospace,Menlo,monospace;font-size:12px;border:1px solid #d5d3c9;border-radius:8px;padding:10px;resize:vertical}'+
    '.mfoot{display:flex;align-items:center;gap:12px;margin-top:10px}.mfoot button{padding:9px 16px;border-radius:8px;border:none;background:#1b1b1b;color:#fcc454;font-weight:600;cursor:pointer}#copied{color:#2e7d32;font-size:12px}'
  ); }

  function applyTextLive(){
    Object.keys(textOverrides).forEach(function(fk){ var o=textOverrides[fk]; try{ var el=document.querySelector(o.sel); if(el) el.textContent=o.text; }catch(e){} });
    Object.keys(wordSplits).forEach(function(fk){ var w=wordSplits[fk]; try{ var el=document.querySelector(w.sel); if(el) el.innerHTML=wordSpans(w); }catch(e){} });
  }
  // Testo dei bottoni (elementi foglia, sicuri): applica dal vivo e nell'anteprima
  function applyBtnText(){ Object.keys(btnText).forEach(function(fk){ var o=btnText[fk]; try{ var el=document.querySelector(o.sel); if(el && el.children.length===0) el.textContent=o.text; }catch(e){} }); }
  function setBtnText(fk, sel, text){ btnText[fk]={sel:sel, text:text}; try{ localStorage.setItem(BTXT_KEY, JSON.stringify(btnText)); }catch(e){} try{ var el=document.querySelector(sel); if(el && el.children.length===0) el.textContent=text; }catch(e){} try{ frame.contentWindow.postMessage({__vc:'settext', sel:sel, text:text}, '*'); }catch(e){} }
  applyTextLive(); applyBtnText();
  applyLive(); renderNav(); renderBody(); setupTopObserver();
  console.log('[VC Admin v3] pronto - '+Object.keys(VARS).length+' variabili, '+Object.keys(SELMAP).length+' mappe selettore');

  /* ---- osservatore pagina reale (device=live) ---- */
  function setupTopObserver(){
    var scenes=collectScenes(document); if(!scenes.length||!window.IntersectionObserver) return;
    var io=new IntersectionObserver(function(ents){ if(currentDevice!=='live') return; var best=null; ents.forEach(function(en){ if(en.isIntersecting&&(!best||en.intersectionRatio>best.intersectionRatio)) best=en; }); if(best&&best.target.__vc) setActiveFromScroll(best.target.__vc.sec, best.target.__vc.slide); }, {threshold:[0.25,0.5,0.75]});
    scenes.forEach(function(s){ s.el.__vc={sec:s.sec,slide:s.slide}; io.observe(s.el); });
  }
  function collectScenes(doc){
    var out=[]; var scenes=doc.querySelectorAll('.vc-scena');
    Array.prototype.forEach.call(scenes, function(sc){
      var tally={}, bestKey=null, bestN=0;
      Object.keys(SELMAP).forEach(function(fk){
        var sels=SELMAP[fk];
        for(var i=0;i<sels.length;i++){ try{ if(sc.querySelector(sels[i])){ var p=fk.split('/'); var kk=p[0]+'/'+p[1]; tally[kk]=(tally[kk]||0)+1; if(tally[kk]>bestN){bestN=tally[kk];bestKey=kk;} break; } }catch(e){} }
      });
      if(bestKey){ var pp=bestKey.split('/'); out.push({el:sc, sec:+pp[0].replace('s',''), slide:+pp[1]}); }
    });
    return out;
  }

  /* ===================== SLAVE ===================== */
  function runSlave(){
    var ov=document.createElement('style'); ov.id='vc-admin-overrides'; document.documentElement.appendChild(ov);
    var pickStyle=document.createElement('style'); pickStyle.textContent='.vc-pick-hover{outline:2px solid #fcc454 !important;outline-offset:2px;cursor:crosshair !important}'; document.documentElement.appendChild(pickStyle);
    var SMAP={}; var picking=false, lastHover=null;

    function resolve(target){
      var best=null, bestNode=null;
      Object.keys(SMAP).forEach(function(fk){
        var sels=SMAP[fk];
        for(var i=0;i<sels.length;i++){ var node=null; try{ node=target.closest(sels[i]); }catch(e){} if(node){
          if(!bestNode || bestNode.contains(node)){ bestNode=node; best=fk; } // preferisci il piu interno
        } }
      });
      if(!best) return null; var p=best.split('/'); return {sec:+p[0].replace('s',''), slide:+p[1], family:p[2]};
    }
    window.addEventListener('message', function(e){ var m=e.data; if(!m||!m.__vc) return;
      if(m.__vc==='css'){ ov.textContent=m.css||''; }
      if(m.__vc==='pickmap'){ SMAP=m.map||{}; buildScenes(); }
      if(m.__vc==='startpick'){ picking=true; }
      if(m.__vc==='settext'){ try{ var el=document.querySelector(m.sel); if(el) el.textContent=m.text; }catch(e2){} }
      if(m.__vc==='sethtml'){ try{ var el2=document.querySelector(m.sel); if(el2) el2.innerHTML=m.html; }catch(e3){} }
      if(m.__vc==='textmap'){
        try{ var T=m.text||{}; Object.keys(T).forEach(function(k){ var o=T[k]; var el=document.querySelector(o.sel); if(el) el.textContent=o.text; }); }catch(e4){}
        try{ var W=m.words||{}; Object.keys(W).forEach(function(k){ var w=W[k]; var el=document.querySelector(w.sel); if(el) el.innerHTML=w.words.map(function(word,i){ var t=(word&&word.text!=null)?word.text:word; return '<span class="'+w.base+'-w'+(i+1)+'">'+String(t).replace(/[&<>\"]/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'})[c];})+'</span>'; }).join(' '); }); }catch(e5){}
      }
    });
    document.addEventListener('mousemove', function(e){ if(!picking) return; if(lastHover) lastHover.classList.remove('vc-pick-hover'); var r=resolveNode(e.target); if(r){ r.classList.add('vc-pick-hover'); lastHover=r; } }, true);
    document.addEventListener('click', function(e){ if(!picking) return; e.preventDefault(); e.stopPropagation(); if(lastHover) lastHover.classList.remove('vc-pick-hover'); picking=false; var f=resolve(e.target); if(f) parent.postMessage({__vc:'picked',sec:f.sec,slide:f.slide,family:f.family},'*'); }, true);
    function resolveNode(target){ var bestNode=null; Object.keys(SMAP).forEach(function(fk){ var sels=SMAP[fk]; for(var i=0;i<sels.length;i++){ var node=null; try{ node=target.closest(sels[i]); }catch(e){} if(node){ if(!bestNode||bestNode.contains(node)) bestNode=node; } } }); return bestNode; }

    var io=null;
    function buildScenes(){
      if(!window.IntersectionObserver) return; if(io) io.disconnect();
      io=new IntersectionObserver(function(ents){ var best=null; ents.forEach(function(en){ if(en.isIntersecting&&(!best||en.intersectionRatio>best.intersectionRatio)) best=en; }); if(best&&best.target.__vc) parent.postMessage({__vc:'inview',sec:best.target.__vc.sec,slide:best.target.__vc.slide},'*'); }, {threshold:[0.25,0.5,0.75]});
      Array.prototype.forEach.call(document.querySelectorAll('.vc-scena'), function(sc){
        var tally={}, bestKey=null, bestN=0;
        Object.keys(SMAP).forEach(function(fk){ var sels=SMAP[fk]; for(var i=0;i<sels.length;i++){ try{ if(sc.querySelector(sels[i])){ var p=fk.split('/'); var kk=p[0]+'/'+p[1]; tally[kk]=(tally[kk]||0)+1; if(tally[kk]>bestN){bestN=tally[kk];bestKey=kk;} break; } }catch(e){} } });
        if(bestKey){ var pp=bestKey.split('/'); sc.__vc={sec:+pp[0].replace('s',''),slide:+pp[1]}; io.observe(sc); }
      });
    }
    parent.postMessage({__vc:'ready'},'*');
  }
})();
