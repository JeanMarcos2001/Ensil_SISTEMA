import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
}

export function ActionMenu({ items }: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    
    function handleScroll() {
      if (isOpen) setIsOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true); // Use capture phase to catch scroll on any element
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen]);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + window.scrollY + 4,
        right: window.innerWidth - rect.right - window.scrollX
      });
    }
    setIsOpen(!isOpen);
  };

  return (
    <>
      <button 
        ref={buttonRef}
        onClick={toggleMenu}
        className={`p-1.5 rounded-lg transition-colors ${isOpen ? 'bg-surface-muted text-text-primary' : 'text-text-muted hover:text-text-primary hover:bg-surface-muted'}`}
      >
        <MoreVertical size={16} />
      </button>

      {isOpen && createPortal(
        <div 
          ref={menuRef}
          className="fixed w-48 bg-surface border border-border-soft rounded-xl shadow-lg z-[9999] p-1 animate-in fade-in zoom-in-95 duration-100"
          style={{ 
            top: `${menuPosition.top}px`, 
            right: `${menuPosition.right}px` 
          }}
        >
          {items.map((item, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                if (!item.disabled) {
                  item.onClick();
                  setIsOpen(false);
                }
              }}
              disabled={item.disabled}
              className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                item.disabled
                  ? 'text-text-muted cursor-not-allowed opacity-50'
                  : item.danger 
                    ? 'text-danger-text hover:bg-danger-tint' 
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
