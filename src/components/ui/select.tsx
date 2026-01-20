import { SelectHTMLAttributes, forwardRef } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = "", error = false, children, ...props }, ref) => {
    const errorStyles = error ? "border-red-500 focus:ring-red-500 focus:border-red-500" : "border-gray-300 focus:ring-blue-500 focus:border-blue-500";
    
    return (
      <select
        ref={ref}
        className={`block w-full rounded-md shadow-sm focus:ring-2 focus:ring-offset-0 ${errorStyles} ${className}`}
        {...props}
      >
        {children}
      </select>
    );
  }
);

Select.displayName = "Select";
