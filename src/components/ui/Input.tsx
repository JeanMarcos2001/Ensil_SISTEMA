import React, { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          className={`w-full px-3 py-2 bg-surface border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            error ? 'border-danger-text focus:ring-danger-text/20 focus:border-danger-text' : 'border-border-soft'
          } ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-danger-text">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
