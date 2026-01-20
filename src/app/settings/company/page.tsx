"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getBusinessProfile, upsertBusinessProfile } from "@/lib/businessProfile";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { isValidEmail } from "@/lib/utils";
import { User } from "firebase/auth";

export default function CompanySettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [user, setUser] = useState<User | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>("");

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

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/login");
        return;
      }
      setUser(currentUser);

      try {
        // Use one-time fetch instead of subscription for better performance
        const profile = await getBusinessProfile(currentUser.uid);
        if (profile) {
          setFormData({
            companyName: profile.companyName || "",
            companyEmail: profile.companyEmail || "",
            phone: profile.phone || "",
          });
        }
        setLoading(false);
      } catch (error) {
        console.error("Failed to load company profile:", error);
        setLoading(false);
      }
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
      setErrors({ submit: "You must be logged in to save changes." });
      return;
    }

    setSaving(true);
    setErrors({});
    setSuccessMessage("");

    try {
      await upsertBusinessProfile(user.uid, {
        companyName: formData.companyName.trim(),
        companyEmail: formData.companyEmail.trim() || undefined,
        phone: formData.phone.trim() || undefined,
      });

      setSuccessMessage("Company profile updated successfully!");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error: any) {
      console.error("Failed to save company profile:", error);
      setErrors({ submit: error.message || "Failed to save company profile. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <Header title="Company Profile" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-gray-500">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header title="Company Profile" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-6">
          {/* Back Link */}
          <div>
            <button
              onClick={() => router.push("/settings")}
              className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <span className="mr-1">←</span>
              Back to Settings
            </button>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Company Information</h3>
              <p className="text-sm text-gray-500">
                Update your company details. This information may be used in invoices and communications.
              </p>
            </div>

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

            {successMessage && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <p className="text-sm text-green-800">{successMessage}</p>
              </div>
            )}

            {errors.submit && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-sm text-red-800">{errors.submit}</p>
              </div>
            )}

            <div className="flex gap-4">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push("/settings")}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
