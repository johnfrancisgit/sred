// Parses "Cookie" header into name: value.
// Splits on the first "=" so values containing = survive
export function parseCookieHeader(header: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(/;\s*/)) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    if (!name) continue;
    const value = pair.slice(eq + 1).trim();
    out[name] = value;
  }
  return out;
}
