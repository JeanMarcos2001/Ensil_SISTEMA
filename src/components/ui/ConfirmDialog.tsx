import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | 'warning';
  hideCancel?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'SÍ, CONTINUAR',
  cancelLabel = 'NO, CANCELAR',
  variant = 'primary',
  hideCancel = false
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const variantStyles = {
    danger: 'bg-error/10 text-error',
    primary: 'bg-primary-accent/10 text-primary-accent',
    warning: 'bg-warning/10 text-warning',
  };

  const buttonVariants = {
    danger: 'danger' as const,
    primary: 'primary' as const,
    warning: 'primary' as const, // Button doesn't have warning variant, use primary
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-3 w-full">
          {!hideCancel && (
            <Button variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">
              {cancelLabel}
            </Button>
          )}
          <Button 
            variant={buttonVariants[variant]} 
            onClick={handleConfirm}
            className="flex-1 sm:flex-none"
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center text-center space-y-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${variantStyles[variant]}`}>
          <AlertTriangle size={24} />
        </div>
        <div className="space-y-2">
          <p className="text-sm text-text-secondary leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </Modal>
  );
}
