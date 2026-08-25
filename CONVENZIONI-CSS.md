# Convenzioni CSS — controlli del pannello sui breakpoint

Questo file spiega come scrivere/modificare regole in `@media` dentro
`sito_con_pannello.html` senza rompere il controllo del pannello
(`vc-admin-panel.js`) su quel breakpoint.

## Perché serve

Il pannello scala/sposta/formatta un elemento scrivendo variabili CSS
(`--s{sezione}-slide{N}-{elemento}-{proprietà}`) sulla regola **base**
(fuori da `@media`) dell'elemento, es.:

```css
.porte-titolo{
  transform:translate(var(--s1-slide5-titolo-x,0px),
                       calc(-6px + var(--s1-slide5-titolo-y,0px)));
}
```

Se una media query per un breakpoint specifico ridichiara la stessa
proprietà con un **valore numerico letterale** (`transform:translateY(-10vh)`,
`font-size:22px`, `line-height:1.1`...), quella dichiarazione vince per
cascata dentro quel breakpoint e la variabile del pannello smette di avere
effetto — il pannello sembra "non funzionare" solo su quel device/orientamento.

## Regola

**Ogni volta che tocchi in `@media` una proprietà che l'elemento controlla
già via variabile nella regola base, non scrivere mai un valore letterale:
incorpora sempre la stessa variabile nella formula, con il nuovo valore del
breakpoint come fallback/offset.**

Questo garantisce automaticamente i due vincoli:
- **(a) resa a riposo identica**: se la variabile non è impostata (nessuna
  modifica dal pannello), il `var(...,fallback)` restituisce il fallback,
  cioè esattamente il valore che c'era prima — zero differenza visiva.
- **(b) indipendenza tra breakpoint**: le variabili sono scritte da
  `vc-admin-panel.js` dentro un blocco `@media` specifico per zona (es. solo
  dentro `mobV`), quindi un valore impostato su un breakpoint non tocca gli
  altri: cambia solo la formula che *quel* breakpoint usa.

## Pattern per proprietà

**font-size** (variabile `-scale`):
```css
font-size:calc(<valore-di-quel-breakpoint> * var(--s{N}-slide{M}-{elem}-scale,1));
```

**line-height** (variabile `-lh`):
```css
line-height:var(--s{N}-slide{M}-{elem}-lh, <valore-di-quel-breakpoint>);
```

**letter-spacing** (variabile `-ls`):
```css
letter-spacing:var(--s{N}-slide{M}-{elem}-ls, <valore-di-quel-breakpoint>);
```

**transform / posizione** (variabili `-x` e `-y`):
```css
transform:translate(var(--s{N}-slide{M}-{elem}-x,0px),
                     calc(<offset-Y-di-quel-breakpoint> + var(--s{N}-slide{M}-{elem}-y,0px)));
```
(l'offset può essere in `px`, `vh`, ecc. — resta l'unica parte che cambia da
un breakpoint all'altro; la variabile `-y` si somma sempre sopra, mai la sostituisce)

**padding di bottoni/card** (variabili `-pad-v-base` / `-pad-h-base`,
scalate poi dal pannello con `-uscale`/`-padh`/`-padv` se presenti):
```css
padding:calc(<valore-verticale> * var(--s{N}-slide{M}-{elem}-scale,1))
        calc(<valore-orizzontale> * var(--s{N}-slide{M}-{elem}-scale,1));
```

## Esempi

**Titolo con offset verticale diverso su mobile landscape:**
```css
/* PRIMA (rompe il pannello su questo breakpoint) */
@media (max-height:550px){
  .porte-titolo{ transform:translateY(-40px); }
}

/* DOPO (corretto) */
@media (max-height:550px){
  .porte-titolo{
    transform:translate(var(--s1-slide5-titolo-x,0px),
                         calc(-40px + var(--s1-slide5-titolo-y,0px)));
  }
}
```

**Testo con interlinea ridotta su tablet:**
```css
/* PRIMA */
@media (min-width:768px) and (max-width:1024px){
  .hero-sub{ line-height:0.9; }
}

/* DOPO */
@media (min-width:768px) and (max-width:1024px){
  .hero-sub{ line-height:var(--s1-slide1-sub-lh, 0.9); }
}
```

**Bottone più piccolo e con meno padding su mobile:**
```css
/* PRIMA */
@media (max-width:767px){
  .cta-btn{ font-size:14px; padding:8px 16px; }
}

/* DOPO */
@media (max-width:767px){
  .cta-btn{
    font-size:calc(14px * var(--s1-slideN-cta-scale,1));
    padding:calc(8px * var(--s1-slideN-cta-scale,1))
            calc(16px * var(--s1-slideN-cta-scale,1));
  }
}
```

## Checklist rapida prima di committare una modifica CSS in `@media`

1. La proprietà che sto scrivendo è già controllata dal pannello nella
   regola base di questo selettore (ha una variabile `var(--...,fallback)`)?
   Se sì → non scrivere un valore letterale, incorpora la stessa variabile.
2. Ho verificato dal vivo (pannello aperto, nessuna modifica) che la resa è
   identica a prima su tutti i breakpoint?
3. Ho verificato che impostare un valore dal pannello su UN breakpoint non
   cambia gli altri?
