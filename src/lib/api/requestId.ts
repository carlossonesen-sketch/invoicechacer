/**
 * Request/correlation ID for API routes and error responses.
 * Use for diagnosing failures and tracing requests across logs.
 */

import { NextRequest } from "next/server";

const HEADER = "x-request-id";

/**
 * Get request ID from x-request-id header or generate a new one.
 */
export function getRequestId(request: NextRequest): string {
  const existing = request.headers.get(HEADER);
  if (existing && typeof existing === "string" && existing.trim().length > 0) {
    return existing.trim();
  }
  return crypto.randomUUID();
}
