"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getIsPro, subscribe } from "@/lib/entitlements";

/**
 * Hook to check Pro plan status and react to changes
 */
export function useEntitlements() {
  const router = useRouter();
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial load
    setIsPro(getIsPro());
    setLoading(false);

    // Subscribe to changes
    const unsubscribe = subscribe((proStatus) => {
      setIsPro(proStatus);
    });

    return unsubscribe;
  }, []);

  const upgradeUrl = "/settings/billing";
  
  const openUpgrade = () => {
    router.push(upgradeUrl);
  };

  return { isPro, loading, upgradeUrl, openUpgrade };
}
