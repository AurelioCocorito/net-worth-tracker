# Composizione mobile — analisi, misure e specifiche

> Sessione del 2026-09-26, dalla domanda del proprietario: «l'app è densa di informazioni in ogni sua parte, ed è
> questo che le va contro sul telefono: lì guardo al massimo 4–5 informazioni». Questa cartella tiene UNA specifica per
> implementazione (`MOB-NN-*.md`, sullo stesso template delle 14 spec PERF, tutte ritirate entro il 2026-10-08, ognuna con il prompt e il modello in coda), il censimento
> di riferimento in `reference/`, il prompt che ritira una spec dopo il suo merge in `develop` (`ritiro.md`) e questo indice: la domanda con la risposta, come è stato misurato il mobile attuale,
> la baseline, le tre direzioni disegnate e quella scelta, l'ordine consigliato e lo stato. **Si implementa DOPO le 14
> spec PERF** (decisione del proprietario; tutte in develop e ritirate, l'ultima il 2026-10-08): PERF-02 (in develop dal 2026-09-29) e PERF-03 (in develop dal 2026-09-30: la riga «Aggiornato alle…» sta nel `PageHeader`, non nella composizione) cambiano la shell che il mobile eredita, PERF-04 (in develop dal 2026-09-30), PERF-12 (dal 2026-10-06) e PERF-11 (dal 2026-10-07) e PERF-14 (dal 2026-10-08)
> hanno toccato gli stessi componenti. Una spec che si chiude aggiorna la tabella in § 6 e, se ha rimisurato, la tabella § 3.1
> «Fixture» (creata da MOB-01 con la prima corsa sul fixture del budget); la tabella del 2026-09-26 sul mirror (§ 3) resta
> intatta come riferimento storico, e le corse sul mirror di fine spec vanno in SESSION_NOTES (solo aggregati). **Lettura
> adversariale del 2026-10-10**: tutte e nove le spec rilette insieme contro il codice e le decisioni di § 9, 261 rilievi
> corretti in loco e 49 domande chiuse (§ 9, decisioni 9–57); § 10 è vuoto. MOB-01 e MOB-02 sono fatte e ritirate (2026-10-10, PR #448 e #450), MOB-03 il 2026-10-11 (PR #452), MOB-04 il 2026-10-12 (PR #454), MOB-05 il 2026-10-14 (PR #459), MOB-06 il 2026-10-15 (PR #462) e MOB-07 il 2026-10-16 (PR #464): § 3.1 ha
> la tabella del fixture, il loro testo è in `git log -- doc/mobile/`.

## 1. La domanda e la risposta

**Vale la pena un design ad hoc per mobile e tablet?** Sì, ma come **composizione**, non come secondo design system.
DESIGN.md impone «mobile-first a 390, il desktop aggiunge colonne, non semplifica mai»: la conseguenza, misurata, è che
a 390 ogni pagina è la stessa griglia desktop messa in colonna — 3–8 tessere una sotto l'altra, ognuna con eyebrow,
lettura e figure — e la prima schermata contiene il verdetto e l'INIZIO di una tessera, mai una intera, con 2–5
schermate di scroll sotto (mediana 3,8). Il telefono porta tutto quello che porta il desktop, solo più lungo.

L'architettura «verdetto sopra le tessere» è però già l'ossatura giusta per un telefono: una frase che risponde alla
domanda della pagina, poi tessere che rispondono a UNA domanda ciascuna. Il mobile non ha bisogno di tessere nuove né
di token nuovi: ha bisogno di una SELEZIONE diversa (cosa sta nella prima schermata) e di una DIVULGAZIONE diversa (il
resto a un tap, non in fondo a uno scroll). Un linguaggio visivo diverso per mobile raddoppierebbe DESIGN.md, i dodici
temi, la regola degli stati su venti superfici e quaranta modali: escluso.

## 2. Come è stato misurato

- **Uno script Playwright usa-e-getta** (`reference/mobile-census.mjs`, Chromium headless, `isMobile` + `hasTouch`,
  locale it-IT) sul dev server degli emulatori (`npm run dev:emulator`, :3000) con il **mirror del proprietario**
  (`npm run mirror:seed -- <email>`: 25 asset, 1533 spese, 45 snapshot; rimosso a fine sessione). Per 19 superfici
  (11 route, con Cashflow e FIRE contate per tab: 9 + 5 + 5) a **390×844**, **768×1024** e **1024×768**: login vero,
  attesa di `h1` + prima cifra in euro + nessuno skeleton, poi 3 s per i count-up.
- **Le misure** (tutto relativo a `main`, che è lo scroller dell'app): `screens` = `scrollHeight / clientHeight`;
  le tessere visibili (`section.rounded-2xl`, `checkVisibility()`: le tab `forceMount` nascoste non contano) con
  `top`, altezza, cifre e parole; le cifre (`\d[\d.,]*\s?(€|%)`) e le parole totali e «sopra la piega» (il nodo
  inizia nella prima schermata); i controlli; i grafici; le tablist; `scrollWidth > clientWidth`. Due screenshot per
  superficie (prima schermata e pagina intera con `main` sbloccato).
- **Cosa NON misura**: i tempi (dev server, non build di produzione: la baseline dei tempi è doc/guide/velocita.md § Baseline in vigore, quella storica del 2026-09-26 in § Baseline storica);
  la differenza fra cifre «nel verdetto» e «fuori» (le ha contate lo script a mano nelle tre pagine dei mock; MOB-01
  la rende una misura). I dati grezzi (JSON e screenshot) restano fuori dal repo: portano le cifre reali.

## 3. Baseline (2026-09-26, mirror, dev server)

> Presa PRIMA dei contributi del 2026-09-27. Da #401 la riga **Analisi a 390** cambia: sotto i 640 px il Flusso non è più
> un Sankey, `charts` scende da 2 a 1, cifre e controlli salgono, le schermate sono da rimisurare; a 768 e 1024 no. Dal
> 2026-09-28 (la nuova Esposizione, #407) cambiano le righe **Allocazione** (la base dell'Esposizione e la riga di copertura). #400 a interruttore spento
> e #403 non muovono righe. MOB-01 rimisura: il budget nasce con i contributi dentro.

`screens` = schermate di scroll. `tiles` = tessere visibili (sopra la piega = che INIZIANO nella prima schermata;
«fully» = interamente dentro). `figures` = cifre € o % (totali / sopra la piega). `words` = parole (totali / sopra la
piega). `controls` = bottoni, link, tab, input (totali / sopra la piega).

### 390 × 844 (telefono)

| Superficie | screens | tiles (above / fully) | figures | words | controls | charts |
|---|---|---|---|---|---|---|
| Panoramica | 4,41 | 8 (1 / 0) | 107 / 20 | 535 / 156 | 21 / 7 | 0 |
| Patrimonio | 5,52 | 7 (1 / 0) | 221 / 17 | 1398 / 141 | 124 / 8 | 13 |
| Cashflow › Tracciamento | 4,34 | 5 (1 / 0) | 60 / 16 | 559 / 153 | 33 / 7 | 2 |
| Cashflow › Budget | 3,27 | 5 (1 / 0) | 64 / 15 | 480 / 151 | 26 / 8 | 1 |
| Cashflow › Centri | 1,92 | 3 (2 / 1) | 20 / 10 | 249 / 133 | 10 / 7 | 1 |
| Cashflow › Divisione | 1,90 | 4 (1 / 0) | 43 / 19 | 269 / 150 | 7 / 7 | 0 |
| Cashflow › Dividendi | 3,77 | 6 (1 / 0) | 36 / 8 | 473 / 112 | 24 / 11 | 2 |
| Analisi | 4,23 | 6 (1 / 0) | 56 / 12 | 571 / 142 | 32 / 6 | 2 |
| Rendimenti | 4,71 | 8 (1 / 0) | 53 / 7 | 640 / 155 | 27 / 9 | 2 |
| Storico | 5,05 | 5 (1 / 0) | 103 / 15 | 754 / 138 | 27 / 1 | 3 |
| Allocazione | 5,25 | 5 (2 / 1) | 194 / 27 | 1032 / 168 | 27 / 7 | 1 |
| Previdenza | 3,84 | 5 (1 / 0) | 59 / 16 | 623 / 139 | 9 / 2 | 0 |
| FIRE › Calcolatore | 3,37 | 4 (1 / 0) | 49 / 15 | 579 / 193 | 11 / 8 | 1 |
| FIRE › Coast | 2,75 | 3 (1 / 0) | 49 / 17 | 506 / 176 | 9 / 5 | 1 |
| FIRE › What If | 4,57 | 4 (1 / 0) | 82 / 18 | 710 / 167 | 25 / 16 | 1 |
| FIRE › Monte Carlo | 5,05 | 4 (1 / 0) | 34 / 7 | 617 / 151 | 48 / 5 | 2 |
| FIRE › Obiettivi (vuoto sul mirror) | 1,00 | 1 (1 / 1) | 0 / 0 | 51 / 51 | 6 / 6 | 0 |
| Hall of Fame | 3,43 | 5 (1 / 0) | 49 / 17 | 555 / 185 | 11 / 2 | 1 |
| Impostazioni | 2,11 | 3 (2 / 1) | 9 / 5 | 211 / 153 | 31 / 13 | 0 |

Lettura: su OGNI pagina con dati la prima schermata contiene il verdetto e l'inizio di UNA tessera; le cifre sopra la
piega (7–27) sono quasi tutte DENTRO il verdetto (Panoramica: 20 sopra la piega, il verdetto è alto 315 px e la tessera
hero 709 px; Tracciamento: la tessera Movimenti è alta 1587 px). Le pagine più lunghe: Patrimonio 5,5 · Allocazione
5,3 · Storico 5,1 · Monte Carlo 5,1 · Rendimenti 4,7.

### 768 × 1024 (tablet portrait) e 1024 × 768 (tablet landscape)

| Superficie | 768: screens | 768: tiles (above / fully) | 768: figures | 1024: screens | 1024: tiles (above / fully) | 1024: figures |
|---|---|---|---|---|---|---|
| Panoramica | 2,39 | 8 (3 / 1) | 107 / 43 | 3,11 | 8 (1 / 0) | 107 / 22 |
| Patrimonio | 3,46 | 7 (3 / 1) | 221 / 33 | 4,60 | 7 (1 / 0) | 221 / 23 |
| Cashflow › Tracciamento | 3,14 | 5 (3 / 1) | 60 / 30 | 4,21 | 5 (1 / 0) | 60 / 16 |
| Cashflow › Budget | 2,35 | 5 (3 / 1) | 64 / 21 | 2,98 | 5 (1 / 0) | 64 / 15 |
| Cashflow › Centri | 1,46 | 3 (2 / 1) | 20 / 19 | 1,74 | 3 (1 / 0) | 20 / 10 |
| Cashflow › Divisione | 1,25 | 4 (4 / 2) | 43 / 39 | 1,55 | 4 (1 / 0) | 43 / 19 |
| Cashflow › Dividendi | 2,39 | 6 (3 / 1) | 36 / 18 | 3,16 | 6 (1 / 0) | 36 / 7 |
| Analisi | 2,89 | 6 (3 / 1) | 56 / 29 | 3,87 | 6 (1 / 1) | 56 / 12 |
| Rendimenti | 2,75 | 8 (3 / 1) | 53 / 12 | 3,62 | 8 (1 / 0) | 53 / 7 |
| Storico | 3,20 | 5 (3 / 1) | 103 / 28 | 4,20 | 5 (1 / 0) | 103 / 16 |
| Allocazione | 3,34 | 5 (2 / 1) | 194 / 50 | 4,27 | 5 (2 / 1) | 194 / 36 |
| Previdenza | 2,34 | 5 (3 / 1) | 59 / 32 | 2,97 | 5 (1 / 0) | 59 / 16 |
| FIRE › Calcolatore | 2,01 | 4 (3 / 1) | 49 / 19 | 2,58 | 4 (1 / 0) | 49 / 15 |
| FIRE › Coast | 1,72 | 3 (2 / 1) | 49 / 24 | 2,14 | 3 (1 / 0) | 49 / 17 |
| FIRE › What If | 3,45 | 4 (1 / 0) | 82 / 25 | 4,64 | 4 (1 / 0) | 82 / 18 |
| FIRE › Monte Carlo | 2,75 | 4 (2 / 1) | 34 / 9 | 3,58 | 4 (1 / 0) | 34 / 8 |
| FIRE › Obiettivi | 1,00 | 1 (1 / 1) | 0 / 0 | 1,00 | 1 (1 / 1) | 0 / 0 |
| Hall of Fame | 2,17 | 5 (3 / 1) | 49 / 34 | 2,85 | 5 (1 / 0) | 49 / 17 |
| Impostazioni | 1,35 | 3 (3 / 2) | 9 / 7 | 1,68 | 3 (3 / 2) | 9 / 7 |

Lettura: a 768 la griglia a due colonne dimezza lo scroll (mediana ~2,4 schermate) e porta tre tessere sopra la piega,
una intera; a 1024 landscape (768 px di altezza) si torna a UNA tessera sopra la piega e ~3,1 schermate (mediana 3,11). La composizione
attuale premia il portrait e penalizza il landscape.

**Rimisurate il 2026-10-10 (MOB-01)**, mirror riseminato quel giorno, build di produzione su :3200, `npm run
mobile:census` — le righe che i contributi del 2026-09-27/28 dovevano muovere (`screens` · tessere sopra la piega /
intere · cifre sopra la piega): **Analisi 390** 4,88 · 1/0 · 13 (#401: il Flusso sotto 640 px è barra e righe);
**Allocazione** 390 5,04 · 2/1 · 26 · 768 3,02 · 2/1 · 48 · 1024 3,86 · 2/1 · 36 (la nuova Esposizione, #407). La
definizione di cifra di MOB-01, più stretta (ritagli, `[inert]`, opacità 0 e sovrapposizioni `fixed` esclusi), sulla
stessa corsa differisce da quella della baseline di UNA cifra su 57 misure: gli altri scarti dal 26/9 sono dati del mese
(Divisione nello stato «quote non calcolabili», un verdetto con una riga in più); il dettaglio riga per riga stava nelle
note di quella sessione, che non sopravvivono al commit (WORKFLOW.md § Where things are recorded).

### 3.1 Fixture (dal primo `mobile:census` di MOB-01)

**2026-10-10, `census@example.com`, build di produzione su :3200, 19 superfici × 3 viewport in 2,0 minuti; due
corse consecutive identiche.** È `doc/mobile/budget.json` com'è nato (`mobile:budget -- --tighten` sulla prima corsa) e
la tabella che le spec MOB-02..08 aggiornano quando rimisurano. Cella = `screens` · tessere che iniziano / stanno intere
entro `main.clientHeight` · cifre sopra la piega / cifre fuori dal verdetto sopra la pill · `riga` = `firstClosedRowAbovePill`
dove una riga chiusa esiste (`null` altrove, non stampato); `overflowX` `false` ovunque. **Righe riscritte intere dal
`budget.json` del 2026-10-16 (ritiro di MOB-07; il `--tighten` di MOB-07 del 2026-10-15 aveva stretto Patrimonio 1024 e Budget 768
senza riportarlo qui, e il ritiro le ha riallargate — decisione 94)** — la prima riscrittura intera fu nel ritiro di MOB-03 dal file del 2026-10-11: il
`--tighten` della sua sessione aveva stretto una ventina di celle senza riportarle qui (le strette sono elencate sotto), e
d'ora in poi ogni rimisura riscrive la tabella intera dal file, non la sola riga della spec. La tabella § 3 (mirror, dev
server, 2026-09-26) non si tocca più.

| Superficie | 390 | 768 | 1024 |
|---|---|---|---|
| Panoramica (MOB-03, 2026-10-11: era 3,56 · 1/0 · 15 / 5 · 2,1 · 3/1 · 39 / 23 · 2,75 · 1/0 · 22 / 7; MOB-07, 2026-10-15: 390 `screens` 1,66 → 1,74 sulla macchina di riferimento, decisione 89) | 1,74 · 1/1 · 5 / 5 · riga `false` | 1,26 · 7/5 · 15 / 15 · riga `true` | 1,6 · 1/0 · 10 / 7 (misurate 10 · riga `false`: informative a 1024, il budget tiene 7 e `null` fino a MOB-08) |
| Patrimonio (MOB-06, 2026-10-14: era 3,25 · 1/0 · 16 / 5 · 2,04 · 5/3 · 26 / 15 · 2,67 · 1/1 · 19 / 11) | 1,67 · 1/0 · 7 / 4 · riga `false` | 1,25 · 5/3 · 16 / 13 | 1,58 · 1/0 · 10 / 7 (il `--tighten` di MOB-07 l'aveva stretta a 1,57 senza riportarlo; ritiro di MOB-07, 2026-10-16: 1,58 di nuovo, decisione 94) |
| Cashflow › Tracciamento (MOB-04, 2026-10-12: era 3,16 · 1/0 · 15 / 5 · 2,34 · 3/1 · 23 / 13 · 3,07 · 1/0 · 14 / 5; ritiro di MOB-06, 2026-10-15: era 1,67 · 12 / 5 · 16 · 14, la deriva del giorno, decisione 87) | 1,69 · 1/0 · 13 / 7 · riga `false` | 1,28 · 3/3 · 18 / 10 (misurate 12 · riga `false`: informative a 768) | 1,6 · 1/0 · 16 / 5 (misurate 10 · riga `false`: informative a 1024, il budget tiene 5 e `null` fino a MOB-08) |
| Cashflow › Budget (MOB-04, 2026-10-12: era 2,67 · 1/1 · 15 / 9 · 1,9 · 3/1 · 21 / 11 · 2,37 · 1/0 · 15 / 9) | 1,83 · 1/0 · 15 / 9 · riga `false` (MOB-07, 2026-10-15: 1,81 → 1,83 sulla macchina di riferimento, decisione 89) | 1,36 · 4/4 · 17 / 11 · riga `true` (il `--tighten` di MOB-07 l'aveva stretta a 1,35 senza riportarlo; ritiro di MOB-07, 2026-10-16: 1,36 di nuovo, decisione 94) | 1,62 · 1/0 · 17 / 9 (misurate 11 nel ritiro: informativa, il budget tiene 9) |
| Cashflow › Centri (MOB-04, 2026-10-12: era 2,03 · 1/0 · 10 / 5 · 1,47 · 2/1 · 18 / 11 · 1,78 · 1/0 · 10 / 5) | 1,55 · 1/0 · 10 / 5 · riga `false` | 1,19 · 3/3 · 10 / 5 · riga `true` | 1,38 · 1/0 · 10 / 5 |
| Cashflow › Divisione (MOB-04, 2026-10-12: era 2,01 · 1/0 · 22 / 5 · 1,31 · 4/2 · 38 / 18 · 1,61 · 1/0 · 22 / 8) | 1,62 · 1/0 · 17 / 7 · riga `false` | 1,19 · 4/2 · 19 / 11 | 1,5 · 1/0 · 16 / 7 (MOB-07, 2026-10-15: 1,47 → 1,5 sulla macchina di riferimento, decisione 89) |
| Cashflow › Dividendi (MOB-04, 2026-10-12: era 3,03 · 2/1 · 8 / 4 · 1,92 · 3/1 · 16 / 12 · 2,45 · 3/1 · 7 / 4) | 1,61 · 2/2 · 6 / 4 · riga `false` | 1,15 · 6/6 · 6 / 4 · riga `true` | 1,41 · 1/1 · 6 / 4 |
| Analisi (MOB-06, 2026-10-14: era 3,68 · 1/0 · 12 / 7 · 2,43 · 3/1 · 20 / 13 · 3,25 · 1/1 · 12 / 7) | 1,86 · 1/0 · 8 / 5 · riga `false` | 1,27 · 6/5 · 12 / 9 · riga `true` | 1,61 · 1/0 · 12 / 7 (misurate 9 · riga `false`: informative a 1024, il budget tiene 7 e `null` fino a MOB-08) |
| Rendimenti (MOB-05, 2026-10-14: era 4,09 · 1/0 · 8 / 6 · 2,47 · 3/1 · 16 / 11 · 3,25 · 1/0 · 8 / 6) | 1,76 · 2/1 · 5 / 5 · riga `false` | 1,28 · 5/5 · 7 / 7 · riga `true` | 1,62 · 1/0 · 7 / 6 (misurate 7 · riga `false`: informative a 1024, il budget tiene 6 e `null` fino a MOB-08) |
| Storico (MOB-06, 2026-10-14: era 4,71 · 1/0 · 16 / 9 · 3,03 · 3/1 · 29 / 19 · 3,96 · 1/0 · 16 / 10) | 1,88 · 1/0 · 12 / 7 · riga `false` (MOB-07, 2026-10-15: 1,86 → 1,88 sulla macchina di riferimento, decisione 89) | 1,31 · 5/5 · 16 / 12 · riga `true` | 1,66 · 1/0 · 16 / 10 (misurate 12 · riga `false`: informative a 1024) |
| Allocazione (MOB-07, 2026-10-15: era 3,57 · 2/1 · 26 / 18 · 2,33 · 4/2 · 33 / 28 · 2,96 · 2/1 · 28 / 23) | 1,59 · 2/1 · 17 / 16 · riga `false` | 1,2 · 5/5 · 18 / 17 · riga `true` (ritiro di MOB-07, 2026-10-16: 17 / 16 → 18 / 17, decisione 99) | 1,48 · 2/1 · 18 / 17 · riga `true` (ritiro di MOB-07, 2026-10-16: 2/2 → 2/1, decisione 94; 17 / 16 → 18 / 17, decisione 99) |
| Previdenza (MOB-07, 2026-10-15: era 3,85 · 1/0 · 12 / 7 · 2,59 · 3/1 · 26 / 12 · 3,37 · 1/0 · 12 / 9) | 1,96 · 1/0 · 9 / 9 · riga `false` | 1,41 · 1/1 · 11 / 11 (riga `false`: informativa a 768) | 1,75 · 1/0 · 9 / 9 (riga `false`: informativa a 1024; ritiro di MOB-07, 2026-10-16: 1,74 → 1,75, decisione 94) |
| FIRE › Calcolatore (MOB-07, 2026-10-15: era 3,13 · 1/0 · 16 / 8 · 1,91 · 3/1 · 23 / 12 · 2,45 · 1/0 · 16 / 9) | 1,81 · 1/0 · 13 / 10 · riga `false` | 1,24 · 4/4 · 18 / 11 · riga `true` | 1,54 · 1/0 · 14 / 9 (misurate 11 · riga `false`: informative a 1024) |
| FIRE › Coast (MOB-07, 2026-10-15: era 2,25 · 1/0 · 16 / 10 · 1,55 · 3/2 · 20 / 12 · 1,95 · 1/0 · 16 / 11) | 1,8 · 1/0 · 17 / 12 · riga `false` | 1,27 · 3/3 · 22 / 12 · riga `true` (misurate 14: informativa) | 1,59 · 1/0 · 17 / 11 (misurate 13 · riga `false`: informative a 1024) |
| FIRE › What If (MOB-07, 2026-10-15: era 4,06 · 1/0 · 20 / 5 · 3,03 · 2/1 · 27 / 17 · 4,02 · 1/0 · 20 / 8) | 1,73 · 1/0 · 15 / 5 · riga `false` | 1,33 · 2/1 · 21 / 13 (riga `false`: informativa a 768) | 1,66 · 1/0 · 14 / 6 (riga `false`: informativa a 1024) |
| FIRE › Monte Carlo (MOB-07, 2026-10-15: era 4,89 · 1/0 · 6 / 1 · 2,67 · 2/1 · 8 / 3 · 3,47 · 1/0 · 7 / 2; il 4,89 era l'oscillazione del 2026-10-12) | 1,83 · 1/0 · 5 / 2 · riga `false` | 1,29 · 3/2 · 6 / 3 (riga `false`: informativa a 768) | 1,59 · 1/0 · 6 / 2 (misurate 3 · riga `false`: informative a 1024) |
| FIRE › Obiettivi (MOB-07, 2026-10-15: acceso nel seed con un obiettivo, decisione 60; era spento, 1 · 1/1 · 0 / 0 ovunque) | 1,32 · 4/3 · 9 / 9 · riga `true` | 1 · 4/4 · 9 / 0 · riga `true` (misurate 9: informativa) | 1,19 · 4/3 · 9 / 0 · riga `true` (misurate 9: informativa) |
| Hall of Fame (MOB-02, 2026-10-10: era 2,88 · 1/0 · 17 / 12 · 1,84 · 3/1 · 34 / 25 · 2,37 · 1/0 · 17 / 12) | 1,8 · 1/0 · 19 / 15 · riga `false` | 1,3 · 5/4 · 19 / 17 · riga `true` | 1,65 · 1/0 · 17 / 15 · riga `false` |
| Impostazioni (MOB-07, 2026-10-15: 768 1,36 → 1,38 e 1024 1,69 → 1,71 sulla macchina di riferimento, decisione 89) | 2,1 · 2/1 · 2 / 2 | 1,38 · 3/2 · 4 / 4 | 1,71 · 3/2 · 4 / 4 |

**Voci allargate con `raisedBy`** (decisioni 19 e 22):

- **`MOB-07 (ritiro, 2026-10-16, decisione 94): …`** (proprietario: «Allarga le quattro con raisedBy»): quattro celle rosse sulla build
  mergiata di MOB-07 senza una modifica — Patrimonio 1024 `screens` 1,57 → 1,58, Budget 768 1,35 → 1,36, Previdenza 1024 1,74 → 1,75,
  Allocazione 1024 `tilesFullyAboveFold` 2 → 1 — tre corse identiche sulla macchina di riferimento (census in 2,0 min), un giorno dopo
  il `--tighten`; Patrimonio 1024 e Budget 768 erano 1,58 e 1,36 fino al ritiro di MOB-06 e il `--tighten` di MOB-07 le aveva strette
  senza dichiararle qui. Nello stesso giro Budget 390 1,81, Storico 390 1,86, Impostazioni 768 1,36 e 1024 1,69 leggono 0,02 SOTTO il
  budget stretto il giorno prima (verdi, non strette): la differenza fra le due macchine della decisione 89 è una deriva di ±0,01–0,02
  per cella, in entrambi i versi, anche sulla stessa macchina da un giorno all'altro (doc/guide/prima-schermata.md § Per-page blind
  spots). Nel ritiro ogni `raisedBy` che il `--tighten` di MOB-07 aveva SOVRASCRITTO torna concatenato alla ragione precedente — dodici
  voci: Panoramica, Budget e Storico 390 riprendono la riga chiusa sotto la pill delle decisioni 65, 71 e 84; Allocazione 390 e
  Previdenza 768 la deriva di MOB-03; Calcolatore, Coast e What If 390, Divisione 1024 e Impostazioni 768/1024 la pill di MOB-02; Monte
  Carlo 390 l'oscillazione del 2026-10-12 — come MOB-06 fece su Tracciamento 390: un `raisedBy` tiene ogni ragione che la voce ha portato.
- **`MOB-07 (ritiro, 2026-10-16, decisione 99): …`** (proprietario: «Allarga con raisedBy»): Allocazione 768 e 1024 `figuresAboveFold`
  17 → 18 e `figuresOutsideVerdict` 16 → 17 — la cella «Fuori posizione» stampa lo 0,0% che la lettura stampa (sul fixture la casa e il
  conto stanno in classi senza target) e dal tablet il KPI resta intero accanto alla striscia; a 390 il KPI è sollevato e nulla si
  muove. Rimisurata sul codice del ritiro: le altre 55 misure identiche alla corsa sulla build mergiata; Monte Carlo 390 `screens` 1,83
  in tre corse sulla stessa build (la metrica che oscillava fra 4,87 e 4,89 prima della composizione non oscilla più).
- **`MOB-07: …`** (2026-10-15, decisioni 90 e 91, proprietario in sessione: «Allarga tutte e sei», «registra il misurato»): la
  prima riga chiusa sotto la pill a 390 su Allocazione (Per classe; Bilanciamento non ha una curva da cedere, decisione 19),
  What If (Prima e dopo; Evento è un modulo) e, con la curva già a 120 px, Previdenza (Rendimento), Calcolatore (Base),
  Coast (Afflussi) e Monte Carlo (Distribuzione) — decisione 19 estesa alle sei, come la 65, la 71, la 77 e la 84. Le cifre
  fuori dal verdetto a 390: Allocazione 16 (le due celle, i KPI e le dieci della legenda corrente → target, intera — decisione
  15), Previdenza 9 (le tre celle, l'eroe e le chip), Calcolatore 10 (le due celle, il numero FIRE, il chip e la didascalia),
  Coast 12 (lo stesso più le etichette del grafico; `figuresAboveFold` 16 → 17 a 390, 20 → 22 a 768, 16 → 17 a 1024), Monte
  Carlo 2 (le celle), Obiettivi 9 (le righe della tessera aperta, senza striscia — decisione 47; `screens` 1 → 1,32 e
  `figuresAboveFold` 0 → 9 a ogni larghezza: il fixture ha ora un obiettivo, decisione 60); «≤ 5» non raggiunto su
  Allocazione, Previdenza, Calcolatore, Coast e Obiettivi, dichiarato come Hall of Fame, Budget e Storico. A 768 Previdenza
  passa da 3 a 1 tessere sopra la piega: la striscia di tre celle. `screens` a 390: 1,59 · 1,96 · 1,81 · 1,8 · 1,73 · 1,83
  contro gli obiettivi PER SUPERFICIE della spec (Allocazione ≤ 1,8, Previdenza ≤ 1,9, Calcolatore ≤ 1,9, Coast ≤ 1,8, What If ≤ 2,2,
  Monte Carlo ≤ 1,8, Obiettivi ≤ 1,8): Previdenza 1,96 e Monte Carlo 1,83 superano il loro e restano registrate come misurate — la spec
  chiedeva che il commit le nominasse e non lo fece; dichiarate nel ritiro del 2026-10-16 (il «≤ 2,5» scritto qui il 2026-10-15 era
  l'obiettivo di MOB-06).
- **`MOB-07: la macchina di riferimento è cambiata…`** (2026-10-15, decisione 89, proprietario): cinque celle `screens` di superfici
  che la spec non tocca — Panoramica 390 1,66 → 1,74, Budget 390 1,81 → 1,83, Storico 390 1,86 → 1,88, Divisione 1024 1,47
  → 1,5, Impostazioni 768 1,36 → 1,38 e 1024 1,69 → 1,71 — rosse sulla build di develop PRIMA di ogni modifica della sessione:
  il budget era stato stretto il mattino stesso sull'altra macchina (ritiro di MOB-06), e quella di riferimento misura qualche
  centesimo in più.
- **Strette nello stesso commit, senza un `raisedBy` nuovo** (2026-10-15, `--tighten` di MOB-07): le schermate delle sette
  superfici (Allocazione 3,57 → 1,59, Previdenza 3,85 → 1,96, Calcolatore 3,13 → 1,81, Coast 2,25 → 1,8, What If 4,06 → 1,73,
  Monte Carlo 4,89 → 1,83 a 390) e le cifre dove sono scese (What If 20 → 15 a 390, Monte Carlo 6 → 5); a 768 Allocazione,
  Calcolatore, Coast e Obiettivi registrano la riga chiusa sopra la pill (`true`), Allocazione e Obiettivi anche a 1024;
  Panoramica 768 `tilesAboveFold` 6 → 7 e Budget 768 `riga` `true` sono il misurato della macchina di riferimento.
- **`MOB-06: deriva del giorno del mese, non del codice…`** (2026-10-15, ritiro di MOB-06, decisione 87, proprietario): Tracciamento a
  390 (`screens` 1,67 → 1,69, `figuresAboveFold` 12 → 13, `figuresOutsideVerdict` 5 → 7), 768 e 1024 (`figuresAboveFold` 16 → 18 e
  14 → 16). La misura di chiusura del ritiro, il 15 del mese, era rossa lì sola, con valori identici sulla build di develop prima
  di MOB-06 (4dc553c2, due corse): il confronto «sui primi N giorni» del mese scorso prendeva le righe del seed ai giorni 5, 10,
  15 e 20 una alla volta, e dal 15 lo stipendio porta sulla prima schermata le due frecce del trio (la seconda ristampa il ritmo
  del primo enunciato). Il seed mette ora ogni mese passato al 5 (`PAST_DAY`, `scripts/seedCensusE2E.mts`): rimisurato sul codice
  del ritiro, solo queste cinque metriche si muovono, e sono i valori di ogni giorno dal 5 al penultimo. A 390 la voce tiene nello
  stesso `raisedBy` la riga chiusa sotto la pill di MOB-04 e la pill di MOB-02. L'obiettivo «≤ 5» di Tracciamento non è più
  raggiunto (7: le due frecce si aggiungono a cinque cifre), dichiarato come Budget e Divisione.
- **`MOB-06: …`** (2026-10-14, decisione 84, proprietario in sessione: «Allarga tutte e cinque»): la prima riga chiusa sotto la pill a 390 su
  Patrimonio (Movimenti finisce a 976 contro 767: verdetto 243 con la cella G/P su una riga sua — «+9183,42 €» supera i 9
  caratteri —, LA tessera 494 con la curva già a 120 px), Analisi (Fuori scala a 1031: verdetto 392 con l'asse 2×2, lo scope e
  «Il perché», il Periodo 392 con le barre a 120 px) e Storico (Composizione a 994: verdetto 260, Evoluzione 495 con la curva a
  120 px e la lettura intera) — decisione 19 estesa alle tre pagine, come la 65, la 71 e la 77; e a 1024 `tilesFullyAboveFold`
  1 → 0 su Patrimonio e Analisi (la composizione vale fino a 1439: striscia e «Il perché» spingono LA tessera oltre la piega;
  1024 è di MOB-08). Le cifre fuori dal verdetto a 390: Patrimonio 4 (le due celle, l'eroe, l'etichetta sinistra della curva:
  Liquidità resta, decisione 40), Analisi 5 dopo la decisione 83 (era 6: la freccia delle spese ristampava il primo
  enunciato), Storico 7 (le due celle, l'eroe, la percentuale dei dodici mesi e le tre cifre della lettura di Evoluzione,
  che resta intera — decisione 15; «≤ 5» non raggiunto, dichiarato). `screens` a 390: 1,67 · 1,86 · 1,86 contro l'obiettivo
  di ≤ 2,5 della spec (il suo testo è in `git log -- doc/mobile/`). Hall of Fame rimisurata, invariata.
- **Strette nello stesso commit, senza un `raisedBy` nuovo** (2026-10-14, `--tighten` di MOB-06): ogni altra metrica delle tre
  pagine (le schermate soprattutto: Patrimonio 3,25 → 1,67, Analisi 3,68 → 1,86, Storico 4,71 → 1,86 a 390); a 768 Analisi e
  Storico registrano la riga chiusa sopra la pill (`true`); nient'altro si muove fuori dalle tre pagine.
- **`MOB-05: la prima riga chiusa (Benchmark) finisce a 891 contro la pill a 767…`** (2026-10-14, decisione 77, proprietario in
  sessione): Rendimenti a 390, `firstClosedRowAbovePill` `false` — il verdetto è alto 267 (titolo, l'asse a 44 px con l'icona del
  calendario, la striscia di due celle, la riga «Base: …» su due righe, «Il perché»), LA tessera 377 con la curva già a 120 px
  (decisione 4) e la lettura intera, «Il resto» 44; neanche senza curva la riga starebbe sopra. A 768 la riga sta sopra la pill
  (`true`); a 1024 misura `false` e 7 cifre fuori dal verdetto, informative fino a MOB-08 (il budget tiene 6 e `null`, come la
  Panoramica). Le 5 cifre fuori dal verdetto a 390 sono la cella in «%» (quella in punti non conta, decisione 7), le tre della
  lettura di «Crescita di 100» e il chip sull'altra base («annualizzato», che il fixture ha: la finestra YTD supera i 6 mesi;
  corretto nel ritiro del 2026-10-14, prima diceva «le due celle»): l'obiettivo
  «≤ 5» è raggiunto; `screens` 1,76 contro il ≤ 2,0 della spec.
- **`MOB-05: deriva del giorno del mese, non del codice…`** (2026-10-14, decisione 77, proprietario): cinque metriche di Patrimonio
  (390 `screens` 3,23 → 3,25; 768 `figuresAboveFold` 25 → 26; 1024 `screens` 2,64 → 2,67, `figuresAboveFold` 18 → 19,
  `tilesAboveFold` 3 → 1) — la build di develop (83de3f68) misurata lo stesso giorno, PRIMA del codice di MOB-05, dava esattamente
  questi valori, e la corsa dopo li ha ripetuti: le sole righe cambiate fra le due corse sono le tre di Rendimenti.
- **Strette nello stesso commit, senza un `raisedBy` nuovo** (2026-10-14, `--tighten` di MOB-05): Patrimonio 390
  `figuresAboveFold` 18 → 16 (la deriva del giorno nell'altro verso, registrata com'è misurata); nient'altro si muove fuori
  da Rendimenti e dalle cinque voci di Patrimonio sopra.
- **`MOB-04: …`** (2026-10-12, proprietario in sessione: «Allarga tutte e quattro con raisedBy»; le righe con la decisione 19;
  ogni voce porta anche «la pill a 44 px da MOB-02», perché `raisedBy` sta sulla voce superficie × viewport). Le cinque tab di
  Cashflow a 390 registrano `firstClosedRowAbovePill: false`: LA tessera è alta 378–495 px e parte a 340–478, quindi la
  prima riga chiusa inizia a 787 (Dividendi), 940 (Centri), 967 (Budget), 990 (Tracciamento) e 1015 (Divisione) contro la
  pill a 767 — Tracciamento con il grafico già a 120 px e il trio sollevato, Budget con i KPI sollevati e lo storico a barre
  che non ha una curva da accorciare. Quattro allargamenti nuovi: **Budget 390** `tilesFullyAboveFold` 1 → 0 (il Tetto parte a
  404, alto 495, finisce a 899); **Budget 1024** `figuresAboveFold` 15 → 17 (la striscia di due celle si disegna fino a 1439 e
  da 768 i KPI tornano interi); **Divisione 390** `figuresOutsideVerdict` 5 → 7 (le due celle, una per persona, più le cinque
  cifre di In comune: eroe, le due righe del pool, le due categorie — l'obiettivo «≤ 5» non è raggiunto e dichiarato, come
  Hall of Fame e Panoramica); **Dividendi 1024** `tilesAboveFold` 3 → 1 (sotto Incasso netto, 295 → 673, le righe chiuse partono
  a 742 su 768). Il resto delle cinque tab è una stretta: `screens` a 390 da 3,16/2,67/2,03/2,01/3,03 a 1,67/1,81/1,55/1,62/1,61,
  a 768 e 1024 in proporzione; Centri e Dividendi a 768 registrano la riga chiusa sopra la pill (`true`); le cifre sopra la
  piega scendono ovunque salvo Budget 1024 (sopra) — la tabella è riscritta intera dal `budget.json` del 2026-10-12.
- **Strette nello stesso commit, senza un `raisedBy` nuovo** (2026-10-12, `--tighten` di MOB-04): Monte Carlo 390 `screens`
  4,89 → 4,87 (letta come deriva del giorno); nient'altro si muove fuori da Cashflow.
- **`MOB-04: screens oscilla fra 4,87 e 4,89 a parità di codice…`** (2026-10-12, nel ritiro, proprietario): Monte Carlo 390
  `screens` riportato a 4,89 — la misura di chiusura del ritiro leggeva 4,89 tre volte sul codice corretto, e sulla build di
  develop (e450d00e, uno `stash`) due corse consecutive hanno letto 4,87 e poi 4,89: non il giorno né il codice, la metrica
  oscilla fra due valori (~17 px, una riga che va a capo o no) sulla stessa pagina; MOB-07, che compone Monte Carlo, l'ha rimisurata
  il 2026-10-15 (1,83) e il suo ritiro del 2026-10-16 l'ha letta 1,83 in tre corse sulla stessa build: composta, non oscilla più
  (doc/guide/prima-schermata.md § Per-page blind spots tiene la lezione del 2026-10-12).

- **`MOB-02: pill a 44 px`** (2026-10-10, decisione 22): `screens` di ogni superficie a tab, alle tre viewport — le cinque di
  Cashflow, Calcolatore, Coast, What If e Monte Carlo di FIRE, Impostazioni (30 voci; Obiettivi, una schermata, non si
  muove): +0,01/0,02 schermate ciascuna — salvo Divisione 1024, che la stessa corsa ha stretto (1,62 → 1,61) e che porta
  comunque l'etichetta, perché `raisedBy` sta sulla voce superficie × viewport e non sulla metrica (ritiro di MOB-02) —,
  la pill da ~40 a 52 px. I valori sono il misurato esatto.
- **`MOB-02: la striscia (3 cifre) e il podio a cinque righe sopra la pill, la prima riga chiusa sotto la pill con il grafico
  già a 120 px (decisioni 16, 19, 25)`** (2026-10-10): Hall of Fame a 390 (`figuresAboveFold` 17 → 19,
  `figuresOutsideVerdict` 12 → 15, `firstClosedRowAbovePill` `false`) e a 1024 (`figuresOutsideVerdict` 12 → 15,
  `firstClosedRowAbovePill` `false`). Il perché, misurato sul fixture a 390: la pill inizia a 767 px; il verdetto (titolo,
  prima frase, 3 celle, «Il perché») è alto 214 e LA tessera, aperta con il grafico a 120 px e il podio a cinque righe
  (decisione 25), 553 — la prima riga chiusa inizia a 943, e anche senza grafico (−170 px) resterebbe sotto; le 15 cifre
  fuori dal verdetto sono le 3 celle, le 2 della lettura e le 10 del podio, che la decisione 15 lascia intere. A 768 la riga
  chiusa sta sopra la pill (`true`, registrato da `--tighten`). L'obiettivo «≤ 5 a 390» resta non raggiunto per questa
  pagina, e dichiarato: MOB-06 ne fa il censimento, MOB-09 scrive la regola.
- **`MOB-03: la prima riga chiusa (Sintesi) finisce a 879 contro la pill a 767…`** (2026-10-11, decisione 65): Panoramica a 390,
  `firstClosedRowAbovePill` `false` — la striscia prende due righe (103 px: «+3000,00 €» è una cella larga, decisione 28, come
  ogni variazione a quattro cifre) e LA tessera (442 px: eroe 66, la riga «Andamento» con la pill a 44 px 74, la curva già a
  120, le etichette 15, il conteggio 48) chiude a 757; «Il resto» 44, Sintesi 825 → 879. A 768 la riga sta sopra la pill
  (`true`). Le 5 cifre fuori dal verdetto a 390 sono le 3 celle, l'eroe e l'etichetta sinistra della curva: l'obiettivo «≤ 5»
  è raggiunto; `screens` 1,66 contro l'1,6 di MOB-03 § 2 (la striscia su due righe, non stimata dalla spec).
- **`MOB-03: la curva di PatrimonioTile a 120 px sotto desktop…`** (2026-10-11): Patrimonio `figuresAboveFold` 12 → 18 a 390 e
  22 → 25 a 768 — la curva più corta porta sopra la piega le etichette, il digest e il conteggio; `screens` scende (3,34 →
  3,23 · 2,1 → 2,04 · 2,73 → 2,64). È il cambio che MOB-06 usa con gli stessi nomi.
- **`MOB-03: deriva del giorno del mese, non del codice…`** (2026-10-11): sei voci (sette metriche) di Storico (390 `figuresAboveFold` 15 → 16,
  768 28 → 29), Allocazione (390 25 → 26 e cifre fuori 17 → 18, 1024 27 → 28) e Previdenza (768 24 → 26, 1024 `screens` 3,36
  → 3,37) — il codice di develop (1629613) misurato lo stesso giorno (uno `stash`, una build, il census sulle quattro
  superfici) dà esattamente questi valori, e anche Patrimonio a 390 dava 14 prima della curva: il fixture non è invariante al
  giorno come la decisione 10 assume (doc/guide/prima-schermata.md § Per-page blind spots; l'erede è MOB-08 § 2, scritto nel
  ritiro di MOB-03 il 2026-10-11).
- **Strette nello stesso commit, senza un `raisedBy` nuovo** (2026-10-11, `--tighten` di MOB-03): `screens` di una ventina di
  celle di altre superfici scende di 0,01–0,11 (Budget 390 2,73 → 2,67, Storico 390 4,82 → 4,71, Allocazione 390 3,63 →
  3,57, …) — la deriva del giorno nell'altro verso, registrata com'è misurata; nessuna cifra fuori dal verdetto si muove
  salvo quelle con `raisedBy` sopra.
- **Strette nello stesso commit, senza un `raisedBy` nuovo** (2026-10-10, `--tighten`; Divisione 1024 è una voce a tab e tiene quello della pill): dieci celle di altre superfici scendono
  di uno o due punti (Allocazione 390 `screens` 3,65 → 3,63, Divisione 390 cifre fuori 6 → 5, Coast 390 11 → 10,
  Tracciamento 768 cifre 24 → 23, Calcolatore 768 25 → 23, Divisione 1024 1,62 → 1,61 e 23 → 22, Dividendi 1024 5 → 4,
  What If 1024 10 → 8) perché l'unità di una cifra è ora uno span proprio in `NarrativeSegments` (una cella di
  monospazio in meno per cifra: qualche frase in una riga in meno). Il contatore del census riconosce la coppia
  cifra+unità solo in quello span (`[data-figure-unit]`): senza quel vincolo contava anche i KPI che stampano valore e
  unità divisi, che la baseline non ha mai contato — 25 cifre invece di 20 su Analisi a 768 con le tessere ferme
  (doc/guide/prima-schermata.md).

### Le tessere a 390 delle tre pagine dei mock (top e altezza in px da inizio `main`)

| Panoramica (navbar 66, verdetto 315) | top | h | cifre |
|---|---|---|---|
| Patrimonio totale lordo | 432 | 709 | 14 |
| Cashflow · mese | 1153 | 286 | 10 |
| Sintesi patrimoniale | 1451 | 294 | 11 |
| Composizione | 1757 | 403 | 16 |
| Costi | 2172 | 322 | 12 |
| Spese per categoria | 2506 | 387 | 15 |
| Entrate per categoria | 2905 | 348 | 12 |
| Asset principali | 3265 | 288 | 13 |

| Cashflow › Tracciamento (navbar 66, verdetto 148) | top | h | cifre |
|---|---|---|---|
| Cashflow · periodo | 373 | 521 | 9 |
| Spese per categoria | 906 | 354 | 15 |
| Entrate per categoria | 1273 | 316 | 12 |
| Risparmio nel tempo | 1600 | 293 | 3 |
| Movimenti | 1906 | 1587 | 24 |

| Rendimenti (navbar 74, verdetto 153) | top | h | cifre |
|---|---|---|---|
| Rendimento (TWR) | 478 | 585 | 5 |
| Rischio | 1075 | 337 | 3 |
| Consistenza | 1425 | 281 | 15 |
| Benchmark | 1718 | 408 | 9 |
| Contributi | 2137 | 469 | 11 |
| Da dove viene il rendimento | 2619 | 598 | 13 |
| Plusvalenze realizzate | 3228 | 135 | 1 |
| Capitale e mercato | 3375 | 331 | 3 |

## 4. Le tre direzioni disegnate e la scelta

Tre direzioni, tutte «composizione» (stesse tessere, token e narrative), disegnate come artboard (390×844 chiaro e
scuro, 768×1024, Cashflow › Tracciamento, Rendimenti, lo stato dopo l'interazione firma) su cifre INVENTATE — la
Panoramica sul profilo d'esempio della landing (`lib/utils/landingSampleData.ts`), le altre su cifre tonde coerenti —
mai su quelle del mirror. Ognuna costruita da un agente, messa alla prova da un revisore avversario (15 · 13 · 14
difetti, quasi tutti corretti) e confrontata. Il canvas (privato del proprietario):
https://claude.ai/artifact/JQcXUcUt55HeiUUeP2EMNh.

| | A · Prima schermata | B · Il diario dei verdetti | C · Schede a scorrimento |
|---|---|---|---|
| Tesi | verdetto breve · striscia di ≤4 cifre · LA tessera aperta · il resto in righe chiuse con il loro eyebrow | la Panoramica mobile è il feed dei verdetti delle 12 pagine; le pagine sono 1–2 tessere + «Il resto · N» | verdetto e indice fermi, una tessera per schermata, swipe |
| Cifre fuori dal verdetto (Panoramica / Tracciamento / Rendimenti) | 5 / 5 / 5 | 3 / 5 / 3 | 5 / 7 / 4 |
| Shell | invariata | la Panoramica cambia natura | il 28% dello schermo fisso |
| Costo | `PageVerdict`, `Tile`, `PageHeader`, `PageTabBar` | + `DiaryRow`, un endpoint aggregato (contro le spec PERF), una regola «una cifra per pagina» | + un `TilePager` con cinque regole proprie |
| Rischio principale | 16–36 px sopra la pill; le clausole del verdetto dietro un tap | una cifra per pagina può smentire la pagina | screen reader: 1 tessera su 8; swipe dal bordo su iOS |

**Scelta (proprietario, 2026-09-26): A come base su tutte le pagine.** Da C si prendono due cose che servono comunque:
l'eyebrow in `--destructive` su una riga chiusa in lettura fallita, e Plusvalenze realizzate che oggi SPARISCE in
silenzio se il registro non si legge (deve diventare un `ErrorNotice`). Il diario (B) e il pager (C) non entrano.
Dove le tre convergevano — e che quindi si fa comunque: `PageTabBar` a 44 px; il titolo del verdetto sempre visibile e
mai tagliato; la base di Rendimenti fuori da ogni disclosure; una lettura fallita visibile anche chiusa; Movimenti
intera; molla 400/35 e nessuna animazione con reduced motion; a 1024 la barra in alto al posto della pill.

Le quattro regole nominate che la composizione introduce (testo definitivo in MOB-09, per mano del proprietario):
**The First-Screen Rule** (verdetto breve, striscia ≤4 cifre lette dai riassunti delle tessere, UNA tessera aperta, il
resto righe chiuse), **The Lifted-Figure Rule** (una cifra sollevata nella striscia non è ristampata dalla tessera sul
telefono), **The Closed-Row Rule** (una riga chiusa è ancora la tessera: eyebrow `<h3>`, aside in parole, pannello
presente e vuoto, contenuto montato all'apertura; una lettura fallita non si chiude da sola), **The Binding-Clause
Rule** (una clausola che cambia il senso di una cifra stampata non sta mai dietro un tap).

## 5. Ordine consigliato e dipendenze

Gli archi (A → B = «B dipende da A»), gli stessi dell'intestazione di ogni spec; tutte le MOB dopo TUTTE le PERF:

| Da | A |
|---|---|
| PERF-01 | MOB-01 |
| PERF-00 | MOB-01, MOB-07 |
| MOB-01 | 02, 03, 04, 05, 06, 07, 08 |
| MOB-02 | 03, 04, 05, 06, 07, 08 |
| MOB-03, 04, 05, 06, 07 | 08, 09 |
| MOB-08 | 09 |

I contributi esterni del 2026-09-27 (#400, #401, #403) sono già in `develop`, e la nuova Esposizione (PERF-00, #407) è entrata il 2026-09-28,
prima di PERF-01: MOB-01 misura un'app che li contiene, e MOB-06 e MOB-07 compongono il Flusso e l'Esposizione come sono
DOPO quei contributi.

MOB-01 va prima di tutto, come PERF-01: le altre si chiudono con i suoi numeri. MOB-02 è il CONTRATTO che sette spec
citano alla lettera (la tabella delle API in § 4.1); le due decisioni di fondazione che poneva — l'ordine del DOM e la
posizione dell'asse — sono decise in § 9 (1, 2, 11, 12). **Le spec si implementano UNA PER VOLTA, nell'ordine dei
numeri, 01 → 09, mai due insieme** (proprietario, 2026-10-10, decisione 9): ogni spec parte dal diff di quella prima,
e un modulo condiviso appartiene alla spec con il numero più basso che lo tocca — chi viene dopo lo usa con quei nomi.
MOB-08 (tablet) vuole le pagine composte; MOB-09 chiude la serie: finché manca, DESIGN.md dice il contrario del codice.

| Modulo condiviso | Proprietaria | Chi lo usa dopo |
|---|---|---|
| `doc/mobile/budget.json`, `scripts/mobileCensus.mjs`, `lib/utils/mobileBudget.ts`, il fixture `census@example.com` (`scripts/seedCensusE2E.mts`) | MOB-01 | tutte |
| `PageVerdict` (`strip`, `scope`, `axis`, `restCollapse`), `Tile` (`collapse`, `asideWhenClosed`, `LIFTED_FIGURE_CLASS`, `TileRowShell`, `TILE_ROW_CELL_CLASS`, `TILE_SURFACE_CLASS`), `ErrorNotice` (`collapse`, `live`), `VerdictStrip`, `PageRest`, `verdictStrip.ts`, `mobileSections.ts`, `narrative.ts` (`binding`, `leadLength`, `restLabel`, `splitVerdict`), `describeFailedSections`, i due hook (`sections.eyebrows` dal ritiro), `--ease-spring`, `PageTabBar` | MOB-02 (ritirata il 2026-10-10: i nomi vivono nel codice) | MOB-03..08 |
| `PatrimonioTile` (`liftedFigures`, `id`, `isPatrimonioLiftedBlock`, `PATRIMONIO_CURVE_ID_SUFFIX`, curva a 120 px), `ComposizioneTile` di overview (`collapse`, `asideWhenClosed`), `salesNarrative.ts` (`binding`; lo zero senza segno dal ritiro), `describeScheduledCaption` e `describeScheduledNetCaption`, `OverviewVerdict.OVERVIEW_VERDICT_ID`, `verdictNamesMarket` e `OVERVIEW_SECTION_IDS` (`lib/utils/overviewSummary.ts`) | MOB-03 (ritirata il 2026-10-11: i nomi vivono nel codice) | MOB-06 (Patrimonio), la landing |
| `scheduledSentence` come `scope` (`describeTrackingScope`, `describeSplitScope`; il pezzo condiviso che Analisi riusa è `scheduledScope(scheduled, horizon)`, `lib/utils/cashflowNarrative.ts`), `CashflowKpiTrio.lifted` e `CashflowPeriodoTile.liftedFigures` (`isCashflowPeriodoLiftedBlock`), `TettoTile.liftedFigures` (`isTettoLiftedBlock`; il KPI `@container` è una guardia per una tessera stretta, MOB-08 a 1024), `FlowBarsChart` a 120 px, `ExpenseDialog.onSuccess(saved)` e `returnFocusTo`, `expenseService.createExpenseSettledOnDate().parents`, `TransactionFeed.focusRowId`/`focusRowRef`, `CompactExpenseRow.buttonRef`, `PageVerdict.pending` e `VerdictSkeleton.axis` (decisione 69; con essi gli export `VerdictSkeletonHeadline`/`VerdictSkeletonLines` e il gap della skeleton 2,5 → 2 su ogni pagina), gli id e le strisce per tab (`TRACKING_SECTION_IDS`/`selectTracciamentoStrip`, `BUDGET_SECTION_IDS`/`selectBudgetStrip`/`describeBudgetClosedAsides`, `COST_CENTER_SECTION_IDS`, `SPLIT_SECTION_IDS`/`splitMemberSectionId`/`selectSplitStrip`/`formatBookedResidual`/`residualTone`, `DIVIDEND_SECTION_IDS` e le aside chiuse), la prop `active` delle cinque tab, `components/cashflow/CashflowTabSkeletons.tsx` (`e2e/bundle.lazy.mobile.spec.ts` e `e2e/lazyTabLanding.ts` solo rilanciate); dal ritiro `formatEuroMinus`/`withTypographicMinus`/`isPrintedZero` in `lib/utils/formatters.ts`, `growFeedWindow`/`FEED_PAGE_SIZE`, `isAddExpenseFabShown` — in develop dal 2026-10-12 | MOB-04 (ritirata il 2026-10-12: i nomi vivono nel codice) | MOB-06 (Analisi), MOB-08 |
| `playwright.config.ts`: il progetto `degraded-mobile` e `/degraded\./` nel `testIgnore` di `mobile`; `selectPerformanceStrip`, `PERFORMANCE_SECTION_IDS`, `resolveRealizedGainsState` (`lib/utils/performanceSummary.ts`), `PERFORMANCE_CLOSED_ASIDES` e `shortBenchmarkName` esportata (`performanceNarrative.ts`), `RendimentoTile.liftedFigures` con `isRendimentoLiftedBlock`, `--growth-min-h` | MOB-05 (ritirata il 2026-10-14: i nomi vivono nel codice) | MOB-08 |
| `selectPatrimonioStrip`, `PATRIMONIO_SECTION_IDS`, `patrimonioMutuoSectionId`, `STRUMENTI_ANCHOR_ID`, `patrimonioRestLabel`, `patrimonioVerdictNamesMarket` (`lib/utils/patrimonio{Summary,Narrative}.ts`), il `RendimentoTile` di Patrimonio con `liftedFigures`/`isAssetRendimentoLiftedBlock`; `selectAnalisiStrip(totals, { notStarted })`, `ANALISI_SECTION_IDS`, `describeAnalisiScope`, `collectPrintedFigures`, `formatFlowAmount`, `ANALISI_CLOSED_ASIDES`, `analisi/tiles/PeriodoTile.liftedFigures` (`isPeriodoLiftedBlock`), `FlussoTile.liftedFigures` (`isFlussoLiftedBlock`) e `printedFigures`; `selectStoricoStrip`, `STORICO_SECTION_IDS`, `formatDriverEuro`, `EvoluzioneTile.liftedFigures` (`isEvoluzioneLiftedBlock`); `formatSignedEuro` in `lib/utils/formatters.ts`; le prop additive su moduli altrui: `CashflowKpiTrio.expensesDeltaLifted` (MOB-04), `PageRest.buttonId` e l'export `COMPACT_QUERY` di `useCompactLayout` (MOB-02); il seed del fixture con ogni mese passato al giorno 5 (`PAST_DAY`, dal ritiro) | MOB-06 (ritirata il 2026-10-15: i nomi vivono nel codice) | MOB-08 |
| `usePortfolioExposure(ownerId, assets, options)` e `useInstrumentProfilesState` (`lib/hooks/usePortfolioExposure.ts`), `EsposizioneTile.enabled`; `selectAllocazioneStrip`, `ALLOCAZIONE_SECTION_IDS`, `BILANCIAMENTO_MISALLOCATION_BLOCK`, `MISALLOCATION_FLOOR_PCT` e, dal ritiro, `isNothingOutOfPosition` e `resolveAllocazioneSections` (`lib/utils/allocazioneSummary.ts`), `ALLOCAZIONE_CLOSED_ASIDES` (`allocazioneNarrative.ts`), `BilanciamentoTile.liftedFigures`/`isBilanciamentoLiftedBlock`; `selectPensionStrip`, `hasPensionStrip`, `PENSION_SECTION_IDS` e, dal ritiro, `resolvePensionSections` (`pensionSummary.ts`), `PENSION_CLOSED_ASIDES`, `describeRendimentoAside`, `describeVersamentiAside`, `buildPensionLoadErrorVerdict` (`pensionNarrative.ts`); `selectFireStrip`, `FIRE_SECTION_IDS` (`fireSummary.ts`), `describeFireLockScope`, `isLockStated`, `cutAtFirstSentence`, `fireRestLabel`, `FIRE_CLOSED_ASIDES`, `FIRE_ROW_NOT_COMPUTABLE` (`fireNarrative.ts`), `components/fire-simulations/FireLockScope.tsx`; `selectCoastStrip`, `COAST_SECTION_IDS`, `COAST_CLOSED_ASIDES` (`coastFireView.ts`); `selectWhatIfStrip`, `isWhatIfChange`, `WHAT_IF_SECTION_IDS` (`whatIfSummary.ts`), `WHAT_IF_CLOSED_ASIDES` (`whatIfNarrative.ts`); `selectMonteCarloStrip`, `MONTE_CARLO_SECTION_IDS` (`monteCarloSummary.ts`), `MONTE_CARLO_CLOSED_ASIDES`, `describeParametriClosedAside` (`monteCarloNarrative.ts`); `GOALS_SECTION_IDS` (`goalsSummary.ts`), `GOALS_CLOSED_ASIDES`, `describeAssegnazioniAside` (`goalsNarrative.ts`); il `tab` di `useMobileSections`; il fixture del census con Obiettivi acceso | MOB-07 (ritirata il 2026-10-16: i nomi vivono nel codice) | MOB-08 |
| `playwright.config.ts`: i progetti `tablet` e `tablet-landscape`; `lib/utils/tabletComposition.ts`; la barra di `app/dashboard/layout.tsx` | MOB-08 | MOB-09 |
| DESIGN.md, `.impeccable/design.json`, `## Composizione mobile` uniformata nelle guide, README.md utente, PRODUCT.md | MOB-09 | — |

Ogni spec riscrive anche le stesse righe (CLAUDE.md «Latest» e § Current Status, § 6 e § 3.1 di questo indice,
`Draft Release Temp.md`, `doc/guide/e2e-emulatori.md`): in sequenza non c'è conflitto, e ognuna le riscrive nello stato
finale della serie fino a lei.

**Cosa è cambiato dopo le spec (2026-10-10, fuori dossier, in develop)** — chi apre MOB-04 e MOB-06 riverifica contro il codice:
Patrimonio ha un tipo di asset in più, il **prestito** (`loan`, valore negativo, `doc/guide/patrimonio.md`): la tessera
«Mutuo» è ora UNA PER PRESTITO (eyebrow «Mutuo» o «Prestito», la riga `patrimonio-mutuo-<loanId>` di `patrimonioMutuoSectionId`, doc/guide/patrimonio.md § Composizione mobile), un prestito personale
è una riga «debito» della Liquidità, il conteggio dell'hero dice «18 strumenti, 4 conti e 1 prestito»
(`formatHoldingCounts(held, accounts, loans)`), e la prima apertura migra da sola il debito dell'immobile. Il form
spesa (MOB-04 § 4) ha il campo «Commissione» su OGNI riga e su ogni voce di una serie, la spunta «Estinzione
anticipata» su una rata «Debiti», e un trasferimento può atterrare su un immobile («Destinazione» raggruppata Conti /
Immobili); le righe citate di `ExpenseDialog.tsx` sono quindi spostate. Il BTP Valore Insieme (cedola unica a
scadenza) non tocca la composizione. Nessuna striscia e nessun budget cambia per questo: le cifre nuove sono dentro
le tessere che già c'erano. **Visto da MOB-01 (2026-10-10, fixture a 390)**: nella fila KPI di Tetto del mese
(`TettoTile`) a tetto superato «~11.274 €» e «840 €» si sovrappongono — una cella senza `min-w-0`/contenitore per un
importo largo; MOB-04, che ricompone il Budget, lo corregge e lo asserisce.

Un avvertimento del passaggio di coerenza, da tenere davanti: **il budget della prima schermata rischia di diventare
una lista di eccezioni** — le clausole vincolanti annullano il taglio del verdetto, le tessere eroe sono alte 585–709 px.
Per questo si misura sul fixture `census@example.com` (decisioni 6 e 10), con tolleranza zero (23), e le sole eccezioni
ammesse sono le voci con `raisedBy` (19, 22), elencate in § 3.1. Le domande comuni sono state risposte una volta (§ 9),
non spec per spec.

## 6. Stato

| Spec | Titolo | Priorità | Sforzo | Dipende da | Modello · effort | Stato |
|---|---|---|---|---|---|---|
| MOB-01 | Il censimento in repo e il budget della prima schermata | 1 | M | — (PERF-01 e PERF-00 in develop) | Opus 5.5 · high | **ritirata il 2026-10-10** — PR #448 in develop dal 2026-10-10; 30 divergenze su 156 criteri letti contro il codice (sei lettori e tre scettici, tutto Opus): tredici dove il codice aveva ragione e la lezione era già a casa (le sette correzioni nell'intestazione di `scripts/mobileCensus.mjs`, le metriche e il settle in doc/guide/prima-schermata.md, il fixture nell'intestazione del seed, `compareCensusToBudget` con il terzo argomento e `informational` nel suo JSDoc, i dati del seed modellati sui fixture `centri` e `split` e non copiati) → doc/guide/prima-schermata.md, WORKFLOW.md § 3, i commenti alle righe; **quattro difetti a runtime degli script corretti nel ritiro, su decisione del proprietario** (§ 9, 61: la guardia Yahoo era cieca — il census azzerava il `source` dopo il giro di riscaldamento, l'unica chiamata che può dire `yahoo`, e `--tighten` non lo guardava; `--surfaces=cashflow` misurava zero superfici in silenzio; `--tighten` su una corsa parziale scriveva `budget.json` prima di andare rosso; lo stato dell'interruttore 50/30/20 promesso per il mirror e mai scritto — `tightenRefusal(run, budget)`, `validateSelection`, `yahooCalled`, `spendingRoles`; test visti rossi in `__tests__/mobileBudget.test.ts` e `mobileCensusOptions.test.ts`), sette difetti di solo testo corretti (le tre intestazioni dei test senza la falsificazione vista rossa — rifatte nel ritiro: verso invertito 6 rossi, `\s?` tolto 4, `/dashboard/dividends` 3 e una voce tolta 1; `reference/mobile-census.mjs` che diceva «until then»; § 3 che rimandava a SESSION_NOTES; la decisione 10 «in qualunque giorno» contro la 59; MOB-06 «sopra la piega» per una metrica che conta sopra la pill; MOB-03 che partiva dal 4,41 del mirror; le righe di `ritiro.md` del 2026-10-10 già mosse dallo scorporo della guida), cinque rinvii scritti ora (Obiettivi spento nel fixture → § 9, 60 e MOB-07 § 5; la colonna «obiettivo» a 768/1024 e la decisione 51 riscritta sul fixture → MOB-08 § 2 e § 5; la fila KPI del Tetto che si sovrappone a 390 → MOB-04 § 4 e § 7; il perché del `.mjs` (`__name` di tsx) → l'intestazione del census; la riga «dev» del draft tolta da 279858f → la regola in WORKFLOW.md § Where things are recorded e MOB-09 § 4); fuori dai non-obiettivi e dichiarato: PR #448 tocca `e2e/motion.layout.spec.ts` (il tema colore allineato a `localStorage` prima di ogni load, visto rosso 4/5 senza; doc/guide/e2e-emulatori.md). Nessun giro guidato F (proprietario, 2026-10-10). La misura di chiusura resta e si è rifatta nel ritiro sul codice corretto: 19 × 3 sul fixture in 2,0 min, `mobile:budget` verde su 57 misure, `yahooCalled` falso, `--selftest` verde; il `--tighten` rifiutato con `yahooCalled` forzato e con una corsa di una superficie, `budget.json` intatto. `budget.json` e il fixture sono di § 5; la tabella § 3.1 non cambia |
| MOB-02 | Le primitive della composizione | 1 | L | MOB-01 | Fable 5.1 · xhigh | **ritirata il 2026-10-10** — PR #450 in develop dal 2026-10-10; 69 segnalazioni su 277 criteri letti contro il codice (sei lettori e tre scettici, tutto Opus), 9 confutate: trentasei dove il codice aveva ragione e la lezione era già a casa o portata ora (le API di § 4.1 coi loro nomi e le tre aggiunte `TileRowShell`/`TILE_ROW_CELL_CLASS`/`TILE_SURFACE_CLASS`, `plotClassName` al posto di `RecordBars.minHeight`; lo `scope` reso due volte; a 1440 nessun `restCollapse` e il `<p>` di oggi; la striscia `flex-wrap` con `basis-full` oltre 9 caratteri, non `grid`; la cache del hook `ReadonlyMap<string, CachedRow>` con chiave e default e il parse senza `useMemo` (il compiler lo tiene); `RecordBoardTile`/`NoteTile` che derivano `asideWhenClosed` dall'`aside` invece di inoltrarlo; l'unità delle cifre come span proprio su OGNI pagina, non solo nella striscia; gli export in più `splitFigureUnit`, `FIGURE_UNIT_CLASS`, `SplitVerdict`, `read/write/subscribeStoredSections`, `HOF_SECTION_IDS`; `narrative-text.tsx`, `mobileCensus.mjs`, quattro spec e2e, il README utente e prima-schermata.md toccati fuori da § 5/§ 10 → doc/guide/hall-of-fame.md § Composizione mobile, AGENTS.md § Motion e § Hierarchy, i commenti alle righe); **tre difetti a runtime corretti nel ritiro, su decisione del proprietario** (§ 9, 62–64: «Chiudi tutte» smontava il contenuto delle righe aperte al caricamento e mai toccate — `setAll(false)` ora le conta nella visita; `formatPoints` arrotondava a un decimale prima di `decimals`; una cella della striscia senza voce in `eyebrows` annunciava la propria etichetta — gli eyebrow vengono dal controller, `sections.eyebrows`; visti rossi in `e2e/mobile-composition.hof.mobile.spec.ts` e `__tests__/verdictStrip.test.ts`), due prove promesse in § 7 e mancanti aggiunte (la prima schermata misurata contro il top della pill; «Il perché» ricordato al reload, che pinna `restId` in `known`), una rinviata e ora scritta (lo `scope` visibile a 1440 → MOB-04 § 7, `cashflow.split.spec.ts`), dodici difetti di solo testo corretti (shell.md e impostazioni.md che davano la pill ancora sotto i 44 px; prima-schermata.md «fino a MOB-02»; hall-of-fame.md senza il 1024; velocita.md «cinque scenari»; AGENTS § Hierarchy con il selettore `[class*="order-"]` — che prende ogni `border-*` — e un elenco incompleto delle pagine con `order-*`; lo stesso selettore in MOB-03..07 § 7; la guardia `isXLiftedBlock` mancante in MOB-04, MOB-05, MOB-06 e MOB-07; il `revealRef` di MOB-06 motivato su una cattura che non c'è; `TILE_ROW_CELL_CLASS` mai nominata da MOB-08; il commento «three podium rows» di `RecordPatrimonioTile`; § 9 che diceva «nella striscia»; questa tabella e § 5 senza le aggiunte; CLAUDE.md «1003 → 922» per 1002 → 921), un punto lasciato e dichiarato (l'errore di tipo `id` + `collapse` sulla `Tile` è tenuto da `tsc` ai call site, nessun test lo pinna). Giro F fatto nella sessione di implementazione sul mirror (due difetti, corretti lì); nessuno nel ritiro. La misura di chiusura resta e si è rifatta nel ritiro sul codice corretto: 19 × 3 sul fixture in 2,0 min, `mobile:budget` verde su 57 misure senza una stretta né un allargamento (Hall of Fame 390 1,80 · 1/0 · 19/15 · riga `false`, 768 1,30 · 5/4 · 19/17 · `true`, 1024 1,65 · 1/0 · 17/15 · `false`: la tabella § 3.1 non cambia), `yahooCalled` falso; `perf:budget` verde su `.next-perf` (Hall of Fame 573,5 KB gz, nessun tetto alzato); tsc pulito, lint 0, Vitest 232/5135 in Europe/Rome e sotto `TZ=UTC`; Playwright **200/200** in 6,5 min (51 file; +1 prova in `mobile-composition.hof.mobile.spec.ts`, tre falsificazioni viste rosse una per volta) |
| MOB-03 | Panoramica | 2 | M | MOB-01, MOB-02 | Fable 5.1 · high | **ritirata il 2026-10-11** — PR #452 in develop dal 2026-10-11; 222 criteri letti contro il codice da un workflow in sola lettura (sei lettori e tre scettici, tutto Opus): 176 reggono, 108 segnalazioni confermate (37 distinte, molte doppie) e 5 confutate. **Un difetto a runtime corretto nel ritiro, su decisione del proprietario** (§ 9, 66: `signedCompactEuro` di `lib/utils/salesNarrative.ts` stampava «+0 € risparmiati» con segno e colore — lo zero senza segno della decisione 20 era arrivato solo a `signedCurrency`/`signedPercent`; ora `isPrintedZero` decide, e la parola «risparmiati»/«spesi oltre le entrate» segue il segno STAMPATO; visto rosso in `__tests__/salesNarrative.test.ts`; la classe, 60 siti `>= 0 ? '+'` nel repo: `patrimonioNarrative` è di MOB-06 per la 20, email, PDF, Analisi e le tessere fuori dalla serie non si toccano); due prove promesse da § 7 e mai scritte, aggiunte (la posizione di «Il resto della pagina» fra LA tessera e Sintesi in `e2e/overview.mobile.spec.ts`, vista rossa con `PageRest` spostato dopo Sintesi; il caso «senza Il perché» di `validateStrip` in `__tests__/overviewSummary.test.ts`, che era una riga copiata da quella sopra); tre falsificazioni Vitest promesse da § 7 e mai registrate (le asides con «giorno 11 di 31», `overviewRestLabel` senza «il patrimonio», lo zero con il ramo `isPrintedZero` tolto) rifatte nel ritiro, viste rosse e scritte nelle intestazioni: delle «15» dichiarate in sessione ne risultano 10 registrate più queste 3; la decisione presa in sessione portava il numero 29, già di MOB-04 → 65 in § 9, § 3.1, `budget.json`, doc/guide/panoramica.md e nella E2E; la tabella § 3.1 riscritta intera dal `budget.json` (una ventina di celle strette dal `--tighten` di sessione e mai riportate; Patrimonio 1024 3/1 per 1/0; Panoramica 1024 misurata 10 / riga `false` ma informativa: il budget tiene 7 / `null` fino a MOB-08, proprietario); «2,75 → 2,64» per 2,73 nei due `raisedBy` di Patrimonio e in § 3.1; «sette voci» di deriva per sei (sette metriche); il tetto della landing 511 → 521 mancava qui e in CLAUDE.md; la corsa Playwright di chiusura era quella di CLAUDE.md (211/211 in 9,5 min, dopo la 210 + pill a 43,99999 px); tre rinvii senza erede scritti ora (la deriva del giorno del fixture → MOB-08 § 2; il salto skeleton → righe chiuse → doc/guide/panoramica.md § Composizione mobile; il `SavingsRateBadge` che copre la pill a 390 → § Per-page blind spots, proprietario; `expenseStats: null` non distinguibile → punto cieco, nessuna spec lo programma); la curva a 120 px su Patrimonio e landing dichiarata nelle loro guide e nel draft; i «MOB-03 § x» di MOB-04, MOB-06 e MOB-08 ripuntati al codice, quattro righe citate mosse dal diff riscritte (MOB-06:23, MOB-08:12 e :61, MOB-09:19); `OverviewVerdict` «absent on the Assistente» corretto (l'Assistente rende `PageVerdict` direttamente); la cella `null` con la sua `reason` è una cella larga come un valore oltre 9 caratteri (`WIDE_CELL_CHARS`, dichiarato nel commento); gli export in più (`describeScheduledNetCaption`, `PATRIMONIO_CURVE_ID_SUFFIX`, `OVERVIEW_VERDICT_ID`, `verdictNamesMarket`, `OVERVIEW_SECTION_IDS`) in § 5. Nella sola spec, cancellata: § 2 mai riscritto dopo la decisione (`firstClosedRowAbovePill: true`, «≤ 1,6» contro 1,66), «-12%» ASCII, «rosso in (5)» per (6), le asides sotto `overviewNarrative.test.ts`, `describeOverviewAsides` sotto `overviewNarrative.ts`, `order-1/2` per `order-1…8`, `verdictNamesMarket` senza il caso «nessun driver», il focus «sul paragrafo» per il box `#panoramica-verdetto`, l'eyebrow `perche` assente, le righe citate del 2026-09-26. Giro F: lo smoke da script della sessione di implementazione; nessuno nel ritiro. La misura di chiusura resta e si è rifatta nel ritiro, prima e dopo il fix: 19 × 3 sul fixture in 2,5 min (l'altra macchina), `mobile:budget` verde su 57 senza una stretta né un allargamento (Panoramica 390 1,66 · 1/1 · 5/5 · riga `false`, 768 1,26 · 6/5 · 15/15 · `true`, 1024 1,6 · 1/0 · 10/10 · `false` informativa), `yahooCalled` falso; `perf:budget` verde su `.next-perf`, nessun tetto alzato; tsc pulito, lint 0, Vitest 233/5164 in Europe/Rome e sotto `TZ=UTC`; Playwright **211/211** in 9,5 min sul codice corretto (la suite intera su :3100; le due spec della Panoramica 12/12 di nuovo dopo la falsificazione di PageRest) |
| MOB-04 | Cashflow: le cinque tab | 2 | L | MOB-01, MOB-02, MOB-03 | Fable 5.1 · xhigh | **ritirata il 2026-10-12** — PR #454 in develop dal 2026-10-12; 205 criteri letti contro il codice da un workflow in sola lettura (sei lettori e tre scettici, tutto Opus): 117 reggono, 78 segnalazioni confermate (una trentina distinte, molte doppie) e 10 confutate. **Quattro difetti a runtime corretti nel ritiro, su decisione del proprietario** (§ 9, 72–75): lo zero stampato con segno nel trio e nel residuo di Divisione («−0 €» in rosso per −0,3 contro la cella «0 €»; la tessera colorava verde lo 0 esatto) — `withTypographicMinus`/`formatEuroMinus` in `lib/utils/formatters.ts`, `isPrintedZero` spostato lì e riesportato da `verdictStrip.ts`, `residualTone`, la stessa cura su `CashflowTile` e `RisparmioTile`; «Carica altri» dopo un «+» la cui riga sta oltre la prima pagina toglieva righe (51 → 40) — `growFeedWindow`; il FAB non gated in demo (preesistente: un salvataggio scriveva sull'account condiviso) — `isAddExpenseFabShown` e il gestore dell'evento; Centri in lettura fallita stampava «Nessun centro di costo.» sopra la notice (preesistente) — `PageVerdict.pending`; visti rossi in `__tests__/{formatters,expenseSplitSummary,expenseSplitNarrative,tracciamentoSummary,navUtils}.test.ts` (Centri senza prova nel browser: una lettura del client SDK non si fa fallire da una spec, dichiarato in centri-di-costo.md); la classe `< 0 ? '−'` (20 siti): le superfici della serie corrette, Rendimenti, Storico, email e PDF non si toccano, come per la 66. Tre prove promesse da § 7 e mancanti aggiunte, viste rosse: Back su `cashflow.centri.mobile.spec.ts` (la memoria svuotata prima del Back), la copertura «×» visibile accanto alla quota, il token positivo anche su Ghiandaia (`residualTone` coi toni scambiati); la falsificazione promessa della fila KPI del Tetto rifatta e scritta nell'intestazione, ma riscritta: a 390 i due KPI sono SOLLEVATI (la prova vera, vista rossa col sollevamento ignorato), da 768 una cella è ~230 px e il sovrapporsi non si riproduce sul fixture — la stretta `@container` è una guardia (vista rossa sul `container-type`), non la prova; l'esca del calendario portata a mezzogiorno UTC (alle 22:30 era il mese dopo in ora legale: rossa da marzo a settembre); il test della Budget al reload con il suo timeout di 120 s e l’attesa dell’URL `?tab=budget` prima del reload (il «flake» di CLAUDE.md era una corsa fra il clic sulla tab e `router.replace`: il reload atterrava su Tracciamento — rosso ancora una volta nella prima suite intera del ritiro, 222 + 1, verde 223/223 nella seconda). Divergenze scritte, non taciute: «Supererai» apre il verdetto (67; la 34 annotata); la seconda istanza dell'asse è `hidden desktop:block`, non `desktop:flex` (page-verdict.tsx, 12 annotata); il nodo `role="status"` del Budget è `sr-only` a ogni larghezza con la copia `aria-hidden` nell'aside (cashflow-budget.md); in modifica la riga è ricostruita dai dati del form con valori semplici e `saved` non è mai `null` (dialog.md diceva «null su import o serie»); `data-expense-id` sul bottone della riga; `cashflow.budget.mobile.spec.ts` non riscritta (legge la disclosure fuori griglia); `bundle.lazy.mobile.spec.ts` e `lazyTabLanding.ts` solo rilanciate (tolte dalla riga di § 5, i commenti «toolbar row» riscritti sull'asse); `VerdictSkeleton` gap 2,5 → 2 su ogni pagina e i due export `VerdictSkeletonHeadline`/`VerdictSkeletonLines` dichiarati (stati.md, § 5); `describeTrackingScope` NON è riusata da MOB-06, che scrive `describeAnalisiScope` nella stessa forma — il pezzo condiviso è `scheduledScope` (§ 5, il commento, MOB-06 ripuntata); nessun `binding` in `costCenterNarrative` perché nulla si taglia e nessuna spec lo programma (centri-di-costo.md); la tessera inline di Divisione senza guardia `isXLiftedBlock` (cashflow-divisione.md). Obiettivi di § 2 non raggiunti e dichiarati nelle guide: Centri 1,55 e Divisione 1,62 schermate contro ≤ 1,5; Budget 9 cifre fuori dal verdetto contro ≤ 5 (le due celle e sette del Tetto aperto; 9 anche prima, nessun `raisedBy`); `firstClosedRowAbovePill` falsa su tutte e cinque (§ 2 lo ammetteva per il solo Budget: decisione 19 estesa, 71). Testi corretti: centri-di-costo.md (Ciclo «attivo/fermo/archiviato», due backtick rotti), cashflow-divisione.md (la cella «senza base» che il modello non produce), cashflow-tracciamento.md («trio intero accanto a nessuna striscia» per «accanto alla striscia, disegnata fino a 1439»), cashflow-dividendi.md (il punto cieco «nessuna striscia»), `FlowBarsChart` (`PHONE_MIN_HEIGHT_CLASS`), `BudgetTab` (l'intestazione sul nodo di stato), `ExpenseSplitTab` («dove la striscia non è disegnata»), AGENTS § Hierarchy (le tab senza `order-*`), l'intro di § 3.1 al 2026-10-12, § 10 (67–70), «nove raisedBy» per nove allargamenti in sette voci. Lasciati e dichiarati: le cifre non tonde dei test nuovi (302 e 656, riprese da casi più vecchi dello stesso file); il wrapper `{( … )}` senza condizione attorno alla griglia del dettaglio (`CostCenterDetail.tsx`); nessuna prova nel browser del fuoco del picker in attesa/errore (35/69) e di «Supererai» sul verdetto; l'intestazione della spec («da fare») mai aggiornata, cancellata. Giro F: i cinque punti della sessione di implementazione sul mirror; nessuno nel ritiro. La misura di chiusura resta e si è rifatta nel ritiro, prima e dopo i fix: 19 × 3 sul fixture in 2,8 min (l'altra macchina), `mobile:budget` verde su 57 senza una stretta né un allargamento (le cinque tab a 390 come § 3.1), `yahooCalled` falso; le informative a 768/1024 stampate e non vincolanti: Tracciamento 1024 8 (tetto 5), Budget 1024 11 (9), Previdenza 768 17 (12), What If 1024 10 (8), Panoramica 1024 10 (7) come l'11 — prima-schermata.md § Per-page blind spots; rifatta sul codice corretto (build nuova): 2,7 min, verde su 57, le cinque tab identiche, e Monte Carlo 390 `screens` 4,89 → allargato con `raisedBy` dopo la prova sullo `stash` di develop (sopra: oscilla 4,87/4,89 a parità di codice; alla corsa finale 4,87); `perf:budget` verde su `.next-perf`, nessun tetto alzato; tsc pulito, lint 0, Vitest 235/5208 in Europe/Rome e sotto `TZ=UTC`; Playwright **223/223 in 9,9 min** sul codice corretto (le tre spec estese 15/15 in 1,3 min prima, le sei falsificazioni viste rosse una per volta) |
| MOB-05 | Rendimenti | 2 | M | MOB-01, MOB-02 | Fable 5.1 · high | **ritirata il 2026-10-14** — PR #459 in develop dal 2026-10-14; 206 criteri letti contro il codice da un workflow in sola lettura (sei lettori e tre scettici, tutto Opus): 156 reggono, 45 segnalazioni confermate (29 divergenze dichiarate in § 13 della spec e vere nel codice, 16 altre) e 5 confutate. **Tre difetti a runtime corretti nel ritiro, su decisione del proprietario** (§ 9, 78–80): lo zero stampato con segno e colore nella tessera Rendimento (TWR) accanto a una cella senza segno («+0,0%» verde e «+0 pt» per +0,03; da 768 a 1439 tessera e striscia convivono) — `printedSign`/`formatSignedPercentIt`/`formatSignedPoints` in `lib/utils/formatters.ts`, visti rossi in `__tests__/formatters.test.ts`, la classe `< 0 ? '−'` (22 siti) dichiarata e lasciata fuori; «Analizza con AI» abilitato nei rami di attesa e di lettura fallita, dove il dialog non è montato e una pressione lo faceva partire, e spendere, al ritorno del ramo principale (preesistente sul desktop, esteso all'icona del telefono) — `aiDisabled` guarda `loading` e `loadFailed`, nessun test (ramo transitorio), dichiarato in doc/guide/rendimenti.md; «nei 8 mesi»/«nei 11 mesi» (il rinvio di § 9 della spec) — `inMonths` in `performanceSummary.ts`, l'eroe, la cella, il verdetto e la finestra dell'attribuzione, visti rossi in `performanceSummary.test.ts` e `performanceNarrative.test.ts`, `fireNarrative.ts` (MOB-07) non toccato. Divergenze di solo testo corrette: il chip «dal massimo» si nasconde sotto `tablet:` e non sotto `desktop:` (la 38 annotata; § 4.2 della spec e la decisione 5 avevano ragione, § 4.3 no); le 5 cifre fuori dal verdetto a 390 sono la cella in «%», le tre della lettura e il chip «annualizzato», non «le due celle» (§ 3.1); la falsificazione (1) della spec E2E registrava una mutazione diversa da quella promessa, con lo stesso effetto (dichiarato nell'intestazione); il salto skeleton → composizione dichiarato in rendimenti.md come per la Panoramica; `performanceSummary.ts` citava la «decisione 35» per la forma di Plusvalenze in errore (è la 36 e la scelta del 2026-09-26) e «la spec del 2026-10-14»; il README utente `:59` diceva ancora «tiles stack in one column»; MOB-08 `:92`/`:191-200` ripuntate (`:98`, `:207-222`) e la deriva di Patrimonio aggiunta al suo § 2; MOB-09 `:58`/`AGENTS.md:733` ripuntate; MOB-06 «Plusvalenze (MOB-05)» ripuntata al codice; § 5 con i nomi che la spec ha creato; la 76 citava «§ 4.3» senza il documento. Non toccato e dichiarato: il `README.md` e `prima-schermata.md` toccati dalla PR fuori da § 5/§ 10 (il primo per convenzione, il secondo per la 77); la lettera di rollback «`strip` non passata» incompleta (sparisce con la spec: i blocchi sollevati derivano dalla striscia); a 1024 `figuresOutsideVerdict` 7 contro il tetto 6 e la riga chiusa `false`, informative (§ 3.1); il mirror rimosso (verificato nell'Auth emulator: nessun `mirror@example.com`). Giro F: i cinque punti della sessione di implementazione sul mirror; nessuno nel ritiro. La misura di chiusura resta e si è rifatta nel ritiro, prima e dopo i fix: 19 × 3 sul fixture in 2,6 e 2,7 min (l'altra macchina), `mobile:budget` verde su 57 senza una stretta né un allargamento (Rendimenti 390 1,76 · 2/1 · 5/5 · riga `false`, 768 1,28 · 5/5 · 7/7 · `true`, 1024 1,62 · 1/0 · 7/7 · `false` informativa), `yahooCalled` falso; `perf:budget` verde su `.next-perf` (Rendimenti 648,2/651, nessun tetto alzato); tsc pulito, lint 0, Vitest 236/5262 in Europe/Rome e sotto `TZ=UTC`; Playwright **230/230 in 11,3 min** sul codice corretto (la suite intera su :3100; nessun flake) |
| MOB-06 | Patrimonio · Analisi · Storico · Hall of Fame | 3 | L | MOB-01, MOB-02, MOB-03, MOB-04 | Opus 5.5 · high | **ritirata il 2026-10-15** — PR #462 in develop dal 2026-10-14; 222 criteri letti contro il codice da un workflow in sola lettura (sei lettori e tre scettici, tutto Opus): 182 reggono, 38 segnalazioni confermate e 2 confutate, una terza confutata alla rilettura (`formatDriverEuro` contro la cella su −0,50 €: la cella prende il `value` già arrotondato della riga del ledger). **Due difetti a runtime corretti nel ritiro** (§ 9, 86; proprietario: «valuta tu»): la chip «ultimi 12 mesi» di Evoluzione vuota sotto i 768 px senza percentuale, e la sua percentuale con il «+» accanto a un «0 €» senza segno — visti rossi in `__tests__/evoluzioneTileChips.test.ts`, la classe `>= 0 ? '+'` dichiarata e lasciata fuori. **La misura di chiusura era rossa su Tracciamento** (390 1,69 · 13/7 contro 1,67 · 12/5; 768 e 1024 cifre 18 e 16 contro 16 e 14) con valori identici sulla build di develop prima di MOB-06 (4dc553c2, due corse): la deriva del giorno, isolata — il confronto «sugli stessi giorni» del mese scorso prendeva le righe del seed ai giorni 5/10/15/20 una alla volta; il seed le mette ora tutte al 5 e le cinque metriche portano `raisedBy` (§ 9, 87; § 3.1; MOB-08 § 2 riscritto). **Un testo deciso** (§ 9, 88): in disavanzo la didascalia per ruolo del Flusso PERDE l'importo (la base è la spesa che il primo enunciato stampa) — la 82, la 42, la guida e il test dicevano il contrario, il test costruiva il lead senza la cifra mono; riscritto e visto rosso con `printed` ignorato. Una prova promessa e mai registrata, fatta: `FlussoTile` senza `liftedFigures` → due test rossi in `e2e/analisi.mobile.spec.ts`, scritto nell'intestazione. Divergenze vere nel codice e dichiarate (le case ora sono le guide e § 9): la prima riga chiusa sotto la pill sulle tre pagine (84); l'anno di Patrimonio frase sua a ogni larghezza, quarto cambio a 1440, con i quattro `restLabel` «l'anno…» (81); i tetti `perf:budget` 702 e 764 (85); «Ultimi 12 mesi» senza i dodici mesi apre LA tessera, non «Il perché» (85); «Chiudi» senza opener porta il fuoco su «Apri tutte», non sul titolo `h2`, senza prova automatica; la terza `restLabel` di Analisi «il fuori scala» e la terza `reason` di Liquidità «nessun conto registrato» (nelle guide); il Sankey da 640 a 1439 che stampa l'avanzo accanto alla cella (era solo nella spec: ora in cashflow-analisi.md § Per-page blind spots); `AGENTS.md` § Hierarchy e il README utente toccati dalla PR fuori da § 10, il draft con una riga desktop per due pagine. Testi corretti: storico.md («a 1440 invariata»: la chip era cambiata; il punto cieco dei chip vale da 768), patrimonio.md («la quarta pagina»; `useMediaQuery` in § Files e nelle righe leggere per `!useCompactLayout()`; la notice di Movimenti senza prova automatica), panoramica.md (l'esempio della frase del mercato; «Patrimonio and the landing keep every block»), l'intestazione della E2E desktop di Patrimonio («held by Vitest»), una falsificazione copiata due volte nell'intestazione della E2E di Analisi, il JSDoc di `PatrimonioTile` (blocchi e conteggio), il README utente e il draft («senza i chip» anche sul tablet: dal 768 tornano), § 5 con ogni nome creato, tre rimandi dell'indice alle sezioni della spec. Nella sola spec, cancellata: «il seguito nomina il mercato solo con `topMover`» (lo nomina anche lo split del mese), `featured === null` fra le `null` con `reason` di § 7, il rollback per lettera incompleto (togliere `collapse` lasciava striscia e blocchi sollevati), i numeri di `perf/budget.json` di § 4.5 prima della 85. Lasciati e dichiarati: il `raisedBy` di MOB-05 sulla voce Patrimonio 768, che dopo la stretta non descrive più i valori (un `raisedBy` resta dopo una stretta, prima-schermata.md); la freccia delle spese che a Tracciamento ristampa il ritmo del primo enunciato (cashflow-tracciamento.md § Per-page blind spots, decisione non presa). Giro F: i cinque punti della sessione di implementazione sul mirror; nessuno nel ritiro. La misura di chiusura resta e si è rifatta nel ritiro sul codice e sul seed corretti: 19 × 3 sul fixture in 2,9 min (l'altra macchina), `mobile:budget` verde su 57 con le cinque voci di Tracciamento allargate, `yahooCalled` falso; Patrimonio, Analisi, Storico e Hall of Fame come § 3.1; `perf:budget` verde su `.next-perf` prima e dopo (Patrimonio 701,4/702, Cashflow 763,1/764), nessun tetto alzato; tsc pulito, lint 0, Vitest 237/5294 in Europe/Rome e sotto `TZ=UTC`; Playwright **247/247 in 10,4 min** sul codice corretto, nessun flake |
| MOB-07 | Allocazione · Previdenza · FIRE | 3 | L | MOB-01, MOB-02 | Fable 5.1 · high | **ritirata il 2026-10-16** — PR #464 in develop dal 2026-10-15 (implementata il 2026-10-15: le sette superfici composte, doc/guide/{allocazione,previdenza,fire,fire-coast,fire-what-if,fire-monte-carlo,fire-obiettivi}.md § Composizione mobile; `screens` a 390 da 3,57 · 3,85 · 3,13 · 2,25 · 4,06 · 4,89 a 1,59 · 1,96 · 1,81 · 1,8 · 1,73 · 1,83; Obiettivi acceso nel fixture, 60; decisioni 89–93); 229 criteri letti contro il codice da un workflow in sola lettura (sei lettori e tre scettici, tutto Opus): 187 reggono, 48 segnalazioni confermate (una trentina distinte, molte doppie) e 1 confutata. **La misura di chiusura era rossa sulla build mergiata senza una modifica** (§ 9, 94: Patrimonio 1024, Budget 768 e Previdenza 1024 `screens` +0,01, Allocazione 1024 una tessera intera in meno; tre corse identiche sulla macchina di riferimento — allargate con `raisedBy`, i dodici `raisedBy` sovrascritti dal `--tighten` di MOB-07 riconcatenati, § 3.1). **Sei difetti corretti nel ritiro, su decisione del proprietario** (§ 9, 95–100, ciascuno visto rosso prima del fix): il verdetto di Previdenza stampava «+0,00%» verde accanto alla cella «0,00%» (`signedPct` su `printedSign`); «Fisco · nessun versamento» in un anno di solo TFR («solo TFR»); «Patrimonio FIRE sale» sopra «invariato» («Patrimonio FIRE oggi», neutro); il verdetto di Monte Carlo «non calcolabile» dal form digitato sopra una striscia che stampava il run mostrato (il verdetto segue il run); la cella «Fuori posizione» «nulla» dove la lettura stampa «lo 0,0% è fuori posizione e …» (`isNothingOutOfPosition`, un predicato con `describeBalance` — e a 768/1024 una cifra in più, allargata, § 9, 99); i rami vuoti di Allocazione, Previdenza e What If che davano al controller righe non rese (`NO_SECTIONS`; i due resolver in `allocazioneSummary.ts`/`pensionSummary.ts`, tenuti dai test). Prove promesse e mancanti aggiunte, viste rosse: la mappa `failed` di Previdenza (privata del componente, «provata in Vitest» per spec e guida senza un test); il KPI sollevato di Bilanciamento (`__tests__/bilanciamentoTileLifted.test.ts`: la E2E a 390 gira sul fixture base dove la cella è «nulla» e il ramo nascosto non correva); le aside chiuse delle sette superfici; il valore della cella Mercato off-axis; la soglia unica di Coast (`SURPLUS_FLOOR`); l'«Aggiorna» fallito con i profili letti (E2E); le prove `order-*` dalla `classList` e dall'ordine verticale su Calcolatore, What If e Ipotesi di Coast (AGENTS § Hierarchy le dava a `allocation.mobile.spec.ts`, che non lascia Allocazione); le quattro prove a 1440 viste rosse con `compact` ignorato; la falsificazione «scope anche a 1440» spostata nell'intestazione di `fire.spec.ts` (la mobile, a 390, non può vederla); la frase del vincolo asserita in `coast.spec.ts`. Conti corretti: Vitest 29 falsificazioni registrate (non 20), Playwright +15 casi in sette spec e 12 falsificazioni (non 16 in otto e 9); § 3.1 confrontava con «≤ 2,5» (l'obiettivo di MOB-06) — Previdenza 1,96 e Monte Carlo 1,83 superano i loro obiettivi di § 2, dichiarati ora; Patrimonio 1024 in § 3.1 diceva 1,58 contro un budget stretto a 1,57; la 93 mancava dalle righe di stato; la 60 senza «fatto». Testi corretti: fire.md (la riga d'ambito nei rami senza frase del vincolo; la riga «Suites» senza `fireNarrative`/`fireSummary`/`goals*` né le spec browser), fire-monte-carlo.md e fire-obiettivi.md («this spec»), previdenza.md (la prova inesistente), il README utente (il «dropdown» della navigazione FIRE e «le tessere impilate con il piano in fondo» di Monte Carlo), CLAUDE.md § Key Features senza «composed for a phone» sulle tre pagine, `mobileCensus.mjs` («Obiettivi off» come esempio), MOB-08 (sei voci di deriva per tre, `fire.mobile.spec.ts:62-80` mosse, l'intestazione senza MOB-06), MOB-09 (le righe del README, la data dell'Evento), § 5 con un nome su ~45. Nella sola spec, cancellata: § 2 mai riscritto dopo la 90 (`true` sulle quattro curve), «. La leva» a 1440 (il fixture base non ha leva: la E2E prova «. Con 1000 €»), «Datore · nessun versamento» su un fondo non assegnato (è «fondo non assegnato», 92), pension e FIRE «736» (pension è 661), il rinvio del `loan` alle E2E a 1440 (l'erede è `loanAssets.test.ts`, scritto nei punti ciechi). Lasciati e dichiarati: la classe `>= 0 ? '+'` (50 siti) fuori dalla cella; «euro non compatto» e `captionHonestClauses` senza un rosso registrato (le identità e il test del 2026-09-24 li coprono, scritto nelle intestazioni); il «dev» del draft nessuno. Giro F: i cinque punti della sessione di implementazione sul mirror; nessuno nel ritiro. La misura di chiusura resta e si è rifatta nel ritiro, prima e dopo i fix: 19 × 3 sul fixture in 2,0 min, `mobile:budget` verde su 57 con le sei voci allargate (94 e 99), `yahooCalled` falso, Monte Carlo 390 1,83 in tre corse; `perf:budget` verde su `.next-perf` prima e dopo (Allocazione 590,7 → 590,9/593, Patrimonio 702,8/703), nessun tetto alzato; tsc pulito, lint 0, Vitest 238/5346 in Europe/Rome e sotto `TZ=UTC` (+1 file, +15 test); Playwright **264/264 in 11,4 min** sul codice corretto (+2 casi), nessun flake |
| [MOB-08](MOB-08-tablet-768-e-1024.md) | Tablet: 768 e 1024 | 3 | M | MOB-02..07 | Opus 5.5 · high | da fare · riletta in modo adversariale il 2026-10-10: 30 rilievi, 5 decisioni |
| [MOB-09](MOB-09-design-md-guide-e-chiusura.md) | DESIGN.md, guide e chiusura | 3 | M | MOB-02..08 | Opus 5.5 · high | da fare · riletta in modo adversariale il 2026-10-10: 27 rilievi, 6 decisioni |

Le PERF citate nelle intestazioni delle spec sono tutte ritirate e in develop: non sono dipendenze aperte. L'ordine è quello
dei numeri (decisione 9).

Effort = il livello di ragionamento di Claude Code. Fable 5.1 dove il lavoro attraversa regole di dominio dense (le
narrative e le clausole vincolanti, Cashflow, Rendimenti, Pianificazione); Opus 5.5 dove è meccanico ma esteso (il
censimento, le pagine di analisi sul contratto già scritto, il tablet, la documentazione). Ogni spec è stata verificata
da un revisore avversario contro il codice del 2026-09-26 (161 affermazioni corrette in tutto: `file:riga`, nomi di API,
regole di dominio, template) e poi allineata a MOB-02 da un passaggio di coerenza; le righe citate sono di quel giorno e
chi implementa le riverifica, perché nel frattempo le PERF riscrivono i caricamenti.

## 7. Cosa NON fare (deciso il 2026-09-26)

- Un secondo design system per il mobile (tipografia, chrome, token propri): raddoppia DESIGN.md, temi, stati e modali.
- Il diario dei verdetti (B) e il pager orizzontale (C): scartati con motivazione in § 4.
- Rigenerare DESIGN.md: MOB-09 propone il testo, il proprietario lo applica.
- Cifre reali del proprietario nei mock, nelle spec, nel budget o nel draft delle release notes: cifre tonde inventate
  e nomi generici, sempre.
- Implementare prima delle perf: PERF-02/03/04/11/12/14 toccano gli stessi componenti.
- Chiudere una spec «a sensazione»: ogni spec dichiara la sua misura in § 2 (`mobile:budget`) e la riporta qui.

## 8. Come si rimisura

`npm run mobile:census -- --email=census@example.com` e poi `npm run mobile:budget`, sulla build di produzione di
`perf:build` servita da `perf:serve` (:3200), con gli emulatori accesi, il `--` di npm davanti alle opzioni e da Git Bash
su Windows (PowerShell 5.1 mangia il `--`). Il censimento risemina il fixture, ricostruisce i suoi record di Hall of
Fame e si rifiuta dal 1 al 4 del mese e l'ultimo giorno; l'uscita (`.mobile-census/`: JSON senza testi e screenshot)
è gitignored. Il mirror (`--email=mirror@example.com`) serve al giro guidato e al confronto con la baseline § 3 in
SESSION_NOTES, mai al budget. Comandi, colonne e ratchet: doc/guide/prima-schermata.md.
`--selftest` prova la misura su un frammento noto, senza server. `reference/mobile-census.mjs` resta come lo script che
ha misurato la baseline.

## 9. Decisioni del proprietario (2026-09-26)

- Sì al design ad hoc, come **composizione mobile** (stesse tessere, token, narrative, route): cambia la prima
  schermata (verdetto + ≤ 5 cifre fuori dal verdetto, al più 4 nella striscia) e come si arriva al resto (un tap).
- **Una sola composizione «schermo piccolo»** per telefono e tablet: due colonne dai 768, al più tre a 1024; `desktop:`
  resta l'unico switch, `lg:` resta vietato.
- **Direzione A** come base; da C l'eyebrow rosso e Plusvalenze in errore; niente diario, niente pager.
- **Il verdetto sul telefono = titolo + prima frase**, il resto dietro «Il perché»; una clausola che cambia il senso di
  una cifra (tasse su una vendita, base misurata, calendario) resta sempre visibile.
- **Una tessera sul telefono non ripete** ciò che striscia o verdetto hanno stampato; torna intera dal tablet.
- **Le sezioni aperte si ricordano per pagina** (`localStorage`, per dispositivo).
- Prima le 14 spec PERF (tutte ritirate entro il 2026-10-08), poi queste.
- **MOB-02 (2026-10-10, nella sessione di implementazione — scelte d'ingegneria, non domande aperte)**: lo `scope` di
  `PageVerdict` è reso due volte (`desktop:hidden` dopo la striscia, `hidden desktop:block` dopo il seguito) perché una
  sequenza sola non può stare dopo la striscia sotto `desktop:` E sotto il paragrafo a 1440 senza spezzarlo; a 1440 il
  controller non dà `restCollapse` e il verdetto è il `<p>` di oggi; i gestori delle righe non leggono valori di render
  (`react-hooks/refs`): leggono la memoria dallo store al gesto e sono legati a `key` e `defaultOpen` (a livello di
  modulo nelle pagine); il pannello di una riga mai aperta è VUOTO (nessun figlio elemento); **un aside di testo resta nel
  trigger anche da aperta** (nel pannello era tagliato sotto il trigger e saltava a ogni tap, giro F del 2026-10-10 —
  «fuori dal bottone» della spec vale per un controllo, che apre la prima riga del pannello); su OGNI pagina l'unità di una
  cifra è uno span proprio dopo `ml-[0.2em]` (`NarrativeSegments`, non solo nella striscia: in Geist Mono lo spazio prima di
  «€» è una cella intera, a 22 px un buco).
- **MOB-02 (2026-10-10, nel ritiro).** (62) **«Chiudi tutte» conta nella visita le righe aperte al caricamento** (dalla
  memoria, da un default o da una lettura fallita): il loro contenuto resta montato e il pannello si chiude con la
  transizione — prima `setAll(false)` le lasciava fuori da `visited` e il contenuto si smontava di colpo (visto rosso in
  `e2e/mobile-composition.hof.mobile.spec.ts`). (63) **Gli eyebrow della striscia vengono dal controller** (`sections.eyebrows`,
  id → eyebrow di ogni riga); la pagina li passa a `VerdictStrip` e aggiunge con lo spread la voce di una cella che apre LA
  tessera o nessuna riga — senza, una cella annunciava la propria etichetta («apre Quest'anno»). (64) **`formatPoints`
  applica `decimals` sul valore grezzo**; senza `decimals` arrotonda a un decimale come il chip di Rendimenti (prima
  arrotondava SEMPRE prima: «+1,20 pt» per 1,234 a due decimali; `__tests__/verdictStrip.test.ts`). Le due prove promesse
  dalla spec (§ 7) e mai scritte sono aggiunte (la prima schermata contro il top della pill, «Il perché» al reload); lo
  `scope` visibile a 1440 lo prova MOB-04 (`cashflow.split.spec.ts`), che lo dichiara.
- **Decisioni di fondazione (2026-09-27, prima di MOB-02/MOB-03)**: (1) **una sequenza sola** — nessun riordino
  CSS, l'ordine del DOM è l'ordine di lettura su ogni dispositivo, e dove LA tessera non è già la prima della griglia si
  sposta anche sul desktop (chiude AGENTS § Hierarchy vs `doc/guide/patrimonio.md`: vale la seconda); (2) **l'asse sotto
  `desktop:` è uno slot `axis` di `PageVerdict`**, sotto il titolo e prima della striscia, nella stessa `section` del
  verdetto; (3) **deroga «solo titolo» ammessa e dichiarata** (`leadLength: 0`) quando la prima frase ristamperebbe ≥ 2
  cifre della striscia, le clausole vincolanti sempre fuori; (4) **con LA tessera alta cede la curva (~120 px sotto
  `desktop:`), mai la lettura**: il budget resta vero senza eccezioni; (5) **il builder ripunteggia anche a 1440** (un «;»
  che diventa «.») dove serve al taglio; (6) **il budget di MOB-01 si misura su un fixture deterministico**, il mirror
  resta per il giro guidato; (7) **una «cifra» è solo € e %**, come la baseline; (8) **la stessa cifra può ripetersi nel
  paragrafo aperto di «Il perché», mai nella tessera**.
- **Il Flusso di Analisi sceglie il disegno a 640 px (2026-09-27, con l'integrazione di #400 e #401)**: sotto, una barra
  di quote e le righe; da 640 a 1439 il Sankey. È una soglia di leggibilità del GRAFICO, non una seconda composizione:
  «una sola composizione» e «`desktop:` unico switch» valgono per griglia, striscia e righe, e restano. Un grafico può
  cambiare disegno sotto la larghezza in cui smette di leggersi; mai cifre né atterraggi, e le sue didascalie vengono da
  `analisiNarrative.ts` come ogni altra frase (doc/guide/cashflow-analisi.md § Composizione mobile, MOB-08 § 4.1, MOB-09 § 4.1).
- **Decisioni della lettura adversariale (2026-10-10)**, numerate di seguito alle otto di fondazione; ogni spec le cita
  per numero. Le prime sedici sono trasversali, le altre stanno sotto la spec a cui appartengono.
  - **Trasversali.** (9) **Una spec per volta, nell'ordine dei numeri 01 → 09**, mai due insieme; un modulo condiviso è
    della spec con il numero più basso che lo tocca (tabella in § 5). (10) **Il budget si misura sull'account dedicato
    `census@example.com`** (`npm run e2e:seed:census`, `scripts/seedCensusE2E.mts`: Centri e Divisione accesi, una cedola,
    una riga in calendario, la storia di Hall of Fame del seed `hof`, date relative al giorno della corsa così che ogni
    superficie mostri gli stessi conteggi in qualunque giorno del mese — dal 5 al penultimo, decisione 59); `mobile:census`
    lo risemina prima di misurare quando `--email` è il suo. (11) **L'ordine unico è il DOM di oggi su ogni pagina**: a 1440 non cambia nulla salvo LA
    tessera portata in testa dove non lo è (What If); sul telefono le righe chiuse seguono il DOM desktop (Panoramica:
    Sintesi prima di Cashflow); nessuna classe `order-*` nelle griglie composte; ogni guida dichiara l'ordine in
    § Composizione mobile. (12) **L'asse sta subito sotto il titolo, prima della prima frase** (titolo → asse → prima
    frase → striscia → scope → «Il perché»); **a 1440 sono due istanze dello stesso controllo** (nello slot con
    `desktop:hidden`, al posto di oggi con `hidden desktop:flex` — nel codice delle tre tab di Cashflow `hidden
    desktop:block`, 2026-10-12 —, stessa prop di stato, come le `actions` di `PageHeader`). (13) **Le cifre dello `scope` contano DENTRO il verdetto** (ogni discendente della `section` salvo
    l'`ul` della striscia); `PageVerdict` rende lo `scope` a ogni larghezza quando la pagina lo passa (sotto `desktop:`
    dopo la striscia, a 1440 sotto il paragrafo), e la pagina che lo vuole solo sotto `desktop:` lo passa con
    `sections.compact`. (14) **La didascalia del calendario sotto le cifre che lo contengono compare a ogni larghezza**
    (Panoramica, Tracciamento); **in Analisi e Divisione `scheduledSentence` esce dalla `sentence` e diventa lo
    `scope`**, `lead` = la prima frase, nessun `binding` su `scheduledSentence`; in Divisione «Con quelle, …» diventa
    «Con le spese in calendario, …». (15) **Una cella della striscia può ripetere una cifra che la tessera aperta stampa
    nella sua LETTURA, in una riga di classifica o in una riga del ledger**: The Lifted-Figure Rule nasconde solo i
    BLOCCHI (KPI, chip, didascalie, eroi); letture, classifiche e ledger restano interi. (16) **Il conto «≤ 5 cifre fuori
    dal verdetto sopra la pill» conta tutte le cifre, LA tessera compresa**; l'obiettivo 5 vale a 390; a 768/1024
    l'obiettivo è il misurato di MOB-08, che fa da tetto. (17) **Di un blocco sollevato si nasconde solo la cifra
    ripetuta**, l'altra resta nella tessera («€ da spostare», `trailingPct`, la quota del trio); **quando la cifra non
    ripetuta farebbe sforare il 5, il blocco si nasconde intero e la cifra entra come clausola nel seguito di «Il
    perché»** (l'euro del chip dell'anno su Panoramica e Patrimonio, il chip «dal massimo» di Rendimenti). (18) **Per la
    deroga «solo titolo» conta ogni cella della striscia**, anche `points`, `pp`, `ratio` e `rank` (la decisione 7 vale
    solo per il censimento): Rendimenti con il 60/40 va in «solo titolo», senza si taglia al primo «;». (19) **LA tessera
    senza curva** (Bilanciamento, Evento, Tetto del mese, Obiettivi, e Hall of Fame se il grafico a 120 px non basta):
    `firstClosedRowAbovePill` registrato `false` con `raisedBy: "MOB-NN: perché"` in `budget.json` e una riga in § 3.1,
    solo per le superfici elencate. (20) **Lo zero firmato si stampa senza segno ovunque** («0 €», `isPrintedZero`):
    `formatStripFigure` lo fa, MOB-03 e MOB-06 allineano `overviewNarrative` e `patrimonioNarrative` (cambio a 1440
    dichiarato). (21) **LA tessera resta sempre aperta**, fuori dal controller, senza trigger. (22) **La pill di
    `PageTabBar` passa a 44×44**; le pagine a tab crescono di ~12 px e `budget.json` si allarga per le sole metriche
    mosse con `raisedBy: "MOB-02: pill a 44 px"`. (23) **Tolleranza zero** su ogni metrica; `mobile:budget -- --tighten`
    scrive il misurato esatto, solo con `--email=census@example.com`, e si rifiuta se una superficie è `missing` o
    `unsettled`. (24) **L'eroe di LA tessera è esente dalla regola «non ripete»** anche quando il `lead` lo nomina (è la
    tessera).
  - **MOB-02.** (25) Le due azioni di Hall of Fame («Aggiungi una nota», «Aggiorna i record») scendono dopo il
    Dettaglio sotto `desktop:` già in MOB-02; il grafico di Record del patrimonio scende a 120 px; se la prima riga chiusa
    resta sotto la pill, eccezione `raisedBy` (19). Il podio resta a cinque righe.
  - **MOB-03.** (26) «Messo da parte finora» = la quota del verdetto (`resolveLivedCashflow`), già arrotondata con
    `Math.round` come la frase; la tessera Cashflow tiene il mese intero. (27) Mese con `taxIsTheStory`: il taglio va DOPO
    la clausola della vendita (titolo + prima frase + tasse visibili, risparmio e mercato dietro «Il perché»). (28) Una
    cella con un valore oltre 9 caratteri («+123.456,78 €») prende una riga intera della striscia e le altre scendono
    (layout di `VerdictStrip`, MOB-02).
  - **MOB-03 (2026-10-11, nella sessione di implementazione; numerata 65 nel ritiro, perché la 29 era già di MOB-04).** (65) **La prima riga chiusa della Panoramica resta sotto la
    pill a 390** (proprietario, interattiva): sul fixture la pill inizia a 767, il verdetto è alto 198 — la striscia prende
    DUE righe (103 px) perché «+3000,00 €» supera i 9 caratteri (decisione 28), come ogni variazione a quattro cifre —, LA
    tessera 442 (eroe 66, riga «Andamento» con la pill a 44 px 74, curva già a 120, etichette 15, conteggio 48), «Il
    resto» 44, e Sintesi finisce a 879. Né la curva (120 è il minimo della decisione 4) né le etichette (−38 px al
    massimo) chiudono i 112 px: la decisione 19 si estende alla Panoramica, `budget.json` registra
    `firstClosedRowAbovePill: false` a 390 con `raisedBy: "MOB-03: …"`, e la E2E tiene l'ordine (la riga parte dopo LA
    tessera), non la pill. Scelte d'ingegneria, non domande aperte: `describeOverviewAsides` e `OVERVIEW_SECTION_IDS`
    stanno in `lib/utils/overviewSummary.ts` (gli id del DOM non sono narrativa, e `overviewNarrative` non importa dal
    modulo che lo importa); la quota negativa del verdetto prende il «−» tipografico («il −12%», prima il trattino:
    l'identità cella = frase lo impone, The Comma Rule); la didascalia del «Risparmio» porta «, entro il N» come quella
    di una cifra sola; `OverviewVerdict` avvolge `PageVerdict` in un `div#panoramica-verdetto` con `tabIndex={-1}`, dove
    «Questo mese» porta il focus quando il paragrafo è intero (`page-verdict.tsx` intatto); le `SectionSpec` sono una
    costante di modulo (`OVERVIEW_SECTIONS`) e la pagina passa il sottoinsieme presente (`resolveOverviewSections`,
    memoizzato sui tre flag); le due celle che non aprono una riga annunciano «il perché» e «l'andamento da inizio anno»
    dalla pagina (il controller non le conosce).
  - **MOB-03 (2026-10-11, nel ritiro).** (66) **Lo zero stampato senza segno vale anche in `salesNarrative`** (proprietario):
    `signedCompactEuro` stampava «+0 € risparmiati» con segno e colore; ora un importo che stampa zero è senza segno e la
    parola («risparmiati» / «spesi oltre le entrate») segue il segno stampato. `patrimonioNarrative` resta a MOB-06 per la 20;
    email, PDF, Analisi e le tessere fuori dalla serie non si toccano. Le due prove promesse da § 7 e mai scritte si aggiungono
    nel ritiro (PageRest fra LA tessera e Sintesi; `validateStrip` senza «Il perché»); a 1024 il budget della Panoramica resta
    7 / `null` (informativa fino a MOB-08) e § 3.1 scrive la misura come tale; il `SavingsRateBadge` che copre la pill a 390 è
    un punto cieco di doc/guide/panoramica.md, non un rinvio a una spec.
  - **MOB-04.** (29) Una spesa salvata dal «+» fuori dal periodo o dai filtri: nessuna apertura, periodo e filtri fermi,
    solo il toast di successo che esiste. (30) Dividendi e Centri di Costo senza striscia. (31) La striscia di
    Tracciamento solleva il trio (totali del periodo, calendario compreso, con lo `scope` «Nel totale ci sono ancora…»);
    nel trio si nascondono solo le tre cifre ripetute. (32) Il residuo per persona di Divisione passa al «−» U+2212 anche a
    1440. (33) Budget oltre il tetto: frase intera e striscia (la ripetizione è nel verdetto, non nella tessera).
    (34) Tetto superato solo dal calendario: la cella si chiama «Supererai» e apre `bud-rischio` — **per «Supererai»
    sostituita dalla 67** (2026-10-12: apre il verdetto, che nomina il giorno); «Oltre» (superamento già avvenuto) apre
    `bud-avvisi`. (35) In attesa e in errore il wrapper del verdetto resta montato e rende lo slot
    `axis` attorno a skeleton ed `ErrorNotice`: il selettore è lo stesso elemento e tiene il focus (ingegneria, non una
    scelta).
  - **MOB-04 (2026-10-12, nella sessione di implementazione; interattive).** (67) **«Supererai» apre il verdetto, non
    `bud-rischio`** (sostituisce la 34 per quella cella): la cella dice che il calendario supera il tetto e il verdetto
    nomina il giorno («Lo superi il 23»); Categorie a rischio non lo sa. La tab mette il fuoco sul box `#bud-verdetto`
    (`tabIndex={-1}`), come la Panoramica col suo; «Oltre» → `bud-avvisi` e «Fine mese» → `bud-rischio` restano.
    (68) **Le parole chiuse di Divisione**: `restLabel` «quanto resta a ciascuno»; le aside da chiuse «dalle entrate»
    (Quota) e «quanto resta» (ogni persona); con esse le aside di Tracciamento («per categoria», «mese per mese», il
    conteggio di Movimenti), Budget («a fine mese», «soglie di quota»/«disattivati», «da gennaio», «budget del mese»),
    Centri («in ordine di costo», «senza spese da tempo», «in totale», il conteggio; nel codice anche Ciclo di vita
    «attivo»/«fermo»/«archiviato» e Sottocategorie «2 escluse» con una lente — parole e conteggi, dentro la regola,
    ritiro del 2026-10-12) e Dividendi («9 mesi · in portafoglio», «ultimi 12 mesi», «in portafoglio», «5 anni», il
    conteggio) — tutte parole, mai una cifra.
    (69) **`PageVerdict.pending`** come prop additiva (`{ kind: 'loading' } | { kind: 'failed', notice }`): la
    `section` resta la stessa, lo slot `axis` è il secondo figlio in ogni stato, e `VerdictSkeleton`/`TileGridSkeleton`
    prendono lo stesso `axis` — invece di un wrapper nuovo o di un terzo componente. (70) **Tracciamento senza striscia
    (nulla in entrata né in uscita) tiene la frase intera**: la deroga «solo titolo» (3) esiste perché la prima frase
    ristamperebbe la striscia, e lì non c'è striscia.
  - **MOB-04 (2026-10-12, nel ritiro).** (71) **La decisione 19 vale anche per Tracciamento, Centri, Divisione e
    Dividendi** (proprietario in sessione di implementazione, «Allarga tutte e quattro con raisedBy»; numerata nel ritiro
    come la 65 per la Panoramica): LA tessera è alta 378–495 px e parte a 340–478, la prima riga chiusa inizia a 787–1015
    contro la pill a 767 — § 3.1 porta le voci. (72) **Lo zero stampato senza segno vale anche nelle tessere la cui cifra
    una cella ripete** (proprietario): `withTypographicMinus`/`formatEuroMinus` in `lib/utils/formatters.ts` decidono il
    «−» sul TESTO (`isPrintedZero` vive lì, riesportato da `verdictStrip.ts`) — il trio di Tracciamento (`CashflowKpiTrio`,
    stampava «−0 €» per −0,3 contro la cella «0 €»), il residuo per persona di Divisione (`formatBookedResidual`, e
    `residualTone` per il colore: nessuno su uno zero stampato — la tessera colorava verde lo 0 esatto e rosso −0,3), la
    tessera Cashflow della Panoramica e la quota di Risparmio; i 20 siti `< 0 ? '−'` fuori dalla serie restano, come
    per la 66. (73) **«Carica altri» conta la pagina da ciò che il feed MOSTRA** (`growFeedWindow`): dopo un «+» la cui
    riga sta oltre la prima pagina la finestra allargata nel render (51 righe) era azzerata dal conteggio sulla memoria
    (20 + 20 = 40). (74) **Il «+» della barra non si disegna in demo** (`isAddExpenseFabShown`, `lib/utils/navUtils.ts`) e
    il gestore dell'evento non apre il dialog: preesistente — la spec lo dava per fatto («in demo onSuccess non scatta»)
    senza codice dietro, e un salvataggio dal FAB scriveva sull'account condiviso. (75) **Una lettura fallita di Centri è
    il `pending` del verdetto** (`PageVerdict.pending`, come Tracciamento e Divisione): prima il verdetto del riassunto
    vuoto («Nessun centro di costo.») stava sopra la notice che avvisava del contrario (preesistente, «come oggi» nella
    spec); nessuna prova nel browser, una lettura del client SDK non si fa fallire da una spec. Scelte d'ingegneria, non
    domande aperte: a 390 la prova della fila KPI del Tetto è il SOLLEVAMENTO (le due cifre nascoste), la stretta
    `@container` è una guardia per una tessera stretta (da 768 una cella è ~230 px: il sovrapporsi non si riproduce sul
    fixture, MOB-08 la stringe a 1024); il nodo `role="status"` del Budget è `sr-only` a ogni larghezza con la copia
    `aria-hidden` nell'aside (un nodo che cambia classe si muove nel layout); l'esca E2E del calendario a mezzogiorno
    UTC dell'ultimo giorno (alle 22:30 UTC in ora legale era il mese dopo a Roma: rossa da marzo a settembre); la
    seconda istanza dell'asse a 1440 è `hidden desktop:block` (12).
  - **MOB-05.** (36) Benchmark con tutte e sei le serie fallite = lettura fallita a ogni larghezza (`SectionSpec.failed`,
    `ErrorNotice` al posto della tessera, cella 2 «modello non disponibile»). (37) Contributi senza registro: punto cieco
    dichiarato in `doc/guide/rendimenti.md`. (38) Il chip «dal massimo del periodo» passa nel seguito sotto `desktop:`
    (caso di 17); il chip sull'altra base resta — **nel codice** (ritiro del 2026-10-14) il chip si nasconde sotto `tablet:`
    come ogni blocco sollevato (`LIFTED_FIGURE_CLASS`, MOB-02; la tessera torna intera dal tablet, decisione 5) e la clausola
    sta nel seguito a ogni larghezza (a 1440 un'aggiunta dichiarata): fra 768 e 1439 chip e clausola convivono, com'è per
    l'eroe e il chip dello scarto accanto alla striscia.
  - **MOB-05 (2026-10-14, nella sessione di implementazione; interattiva).** (76) **Senza il 60/40 il `restLabel` è
    «drawdown e mesi positivi»**, non «Sharpe, drawdown e mesi positivi» come scriveva la spec (§ 4.3 del testo del 2026-10-10, in `git log -- doc/mobile/`): il taglio cade al
    primo «;», che nel paragrafo viene DOPO la clausola dello Sharpe («…con uno Sharpe di 1,08. Il drawdown massimo…»), e
    un'etichetta che nomina ciò che è già in vista mente; con il 60/40 resta «rendimento, Sharpe, drawdown e mesi
    positivi». Scelte d'ingegneria, non domande aperte: il chip «dal massimo» si nasconde intero anche al picco (nessuna
    cifra, e la frase dice già «mai sotto il massimo» o «recuperato») e la clausola entra nel seguito solo con una cifra
    stampata; il blocco della composizione (sezioni, striscia, blocchi sollevati) sta PRIMA del memo del verdetto nella
    pagina, perché `selectPerformanceStrip` prende lo scarto che il React Compiler legge come alias della riga del
    modello (una chiamata dopo il memo valeva una mutazione successiva di una dipendenza: «Compilation Skipped»); «Riprova»
    del Benchmark rilegge le sei chiavi dal client (`refetchQueries`), non `result.refetch()`, per la stessa ragione; gli
    id del DOM (`PERFORMANCE_SECTION_IDS`) e la striscia stanno in `performanceSummary.ts`, le aside chiuse
    (`PERFORMANCE_CLOSED_ASIDES`) in `performanceNarrative.ts` (il precedente della Panoramica); il test del reload di
    `e2e/performance.degraded.spec.ts` confronta `h2` e `p` del verdetto, e `baseCaption` prende la copia visibile dello
    `scope`. Vista verde una falsificazione promessa: senza `returnFocusTo` sul calendario il fuoco torna lo stesso
    all'icona (sotto 769 il drawer non prende il fuoco e `ResponsiveModal` ha il suo ripristino): l'asserzione resta come
    guardia, l'intestazione della spec lo dice. (77) **La prima riga chiusa di Rendimenti resta sotto la pill a 390**
    (proprietario, interattiva; decisione 19 estesa, come la 65 e la 71): sul fixture la riga chiusa finisce a 891 contro
    767, con la curva già a 120 px — `budget.json` registra `false` con `raisedBy`, 768 `true`, 1024 informativa fino a
    MOB-08; **e le cinque metriche di Patrimonio mosse dalla deriva del giorno si allargano con `raisedBy`** (il
    precedente del ritiro di MOB-03), provate identiche sulla build di develop lo stesso giorno (§ 3.1).
  - **MOB-05 (2026-10-14, nel ritiro; proprietario, interattive).** (78) **Lo zero stampato senza segno vale anche nella
    tessera Rendimento (TWR)** (la 72 estesa alla pagina entrata nella serie): l'eroe, il chip dello scarto e il chip
    sull'altra base decidono segno, icona e colore sul valore STAMPATO — `printedSign`, `formatSignedPercentIt`,
    `formatSignedPoints` in `lib/utils/formatters.ts`, visti rossi in `__tests__/formatters.test.ts` — perché da 768 a
    1439 la tessera sta accanto alla striscia e stampava «+0,0%» in verde e «+0 pt» accanto a «0,0%» e «0 pt»; i 22 siti
    `< 0 ? '−'` fuori (il resto di Rendimenti, Storico, email, PDF, FIRE) restano, come per la 66 e la 72. (79)
    **«Analizza con AI» è disabilitato anche mentre la pagina attende o ha fallito una lettura** (`aiDisabled` guarda
    `loading` e `loadFailed`): in quei rami le metriche possono venire dalla cache persistita mentre il dialog non è
    montato — una pressione lasciava `showAIAnalysisDialog` vero e il dialog partiva, e spendeva, al ritorno del ramo
    principale (preesistente sul bottone desktop, esteso all'icona del telefono da MOB-05); nessun test lo pinna, il
    ramo è transitorio, dichiarato in doc/guide/rendimenti.md. (80) **«negli 8 mesi», «negli 11 mesi»** (`inMonths`,
    `lib/utils/performanceSummary.ts`; l'eroe, la cella della striscia, il verdetto e la finestra dell'attribuzione;
    visti rossi in `performanceSummary.test.ts` e `performanceNarrative.test.ts`): il rinvio di § 9 della spec, chiuso
    nel ritiro; `nei ${…}` di `fireNarrative.ts` (Monte Carlo) è di MOB-07 e non si tocca.
  - **MOB-06.** (39) Storico: una sola cella del Driver, «Risparmio {anno}»; il mercato resta nel ledger aperto.
    (40) Patrimonio: eroe esente (24); `'yearly'` e `'curve-end'` sollevati come MOB-03, l'euro dell'anno nel seguito (17);
    striscia G/P + Liquidità; se il census conta più di 5, cede la cella Liquidità. (41) Movimenti in lettura fallita:
    `ErrorNotice` anche a 1440. (42) Le didascalie della barra del Flusso («Quote delle spese», «Quote di quanto è
    uscito») perdono l'importo sotto `desktop:` quando ristampa una cifra del verdetto o della striscia; lo tengono con un
    disavanzo (base diversa dalle entrate) — **nel codice dalla 82, e dalla 88**: per ruolo la base in disavanzo è la spesa che il
    primo enunciato stampa, e l'importo cade anche lì.
  - **MOB-06 (2026-10-14, nella sessione di implementazione; interattive).** (81) **L'anno di Patrimonio è una frase sua nel
    seguito**, a ogni larghezza, prima del mercato: «Da inizio anno +4,10% (+4500,00 €).» — la spec diceva «fra parentesi
    dopo la percentuale, come la Panoramica» (17) e «nel seguito» (40), e il verdetto di Patrimonio non nominava l'anno;
    `patrimonioRestLabel`: «l'anno», «l'anno e il mercato del mese», «l'anno e la vendita del mese», «l'anno, il mercato e la
    vendita del mese», senza variazione annua le tre della spec. (82) **Una didascalia della barra del Flusso perde l'importo
    quando il suo TESTO è identico, in modulo, a una cifra del primo enunciato o della striscia** (`collectPrintedFigures`):
    nella vista per tipo la base è la spesa, che il lead stampa sempre — «Quote delle spese.» anche in disavanzo; «Quote di
    quanto è uscito (X €)» resta in disavanzo (X ≠ entrate) — **sbagliato, corretto dalla 88**: in disavanzo X = entrate + disavanzo =
    la spesa, che il primo enunciato stampa, e cade; la coda del disavanzo dice «il resto viene dal patrimonio» senza
    importo (ristampa la cella Risparmio). (83) **Analisi solleva anche la freccia delle spese del trio** (`expensesDeltaLifted`,
    prop additiva di `CashflowKpiTrio`): ristampa il ritmo del primo enunciato; 6 → 5 cifre fuori dal verdetto a 390, obiettivo
    raggiunto; Tracciamento non cambia. (84) **Cinque allargamenti del budget con `raisedBy`**: la prima riga chiusa sotto la pill a
    390 su Patrimonio, Analisi e Storico (decisione 19 estesa) e `tilesFullyAboveFold` 1 → 0 a 1024 su Patrimonio e Analisi (§ 3.1).
    (85) **I tetti di `perf:budget` di Patrimonio 699 → 702 e Cashflow 763 → 764**, `raisedBy` «MOB-06: …»: le primitive della
    composizione entrano nella route di Patrimonio (696,1 → 701,4) e, condivise da sei route, finiscono in un chunk comune che
    anche Cashflow carica (761,6 → 763,1); riga nel Registro di doc/guide/velocita.md. Scelte d'ingegneria, non domande aperte: «Ultimi 12 mesi» senza i dodici mesi apre
    LA tessera e non «Il perché», che senza ritmo non esiste (un bottone che non apre nulla, visto sul fixture base); l'atterraggio
    sulla Scheda decide riga o tessera al momento del timer (`COMPACT_QUERY`, esportata), perché un restauro può girare prima
    del primo render dopo l'idratazione; `PageRest` prende un `buttonId` additivo, dove «Chiudi» porta il focus senza opener;
    `formatSignedEuro` (formatters) e `formatDriverEuro`/`formatFlowAmount` (narrative) sono i formattatori che tessera e
    cella condividono, così l'identità dei test non è una copia della formula.
  - **MOB-06 (2026-10-15, nel ritiro; proprietario, interattive).** (86) **I due difetti della chip «ultimi 12 mesi» di Evoluzione si
    correggono** (proprietario: «valuta tu», corretti entrambi): sotto i 768 px, senza percentuale (patrimonio ≤ 0 dodici mesi
    prima) l'euro sollevato era tutto ciò che la chip teneva — una pillola colorata vuota sopra la didascalia: ora si nasconde
    intera, e con lei la fila se non resta altro; accanto all'euro senza segno di uno zero stampato la percentuale prendeva il «+»
    («0 € (+0,0%)»): ora `formatSignedPercentIt`, a ogni larghezza (a 1440 un cambio dichiarato in doc/guide/storico.md). Visti
    rossi in `__tests__/evoluzioneTileChips.test.ts`; la classe `>= 0 ? '+'` (51 siti) resta fuori, come per la 66, la 72 e la 78.
    Confutata alla rilettura una terza segnalazione (`formatDriverEuro` contro la cella su −0,50 €): la cella prende il `value`
    della riga del ledger, già arrotondato, e le due stampano «0 €». (87) **Il fixture mette ogni riga di un mese passato al giorno
    5** (`PAST_DAY`, `scripts/seedCensusE2E.mts`) e le cinque metriche di Tracciamento mosse dalla deriva si allargano con
    `raisedBy` (§ 3.1): la misura di chiusura del ritiro era rossa lì, identica sulla build di develop prima di MOB-06 — il
    confronto «sugli stessi giorni» del mese scorso prendeva le righe ai giorni 5/10/15/20 una alla volta; la causa che MOB-08 § 2
    doveva isolare, per questa parte, è isolata. (88) **La didascalia per ruolo del Flusso in disavanzo perde l'importo**
    (proprietario: vale il codice): la base è entrate + disavanzo = la spesa che il primo enunciato stampa, e la regola della 82 la
    toglie; la 82, la 42, la guida e il test dicevano il contrario — il test costruiva il lead senza la cifra mono; ora la
    stampa, visto rosso con `printed` ignorato (`__tests__/analisiNarrative.test.ts`).
  - **MOB-07.** (43) What If: LA tessera è Evento, prima nel DOM anche a 1440 (cella sinistra); MOB-09 riscrive la frase
    desktop di The Input Tile Rule. (44) Il vincolo del fondo è la riga d'ambito `scope` sotto `desktop:`
    (`describeFireLockScope`), la frase nel seguito. (45) Allocazione: «Fuori posizione» + lo scarto maggiore, il
    punteggio no. (46) Previdenza con due o più contribuenti: verdetto intero e nessuna striscia; con uno, `leadLength: 0`
    e le tre celle. (47) Obiettivi: nessuna striscia.
  - **MOB-07 (2026-10-15, nella sessione di implementazione; proprietario, interattive).** (89) **`budget.json` ha UNA macchina
    di riferimento, quella di questa sessione**: il census «prima» della sessione, sulla build di develop senza una modifica, era rosso su
    cinque celle `screens` di superfici che la spec non tocca (+0,02…+0,08) e nelle stesse proporzioni sulle sette di MOB-07 —
    il budget era stato stretto il mattino stesso sull'altra macchina (ritiro di MOB-06) e quella di riferimento misura
    qualche centesimo in più; le cinque allargate con `raisedBy` (§ 3.1), d'ora in poi `--tighten` da quella (doc/guide/prima-schermata.md § Per-page
    blind spots). (90) **La prima riga chiusa sotto la pill a 390 su tutte e sei le superfici con righe** («Allarga tutte e
    sei»): Bilanciamento ed Evento non hanno una curva (decisione 19); Previdenza, Calcolatore, Coast e Monte Carlo la hanno
    già a 120 px e LA tessera finisce comunque oltre — decisione 19 estesa, come la 65, la 71, la 77 e la 84; Obiettivi è sopra
    (`true`). (91) **Le cifre fuori dal verdetto e le tessere sopra la piega mosse dalla composizione si registrano come
    misurate** («registra il misurato»): Allocazione 16, Previdenza 9, Calcolatore 10, Coast 12, Obiettivi 9 a 390 — le
    letture e le legende restano intere (decisioni 15 e 16); «≤ 5» dichiarato non raggiunto su quelle cinque; Previdenza a
    768 passa da 3 a 1 tessere sopra la piega (la striscia di tre celle). (92) **Il tetto di `perf:budget` di Patrimonio 702 →
    703**, `raisedBy` «MOB-07: …»: la route non importa nulla di MOB-07; con le primitive della composizione su nove route
    Turbopack riequilibra i chunk comuni (Patrimonio 701,4 → 702,8, Analisi 645,2 → 646,6, Storico 768,6 → 769,2, sotto i
    loro tetti; le tre route della spec +4,4 · +4,6 · +5,7, sotto i loro) — riga nel Registro di doc/guide/velocita.md, come la
    85. **Le parole scelte** (interattive, prima di toccare le pagine): i `restLabel` dei quattro builder FIRE nominano il
    contenuto — Calcolatore «le spese da allora», Coast «il ritmo», What If «il Coast FIRE» (senza evento «come simulare»),
    Monte Carlo «orso e toro» — con « e il fondo pensione» in coda quando la frase del vincolo segue (lista italiana: «orso,
    toro e il fondo pensione»), «il fondo pensione» sola; le aside delle righe chiuse di FIRE: Base «spese, risparmio e SWR»,
    Reddito «al tasso di prelievo», Scenari «orso, base e toro», Afflussi «pensioni e fondo», Scenari Coast «rendimento
    reale», Prima e dopo «le due traiettorie», Delta «prima → dopo», Sensibilità «spese e risparmio», Distribuzione «valori
    finali», Scenari MC «orso, base e toro», Parametri «il piano di oggi» / «modificati: premi Esegui», Traiettoria il nome
    dell'obiettivo, Milestone «al ritmo attuale», Allocazione derivata «gap × priorità», Assegnazioni «N strumenti · N quote»;
    le righe dei rami vuoti «non ancora calcolabile». Scelte d'ingegneria, non domande aperte: la cella «Datore» di
    Previdenza su un fondo non assegnato dice «fondo non assegnato»; «Da allora …» del Calcolatore è frase propria anche a
    1440 (decisione 5); `cutAtFirstSentence` taglia al primo segmento che finisce con «.»; `FireLockScope` in un modulo suo
    (le tab pigre non tirano il Calcolatore nel chunk); `useInstrumentProfilesState`, un osservatore `enabled: false` sulla
    chiave dei profili, dà alla pagina `isError`/`refetch` senza leggere; le Ipotesi di Coast perdono gli `order-*` con la
    pagina (Modello secondo sul telefono: l'ordine del DOM e del Tab, decisione 11). Nessun giro guidato F finché i passi
    automatici non sono chiusi (proprietario, 2026-10-15). (93) **Niente che identifichi il proprietario o il suo conto nel
    repo** (pubblico): le sedici critiche Impeccable di `.impeccable/critique/`, scritte sul mirror, redatte — 74 importi
    a quattro cifre e oltre «x.xxx €», il conto «Banca X», un cognome del nucleo sostituito da un nome di fantasia anche nei
    fixture che lo riprendevano (15 file: il seed di Divisione e del census, i test, le spec, le guide); le macchine non si nominano più (né modello, né memoria, né il nome di un sistema: «la
    macchina di riferimento» e «l'altra»), restano i sistemi operativi dove una trappola degli strumenti li richiede (Git
    Bash, PowerShell, i CRLF). La storia di git le conserva: riscriverla è una scelta del proprietario, fuori sessione.
  - **MOB-07 (2026-10-16, nel ritiro; proprietario, interattive).** (94) **Le quattro celle rosse sulla build mergiata si
    allargano con `raisedBy`** (Patrimonio 1024, Budget 768, Previdenza 1024 `screens` +0,01; Allocazione 1024 una tessera intera in
    meno), tre corse identiche sulla macchina di riferimento un giorno dopo il `--tighten`: la differenza fra le due macchine della 89
    è una deriva di ±0,01–0,02 per cella in entrambi i versi, e i `raisedBy` sovrascritti dal `--tighten` tornano concatenati (§ 3.1).
    (95) **Lo zero stampato senza segno vale anche nel verdetto di Previdenza** (la 20, come la 66, la 72 e la 78): `signedPct` di
    `pensionNarrative.ts` decide sul testo (`printedSign`) — stampava «+0,00%» verde accanto alla cella «0,00%»; visto rosso in
    `__tests__/pension{Summary,Narrative}.test.ts`; i 50 siti `>= 0 ? '+'` fuori (il chip del mese di Il fondo oggi compreso) restano.
    (96) **«Fisco nel {Y}, circa · solo TFR»** quando l'anno ha versamenti ma nessuno deducibile (la riga Versato accanto li elenca);
    «nessun versamento» solo senza versamenti; «nessun beneficio» (scelta d'ingegneria) con un deducibile senza risparmio. (97) **La
    prima cella di What If senza direzione sul caso invariato**: «Patrimonio FIRE oggi», tono neutro, come «Al FIRE di oggi» — diceva
    «sale» sopra «invariato», una parola che nessuna frase stampa; visto rosso in `whatIfSummary.test.ts`. (98) **Il verdetto di Monte
    Carlo segue il run mostrato** finché un run esiste, «non calcolabile» solo senza run: il form digitato a zero negava nella testata
    le celle che la striscia stampava (preesistente a 1440 fra verdetto e tessere; MOB-07 l'ha portato nel verdetto); visto rosso in
    `monteCarloNarrative.test.ts`. (99) **La cella «Fuori posizione» dice «nulla» solo quando la lettura lo stampa**
    (`isNothingOutOfPosition`, UN predicato con `describeBalance`): con patrimonio in classi senza target o un gap di leva la lettura
    dice «lo 0,0% è fuori posizione e …» e la cella stampa quello 0,0%, sollevato; visto rosso in `allocazioneSummary.test.ts`. (100)
    **Nei rami vuoti il controller non conosce righe** (`NO_SECTIONS`: Allocazione senza asset, Previdenza senza fondo, What If senza
    base, come Monte Carlo e Obiettivi): `resolveAllocazioneSections` e `resolvePensionSections` escono dai componenti in
    `allocazioneSummary.ts` e `pensionSummary.ts`, con `hasRows`/`hasFund`, e i test li tengono — la mappa `failed` di Previdenza,
    «provata in Vitest» per la spec e per la guida, non era pinnata da nulla (`resolvePensionSections` era privata del componente).
    Scelte d'ingegneria, non domande aperte: una sola soglia `SURPLUS_FLOOR` per la frase «raggiunge» e la cella «raggiunto» di Coast
    (erano due copie di 0,5); le aside delle righe chiuse delle sette superfici pinnate (`toEqual`, nessuna cifra); il test del render
    di `BilanciamentoTile` (`__tests__/bilanciamentoTileLifted.test.ts`: la spec a 390 gira sul fixture base, dove la cella è «nulla»
    e nulla si solleva — il ramo «nascosto» della E2E non correva); l'E2E dell'«Aggiorna» fallito con i profili letti; le prove
    `order-*` dalla `classList` e dall'ordine verticale su Calcolatore, What If e sulle Ipotesi di Coast; le quattro prove a 1440 viste
    rosse con `compact` ignorato e la falsificazione «scope anche a 1440» registrata nella spec che la vede (`fire.spec.ts`, non la
    mobile); la riga d'ambito nei rami senza frase del vincolo (Nulla registrato, non calcolabile, Monte Carlo senza run) dichiarata
    nelle guide; Previdenza 1,96 e Monte Carlo 1,83 oltre l'obiettivo di § 2 della spec, dichiarate (§ 3.1).
  - **MOB-08.** (48) Il trigger della barra in orizzontale a 44×44 (`size-11` + `py-1`, barra 53 px, prima schermata 715).
    (49) A 1024 al più 6 righe chiuse accanto a LA tessera (`MAX_BESIDE_ROWS = 6`), le altre sotto su tre colonne; accanto
    stanno solo le chiuse che precedono la prima aperta, da lei in poi tutto va sotto in ordine DOM (da 1); flusso
    `sparse`, mai `dense` (da 1). (50) iPad 12,9" in verticale (contenitore 992 px): tre colonne con la pill; lo skeleton
    generico resta a due colonne. (51) Il criterio «`screens` a 1024 ≤ `screens` a 768» è sostituito da «`screens` a 1024
    ≤ il valore di `budget.json` a 1024 com'è nato il 2026-10-10 (§ 3.1)» per ogni superficie composta: è il tetto che
    `mobile:budget` già tiene sul fixture. **Riscritta il 2026-10-10 nel ritiro di MOB-01** (proprietario): la forma
    precedente, «≤ la baseline del 2026-09-26 a 1024 (§ 3)», confrontava il fixture sulla build con il mirror sul dev
    server — che la serie dice di non confrontare — e il fixture la superava già su Centri (1,76 contro 1,74), Divisione
    (1,62 contro 1,55) e Impostazioni (1,70 contro 1,68).
  - **MOB-01 (2026-10-10, nella sessione di implementazione).** (58) **I record di Hall of Fame del fixture li costruisce
    il server**: `mobile:census` chiama `POST /api/hall-of-fame/recalculate` dopo il seed (un seed Admin non può
    importare i builder, che portano dentro l'SDK client). (59) **Il fixture non si misura dal 1 al 4 del mese né
    l'ultimo giorno** (ora italiana): le righe del mese stanno al 5 e il Budget non prevede prima del giorno 4;
    l'ultimo giorno la riga in calendario scade. `mobile:census` esce 1 con il perché.
  - **MOB-01 (2026-10-10, nel ritiro).** (60) **Il fixture misura ogni opzione nel suo stato di default, Obiettivi
    compresi**: FIRE › Obiettivi è spento (`goalBasedInvestingEnabled: false`, verdetto «Gli obiettivi non sono attivi»),
    quindi il budget non guarda la composizione delle righe `goals-*` di MOB-07; MOB-07 accende gli obiettivi nel seed
    (`scripts/seedCensusE2E.mts` entra nel suo § 5) con un obiettivo inventato e rimisura `fire-obiettivi` con
    `--tighten` — **fatto il 2026-10-15** (il seed ha Obiettivi acceso con un obiettivo; § 3.1). (61) **Quattro difetti degli script corretti nel ritiro**, con i test visti rossi: la guardia Yahoo
    rifiuta davvero (`yahooCalled` a livello di corsa, letto anche nel giro di riscaldamento; `mobile:budget -- --tighten`
    lo rifiuta e il census esce 1 sul fixture); una chiave di `--surfaces` o un `--viewports` ignoti escono 1 con
    l'elenco delle valide (prima: 0 misure in silenzio e `last-run.json` sovrascritto); `--tighten` rifiuta una corsa
    parziale (prima scriveva `budget.json` e poi andava rosso su «non misurata»); il report registra lo stato
    dell'interruttore 50/30/20 (`spendingRoles` nella diagnostica di Analisi), promesso per il mirror e mai scritto.
    Il draft delle release non porta la riga «dev» (WORKFLOW.md § Where things are recorded). Nessun giro guidato F
    (proprietario, 2026-10-10).
  - **MOB-09.** (52) Il testo delle quattro regole lo applica Claude verbatim in DESIGN.md e nel sidecar, dopo l'OK del
    proprietario sul testo nella sessione MOB-09. (53) Critiche Impeccable: nuove per Panoramica, Tracciamento,
    Rendimenti e Hall of Fame; le altre dodici cancellate nello stesso commit, rifatte da `polish` in sessioni successive
    — **tutte e sedici redatte il 2026-10-15 in MOB-07** (decisione 93): erano scritte «live sul mirror» e stampavano
    cifre e conti del conto reale in un repo pubblico; gli importi a quattro cifre e oltre sono «x.xxx €», il conto «Banca X».
    (54) `components.tile-closed-row` entra nel frontmatter di DESIGN.md (i colori di `tile-default`, `rounded:
    "{rounded.2xl}"`, `height: "52px"`, `padding: "0 20px"`). (55) Nel Draft una voce per pagina, riscritta nello stato
    finale, più una di 📚 Documentation. (56) Il giro F di MOB-09 si fa con DevTools a 390 e 1024 sul
    mirror (l'app degli emulatori si collega a 127.0.0.1: un telefono non entra); la riga in errore con uno script
    Playwright usa-e-getta. (57) Le critiche si scrivono dalla macchina di riferimento (WORKFLOW § Where things are recorded).

## 10. Domande aperte al proprietario

Nessuna: le 49 domande della lettura adversariale del 2026-10-10 sono chiuse in § 9 (decisioni 9–57), le due della
sessione MOB-01 sono le decisioni 58 e 59, le due del suo ritiro 60 e 61 (con la 51 riscritta), le tre del ritiro di MOB-02 62–64, quella
della sessione MOB-03 65 (e la 66 del suo ritiro), le quattro della sessione MOB-04 67–70 (e le cinque del suo ritiro
71–75, con la 34 e la 68 annotate), le due della sessione MOB-05 76 e 77 (e le tre del suo ritiro 78–80, con la 38 annotata), le cinque della sessione MOB-06 81–85 (con la 42 annotata) e le tre del suo ritiro 86–88 (con la 42 e la 82 annotate), le cinque della sessione MOB-07 89–93 e le sette del suo ritiro 94–100 (con la 60 e la 89 annotate), e ogni spec scrive la sua risposta come istruzione. Una domanda nuova nasce solo da un fatto che una sessione di implementazione
scopre nel codice, si pone subito al proprietario con lo strumento interattivo e la risposta si aggiunge qui.
