"use client";

import { assertPublicFirebaseEnv } from "@/lib/env";

export function EnvMissing() {
  const validation = assertPublicFirebaseEnv();

  if (validation.isValid) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-2xl w-full bg-white rounded-lg border border-red-200 shadow-lg p-8">
        <div className="flex items-center mb-4">
          <svg
            className="w-8 h-8 text-red-600 mr-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h1 className="text-2xl font-bold text-red-900">Configuration Error</h1>
        </div>

        <p className="text-gray-700 mb-6">
          This deployment is missing required Firebase environment variables.
        </p>

        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <h2 className="text-sm font-semibold text-red-900 mb-3">
            Missing Environment Variables:
          </h2>
          <ul className="list-disc list-inside space-y-1 text-sm text-red-800">
            {validation.missingKeys.map((key) => (
              <li key={key} className="font-mono">{key}</li>
            ))}
          </ul>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <h2 className="text-sm font-semibold text-blue-900 mb-2">
            How to Fix:
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
            <li>Go to your Vercel project settings</li>
            <li>Navigate to <strong>Settings → Environment Variables</strong></li>
            <li>Add all the missing variables listed above</li>
            <li>Ensure they are enabled for <strong>Preview</strong> and <strong>Production</strong> environments</li>
            <li>Redeploy your application</li>
          </ol>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            For local development, add these variables to your <code className="bg-gray-100 px-1 rounded">.env.local</code> file.
          </p>
        </div>
      </div>
    </div>
  );
}
