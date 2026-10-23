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
import { EnrollmentFichaModal } from '../components/enrollment/EnrollmentFichaModal';
import { DropRequestModal } from '../components/enrollment/DropRequestModal';
import { EditEnrollmentModal } from '../components/enrollment/EditEnrollmentModal';

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
  const { enrollments, students, branches, programs, schedules, dropRequests, enableExtension, setIsEnrollmentWizardOpen, plans } = useData();
  const today = todayLocalISO();
  const [searchParams, setSearchParams] = useSearchParams();
  const vigenciaFilter = (searchParams.get('vigencia') ?? '') as ValidityState | '';
  const [toExtend, setToExtend] = useState<{ id: string; student: string; validity: Validity } | null>(null);
  const [extendError, setExtendError] = useState<string | null>(null);
  // Ficha de la matrícula (también se abre desde otras pantallas con ?ficha=MAT-…) y acciones de la fila
  const [fichaId, setFichaId] = useState<string | null>(searchParams.get('ficha'));
  const [dropFor, setDropFor] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<string | null>(null);
  // Filtro por alumno (desde Alumnos → Ver matrículas)
  const studentFilter = searchParams.get('alumno') ?? '';
  const filteredStudent = students.find(s => s.id === studentFilter);
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
    const matchesStudent = !studentFilter || e.studentId === studentFilter || (!!filteredStudent && e.student === filteredStudent.name);
    return matchesSearch && matchesBranch && matchesValidity && matchesStudent;
  });

  const totalPages = Math.ceil(filteredEnrollments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedEnrollments = filteredEnrollments.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, vigenciaFilter, studentFilter]);

  useEffect(() => {
    const f = searchParams.get('ficha');
    if (f) setFichaId(f);
  }, [searchParams]);

  const setVigencia = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set('vigencia', v); else next.delete('vigencia');
    setSearchParams(next, { replace: true });
  };

  const handleOpenDetail = (id: string) => setFichaId(id);
  const closeFicha = () => {
    setFichaId(null);
    if (searchParams.get('ficha')) {
      const next = new URLSearchParams(searchParams);
      next.delete('ficha');
      setSearchParams(next, { replace: true });
    }
  };
  const clearStudentFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('alumno');
    setSearchParams(next, { replace: true });
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

        {filteredStudent && (
          <div className="px-4 py-2.5 border-b border-border-soft bg-info-tint/40 flex items-center justify-between text-sm">
            <span className="text-text-primary">Matrículas de <strong>{filteredStudent.name}</strong> ({filteredEnrollments.length})</span>
            <button type="button" onClick={clearStudentFilter} className="inline-flex items-center gap-1 text-primary-accent hover:underline"><X size={14} /> Quitar filtro</button>
          </div>
        )}

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
                    {dropRequests.some(r => r.enrollmentId === row.id && r.status === 'Pendiente') && <div className="mt-1"><Badge variant="warning">Caída solicitada</Badge></div>}
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
                        ...(row.status === 'Activa' ? [{ label: 'Corregir datos', onClick: () => setEditFor(row.id) }] : []),
                        { label: 'Ver plan', onClick: () => navigate(`/operacion/planes-y-cartera?plan=${plans.find(p => p.mat === row.id)?.id ?? ''}`) },
                        ...(row.status === 'Activa'
                          ? [dropRequests.some(r => r.enrollmentId === row.id && r.status === 'Pendiente')
                            ? { label: 'Resolver caída solicitada', onClick: () => setFichaId(row.id), danger: true }
                            : { label: 'Solicitar caída', onClick: () => setDropFor(row.id), danger: true }]
                          : []),
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

      {/* Ficha de la matrícula */}
      <EnrollmentFichaModal enrollmentId={fichaId} onClose={() => closeFicha()} />
      <DropRequestModal enrollmentId={dropFor} onClose={() => setDropFor(null)} />
      <EditEnrollmentModal enrollmentId={editFor} onClose={() => setEditFor(null)} />
    </div>
  );
}
