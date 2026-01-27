/**
 * Firestore client instrumentation for Edge/"client is offline" debugging.
 * Distinguishes: offline/unavailable vs permission-denied vs missing-doc vs index vs other.
 * Logs navigator.onLine and optional context. Use in Firestore listeners and getDoc wrappers.
 */

export type FirestoreErrorKind =
  | "offline"
  | "permission-denied"
  | "missing-doc"
  | "index"
  | "persistence"
  | "other";

const OFFLINE_PATTERNS = [
  "client is offline",
  "failed to get document because the client is offline",
  "unavailable",
  "network",
  "fetch",
  "connection",
  "econnreset",
  "econnrefused",
  "etimedout",
  "load failed",
];

const PERMISSION_PATTERNS = [
  "permission-denied",
  "permission denied",
  "missing or insufficient permissions",
  "insufficient permissions",
];

const INDEX_PATTERNS = ["failed-precondition", "index", "indexes"];

const PERSISTENCE_PATTERNS = [
  "indexeddb",
  "indexed db",
  "persistence",
  "local cache",
  "storage",
];

export function classifyFirestoreError(error: unknown): FirestoreErrorKind {
  const msg =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: string }).message)
      : String(error);
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: string }).code)
      : "";
  const lower = `${msg} ${code}`.toLowerCase();

  if (INDEX_PATTERNS.some((p) => lower.includes(p))) return "index";
  if (PERMISSION_PATTERNS.some((p) => lower.includes(p))) return "permission-denied";
  if (PERSISTENCE_PATTERNS.some((p) => lower.includes(p))) return "persistence";
  if (OFFLINE_PATTERNS.some((p) => lower.includes(p))) return "offline";
  if (code === "not-found" || /not found|missing doc|document.*missing/i.test(lower))
    return "missing-doc";

  return "other";
}

export function logFirestoreInstrumentation(
  context: string,
  error: unknown,
  extra?: { docPath?: string; queryPath?: string }
): void {
  const kind = classifyFirestoreError(error);
  const msg = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code
      : undefined;
  const onLine = typeof navigator !== "undefined" ? navigator.onLine : null;

  console.warn("[Firestore instrumentation]", {
    context,
    kind,
    message: msg,
    code,
    navigatorOnLine: onLine,
    ...extra,
  });
}
