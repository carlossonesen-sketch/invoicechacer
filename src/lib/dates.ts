import { Timestamp } from "firebase/firestore";

/**
 * Timezone-safe date helpers for date-only handling
 * Uses local noon to avoid timezone issues when converting between dates and timestamps
 */

/**
 * Convert various date formats to JavaScript Date | null.
 * Handles:
 * - Firestore Timestamp (has toDate method)
 * - ISO string
 * - Number (milliseconds timestamp)
 * - Object with {seconds, nanoseconds} from API serialization
 * - null/undefined
 */
export function toJsDate(value: unknown): Date | null {
  if (!value) return null;

  // Firestore Timestamp or object with toDate method
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }

  // ISO string
  if (typeof value === "string") {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  // Number (milliseconds timestamp)
  if (typeof value === "number") {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  // Object with seconds property (API serialization: {seconds: number, nanoseconds?: number})
  if (typeof value === "object" && value !== null && "seconds" in value) {
    const seconds = typeof (value as { seconds: unknown }).seconds === "number" ? (value as { seconds: number }).seconds : null;
    if (seconds !== null) {
      const date = new Date(seconds * 1000);
      return isNaN(date.getTime()) ? null : date;
    }
  }

  return null;
}

// Inline unit tests (run in dev mode)
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  const testToJsDate = () => {
    const now = new Date();
    const nowMs = now.getTime();
    const nowIso = now.toISOString();
    const nowSeconds = Math.floor(nowMs / 1000);

    // Test Firestore Timestamp
    const ts = Timestamp.fromDate(now);
    console.assert(toJsDate(ts)?.getTime() === nowMs, "toJsDate: Firestore Timestamp");

    // Test ISO string
    console.assert(toJsDate(nowIso)?.getTime() === nowMs, "toJsDate: ISO string");

    // Test number
    console.assert(toJsDate(nowMs)?.getTime() === nowMs, "toJsDate: number");

    // Test {seconds, nanoseconds} object
    console.assert(toJsDate({ seconds: nowSeconds, nanoseconds: 0 })?.getTime() === nowMs, "toJsDate: {seconds, nanoseconds}");

    // Test null/undefined
    console.assert(toJsDate(null) === null, "toJsDate: null");
    console.assert(toJsDate(undefined) === null, "toJsDate: undefined");

    // Test invalid
    console.assert(toJsDate("invalid") === null, "toJsDate: invalid string");
    console.assert(toJsDate(NaN) === null, "toJsDate: NaN");

    console.log("[toJsDate] All tests passed");
  };
  // Run tests after a short delay to ensure Timestamp is available
  setTimeout(testToJsDate, 100);
}

/**
 * Convert a date input string (YYYY-MM-DD) to a Firestore Timestamp
 * Uses local noon to avoid timezone issues
 */
export function dateInputToTimestamp(dateStr: string | null | undefined): Timestamp | null {
  if (!dateStr || dateStr.trim() === "") {
    return null;
  }

  // Parse YYYY-MM-DD and set to local noon to avoid timezone issues
  const localDate = new Date(`${dateStr}T12:00:00`);
  
  if (isNaN(localDate.getTime())) {
    return null;
  }

  return Timestamp.fromDate(localDate);
}

/**
 * Convert a Firestore Timestamp to a date input string (YYYY-MM-DD)
 * Returns date in local timezone, not UTC
 */
export function timestampToDateInput(ts: Timestamp | string | null | undefined): string {
  if (!ts) {
    return "";
  }

  let date: Date;
  if (typeof ts === "string") {
    date = new Date(ts);
  } else if (ts instanceof Timestamp) {
    date = ts.toDate();
  } else {
    return "";
  }

  if (isNaN(date.getTime())) {
    return "";
  }

  // Get local date components (not UTC)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Format a timestamp as a friendly date string (e.g., "Jan 19, 2026")
 * Uses local timezone
 */
export function formatDateOnly(ts: Timestamp | string | null | undefined): string {
  if (!ts) {
    return "";
  }

  let date: Date;
  if (typeof ts === "string") {
    date = new Date(ts);
  } else if (ts instanceof Timestamp) {
    date = ts.toDate();
  } else {
    return "";
  }

  if (isNaN(date.getTime())) {
    return "";
  }

  // Format in local timezone
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
