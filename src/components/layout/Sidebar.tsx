import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, ChevronDown, Home, Briefcase, Package, Brain, Users, Settings2, Building2, FileBarChart, ShieldCheck, HelpCircle, LogOut, Plus, X, Mail } from 'lucide-react';
import { MODULE_DATA, getAllItemsForModule } from '../../config/modules';
import { useData } from '../../context/DataContext';

const NAV_ITEMS = [
  { id: 'dashboard', icon: Home, label: 'Dashboard' },
  { id: 'mensajeria', icon: Mail, label: 'Mensajería', isDirect: true },
  { id: 'operacion', icon: Briefcase, label: 'Operación' },
  { id: 'logistica', icon: Package, label: 'Logística' },
  { id: 'psicopedagogia', icon: Brain, label: 'Psicopedagogía' },
  { id: 'personas', icon: Users, label: 'Personas' },
  { id: 'configuracion', icon: Settings2, label: 'Configuración' },
  { id: 'organizacion', icon: Building2, label: 'Organización' },
  { id: 'reportes', icon: FileBarChart, label: 'Reportes' },
  { id: 'sistema', icon: ShieldCheck, label: 'Sistema' },
];

interface SidebarProps {
  isOpen: boolean;
  activeModule: string;
  activeItem: string;
  onOpenSidebar: () => void;
  onItemSelect: (item: string, moduleId: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({ isOpen, activeModule, activeItem, onOpenSidebar, onItemSelect, onOpenSettings }: SidebarProps) {
  const navigate = useNavigate();
  const { setIsEnrollmentWizardOpen, currentUser, currentBranchId } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState<string[]>([activeModule]);

  const canShowItem = (moduleId: string, itemName: string) => {
    const isGlobal = currentBranchId === 'all';
    const role = currentUser.role;
    
    if (moduleId === 'logistica') {
      // Envíos: Only for global view or superuser/logistics
      if (itemName === 'Envíos') {
        return isGlobal || role === 'Superusuario' || role === 'Logística nacional';
      }
      // Recepciones: Only for specific branch, but superuser can see it (blocked in global)
      if (itemName === 'Recepciones') {
        if (role === 'Logística nacional') return false;
        return true;
      }
      // Transferencias: Only when a branch is selected or superuser
      if (itemName === 'Transferencias') {
        return !isGlobal || role === 'Superusuario';
      }
    }
    
    return true;
  };

  // Sync expanded sections with active module when it changes from outside
  React.useEffect(() => {
    setExpandedSections([activeModule]);
  }, [activeModule]);

  const handleSectionClick = (moduleId: string, isDirect?: boolean) => {
    if (!isOpen) {
      onOpenSidebar();
    }
    
    if (isDirect) {
      onItemSelect('', moduleId);
      return;
    }
    
    setExpandedSections(prev => {
      if (prev.includes(moduleId)) {
        // Collapse it
        return prev.filter(id => id !== moduleId);
      } else {
        // Expand it
        const next = [...prev, moduleId];
        if (next.length > 2) {
          // Keep activeModule and the newly clicked one
          if (next.includes(activeModule)) {
            return [activeModule, moduleId];
          }
          return next.slice(-2);
        }
        return next;
      }
    });
  };

  // Filter items based on search
  const filteredNavItems = useMemo(() => {
    if (!searchTerm) return NAV_ITEMS;
    
    const lowerSearch = searchTerm.toLowerCase();
    return NAV_ITEMS.filter(navItem => {
      // Check if module name matches
      if (navItem.label.toLowerCase().includes(lowerSearch)) return true;
      
      // Check if any item in the module matches
      const moduleItems = getAllItemsForModule(navItem.id);
      return moduleItems.some(item => item.toLowerCase().includes(lowerSearch));
    });
  }, [searchTerm]);

  return (
    <div 
      className={`bg-surface flex flex-col z-20 shrink-0 transition-all duration-300 ease-in-out ${
        isOpen ? 'w-[260px]' : 'w-[72px]'
      }`}
    >
      {/* Search Bar */}
      <div className="px-3 pt-2 pb-2">
        <div 
          className={`relative flex items-center w-full p-2 rounded-xl transition-all duration-300 ${isOpen ? 'bg-surface-muted border border-border-soft' : 'bg-transparent border-transparent hover:bg-surface-muted cursor-pointer'}`} 
          onClick={!isOpen ? onOpenSidebar : undefined}
        >
          <div className="flex items-center justify-center w-8 h-8 shrink-0">
            {isOpen && searchTerm ? (
              <button onClick={(e) => { e.stopPropagation(); setSearchTerm(''); }} className="text-text-muted hover:text-text-primary w-full h-full flex items-center justify-center">
                <X size={16} />
              </button>
            ) : (
              <Search size={isOpen ? 16 : 20} className="text-text-muted" />
            )}
          </div>
          <input 
            type="text" 
            placeholder="Buscar sección..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none transition-all duration-300 ${isOpen ? 'w-full px-2 opacity-100' : 'w-0 opacity-0 px-0 cursor-pointer'}`}
            readOnly={!isOpen}
          />
        </div>
      </div>

      {/* Navigation Menu */}
      <div className="flex-1 overflow-y-auto pt-1 pb-4 px-3 flex flex-col gap-0 custom-scrollbar">
        {filteredNavItems.map((navItem) => {
          const isExpanded = expandedSections.includes(navItem.id);
          const isActiveModule = activeModule === navItem.id;
          const Icon = navItem.icon;
          const moduleInfo = MODULE_DATA[navItem.id];
          
          return (
            <div key={navItem.id} className="flex flex-col">
              <button
                onClick={() => handleSectionClick(navItem.id, navItem.isDirect)}
                className={`flex items-center w-full p-2 rounded-xl transition-colors relative overflow-hidden ${
                  isActiveModule && !isOpen
                    ? 'bg-active-tint text-primary-accent'
                    : isActiveModule && isOpen
                    ? 'text-primary-accent font-medium'
                    : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                }`}
                title={!isOpen ? navItem.label : undefined}
              >
                <div className="flex items-center justify-center w-8 h-8 shrink-0">
                  <Icon size={20} className={isActiveModule ? 'text-primary-accent' : 'text-text-muted'} />
                </div>
                <div className={`flex items-center justify-between flex-1 transition-all duration-300 whitespace-nowrap ${isOpen ? 'opacity-100 ml-2' : 'opacity-0 w-0 ml-0'}`}>
                  <span className="text-sm">{navItem.label}</span>
                  {!navItem.isDirect && (
                    <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-90 text-primary-accent' : 'text-text-muted'}`}>
                      <ChevronRight size={16} />
                    </div>
                  )}
                </div>
              </button>

              {/* Collapsible Submenu */}
              {!navItem.isDirect && (
                <div 
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isExpanded && isOpen ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0'
                  }`}
                >
                <div className="pl-12 pr-2 pb-2 flex flex-col gap-0.5 relative">
                  {/* Vertical line indicator */}
                  <div className="absolute left-[24px] top-0 bottom-4 w-px bg-border-soft"></div>
                  
                  {moduleInfo?.groups.map((group, idx) => (
                    <div key={idx} className="mb-2 last:mb-0">
                      {group.title && (
                        <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 mt-2">
                          {group.title}
                        </div>
                      )}
                      {group.items.map((item) => {
                        if (!canShowItem(navItem.id, item)) return null;
                        
                        const isItemActive = activeItem === item;
                        // Filter items if searching
                        if (searchTerm && !item.toLowerCase().includes(searchTerm.toLowerCase()) && !navItem.label.toLowerCase().includes(searchTerm.toLowerCase())) {
                          return null;
                        }
                        return (
                          <button
                            key={item}
                            onClick={() => onItemSelect(item, navItem.id)}
                            className={`w-full text-left py-1.5 px-3 rounded-lg text-sm transition-colors relative flex items-center justify-between ${
                              isItemActive 
                                ? 'bg-active-tint text-primary-accent font-medium' 
                                : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                            }`}
                          >
                            <span className="truncate block">{item}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  
                  {/* Nueva Matrícula Shortcut */}
                  {navItem.id === 'operacion' && (
                    <div className="mt-2 pr-2">
                      <div className="bg-active-tint rounded-xl p-3 border border-primary-accent/10">
                        <h4 className="text-xs font-semibold text-primary-accent mb-1">Nueva matrícula</h4>
                        <button 
                          onClick={() => setIsEnrollmentWizardOpen(true)}
                          className="w-full h-7 bg-primary-accent text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-primary-accent/90 transition-colors"
                        >
                          <Plus size={14} />
                          Comenzar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Actions */}
      <div className="mt-auto p-3 border-t border-border-soft flex flex-col gap-1">
        <button 
          onClick={onOpenSettings}
          className={`flex items-center w-full p-2 rounded-xl text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors relative overflow-hidden`}
          title={!isOpen ? "Configuración" : undefined}
        >
          <div className="flex items-center justify-center w-8 h-8 shrink-0">
            <Settings2 size={20} className="text-text-muted" />
          </div>
          <div className={`flex items-center flex-1 transition-all duration-300 whitespace-nowrap ${isOpen ? 'opacity-100 ml-2' : 'opacity-0 w-0 ml-0'}`}>
            <span className="text-sm font-medium">Configuración</span>
          </div>
        </button>
        <button 
          className={`flex items-center w-full p-2 rounded-xl text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors relative overflow-hidden`}
          title={!isOpen ? "Ayuda" : undefined}
        >
          <div className="flex items-center justify-center w-8 h-8 shrink-0">
            <HelpCircle size={20} className="text-text-muted" />
          </div>
          <div className={`flex items-center flex-1 transition-all duration-300 whitespace-nowrap ${isOpen ? 'opacity-100 ml-2' : 'opacity-0 w-0 ml-0'}`}>
            <span className="text-sm font-medium">Ayuda</span>
          </div>
        </button>
        <button 
          className={`flex items-center w-full p-2 rounded-xl text-danger-text hover:bg-danger-tint transition-colors relative overflow-hidden`}
          title={!isOpen ? "Cerrar sesión" : undefined}
        >
          <div className="flex items-center justify-center w-8 h-8 shrink-0">
            <LogOut size={20} />
          </div>
          <div className={`flex items-center flex-1 transition-all duration-300 whitespace-nowrap ${isOpen ? 'opacity-100 ml-2' : 'opacity-0 w-0 ml-0'}`}>
            <span className="text-sm font-medium">Cerrar sesión</span>
          </div>
        </button>
      </div>
    </div>
  );
}
