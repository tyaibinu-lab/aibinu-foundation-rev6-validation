// NGN money helpers. Authoritative amounts are integer kobo (1 NGN = 100 kobo),
// held as bigint so large values never lose precision. No floating-point maths.

export type Kobo = bigint;

const NAIRA_RE = /^(-)?(?:(\d{1,3}(?:,\d{3})+)|(\d+))(?:\.(\d{1,2}))?$/;

/** Parse a Naira string ("1,250.50", "-20", "0.5") to kobo. Throws on malformed input; never rounds. */
export function nairaStringToKobo(input: string): Kobo {
  if (typeof input !== "string") throw new TypeError("Amount must be a string");
  const s = input.trim().replace(/^₦\s?/, "");
  const m = NAIRA_RE.exec(s);
  if (!m) throw new RangeError(`Invalid Naira amount: "${input}"`);
  const whole = (m[2] ?? m[3] ?? "0").replace(/,/g, "");
  const frac = (m[4] ?? "").padEnd(2, "0");
  const kobo = BigInt(whole) * 100n + BigInt(frac || "0");
  return m[1] && kobo !== 0n ? -kobo : kobo;
}

/** Normalise number|bigint|string kobo into bigint, rejecting non-integers and unsafe numbers. */
export function toKobo(v: Kobo | number | string): Kobo {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw new RangeError("Kobo must be a safe integer");
    return BigInt(v);
  }
  if (!/^-?\d+$/.test(v.trim())) throw new RangeError(`Invalid kobo value: "${v}"`);
  return BigInt(v.trim());
}

/** Kobo to a plain Naira string with grouping and two decimals, e.g. 123456n -> "1,234.56". */
export function koboToNairaString(kobo: Kobo | number | string): string {
  const k = toKobo(kobo);
  const neg = k < 0n;
  const abs = neg ? -k : k;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

/** Kobo to display currency, e.g. -50000n -> "-₦500.00". */
export function formatKobo(kobo: Kobo | number | string): string {
  const s = koboToNairaString(kobo);
  return s.startsWith("-") ? `-₦${s.slice(1)}` : `₦${s}`;
}

/** Validated Naira string to display currency, e.g. "1500" -> "₦1,500.00". */
export function formatNaira(naira: string): string {
  return formatKobo(nairaStringToKobo(naira));
}
