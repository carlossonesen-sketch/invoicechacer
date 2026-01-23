/**
 * Typed API error with HTTP status code
 * Ensures limit errors always return correct status codes (429, 403, etc.)
 */

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "ApiError";
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

/**
 * Type guard to check if an error is an ApiError
 */
export function isApiError(e: unknown): e is ApiError {
  return (
    !!e &&
    typeof e === "object" &&
    "status" in e &&
    "code" in e &&
    typeof (e as ApiError).status === "number" &&
    typeof (e as ApiError).code === "string"
  );
}
