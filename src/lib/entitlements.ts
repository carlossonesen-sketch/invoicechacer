/**
 * EntitlementsService for web
 * Manages Pro plan status using localStorage
 */

const STORAGE_KEY = "invoicechaser_isPro";

/**
 * Check if user has Pro plan
 */
export function getIsPro(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "true";
  } catch (error) {
    console.error("Failed to read entitlements:", error);
    return false;
  }
}

/**
 * Set Pro plan status
 */
export function setIsPro(value: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
    // Dispatch event for components to react to changes
    window.dispatchEvent(new CustomEvent("entitlements-changed", { detail: { isPro: value } }));
  } catch (error) {
    console.error("Failed to set entitlements:", error);
  }
}

/**
 * Subscribe to entitlements changes
 */
export function subscribe(callback: (isPro: boolean) => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: CustomEvent) => {
    callback(event.detail.isPro);
  };

  window.addEventListener("entitlements-changed", handler as EventListener);

  // Return unsubscribe function
  return () => {
    window.removeEventListener("entitlements-changed", handler as EventListener);
  };
}

// Export as class for backward compatibility
export class EntitlementsService {
  static isPro = getIsPro;
  static setPro = setIsPro;
  static subscribe = subscribe;
}
