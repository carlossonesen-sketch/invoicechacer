"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Trial starts automatically at account creation. This route redirects to dashboard.
 */
export default function TrialPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <p className="text-gray-500">Redirecting...</p>
    </div>
  );
}
