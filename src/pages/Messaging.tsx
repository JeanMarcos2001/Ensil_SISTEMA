import React, { useState } from 'react';
import { Search, Edit, Inbox, Send, Star, Trash2, MoreVertical, Archive, User, Paperclip, X, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { useData } from '../context/DataContext';

export function Messaging() {
  const { staff } = useData();
  const [activeFolder, setActiveFolder] = useState('inbox');
  const [selectedMessage, setSelectedMessage] = useState<number | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [composeData, setComposeData] = useState({
    recipient: '',
    subject: '',
    content: ''
  });

  const folders = [
    { id: 'inbox', label: 'Bandeja de entrada', icon: Inbox, count: 3 },
    { id: 'sent', label: 'Enviados', icon: Send },
    { id: 'starred', label: 'Destacados', icon: Star },
    { id: 'drafts', label: 'Borradores', icon: Edit },
    { id: 'trash', label: 'Papelera', icon: Trash2 },
  ];

  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'Sistema',
      subject: 'Alerta: Bajo stock - Material Lógico',
      preview: 'El material "Lógico Matemático" en Sede Central ha bajado del nivel...',
      date: '10:30 AM',
      read: false,
      folder: 'inbox',
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
      content: 'El envío ENV-2342 hacia sede Norte ha sido marcado como "En tránsito". Puedes verificar el seguimiento desde el kardex.'
    }
  ]);

  const unreadCount = messages.filter(m => m.folder === 'inbox' && !m.read).length;
  folders[0].count = unreadCount;

  const activeMessages = messages.filter(m => m.folder === activeFolder);
  const currentMsg = activeMessages.find(m => m.id === selectedMessage);

  const handleSendMessage = () => {
    setFormError(null);
    if (!composeData.recipient || !composeData.subject || !composeData.content) {
      setFormError("Por favor completa los campos del mensaje.");
      return;
    }
    const newMsg = {
      id: messages.length + 1,
      sender: 'Yo',
      subject: composeData.subject,
      preview: composeData.content.substring(0, 50) + '...',
      date: 'Ahora',
      read: true,
      folder: 'sent',
      content: composeData.content
    };
    setMessages([newMsg, ...messages]);
    setIsComposeOpen(false);
    setComposeData({ recipient: '', subject: '', content: '' });
    setActiveFolder('sent');
  };

  const handleOpenCompose = () => {
    setFormError(null);
    setIsComposeOpen(true);
  };

  const markAsRead = (id: number) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m));
    setSelectedMessage(id);
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
            <Button className="w-full gap-2 h-11 rounded-xl shadow-lg shadow-primary-accent/10" variant="primary" onClick={handleOpenCompose}>
              <Edit size={18} /> Redactar Correo
            </Button>
          </div>
        <div className="p-2 space-y-1 flex-1 overflow-y-auto">
          {folders.map(folder => {
            const Icon = folder.icon;
            const isActive = activeFolder === folder.id;
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
                {folder.count && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-primary-accent text-white' : 'bg-surface-muted text-text-muted'}`}>
                    {folder.count}
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
               <p className="font-medium">No hay mensajes aquí</p>
               <p className="text-xs mt-1">La carpeta {folders.find(f => f.id === activeFolder)?.label} está vacía</p>
            </div>
          ) : (
            activeMessages.map(msg => (
              <button
                key={msg.id}
                onClick={() => markAsRead(msg.id)}
                className={`w-full text-left p-4 border-b border-border-soft transition-all hover:bg-surface-muted group relative ${selectedMessage === msg.id ? 'bg-primary-accent/5' : ''} ${!msg.read ? 'bg-surface' : 'opacity-80'}`}
              >
                {selectedMessage === msg.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-accent" />
                )}
                <div className="flex justify-between items-start mb-1">
                  <span className={`text-sm truncate pr-2 ${!msg.read ? 'font-bold text-primary-accent' : 'font-semibold text-text-secondary'}`}>{msg.sender}</span>
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
                <button className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-muted rounded-full transition-colors">
                  <Archive size={18} />
                </button>
                <button className="p-2 text-text-muted hover:text-danger hover:bg-danger-tint rounded-full transition-colors">
                  <Trash2 size={18} />
                </button>
              </div>
              <button className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-muted rounded-full transition-colors">
                <MoreVertical size={18} />
              </button>
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
                      <div className="text-xs text-text-muted">A mí • {currentMsg.date}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-2 text-text-muted hover:text-warning hover:bg-warning-tint rounded-full transition-colors">
                      <Star size={18} />
                    </button>
                  </div>
                </div>
                <div className="prose prose-sm max-w-none text-text-secondary">
                  <p className="whitespace-pre-wrap">{currentMsg.content}</p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-border-soft bg-surface-50">
              <div className="max-w-3xl mx-auto flex gap-3">
                <Button className="gap-2" variant="outline">Responder</Button>
                <Button className="gap-2" variant="outline">Reenviar</Button>
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

      {/* Compose Message Modal */}
      <Modal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        title="Redactar Comunicado Interno"
        size="lg"
        footer={
          <div className="flex justify-end gap-3 w-full py-2">
            <Button variant="ghost" onClick={() => setIsComposeOpen(false)}>Descartar Borrador</Button>
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
                    label: `${user.names} ${user.lastNameP} (${user.specialty})` 
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
              <div className="flex items-center gap-2 mt-2 px-1">
                <Button variant="ghost" size="sm" className="h-8 px-2 text-text-muted hover:text-text-primary">
                  <Paperclip size={14} className="mr-1.5" />
                  Adjuntar archivos
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
