/**
 * Email guard functions for kill switches and allowlist redirect
 */

import { getEmailConfig } from "./emailConfig";
import { ApiError } from "@/lib/api/ApiError";

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string | null {
  const parts = email.split("@");
  if (parts.length !== 2) {
    return null;
  }
  
  return parts[1].trim().toLowerCase();
}

/**
 * Check if email domain is in the allowed list
 */
export function isDomainAllowed(email: string): boolean {
  const config = getEmailConfig();
  
  // If no domains are configured, allow all (backward compatibility)
  if (config.allowedRecipientDomains.length === 0) {
    return true;
  }
  
  const domain = extractDomain(email);
  if (!domain) {
    return false;
  }
  
  return config.allowedRecipientDomains.includes(domain);
}

/**
 * Apply test redirect if domain is not allowed
 * Returns the final recipient email and whether a redirect was applied
 */
export function applyTestRedirect(originalEmail: string): { finalEmail: string; redirected: boolean } {
  const config = getEmailConfig();
  
  if (!isDomainAllowed(originalEmail)) {
    if (config.testRedirectEmail) {
      return {
        finalEmail: config.testRedirectEmail,
        redirected: true,
      };
    }
    // If no redirect email configured, reject the send
    throw new Error(`Domain not allowed and TEST_REDIRECT_EMAIL not configured: ${extractDomain(originalEmail)}`);
  }
  
  return {
    finalEmail: originalEmail,
    redirected: false,
  };
}

/**
 * Assert that email sending is enabled
 * Throws if EMAIL_SENDING_ENABLED is not true
 * In development (NODE_ENV !== "production"), also allows enabling via NEXT_PUBLIC_DEV_TOOLS=1
 */
export function assertEmailSendingAllowed(): void {
  const config = getEmailConfig();
  
  // Allow enabling via dev tools in development mode
  const devToolsEnabled = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
  
  if (!config.emailSendingEnabled && !devToolsEnabled) {
    throw new ApiError(
      "EMAIL_SENDING_DISABLED",
      "EMAIL_SENDING_DISABLED. " +
      "Set EMAIL_SENDING_ENABLED=true in your .env.local file to enable email sending. " +
      (process.env.NODE_ENV !== "production" 
        ? "Alternatively, set NEXT_PUBLIC_DEV_TOOLS=1 to enable in development mode."
        : ""),
      403
    );
  }
}

/**
 * Assert that auto-chase is enabled
 * Throws if AUTOCHASE_ENABLED is not true
 * In development (NODE_ENV !== "production"), also allows enabling via NEXT_PUBLIC_DEV_TOOLS=1
 */
export function assertAutoChaseAllowed(): void {
  const config = getEmailConfig();
  
  // Allow enabling via dev tools in development mode
  const devToolsEnabled = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
  
  if (!config.autoChaseEnabled && !devToolsEnabled) {
    throw new ApiError(
      "AUTOCHASE_DISABLED",
      "AUTOCHASE_DISABLED. " +
      "Set AUTOCHASE_ENABLED=true in your .env.local file to enable auto-chase. " +
      (process.env.NODE_ENV !== "production" 
        ? "Alternatively, set NEXT_PUBLIC_DEV_TOOLS=1 to enable in development mode."
        : ""),
      403
    );
  }
}
