import React, { useState } from 'react';
import { Search, Filter, Calendar as CalendarIcon, Download, Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { inputCls, labelCls, nativeFieldCls, selectCls, textareaCls } from './formStyles';
import { Select } from '../../components/ui/Select';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Modal } from '../../components/ui/Modal';
import { useData } from '../../context/DataContext';

export function MonthlySchedules() {
  const { monthlySchedules, branches } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null);

  // Form state
  const [formState, setFormState] = useState({
    sede: 'Piura',
    mes: 'Abril',
    anio: 2026,
    titulo: '',
    observaciones: '',
    actividades: [] as any[]
  });

  const handleOpenDrawer = (schedule?: any) => {
    if (schedule) {
      setSelectedSchedule(schedule);
      setFormState({
        sede: schedule.sede,
        mes: schedule.mes,
        anio: schedule.anio,
        titulo: schedule.titulo,
        observaciones: schedule.observaciones,
        actividades: [...schedule.actividades]
      });
    } else {
      setSelectedSchedule(null);
      setFormState({
        sede: 'Piura',
        mes: 'Abril',
        anio: 2026,
        titulo: 'Nuevo Cronograma',
        observaciones: '',
        actividades: []
      });
    }
    setIsDrawerOpen(true);
  };

  const handleAddActivity = () => {
    setFormState({
      ...formState,
      actividades: [
        ...formState.actividades,
        { 
          id: `new-${Date.now()}`, 
          actividad: '', 
          fecha: '', 
          hora: '', 
          responsable: '', 
          orden: formState.actividades.length + 1 
        }
      ]
    });
  };

  const handleRemoveActivity = (id: string) => {
    setFormState({
      ...formState,
      actividades: formState.actividades.filter(a => a.id !== id)
    });
  };

  const handleActivityChange = (id: string, field: string, value: string) => {
    setFormState({
      ...formState,
      actividades: formState.actividades.map(a => 
        a.id === id ? { ...a, [field]: value } : a
      )
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Cronogramas Mensuales</h1>
          <p className="text-text-secondary mt-1">Genera y exporta el cuadro mensual de actividades por sede.</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none">
            <Download size={20} className="mr-2" />
            Exportar Todos
          </Button>
          <Button onClick={() => handleOpenDrawer()} className="flex-1 sm:flex-none">
            <Plus size={20} className="mr-2" />
            Nuevo Cronograma
          </Button>
        </div>
      </div>

      <div className="bg-surface border border-border-soft rounded-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border-soft flex flex-col sm:flex-row gap-4 justify-between items-center bg-surface-50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
            <Input
              placeholder="Buscar por título o sede..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <Select
              options={[
                { value: '2026', label: '2026' },
                { value: '2025', label: '2025' },
              ]}
              value="2026"
              onChange={() => {}}
              className="w-32"
            />
            <Select
              options={[
                { value: 'Abril', label: 'Abril' },
                { value: 'Marzo', label: 'Marzo' },
              ]}
              value="Abril"
              onChange={() => {}}
              className="w-40"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
          {monthlySchedules.map((schedule) => (
            <div key={schedule.id} className="bg-surface border border-border-soft rounded-xl overflow-hidden hover:shadow-md transition-shadow flex flex-col">
              <div className="p-4 border-b border-border-soft bg-surface-50 flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-text-primary line-clamp-1" title={schedule.titulo}>{schedule.titulo}</h3>
                  <div className="flex items-center gap-2 mt-1 text-sm text-text-secondary">
                    <CalendarIcon size={14} />
                    <span>{schedule.mes} {schedule.anio}</span>
                    <span className="text-border-soft">•</span>
                    <span>{schedule.sede}</span>
                  </div>
                </div>
                <ActionMenu
                  items={[
                    { label: 'Editar cronograma', onClick: () => handleOpenDrawer(schedule) },
                    { label: 'Exportar a PDF', onClick: () => {} },
                    { label: 'Exportar a Imagen', onClick: () => {} },
                    { label: 'Eliminar', onClick: () => {}, danger: true },
                  ]}
                />
              </div>
              <div className="p-4 flex-1">
                <p className="text-sm font-medium text-text-secondary mb-3">Actividades ({schedule.actividades.length})</p>
                <div className="space-y-3">
                  {schedule.actividades.slice(0, 3).map((act, idx) => (
                    <div key={idx} className="flex gap-3 text-sm">
                      <div className="w-12 shrink-0 text-text-muted font-medium">{act.fecha.split('-')[2]}/{act.fecha.split('-')[1]}</div>
                      <div className="flex-1">
                        <p className="text-text-primary font-medium line-clamp-1">{act.actividad}</p>
                        <p className="text-text-secondary text-xs">{act.hora}</p>
                      </div>
                    </div>
                  ))}
                  {schedule.actividades.length > 3 && (
                    <p className="text-xs text-text-muted text-center pt-2 border-t border-border-soft">
                      + {schedule.actividades.length - 3} actividades más
                    </p>
                  )}
                </div>
              </div>
              <div className="p-3 border-t border-border-soft bg-surface-muted/30">
                <Button variant="outline" className="w-full" onClick={() => handleOpenDrawer(schedule)}>
                  Ver Detalle Completo
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={selectedSchedule ? "Editar Cronograma" : "Nuevo Cronograma"}
        size="5xl"
        footer={
          <div className="flex justify-between w-full">
            <Button variant="outline">
              <Download size={20} className="mr-2" />
              Previsualizar PDF
            </Button>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setIsDrawerOpen(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => setIsDrawerOpen(false)}>Guardar Cronograma</Button>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-4">
          {/* Left Column */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                <h3 className="text-base font-semibold text-text-primary">Cabecera del Cronograma</h3>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={labelCls}>Sede</label>
                  <Select className={selectCls}
                    options={branches.map(b => ({ value: b.name, label: b.name }))}
                    value={formState.sede}
                    onChange={(e) => setFormState({...formState, sede: e.target.value})}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Mes</label>
                    <Select className={selectCls}
                      options={[
                        { value: 'Enero', label: 'Enero' },
                        { value: 'Febrero', label: 'Febrero' },
                        { value: 'Marzo', label: 'Marzo' },
                        { value: 'Abril', label: 'Abril' },
                      ]}
                      value={formState.mes}
                      onChange={(e) => setFormState({...formState, mes: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Año</label>
                    <Input className={inputCls} 
                      type="number" 
                      value={formState.anio}
                      onChange={(e) => setFormState({...formState, anio: parseInt(e.target.value)})}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Título del Cuadro</label>
                  <Input className={inputCls} 
                    value={formState.titulo}
                    onChange={(e) => setFormState({...formState, titulo: e.target.value})}
                    placeholder="Ej. Cronograma de Actividades"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-border-soft">
              <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                <h3 className="text-base font-semibold text-text-primary">Observaciones (Internas)</h3>
              </div>
              <div>
                <textarea
                  className={`${textareaCls} h-32`}
                  placeholder="Notas internas..."
                  value={formState.observaciones}
                  onChange={(e) => setFormState({...formState, observaciones: e.target.value})}
                ></textarea>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-border-soft pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-text-primary">Actividades</h3>
                </div>
                <Button variant="outline" size="sm" onClick={handleAddActivity}>
                  <Plus size={16} className="mr-2" /> Agregar
                </Button>
              </div>
              
              <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                {formState.actividades.length === 0 ? (
                  <div className="text-center py-12 text-text-muted border-2 border-dashed border-border-soft rounded-xl bg-surface-50">
                    <CalendarIcon size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="font-medium text-text-primary">No hay actividades</p>
                    <p className="text-sm mt-1">Haz clic en Agregar para comenzar</p>
                  </div>
                ) : (
                  formState.actividades.map((act) => (
                    <div key={act.id} className="flex gap-3 items-start p-3 bg-surface-50 border border-border-soft rounded-xl group hover:border-border-strong transition-colors">
                      <div className="mt-2 cursor-move text-text-muted hover:text-text-primary transition-colors">
                        <GripVertical size={20} />
                      </div>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className={labelCls}>Nombre</label>
                          <Input className={inputCls} 
                            value={act.actividad}
                            onChange={(e) => handleActivityChange(act.id, 'actividad', e.target.value)}
                            placeholder="Nombre de la actividad"
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Fecha</label>
                          <Input className={inputCls} 
                            type="date"
                            value={act.fecha}
                            onChange={(e) => handleActivityChange(act.id, 'fecha', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Hora</label>
                          <Input className={inputCls} 
                            value={act.hora}
                            onChange={(e) => handleActivityChange(act.id, 'hora', e.target.value)}
                            placeholder="Ej. 15:00"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelCls}>Responsable</label>
                          <Input className={inputCls} 
                            value={act.responsable}
                            onChange={(e) => handleActivityChange(act.id, 'responsable', e.target.value)}
                            placeholder="Responsable (Opcional)"
                          />
                        </div>
                      </div>
                      <button 
                        onClick={() => handleRemoveActivity(act.id)}
                        className="mt-6 p-2 text-text-muted hover:text-danger hover:bg-danger-tint rounded-lg transition-colors"
                        title="Eliminar actividad"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
