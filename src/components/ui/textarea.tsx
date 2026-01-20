import { TextareaHTMLAttributes, forwardRef } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", error = false, ...props }, ref) => {
    const errorStyles = error ? "border-red-500 focus:ring-red-500 focus:border-red-500" : "border-gray-300 focus:ring-blue-500 focus:border-blue-500";
    
    return (
      <textarea
        ref={ref}
        className={`block w-full rounded-md shadow-sm focus:ring-2 focus:ring-offset-0 ${errorStyles} ${className}`}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";
