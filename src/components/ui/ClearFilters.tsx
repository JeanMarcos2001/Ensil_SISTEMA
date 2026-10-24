import React from 'react';
import { Filter } from 'lucide-react';
import { Button } from './Button';

interface Props {
  /** ¿Hay algún filtro aplicado? Si no, el botón queda apagado. */
  active: boolean;
  onClear: () => void;
  className?: string;
}

/** Botón de filtros de las tablas: limpia todos los filtros aplicados (búsqueda y listas). */
export function ClearFilters({ active, onClear, className = '' }: Props) {
  return (
    <Button
      variant="secondary"
      className={`shrink-0 px-3 gap-2 ${className}`}
      onClick={onClear}
      disabled={!active}
      title={active ? 'Quitar todos los filtros' : 'No hay filtros aplicados'}
    >
      <Filter size={16} />
      <span className="hidden lg:inline text-sm">Limpiar</span>
    </Button>
  );
}
