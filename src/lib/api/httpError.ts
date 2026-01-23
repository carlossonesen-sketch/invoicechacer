/**
 * Map application errors to HTTP status codes and response bodies
 * Provides consistent error handling across API routes
 */

export interface HttpErrorResponse {
  status: number;
  body: {
    error: string;
    message?: string;
    stack?: string;
  };
}

/**
 * Map an error to HTTP status code and response body
 * 
 * Error mapping rules:
 * - EMAIL_COOLDOWN_ACTIVE → 429 (Too Many Requests)
 * - MAX_EMAILS_PER_DAY_* → 429 (Too Many Requests)
 * - TRIAL_* → 403 (Forbidden)
 * - Validation/idempotency errors → 400 (Bad Request)
 * - Default → 500 (Internal Server Error)
 */
export function mapErrorToHttp(error: unknown): HttpErrorResponse {
  const isDev = process.env.NODE_ENV !== "production";
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Extract error code (first part before colon, or entire message if no colon)
  const errorCode = errorMessage.includes(":") 
    ? errorMessage.split(":")[0].trim()
    : errorMessage.trim();

  // Map error codes to HTTP status codes
  let status = 500;
  let errorKey = "SERVER_ERROR";

  // Rate limiting errors → 429
  if (
    errorCode === "EMAIL_COOLDOWN_ACTIVE" ||
    errorCode.startsWith("MAX_EMAILS_PER_DAY") ||
    errorCode === "MAX_EMAILS_PER_DAY_PER_USER_EXCEEDED" ||
    errorCode === "MAX_EMAILS_PER_DAY_GLOBAL_EXCEEDED"
  ) {
    status = 429;
    errorKey = errorCode;
  }
  // Trial plan limit errors → 403
  else if (errorCode.startsWith("TRIAL_")) {
    status = 403;
    errorKey = errorCode;
  }
  // Email sending disabled → 403
  else if (
    errorCode === "EMAIL_SENDING_DISABLED" ||
    errorCode === "AUTOCHASE_DISABLED"
  ) {
    status = 403;
    errorKey = errorCode;
  }
  // Not found errors → 404 (check before validation to catch "Invoice not found")
  else if (
    errorMessage.includes("not found") ||
    errorCode === "NOT_FOUND"
  ) {
    status = 404;
    errorKey = errorCode !== errorMessage ? errorCode : "NOT_FOUND";
  }
  // Validation and idempotency errors → 400
  else if (
    errorMessage.includes("already sent") ||
    errorMessage.includes("is required") ||
    errorMessage.includes("Missing required fields") ||
    errorMessage.includes("weekNumber must be between") ||
    errorMessage.includes("Invoice missing required fields") ||
    errorMessage.includes("Invalid") ||
    errorCode === "INVALID_INPUT"
  ) {
    status = 400;
    errorKey = errorCode !== errorMessage ? errorCode : "VALIDATION_ERROR";
  }
  // Default to 500 for unexpected errors
  else {
    status = 500;
    errorKey = errorCode !== errorMessage ? errorCode : "SERVER_ERROR";
  }

  return {
    status,
    body: {
      error: errorKey,
      message: errorMessage,
      ...(isDev && errorStack ? { stack: errorStack } : {}),
    },
  };
}
