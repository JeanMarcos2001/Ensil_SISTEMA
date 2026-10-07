import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, Filter, Download, Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useTablePagination } from '../hooks/useTablePagination';
import { Modal } from '../components/ui/Modal';

export function Guardians() {
  const { guardians, students, addGuardian, updateGuardian } = useData();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedGuardianId, setSelectedGuardianId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGuardian, setEditingGuardian] = useState<any | null>(null);

  const selectedGuardian = guardians.find(g => g.id === selectedGuardianId);
  const guardianStudents = students.filter(s => s.titular === selectedGuardian?.name);

  const handleOpenDetail = (id: string) => {
    setSelectedGuardianId(id);
    setIsDetailOpen(true);
  };

  const handleOpenForm = (guardian?: any) => {
    setEditingGuardian(guardian || null);
    setIsFormOpen(true);
  };

  const filteredGuardians = guardians.filter(g => 
    g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.doc.toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.phone.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredGuardians.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedGuardians = filteredGuardians.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const guardianData = {
      doc: formData.get('doc') as string,
      name: `${formData.get('names')} ${formData.get('lastNameP')} ${formData.get('lastNameM')}`,
      phone: formData.get('phone') as string,
      email: formData.get('email') as string,
      relationship: formData.get('relationship') as string,
      address: formData.get('address') as string,
      students: editingGuardian?.students || 0,
      enrollments: editingGuardian?.enrollments || 0,
      balance: editingGuardian?.balance || '$0',
    };

    if (editingGuardian) {
      updateGuardian(editingGuardian.id, guardianData);
    } else {
      addGuardian(guardianData);
    }

    setIsFormOpen(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Titulares</h2>
          <p className="text-sm text-text-secondary">Responsables y apoderados</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="hidden sm:flex items-center gap-2">
            <Download size={16} />
            Exportar
          </Button>
          <Button variant="primary" onClick={() => handleOpenForm()} className="flex items-center gap-2">
            <Plus size={16} />
            Nuevo titular
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
              placeholder="Buscar por nombre, documento, correo o teléfono..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
            />
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
            <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]">
              <option value="">Con deuda</option>
              <option value="si">Sí</option>
              <option value="no">No</option>
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
                <th className="px-6 py-4 font-medium">Titular / Doc</th>
                <th className="px-6 py-4 font-medium">Contacto</th>
                <th className="px-6 py-4 font-medium text-center">Alumnos</th>
                <th className="px-6 py-4 font-medium text-center">Matrículas</th>
                <th className="px-6 py-4 font-medium">Saldo Pendiente</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedGuardians.map((row, idx) => (
                <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-text-primary">{row.name}</div>
                    <div className="text-xs text-text-muted">{row.doc}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-text-primary">{row.phone}</div>
                    <div className="text-xs text-text-muted">{row.email}</div>
                  </td>
                  <td className="px-6 py-4 text-center text-text-secondary">{row.students}</td>
                  <td className="px-6 py-4 text-center text-text-secondary">{row.enrollments}</td>
                  <td className="px-6 py-4">
                    <span className={`font-medium ${row.balance === '$0' ? 'text-text-secondary' : 'text-danger-text'}`}>
                      {row.balance}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver perfil', onClick: () => handleOpenDetail(row.id) },
                        { label: 'Ver estado de cuenta', onClick: () => {} },
                        { label: 'Editar datos', onClick: () => handleOpenForm(row) },
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
            Mostrando {filteredGuardians.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredGuardians.length)} de {filteredGuardians.length} registros
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

      {/* Perfil Titular Modal */}
      <Modal 
        isOpen={isDetailOpen} 
        onClose={() => setIsDetailOpen(false)} 
        title={`Perfil de Titular`}
        size="2xl"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="ghost" onClick={() => setIsDetailOpen(false)}>Cerrar</Button>
            <Button variant="primary" onClick={() => {
              setIsDetailOpen(false);
              handleOpenForm(selectedGuardian);
            }}>Editar Perfil</Button>
          </div>
        }
      >
        {selectedGuardian && (
          <div className="space-y-6 pb-4">
            <div className="flex items-center gap-4 bg-surface-muted p-4 rounded-xl border border-border-soft">
              <div className="w-16 h-16 bg-primary-accent/10 rounded-full flex items-center justify-center text-primary-accent font-bold text-xl">
                {selectedGuardian.name.substring(0, 2)}
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary">{selectedGuardian.name}</h3>
                <p className="text-sm text-text-secondary">DNI: {selectedGuardian.doc}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <span className="text-xs text-text-muted uppercase tracking-wider">Teléfono</span>
                <p className="text-sm font-medium text-text-primary">{selectedGuardian.phone}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-text-muted uppercase tracking-wider">Email</span>
                <p className="text-sm font-medium text-text-primary">{selectedGuardian.email}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-text-muted uppercase tracking-wider">Dirección</span>
                <p className="text-sm font-medium text-text-primary">Av. Principal 123</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-text-muted uppercase tracking-wider">Estado de Cuenta</span>
                <div className="pt-1">
                  <Badge variant={selectedGuardian.balance === '$0' ? 'neutral' : 'danger'}>
                    {selectedGuardian.balance === '$0' ? 'Al día' : `Deuda ${selectedGuardian.balance}`}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="border-t border-border-soft pt-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-bold text-text-primary">Alumnos a Cargo</h4>
                <Badge variant="neutral">{guardianStudents.length} Alumno(s)</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {guardianStudents.map(s => (
                  <div key={s.id} className="bg-surface-muted p-3 rounded-lg flex items-center justify-between border border-border-soft">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{s.name}</p>
                      <p className="text-xs text-text-secondary">{s.program} - {s.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingGuardian ? "Editar Titular" : "Nuevo Titular"}
        size="2xl"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button type="submit" form="guardian-form" variant="primary">Guardar Titular</Button>
          </div>
        }
      >
        <form id="guardian-form" onSubmit={handleSubmit} className="space-y-6 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Documento de Identidad</label>
              <input name="doc" type="text" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent" defaultValue={editingGuardian?.doc} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Parentesco</label>
              <select name="relationship" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent" defaultValue={editingGuardian?.relationship || "padre"}>
                <option value="padre">Padre</option>
                <option value="madre">Madre</option>
                <option value="tio">Tío/a</option>
                <option value="abuelo">Abuelo/a</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Nombres</label>
              <input name="names" type="text" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent" defaultValue={editingGuardian?.name?.split(' ')[0]} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Apellidos</label>
              <input name="lastNameP" type="text" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent" defaultValue={editingGuardian?.name?.split(' ').slice(1).join(' ')} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Teléfono</label>
              <input name="phone" type="tel" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent" defaultValue={editingGuardian?.phone} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Correo Electrónico</label>
              <input name="email" type="email" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent" defaultValue={editingGuardian?.email} required />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">Dirección</label>
            <input name="address" type="text" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent" defaultValue={editingGuardian?.address} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
