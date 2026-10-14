# Draft release notes

> Accumulates until the next tag (WORKFLOW.md § Where things are recorded). Grouped by area; one entry per surface, rewritten to its final state.

## ✨ New Features

- **Panoramica (telefono e tablet)** — Added the small-screen composition of the page: under the title three figures to tap — «Questo mese», «Da inizio anno», «Messo da parte finora» — the first opening «Il perché · il patrimonio, il risparmio e il mercato del mese» (the whole verdict), the second putting the net-worth curve on «da inizio anno», the third opening the Cashflow row; then Patrimonio totale lordo open, without its two chips (the strip has them) and with a shorter curve; then «Il resto della pagina»: Sintesi, Cashflow, Composizione, Costi, Obiettivi, Spese, Entrate and Asset principali as closed rows that say in words what they hold and open with a tap, remembered on that device. When a month is in the red for the tax on a sale, the sale and its tax stay on the first screen; a taxed month that is not the story shows the whole verdict. On every screen the year's euro now follows its percentage («+15,00% da inizio anno (+25.000,00 €)»), a figure that holds rows still in the calendar says so under itself («di cui 350 € già in calendario, entro il 31»), and a zero variation prints «0,00 €» with no sign.

- **Hall of Fame (telefono e tablet)** — Added the small-screen composition of the page: under the title only the first sentence of the verdict («In quel mese il patrimonio è salito di +8000 €, il +4,1% in un mese.»), then three figures to tap — «Quest'anno», «Entrate record», «Risparmio record» — each opening the tile that explains it, then Record del patrimonio open with its chart lower, then «Il resto della pagina»: Entrate, Risparmio record, Anni and Note as closed rows that say in words what they hold («per mese», «3 note») and open with a tap; «Il perché · l'anno e il mese in corso» opens the rest of the verdict. The rows you open are remembered on that device; «Apri tutte» opens them all and «Chiudi tutte» closes them, the rows you had open at load included. The two actions «Aggiungi una nota» and «Aggiorna i record» moved to the end of the page. On a desktop nothing changes but the verdict's punctuation: the running year and month are now a second sentence.

- **Patrimonio › Prestiti** — Added a «Prestito» asset: a debt of its own, worth minus what you still owe — a mortgage linked to the property it finances, or a personal loan. The property keeps its gross value and the mortgage sits beside it in the Immobili class; a personal loan is negative liquidity, read «debito» among your accounts.
- **Patrimonio › Prestiti** — Added the automatic move of a mortgage recorded the old way (a field of the property) into a loan the first time you open Patrimonio, with its linked instalments following it and the net worth unchanged.
- **Patrimonio › Mutuo** — Added one «Mutuo» tile per loan («Prestito» for a personal one): the interest and principal paid this year, the debt, when the plan ends; a loan repaid in full reads «Estinto».
- **Patrimonio › Obbligazioni** — Added the bond with a single coupon paid with the redemption («Unica a scadenza», the BTP Valore Insieme): the annual rate compounds over the bond's life, the form previews the figure to check against the issuer's sheet, and the one coupon lands on the maturity date.

- **Cashflow › Nuova voce** — Added the «Commissione» field on every entry, not only on a transfer: the bank fee becomes a spending row of its own in the category chosen in Impostazioni › Spese («Commissioni bancarie»), on the same account and date, edited from its entry and deleted with it; on a recurring series or an instalment plan every occurrence gets its own fee.
- **Cashflow › Nuova voce** — Added «Estinzione anticipata» on a Debt entry that repays a loan: the whole amount goes to principal, partial or total, and the line under the field says the debt it leaves («da 10.000 € a 6.000 €»); a penalty goes in the fee.
- **Cashflow › Nuova voce** — Added a transfer that lands on a property: the deposit on a house you are buying leaves the account and becomes value of the house, nothing counts as spending.

## 🐛 Bug Fixes

- **Panoramica · Patrimonio · Email periodiche** — Fixed the month's split calling «altre variazioni» the money you moved outside the cashflow: the payments into a pension fund (TFR, employer, voluntary) and the principal repaid on a mortgage or a loan now have their own names — «+2000 € dal mercato, +1000 € risparmiati, +300 € di debito rimborsato (Mutuo), +500 € versati nel fondo pensione» — each debt by the name of its asset, and «altre variazioni» is left for what nothing explains. The periodic email no longer counts them as «mercato».

- **Email periodiche · email settimanale del budget** — Fixed an AI comment cut off halfway: when the model stops in the middle — it declines to go on, or reaches its length limit — the email now goes out without the comment instead of with half of it; when it declines for some reasons, another model writes the comment instead.

- **Cashflow · Panoramica (uno zero)** — Fixed a figure that rounds to zero printed with a minus sign and a colour: the month's «Risparmio» on Tracciamento and on the Panoramica's Cashflow tile, the savings rate of a month, and what remains to a person on Divisione now read «0 €» in plain ink, as the cells under the title already did; an exact zero on Divisione is no longer green.
- **Cashflow › Tracciamento (telefono)** — Fixed «Carica altri» after adding an entry from the «+»: when the new row sat past the first page the list opened on it, and the next «Carica altri» made the list shorter instead of longer.
- **Cashflow › Tracciamento (demo)** — Fixed the «+» of the bottom bar in the demo account: it is no longer shown there, so a visitor cannot add an entry to the shared data.
- **Cashflow › Centri di Costo** — Fixed the page when the cost centres cannot be read: the notice now stands where the verdict is, instead of under a sentence claiming you have no cost centres.

- **Cashflow › Movimenti (tabella)** — Fixed the deletion of a whole series from the table view, which left the fees' debits on the account; the feed already gave them back.

- **Rendimenti › Analizza con AI** — Fixed the empty or cut-off report: when the model declines to write it, another model takes over where the kind of refusal allows it, and the dialog names the model that actually wrote the report; when the refusal stands, or the report reaches its maximum length, the dialog says so — refused, or stopped halfway with the text written so far incomplete — and «Rigenera» is offered after any failure, not only beside a finished report.

## 🔧 Improvements

- **Assistente AI** — Improved the answer to a question the model declines: for some kinds of refusal another model now answers in the same reply, instead of the notice that it cannot answer.

- **Patrimonio e landing (telefono e tablet)** — The net-worth curve of the hero tile is shorter below the desktop width (120px), the same tile the Panoramica now composes; the reading, the chips and the market digest stay whole on those two surfaces.

- **Cashflow · FIRE e Simulazioni · Impostazioni (telefono e tablet)** — Improved the section pill under the title: every tab is now a 44-pixel target for the thumb, so the pill is a little taller.
- **Cashflow › Tracciamento (telefono e tablet)** — Improved the first screen: the period under the title, then the month's three figures — entrate, spese, risparmio — as three cells that open their tile, with what is still in the calendar said under them; the other tiles are closed rows you open with a tap and the page remembers. The «+» now opens Movimenti on the row you just saved, the cursor on it.
- **Cashflow › Budget (telefono e tablet)** — Improved the first screen: «Fine mese» and what remains — or how far over you are, or the day the calendar crosses the ceiling — as two cells under the verdict, the ceiling's tile open, the other tiles as closed rows; the figures of the ceiling's tile no longer run into each other on a narrow screen.
- **Cashflow › Centri di Costo (telefono e tablet)** — Improved the list and a centre's page: the total open, the other tiles as closed rows remembered per page.
- **Cashflow › Divisione (telefono e tablet)** — Improved the first screen: one cell per person with what remains to them of the money that has already moved, and what is still in the calendar on its own line under them — on the desktop too, out of the sentence.
- **Cashflow › Dividendi (telefono e tablet)** — Improved the first screen: the period and the «+» under the title, the net income open, the other tiles as closed rows in the page's order; a yield that could not be read is a red row, open until you close it.
- **Ogni pagina** — Improved the figures in every verdict and reading: the «€» now sits right after its number («+1.200 €» instead of a whole monospace cell of space between them), on the phone's figure strip too.

- **FIRE** — Improved the FIRE number: the loan on an excluded primary residence is left out with the house, so a debt on a thing not counted never lowers the figure.
- **Storico › Driver** — Improved «mutuo»: a month that opens a loan shows the debt going up and one that closes it shows it repaid.
- **Rendimenti** — Improved the base: a loan is out of every performance base, whatever the toggles say.
- **Impostazioni › Spese** — Improved the fee tile, now «Commissioni bancarie», saying that the category serves every entry and every occurrence of a series.
