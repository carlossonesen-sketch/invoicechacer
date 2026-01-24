"use client";

import { assertPublicFirebaseEnv } from "@/lib/env";
import { firebaseUnavailable } from "@/lib/firebase";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function EnvDebugPage() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const devToolsEnabled = typeof window !== "undefined" && process.env.NEXT_PUBLIC_DEV_TOOLS === "1";

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  // Only show this page if dev tools are enabled
  if (!devToolsEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-2xl w-full bg-white rounded-lg border border-gray-200 shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-700">
            This debug page is only available when <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_DEV_TOOLS=1</code> is set.
          </p>
        </div>
      </div>
    );
  }

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const validation = assertPublicFirebaseEnv();
  const requiredKeys = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ];

  const vercelEnv = typeof window !== "undefined" 
    ? process.env.NEXT_PUBLIC_VERCEL_ENV || "development"
    : "server";

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto bg-white rounded-lg border border-gray-200 shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Environment Variables Debug</h1>

        <div className="space-y-6">
          {/* Deployment Environment */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h2 className="text-sm font-semibold text-blue-900 mb-2">Deployment Environment</h2>
            <p className="text-blue-800 font-mono">{vercelEnv}</p>
          </div>

          {/* Firebase Availability Status */}
          <div className={`border rounded-md p-4 ${firebaseUnavailable ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <h2 className={`text-sm font-semibold mb-2 ${firebaseUnavailable ? 'text-red-900' : 'text-green-900'}`}>
              Firebase Availability
            </h2>
            <p className={firebaseUnavailable ? 'text-red-800' : 'text-green-800'}>
              {firebaseUnavailable ? "❌ Unavailable" : "✅ Available"}
            </p>
          </div>

          {/* Current Pathname */}
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Current Pathname</h2>
            <p className="text-gray-800 font-mono">{pathname}</p>
          </div>

          {/* Environment Variables Status */}
          <div className="border border-gray-200 rounded-md p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Firebase Environment Variables</h2>
            <div className="space-y-2">
              {requiredKeys.map((key) => {
                const isPresent = !validation.missingKeys.includes(key);
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between p-3 rounded ${
                      isPresent ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                    }`}
                  >
                    <span className="font-mono text-sm">{key}</span>
                    <span className={isPresent ? "text-green-800 font-semibold" : "text-red-800 font-semibold"}>
                      {isPresent ? "✅ Present" : "❌ Missing"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Missing Keys Summary */}
          {validation.missingKeys.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <h2 className="text-sm font-semibold text-red-900 mb-2">Missing Variables</h2>
              <ul className="list-disc list-inside space-y-1 text-sm text-red-800">
                {validation.missingKeys.map((key) => (
                  <li key={key} className="font-mono">{key}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h2 className="text-sm font-semibold text-blue-900 mb-2">How to Fix Missing Variables</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
              <li>Go to Vercel Dashboard → Your Project → Settings → Environment Variables</li>
              <li>Add all missing variables listed above</li>
              <li>Enable them for <strong>Preview</strong> and <strong>Production</strong> environments</li>
              <li>Redeploy your application</li>
            </ol>
            <p className="text-xs text-blue-700 mt-4">
              See <code className="bg-blue-100 px-1 rounded">docs/vercel-env-setup.md</code> for detailed instructions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
