import React, { useMemo, useState } from 'react';
import { Search, Edit, Inbox, Send, Star, Trash2, Archive, User, Paperclip, X, AlertCircle, Undo2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Select } from '../components/ui/Select';
import { useData } from '../context/DataContext';

type FolderId = 'inbox' | 'sent' | 'starred' | 'drafts' | 'archived' | 'trash';

interface Message {
  id: number;
  sender: string;
  recipient?: string;
  subject: string;
  preview: string;
  date: string;
  read: boolean;
  /** Carpeta en la que está (los destacados se calculan con `starred`). */
  folder: Exclude<FolderId, 'starred'>;
  /** Carpeta a la que vuelve si se restaura desde la papelera. */
  previousFolder?: Exclude<FolderId, 'starred' | 'trash'>;
  starred: boolean;
  content: string;
  attachments: string[];
}

const nowLabel = () => new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
const previewOf = (text: string) => (text.length > 50 ? `${text.substring(0, 50)}...` : text);

export function Messaging() {
  const { staff } = useData();
  const [activeFolder, setActiveFolder] = useState<FolderId>('inbox');
  const [selectedMessage, setSelectedMessage] = useState<number | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [toDelete, setToDelete] = useState<number | null>(null);

  const emptyCompose = { recipient: '', subject: '', content: '', attachments: [] as string[] };
  const [composeData, setComposeData] = useState(emptyCompose);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      sender: 'Sistema',
      subject: 'Alerta: Bajo stock - Material Lógico',
      preview: 'El material "Lógico Matemático" en Sede Central ha bajado del nivel...',
      date: '10:30 AM',
      read: false,
      folder: 'inbox',
      starred: false,
      attachments: [],
      content: 'El material "Lógico Matemático" en Sede Central ha bajado del nivel mínimo establecido. Hay 5 unidades restantes. Por favor genere una reposición.'
    },
    {
      id: 2,
      sender: 'María Laura (Psicopedagogía)',
      subject: 'Derivación de alumno: Carlos Ruiz',
      preview: 'Hola, te comparto el informe del alumno Carlos Ruiz para su...',
      date: 'Ayer',
      read: true,
      folder: 'inbox',
      starred: false,
      attachments: ['informe_carlos_ruiz.pdf'],
      content: 'Hola, te comparto el informe del alumno Carlos Ruiz para su evaluación de la primera asesoría. Adjunto el PDF.'
    },
    {
      id: 3,
      sender: 'Sistema',
      subject: 'Envío confirmado #ENV-2342',
      preview: 'El envío ENV-2342 hacia sede Norte ha sido marcado como "En...',
      date: '14 Abr',
      read: true,
      folder: 'inbox',
      starred: false,
      attachments: [],
      content: 'El envío ENV-2342 hacia sede Norte ha sido marcado como "En tránsito". Puedes verificar el seguimiento desde el kardex.'
    }
  ]);

  const countOf = (id: FolderId) => {
    if (id === 'inbox') return messages.filter(m => m.folder === 'inbox' && !m.read).length;
    if (id === 'drafts') return messages.filter(m => m.folder === 'drafts').length;
    return 0;
  };
  const folders: { id: FolderId; label: string; icon: React.ElementType }[] = [
    { id: 'inbox', label: 'Bandeja de entrada', icon: Inbox },
    { id: 'sent', label: 'Enviados', icon: Send },
    { id: 'starred', label: 'Destacados', icon: Star },
    { id: 'drafts', label: 'Borradores', icon: Edit },
    { id: 'archived', label: 'Archivados', icon: Archive },
    { id: 'trash', label: 'Papelera', icon: Trash2 },
  ];

  const term = searchTerm.trim().toLowerCase();
  const activeMessages = useMemo(
    () => messages
      .filter(m => (activeFolder === 'starred' ? m.starred && m.folder !== 'trash' : m.folder === activeFolder))
      .filter(m => !term || m.sender.toLowerCase().includes(term) || m.subject.toLowerCase().includes(term) || m.content.toLowerCase().includes(term)),
    [messages, activeFolder, term]
  );
  const currentMsg = messages.find(m => m.id === selectedMessage && activeMessages.some(a => a.id === m.id));

  const patch = (id: number, data: Partial<Message>) => setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...data } : m)));
  const nextId = () => messages.reduce((a, m) => Math.max(a, m.id), 0) + 1;

  const handleSendMessage = () => {
    setFormError(null);
    if (!composeData.recipient || !composeData.subject.trim() || !composeData.content.trim()) {
      setFormError('Por favor completa los campos del mensaje.');
      return;
    }
    const newMsg: Message = {
      id: nextId(), sender: 'Yo', recipient: composeData.recipient, subject: composeData.subject.trim(), preview: previewOf(composeData.content),
      date: nowLabel(), read: true, folder: 'sent', starred: false, content: composeData.content, attachments: composeData.attachments,
    };
    setMessages([newMsg, ...messages]);
    setIsComposeOpen(false);
    setComposeData(emptyCompose);
    setActiveFolder('sent');
    setSelectedMessage(newMsg.id);
  };

  const handleSaveDraft = () => {
    if (!composeData.recipient && !composeData.subject.trim() && !composeData.content.trim() && composeData.attachments.length === 0) {
      setIsComposeOpen(false);
      return;
    }
    const draft: Message = {
      id: nextId(), sender: 'Yo', recipient: composeData.recipient, subject: composeData.subject.trim() || '(Sin asunto)', preview: previewOf(composeData.content),
      date: nowLabel(), read: true, folder: 'drafts', starred: false, content: composeData.content, attachments: composeData.attachments,
    };
    setMessages([draft, ...messages]);
    setIsComposeOpen(false);
    setComposeData(emptyCompose);
  };

  const openCompose = (data = emptyCompose) => {
    setFormError(null);
    setComposeData(data);
    setIsComposeOpen(true);
  };

  /** Responder: el destinatario es el remitente si es una persona del personal (los avisos del sistema no se responden). */
  const staffName = (m: { names: string; lastNameP: string }) => `${m.names} ${m.lastNameP}`;
  const replyRecipient = (m: Message) => {
    const found = staff.find(s => m.sender.startsWith(staffName(s)));
    return found ? staffName(found) : '';
  };
  const handleReply = (m: Message) => openCompose({ recipient: replyRecipient(m), subject: m.subject.startsWith('Re: ') ? m.subject : `Re: ${m.subject}`, content: `\n\n— ${m.sender} escribió:\n${m.content}`, attachments: [] });
  const handleForward = (m: Message) => openCompose({ recipient: '', subject: m.subject.startsWith('Fwd: ') ? m.subject : `Fwd: ${m.subject}`, content: `\n\n— Mensaje reenviado de ${m.sender}:\n${m.content}`, attachments: m.attachments });

  const openMessage = (m: Message) => {
    if (m.folder === 'drafts') {
      // Un borrador se sigue editando: vuelve al formulario y sale de la carpeta
      setMessages(prev => prev.filter(x => x.id !== m.id));
      openCompose({ recipient: m.recipient ?? '', subject: m.subject === '(Sin asunto)' ? '' : m.subject, content: m.content, attachments: m.attachments });
      return;
    }
    patch(m.id, { read: true });
    setSelectedMessage(m.id);
  };

  const moveTo = (m: Message, folder: Message['folder']) => {
    patch(m.id, folder === 'trash' ? { folder, previousFolder: m.folder === 'trash' ? m.previousFolder : (m.folder as Message['previousFolder']) } : { folder });
    setSelectedMessage(null);
  };

  const addAttachments = (files: FileList | null) => {
    if (!files) return;
    const names = Array.from(files).map(f => f.name).filter(n => !composeData.attachments.includes(n));
    setComposeData(c => ({ ...c, attachments: [...c.attachments, ...names] }));
  };

  return (
    <div className="h-full flex flex-col">
       <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Centro de Mensajería Institucional</h1>
          <p className="text-text-secondary mt-1">Gestión de comunicaciones internas y notificaciones del sistema.</p>
       </div>

      <div className="flex-1 flex bg-surface border border-border-soft rounded-xl overflow-hidden shadow-sm min-h-0">
        {/* Sidebar - Folders */}
        <div className="w-64 border-r border-border-soft bg-surface-muted/30 flex flex-col">
          <div className="p-4 border-b border-border-soft">
            <Button className="w-full gap-2 h-11 rounded-xl shadow-lg shadow-primary-accent/10" variant="primary" onClick={() => openCompose()}>
              <Edit size={18} /> Redactar Correo
            </Button>
          </div>
        <div className="p-2 space-y-1 flex-1 overflow-y-auto">
          {folders.map(folder => {
            const Icon = folder.icon;
            const isActive = activeFolder === folder.id;
            const count = countOf(folder.id);
            return (
              <button
                key={folder.id}
                onClick={() => { setActiveFolder(folder.id); setSelectedMessage(null); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive ? 'bg-active-tint text-primary-accent font-medium' : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'}`}
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} className={isActive ? 'text-primary-accent' : 'text-text-muted'} />
                  <span>{folder.label}</span>
                </div>
                {count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-primary-accent text-white' : 'bg-surface-muted text-text-muted'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Message List */}
      <div className="w-80 border-r border-border-soft bg-surface flex flex-col">
        <div className="p-3 border-b border-border-soft bg-surface-50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              type="text"
              placeholder="Buscar en mensajes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-border-soft rounded-lg text-sm placeholder:text-text-muted focus:outline-none focus:border-primary-accent"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeMessages.length === 0 ? (
            <div className="p-12 text-center text-text-muted flex flex-col items-center justify-center h-full opacity-60">
               <div className="w-16 h-16 bg-surface-muted rounded-full flex items-center justify-center mb-4">
                 <Archive size={32} />
               </div>
               <p className="font-medium">{term ? 'Sin resultados' : 'No hay mensajes aquí'}</p>
               <p className="text-xs mt-1">{term ? 'Ningún mensaje coincide con la búsqueda' : `La carpeta ${folders.find(f => f.id === activeFolder)?.label} está vacía`}</p>
            </div>
          ) : (
            activeMessages.map(msg => (
              <button
                key={msg.id}
                onClick={() => openMessage(msg)}
                className={`w-full text-left p-4 border-b border-border-soft transition-all hover:bg-surface-muted group relative ${selectedMessage === msg.id ? 'bg-primary-accent/5' : ''} ${!msg.read ? 'bg-surface' : 'opacity-80'}`}
              >
                {selectedMessage === msg.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-accent" />
                )}
                <div className="flex justify-between items-start mb-1">
                  <span className={`text-sm truncate pr-2 ${!msg.read ? 'font-bold text-primary-accent' : 'font-semibold text-text-secondary'}`}>
                    {msg.starred && <Star size={12} className="inline mr-1 text-warning-text fill-current" />}
                    {msg.folder === 'sent' || msg.folder === 'drafts' ? `Para: ${msg.recipient === 'all' ? 'Todos' : msg.recipient || '—'}` : msg.sender}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-text-muted whitespace-nowrap">{msg.date}</span>
                </div>
                <div className={`text-sm mb-1 truncate tracking-tight ${!msg.read ? 'font-bold text-text-primary' : 'text-text-secondary'}`}>
                  {msg.subject}
                </div>
                <div className="text-xs text-text-muted truncate leading-relaxed">
                  {msg.preview}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message Reader */}
      <div className="flex-1 bg-surface flex flex-col">
        {currentMsg ? (
          <>
            <div className="p-4 border-b border-border-soft flex justify-between items-center bg-surface-50">
              <div className="flex items-center gap-2">
                {currentMsg.folder === 'trash' ? (
                  <button title="Restaurar" onClick={() => moveTo(currentMsg, currentMsg.previousFolder ?? 'inbox')} className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-muted rounded-full transition-colors">
                    <Undo2 size={18} />
                  </button>
                ) : (
                  <button title={currentMsg.folder === 'archived' ? 'Mover a la bandeja de entrada' : 'Archivar'} onClick={() => moveTo(currentMsg, currentMsg.folder === 'archived' ? 'inbox' : 'archived')} className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-muted rounded-full transition-colors">
                    <Archive size={18} />
                  </button>
                )}
                <button
                  title={currentMsg.folder === 'trash' ? 'Eliminar definitivamente' : 'Mover a la papelera'}
                  onClick={() => (currentMsg.folder === 'trash' ? setToDelete(currentMsg.id) : moveTo(currentMsg, 'trash'))}
                  className="p-2 text-text-muted hover:text-danger hover:bg-danger-tint rounded-full transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 lg:p-10 custom-scrollbar">
              <div className="max-w-3xl mx-auto">
                <h2 className="text-2xl font-bold text-text-primary mb-6">{currentMsg.subject}</h2>
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-accent/10 flex items-center justify-center text-primary-accent">
                      <User size={20} />
                    </div>
                    <div>
                      <div className="font-medium text-text-primary text-sm">{currentMsg.sender}</div>
                      <div className="text-xs text-text-muted">{currentMsg.folder === 'sent' ? `Para ${currentMsg.recipient === 'all' ? 'todos los colaboradores' : currentMsg.recipient}` : 'A mí'} • {currentMsg.date}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button title={currentMsg.starred ? 'Quitar de destacados' : 'Destacar'} onClick={() => patch(currentMsg.id, { starred: !currentMsg.starred })} className="p-2 text-text-muted hover:text-warning hover:bg-warning-tint rounded-full transition-colors">
                      <Star size={18} className={currentMsg.starred ? 'text-warning-text fill-current' : ''} />
                    </button>
                  </div>
                </div>
                <div className="prose prose-sm max-w-none text-text-secondary">
                  <p className="whitespace-pre-wrap">{currentMsg.content}</p>
                </div>
                {currentMsg.attachments.length > 0 && (
                  <div className="mt-8 border-t border-border-soft pt-4">
                    <p className="text-xs font-bold text-text-muted uppercase tracking-widest mb-2">Adjuntos ({currentMsg.attachments.length})</p>
                    <ul className="space-y-1 text-sm text-text-secondary">
                      {currentMsg.attachments.map(a => <li key={a} className="flex items-center gap-2"><Paperclip size={14} className="text-text-muted" />{a}</li>)}
                    </ul>
                    <p className="text-xs text-text-muted mt-2">El sistema guarda el nombre del archivo; el almacenamiento de archivos aún no está activo.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-border-soft bg-surface-50">
              <div className="max-w-3xl mx-auto flex gap-3">
                <Button className="gap-2" variant="outline" onClick={() => handleReply(currentMsg)} disabled={currentMsg.sender === 'Sistema' || currentMsg.folder === 'sent'} title={currentMsg.sender === 'Sistema' ? 'Los avisos del sistema no se responden' : undefined}>Responder</Button>
                <Button className="gap-2" variant="outline" onClick={() => handleForward(currentMsg)}>Reenviar</Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
            <div className="w-16 h-16 bg-surface-muted rounded-full flex items-center justify-center mb-4">
              <Inbox size={32} />
            </div>
            <p>Selecciona un mensaje para leerlo</p>
          </div>
        )}
      </div>
    </div>

      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => { setMessages(prev => prev.filter(m => m.id !== toDelete)); setToDelete(null); setSelectedMessage(null); }}
        title="Eliminar definitivamente"
        description="El mensaje se eliminará para siempre y no se podrá recuperar."
        variant="danger"
        confirmLabel="SÍ, ELIMINAR"
      />

      {/* Compose Message Modal */}
      <Modal
        isOpen={isComposeOpen}
        onClose={handleSaveDraft}
        title="Redactar Comunicado Interno"
        size="lg"
        footer={
          <div className="flex justify-end gap-3 w-full py-2">
            <Button variant="ghost" onClick={() => { setIsComposeOpen(false); setComposeData(emptyCompose); }}>Descartar Borrador</Button>
            <Button variant="secondary" onClick={handleSaveDraft}>Guardar borrador</Button>
            <Button variant="primary" onClick={handleSendMessage} className="px-6">
              <Send size={18} className="mr-2" />
              Enviar Mensaje
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {formError && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 flex items-center gap-3 text-danger text-sm font-medium">
              <AlertCircle size={18} />
              {formError}
            </div>
          )}
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest pl-1">Destinatario Institucional</label>
              <Select
                options={[
                  { value: 'all', label: 'Todos los Colaboradores' },
                  ...staff.map(user => ({
                    value: user.names + ' ' + user.lastNameP,
                    label: `${user.names} ${user.lastNameP}${user.specialty ? ` (${user.specialty})` : ''}`
                  }))
                ]}
                value={composeData.recipient}
                onChange={(e) => setComposeData({ ...composeData, recipient: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest pl-1">Asunto del Comunicado</label>
              <input
                type="text"
                className="w-full h-11 bg-surface border border-border-soft rounded-xl px-4 text-sm text-text-primary focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent/10 transition-all font-medium"
                placeholder="Especifique el tema principal..."
                value={composeData.subject}
                onChange={(e) => setComposeData({ ...composeData, subject: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest pl-1">Cuerpo del Mensaje</label>
              <textarea
                className="w-full bg-surface border border-border-soft rounded-xl p-4 text-sm text-text-primary focus:outline-none focus:border-primary-accent resize-none h-60 focus:ring-1 focus:ring-primary-accent/10 transition-all font-medium leading-relaxed"
                placeholder="Escriba su mensaje con claridad y profesionalismo..."
                value={composeData.content}
                onChange={(e) => setComposeData({ ...composeData, content: e.target.value })}
              />
              <div className="flex flex-wrap items-center gap-2 mt-2 px-1">
                <label className="inline-flex items-center h-8 px-2 text-sm text-text-muted hover:text-text-primary cursor-pointer rounded-lg hover:bg-surface-muted">
                  <Paperclip size={14} className="mr-1.5" />
                  Adjuntar archivos
                  <input type="file" multiple className="hidden" onChange={e => { addAttachments(e.target.files); e.target.value = ''; }} />
                </label>
                {composeData.attachments.map(name => (
                  <span key={name} className="inline-flex items-center gap-1 text-xs bg-surface-muted border border-border-soft rounded-md px-2 py-1">
                    {name}
                    <button type="button" aria-label={`Quitar ${name}`} onClick={() => setComposeData(c => ({ ...c, attachments: c.attachments.filter(a => a !== name) }))} className="text-text-muted hover:text-danger-text"><X size={12} /></button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
