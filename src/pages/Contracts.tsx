import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, Filter, Download, FilePlus, History, X } from 'lucide-react';
import { useData, Contract, Staff } from '../context/DataContext';
import { useTablePagination } from '../hooks/useTablePagination';
import { Modal } from '../components/ui/Modal';
import { ContractFormModal } from './people/ContractFormModal';
import { DateInput } from '../components/ui/DateInput';
import { contractStatus } from '../utils/payroll';
import { todayLocalISO } from '../utils/schedule';

export function ContractsPage() {
  const { contracts, staff, updateContract } = useData();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  // Cierre de contrato (cese): fecha y motivo obligatorios
  const [toClose, setToClose] = useState<Contract | null>(null);
  const [closeDate, setCloseDate] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();
  const today = todayLocalISO();

  const filteredContracts = contracts.filter(contract => {
    const staffName = `${staff.find(s => s.id === contract.staffId)?.names || ''} ${staff.find(s => s.id === contract.staffId)?.lastNameP || ''}`.toLowerCase();
    return staffName.includes(searchTerm.toLowerCase());
  });

  const totalPages = Math.ceil(filteredContracts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedContracts = filteredContracts.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleOpenDetail = (contract: Contract) => {
    setSelectedContract(contract);
    setIsDetailOpen(true);
  };

  const getStaffName = (staffId: string) => {
    const member = staff.find(s => s.id === staffId);
    return member ? `${member.names} ${member.lastNameP} ${member.lastNameM}` : 'Desconocido';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Contratos</h2>
          <p className="text-sm text-text-secondary">Historial contractual y condiciones laborales</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="hidden sm:flex items-center gap-2">
            <Download size={16} />
            Exportar
          </Button>
          <Button variant="primary" onClick={() => setIsFormOpen(true)} className="flex items-center gap-2">
            <FilePlus size={16} />
            Nuevo contrato
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input 
              type="text" 
              placeholder="Buscar por trabajador o código..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
            />
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
            <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]">
              <option value="">Tipo de contrato</option>
              <option value="indeterminado">Indeterminado</option>
              <option value="plazo-fijo">Plazo Fijo</option>
              <option value="locacion">Locación de servicios</option>
            </select>
            <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]">
              <option value="">Estado</option>
              <option value="vigente">Vigente</option>
              <option value="vencido">Vencido</option>
              <option value="cesado">Cesado</option>
            </select>
            <Button variant="secondary" className="shrink-0 px-3">
              <Filter size={16} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Data Table */}
      <Card className="flex-1 overflow-hidden flex flex-col p-0">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 font-medium">Trabajador</th>
                <th className="px-6 py-4 font-medium">Tipo</th>
                <th className="px-6 py-4 font-medium">Inicio</th>
                <th className="px-6 py-4 font-medium">Fin</th>
                <th className="px-6 py-4 font-medium">Remuneración</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedContracts.map((contract) => (
                <tr key={contract.id} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-text-primary whitespace-nowrap">{getStaffName(contract.staffId)}</td>
                  <td className="px-6 py-4 text-text-primary">{contract.type}</td>
                  <td className="px-6 py-4 text-text-secondary whitespace-nowrap">{contract.startDate}</td>
                  <td className="px-6 py-4 text-text-secondary whitespace-nowrap">{contract.endDate || '-'}</td>
                  <td className="px-6 py-4 text-text-primary">S/ {contract.netSalary?.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <Badge variant={contractStatus(contract, today) === 'Vigente' ? 'success' : contractStatus(contract, today) === 'Cesado' ? 'danger' : 'warning'}>{contractStatus(contract, today)}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalle', onClick: () => handleOpenDetail(contract) },
                        { label: 'Editar contrato', onClick: () => {} },
                        ...(contractStatus(contract, today) === 'Vigente'
                          ? [{ label: 'Cerrar contrato', onClick: () => { setToClose(contract); setCloseDate(today); setCloseReason(''); setCloseError(null); }, danger: true }]
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
            Mostrando {filteredContracts.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredContracts.length)} de {filteredContracts.length} registros
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
      </Card>

      {/* Detail Modal */}
      <Modal 
        isOpen={isDetailOpen} 
        onClose={() => setIsDetailOpen(false)} 
        title="Detalle del Contrato"
        size="3xl"
      >
        {selectedContract && (
          <div className="space-y-8 pb-4">
            {/* Staff Info */}
            <div className="bg-surface-muted p-4 rounded-xl border border-border-soft">
              <label className="text-xs text-text-muted uppercase tracking-wider">Trabajador</label>
              <p className="text-lg font-semibold text-text-primary mt-1">{getStaffName(selectedContract.staffId)}</p>
            </div>

            {/* Contract Conditions */}
            <section>
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4 border-b border-border-soft pb-2">Condiciones Laborales</h3>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Tipo de Contrato</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedContract.type}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Estado</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{contractStatus(selectedContract, today)}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Fecha de Inicio</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedContract.startDate}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Fecha de Fin</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedContract.endDate || 'Indeterminado'}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Jornada</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedContract.shift}</p>
                </div>
              </div>
            </section>

            {/* Remuneration & Pension */}
            <section>
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4 border-b border-border-soft pb-2">Remuneración y Pensión</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Sueldo Bruto</label>
                  <p className="text-sm font-medium text-text-primary mt-1">S/ {selectedContract.grossSalary?.toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Aportes</label>
                  <p className="text-sm font-medium text-text-primary mt-1">S/ {selectedContract.contribution?.toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Sueldo Neto</label>
                  <p className="text-sm font-medium text-text-primary mt-1 font-bold text-primary-accent">S/ {selectedContract.netSalary?.toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Sistema de Pensión</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedContract.pensionSystem} {selectedContract.pensionFund ? `(${selectedContract.pensionFund})` : ''}</p>
                </div>
              </div>
            </section>

            {/* Vacations */}
            <section>
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4 border-b border-border-soft pb-2">Vacaciones</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Inicio</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedContract.vacationStart || '-'}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Retorno</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedContract.vacationEnd || '-'}</p>
                </div>
              </div>
            </section>

            {selectedContract.status === 'Cesado' && (
              <section className="bg-destructive/5 p-4 rounded-xl border border-destructive/10">
                <label className="text-xs text-destructive font-semibold uppercase tracking-wider">Motivo de Cese</label>
                <p className="text-sm text-text-primary mt-1">{selectedContract.terminationReason}</p>
              </section>
            )}
          </div>
        )}
      </Modal>

      <ContractFormModal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} />

      <Modal
        isOpen={!!toClose}
        onClose={() => setToClose(null)}
        title="Cerrar Contrato"
        size="md"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="ghost" onClick={() => setToClose(null)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!toClose) return;
                if (!closeDate) { setCloseError('Indique la fecha de cese.'); return; }
                if (closeDate < toClose.startDate) { setCloseError('La fecha de cese no puede ser anterior al inicio del contrato.'); return; }
                if (closeReason.trim().length < 5) { setCloseError('Indique el motivo del cese.'); return; }
                updateContract(toClose.id, { status: 'Cesado', endDate: closeDate, terminationReason: closeReason.trim() });
                setToClose(null);
              }}
            >
              Cerrar contrato
            </Button>
          </div>
        }
      >
        {toClose && (
          <div className="space-y-4 pb-2">
            <p className="text-sm text-text-secondary">
              Se cerrará el contrato {toClose.type.toLowerCase()} de <span className="font-medium text-text-primary">{getStaffName(toClose.staffId)}</span>. Después se podrá registrar uno nuevo.
            </p>
            {closeError && <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 text-sm text-danger-text">{closeError}</div>}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Fecha de cese <span className="text-error">*</span></label>
              <DateInput min={toClose.startDate} value={closeDate} onChange={e => { setCloseDate(e.target.value); setCloseError(null); }} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Motivo del cese <span className="text-error">*</span></label>
              <textarea
                className="w-full h-24 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-none"
                value={closeReason}
                onChange={e => { setCloseReason(e.target.value); setCloseError(null); }}
                placeholder="Ej: Renuncia voluntaria, fin de contrato..."
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
