/**
 * Test helpers and expected behavior documentation for email limits
 * 
 * This file documents expected behavior for email limit checks.
 * Not a real test file, but serves as documentation and helper functions.
 */

/**
 * Expected behavior when EMAIL_COOLDOWN_MINUTES_OVERRIDE=0:
 * 
 * 1. Cooldown checks are fully bypassed (no HTTP 429 for cooldown)
 * 2. Daily email caps still enforced (HTTP 429 if exceeded)
 * 3. Trial plan limits still enforced (HTTP 403 if exceeded):
 *    - Max 1 initial email per invoice
 *    - Max 1 reminder email per invoice
 *    - Max 1 due email per invoice
 *    - Max 3 chase emails per invoice (weeks 1-3 only)
 *    - weekNumber must be 1-3 for trial plan (HTTP 403 if weekNumber > 3)
 * 4. Override only works in non-production (NODE_ENV !== "production")
 * 
 * Example scenarios:
 * 
 * Scenario 1: Cooldown disabled, trial plan, weekNumber=4
 *   - Cooldown check: SKIPPED (override=0)
 *   - Trial weekNumber check: FAILS → HTTP 403 "TRIAL_CHASE_LIMIT_REACHED: Trial plan allows only weeks 1-3"
 * 
 * Scenario 2: Cooldown disabled, trial plan, weekNumber=1 (already sent)
 *   - Cooldown check: SKIPPED (override=0)
 *   - Trial weekNumber check: PASSES (1-3 range)
 *   - Trial week count check: FAILS → HTTP 403 "TRIAL_CHASE_LIMIT_REACHED: Week 1 email already sent"
 * 
 * Scenario 3: Cooldown disabled, trial plan, weekNumber=1 (first time)
 *   - Cooldown check: SKIPPED (override=0)
 *   - Trial weekNumber check: PASSES (1-3 range)
 *   - Trial week count check: PASSES (not sent yet)
 *   - Trial total chase check: PASSES (< 3 total)
 *   - Result: Email sent successfully
 * 
 * Scenario 4: Cooldown enabled, trial plan, sending too quickly
 *   - Cooldown check: FAILS → HTTP 429 "EMAIL_COOLDOWN_ACTIVE: X minutes remaining"
 *   - Trial checks: NOT REACHED (cooldown fails first)
 */

/**
 * Helper to check if cooldown override is active
 */
export function isCooldownOverrideActive(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.EMAIL_COOLDOWN_MINUTES_OVERRIDE !== undefined &&
    parseInt(process.env.EMAIL_COOLDOWN_MINUTES_OVERRIDE, 10) === 0
  );
}

/**
 * Expected HTTP status codes for different error types:
 * 
 * Rate Limiting (429):
 * - EMAIL_COOLDOWN_ACTIVE
 * - MAX_EMAILS_PER_DAY_PER_USER_EXCEEDED
 * - MAX_EMAILS_PER_DAY_GLOBAL_EXCEEDED
 * 
 * Trial Plan Limits (403):
 * - TRIAL_CHASE_LIMIT_REACHED (weekNumber > 3, week already sent, or total >= 3)
 * - TRIAL_REMINDER_LIMIT_REACHED
 * - TRIAL_INITIAL_LIMIT_REACHED
 * - TRIAL_EMAIL_LIMIT_REACHED
 * 
 * Kill Switches (403):
 * - EMAIL_SENDING_DISABLED
 * - AUTOCHASE_DISABLED
 */
export const EXPECTED_ERROR_STATUSES = {
  EMAIL_COOLDOWN_ACTIVE: 429,
  MAX_EMAILS_PER_DAY_PER_USER_EXCEEDED: 429,
  MAX_EMAILS_PER_DAY_GLOBAL_EXCEEDED: 429,
  TRIAL_CHASE_LIMIT_REACHED: 403,
  TRIAL_REMINDER_LIMIT_REACHED: 403,
  TRIAL_INITIAL_LIMIT_REACHED: 403,
  TRIAL_EMAIL_LIMIT_REACHED: 403,
  EMAIL_SENDING_DISABLED: 403,
  AUTOCHASE_DISABLED: 403,
} as const;
