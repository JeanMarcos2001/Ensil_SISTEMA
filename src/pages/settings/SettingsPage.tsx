import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Shipping } from '../logistics/Shipping';
import { LeadsConfig } from './LeadsConfig';
import { ClassSchedulesConfig } from './ClassSchedulesConfig';

export function SettingsPage() {
  const [isCrudsOpen, setIsCrudsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('leads');

  return (
    <div className="flex h-full w-full bg-surface overflow-hidden">
      {/* Static Sidebar */}
      <div className="w-64 border-r border-border-soft flex flex-col bg-surface-muted/30 shrink-0">
        <div className="flex-1 overflow-y-auto p-3">
          {/* CRUDS Básicos Accordion */}
          <div>
            <button 
              onClick={() => setIsCrudsOpen(!isCrudsOpen)}
              className="flex items-center justify-between w-full p-2 text-sm font-medium text-text-primary hover:bg-surface-muted rounded-lg transition-colors"
            >
              <span>CRUDS Básicos</span>
              {isCrudsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            
            {isCrudsOpen && (
              <div className="mt-2 flex flex-col gap-1 pl-2">
                <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-2 py-1">Comercial</div>
                <button 
                  onClick={() => setActiveTab('leads')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'leads' ? 'bg-active-tint text-primary-accent font-medium' : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'}`}
                >
                  Orígenes de Leads
                </button>
                
                <button 
                  onClick={() => setActiveTab('schedules')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'schedules' ? 'bg-active-tint text-primary-accent font-medium' : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'}`}
                >
                  Horarios de clases
                </button>
                
                <div className="h-px bg-border-soft my-1 mx-2"></div>
                
                <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-2 py-1">Logística</div>
                <button 
                  onClick={() => setActiveTab('shipping')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'shipping' ? 'bg-active-tint text-primary-accent font-medium' : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'}`}
                >
                  Couriers y métodos de envío
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
        {activeTab === 'leads' && <LeadsConfig />}
        {activeTab === 'schedules' && <ClassSchedulesConfig />}
        {activeTab === 'shipping' && <Shipping />}
      </div>
    </div>
  );
}
