import { Timestamp } from "firebase/firestore";

/**
 * Timezone-safe date helpers for date-only handling
 * Uses local noon to avoid timezone issues when converting between dates and timestamps
 */

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
