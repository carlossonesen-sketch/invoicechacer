"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { RouteRedirectTrace } from "@/components/debug/route-redirect-trace";
import { RedirectTracer } from "@/components/debug/redirect-tracer";
import { NavTracer } from "@/components/debug/nav-tracer";
import { EnvMissing } from "@/components/env-missing";
import { firebaseUnavailable } from "@/lib/firebase";

export function AppLayout({ children }: { children: React.ReactNode }) {
  // Use state to track if we're on client and Firebase is unavailable
  // Initialize on client side only to match server render
  const [showEnvError] = useState(() => {
    // Initialize on client side only
    if (typeof window !== "undefined" && firebaseUnavailable) {
      return true;
    }
    return false;
  });


  // Show env error only after client-side check (post-hydration)
  if (showEnvError) {
    return <EnvMissing />;
  }

  // Always render the same structure on server and initial client render
  return (
    <div className="flex h-screen bg-gray-50">
      <NavTracer />
      <RouteRedirectTrace />
      <RedirectTracer />
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
