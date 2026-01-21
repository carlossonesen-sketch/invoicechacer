"use client";

import { useEffect, useRef } from "react";

export function NavTracer() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const pathnameCheckRef = useRef<string>("");

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEV_TOOLS !== "1") {
      return;
    }

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    const logNav = (method: string, url: string | URL | null | undefined) => {
      const urlStr = typeof url === "string" ? url : url?.toString() || "";
      console.log(`[NAV] ${method} -> ${urlStr}`);
      console.trace("[NAV TRACE]");
    };

    // Monkey-patch pushState
    history.pushState = function (...args) {
      const url = args[2];
      logNav("pushState", url);
      return originalPushState.apply(this, args);
    };

    // Monkey-patch replaceState
    history.replaceState = function (...args) {
      const url = args[2];
      logNav("replaceState", url);
      return originalReplaceState.apply(this, args);
    };

    // Track pathname changes via interval (catches redirects that don't use pushState)
    let checkCount = 0;
    const maxChecks = 15; // 3 seconds at 200ms intervals
    pathnameCheckRef.current = window.location.pathname;

    intervalRef.current = setInterval(() => {
      checkCount++;
      const currentPathname = window.location.pathname;
      
      if (currentPathname === "/dashboard" && pathnameCheckRef.current !== "/dashboard") {
        console.log(`[NAV] pathname changed to /dashboard (detected via interval check #${checkCount})`);
        console.log(`[NAV] previous pathname was: ${pathnameCheckRef.current}`);
        console.trace("[NAV TRACE]");
      }
      
      pathnameCheckRef.current = currentPathname;

      if (checkCount >= maxChecks) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, 200);

    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return null;
}
