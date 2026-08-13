/**
 * Fase 5, Blocco E: CREATE_PAGE (packages/engine) richiede id forniti dal
 * chiamante (deterministico/replayabile, stesso schema di CREATE_NODE) -
 * qui solo la generazione di id leggibili lato UI, nessuna modifica al
 * comando stesso.
 */
export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return slug || "pagina";
}

export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
