import React, { useState } from 'react';
import { Search, Filter, CheckCircle, Clock, AlertCircle, User, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { useData } from '../../context/DataContext';

export function FirstCounseling() {
  const { counselings } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedCounseling, setSelectedCounseling] = useState<any>(null);
  
  // Form state
  const [formState, setFormState] = useState({
    asistioAlumno: false,
    asistioApoderado: false,
    metodologiaExplicada: false,
    usoItemsExplicado: false,
    estado: 'Pendiente',
    observaciones: ''
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Realizada': return 'success';
      case 'Pendiente': return 'warning';
      case 'Reprogramada': return 'info';
      case 'Cancelada': return 'danger';
      default: return 'neutral';
    }
  };

  const handleOpenDrawer = (counseling: any) => {
    setSelectedCounseling(counseling);
    setFormState({
      asistioAlumno: false,
      asistioApoderado: false,
      metodologiaExplicada: false,
      usoItemsExplicado: false,
      estado: counseling.status,
      observaciones: ''
    });
    setIsDrawerOpen(true);
  };

  const isFormValid = () => {
    if (formState.estado === 'Realizada') {
      return formState.asistioAlumno && formState.metodologiaExplicada && formState.usoItemsExplicado;
    }
    return true;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Primera Asesoría</h1>
          <p className="text-text-secondary mt-1">Bandeja de pendientes y registro del primer hito pedagógico.</p>
        </div>
      </div>

      <div className="bg-surface border border-border-soft rounded-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border-soft flex flex-col sm:flex-row gap-4 justify-between items-center bg-surface-50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
            <Input
              placeholder="Buscar por alumno o responsable..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <Button variant="outline" className="flex-1 sm:flex-none">
              <Filter size={20} className="mr-2" />
              Filtros
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-soft bg-surface-50">
                <th className="py-3 px-4 text-sm font-medium text-text-secondary">Fecha Programada</th>
                <th className="py-3 px-4 text-sm font-medium text-text-secondary">Alumno</th>
                <th className="py-3 px-4 text-sm font-medium text-text-secondary">Programa</th>
                <th className="py-3 px-4 text-sm font-medium text-text-secondary">Responsable</th>
                <th className="py-3 px-4 text-sm font-medium text-text-secondary">Estado</th>
                <th className="py-3 px-4 text-sm font-medium text-text-secondary text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {counselings.map((counseling) => (
                <tr key={counseling.id} className="border-b border-border-soft hover:bg-surface-50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <CalendarIcon size={16} className="text-text-muted" />
                      <span className="text-sm font-medium text-text-primary">{counseling.date}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock size={16} className="text-text-muted" />
                      <span className="text-sm text-text-secondary">{counseling.time}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-sm font-medium text-text-primary">{counseling.student}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-sm text-text-primary">{counseling.program}</div>
                    <div className="text-xs text-text-secondary mt-0.5">{counseling.level}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <User size={16} className="text-text-muted" />
                      <span className="text-sm text-text-secondary">{counseling.responsible}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant={getStatusBadge(counseling.status) as any}>{counseling.status}</Badge>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button variant="outline" size="sm" onClick={() => handleOpenDrawer(counseling)}>
                      Gestionar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Cierre de Primera Asesoría"
        size="4xl"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="ghost" onClick={() => setIsDrawerOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => setIsDrawerOpen(false)} disabled={!isFormValid()}>Guardar Registro</Button>
          </div>
        }
      >
        {selectedCounseling && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-4">
            {/* Left Column */}
            <div className="space-y-6">
              <div className="bg-surface-muted p-4 rounded-xl border border-border-soft">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-text-secondary mb-1">Alumno</p>
                    <p className="text-sm font-medium text-text-primary">{selectedCounseling.student}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary mb-1">Programa</p>
                    <p className="text-sm font-medium text-text-primary">{selectedCounseling.program} - {selectedCounseling.level}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary mb-1">Fecha Programada</p>
                    <p className="text-sm font-medium text-text-primary">{selectedCounseling.date}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary mb-1">Hora</p>
                    <p className="text-sm font-medium text-text-primary">{selectedCounseling.time}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                  <div className="w-1 h-4 bg-primary-accent rounded-full" />
                  <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Checklist de Ejecución</h3>
                </div>
                
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 border border-border-soft rounded-lg hover:bg-surface-50 cursor-pointer transition-colors">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-primary border-border-soft rounded focus:ring-primary"
                      checked={formState.asistioAlumno}
                      onChange={(e) => setFormState({...formState, asistioAlumno: e.target.checked})}
                    />
                    <span className="text-sm text-text-primary">Asistió el alumno</span>
                  </label>
                  
                  <label className="flex items-center gap-3 p-3 border border-border-soft rounded-lg hover:bg-surface-50 cursor-pointer transition-colors">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-primary border-border-soft rounded focus:ring-primary"
                      checked={formState.asistioApoderado}
                      onChange={(e) => setFormState({...formState, asistioApoderado: e.target.checked})}
                    />
                    <span className="text-sm text-text-primary">Asistió apoderado (si corresponde)</span>
                  </label>

                  <label className="flex items-center gap-3 p-3 border border-border-soft rounded-lg hover:bg-surface-50 cursor-pointer transition-colors">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-primary border-border-soft rounded focus:ring-primary"
                      checked={formState.metodologiaExplicada}
                      onChange={(e) => setFormState({...formState, metodologiaExplicada: e.target.checked})}
                    />
                    <span className="text-sm text-text-primary">Metodología explicada</span>
                  </label>

                  <label className="flex items-center gap-3 p-3 border border-border-soft rounded-lg hover:bg-surface-50 cursor-pointer transition-colors">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-primary border-border-soft rounded focus:ring-primary"
                      checked={formState.usoItemsExplicado}
                      onChange={(e) => setFormState({...formState, usoItemsExplicado: e.target.checked})}
                    />
                    <span className="text-sm text-text-primary">Uso de artículos explicado</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                  <div className="w-1 h-4 bg-primary-accent rounded-full" />
                  <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Cierre</h3>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Estado Final</label>
                    <select
                      className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10"
                      value={formState.estado}
                      onChange={(e) => setFormState({...formState, estado: e.target.value})}
                    >
                      <option value="Pendiente">Pendiente</option>
                      <option value="Realizada">Realizada</option>
                      <option value="Reprogramada">Reprogramada</option>
                      <option value="Cancelada">Cancelada</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Observaciones</label>
                    <textarea
                      className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-32 transition-all focus:ring-2 focus:ring-primary-accent/10"
                      placeholder="Notas relevantes de la primera sesión..."
                      value={formState.observaciones}
                      onChange={(e) => setFormState({...formState, observaciones: e.target.value})}
                    ></textarea>
                  </div>
                </div>
              </div>

              {formState.estado === 'Realizada' && !isFormValid() && (
                <div className="flex items-start gap-2 p-3 bg-danger-tint text-danger-text rounded-lg border border-danger-text/20 mt-4">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <p className="text-sm">Para marcar como "Realizada", debe confirmar la asistencia del alumno y la explicación de metodología y artículos.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
