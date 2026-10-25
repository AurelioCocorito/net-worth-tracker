// Fatturato — what was INVOICED in a month, by the month of competence, whoever paid it and
// whenever the money reached the account. It is a register of its own (`revenueEntries`),
// never an expense row: the cash that arrives is already an «Entrata» in Tracciamento, and
// a second row for the same work would count it twice in every cashflow total.
//
// One document per (month, client): the id is derived (`revenueEntryId`), so importing the
// same month twice UPDATES the figure instead of duplicating it.
export interface RevenueEntry {
  id: string;
  userId: string;
  /** The month of competence, `YYYY-MM`. */
  month: string;
  /** Who was invoiced («Dental Care»); '' when the figure is the month's total. */
  client: string;
  /** The invoiced amount in euro, as the owner records it. Negative for a credit note. */
  amount: number;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RevenueEntryInput {
  month: string;
  client: string;
  amount: number;
  note?: string;
}
