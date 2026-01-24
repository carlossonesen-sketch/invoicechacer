"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface HeaderProps {
  title?: string;
  children?: React.ReactNode;
}

const DEV_TOOLS = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";

export function Header({ title, children }: HeaderProps) {
  const router = useRouter();
  const { showToast, ToastComponent } = useToast();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      // Use requestAnimationFrame to avoid setState in effect warning
      requestAnimationFrame(() => setLoading(false));
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUserEmail(user?.email || null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  async function handleLogout() {
    try {
      if (!auth) {
        router.push("/login");
        return;
      }

      // Sign out from Firebase
      await signOut(auth);

      // Clear session cookie via API
      await fetch("/api/auth/logout", {
        method: "POST",
      });

      // Redirect to login
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  async function handleCopyIdToken() {
    if (!auth?.currentUser) {
      showToast("Not logged in", "error");
      return;
    }
    try {
      const token = await auth.currentUser.getIdToken(true);
      await navigator.clipboard.writeText(token);
      showToast("Token copied");
    } catch {
      showToast("Failed to copy", "error");
    }
  }

  return (
    <>
    <header className="h-16 border-b border-gray-200 bg-white px-6 flex items-center justify-between">
      {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
      <div className="flex items-center gap-4">
        {children && <div className="flex items-center gap-4">{children}</div>}
        {!userEmail && !loading && (
          <Button variant="ghost" size="sm" onClick={() => router.push("/pricing")}>
            Pricing
          </Button>
        )}
        {userEmail && (
          <span className="text-sm text-gray-600">{userEmail}</span>
        )}
        {DEV_TOOLS && userEmail && (
          <Button variant="ghost" size="sm" onClick={handleCopyIdToken}>
            Copy ID Token
          </Button>
        )}
        {userEmail && (
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        )}
      </div>
    </header>
    {ToastComponent}
  </>
  );
}
