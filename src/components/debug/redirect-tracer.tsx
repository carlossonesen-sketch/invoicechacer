"use client";

import { useEffect } from "react";

export function RedirectTracer() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEV_TOOLS !== "1") {
      return;
    }

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    const logRedirect = (type: string, url: string | URL | null | undefined) => {
      const urlStr = typeof url === "string" ? url : url?.toString() || "";
      if (urlStr.includes("/dashboard")) {
        console.log(`[NAV->] ${type} to /dashboard: ${urlStr}`);
        console.trace("NAV TRACE");
      }
    };

    history.pushState = function (...args) {
      logRedirect("pushState", args[2] as string);
      return originalPushState.apply(this, args);
    };

    history.replaceState = function (...args) {
      logRedirect("replaceState", args[2] as string);
      return originalReplaceState.apply(this, args);
    };

    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, []);

  return null;
}
