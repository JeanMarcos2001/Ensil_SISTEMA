import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Shipping } from '../logistics/Shipping';
import { LeadsConfig } from './LeadsConfig';
import { ClassSchedulesConfig } from './ClassSchedulesConfig';
import { DocumentTemplatesConfig } from './DocumentTemplatesConfig';
import { CollectionsConfig } from './CollectionsConfig';
import { PsyRemindersConfig } from './PsyRemindersConfig';

/**
 * Configuración (botón inferior del menú): parámetros del sistema que se fijan una vez y casi no se tocan, agrupados por área.
 * Los catálogos de venta (programas, tarifas, promociones, recetas…) viven en el menú «Oferta comercial».
 */
interface Section {
  id: string;
  label: string;
  render: () => React.ReactNode;
}
interface Group {
  id: string;
  title: string;
  sections: Section[];
}

export const SETTINGS_GROUPS: Group[] = [
  { id: 'comercial', title: 'Comercial', sections: [
    { id: 'leads', label: 'Orígenes de leads', render: () => <LeadsConfig /> },
    { id: 'schedules', label: 'Horarios de clases', render: () => <ClassSchedulesConfig /> },
  ] },
  { id: 'documentos', title: 'Documentos', sections: [
    { id: 'templates', label: 'Plantillas de contrato y ficha', render: () => <DocumentTemplatesConfig /> },
  ] },
  { id: 'cobranza', title: 'Cobranza', sections: [
    { id: 'collections', label: 'Política de cobranza', render: () => <CollectionsConfig /> },
  ] },
  { id: 'psicopedagogia', title: 'Psicopedagogía', sections: [
    { id: 'psyreminders', label: 'Recordatorios', render: () => <PsyRemindersConfig /> },
  ] },
  { id: 'logistica', title: 'Logística', sections: [
    { id: 'shipping', label: 'Couriers y métodos de envío', render: () => <Shipping /> },
  ] },
];

const STORAGE_KEY = 'ensil.settings.section';
const FIRST = SETTINGS_GROUPS[0].sections[0].id;
const groupOf = (sectionId: string) => SETTINGS_GROUPS.find(g => g.sections.some(s => s.id === sectionId));

/** Última sección usada (el almacenamiento puede no estar disponible: entonces empieza por la primera). */
function lastSection(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && groupOf(saved)) return saved;
  } catch { /* sin almacenamiento */ }
  return FIRST;
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState(lastSection);
  // Se abre el grupo de la última sección usada; los demás se despliegan a mano
  const [open, setOpen] = useState<string[]>(() => [groupOf(lastSection())?.id ?? SETTINGS_GROUPS[0].id]);

  const select = (sectionId: string) => {
    setActiveTab(sectionId);
    try { localStorage.setItem(STORAGE_KEY, sectionId); } catch { /* sin almacenamiento */ }
  };
  const toggle = (groupId: string) => setOpen(prev => (prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId]));
  const active = SETTINGS_GROUPS.flatMap(g => g.sections).find(s => s.id === activeTab);

  return (
    <div className="flex h-full w-full bg-surface overflow-hidden">
      <div className="w-64 border-r border-border-soft flex flex-col bg-surface-muted/30 shrink-0">
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-[11px] text-text-muted px-2 pb-3 leading-snug">
            Parámetros del sistema. Los programas, tarifas, promociones y recetas están en el menú <span className="font-medium text-text-secondary">Oferta comercial</span>.
          </p>
          <div className="flex flex-col gap-1">
            {SETTINGS_GROUPS.map(group => {
              const isOpen = open.includes(group.id);
              const hasActive = group.sections.some(s => s.id === activeTab);
              return (
                <div key={group.id}>
                  <button
                    type="button"
                    onClick={() => toggle(group.id)}
                    aria-expanded={isOpen}
                    className={`flex items-center justify-between w-full p-2 text-sm font-medium rounded-lg transition-colors hover:bg-surface-muted ${hasActive ? 'text-primary-accent' : 'text-text-primary'}`}
                  >
                    <span>{group.title}</span>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {isOpen && (
                    <div className="mt-1 mb-1 flex flex-col gap-1 pl-2">
                      {group.sections.map(section => (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => select(section.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === section.id ? 'bg-active-tint text-primary-accent font-medium' : 'text-text-secondary hover:bg-surface-muted'}`}
                        >
                          {section.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-surface">
        {active?.render()}
      </div>
    </div>
  );
}
