import React from 'react';

/** Dice si la pantalla se actualiza en vivo o, si la conexión en vivo no está activa, cada 30 segundos (`LIVE_POLL_MS`). */
export function LiveIndicator({ connected }: { connected: boolean }) {
  return (
    <p
      className="mt-1 text-[11px] flex items-center gap-1.5 text-text-muted"
      title={connected ? 'Los cambios de otras personas aparecen solos.' : 'La conexión en vivo no está activa: la pantalla se actualiza sola cada 30 segundos.'}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? 'bg-success-text' : 'bg-text-muted'}`} aria-hidden />
      {connected ? 'En vivo' : 'Se actualiza cada 30 segundos'}
    </p>
  );
}
