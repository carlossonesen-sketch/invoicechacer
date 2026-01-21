"use client";

import { Sidebar } from "./sidebar";
import { RouteRedirectTrace } from "@/components/debug/route-redirect-trace";
import { RedirectTracer } from "@/components/debug/redirect-tracer";
import { NavTracer } from "@/components/debug/nav-tracer";

export function AppLayout({ children }: { children: React.ReactNode }) {
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
