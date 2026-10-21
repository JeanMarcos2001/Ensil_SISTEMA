import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, Filter, Bookmark, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { longDayLabel, todayLocalISO } from '../utils/schedule';
import {
  VALIDITY_LABEL,
  canEnableExtension,
  enrollmentValidity,
  programOf,
  validityCounts,
  type Validity,
  type ValidityState,
} from '../utils/validity';
import { useTablePagination } from '../hooks/useTablePagination';
import { Modal } from '../components/ui/Modal';

const VALIDITY_VARIANT: Record<ValidityState, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  'sin-inicio': 'neutral',
  'por-iniciar': 'info',
  vigente: 'success',
  'por-vencer': 'warning',
  'base-finalizada': 'danger',
  extension: 'info',
  finalizada: 'neutral',
};

export function Enrollments() {
  const { enrollments, students, guardians, branches, programs, schedules, enableExtension, isEnrollmentWizardOpen, setIsEnrollmentWizardOpen } = useData();
  const today = todayLocalISO();
  const [searchParams, setSearchParams] = useSearchParams();
  const vigenciaFilter = (searchParams.get('vigencia') ?? '') as ValidityState | '';
  const [toExtend, setToExtend] = useState<{ id: string; student: string; validity: Validity } | null>(null);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();
  const navigate = useNavigate();

  // Vigencia de cada matrícula activa (duración base + garantía, desde la primera asesoría)
  const validityOf = (e: (typeof enrollments)[number]) =>
    e.status === 'Activa' ? enrollmentValidity(e, programOf(e, programs), schedules, today) : undefined;
  const counts = validityCounts({ enrollments, programs, schedules }, today);

  const filteredEnrollments = enrollments.filter(e => {
    const matchesSearch = 
      e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.student.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBranch = !selectedBranch || e.sede === selectedBranch;
    const matchesValidity = !vigenciaFilter || validityOf(e)?.state === vigenciaFilter;
    return matchesSearch && matchesBranch && matchesValidity;
  });

  const totalPages = Math.ceil(filteredEnrollments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedEnrollments = filteredEnrollments.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, vigenciaFilter]);

  const setVigencia = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set('vigencia', v); else next.delete('vigencia');
    setSearchParams(next, { replace: true });
  };

  const handleOpenDetail = (id: string) => {
    setSelectedEnrollment(id);
    setIsDetailOpen(true);
  };
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Matrículas</h2>
          <p className="text-sm text-text-secondary">Gestión de registros individuales por alumno</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="hidden sm:flex items-center gap-2">
            <Bookmark size={16} />
            Guardar vista
          </Button>
          <Button variant="primary" onClick={() => setIsEnrollmentWizardOpen(true)}>Nueva matrícula</Button>
        </div>
      </div>

      {/* Main Content Card (Filters + Table + Pagination) */}
      <div className="bg-surface border border-border-soft rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-border-soft">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
              <input 
                type="text" 
                placeholder="Buscar por código, alumno o titular..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select 
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
              >
                <option value="">Todas las sedes</option>
                {branches.map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
              <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]">
                <option value="">Programa</option>
                <option value="kids">Kids</option>
                <option value="teens">Teens</option>
              </select>
              <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]">
                <option value="">Estado Matrícula</option>
                <option value="activa">Activa</option>
                <option value="caida">Caída</option>
              </select>
              <Button variant="secondary" className="shrink-0 px-3 h-10 rounded-xl">
                <Filter size={16} />
              </Button>
            </div>
          </div>
        </div>

        {/* Vigencia: alertas de matrículas por vencer */}
        <div className="px-4 py-3 border-b border-border-soft flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider mr-1">Vigencia</span>
          {([
            ['', 'Todas', null],
            ['por-vencer', 'Por vencer', counts['por-vencer']],
            ['base-finalizada', 'Base finalizada', counts['base-finalizada']],
            ['extension', 'En extensión', counts.extension],
          ] as const).map(([value, label, n]) => (
            <button
              key={value || 'todas'}
              type="button"
              onClick={() => setVigencia(value)}
              className={`h-8 px-3 rounded-lg border text-sm font-medium transition-colors ${
                vigenciaFilter === value
                  ? 'bg-primary-accent border-primary-accent text-white'
                  : 'bg-surface border-border-soft text-text-secondary hover:bg-surface-muted'
              }`}
            >
              {label}{n !== null && <span className="ml-1.5 opacity-80">({n})</span>}
            </button>
          ))}
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 font-medium">Código</th>
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Alumno</th>
                <th className="px-6 py-3 font-medium">Programa</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Vigencia</th>
                <th className="px-6 py-3 font-medium">Plan</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedEnrollments.map((row, idx) => (
                <tr key={idx} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3 font-mono text-text-secondary whitespace-nowrap">{row.id}</td>
                  <td className="px-6 py-3 text-text-secondary whitespace-nowrap">{row.date}</td>
                  <td className="px-6 py-3">
                    <div className="font-medium text-text-primary">{row.student}</div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="text-text-primary">{row.program}</div>
                    <div className="text-xs text-text-muted">{row.level}</div>
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={row.status === 'Activa' ? 'success' : 'danger'}>{row.status}</Badge>
                  </td>
                  <td className="px-6 py-3">
                    {(() => {
                      const v = validityOf(row);
                      if (!v) return <span className="text-text-muted">—</span>;
                      return (
                        <div className="space-y-0.5">
                          <Badge variant={VALIDITY_VARIANT[v.state]}>{VALIDITY_LABEL[v.state]}</Badge>
                          {v.state === 'por-vencer' && (
                            <p className="text-xs text-text-secondary">
                              Termina la base el {longDayLabel(v.baseEnd!)} (quedan {v.daysToBaseEnd} {v.daysToBaseEnd === 1 ? 'día' : 'días'})
                              {v.extensionMonths > 0 ? ` · extensión +${v.extensionMonths} meses` : ''}
                            </p>
                          )}
                          {v.state === 'base-finalizada' && <p className="text-xs text-text-secondary">Terminó el {longDayLabel(v.baseEnd!)} · sin extensión</p>}
                          {v.state === 'extension' && <p className="text-xs text-text-secondary">Hasta el {longDayLabel(v.extensionEnd!)}</p>}
                          {(v.state === 'vigente' || v.state === 'por-iniciar') && (
                            <p className="text-xs text-text-muted">
                              {v.extensionEnabled ? `Extensión habilitada · hasta el ${longDayLabel(v.extensionEnd!)}` : `Base hasta el ${longDayLabel(v.baseEnd!)}`}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={row.plan === 'Al día' ? 'success' : row.plan === 'Parcial' ? 'warning' : 'danger'}>{row.plan}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalle', onClick: () => handleOpenDetail(row.id) },
                        ...(() => {
                          const v = validityOf(row);
                          return v && canEnableExtension(v)
                            ? [{ label: 'Habilitar extensión', onClick: () => { setExtendError(null); setToExtend({ id: row.id, student: row.student, validity: v }); } }]
                            : [];
                        })(),
                        { label: 'Editar datos', onClick: () => {} },
                        { label: 'Ver plan', onClick: () => {} },
                        { label: 'Solicitar caída', onClick: () => {}, danger: true },
                      ]} 
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-border-soft flex items-center justify-between bg-surface">
          <span className="text-sm text-text-secondary">
            Mostrando {filteredEnrollments.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredEnrollments.length)} de {filteredEnrollments.length} registros
          </span>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              Anterior
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === i + 1 
                      ? 'bg-primary-accent text-white' 
                      : 'text-text-secondary hover:bg-surface-muted'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <Button 
              variant="ghost" 
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!toExtend}
        onClose={() => setToExtend(null)}
        onConfirm={() => {
          if (!toExtend) return;
          const r = enableExtension(toExtend.id);
          if (!r.ok) setExtendError(r.error ?? 'No se pudo habilitar la extensión.');
          setToExtend(null);
        }}
        title="Habilitar extensión"
        description={toExtend
          ? `Se habilitará el período de extensión de ${toExtend.validity.extensionMonths} meses de ${toExtend.student} (${toExtend.id}), hasta el ${longDayLabel(toExtend.validity.extensionEnd!)}. Seguirá apareciendo en Programación y Actividades.`
          : ''}
        variant="primary"
        confirmLabel="SÍ, HABILITAR"
      />
      {extendError && (
        <div className="fixed bottom-4 right-4 z-[100] bg-danger-tint border border-danger-text/20 text-danger-text text-sm rounded-xl px-4 py-3 shadow-lg" role="alert">
          {extendError}
          <button type="button" className="ml-3 underline" onClick={() => setExtendError(null)}>Cerrar</button>
        </div>
      )}

      {/* Detail Modal */}
      <Modal 
        isOpen={isDetailOpen} 
        onClose={() => setIsDetailOpen(false)} 
        title={`Detalle de Matrícula`}
        size="4xl"
      >
        {selectedEnrollment && (
          <div className="space-y-6 pb-4">
            {(() => {
              const enrollment = enrollments.find(e => e.id === selectedEnrollment);
              const student = students.find(s => s.name === enrollment?.student);
              const guardian = guardians.find(g => g.name === student?.titular);
              
              return (
                <>
                  <div className="flex items-center justify-between bg-surface-muted p-4 rounded-xl border border-border-soft">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary-accent/10 rounded-full flex items-center justify-center text-primary-accent font-bold">
                        {enrollment?.id.substring(0, 2)}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-text-primary">{enrollment?.id}</h3>
                        <p className="text-sm text-text-secondary">{enrollment?.student}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={enrollment?.status === 'Activa' ? 'success' : 'danger'}>{enrollment?.status}</Badge>
                      {(() => {
                        const v = enrollment ? validityOf(enrollment) : undefined;
                        return v ? <Badge variant={VALIDITY_VARIANT[v.state]}>{VALIDITY_LABEL[v.state]}</Badge> : null;
                      })()}
                      <span className="text-xs text-text-muted">Inscrito: {enrollment?.date}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <h4 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-soft pb-2">Información Académica</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-text-muted uppercase tracking-wider">Alumno</label>
                          <p className="text-sm font-medium text-text-primary mt-1">{enrollment?.student}</p>
                          <p className="text-xs text-text-secondary">{student?.age} años - {student?.grado || 'Sin grado'}</p>
                        </div>
                        <div>
                          <label className="text-xs text-text-muted uppercase tracking-wider">Programa</label>
                          <p className="text-sm font-medium text-text-primary mt-1">{enrollment?.program} - {enrollment?.level}</p>
                          <p className="text-xs text-text-secondary">Horario: {student?.horario || 'No asignado'}</p>
                        </div>
                        <div>
                          <label className="text-xs text-text-muted uppercase tracking-wider">Sede</label>
                          <p className="text-sm font-medium text-text-primary mt-1">{enrollment?.sede || 'Sede Central'}</p>
                        </div>
                        <div>
                          <label className="text-xs text-text-muted uppercase tracking-wider">Asesor</label>
                          <p className="text-sm font-medium text-text-primary mt-1">{enrollment?.asesor || 'No asignado'}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-6">
                      <h4 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-soft pb-2">Titular y Contacto</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="text-xs text-text-muted uppercase tracking-wider">Titular ({guardian?.parentesco || 'Responsable'})</label>
                          <p className="text-sm font-medium text-text-primary mt-1">{student?.titular}</p>
                          <p className="text-xs text-text-secondary">{guardian?.phone}</p>
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs text-text-muted uppercase tracking-wider">Dirección</label>
                          <p className="text-sm font-medium text-text-primary mt-1">{guardian?.direccion || 'No registrada'}</p>
                        </div>
                        <div>
                          <label className="text-xs text-text-muted uppercase tracking-wider">Origen</label>
                          <p className="text-sm font-medium text-text-primary mt-1 uppercase">{enrollment?.origen || '-'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-border-soft flex gap-4">
                    <Button variant="secondary" className="flex-1 justify-center">Ver Plan Financiero</Button>
                    <Button 
                      variant="primary" 
                      className="flex-1 justify-center"
                      onClick={() => navigate('/verification')}
                    >
                      Ir a Verificación
                    </Button>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </Modal>
    </div>
  );
}
