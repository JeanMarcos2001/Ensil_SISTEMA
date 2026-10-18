import React, { useEffect, useMemo, useState } from 'react';
import { Search, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useData, type Student } from '../../context/DataContext';
import { useTablePagination } from '../../hooks/useTablePagination';
import { branchOfStudent, longDayLabel, slotLabel, statusTone } from '../../utils/schedule';
import { nativeFieldCls } from './formStyles';

const METRIC_LABEL: Record<string, string> = {
  modulo: 'Módulo', nivel: 'Nivel', sesion: 'Sesión', semana: 'Semana', velocidad: 'Velocidad (pxm)',
  comprension: 'Comprensión (%)', identifica: '¿Identifica?', leeSolo: '¿Lee solo?',
};

/**
 * Historial del alumno (solo consulta): sus asesorías con el estado de cada una y, cuando asistió, la sesión
 * registrada (avance y métricas). Las sesiones se registran desde Programación.
 */
export function StudentHistory() {
  const { students, schedules, trackings, enrollments, branches } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  const branchName = (id?: string) => branches.find(b => b.id === id)?.name ?? '—';

  const rows = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return students
      .map(student => {
        const own = schedules.filter(s => s.studentId === student.id || s.student === student.name);
        const attended = own.filter(s => s.status === 'Asistió');
        const last = [...attended].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
        return { student, branchId: branchOfStudent(student, enrollments), total: own.length, attended: attended.length, last };
      })
      .filter(r =>
        (!branchFilter || r.branchId === branchFilter) &&
        (r.student.name.toLowerCase().includes(term) || r.student.program.toLowerCase().includes(term) || r.student.doc.includes(term))
      );
  }, [students, schedules, enrollments, searchTerm, branchFilter]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, branchFilter]);

  const totalPages = Math.ceil(rows.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginated = rows.slice(startIndex, endIndex);

  // Detalle del alumno elegido
  const detail = useMemo(() => {
    if (!selected) return { items: [] as any[], legacy: [] as typeof trackings, attended: 0, missed: 0 };
    const own = schedules
      .filter(s => s.studentId === selected.id || s.student === selected.name)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const legacy = trackings.filter(t => t.studentId === selected.id && !t.scheduleId).sort((a, b) => b.date.localeCompare(a.date));
    return {
      items: own.map(s => ({ schedule: s, session: trackings.find(t => t.scheduleId === s.id) })),
      legacy,
      attended: own.filter(s => s.status === 'Asistió').length,
      missed: own.filter(s => s.status === 'Faltó').length,
    };
  }, [selected, schedules, trackings]);

  const MetricsGrid = ({ metrics }: { metrics: Record<string, any> | null }) => {
    const entries = Object.entries(metrics ?? {}).filter(([, v]) => v !== '' && v !== undefined);
    if (entries.length === 0) return null;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-surface rounded-lg border border-border-soft">
        {entries.map(([k, v]) => (
          <div key={k}>
            <p className="text-xs text-text-secondary">{METRIC_LABEL[k] ?? k}</p>
            <p className="font-medium text-text-primary text-sm">{String(v)}</p>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Historial del Alumno</h1>
        <p className="text-text-secondary mt-1">Consulta de asesorías y sesiones por alumno. Las sesiones se registran desde Programación, en la asesoría a la que asistió.</p>
      </div>

      <div className="bg-surface border border-border-soft rounded-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border-soft flex flex-col sm:flex-row gap-3 justify-between items-center bg-surface-muted/30">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              type="text"
              placeholder="Buscar alumno por nombre, documento o programa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-10 pr-4 text-sm focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent/10 transition-all font-medium"
            />
          </div>
          <select className={`${nativeFieldCls} sm:w-48`} value={branchFilter} onChange={e => setBranchFilter(e.target.value)} aria-label="Filtrar por sede">
            <option value="">Todas las sedes</option>
            {branches.filter(b => b.status === 'Activo').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-soft bg-surface-muted/50 sticky top-0 z-10">
                <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Alumno</th>
                <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Programa</th>
                <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Sede</th>
                <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Asesorías</th>
                <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Última asistencia</th>
                <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginated.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-sm text-text-muted">No se encontraron alumnos.</td></tr>
              )}
              {paginated.map(({ student, branchId, total, attended, last }) => (
                <tr key={student.id} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary-accent/5 flex items-center justify-center text-primary-accent border border-primary-accent/10 font-bold">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-text-primary tracking-tight">{student.name}</p>
                        <p className="text-[10px] text-text-muted font-medium uppercase tracking-tighter">{student.doc}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-sm text-text-primary font-medium">{student.program}</td>
                  <td className="py-4 px-6 text-sm text-text-secondary">{branchName(branchId)}</td>
                  <td className="py-4 px-6 text-sm text-text-secondary">{total} · <span className="text-text-primary font-medium">{attended}</span> asistidas</td>
                  <td className="py-4 px-6 text-sm text-text-secondary">{last ? longDayLabel(last.date) : '—'}</td>
                  <td className="py-4 px-6 text-right">
                    <Button variant="secondary" size="sm" onClick={() => setSelected(student)} className="h-8 rounded-lg font-bold text-[10px] uppercase tracking-wider border-border-soft">
                      Ver historial
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-border-soft flex items-center justify-between bg-surface">
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Mostrando {rows.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, rows.length)} de {rows.length} alumnos
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="h-8 px-3 rounded-lg border-border-soft">
              <ChevronLeft size={16} className="mr-1" /> Anterior
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages || totalPages === 0} className="h-8 px-3 rounded-lg border-border-soft">
              Siguiente <ChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        </div>
      </div>

      <Modal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Historial de ${selected.name}` : ''}
        size="3xl"
        footer={<div className="flex justify-end w-full"><Button variant="ghost" onClick={() => setSelected(null)}>Cerrar</Button></div>}
      >
        {selected && (
          <div className="space-y-5 pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info">{selected.program}</Badge>
              <Badge variant="success">{detail.attended} {detail.attended === 1 ? 'asistencia' : 'asistencias'}</Badge>
              {detail.missed > 0 && <Badge variant="danger">{detail.missed} {detail.missed === 1 ? 'falta' : 'faltas'}</Badge>}
            </div>

            {detail.items.length === 0 && detail.legacy.length === 0 && (
              <div className="text-center py-10 text-text-muted">
                <ClipboardList size={32} className="mx-auto mb-3 opacity-30" />
                <p>Este alumno aún no tiene asesorías registradas.</p>
              </div>
            )}

            <div className="space-y-3">
              {detail.items.map(({ schedule: s, session }) => (
                <div key={s.id} className="p-4 border border-border-soft rounded-xl space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {longDayLabel(s.date)} · {slotLabel(s.time)}
                        {s.isFirst && <span className="ml-2 text-xs font-medium text-primary-accent">Primera asesoría</span>}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5">{s.program} · {s.level} · {s.responsible}</p>
                    </div>
                    <Badge variant={statusTone(s.status) as any}>{s.status}</Badge>
                  </div>
                  {session ? (
                    <>
                      <MetricsGrid metrics={session.metrics} />
                      {session.checklist && (
                        <p className="text-xs text-text-secondary">
                          Cierre: metodología {session.checklist.methodologyExplained ? 'explicada' : 'pendiente'} · artículos {session.checklist.itemsExplained ? 'explicados' : 'pendientes'} · apoderado {session.checklist.guardianAttended ? 'asistió' : 'no asistió'}
                        </p>
                      )}
                      {session.observations && <p className="text-sm text-text-secondary">{session.observations}</p>}
                    </>
                  ) : (
                    s.status === 'Asistió' && <p className="text-xs text-warning-text font-medium">Falta registrar la sesión (Programación).</p>
                  )}
                </div>
              ))}

              {detail.legacy.length > 0 && (
                <>
                  <p className="text-sm font-medium text-text-secondary pt-2">Registros anteriores (sin asesoría vinculada)</p>
                  {detail.legacy.map(t => (
                    <div key={t.id} className="p-4 border border-border-soft rounded-xl space-y-3 bg-surface-muted/40">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-text-primary">{longDayLabel(t.date)}</p>
                        <Badge variant={t.status === 'Asistió' ? 'success' : t.status === 'Faltó' ? 'danger' : 'neutral'}>{t.status}</Badge>
                      </div>
                      {t.status === 'Asistió' && <MetricsGrid metrics={t.metrics} />}
                      {t.observations && <p className="text-sm text-text-secondary">{t.observations}</p>}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
