import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface HelpPopoverProps {
  title: string;
  children: React.ReactNode;
}

export function HelpPopover({ title, children }: HelpPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-accent focus:ring-offset-1 ${
          isOpen 
            ? 'bg-primary-accent text-white' 
            : 'bg-surface border border-border-soft text-text-muted hover:text-primary-accent hover:border-primary-accent/30 hover:bg-surface-muted'
        }`}
        aria-label="Ayuda contextual"
        aria-expanded={isOpen}
      >
        <HelpCircle size={18} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-surface border border-border-soft rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-soft bg-surface-muted/50">
            <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-text-muted hover:text-text-primary transition-colors rounded-full p-1 hover:bg-border-soft/50"
              aria-label="Cerrar ayuda"
            >
              <X size={14} />
            </button>
          </div>
          <div className="p-4 max-h-[400px] overflow-y-auto text-sm text-text-secondary space-y-4">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
