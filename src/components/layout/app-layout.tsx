"use client";

import { Sidebar } from "./sidebar";
import { RouteRedirectTrace } from "@/components/debug/route-redirect-trace";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50">
      <RouteRedirectTrace />
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
