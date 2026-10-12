# Il prompt di ritiro di una spec MOB

> Il prompt che il proprietario incolla per ritirare UNA spec di questa serie dopo che il suo codice è in `develop`
> (WORKFLOW.md § 3 «Where things are recorded»: una spec si ritira in una sessione sua). Compilato il 2026-10-10,
> rimisurato il 2026-10-12 dopo i ritiri di MOB-01..03: ogni segnaposto del corpo è sostituito con ciò che il repo dice,
> e ogni conteggio, numero di riga, totale o «nessuna ancora» è scritto come il COMANDO che lo misura (`grep`, `wc`),
> non come il valore di un giorno — i valori scritti invecchiavano a ogni ritiro (il tagliando del 2026-10-12 ne trovò
> tre falsi). Chi lo usa dopo un cambiamento della serie aggiorna i precedenti e lascia il corpo com'è. Il ritiro
> dell'ULTIMA spec porta via la cartella intera, questo file compreso (passo 4). Le quattordici spec PERF non avevano
> un file così: i loro ritiri sono in `git log --grep=retire -i`, e la regola è in WORKFLOW.md.

```text
SPEC DA RITIRARE: doc/mobile/MOB-NN-nome.md      <- l'unico punto da compilare

Ritira la spec scritta qui sopra. Nel resto di questo prompt <SPEC> è quel percorso, <NN>
il suo numero e <SLUG> il resto del nome senza «.md»: ricavali tu, non chiedermeli. Se il
file non esiste, FERMATI e dimmelo prima di fare qualsiasi cosa.

PREREQUISITO, da misurare e non da assumere: la spec è IN ESERCIZIO, cioè la sua PR è
MERGIATA IN `develop`, il branch di integrazione della serie (WORKFLOW.md § 3 «Where things
are recorded», paragrafo «Branches», 2026-10-12: le spec `doc/mobile/` atterrano su `develop`
una sessione per volta e vanno in `main` insieme dopo il ritiro dell'ultima, con la PR del
proprietario) — il numero
della PR e la data si leggono in `git log --first-parent develop --format="%h %ad %s"
--date=short`, e la riga di stato li scrive come le PERF («PR #NNN in develop dal <data>») —
E la MISURA DI CHIUSURA della spec è rifatta sul codice mergiato: `npm run mobile:census --
--email=census@example.com` e poi `npm run mobile:budget` verdi sulla build `perf:build`
servita da `perf:serve` su :3200 con gli emulatori accesi (doc/guide/prima-schermata.md;
doc/mobile/README.md § 8), dal 5 al penultimo giorno del
mese (README § 9, decisione 59), con la riga di README § 6 e la tabella § 3.1 aggiornate
dalla sessione che ha implementato (README § 7, ultimo punto: «ogni spec dichiara la sua
misura in § 2 (`mobile:budget`) e la riporta qui»). NON sono segnali: il deploy su `main` o
su Vercel (arriva dopo l'intera serie: la misura è su `develop`, non in produzione), l'uso
vero del proprietario dal telefono, il giro F sul mirror della sessione di implementazione.
Il caso reale NON è un prerequisito: dove è a portata di giorni lo si cerca e lo si scrive,
ma non lo si aspetta mai — ciò che l'uso vero insegnerà diventa feedback e poi una spec
nuova, e quando il caso arriva si annota nella riga di stato della spec ritirata, come
storia. Il collaudo della sessione di implementazione vale come prova della spec, non
come segnale. DDL: nessuno — la serie non tocca `firestore.rules` né `firestore.indexes.json`
(si deployano a mano, `firebase deploy --only firestore:rules` / `firestore:indexes`, in
SETUP.md: `grep -n "firestore:rules\|firestore:indexes" SETUP.md`) e non scrive migrazioni dati (le one-shot del repo girano alla prima visita
di una pagina, `lib/services/loanMigration.ts` e `app/dashboard/assets/page.tsx`, e sono
del 2026-10-10, fuori serie: il censimento le attraversa nel giro di riscaldamento,
doc/guide/prima-schermata.md § La corsa); l'unica persistenza nuova della serie è `localStorage` per dispositivo
(`mobile-sections:<route>[:<tab>]`, MOB-02; README § 9), che non si deploya e non si migra.
Lo si prova con `git diff <base>..<merge> -- firestore.rules firestore.indexes.json` vuoto
e con `grep -n -i -E "firestore\.rules|indexes|migrazion" doc/mobile/*.md` letto riga per
riga: una migrazione nominata come trappola che il censimento attraversa non è DDL della
serie, una regola, un indice o una migrazione che la spec SCRIVE lo è; se la spec ne porta
uno, la clausola non vale: FERMATI e chiedi. Se un criterio non
regge, un segnale manca o uno script non è stato
speso, FERMATI e dillo: una spec si ritira intera, mai a metà, e non si ritira una spec
la cui implementazione ha lasciato un «da decidere».

LETTURE OLTRE AL PROMPT STANDARD (WORKFLOW.md, AGENTS.md, CLAUDE.md, COMMENTS.md,
DEVELOPMENT_GUIDELINES.md, la guida del dominio): README.md § Documentation · l'indice
della serie per intero · la spec INTERA, compresa l'intestazione con lo stato scritto
dalla sessione che l'ha implementata e le divergenze dichiarate lì · `git log
--format="%h %s" -- <SPEC>` · i precedenti da imitare (`git log --grep=retire -i
--format="%h %ad %s" --date=short` li elenca tutti): adc2572 (2026-10-11, MOB-03: l'ultimo
ritiro con la serie ancora viva E l'ultimo che ha corretto codice a runtime — un workflow
in sola lettura sui criteri, lo zero firmato corretto su decisione del proprietario (README
§ 9, 66) e visto rosso in Vitest, due asserzioni promesse aggiunte, una decisione presa in
sessione rinumerata ovunque perché il suo numero era già di un'altra spec, ogni «MOB-03» in
codice, test e guide riscritto in loco con la data, le spec sorelle ripuntate al codice,
Playwright intero e `mobile:census` + `mobile:budget` rifatti prima e dopo il fix) ·
6ade54d (2026-10-10, MOB-02: tre difetti a runtime ciascuno visto rosso prima del fix, ogni
citazione delle sezioni della spec in codice, test, script e guide riscritta in regola +
data, le spec vive ripuntate al codice, Playwright intero) · 9d39c10 (2026-10-10, MOB-01:
lo strumento di misura — quattro difetti degli script di sviluppo, i rinvii scritti nelle
spec eredi, la riga di § 6 nella forma ritirata, nessun Playwright perché l'app non era
toccata) · f2d4ec3 (2026-10-08, PERF-14: l'ultimo che ha chiuso una serie con il suo
indice — la cartella doc/perf/ cancellata, perf/README.md → doc/guide/velocita.md con `git
mv` e gli stessi nomi di sezione, le lezioni del dossier in AGENTS.md, WORKFLOW.md e
SETUP.md, la riga di README.md § Documentation riscritta, le spec sorelle al presente).
Ogni riferimento
nel codice a un documento ritirato si riscrive in loco perché il perché resti in piedi
da solo, tenendo le date.

ORDINE DI LAVORO

1) VERIFICA CRITERIO PER CRITERIO, prima di cancellare qualsiasi cosa: per ogni criterio
   di accettazione, esiste nel codice? e la prova è quella che il criterio nomina (il test
   con la sua prova di portanza, la misura del collaudo)? Le decisioni sono state
   rispettate una per una, e le scelte «ribaltabili» sono rimaste com'erano o il
   ribaltamento è scritto? Le divergenze dichiarate sono ancora vere? La documentazione
   della spec è stata fatta (guide, README, CLAUDE.md, i totali rimisurati)? E ogni
   RINVIO («la spec successiva lo eredita», «fuori ambito, dichiarato») ha un erede: il
   codice, una spec viva per esteso, l'indice o CLAUDE.md § Known Issues (Active).
   ⚠️ La verifica si fa CON UN WORKFLOW, in sola lettura e tutto Opus: un agente per
   gruppo di criteri, uno per le decisioni e le scelte, uno per la documentazione e i
   rinvii, uno per i contratti condivisi; a ciascuno la lista e la richiesta di
   percorso:riga per ogni voce, mai una conferma; poi un verificatore per segnalazione.
   Sotto i dieci agenti, nessuno scrive file. I punti che reggono li rileggi in proprio
   prima di correggere; correzione, travaso e tutto ciò che segue li fai tu.
   ⚠️ Una divergenza si CORREGGE o si SCRIVE, mai si accetta in silenzio: è l'ultima
   occasione, dopo il testo sparisce.
   ⚠️ Un difetto trovato: prima la sua CLASSE con un grep su tutto il repo; ogni fix
   vuole il test che lo fissa, provato portante rimettendo il difetto.
   ⚠️ I CONTRATTI CONDIVISI: ciò che questa spec doveva creare per le successive esiste
   con QUEL nome e quella firma? Se no, si aggiornano l'indice e OGNI spec viva che lo
   cita (testo e prompt in fondo).

2) MISURA I RIFERIMENTI, non stimarli: sempre con `--exclude-dir=node_modules
   --exclude-dir=.next --exclude-dir=.next-perf --exclude-dir=.next-e2e --exclude-dir=.git
   --exclude-dir=.mobile-census`, e ogni conteggio va nel riassunto finale, mai qui — (a) il
   numero: `grep -rn "MOB-<NN>" .`, per file con `grep -rc "MOB-<NN>" . | grep -v ":0$"`:
   fuori da `doc/mobile/` sono codice, test, script e documenti del repo, dentro sono
   l'indice, le spec sorelle, questo prompt e la spec stessa; dopo il ritiro ne restano solo
   le etichette elencate sotto; (b) il percorso: `grep -rn "doc/mobile/<SPEC senza
   cartella>" .` e `grep -rln "doc/mobile" . | grep -v "^./doc/mobile/"` (i file di codice,
   test e script che citano la cartella, oltre a CLAUDE.md, AGENTS.md, WORKFLOW.md, README.md
   e le guide); (c) il titolo a parole, in italiano e in inglese: `grep -rn -i -E "<le parole
   del titolo>|<la loro resa inglese>" .` (per MOB-01 erano «censimento in repo», «budget
   della prima schermata», «first-screen census», «first-screen budget»); (d) gli ORFANI
   NUMERICI, cioè una decisione, una sezione o una tabella citate col numero senza il
   documento che le numera: `grep -rn -E "README § ?[0-9]|§ 9|decision[ei]? [0-9]+|decisions?
   [0-9]+|§ 3\.1|§ 4\.[0-9]|MOB-0[0-9] § [0-9]" scripts lib __tests__ e2e components app` e lo
   stesso su CLAUDE.md, AGENTS.md, WORKFLOW.md e doc/guide/: quelli verso README § 9, § 3.1 o
   § 5 restano validi finché vive l'indice e si riscrivono in regola + data nel ritiro della
   spec che li ha generati, o il giorno dell'ultima; quelli verso un § della spec che si
   ritira si riscrivono ORA; (e) `doc/mobile/budget.json` NON è documentazione ma un
   artefatto vivo: `grep -rn "doc/mobile/budget.json" .` dà i suoi lettori
   (`scripts/mobileBudget.mts` con `BUDGET_PATH` e il `git show HEAD:`,
   `scripts/mobileCensus.mjs` per le superfici, `__tests__/mobileSurfaces.test.ts`) e le
   frasi che lo nominano; finché vive l'indice resta dov'è. Le ETICHETTE DELLA SERIE che
   restano vive finché vive l'indice, da rileggere con `grep -rn -E "MOB-[0-9]{2}" CLAUDE.md
   AGENTS.md WORKFLOW.md README.md doc/guide scripts lib __tests__ e2e components app`:
   `MOB-NN` nelle intestazioni e in § 5/§ 6/§ 9 dell'indice; `raisedBy: "MOB-NN: perché"`
   dentro `budget.json` e nei suoi lettori (README § 9, decisioni 19 e 22: una voce
   allargata porta la spec che l'ha allargata — è un dato, non un rimando); la spec fra
   parentesi accanto a una data («since 2026-10-12 (MOB-04)» in AGENTS.md § 3, «(MOB-01)»
   nella riga del fixture di WORKFLOW.md § 3), che dice quando e da quale spec, non rimanda a
   un testo; un rimando per percorso a una spec ANCORA VIVA (`grep -rn "doc/mobile/MOB-"
   scripts lib __tests__ e2e components app`) resta fino al ritiro di QUELLA spec. Tre
   categorie, tre trattamenti: CODICE,
   TEST e COMMENTI → riscritti in loco, veri e autosufficienti senza il documento, con
   le date; SPEC ANCORA VIVE → ripuntate al codice (percorso e nome verificati adesso),
   alla guida o alla regola dove la decisione ora vive; SPEC che la citano come
   appuntamento («dopo la NN») → lasciate.

3) TRAVASA ciò che è ancora operativo, prima di cancellare: il perché di una scelta,
   una decisione precedente RIBALTATA con la data, un limite dichiarato, una trappola
   misurata al collaudo. Un pezzo in UN posto solo: una regola che vale su tutto il repo
   → AGENTS.md, come RULE + DATE + WHERE IT IS PINNED (§ 0; per la serie: § Tailwind
   Breakpoints and Responsive Layout, § Navigation, § Hierarchy, Density and Disclosure,
   § Accessibility, § Performance tooling, § Commands); una regola di UNA pagina → la sua
   guida `doc/guide/<tema>.md`, nella sezione «## Composizione mobile» che MOB-09
   uniforma e che la spec della pagina crea (README § 9, decisione 11: ogni guida dichiara
   l'ordine in § Composizione mobile; quali l'hanno già: `grep -ln "^## Composizione mobile"
   doc/guide/*.md`) e, per ciò
   che sembra un bug e non lo è, nei suoi § Per-page blind spots; lo strumento di misura, le
   colonne, il ratchet e il fixture → doc/guide/prima-schermata.md (§ Il censimento e
   § Files); gli account e le trappole del collaudo → doc/guide/e2e-emulatori.md
   e la tabella dei fixture di WORKFLOW.md § 3; le invarianti → il test che le pinna
   (`__tests__/<modulo>.test.ts`, con l'intestazione che dice quale falsificazione l'ha
   vista rossa) e la riga «Suites to run after a change here» del § Files della guida; le
   quattro regole nominate e i token → DESIGN.md e `.impeccable/design.json`, SOLO per mano
   di MOB-09 e dopo l'OK del proprietario sul testo (README § 9, 52 e 54: mai rigenerare
   DESIGN.md); lo stato del progetto → CLAUDE.md «Latest» e § Testing; ciò che l'utente vede
   → README.md (le funzioni) e la riga di README.md § Documentation (la storia della serie,
   il giorno dell'ultima); il perché di UNA riga → il commento a quella riga, in inglese,
   con la data e senza il nome della spec (COMMENTS.md). Il giorno dell'ULTIMA spec, il
   contenuto ancora operativo di README.md della serie va ciascuno in UNA casa: la tabella
   del mirror del 2026-09-26 (§ 3) e la tabella del fixture (§ 3.1, quella che le spec
   aggiornano) → doc/guide/prima-schermata.md (come la baseline PERF del 2026-09-26 è
   § Baseline storica di velocita.md, f2d4ec3); le decisioni di § 9 che
   vincolano ancora il codice → AGENTS.md (regola + data) o la guida della pagina; la
   tabella dei moduli condivisi di § 5 → le guide delle aree che li usano, per nome; § 8
   «Come si rimisura» → prima-schermata.md (oggi già lì: si verifica che non manchi nulla); § 4 le
   tre direzioni e la scelta → README.md § Documentation come storia, con le date;
   `doc/mobile/budget.json` SI SPOSTA e non si cancella mai: la casa proposta, imitando la
   serie PERF (`perf/budget.json` e `perf/routes.json` stanno in `perf/`, fuori da `doc/`),
   è `perf/mobile-budget.json`, con `BUDGET_PATH` e il `git show HEAD:` di
   `scripts/mobileBudget.mts`, `BUDGET_PATH` di `scripts/mobileCensus.mjs`, il `resolve`
   di `__tests__/mobileSurfaces.test.ts` (`grep -n "doc/mobile/budget.json"` dà le righe) e ogni frase di CLAUDE.md, AGENTS.md,
   prima-schermata.md e dei commenti che lo nomina mossi NELLO STESSO commit, `git mv` per tenere
   la storia, e `grep -rn "doc/mobile/budget.json" .` a zero prima del commit;
   `doc/mobile/reference/mobile-census.mjs` (lo script usa-e-getta della baseline) se ne va
   con la cartella, `git log -- doc/mobile/reference/` è il suo archivio, e
   l'intestazione di `scripts/mobileCensus.mjs`, se lo cita ancora per percorso (`grep -n
   "reference" scripts/mobileCensus.mjs`), passa a citarlo per data (2026-09-26) e per `git log`. Sostituire, mai
   accumulare. Il prompt, il modello e l'effort in fondo alla spec NON si travasano.

4) CANCELLA la spec (`git rm <SPEC>`): testo, criteri, stato e divergenze restano in
   `git log`, che si cita come archivio. L'indice RESTA finché vive un'altra spec della
   serie.
   ⚠️ SE È L'ULTIMA SPEC DELLA SERIE, si ritira la CARTELLA INTERA — l'indice, il README,
   i file di riferimento, questo stesso prompt — e PRIMA di cancellarla tutto ciò che vi
   vive ancora operativo si travasa nella documentazione del repo con le regole del
   passo 3 e del prompt di fine sessione: le decisioni e le regole della serie che
   valgono ancora → AGENTS.md (regola + data + dove è fissata) o la guida del dominio;
   una regola di sessione nata nella serie → WORKFLOW.md; lo stato → CLAUDE.md; la
   storia della serie, con le date, i master e che cosa ha corretto ogni ritiro → README.md
   § Documentation (come per le serie precedenti); i contratti condivisi → le guide
   delle aree che li usano, per nome. Quel giorno le etichette della serie citate nel
   codice si riscrivono in loco con uno script di sostituzioni esatte che rispetta i
   fine riga per file, e una revisione a campione prima di fidarsi; `git log -- doc/mobile/`
   resta l'archivio, e ogni rimando alla cartella nel repo si riscrive verso di lui.

5) AGGIORNA indici e stato — lo stato vive in PIÙ punti che possono divergere e si
   chiude con un grep, non con una riga: la cartella è `doc/mobile/`; l'indice è
   `doc/mobile/README.md` (`grep -n "^## " doc/mobile/README.md` dà le sezioni: § 6 la
   tabella di stato, § 3.1 la tabella del fixture, § 5 i moduli condivisi con la spec
   proprietaria, § 8 come si rimisura, § 9 le decisioni numerate — l'ultimo numero con
   `grep -o -E "\(([0-9]{1,3})\) \*\*" doc/mobile/README.md | grep -o -E "[0-9]+" | sort -n | tail -1`,
   e una decisione presa nel ritiro prende il SUCCESSIVO, mai un numero già usato (adc2572
   dovette rinumerarne una ovunque) —, § 10 le domande, e il preambolo che dice quali spec
   sono fatte e ritirate); la riga di stato ha due forme: nell'intestazione della spec
   `> Stato: … · riletta in modo adversariale il <data>: N rilievi, N decisioni · Priorità … · Sforzo … · Dipende da … · Sblocca …`
   e in § 6 `| [MOB-NN](file) | titolo | … | implementata il <data> (…) |`; al ritiro la riga di
   § 6 perde il link e diventa testo, «**ritirata il <data>** — PR #NNN in develop dal
   <data>; …; la misura di chiusura resta: …», la forma delle righe già ritirate (`grep -n
   "ritirata il" doc/mobile/README.md`). Lo stato vive in SETTE punti, ciascuno da rileggere
   con `grep -n` e mai per numero di riga: (1) l'intestazione della spec (`sed -n 3,4p
   <SPEC>`: la sessione di implementazione può averla lasciata «da fare» mentre § 6 dice
   «implementata» — si allinea qui); (2) README § 6 e il preambolo (`grep -n "ritirate\|sono
   fatte" doc/mobile/README.md`); (3) le intestazioni delle spec sorelle «Dipende da: MOB-NN» —
   dopo il ritiro «MOB-NN (ritirata il <data>, in develop dal <data>, PR #NNN)», come già
   scrivono per le ritirate (`grep -n -o "Dipende da[^·]*" doc/mobile/MOB-*.md`) — e la colonna
   «Proprietaria» di § 5; (4) CLAUDE.md «Latest» e § Testing («Mobile composition»): `grep
   -n -E "MOB-|doc/mobile" CLAUDE.md`; (5) AGENTS.md § Commands («While `doc/mobile/` is
   open»), § Performance tooling e gli stub di § 3 che portano «(MOB-NN)»: `grep -n "MOB-"
   AGENTS.md`; (6) WORKFLOW.md § 3 (la riga del fixture `census@example.com`; il paragrafo
   «Branches» di «Where things are recorded», che rimanda a § 6 per sapere quale spec è in
   `develop`); (7) README.md § Documentation (la riga `doc/mobile/` della tabella dei file di
   guida, che l'ultimo ritiro riscrive con la storia della serie, come f2d4ec3 fece per
   `perf/`). Se era l'ultima spec, dillo esplicitamente e chiudi la serie come l'ultimo
   precedente.
   `grep -rn -E "MOB-<NN>|<SLUG>" CLAUDE.md AGENTS.md WORKFLOW.md README.md doc/mobile/
   doc/guide/ scripts lib __tests__ e2e components app` seguito da `grep -rn -E "fatta il|da
   fare|implementata il|ritirata il|in develop dal|Stato:" doc/mobile/` e da `grep -n -E
   "MOB-|doc/mobile" CLAUDE.md` (prima del ritiro: «implementata» in § 6 e nel «Latest» e
   l'intestazione della spec; dopo: «ritirata il <data>» nel preambolo e in § 6, «ritirata»
   nelle intestazioni delle sorelle, CLAUDE.md «Latest») deve dire la stessa cosa ovunque.

CANCELLI: nell'ordine di WORKFLOW.md § 3 «The commands that exist» — `npx tsc --noEmit`
pulito; `TZ=Europe/Rome npx vitest run` E `TZ=UTC npx vitest run` verdi, con i totali
confrontati con CLAUDE.md § Current Status e riscritti lì (ogni fixture di data a
mezzogiorno, quelle a ridosso della mezzanotte nominate con l'ora italiana — AGENTS.md
§ Commands); `npm run lint` a zero; `npm run perf:budget -- --dist=.next-perf` invariato
dopo `npm run perf:build` (REGOLA DEL BUILD DI VERIFICA: lo script legge la build che la
sua prima riga nomina — `.next` dopo `npm run build`, `.next-perf` con `--dist` dopo
`perf:build`; il 2026-10-05 senza l'opzione lesse una `.next` del 15/08 — e un tetto si
alza solo con `raisedBy` nello stesso commit); la misura di chiusura della serie rifatta
sul codice del ritiro se ha toccato un file dell'app: `npm run mobile:census --
--email=census@example.com` e `npm run mobile:budget` sulla STESSA build `.next-perf`
servita da `perf:serve` su :3200, mai sul dev server (la baseline § 3 è dev, il fixture
§ 3.1 è build: non si confrontano) e mai accanto alla suite Playwright (un server per
volta, WORKFLOW.md § 3); E2E: un ritiro di solo testo e commenti NON gira Playwright
(WORKFLOW.md § 3; così le quattordici PERF e MOB-01, 9d39c10); un difetto a runtime si
corregge solo su decisione del proprietario, con la suite d'area (la riga «Suites to run
after a change here» del § Files della guida) e `npm run test:e2e` INTERO (Java ≥ 21,
emulatori accesi, :3100 libera o tenuta dal `dev:e2e` di questo repo — un'altra app lì
viene riusata da Playwright e la ferma il proprietario, doc/guide/e2e-emulatori.md; i
totali confrontati con CLAUDE.md § Current Status), e si scrive in CLAUDE.md § Latest che
i segnali vanno rifatti dopo il deploy.
LIMITI: tetti e comandi, mai i valori di un giorno — CLAUDE.md «well under 20.000
characters» (lo dice di sé in § Project Overview; il tetto del proprietario nel prompt di
fine sessione è 40.000), contato in caratteri: `node -e 'console.log([...require("fs").readFileSync("CLAUDE.md","utf8")].length)'`
(`wc -c` conta i byte, e «», € e — ne valgono due o tre); AGENTS.md ~1000 righe (AGENTS.md
§ 0, proprietario 2026-10-10: `wc -l AGENTS.md`), una lezione di dominio NON va lì ma nella
sua guida e uno stub di § 3 che supera i 3–4 punti è una guida che rientra (§ 0);
WORKFLOW.md solo lo standard e la sua traduzione locale (§ 3 in coda: «Do not duplicate
project conventions here»); le guide ~500 righe ciascuna (AGENTS.md § 0; oltre si divide
per sotto-tema in una sessione sua, come `prima-schermata.md` uscì da `velocita.md` il
2026-10-10), le più vicine al tetto con `wc -l doc/guide/*.md | sort -n | tail -6`; il giorno
dell'ultima spec si misura PRIMA del travaso quanto porta a `prima-schermata.md` (README
§ 3 con § 3.1, e § 8: `awk '/^## 3\./,/^## 4\./' doc/mobile/README.md | wc -l` e lo stesso da
`## 8.` a `## 9.`), lo si somma alle sue righe e si dichiara. Se sfori, NON tagliare in
chiusura: dimmelo e proponi lo scorporo
come sessione a parte.

⚠️ NON: riassumere una spec dentro un documento che resta · lasciare un rimando a un
file che non esiste più · cancellare date · ritirare senza i segnali (e senza il DDL
speso) · ritirare l'indice finché una spec vive · cominciare la spec successiva prima di
aver ritirato questa · lasciare un dubbio: ogni domanda si fa SUBITO con AskUserQuestion.

Alla fine: riassumi il diff; le occorrenze riscritte per categoria; che cosa hai
travasato e dove; che cosa ha trovato la verifica; l'esito del grep dello stato; qual è
la prossima spec e se i suoi prerequisiti sono in piedi. Se hai corretto codice,
scrivilo anche in CLAUDE.md § Latest: i segnali passati valgono per il codice di PRIMA,
e sul nuovo sono da rifare dopo il deploy. Poi chiedimi l'OK per il commit: un branch
dal branch di integrazione, un solo commit.
```
