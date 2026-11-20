import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, TriangleAlert } from 'lucide-react';
import { Button } from '../ui/Button';
import { useData } from '../../context/DataContext';
import { messagesOf, requirementAcceptsMessages, requirementMessageError, REQUIREMENT_LIMITS } from '../../utils/requirements';

const stamp = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' });
};

/**
 * Los mensajes anclados a un requerimiento (no es la mensajería interna): la sede pregunta o corrige, Logística responde. Mientras la conversación está abierta,
 * lo que llega se da por visto (desaparece la marca de «mensaje nuevo» de la tarjeta). Solo se escribe mientras el requerimiento está pendiente.
 */
export function RequirementThread({ requirementId }: { requirementId: string }) {
  const { requirements, requirementMessages, requirementSeen, addRequirementMessage, markRequirementMessagesSeen, currentUser, can } = useData();
  const req = requirements.find(r => r.id === requirementId);
  const thread = messagesOf(requirementMessages, requirementId);
  const lastId = thread.length > 0 ? thread[thread.length - 1].id : 0;
  const seen = requirementSeen[requirementId] ?? 0;
  // Lo que ya estaba visto al abrir no se resalta; lo que llega después sí
  const seenAtOpen = useRef(seen);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (lastId > seen) void markRequirementMessagesSeen(requirementId);
  }, [lastId, seen, requirementId, markRequirementMessagesSeen]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [lastId]);

  const canWrite = can('log-requerimientos:message') && !!req && requirementAcceptsMessages(req);

  const send = async () => {
    if (saving) return;
    const invalid = requirementMessageError(text);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError(null);
    const res = await addRequirementMessage(requirementId, text);
    setSaving(false);
    if (!res.ok) { setError(res.error ?? 'No se pudo enviar el mensaje.'); return; }
    setText('');
  };

  return (
    <section className="space-y-3" aria-label="Mensajes del requerimiento">
      <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
        <MessageSquare size={16} className="text-primary-accent" aria-hidden />
        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Mensajes</h3>
      </div>
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {thread.length === 0 && <p className="text-xs text-text-muted py-2">Todavía no hay mensajes.</p>}
        {thread.map(m => {
          const mine = !!currentUser.id && m.authorId === currentUser.id;
          const fresh = !mine && m.id > seenAtOpen.current;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm border ${mine ? 'bg-active-tint border-primary-accent/20' : 'bg-surface-muted border-border-soft'}`}>
                <div className="flex items-center gap-2 text-[11px] text-text-muted mb-0.5">
                  <span className="font-medium text-text-secondary">{m.authorName}</span>
                  <span>{m.side === 'logistica' ? 'Logística' : 'Sede'}</span>
                  <span>{stamp(m.createdAt)}</span>
                  {fresh && <span className="px-1.5 rounded-full bg-primary-accent text-white text-[10px]">Nuevo</span>}
                </div>
                <p className="whitespace-pre-wrap break-words text-text-primary">{m.text}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {canWrite ? (
        <div className="space-y-2">
          <textarea
            className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-16 transition-all focus:ring-2 focus:ring-primary-accent/10"
            value={text} onChange={e => setText(e.target.value)} maxLength={REQUIREMENT_LIMITS.messageMax}
            placeholder="Escriba un mensaje sobre este requerimiento…" aria-label="Mensaje"
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }}
          />
          {error && <p role="alert" className="flex items-start gap-1.5 text-xs text-danger-text"><TriangleAlert size={12} className="shrink-0 mt-0.5" />{error}</p>}
          <div className="flex justify-end">
            <Button variant="primary" size="sm" className="gap-1.5" onClick={() => void send()} disabled={saving || text.trim().length === 0}>
              <Send size={14} />{saving ? 'Enviando…' : 'Enviar mensaje'}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-text-muted">
          {req && !requirementAcceptsMessages(req) ? 'Este requerimiento ya está cerrado: no admite más mensajes.' : 'Su cuenta no puede escribir en los requerimientos.'}
        </p>
      )}
    </section>
  );
}
