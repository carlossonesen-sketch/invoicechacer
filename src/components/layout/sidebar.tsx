"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Invoices", href: "/invoices" },
  { name: "Import CSV", href: "/invoices/import" },
  { name: "Company Profile", href: "/settings/company" },
  { name: "Settings", href: "/settings" },
  { name: "Billing", href: "/settings/billing" },
  { name: "Pricing", href: "/pricing", public: true },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center px-6 border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Invoice Chaser</h1>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const handleClick = (e: React.MouseEvent) => {
            // Prevent navigation if already on the target page
            if (pathname === item.href) {
              e.preventDefault();
              const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
              if (devToolsEnabled) {
                console.log("[NAV DEBUG] Sidebar Link click prevented - already on target", { currentPathname: pathname, targetPathname: item.href, linkName: item.name });
              }
              return;
            }
            const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
            if (devToolsEnabled) {
              console.log("[NAV DEBUG] Sidebar Link navigation", { currentPathname: pathname, targetPathname: item.href, linkName: item.name });
            }
          };
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={handleClick}
              className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
