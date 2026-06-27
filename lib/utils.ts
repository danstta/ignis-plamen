import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * True if `value` is a canonical UUID. Guard before querying a `uuid` column:
 * Postgres throws (22P02) on malformed input, which otherwise surfaces as a 500
 * instead of a clean "not found".
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
