/**
 * Invoice email scheduling logic
 * Computes next email to send based on due date and existing events
 */

import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";

export interface InvoiceForSchedule {
  id: string;
  userId: string;
  customerEmail: string;
  dueAt: Timestamp | Date | string;
  status: "pending" | "overdue" | "paid";
  paymentLink?: string | null;
}

export interface ScheduledEmail {
  type: "invoice_reminder" | "invoice_due" | "invoice_late_weekly";
  scheduledFor: Date;
  weekNumber?: number;
}

/**
 * Set time to 9:00 AM in America/Chicago timezone
 * Uses UTC-6 offset (CST) - does not handle DST automatically
 * For production, consider using a timezone library like date-fns-tz
 */
function setChicago9AM(date: Date): Date {
  // Get date components in UTC
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  
  // Create a date representing 9:00 AM Chicago time (UTC-6)
  // We create it as if it were 9 AM in a UTC-6 timezone
  // This is: 9 AM Chicago = 3 PM UTC (during CST) or 2 PM UTC (during CDT)
  // For simplicity, we'll use 3 PM UTC (15:00) which is 9 AM CST
  const chicago9AM = new Date(Date.UTC(year, month, day, 15, 0, 0, 0));
  
  return chicago9AM;
}

/**
 * Convert Firestore Timestamp or string to Date
 */
function toDate(value: Timestamp | Date | string): Date {
  if (value instanceof Date) {
    return value;
  }
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  return new Date(value);
}

/**
 * Check if an email of a specific type has already been sent
 */
async function hasEmailBeenSent(
  invoiceId: string,
  type: string,
  weekNumber?: number
): Promise<boolean> {
  const db = getAdminFirestore();
  if (!db) {
    throw new Error("Firebase Admin not initialized");
  }

  const emailEventsRef = db.collection("emailEvents");
  let query = emailEventsRef
    .where("invoiceId", "==", invoiceId)
    .where("type", "==", type);

  // For late weekly emails, also check weekNumber
  if (type === "invoice_late_weekly" && weekNumber !== undefined) {
    query = query.where("weekNumber", "==", weekNumber);
  }

  const snapshot = await query.limit(1).get();
  return !snapshot.empty;
}

/**
 * Compute the next email that should be sent for an invoice
 * Returns null if no email should be sent
 */
export async function computeNextInvoiceEmailToSend(
  invoice: InvoiceForSchedule,
  now: Date = new Date()
): Promise<ScheduledEmail | null> {
  // Hard guard: Only schedule emails for pending invoices
  // Skip if invoice status is not "pending" (paid, overdue, etc.)
  if (invoice.status !== "pending") {
    return null;
  }

  // Skip if no customer email
  if (!invoice.customerEmail || invoice.customerEmail.trim() === "") {
    return null;
  }

  const dueDate = toDate(invoice.dueAt);
  const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysUntilDue = Math.floor((dueDateOnly.getTime() - nowDateOnly.getTime()) / (1000 * 60 * 60 * 24));

  // REMINDER: Send 3 days before due date at 9:00 AM Chicago time
  // If less than 3 days away but still before due date, send in 10 minutes
  if (daysUntilDue >= 3) {
    const reminderDate = new Date(dueDate);
    reminderDate.setDate(reminderDate.getDate() - 3);
    const scheduledReminder = setChicago9AM(reminderDate);
    
    if (!(await hasEmailBeenSent(invoice.id, "invoice_reminder"))) {
      if (scheduledReminder <= now) {
        // If reminder time has passed but we're still 3+ days before due, schedule for now + 10 min
        if (daysUntilDue >= 3) {
          return {
            type: "invoice_reminder",
            scheduledFor: new Date(now.getTime() + 10 * 60 * 1000),
          };
        }
      } else {
        return {
          type: "invoice_reminder",
          scheduledFor: scheduledReminder,
        };
      }
    }
  } else if (daysUntilDue > 0 && daysUntilDue < 3) {
    // Less than 3 days away but still before due date
    if (!(await hasEmailBeenSent(invoice.id, "invoice_reminder"))) {
      return {
        type: "invoice_reminder",
        scheduledFor: new Date(now.getTime() + 10 * 60 * 1000),
      };
    }
  }

  // DUE DATE: Send on due date at 9:00 AM Chicago time
  // If due date is today but time has passed, allow immediate send
  if (daysUntilDue === 0) {
    const scheduledDue = setChicago9AM(dueDate);
    
    if (!(await hasEmailBeenSent(invoice.id, "invoice_due"))) {
      if (scheduledDue <= now) {
        return {
          type: "invoice_due",
          scheduledFor: now,
        };
      } else {
        return {
          type: "invoice_due",
          scheduledFor: scheduledDue,
        };
      }
    }
  } else if (daysUntilDue < 0) {
    // Past due date - check if due date email was sent
    if (!(await hasEmailBeenSent(invoice.id, "invoice_due"))) {
      // Send due date email immediately if not sent
      return {
        type: "invoice_due",
        scheduledFor: now,
      };
    }
  }

  // LATE WEEKLY: Start 7 days after due date, then every 7 days
  // For trial plan: only weeks 1-3 are allowed (enforced in emailLimits)
  // For paid plans: weeks 1-8 are allowed
  if (daysUntilDue < 0) {
    const daysPastDue = Math.abs(daysUntilDue);
    
    // Calculate which week we're in (week 1 starts 7 days after due date)
    // Note: Trial plan limits are enforced in emailLimits.ts, but we can optimize here
    const maxWeeks = 8; // All plans can schedule up to 8, but trial will be blocked at send time
    for (let week = 1; week <= maxWeeks; week++) {
      const weekStartDays = 7 * week;
      const weekEndDays = 7 * (week + 1);
      
      // Check if we're in this week's window
      if (daysPastDue >= weekStartDays && daysPastDue < weekEndDays) {
        if (!(await hasEmailBeenSent(invoice.id, "invoice_late_weekly", week))) {
          // Schedule for 9 AM Chicago time on the week start day
          const weekStartDate = new Date(dueDate);
          weekStartDate.setDate(weekStartDate.getDate() + weekStartDays);
          const scheduledWeek = setChicago9AM(weekStartDate);
          
          if (scheduledWeek <= now) {
            return {
              type: "invoice_late_weekly",
              scheduledFor: now,
              weekNumber: week,
            };
          } else {
            return {
              type: "invoice_late_weekly",
              scheduledFor: scheduledWeek,
              weekNumber: week,
            };
          }
        }
      }
    }
  }

  return null;
}

/**
 * List all scheduled emails for an invoice (for debugging/preview)
 */
export async function listAllScheduledInvoiceEmails(
  invoice: InvoiceForSchedule,
  now: Date = new Date()
): Promise<ScheduledEmail[]> {
  const scheduled: ScheduledEmail[] = [];
  const dueDate = toDate(invoice.dueAt);
  const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysUntilDue = Math.floor((dueDateOnly.getTime() - nowDateOnly.getTime()) / (1000 * 60 * 60 * 24));

  // Reminder
  if (daysUntilDue >= 3) {
    const reminderDate = new Date(dueDate);
    reminderDate.setDate(reminderDate.getDate() - 3);
    scheduled.push({
      type: "invoice_reminder",
      scheduledFor: setChicago9AM(reminderDate),
    });
  }

  // Due date
  scheduled.push({
    type: "invoice_due",
    scheduledFor: setChicago9AM(dueDate),
  });

  // Late weekly (all 8 weeks)
  for (let week = 1; week <= 8; week++) {
    const weekStartDate = new Date(dueDate);
    weekStartDate.setDate(weekStartDate.getDate() + 7 * week);
    scheduled.push({
      type: "invoice_late_weekly",
      scheduledFor: setChicago9AM(weekStartDate),
      weekNumber: week,
    });
  }

  return scheduled.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
}
