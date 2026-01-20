export function Skeleton({ className = "", width, height }: { className?: string; width?: string; height?: string }) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      style={{
        width: width || "100%",
        height: height || "1rem",
      }}
    />
  );
}

export function InvoiceRowSkeleton() {
  return (
    <tr className="animate-pulse">
      <td className="px-6 py-4 whitespace-nowrap">
        <Skeleton height="1rem" width="120px" className="mb-2" />
        <Skeleton height="0.875rem" width="150px" />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Skeleton height="1rem" width="80px" />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Skeleton height="1.5rem" width="80px" className="rounded-full" />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Skeleton height="1rem" width="100px" />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Skeleton height="1rem" width="100px" />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Skeleton height="1rem" width="60px" />
      </td>
    </tr>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-6">
            <Skeleton height="0.875rem" width="100px" className="mb-2" />
            <Skeleton height="2rem" width="120px" />
          </div>
        ))}
      </div>

      {/* Table Skeleton */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <Skeleton height="1.25rem" width="200px" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <th key={i} className="px-6 py-3 text-left">
                    <Skeleton height="0.75rem" width="80px" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {[1, 2, 3, 4, 5].map((i) => (
                <InvoiceRowSkeleton key={i} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
