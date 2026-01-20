"use client";

import { useRouter } from "next/navigation";
import { Button } from "./button";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
}

export function UpgradeModal({ isOpen, onClose, title, message }: UpgradeModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const handleUpgrade = () => {
    onClose();
    router.push("/settings/billing");
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {title || "Upgrade to Pro"}
          </h3>
          <p className="text-sm text-gray-600 mb-6">
            {message || "This feature is available on the Pro plan. Upgrade now to unlock all features including auto-chase."}
          </p>
          
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleUpgrade}>
              Upgrade to Pro
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
