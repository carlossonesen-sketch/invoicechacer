"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { upsertBusinessProfile } from "@/lib/businessProfile";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { isValidEmail } from "@/lib/utils";
import { User } from "firebase/auth";

export default function CompanyOnboardingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [user, setUser] = useState<User | null>(null);

  const [formData, setFormData] = useState({
    companyName: "",
    companyEmail: "",
    phone: "",
  });

  useEffect(() => {
    if (!auth) {
      router.push("/login");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/login");
        return;
      }
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!formData.companyName.trim()) {
      newErrors.companyName = "Company name is required";
    }

    if (formData.companyEmail && !isValidEmail(formData.companyEmail)) {
      newErrors.companyEmail = "Invalid email address";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    if (!user) {
      setErrors({ submit: "You must be logged in to continue." });
      return;
    }

    setSaving(true);
    setErrors({});

    try {
      await upsertBusinessProfile(user.uid, {
        companyName: formData.companyName.trim(),
        companyEmail: formData.companyEmail.trim() || undefined,
        phone: formData.phone.trim() || undefined,
      });

      // PATHNAME GUARD: Only redirect to dashboard if we're on the onboarding page
      if (pathname !== "/onboarding/company") {
        const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
        if (devToolsEnabled) {
          console.warn(`[Onboarding] BLOCKED redirect to /dashboard - pathname is ${pathname}, not /onboarding/company`);
          console.trace("Redirect blocked");
        }
        return;
      }

      // Redirect to dashboard after successful save
      const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
      if (devToolsEnabled) {
        console.log(`[Onboarding] Redirecting to /dashboard from pathname: ${pathname}`);
        console.trace("Onboarding -> Dashboard redirect");
      }
      router.push("/dashboard");
    } catch (error: any) {
      console.error("Failed to save company profile:", error);
      setErrors({ submit: error.message || "Failed to save company profile. Please try again." });
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <Header title="Company Setup" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-gray-500">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header title="Company Setup" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Welcome to Invoice Chaser!</h2>
              <p className="text-sm text-gray-600">
                Let's set up your company profile to get started.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <FormField label="Company Name" htmlFor="companyName" required error={errors.companyName}>
                <Input
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  error={!!errors.companyName}
                  placeholder="Acme Corp"
                />
              </FormField>

              <FormField label="Company Email (optional)" htmlFor="companyEmail" error={errors.companyEmail}>
                <Input
                  id="companyEmail"
                  type="email"
                  value={formData.companyEmail}
                  onChange={(e) => setFormData({ ...formData, companyEmail: e.target.value })}
                  error={!!errors.companyEmail}
                  placeholder="billing@acmecorp.com"
                />
              </FormField>

              <FormField label="Phone (optional)" htmlFor="phone">
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                />
              </FormField>

              {errors.submit && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <p className="text-sm text-red-800">{errors.submit}</p>
                </div>
              )}

              <div className="flex gap-4">
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? "Saving..." : "Continue to Dashboard"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
