import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({ variant = 'primary', size = 'md', children, className = '', ...props }: ButtonProps) {
  const baseStyle = "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-accent disabled:opacity-50 disabled:pointer-events-none";
  const variants = {
    primary: "bg-primary-accent text-white hover:bg-primary-accent/90",
    secondary: "bg-surface border border-border-soft text-text-primary hover:bg-surface-muted shadow-sm",
    ghost: "bg-transparent text-text-secondary hover:bg-surface-muted hover:text-text-primary",
    outline: "bg-transparent border border-border-strong text-text-primary hover:bg-surface-muted",
    danger: "bg-error text-white hover:bg-error/90",
  };
  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}
