const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/**
 * Human "2 minutes ago" / "in 3 days" rendering, via the built-in
 * Intl.RelativeTimeFormat (no date library needed). Intended for server-rendered
 * lists that re-render on refresh; if used in a client component, the value is
 * computed at render time and may drift until the next refresh.
 */
export function formatRelativeTime(input: Date | string | number): string {
  const date = input instanceof Date ? input : new Date(input);
  let duration = (date.getTime() - Date.now()) / 1000; // seconds; negative = past
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return rtf.format(Math.round(duration), "year");
}
