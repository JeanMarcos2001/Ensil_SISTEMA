import React from 'react';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary' | 'secondary';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  const variants = {
    success: 'bg-success-tint text-success-text',
    warning: 'bg-warning-tint text-warning-text',
    danger: 'bg-danger-tint text-danger-text',
    info: 'bg-info-tint text-info-text',
    neutral: 'bg-surface-muted text-text-secondary border border-border-soft',
    primary: 'bg-primary-accent/10 text-primary-accent border border-primary-accent/20',
    secondary: 'bg-surface-muted text-text-muted border border-border-soft',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
