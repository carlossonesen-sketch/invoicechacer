"use client";

import { useEffect } from "react";

/**
 * Debug component to detect unauthorized redirects to /dashboard
 * Only active when NEXT_PUBLIC_DEV_TOOLS=1
 * Monkey-patches history.pushState and history.replaceState to log redirects
 */
export function RouteRedirectTrace() {
  useEffect(() => {
    const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
    if (!devToolsEnabled) {
      return;
    }

    // Store original methods
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    // Monkey-patch pushState
    history.pushState = function (...args) {
      const url = args[2];
      if (typeof url === "string" && url.includes("/dashboard")) {
        console.warn("[REDIRECT TRACE] pushState to /dashboard detected");
        console.log("[REDIRECT TRACE] URL:", url);
        console.trace("[REDIRECT TRACE] Stack trace");
      }
      return originalPushState.apply(history, args);
    };

    // Monkey-patch replaceState
    history.replaceState = function (...args) {
      const url = args[2];
      if (typeof url === "string" && url.includes("/dashboard")) {
        console.warn("[REDIRECT TRACE] replaceState to /dashboard detected");
        console.log("[REDIRECT TRACE] URL:", url);
        console.trace("[REDIRECT TRACE] Stack trace");
      }
      return originalReplaceState.apply(history, args);
    };

    // Cleanup: restore original methods on unmount
    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, []);

  // This component doesn't render anything
  return null;
}
