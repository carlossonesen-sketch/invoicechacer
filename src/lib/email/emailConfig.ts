/**
 * Email configuration from environment variables
 * Provides parsed values with safe defaults for production test mode
 */

export interface EmailConfig {
  emailSendingEnabled: boolean;
  autoChaseEnabled: boolean;
  autoChaseDryRun: boolean;
  maxEmailsPerDayPerUser: number;
  maxEmailsPerDayGlobal: number;
  emailCooldownMinutes: number;
  allowedRecipientDomains: string[];
  testRedirectEmail: string | null;
}

/**
 * Parse comma-separated domain list from environment variable
 */
function parseDomainList(value: string | undefined): string[] {
  if (!value || typeof value !== "string") {
    return [];
  }
  
  return value
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);
}

/**
 * Parse integer from environment variable with default
 */
function parseIntEnv(value: string | undefined, defaultValue: number): number {
  if (!value) {
    return defaultValue;
  }
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 0) {
    return defaultValue;
  }
  
  return parsed;
}

/**
 * Parse boolean from environment variable
 * Returns true only if value is exactly "true" (case-insensitive)
 */
function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }
  
  return value.trim().toLowerCase() === "true";
}

/**
 * Get email configuration from environment variables
 */
export function getEmailConfig(): EmailConfig {
  return {
    emailSendingEnabled: parseBooleanEnv(process.env.EMAIL_SENDING_ENABLED, false),
    autoChaseEnabled: parseBooleanEnv(process.env.AUTOCHASE_ENABLED, false),
    autoChaseDryRun: parseBooleanEnv(process.env.AUTOCHASE_DRY_RUN, true),
    maxEmailsPerDayPerUser: parseIntEnv(process.env.MAX_EMAILS_PER_DAY_PER_USER, 25),
    maxEmailsPerDayGlobal: parseIntEnv(process.env.MAX_EMAILS_PER_DAY_GLOBAL, 200),
    emailCooldownMinutes: parseIntEnv(process.env.EMAIL_COOLDOWN_MINUTES, 60),
    allowedRecipientDomains: parseDomainList(process.env.ALLOWED_RECIPIENT_DOMAINS),
    testRedirectEmail: process.env.TEST_REDIRECT_EMAIL?.trim() || null,
  };
}
