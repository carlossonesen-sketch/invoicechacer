"use client";

import { useState, useEffect } from "react";
import { entitlementsRepo } from "@/data/repositories";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDev] = useState(process.env.NODE_ENV === "development");

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const pro = await entitlementsRepo.isPro();
      setIsPro(pro);
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleTogglePro() {
    setSaving(true);
    try {
      const newValue = !isPro;
      await entitlementsRepo.setProForDev(newValue);
      setIsPro(newValue);
    } catch (error) {
      console.error("Failed to update Pro status:", error);
      alert("Failed to update Pro status. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <Header title="Settings" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-gray-500">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header title="Settings" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-6">
          {/* Plan Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Plan</h3>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {isPro ? "Pro Plan" : "Free Plan"}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {isPro
                    ? "Full access to all features including auto-chase"
                    : "Limited features. Upgrade to Pro for auto-chase."}
                </div>
              </div>
              <div
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  isPro
                    ? "bg-green-100 text-green-800 border border-green-200"
                    : "bg-gray-100 text-gray-800 border border-gray-200"
                }`}
              >
                {isPro ? "Pro" : "Free"}
              </div>
            </div>

            {isDev && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">Enable Pro (Dev)</div>
                    <div className="text-sm text-gray-500 mt-1">
                      Development mode toggle for testing Pro features
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPro}
                      onChange={handleTogglePro}
                      disabled={saving}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Billing Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Billing (Stripe)</h3>
            <p className="text-sm text-gray-500 mb-4">
              Stripe integration coming soon. Manage your subscription and payment methods here.
            </p>
            <Button variant="secondary" disabled>
              Coming Soon
            </Button>
          </div>

          {/* Sync Section (for future) */}
          {isDev && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Sync to Cloud</h3>
              <p className="text-sm text-gray-500 mb-4">
                {isPro
                  ? "Sync your data to the cloud for backup and cross-device access."
                  : "Upgrade to Pro to sync your data to the cloud."}
              </p>
              <Button variant="secondary" disabled>
                {isPro ? "Sync Now" : "Upgrade to Pro"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
