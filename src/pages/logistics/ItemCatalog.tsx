import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Search, Plus, Package, Book, Wrench, Layers, Eye, Trash2, Upload, Download, ArrowLeft, AlertTriangle } from 'lucide-react';
import { useTablePagination } from '../../hooks/useTablePagination';
import { useActionError } from '../../hooks/useActionError';
import { useData, Item, ItemType } from '../../context/DataContext';
import { ItemPricesModal } from './ItemPricesModal';
import { ITEM_UNITS, defaultUnitFor, getCurrentPrice, hasReferencePrice, itemSummaryLines, nextSku, suggestedKitPrice, validateItem } from '../../utils/inventory';
import { BULK_HEADERS, BULK_TEMPLATE_ROWS, MAX_BYTES, buildBookBatch, parseCsv, type BulkResult } from '../../utils/itemImport';
import { downloadCsv } from '../../utils/exportCsv';

export function ItemCatalog() {
  const { items, addItems, updateItem, itemPrices, can } = useData();
  const actionError = useActionError();
  const [saving, setSaving] = useState(false);
  const [priceItem, setPriceItem] = useState<Item | null>(null);
  const [initialPrice, setInitialPrice] = useState('');
  const [compItemId, setCompItemId] = useState('');
  const [compQty, setCompQty] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [isBulkUpload, setIsBulkUpload] = useState(false);
  // Carga masiva: archivo leído y su validación (se guarda todo o nada)
  const [bulk, setBulk] = useState<{ fileName: string; result: BulkResult } | null>(null);
  const [showSessionTable, setShowSessionTable] = useState(false);
  // Aviso de lo que se acaba de crear (con el SKU que asignó el sistema)
  const [notice, setNotice] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priceFilter, setPriceFilter] = useState('');
  const [isDeliveredFilter, setIsDeliveredFilter] = useState('');
  const [isPackageFilter, setIsPackageFilter] = useState('');

  // Form State
  const [formData, setFormData] = useState<Partial<Item>>({
    status: 'Activo',
    type: 'Material educativo',
    unit: 'Unidad',
    isDeliveredOnEnrollment: true,
    isPackage: false,
    trainingMode: 'General',
    composition: [],
    variableTrainings: []
  });

  const filteredItems = items.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter ? m.type === typeFilter : true;
    const matchesStatus = statusFilter ? m.status === statusFilter : true;
    const matchesPrice = priceFilter === 'missing' ? !hasReferencePrice(itemPrices, m.id) : true;
    const matchesDelivered = isDeliveredFilter ? (isDeliveredFilter === 'true' ? m.isDeliveredOnEnrollment : !m.isDeliveredOnEnrollment) : true;
    const matchesPackage = isPackageFilter ? (isPackageFilter === 'true' ? m.isPackage : !m.isPackage) : true;
    
    return matchesSearch && matchesType && matchesStatus && matchesPrice && matchesDelivered && matchesPackage;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, statusFilter, priceFilter, isDeliveredFilter, isPackageFilter]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = filteredItems.slice(startIndex, endIndex);

  // Confirmation Dialog State
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant: 'danger' | 'primary' | 'warning';
    confirmLabel?: string;
    cancelLabel?: string;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
    variant: 'primary'
  });

  const openConfirm = (config: Omit<typeof confirmConfig, 'isOpen'>) => {
    setConfirmConfig({ ...config, isOpen: true });
  };

  const handleOpenForm = (item?: Item) => {
    if (item) {
      setFormData({ ...item, ...(item.type === 'Material educativo' ? { isDeliveredOnEnrollment: true } : {}) });
      setWizardStep(2);
      setIsBulkUpload(false);
    } else {
      setFormData({
        status: 'Activo',
        isDeliveredOnEnrollment: false,
        isPackage: false,
        trainingMode: 'General',
        composition: [],
        variableTrainings: []
      });
      setWizardStep(1);
      setIsBulkUpload(false);
      setBulk(null);
      setShowSessionTable(false);
    }
    setSelectedItem(item || null);
    setInitialPrice('');
    setCompItemId('');
    setCompQty(1);
    setFormError(null);
    setNotice(null);
    setIsFormOpen(true);
  };

  const handleTypeSelect = (type: ItemType) => {
    // Valores de partida por tipo: el material educativo, el libro y el kit se entregan con la matrícula (se puede cambiar, menos en el material)
    setFormData({
      ...formData,
      type,
      unit: defaultUnitFor(type),
      isPackage: type === 'Kit',
      isDeliveredOnEnrollment: type !== 'Herramienta / adicional',
      composition: [],
    });
    // El precio escrito para otro tipo (si se volvió atrás) no se arrastra al nuevo artículo
    setInitialPrice('');
    setWizardStep(2);
  };

  const handleSave = async () => {
    if (saving) return;
    if (isBulkUpload) {
      if (!bulk) { setFormError('Elija el archivo CSV con los libros.'); return; }
      if (bulk.result.errors.length > 0) { setFormError('El archivo tiene errores: corríjalos y vuelva a cargarlo. No se guardó ningún libro.'); return; }
      if (bulk.result.drafts.length === 0) { setFormError('El archivo no tiene libros para guardar.'); return; }
      setSaving(true);
      const saved = await addItems(bulk.result.drafts);
      setSaving(false);
      if (!saved.ok) { setFormError(saved.error ?? 'No se pudo guardar el lote.'); return; }
      setIsFormOpen(false);
      setFormError(null);
      setBulk(null);
      setNotice(`Se crearon ${saved.ids?.length ?? bulk.result.drafts.length} libro(s)${saved.ids && saved.ids.length > 0 ? `: del ${saved.ids[0]} al ${saved.ids[saved.ids.length - 1]}` : ''}.`);
      return;
    }

    // Un artículo nuevo todavía no tiene SKU (lo asigna el sistema al guardar): se valida con el que le tocaría ahora
    const provisionalSku = nextSku((formData.type ?? 'Material educativo') as ItemType, items.map(i => i.id));
    const validationError = validateItem({ item: selectedItem ? formData : { ...formData, id: provisionalSku }, allItems: items, editingId: selectedItem?.id });
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const priceValue = parseFloat(initialPrice);
    if (!selectedItem && !(priceValue > 0)) {
      setFormError('Indique el precio de referencia (USD) del artículo: es el precio con el que se vende si hace falta.');
      return;
    }

    // El precio vive en `itemPrices` (con vigencia e historial), no dentro del artículo.
    const { salePrice: _legacyPrice, ...itemData } = formData as Item;
    setSaving(true);
    let createdSku: string | undefined;
    let saved: { ok: boolean; error?: string };
    if (selectedItem) {
      saved = await updateItem(selectedItem.id, { ...itemData } as Item);
    } else {
      const { id: _noSku, ...withoutSku } = itemData;
      const created = await addItems([{ item: withoutSku, price: priceValue }]);
      createdSku = created.ids?.[0];
      saved = created;
    }
    setSaving(false);
    if (!saved.ok) { setFormError(saved.error ?? 'No se pudo guardar el artículo.'); return; }
    setIsFormOpen(false);
    setFormError(null);
    if (createdSku) setNotice(`Artículo creado con el código ${createdSku}.`);
  };

  const readBulkFile = (file: File | undefined) => {
    setFormError(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { setBulk(null); setFormError('El archivo debe ser .csv (en Excel: Guardar como → CSV).'); return; }
    if (file.size > MAX_BYTES) { setBulk(null); setFormError('El archivo supera los 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setBulk({ fileName: file.name, result: buildBookBatch(parseCsv(String(reader.result ?? '')), items) });
    reader.onerror = () => setFormError('No se pudo leer el archivo.');
    reader.readAsText(file, 'utf-8');
  };

  const handleOpenDetail = (item: Item) => {
    setSelectedItem(item);
    setIsDetailOpen(true);
  };

  const getTypeIcon = (type: ItemType) => {
    switch (type) {
      case 'Material educativo': return <Package size={16} />;
      case 'Libro': return <Book size={16} />;
      case 'Herramienta / adicional': return <Wrench size={16} />;
      case 'Kit': return <Layers size={16} />;
    }
  };

  // Precio de referencia general vigente del artículo que se edita, el que se está escribiendo (si se crea) y la suma sugerida de un kit
  const referencePrice = selectedItem ? getCurrentPrice(itemPrices, selectedItem.id, 'all')?.amount : undefined;
  const summaryPrice = selectedItem ? referencePrice : (parseFloat(initialPrice) > 0 ? parseFloat(initialPrice) : undefined);
  const kitSuggestion = formData.type === 'Kit' ? suggestedKitPrice(formData.composition ?? [], itemPrices) : undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Catálogo de artículos</h2>
          <p className="text-sm text-text-secondary">Gestión maestra de artículos físicos, materiales, libros y kits</p>
        </div>
        <div className="flex items-center gap-3">
          {can('log-catalogo:create') && (
            <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenForm()}>
              <Plus size={16} />
              Nuevo Artículo
            </Button>
          )}
        </div>
      </div>

      {actionError.error && <p className="mb-4 rounded-xl bg-danger-tint px-4 py-3 text-sm text-danger-text" role="alert">{actionError.error}</p>}
      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-success-tint border border-success-text/20 px-4 py-3 text-sm text-success-text" role="status">
          <p>{notice}</p>
          <button type="button" className="shrink-0 font-medium hover:underline" onClick={() => setNotice(null)}>Cerrar</button>
        </div>
      )}

      {/* Main Content Card */}
      <div className="bg-surface border border-border-soft rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-border-soft">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
              <input 
                type="text" 
                placeholder="Buscar por SKU o nombre..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select 
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
              >
                <option value="">Todos los tipos</option>
                <option value="Material educativo">Material educativo</option>
                <option value="Herramienta / adicional">Herramienta / adicional</option>
                <option value="Libro">Libro</option>
                <option value="Kit">Kit</option>
              </select>
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[120px]"
              >
                <option value="">Estado</option>
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
              <select
                value={priceFilter}
                onChange={(e) => setPriceFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[150px]"
              >
                <option value="">Precio de referencia</option>
                <option value="missing">Sin precio de referencia</option>
              </select>
              <select 
                value={isDeliveredFilter}
                onChange={(e) => setIsDeliveredFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[150px]"
              >
                <option value="">¿Con matrícula?</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
              <select 
                value={isPackageFilter}
                onChange={(e) => setIsPackageFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[120px]"
              >
                <option value="">¿Es kit?</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 font-medium">SKU</th>
                <th className="px-6 py-3 font-medium">Nombre</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium">Costo Ref.</th>
                <th className="px-6 py-3 font-medium">Precio ref.</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedItems.map((row, idx) => (
                <tr key={idx} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3 font-mono text-text-secondary">{row.id}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-accent/10 text-primary-accent flex items-center justify-center">
                        {getTypeIcon(row.type)}
                      </div>
                      <div>
                        <span className="font-medium text-text-primary block">{row.name}</span>
                        <div className="flex gap-2 mt-1">
                          {row.isPackage && <span className="text-[10px] bg-surface-muted px-1.5 py-0.5 rounded text-text-secondary font-medium">Kit</span>}
                          {row.isDeliveredOnEnrollment && <span className="text-[10px] bg-surface-muted px-1.5 py-0.5 rounded text-text-secondary font-medium">Matrícula</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">{row.type}</td>
                  <td className="px-6 py-3 text-text-secondary">$ {row.cost.toFixed(2)}</td>
                  <td className="px-6 py-3 text-text-secondary">
                    {(() => {
                      const ref = getCurrentPrice(itemPrices, row.id, 'all');
                      return ref ? `$ ${ref.amount.toFixed(2)}` : <Badge variant="warning">Sin precio de referencia</Badge>;
                    })()}
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={row.status === 'Activo' ? 'success' : 'neutral'}>{row.status}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalles', onClick: () => handleOpenDetail(row) },
                        { label: 'Editar artículo', hidden: !can('log-catalogo:edit'), onClick: () => handleOpenForm(row) },
                        ...(can('log-catalogo:edit_price') ? [{ label: 'Configurar precios', onClick: () => setPriceItem(row) }] : []),
                        { 
                          label: row.status === 'Activo' ? 'Desactivar' : 'Activar', hidden: !can('log-catalogo:edit'),
                          onClick: () => openConfirm({
                            title: row.status === 'Activo' ? 'Desactivar Artículo' : 'Activar Artículo',
                            description: `¿Está seguro de que desea ${row.status === 'Activo' ? 'desactivar' : 'activar'} el artículo "${row.name}"?`,
                            onConfirm: () => {
                              void actionError.run(updateItem(row.id, { ...row, status: row.status === 'Activo' ? 'Inactivo' : 'Activo' }));
                            },
                            variant: row.status === 'Activo' ? 'warning' : 'primary',
                            confirmLabel: row.status === 'Activo' ? 'SÍ, DESACTIVAR' : 'SÍ, ACTIVAR'
                          }),
                          danger: row.status === 'Activo' 
                        },
                      ]} 
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border-soft flex items-center justify-between bg-surface">
            <span className="text-sm text-text-secondary">
              Mostrando {startIndex + 1} a {Math.min(endIndex, filteredItems.length)} de {filteredItems.length} artículos
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
                disabled={currentPage === totalPages}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Form Modal (Wizard) */}
      <Modal 
        isOpen={isFormOpen} 
        onClose={() => {
          setIsFormOpen(false);
          setFormError(null);
        }} 
        title={
          <div className="flex items-center gap-3">
            {wizardStep === 2 && !selectedItem && (
              <button onClick={() => setWizardStep(1)} className="text-text-muted hover:text-text-primary transition-colors">
                <ArrowLeft size={20} />
              </button>
            )}
            <span>{selectedItem ? "Editar Artículo" : "Crear Nuevo Artículo"}</span>
          </div>
        }
        size={wizardStep === 1 ? "3xl" : "5xl"}
        footer={
          wizardStep === 2 ? (
            <div className="flex justify-between items-center w-full">
              {formData.type === 'Libro' && !selectedItem && (
                <Button variant="secondary" onClick={() => setIsBulkUpload(!isBulkUpload)} className="flex items-center gap-2">
                  {isBulkUpload ? 'Carga Individual' : 'Carga Masiva'}
                </Button>
              )}
              <div className="flex justify-end gap-3 ml-auto">
                <Button variant="ghost" onClick={() => {
                  setIsFormOpen(false);
                  setFormError(null);
                }}>Cancelar</Button>
                <Button variant="primary" onClick={handleSave} disabled={saving}>{isBulkUpload ? 'Guardar Lote' : 'Guardar Artículo'}</Button>
              </div>
            </div>
          ) : null
        }
      >
        {formError && (
           <div className="bg-danger-tint/50 border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text animate-in fade-in slide-in-from-top-1 mb-6">
             <AlertTriangle size={16} className="shrink-0 mt-0.5" />
             <p>{formError}</p>
           </div>
        )}
        {wizardStep === 1 && !selectedItem && (
          <div className="space-y-6 pb-4">
            <p className="text-sm text-text-secondary text-center mb-6">Seleccione el tipo de artículo que desea crear en el catálogo.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                onClick={() => handleTypeSelect('Material educativo')}
                className="flex items-start gap-4 p-5 rounded-xl border-2 border-border-soft hover:border-primary-accent hover:bg-primary-accent/5 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-accent/10 text-primary-accent flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Package size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary text-lg mb-1">Material educativo</h3>
                  <p className="text-sm text-text-secondary">Material metodológico propio del programa. Siempre se entrega con la matrícula.</p>
                </div>
              </button>

              <button 
                onClick={() => handleTypeSelect('Herramienta / adicional')}
                className="flex items-start gap-4 p-5 rounded-xl border-2 border-border-soft hover:border-primary-accent hover:bg-primary-accent/5 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-accent/10 text-primary-accent flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Wrench size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary text-lg mb-1">Herramienta / adicional</h3>
                  <p className="text-sm text-text-secondary">Implementos físicos de apoyo. Se entregan con la matrícula o se venden.</p>
                </div>
              </button>

              <button 
                onClick={() => handleTypeSelect('Libro')}
                className="flex items-start gap-4 p-5 rounded-xl border-2 border-border-soft hover:border-primary-accent hover:bg-primary-accent/5 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-accent/10 text-primary-accent flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Book size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary text-lg mb-1">Libro</h3>
                  <p className="text-sm text-text-secondary">Libro individual, controlado en stock. Se entrega con la matrícula y se vende.</p>
                </div>
              </button>

              <button 
                onClick={() => handleTypeSelect('Kit')}
                className="flex items-start gap-4 p-5 rounded-xl border-2 border-border-soft hover:border-primary-accent hover:bg-primary-accent/5 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-accent/10 text-primary-accent flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Layers size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary text-lg mb-1">Kit</h3>
                  <p className="text-sm text-text-secondary">Unidad armada con varios artículos. Se arma y se desarma en Stock; una matrícula lo recibe como una sola unidad.</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {wizardStep === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8 pb-4">
            {isBulkUpload && formData.type === 'Libro' ? (
              <div className="col-span-2 space-y-6">
                <div className="flex items-center justify-between border-b border-border-soft pb-4">
                  <div>
                    <h3 className="text-lg font-medium text-text-primary">Carga Masiva de Libros</h3>
                    <p className="text-sm text-text-secondary mt-1">Sube un archivo Excel para registrar múltiples libros a la vez.</p>
                  </div>
                  <Button variant="secondary" className="flex items-center gap-2" onClick={() => downloadCsv('plantilla_libros.csv', BULK_HEADERS, BULK_TEMPLATE_ROWS)}>
                    <Download size={16} />
                    Descargar Plantilla
                  </Button>
                </div>
                
                <label
                  className="border-2 border-dashed border-border-soft rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-surface-muted transition-colors cursor-pointer"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); readBulkFile(e.dataTransfer.files?.[0]); }}
                >
                  <div className="w-16 h-16 rounded-full bg-primary-accent/10 text-primary-accent flex items-center justify-center mb-4">
                    <Upload size={28} />
                  </div>
                  <h4 className="font-medium text-text-primary mb-1">{bulk ? bulk.fileName : 'Haz clic o arrastra tu archivo CSV aquí'}</h4>
                  <p className="text-sm text-text-secondary">Formato soportado: .csv (Máx. 5MB). Si trabaja en Excel: Guardar como → CSV.</p>
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { readBulkFile(e.target.files?.[0]); e.target.value = ''; }} />
                </label>

                {bulk && (
                  <div className={`rounded-xl p-4 text-sm border ${bulk.result.errors.length > 0 ? 'bg-danger-tint/40 border-danger-text/20 text-danger-text' : 'bg-success-tint border-success-text/20 text-success-text'}`}>
                    {bulk.result.errors.length === 0 ? (
                      <p className="font-medium">{bulk.result.drafts.length} libro(s) listos para guardar, todos con su precio de referencia.</p>
                    ) : (
                      <>
                        <p className="font-medium mb-2">{bulk.result.errors.length} error(es) en el archivo. No se guardará nada hasta corregirlos:</p>
                        <ul className="list-disc list-inside space-y-0.5 max-h-40 overflow-y-auto">
                          {bulk.result.errors.slice(0, 20).map((er, i) => <li key={i}>Línea {er.line}: {er.message}</li>)}
                          {bulk.result.errors.length > 20 && <li>y {bulk.result.errors.length - 20} más…</li>}
                        </ul>
                      </>
                    )}
                  </div>
                )}

                <div className="bg-info-tint/30 border border-info-text/20 rounded-xl p-4 text-sm text-info-text">
                  <p className="font-medium mb-2">Columnas requeridas en el archivo:</p>
                  <ul className="list-disc list-inside space-y-1 opacity-80">
                    <li>Nombre del Libro (no puede repetirse)</li>
                    <li>Estado (Activo/Inactivo)</li>
                    <li>Unidad de Medida (Unidad, Juego, Kit, Caja, Paquete o Par)</li>
                    <li>Costo Referencial</li>
                    <li>Precio de referencia (USD; obligatorio, mayor a 0)</li>
                    <li>Descripción</li>
                    <li>Tipo de encuadernado (Anillado/Encolado)</li>
                  </ul>
                  <p className="mt-3 opacity-80">El código SKU de cada libro lo asigna el sistema al guardar: no se escribe. Si su archivo trae una columna «SKU», se ignora. Los libros se guardan como «se entrega con la matrícula»; se puede cambiar después en el catálogo.</p>
                </div>
              </div>
            ) : (
              <>
                {/* Columna Izquierda: Info Básica */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-border-soft pb-2">
                    <div className="w-8 h-8 rounded-lg bg-primary-accent/10 text-primary-accent flex items-center justify-center shrink-0">
                      {getTypeIcon(formData.type as ItemType)}
                    </div>
                    <h3 className="text-lg font-medium text-text-primary">
                      {formData.type}
                    </h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-sm font-medium text-text-primary">Código SKU</label>
                      {selectedItem ? (
                        <>
                          <p className="h-10 flex items-center bg-surface-muted border border-border-soft rounded-lg px-3 text-sm font-mono">{selectedItem.id}</p>
                          <p className="text-xs text-text-muted">Lo asignó el sistema y no cambia.</p>
                        </>
                      ) : (
                        <p className="text-xs text-text-muted">
                          El sistema lo asigna al guardar (por ejemplo, {nextSku((formData.type ?? 'Material educativo') as ItemType, items.map(i => i.id))}): no hace falta escribirlo.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-sm font-medium text-text-primary">Nombre del Artículo <span className="text-error">*</span></label>
                      <input 
                        type="text" 
                        className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                        placeholder="Nombre descriptivo" 
                        value={formData.name || ''}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-primary">Estado <span className="text-error">*</span></label>
                      <select 
                        className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
                        value={formData.status}
                        onChange={(e) => setFormData({...formData, status: e.target.value as 'Activo' | 'Inactivo'})}
                      >
                        <option value="Activo">Activo</option>
                        <option value="Inactivo">Inactivo</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-primary">Unidad de Medida</label>
                      <select
                        className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
                        value={formData.unit || ''}
                        onChange={(e) => setFormData({...formData, unit: e.target.value})}
                      >
                        {!(ITEM_UNITS as readonly string[]).includes(formData.unit ?? '') && <option value="">Seleccionar...</option>}
                        {ITEM_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-primary">Costo Referencial (USD)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                        <input
                          type="number" min="0" step="0.01"
                          className="w-full h-10 bg-surface border border-border-soft rounded-lg pl-8 pr-3 text-sm focus:outline-none focus:border-primary-accent"
                          placeholder="0.00"
                          value={formData.cost || ''}
                          onChange={(e) => setFormData({...formData, cost: parseFloat(e.target.value) || 0})}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-primary">Precio de referencia (USD) {!selectedItem && <span className="text-error">*</span>}</label>
                      {selectedItem ? (
                        <>
                          <p className="h-10 flex items-center bg-surface-muted border border-border-soft rounded-lg px-3 text-sm font-medium">
                            {referencePrice !== undefined ? `$ ${referencePrice.toFixed(2)}` : <span className="text-warning-text">Sin precio de referencia</span>}
                          </p>
                          {can('log-catalogo:edit_price') && (
                            <button type="button" className="text-xs text-primary-accent hover:underline" onClick={() => setPriceItem(selectedItem)}>Configurar precios</button>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                            <input
                              type="number" min="0" step="0.01"
                              className="w-full h-10 bg-surface border border-border-soft rounded-lg pl-8 pr-3 text-sm focus:outline-none focus:border-primary-accent"
                              placeholder="0.00"
                              value={initialPrice}
                              onChange={(e) => setInitialPrice(e.target.value)}
                            />
                          </div>
                          {formData.type === 'Kit' && kitSuggestion !== undefined && (
                            <button type="button" className="text-xs text-primary-accent hover:underline text-left" onClick={() => setInitialPrice(kitSuggestion.toFixed(2))}>
                              Usar $ {kitSuggestion.toFixed(2)} (suma de los precios de sus artículos)
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-text-muted -mt-3">
                    El precio de referencia es el precio con el que se vende en Caja si hace falta (por ejemplo, si un alumno extravía el artículo). Las excepciones por sede y las nuevas vigencias se configuran después, en «Configurar precios».
                  </p>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-primary">Descripción</label>
                    <textarea 
                      className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-24" 
                      placeholder="Detalles del artículo..."
                      value={formData.description || ''}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                    ></textarea>
                  </div>
                </div>

                {/* Columna Derecha: Configuración y Especiales */}
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-text-primary border-b border-border-soft pb-2">Uso del artículo</h3>
                  
                  <div className="space-y-4">
                    {/* Encuadernado - solo para Libro (es solo información del libro) */}
                    {formData.type === 'Libro' && (
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-primary">Encuadernado <span className="text-error">*</span></label>
                        <select
                          className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
                          value={formData.bindingType || ''}
                          onChange={(e) => setFormData({...formData, bindingType: (e.target.value || undefined) as Item['bindingType']})}
                        >
                          <option value="">Seleccionar...</option>
                          <option value="Anillado">Anillado</option>
                          <option value="Encolado">Encolado</option>
                        </select>
                        <p className="text-xs text-text-muted">Solo es información del libro: no cambia cómo se entrega ni cómo se vende.</p>
                      </div>
                    )}

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-primary-accent border-border-soft rounded focus:ring-primary-accent"
                        checked={formData.type === 'Material educativo' ? true : !!formData.isDeliveredOnEnrollment}
                        disabled={formData.type === 'Material educativo'}
                        onChange={(e) => setFormData({...formData, isDeliveredOnEnrollment: e.target.checked})}
                      />
                      <span className="text-sm font-medium text-text-primary">¿Se entrega con la matrícula?</span>
                    </label>
                    <p className="text-xs text-text-muted pl-7 -mt-2">
                      {formData.type === 'Material educativo'
                        ? 'El material educativo siempre se entrega con la matrícula.'
                        : 'Si es «sí», se podrá elegir en las recetas de matrícula; la verificación lo entrega y descuenta su stock. No se entrega solo a todos los alumnos.'}
                    </p>

                    <div className="rounded-xl border border-border-soft bg-surface-muted/40 p-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Resumen</p>
                      <ul className="list-disc list-inside space-y-1 text-sm text-text-secondary">
                        {itemSummaryLines({ type: (formData.type ?? 'Material educativo') as ItemType, isDeliveredOnEnrollment: formData.type === 'Material educativo' ? true : !!formData.isDeliveredOnEnrollment }, summaryPrice)
                          .map((line, i) => <li key={i}>{line}</li>)}
                      </ul>
                    </div>
                  </div>

                  {/* Campos Especiales por Tipo */}
                  {formData.type === 'Material educativo' && (
                    <div className="mt-6 space-y-6">
                      <h3 className="text-lg font-medium text-text-primary border-b border-border-soft pb-2">Metadatos Pedagógicos</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-text-primary">Sesiones</label>
                          <input 
                            type="number" min="0"
                            className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                            value={formData.sessions || ''}
                            onChange={(e) => setFormData({...formData, sessions: parseInt(e.target.value) || 0})}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-text-primary">Modo de Entrenamientos</label>
                          <select 
                            className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
                            value={formData.trainingMode}
                            onChange={(e) => setFormData({...formData, trainingMode: e.target.value as 'General' | 'Variable'})}
                          >
                            <option value="General">General</option>
                            <option value="Variable">Variable</option>
                          </select>
                        </div>
                        {formData.trainingMode === 'General' && (
                          <>
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium text-text-primary">Gimnasias por sesión</label>
                              <input 
                                type="number" min="0"
                                className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                                value={formData.gymnasticsPerSession || ''}
                                onChange={(e) => setFormData({...formData, gymnasticsPerSession: parseInt(e.target.value) || 0})}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium text-text-primary">Entrenamientos por sesión</label>
                              <input 
                                type="number" min="0"
                                className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                                value={formData.trainingsPerSession || ''}
                                onChange={(e) => setFormData({...formData, trainingsPerSession: parseInt(e.target.value) || 0})}
                              />
                            </div>
                          </>
                        )}
                      </div>
                      {formData.trainingMode === 'Variable' && (
                        <div className="bg-surface-muted p-4 rounded-xl border border-border-soft">
                          <p className="text-sm text-text-secondary mb-3">Configuración de entrenamientos variables por sesión.</p>
                          <Button variant="ghost" className="text-xs py-1 h-auto" onClick={() => setShowSessionTable(v => !v)}>
                            {showSessionTable ? 'Ocultar tabla de sesiones' : 'Configurar tabla de sesiones'}
                          </Button>
                          {(formData.sessions ?? 0) > 0 && (formData.variableTrainings ?? []).length === formData.sessions && !showSessionTable && (
                            <span className="ml-2 text-xs text-success-text">Tabla configurada ({formData.sessions} sesiones)</span>
                          )}
                          {showSessionTable && (
                            (formData.sessions ?? 0) <= 0 ? (
                              <p className="text-xs text-warning-text mt-3">Indique primero cuántas sesiones tiene el material.</p>
                            ) : (
                              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {Array.from({ length: formData.sessions! }).map((_, i) => (
                                  <div key={i} className="space-y-1">
                                    <label className="text-xs font-medium text-text-secondary">Sesión {i + 1}</label>
                                    <input
                                      type="number" min="0"
                                      className="w-full h-9 bg-surface border border-border-soft rounded-lg px-2 text-sm focus:outline-none focus:border-primary-accent"
                                      value={formData.variableTrainings?.find(v => v.session === i + 1)?.trainings ?? ''}
                                      placeholder="0"
                                      onChange={e => {
                                        const n = Math.max(0, parseInt(e.target.value) || 0);
                                        const rows = Array.from({ length: formData.sessions! }).map((__, k) => ({
                                          session: k + 1,
                                          trainings: k === i ? n : (formData.variableTrainings?.find(v => v.session === k + 1)?.trainings ?? 0),
                                        }));
                                        setFormData({ ...formData, variableTrainings: rows });
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {formData.type === 'Kit' && (
                    <div className="mt-6 space-y-4">
                      <div className="border-b border-border-soft pb-2">
                        <h3 className="text-lg font-medium text-text-primary">Composición del kit</h3>
                        <p className="text-xs text-text-muted mt-1">
                          Obligatoria: son los artículos con los que se arma el kit. Armar un kit descuenta cada artículo de su stock suelto y suma una unidad al stock del kit. No puede haber kits dentro de un kit.
                        </p>
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1 space-y-1.5">
                          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Artículo</label>
                          <select
                            className="w-full h-9 bg-surface border border-border-soft rounded-lg px-2 text-sm focus:outline-none focus:border-primary-accent"
                            value={compItemId}
                            onChange={(e) => setCompItemId(e.target.value)}
                          >
                            <option value="">Seleccionar artículo...</option>
                            {items
                              .filter(i => i.id !== formData.id && i.status === 'Activo' && i.type !== 'Kit' && !(formData.composition ?? []).some(c => c.itemId === i.id))
                              .map(i => <option key={i.id} value={i.id}>{i.name} ({i.id})</option>)}
                          </select>
                        </div>
                        <div className="w-24 space-y-1.5">
                          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Cant.</label>
                          <input
                            type="number" min="1"
                            className="w-full h-9 bg-surface border border-border-soft rounded-lg px-2 text-sm focus:outline-none focus:border-primary-accent"
                            value={compQty}
                            onChange={(e) => setCompQty(parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-9 flex items-center gap-1"
                          onClick={() => {
                            const comp = items.find(i => i.id === compItemId);
                            if (!comp) return;
                            setFormData({
                              ...formData,
                              composition: [...(formData.composition ?? []), { itemId: comp.id, name: comp.name, quantity: compQty }]
                            });
                            setCompItemId('');
                            setCompQty(1);
                          }}
                        >
                          <Plus size={14} /> Agregar
                        </Button>
                      </div>
                      {formData.composition && formData.composition.length > 0 ? (
                        <div className="space-y-2">
                          {formData.composition.map((comp, idx) => (
                            <div key={comp.itemId} className="flex items-center justify-between bg-surface-muted p-2 rounded-lg border border-border-soft">
                              <div>
                                <p className="text-sm font-medium text-text-primary">{comp.name}</p>
                                <p className="text-xs text-text-secondary">{comp.itemId}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium">Cant: {comp.quantity}</span>
                                <button
                                  type="button"
                                  className="text-text-muted hover:text-danger-text transition-colors"
                                  onClick={() => setFormData({
                                    ...formData,
                                    composition: (formData.composition ?? []).filter((_, i) => i !== idx)
                                  })}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-text-secondary italic">Agregue los artículos con los que se arma este kit.</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="Detalle del Artículo"
        size="3xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsDetailOpen(false)}>Cerrar</Button>
            {can('log-catalogo:edit') && <Button variant="primary" onClick={() => { setIsDetailOpen(false); handleOpenForm(selectedItem!); }}>Editar Artículo</Button>}
          </div>
        }
      >
        {selectedItem && (
          <div className="space-y-6 pb-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl bg-primary-accent/10 text-primary-accent flex items-center justify-center shrink-0">
                {getTypeIcon(selectedItem.type)}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-text-primary">{selectedItem.name}</h3>
                <p className="text-sm text-text-secondary font-mono mt-1">{selectedItem.id}</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant={selectedItem.status === 'Activo' ? 'success' : 'neutral'}>{selectedItem.status}</Badge>
                  <Badge variant="primary">{selectedItem.type}</Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-surface-muted p-3 rounded-xl border border-border-soft">
                <p className="text-xs text-text-secondary mb-1">Unidad</p>
                <p className="text-sm font-medium text-text-primary">{selectedItem.unit || 'N/A'}</p>
              </div>
              <div className="bg-surface-muted p-3 rounded-xl border border-border-soft">
                <p className="text-xs text-text-secondary mb-1">Costo Ref.</p>
                <p className="text-sm font-medium text-text-primary">$ {selectedItem.cost.toFixed(2)}</p>
              </div>
              <div className="bg-surface-muted p-3 rounded-xl border border-border-soft">
                <p className="text-xs text-text-secondary mb-1">Precio de referencia</p>
                <p className="text-sm font-medium text-text-primary">{getCurrentPrice(itemPrices, selectedItem.id, 'all') ? '$ ' + getCurrentPrice(itemPrices, selectedItem.id, 'all')!.amount.toFixed(2) : <span className="text-warning-text">Sin precio de referencia</span>}</p>
              </div>
              <div className="bg-surface-muted p-3 rounded-xl border border-border-soft">
                <p className="text-xs text-text-secondary mb-1">Se entrega con la matrícula</p>
                <p className="text-sm font-medium text-text-primary">{selectedItem.isDeliveredOnEnrollment ? 'Sí' : 'No'}</p>
              </div>
            </div>

            {selectedItem.description && (
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-2">Descripción</h4>
                <p className="text-sm text-text-secondary bg-surface-muted p-3 rounded-xl border border-border-soft">
                  {selectedItem.description}
                </p>
              </div>
            )}

            {selectedItem.type === 'Material educativo' && (
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-2">Metadatos Pedagógicos</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-surface-muted p-3 rounded-xl border border-border-soft">
                    <p className="text-xs text-text-secondary mb-1">Sesiones</p>
                    <p className="text-sm font-medium text-text-primary">{selectedItem.sessions || 0}</p>
                  </div>
                  <div className="bg-surface-muted p-3 rounded-xl border border-border-soft">
                    <p className="text-xs text-text-secondary mb-1">Modo</p>
                    <p className="text-sm font-medium text-text-primary">{selectedItem.trainingMode}</p>
                  </div>
                  {selectedItem.trainingMode === 'General' && (
                    <>
                      <div className="bg-surface-muted p-3 rounded-xl border border-border-soft">
                        <p className="text-xs text-text-secondary mb-1">Gimnasias</p>
                        <p className="text-sm font-medium text-text-primary">{selectedItem.gymnasticsPerSession || 0}</p>
                      </div>
                      <div className="bg-surface-muted p-3 rounded-xl border border-border-soft">
                        <p className="text-xs text-text-secondary mb-1">Entrenamientos</p>
                        <p className="text-sm font-medium text-text-primary">{selectedItem.trainingsPerSession || 0}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {selectedItem.isPackage && selectedItem.composition && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-text-primary">Composición del kit</h4>
                  <span className="text-xs text-text-secondary">Se arma y se desarma en Stock (el desarme pide motivo)</span>
                </div>
                <div className="border border-border-soft rounded-xl overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                      <tr>
                        <th className="px-4 py-3 font-medium">SKU</th>
                        <th className="px-4 py-3 font-medium">Nombre</th>
                        <th className="px-4 py-3 font-medium text-right">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-soft">
                      {selectedItem.composition.map((comp, idx) => (
                        <tr key={idx} className="hover:bg-surface-muted/50">
                          <td className="px-4 py-3 font-mono text-text-secondary">{comp.itemId}</td>
                          <td className="px-4 py-3 font-medium text-text-primary">{comp.name}</td>
                          <td className="px-4 py-3 text-right">{comp.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ItemPricesModal item={priceItem} onClose={() => setPriceItem(null)} />

      <ConfirmDialog
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        description={confirmConfig.description}
        variant={confirmConfig.variant}
        confirmLabel={confirmConfig.confirmLabel}
        cancelLabel={confirmConfig.cancelLabel}
      />
    </div>
  );
}

