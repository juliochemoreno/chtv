// Convert a 2-letter ISO 3166-1 alpha-2 country code into its flag emoji.
// Returns '' for anything that isn't exactly two A-Z characters so callers
// can safely render the result without extra checks.
//
// Implementation: each ASCII letter maps to a Regional Indicator Symbol
// codepoint (U+1F1E6 onwards). Two of those side by side render as a flag.
export function isoToFlag(iso) {
  if (typeof iso !== 'string') return '';
  const code = iso.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  const A = 'A'.charCodeAt(0);
  const RI = 0x1f1e6;
  return String.fromCodePoint(
    RI + (code.charCodeAt(0) - A),
    RI + (code.charCodeAt(1) - A),
  );
}

