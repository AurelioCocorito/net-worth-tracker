---
target: composizione tablet di Panoramica e Tracciamento (768/1024)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\Giuseppe\\Documents\\Github\\net-worth-tracker\\app\\dashboard\\page.tsx"
target_fingerprint: "sha256:821f16daff09ddb526b59f0600d55d853ab4c7f6278e16f5ed1d06a10f5f0db7"
target_path: "C:\\Users\\Giuseppe\\Documents\\Github\\net-worth-tracker\\app\\dashboard\\page.tsx"
timestamp: 2026-10-16T08-56-28Z
slug: app-dashboard-page-tsx
---
Method: dual-agent (A: design review · B: detector + browser), fixture `census@example.com`, Playwright (estensione Chrome non disponibile). Superficie: la composizione TABLET (768×1024, 1024×768) di Panoramica e Cashflow › Tracciamento (MOB-08, non committata).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Chevron e `aria-expanded` chiari; a 1024 aprire sposta la riga e scorre la pagina, e il «dove è andata» non si vede |
| 2 | Match System / Real World | 3 | Etichette italiane buone; «Il resto della pagina» nomina l'interfaccia, non il contenuto |
| 3 | User Control and Freedom | 2 | Un tocco sposta la card, svuota la colonna e scorre la pagina: si perde il senso del posto |
| 4 | Consistency and Standards | 2 | La stessa card si apre sul posto a 768 e si sposta a 1024; le righe stanno accanto o sotto a seconda di cosa è aperto prima |
| 5 | Error Prevention | 3 | Niente di distruttivo |
| 6 | Recognition Rather Than Recall | 2 | Le aside chiuse dicono l'ambito, non la risposta: tutto dietro un tocco su un canvas che avrebbe spazio |
| 7 | Flexibility and Efficiency | 2 | Non si vedono Spese ed Entrate affiancate a 1024 (a 1440 sì); «Apri tutte» dà una colonna di 3062 px |
| 8 | Aesthetic and Minimalist Design | 2 | Vuoti grandi (446×323 px in colonna 3), tessere aperte a 992 px rade, striscia del telefono stirata, cifre ripetute |
| 9 | Error Recovery | 3 | Letture fallite come righe rosse con un solo nodo live |
| 10 | Help and Documentation | 3 | «Il perché» e «Come si calcola» |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict

Metà specifica: verdetto, striscia e LA tessera sono di questo prodotto e reggono sul tablet; il resto è la composizione del telefono rimessa in griglia (righe chiuse da 52 px, «Il resto della pagina», contenuti nati per ≤ 460 px stirati a 992), e legge come una dashboard a fisarmonica generica. Detector: 0 rilievi statici sui cinque file; nel browser 29–36 rilievi per pagina, tutti fuori ambito o falsi positivi (la scala 9–11 px del design system, `nested-cards` su ogni tessera senza un antenato con bordo, la shell); nessun difetto del detector specifico del tablet.

## Priority Issues

- **[P1] Aprire una riga accanto a LA tessera la teletrasporta sotto e svuota la colonna 3.** Panoramica 1024, Sintesi aperta: colonna 3 vuota da 413 a 859 (446×323 px, il 44% dell'area di LA), «Il resto della pagina» orfano, la pagina scorre e taglia LA in alto; Tracciamento, Entrate aperta: 345 px vuoti. Area vuota della griglia 20–23% (B). È la segnalazione del proprietario. Fix: le righe si aprono sul posto nella colonna e non si spostano mai. Command: layout.
- **[P1] Le tessere aperte a 992 px sono rade.** Sintesi 992×303 per tre righe etichetta/valore (valori a ~800 px dalle etichette), Obiettivo 992×236 per una barra di ~160 px, Entrate una barra su 992. Fix: mai un'aperta a tutta larghezza a 1024 — la larghezza della colonna (~360 px) o due affiancate. Command: adapt.
- **[P2] Costrutti del telefono stirati.** Striscia di tre celle disposta 1 + 2 («Questo mese» da sola su ~900 px); la settima riga orfana (a 1024 due terzi della riga vuoti, a 768 metà); a 768 una chiusa sola accanto al posto di un'aperta (362×54 px). Command: adapt.
- **[P2] La divulgazione è applicata troppo al tablet.** Sette card da 52 px di pari peso con aside senza cifre: 1024 mostra una tessera dove 1440 ne mostra sei. Command: shape.
- **[P3] Cifre ripetute quando LA tessera è intera.** Tracciamento: entrate/spese/risparmio nella striscia e nel trio sullo stesso schermo, e la frase con spese diverse dalla cella (la differenza del calendario). Fix: sopra 768 togliere la striscia quando LA è nella prima schermata, o estendere The Lifted-Figure Rule al tablet. Command: distill.

## Persona Red Flags

- **Alex (power user)**: deve premere «Apri tutte» e ottiene una colonna unica di 3062 px; non può affiancare Spese ed Entrate, che a 1024 ci starebbero.
- **Sam (accessibilità)**: lo scroll programmatico all'apertura disorienta chi usa l'ingrandimento; il trigger cambia posto tra chiuso e aperto, senza movimento con reduced motion; l'heading «Il resto della pagina» resta visivamente senza nulla sotto; a 768 la pill copre la seconda coppia di righe nella prima schermata.
- **L'investitore sul divano con l'iPad in orizzontale**: tocca Sintesi per vedere la quota liquidabile, il grafico che stava leggendo scorre via e la colonna destra diventa bianca.

## Minor Observations

- L'aside di una riga aperta scende su una riga sua dentro il pannello a 992 px (~30 px per tessera).
- «Il perché» ha l'etichetta a x≈355 e il chevron a x≈928, scollegati.
- Bersagli sotto 44 px nella testata (non nella griglia): «Crea snapshot» 140×36, i chip 1A/3A/All larghi 39–41 px, «Impostazioni Spese» 36×36.
- `tight-leading` sul sottotitolo del PageHeader di Cashflow (1,25).

## Questions to Consider

- Un iPad orizzontale a 1024 è un telefono grande o un desktop piccolo? Il contenuto è l'87% della larghezza utile di 1440, che mostra sei tessere aperte.
- Se l'aside di una riga chiusa portasse la risposta («13,2% liquidabile») invece dell'ambito, la colonna diventerebbe un riassunto: la regola «nessuna cifra nelle aside chiuse» deve valere anche al tablet?
- Il proprietario apre mai più di una card alla volta sul divano?

## Directions

- **D1 — La colonna resta** (la richiesta letterale): a 1024 tutte le righe stanno nella colonna destra (~360 px) e si aprono sul posto; LA tessera `sticky`; niente scroll programmatico. Rispetta la decisione 1, tiene tutte le primitive, cancella `flushSync`/doppio reveal/`MAX_BESIDE_ROWS`. Calma, non densa.
- **D2 — Desktop piccolo**: a 1024 (e 768) il bento di 1440 compresso a tre/due colonne, tutto aperto, nessuna riga chiusa. Il più ricco; riapre la decisione 2 (una sola composizione «schermo piccolo») e i budget 768/1024.
- **D3 — Indice + palco**: la colonna destra è un indice; la sezione scelta appare in un palco sotto LA tessera, una alla volta. Nuova primitiva (tabs), rompe il contratto `isClosedRow` del censimento; il costo più alto.
