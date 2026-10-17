/**
 * The pension lock as the verdict's scope line below `desktop:` on the FIRE tabs (The Binding-Clause
 * Rule, 2026-10-10): «Modello ponte: fondo pensione escluso fino al 2050», from
 * `describeFireLockScope` — a caption with no id and no focus, which `PageVerdict` renders after
 * the strip. The tabs pass it only with `sections.compact`: at 1440 the whole paragraph already
 * states the lock. Its own module, not the Calcolatore's: the four lazy tabs import it without
 * pulling the Calcolatore into their chunk.
 */
export function FireLockScope({ text }: { text: string }) {
  return <p className="max-w-[920px] text-[12px] leading-[1.5] text-muted-foreground">{text}</p>;
}
