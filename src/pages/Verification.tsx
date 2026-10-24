import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, CheckCircle, Package, AlertCircle, ArrowRight, Layers, ShieldAlert } from 'lucide-react';
import { ClearFilters } from '../components/ui/ClearFilters';
import { useTablePagination } from '../hooks/useTablePagination';
import { useData, Enrollment, Recipe } from '../context/DataContext';
import { availableStock } from '../utils/inventory';
import { longDayLabel, to12h, todayLocalISO } from '../utils/schedule';
import { firstSessionOf } from '../utils/validity';
import { GATE_LABEL, compareGates } from '../utils/verificationGate';
import { DateInput } from '../components/ui/DateInput';
import {
  availableComponents,
  canSplitKit,
  checkPaymentGate,
  computeVerification,
  findShortage,
  initialModes,
  isLineDelivered,
  pendingDeductions,
  recipeForEnrollment,
  type Deduction,
  type DeliveryMode,
} from '../utils/verification';

/** Lo que se muestra en la ventana de confirmación antes de entregar y descontar el stock. */
interface PendingConfirm {
  deductions: Deduction[];
  notDelivered: string[];
  complete: boolean;
  delivered: number;
  total: number;
}

export function Verification() {
  const { enrollments, recipes, items, programs, branches, stockItems, plans, staff, assignments, schedules, updateStock, updateEnrollmentVerification, pendingFirstSessions } = useData();
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [modes, setModes] = useState<Record<string, DeliveryMode>>({});
  const [alreadyDelivered, setAlreadyDelivered] = useState<string[]>([]);
  const [verifierId, setVerifierId] = useState('');
  const [observation, setObservation] = useState('');
  const [verificationDate, setVerificationDate] = useState(todayLocalISO());
  const [formError, setFormError] = useState<string | null>(null);
  const [paymentWarning, setPaymentWarning] = useState<string | null>(null);
  // Confirmación previa: la entrega descuenta stock, así que no basta con un botón de guardar
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  // Matrículas cuya primera asesoría espera la verificación (por número de matrícula)
  const waiting = pendingFirstSessions();

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  // Personal de la sede de la matrícula (el verificador se elige de esta lista)
  const branchName = selectedEnrollment
    ? (branches.find(b => b.id === selectedEnrollment.branchId)?.name ?? selectedEnrollment.sede ?? '')
    : '';
  const branchStaff = staff.filter(s =>
    s.status === 'Activo' && assignments.some(a => a.staffId === s.id && a.status === 'Activa' && a.branch === branchName)
  );
  const verifierStaff = branchStaff.find(s => s.id === verifierId);

  // El estado Completo / Incompleto se calcula con lo que se marca
  const verification = activeRecipe ? computeVerification(activeRecipe, items, checkedItems, modes) : null;

  const setChecked = (id: string, value: boolean) => setCheckedItems(prev => ({ ...prev, [id]: value }));

  const switchMode = (itemId: string, next: DeliveryMode) => {
    const item = items.find(i => i.id === itemId);
    setModes(prev => ({ ...prev, [itemId]: next }));
    setCheckedItems(prev => {
      const n = { ...prev };
      if (next === 'componentes') delete n[itemId];
      else item?.composition?.forEach(c => { if (!alreadyDelivered.includes(c.itemId)) delete n[c.itemId]; });
      return n;
    });
  };

  const handleSaveVerification = () => {
    if (!selectedEnrollment || !activeRecipe || !verification) return;
    setFormError(null);

    // Condición de pago: no se verifica sin el primer pago registrado
    const gate = checkPaymentGate(selectedEnrollment, plans);
    if (!gate.ok) {
      setIsVerifyOpen(false);
      setPaymentWarning(gate.reason ?? 'Realice el primer pago antes de realizar la verificación.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(verificationDate)) {
      setFormError('Indique la fecha de verificación.');
      return;
    }
    if (verificationDate > todayLocalISO()) {
      setFormError('La fecha de verificación no puede ser futura.');
      return;
    }
    if (!verifierStaff) {
      setFormError('Seleccione al verificador entre el personal de la sede.');
      return;
    }

    const branchId = selectedEnrollment.branchId || '';
    const deductions = pendingDeductions(activeRecipe, items, verification.deliveredIds, alreadyDelivered, modes);
    const missing = findShortage(stockItems, branchId, deductions, items);
    if (missing) {
      setFormError(`Sin stock suficiente en la sede para: ${missing}. Desmárquelo o registre un ingreso de stock.`);
      return;
    }

    // Todo en orden: antes de entregar y descontar el stock se pide una confirmación explícita
    const notDelivered = activeRecipe.items
      .filter(line => {
        const item = items.find(i => i.id === line.itemId);
        return !isLineDelivered(line, item, checkedItems, modes[line.itemId] ?? 'kit');
      })
      .map(line => items.find(i => i.id === line.itemId)?.name ?? line.itemId);
    setAcknowledged(false);
    setConfirm({ deductions, notDelivered, complete: verification.complete, delivered: verification.delivered, total: verification.total });
  };

  /** Confirmada la entrega: descuenta el stock de la sede y deja la matrícula verificada. */
  const applyVerification = () => {
    if (!selectedEnrollment || !verification || !verifierStaff || !confirm) return;
    const branchId = selectedEnrollment.branchId || '';
    confirm.deductions.forEach(d => {
      updateStock(
        branchId,
        d.itemId,
        -d.quantity,
        'Entrega por Verificación',
        `Entrega a alumno ${selectedEnrollment.student} (Matrícula: ${selectedEnrollment.id})`,
        selectedEnrollment.id
      );
    });

    updateEnrollmentVerification(selectedEnrollment.id, {
      status: verification.status,
      items: verification.deliveredIds,
      observation,
      date: verificationDate,
      verifier: `${verifierStaff.names} ${verifierStaff.lastNameP} ${verifierStaff.lastNameM}`.trim(),
    });

    setConfirm(null);
    setIsVerifyOpen(false);
    setFormError(null);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, programFilter]);

  const handleOpenVerify = (enrollment: Enrollment) => {
    // Sin el primer pago registrado no se puede verificar: solo se muestra la advertencia
    const gate = checkPaymentGate(enrollment, plans);
    if (!gate.ok) {
      // Sin el pago tampoco se puede entregar: se recuerda lo que eso implica para la primera asesoría
      const waitingGate = waiting[enrollment.id];
      setPaymentWarning(`${gate.reason ?? 'Realice el primer pago antes de realizar la verificación.'}${waitingGate ? ` ${waitingGate.message}` : ''}`);
      return;
    }
    setSelectedEnrollment(enrollment);

    // Receta de materiales vigente para el programa, nivel y sede de la matrícula
    const recipe = recipeForEnrollment(enrollment, recipes, todayLocalISO());

    setActiveRecipe(recipe || null);
    
    // Lo ya entregado en verificaciones anteriores queda marcado y bloqueado (su stock ya salió)
    const delivered = enrollment.verifiedItems ?? [];
    const initialChecked: Record<string, boolean> = {};
    delivered.forEach(id => { initialChecked[id] = true; });
    setCheckedItems(initialChecked);
    setAlreadyDelivered(delivered);
    setModes(recipe ? initialModes(recipe, items, delivered) : {});
    setObservation(enrollment.verificationObservation || '');
    // La verificación guarda solo la fecha (los registros antiguos traían fecha y hora)
    setVerificationDate(enrollment.verificationDate ? enrollment.verificationDate.slice(0, 10) : todayLocalISO());
    setFormError(null);
    // Verificador previo, si aún pertenece al personal de la sede
    const branchNameOf = branches.find(b => b.id === enrollment.branchId)?.name ?? enrollment.sede ?? '';
    const previous = staff.find(st =>
      `${st.names} ${st.lastNameP} ${st.lastNameM}`.trim() === enrollment.verifier &&
      assignments.some(a => a.staffId === st.id && a.status === 'Activa' && a.branch === branchNameOf)
    );
    setVerifierId(previous?.id ?? '');
    setIsVerifyOpen(true);
  };

  const filteredEnrollments = enrollments.filter(e => {
    const matchesSearch = e.student.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         e.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProgram = !programFilter || e.programId === programFilter;
    
    const matchesStatus = !statusFilter || 
                         (statusFilter === 'pendiente' && (!e.verificationStatus || e.verificationStatus === 'Pendiente')) ||
                         (statusFilter === 'incompleta' && e.verificationStatus === 'Verificado Incompleto') ||
                         (statusFilter === 'completa' && e.verificationStatus === 'Verificado Completo') ||
                         (statusFilter === 'primera' && !!waiting[e.id]);

    return matchesSearch && matchesProgram && matchesStatus;
  }).sort((a, b) => {
    // Primero las que tienen la primera asesoría esperando: lo vencido y lo más cercano arriba
    const ga = waiting[a.id];
    const gb = waiting[b.id];
    if (ga && gb) return compareGates(ga, gb);
    return ga ? -1 : gb ? 1 : 0;
  });

  const totalPages = Math.ceil(filteredEnrollments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedEnrollments = filteredEnrollments.slice(startIndex, endIndex);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Verificación</h2>
          <p className="text-sm text-text-secondary">Control de entrega de artículos y activación de matrículas</p>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-surface border border-border-soft rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-border-soft">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
              <input 
                type="text" 
                placeholder="Buscar por alumno o matrícula..." 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select 
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Estado Entrega</option>
                <option value="pendiente">Pendiente</option>
                <option value="incompleta">Incompleta</option>
                <option value="completa">Completa</option>
                <option value="primera">Esperan la 1.ª asesoría</option>
              </select>
              <select 
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
                value={programFilter}
                onChange={(e) => setProgramFilter(e.target.value)}
              >
                <option value="">Programa</option>
                {programs.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ClearFilters active={!!(searchTerm || statusFilter || programFilter)} onClear={() => { setSearchTerm(''); setStatusFilter(''); setProgramFilter(''); }} className="h-10 rounded-xl" />
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 font-medium">Matrícula</th>
                <th className="px-6 py-3 font-medium">Alumno</th>
                <th className="px-6 py-3 font-medium">Programa/Nivel</th>
                <th className="px-6 py-3 font-medium">Fecha Matrícula</th>
                <th className="px-6 py-3 font-medium">1.ª Asesoría</th>
                <th className="px-6 py-3 font-medium">Estado Entrega</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedEnrollments.map((row) => (
                <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3 font-mono text-text-primary text-xs">{row.id}</td>
                  <td className="px-6 py-3">
                    <div className="font-medium text-text-primary">{row.student}</div>
                    <div className="text-[10px] text-text-muted">{row.sede}</div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">
                    <div>{row.program}</div>
                    <div className="text-xs text-text-muted">{row.level || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary text-xs">{row.date}</td>
                  <td className="px-6 py-3 text-xs">
                    {(() => {
                      const gate = waiting[row.id];
                      const first = gate?.session ?? firstSessionOf(row.id, schedules);
                      if (!first) return <span className="text-text-muted">—</span>;
                      return (
                        <div className="space-y-1">
                          <div className="text-text-secondary">{longDayLabel(first.date)} · {to12h(first.time)}</div>
                          {gate ? (
                            <Badge variant={gate.level === 'planificada' ? 'neutral' : gate.level === 'urgente' ? 'warning' : 'danger'}>
                              {gate.overdue ? 'Reprogramar: sin materiales' : `${GATE_LABEL[gate.level]} · ${gate.daysLeft === 0 ? 'hoy' : gate.daysLeft === 1 ? 'mañana' : `en ${gate.daysLeft} días`}`}
                            </Badge>
                          ) : (
                            <span className="text-text-muted">
                              {first.status === 'Asistió' ? 'Ya asistió' : first.status}
                              {!row.verificationStatus || row.verificationStatus === 'Pendiente'
                                ? (!recipeForEnrollment(row, recipes, todayLocalISO()) && ['Reservado', 'Reprogramado'].includes(first.status) ? ' · sin receta: no se bloquea' : '')
                                : ''}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-3">
                    <Badge 
                      variant={
                        row.verificationStatus === 'Verificado Completo' ? 'success' : 
                        row.verificationStatus === 'Verificado Incompleto' ? 'warning' : 
                        'neutral'
                      }
                    >
                      {row.verificationStatus || 'Pendiente'}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Button variant="primary" className="text-xs py-1.5 px-3 flex items-center gap-2 ml-auto" onClick={() => handleOpenVerify(row)}>
                      <span>Verificar</span>
                      <ArrowRight size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
              {paginatedEnrollments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-text-muted">
                    No se encontraron matrículas pendientes de verificación
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-border-soft flex items-center justify-between bg-surface">
          <span className="text-sm text-text-secondary text-xs">
            Mostrando {filteredEnrollments.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredEnrollments.length)} de {filteredEnrollments.length} registros
          </span>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="h-8 px-3 text-xs"
            >
              Anterior
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
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
              className="h-8 px-3 text-xs"
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      {/* Verificar Entrega Modal */}
      <Modal 
        isOpen={isVerifyOpen} 
        onClose={() => {
          setIsVerifyOpen(false);
          setFormError(null);
        }} 
        title="Verificar Entrega de Artículos"
        size="2xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => {
              setIsVerifyOpen(false);
              setFormError(null);
            }}>Cancelar</Button>
            <Button 
              variant="primary" 
              disabled={!activeRecipe || !verifierId}
              onClick={handleSaveVerification}
            >
              Revisar y confirmar
            </Button>
          </div>
        }
      >
        {selectedEnrollment && (
          <div className="space-y-6">
            {formError && (
              <div className="bg-danger-tint/50 border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text animate-in fade-in slide-in-from-top-1">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <p>{formError}</p>
              </div>
            )}
            <div className="bg-surface-muted p-4 rounded-xl border border-border-soft">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-text-primary">{selectedEnrollment.id}</h3>
                  <p className="text-sm text-text-secondary mt-1">Alumno: {selectedEnrollment.student}</p>
                  <p className="text-sm text-text-secondary">
                    Programa: {selectedEnrollment.program} {selectedEnrollment.level ? `- ${selectedEnrollment.level}` : ''}
                  </p>
                  <p className="text-xs text-text-muted mt-1">Sede: {selectedEnrollment.sede}</p>
                </div>
                <Badge 
                  variant={
                    selectedEnrollment.verificationStatus === 'Verificado Completo' ? 'success' : 
                    selectedEnrollment.verificationStatus === 'Verificado Incompleto' ? 'warning' : 
                    'neutral'
                  }
                >
                  {selectedEnrollment.verificationStatus || 'Pendiente'}
                </Badge>
              </div>
            </div>

            {waiting[selectedEnrollment.id] && (
              <div className={`rounded-xl border p-3 text-sm ${waiting[selectedEnrollment.id].overdue || waiting[selectedEnrollment.id].level === 'critica' ? 'bg-danger-tint/60 border-danger-text/20 text-danger-text' : 'bg-warning-tint/60 border-warning-text/20 text-warning-text'}`}>
                {waiting[selectedEnrollment.id].message}
              </div>
            )}

            {!activeRecipe ? (
              <div className="p-4 bg-danger/10 border border-danger/20 rounded-xl flex gap-3 items-start">
                <AlertCircle className="text-danger shrink-0" size={20} />
                <div>
                  <h4 className="text-sm font-semibold text-danger">No se encontró una receta vigente</h4>
                  <p className="text-xs text-danger/80 mt-1">
                    No existe una receta de materiales activa para este programa, nivel y sede en la fecha actual. 
                    Debe configurar una receta en "Configuración comercial" para proceder.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-secondary">Fecha de verificación *</label>
                    <DateInput
                      max={todayLocalISO()}
                      value={verificationDate}
                      onChange={(e) => setVerificationDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-secondary">Verificador *</label>
                    <select
                      className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
                      value={verifierId}
                      onChange={(e) => setVerifierId(e.target.value)}
                    >
                      <option value="">{branchStaff.length ? 'Seleccionar verificador...' : 'No hay personal asignado a la sede'}</option>
                      {branchStaff.map(st => (
                        <option key={st.id} value={st.id}>{st.names} {st.lastNameP} {st.lastNameM}</option>
                      ))}
                    </select>
                    <p className="text-xs text-text-muted">Personal activo de la sede {branchName}.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                      <Package size={16} />
                      Checklist de Artículos (Receta: {activeRecipe.name})
                    </h3>
                    <span className="text-xs text-text-muted">Pide confirmación y descuenta stock</span>
                  </div>

                  <div className="border border-border-soft rounded-xl overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                        <tr>
                          <th className="px-4 py-3 w-10 text-center">Entregado</th>
                          <th className="px-4 py-3 font-medium">Artículo / Componente</th>
                          <th className="px-4 py-3 font-medium text-center">Cant.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-soft">
                        {activeRecipe.items.map((line, idx) => {
                          const item = items.find(i => i.id === line.itemId);
                          const branchId = selectedEnrollment.branchId || '';
                          const splittable = canSplitKit(item);
                          const mode: DeliveryMode = modes[line.itemId] ?? 'kit';
                          const kitLocked = alreadyDelivered.includes(line.itemId);
                          const componentsLocked = !!item?.composition?.some(c => alreadyDelivered.includes(c.itemId));
                          const canSwitch = splittable && !kitLocked && !componentsLocked;
                          const kitStock = availableStock(stockItems, branchId, line.itemId);
                          const kitBlocked = !kitLocked && kitStock < line.quantity;
                          const suggestSplit = splittable && kitBlocked && availableComponents(stockItems, branchId, line, item!).length > 0;

                          // --- Kit entregado por componentes: cada componente con su propio stock
                          if (splittable && mode === 'componentes') {
                            return (
                              <React.Fragment key={idx}>
                                <tr className="bg-surface-muted/20">
                                  <td className="px-4 py-3"></td>
                                  <td className="px-4 py-3">
                                    <div className="font-bold text-primary-accent">
                                      {item?.name}
                                      <span className="ml-2 text-[10px] uppercase bg-primary-accent/10 px-1.5 py-0.5 rounded">Por componentes</span>
                                    </div>
                                    {canSwitch && (
                                      <button type="button" className="text-xs text-primary-accent hover:underline mt-1" onClick={() => switchMode(line.itemId, 'kit')}>
                                        Volver a entregar el kit completo
                                      </button>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-center font-medium">{line.quantity}</td>
                                </tr>
                                {item!.composition!.map((c, cIdx) => {
                                  const needed = line.quantity * c.quantity;
                                  const done = alreadyDelivered.includes(c.itemId);
                                  const blocked = !done && availableStock(stockItems, branchId, c.itemId) < needed;
                                  return (
                                    <tr key={`${idx}-${cIdx}`} className={`hover:bg-surface-muted/30 ${blocked ? 'opacity-60 bg-surface-muted' : ''}`}>
                                      <td className="px-4 py-2 text-center pl-8">
                                        <input
                                          type="checkbox"
                                          className="rounded border-border-soft text-primary-accent focus:ring-primary-accent"
                                          checked={!blocked && !!checkedItems[c.itemId]}
                                          disabled={blocked || done}
                                          title={blocked ? 'Sin stock suficiente en la sede' : undefined}
                                          onChange={(e) => setChecked(c.itemId, e.target.checked)}
                                        />
                                      </td>
                                      <td className="px-4 py-2">
                                        <div className="text-sm text-text-primary">{c.name}</div>
                                        <div className={`text-xs ${blocked ? 'text-danger-text font-medium' : 'text-text-muted'}`}>
                                          Stock disponible: {availableStock(stockItems, branchId, c.itemId)}
                                          {blocked && ' — sin stock suficiente'}
                                          {done && ' — ya entregado'}
                                        </div>
                                      </td>
                                      <td className="px-4 py-2 text-center text-xs text-text-muted">{needed}</td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          }

                          // --- Artículo normal o kit completo (una unidad de stock)
                          return (
                            <React.Fragment key={idx}>
                              <tr className={`hover:bg-surface-muted/50 ${item?.isPackage ? 'bg-surface-muted/20' : ''} ${kitBlocked ? 'opacity-60 bg-surface-muted' : ''}`}>
                                <td className="px-4 py-3 text-center">
                                  <input
                                    type="checkbox"
                                    className="rounded border-border-soft text-primary-accent focus:ring-primary-accent"
                                    checked={!kitBlocked && !!checkedItems[line.itemId]}
                                    disabled={kitBlocked || kitLocked}
                                    title={kitBlocked ? 'Sin stock suficiente en la sede' : undefined}
                                    onChange={(e) => setChecked(line.itemId, e.target.checked)}
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <div className={`font-medium ${item?.isPackage ? 'text-primary-accent font-bold' : 'text-text-primary'}`}>
                                    {item?.name || 'Artículo no encontrado'}
                                    {item?.isPackage && <span className="ml-2 text-[10px] uppercase bg-primary-accent/10 px-1.5 py-0.5 rounded">Kit</span>}
                                  </div>
                                  <div className={`text-xs ${kitBlocked ? 'text-danger-text font-medium' : 'text-text-muted'}`}>
                                    Stock disponible: {kitStock}
                                    {kitBlocked && ' — sin stock suficiente, no puede entregarse'}
                                    {kitLocked && ' — ya entregado'}
                                  </div>
                                  {canSwitch && (
                                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => switchMode(line.itemId, 'componentes')}
                                        className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-colors ${
                                          suggestSplit
                                            ? 'border-primary-accent bg-primary-accent/10 text-primary-accent font-medium'
                                            : 'border-border-soft text-text-secondary hover:border-primary-accent hover:text-primary-accent'
                                        }`}
                                      >
                                        <Layers size={12} /> Entregar por componentes
                                      </button>
                                      {suggestSplit && (
                                        <span className="text-xs text-primary-accent">Hay stock de algunos componentes por separado.</span>
                                      )}
                                    </div>
                                  )}
                                  {item?.isPackage && item.composition && item.composition.length > 0 && (
                                    <ul className="mt-1.5 space-y-0.5">
                                      {item.composition.map((c, cIdx) => (
                                        <li key={cIdx} className="flex items-center gap-1.5 text-xs text-text-muted">
                                          <CheckCircle size={12} className={checkedItems[line.itemId] ? 'text-success-text' : 'text-border-soft'} />
                                          {line.quantity * c.quantity}× {c.name}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center font-medium">{line.quantity}</td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-surface-muted border border-border-soft rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-text-secondary">Estado de verificación</p>
                    <p className="text-xs text-text-muted">Se calcula automáticamente según los artículos marcados como entregados.</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={verification?.complete ? 'success' : 'warning'}>
                      {verification?.complete ? 'Completa' : 'Incompleta'}
                    </Badge>
                    <p className="text-xs text-text-muted mt-1">{verification?.delivered ?? 0} de {verification?.total ?? 0} artículos</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-secondary">Observaciones / Incidencias</label>
                  <textarea 
                    className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:border-primary-accent outline-none resize-none" 
                    placeholder="Ej. Polo pendiente por falta de stock en talla S..."
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                  ></textarea>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Confirmación de la entrega: descuenta el stock de la sede y habilita la primera asesoría */}
      <Modal
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        title="Confirmar la entrega de materiales"
        size="lg"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="ghost" onClick={() => setConfirm(null)}>Volver a revisar</Button>
            <Button variant="primary" disabled={!acknowledged} onClick={applyVerification}>Confirmar y descontar stock</Button>
          </div>
        }
      >
        {confirm && selectedEnrollment && verifierStaff && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <p className="text-text-muted">Alumno</p><p className="text-text-primary font-medium">{selectedEnrollment.student}</p>
              <p className="text-text-muted">Matrícula</p><p className="text-text-primary font-mono text-xs self-center">{selectedEnrollment.id}</p>
              <p className="text-text-muted">Sede</p><p className="text-text-primary">{branchName}</p>
              <p className="text-text-muted">Verificador</p><p className="text-text-primary">{verifierStaff.names} {verifierStaff.lastNameP}</p>
              <p className="text-text-muted">Fecha</p><p className="text-text-primary">{verificationDate}</p>
              <p className="text-text-muted">Resultado</p>
              <p><Badge variant={confirm.complete ? 'success' : 'warning'}>{confirm.complete ? 'Verificado Completo' : 'Verificado Incompleto'}</Badge> <span className="text-xs text-text-muted ml-1">{confirm.delivered} de {confirm.total} artículos</span></p>
            </div>

            <div className="border border-border-soft rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-surface-muted/50 text-xs font-medium uppercase text-text-secondary">Se entrega y se descuenta ahora</div>
              {confirm.deductions.length === 0 ? (
                <p className="px-4 py-3 text-sm text-text-muted">No hay artículos nuevos: solo se actualizan los datos de la verificación (el stock no cambia).</p>
              ) : (
                <ul className="divide-y divide-border-soft">
                  {confirm.deductions.map(d => (
                    <li key={d.itemId} className="px-4 py-2 flex justify-between text-sm">
                      <span className="text-text-primary">{items.find(i => i.id === d.itemId)?.name ?? d.itemId}</span>
                      <span className="text-text-secondary font-medium">× {d.quantity}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {confirm.notDelivered.length > 0 && (
              <div className="bg-warning-tint/60 border border-warning-text/20 rounded-xl p-3 text-sm text-warning-text">
                Quedan pendientes de entregar: <strong>{confirm.notDelivered.join(', ')}</strong>. La matrícula quedará como incompleta y podrá completarse en otra verificación.
              </div>
            )}

            {(() => {
              const gate = waiting[selectedEnrollment.id];
              if (!gate?.session) return null;
              return gate.overdue ? (
                <div className="bg-danger-tint/60 border border-danger-text/20 rounded-xl p-3 text-sm text-danger-text">
                  La primera asesoría ({longDayLabel(gate.session.date)}, {to12h(gate.session.time)}) ya pasó sin materiales. Al verificar, la matrícula queda habilitada, pero esa asesoría debe reprogramarse en Programación.
                </div>
              ) : (
                <div className="bg-info-tint/60 border border-info-text/20 rounded-xl p-3 text-sm text-info-text">
                  Con esta verificación la primera asesoría ({longDayLabel(gate.session.date)}, {to12h(gate.session.time)}) queda habilitada para registrarse.
                </div>
              );
            })()}

            <p className="text-xs text-text-muted">
              El stock de la sede {branchName} baja al confirmar y la entrega no se deshace desde esta pantalla: una corrección posterior se hace con un ajuste de inventario.
            </p>
            <label className="flex items-start gap-2 text-sm text-text-primary cursor-pointer">
              <input type="checkbox" className="mt-0.5 rounded border-border-soft text-primary-accent focus:ring-primary-accent" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />
              <span>Confirmo que los artículos indicados fueron entregados físicamente al alumno o a su apoderado.</span>
            </label>
          </div>
        )}
      </Modal>

      {/* Advertencia: no se puede verificar sin el primer pago registrado */}
      {paymentWarning && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-md animate-in fade-in"
          onClick={() => setPaymentWarning(null)}
        >
          <div
            className="bg-surface rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 text-center space-y-4 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto w-12 h-12 rounded-full bg-warning-tint text-warning-text flex items-center justify-center">
              <ShieldAlert size={24} />
            </div>
            <h3 className="text-lg font-semibold text-text-primary">No se puede verificar todavía</h3>
            <p className="text-sm text-text-secondary">{paymentWarning}</p>
            <Button variant="primary" className="w-full justify-center" onClick={() => setPaymentWarning(null)}>Entendido</Button>
          </div>
        </div>
      )}
    </div>
  );
}
