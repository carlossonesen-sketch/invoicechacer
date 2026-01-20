import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", error = false, ...props }, ref) => {
    const errorStyles = error ? "border-red-500 focus:ring-red-500 focus:border-red-500" : "border-gray-300 focus:ring-blue-500 focus:border-blue-500";
    
    return (
      <input
        ref={ref}
        className={`block w-full rounded-md shadow-sm focus:ring-2 focus:ring-offset-0 ${errorStyles} ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
