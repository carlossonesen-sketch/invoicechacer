const STORAGE_KEYS = {
  INVOICES: "invoice_chaser:invoices",
  CHASE_EVENTS: "invoice_chaser:chase_events",
  BUSINESS_PROFILE: "invoice_chaser:business_profile",
  ENTITLEMENTS: "invoice_chaser:entitlements",
} as const;

export function getItem<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setItem<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to save to localStorage:`, error);
  }
}

export function removeItem(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
}

export const storage = {
  getItem,
  setItem,
  removeItem,
  keys: STORAGE_KEYS,
};
