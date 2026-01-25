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
import { isValidEmail, isValidUrl } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

interface FormData {
  companyName: string;
  email: string;
  phone: string;
  logoUrl: string;
  defaultPaymentLink: string;
}

export default function BusinessProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<FormData>({
    companyName: "",
    email: "",
    phone: "",
    logoUrl: "",
    defaultPaymentLink: "",
  });
  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login?redirect=/profile");
        return;
      }
      loadProfile(user.uid);
    });
    return () => unsub();
  }, [router]);

  async function loadProfile(uid: string) {
    try {
      setLoading(true);
      const profile = await getBusinessProfile(uid);
      if (profile) {
        setFormData({
          companyName: profile.companyName || "",
          email: profile.companyEmail || "",
          phone: profile.phone || "",
          logoUrl: profile.logoUrl || "",
          defaultPaymentLink: profile.defaultPaymentLink || "",
        });
      }
    } catch (error) {
      console.error("Failed to load business profile:", error);
      setErrors({ submit: "Failed to load profile." });
    } finally {
      setLoading(false);
    }
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!formData.companyName.trim()) newErrors.companyName = "Company name is required";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    else if (!isValidEmail(formData.email)) newErrors.email = "Invalid email address";
    if (formData.logoUrl && !isValidUrl(formData.logoUrl)) newErrors.logoUrl = "Logo URL must be a valid HTTP/HTTPS URL";
    if (formData.defaultPaymentLink && !isValidUrl(formData.defaultPaymentLink)) newErrors.defaultPaymentLink = "Default payment link must be a valid HTTP/HTTPS URL";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const user = auth?.currentUser;
    if (!user) {
      setErrors({ submit: "You must be logged in to save." });
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      await upsertBusinessProfile(user.uid, {
        companyName: formData.companyName.trim(),
        companyEmail: formData.email.trim(),
        phone: formData.phone?.trim() || undefined,
        logoUrl: formData.logoUrl?.trim() ? formData.logoUrl.trim() : null,
        defaultPaymentLink: formData.defaultPaymentLink?.trim() ? formData.defaultPaymentLink.trim() : null,
      });
      showToast("Business profile saved successfully!", "success");
    } catch (error) {
      console.error("Failed to save business profile:", error);
      setErrors({ submit: "Failed to save business profile. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <Header title="Business Profile" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-gray-500">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header title="Business Profile" />
      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSave} className="max-w-2xl space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">Company Information</h3>

            <FormField label="Company Name" htmlFor="companyName" required error={errors.companyName}>
              <Input
                id="companyName"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                error={!!errors.companyName}
              />
            </FormField>

            <FormField label="Email" htmlFor="email" required error={errors.email}>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                error={!!errors.email}
              />
            </FormField>

            <FormField label="Phone (optional)" htmlFor="phone" error={errors.phone}>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                error={!!errors.phone}
              />
            </FormField>

            <FormField label="Logo URL (optional)" htmlFor="logoUrl" error={errors.logoUrl}>
              <Input
                id="logoUrl"
                type="url"
                placeholder="https://..."
                value={formData.logoUrl}
                onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                error={!!errors.logoUrl}
              />
            </FormField>

            <FormField label="Default Payment Link (optional)" htmlFor="defaultPaymentLink" error={errors.defaultPaymentLink}>
              <Input
                id="defaultPaymentLink"
                type="url"
                placeholder="https://..."
                value={formData.defaultPaymentLink}
                onChange={(e) => setFormData({ ...formData, defaultPaymentLink: e.target.value })}
                error={!!errors.defaultPaymentLink}
              />
              <p className="mt-1 text-sm text-gray-500">
                This link will be used as the default payment link when creating new invoices.
              </p>
            </FormField>
          </div>

          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-800">{errors.submit}</p>
            </div>
          )}

          <div className="flex gap-4">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Profile"}
            </Button>
          </div>
        </form>
      </div>
      {ToastComponent}
    </AppLayout>
  );
}
