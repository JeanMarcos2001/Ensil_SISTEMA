import React, { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', options, error, ...props }, ref) => {
    return (
      <div className="w-full relative">
        <select
          ref={ref}
          className={`w-full px-3 py-2 bg-surface border rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            error ? 'border-danger-text focus:ring-danger-text/20 focus:border-danger-text' : 'border-border-soft'
          } ${className}`}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown 
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" 
          size={16} 
        />
        {error && <p className="mt-1 text-xs text-danger-text">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
