import React from 'react';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-border-soft rounded-xl p-5 md:p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}
