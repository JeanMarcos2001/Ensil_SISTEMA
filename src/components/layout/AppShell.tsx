import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Dashboard } from '../../pages/Dashboard';
import { Enrollments } from '../../pages/Enrollments';
import { Plans } from '../../pages/Plans';
import { Students } from '../../pages/Students';
import { Guardians } from '../../pages/Guardians';
import { Cash } from '../../pages/Cash';
import { Payments } from '../../pages/Payments';
import { Verification } from '../../pages/Verification';
import { PettyCash } from '../../pages/PettyCash';
import { Companies } from '../../pages/organization/Companies';
import { Branches } from '../../pages/organization/Branches';
import { Users } from '../../pages/organization/Users';
import { Roles } from '../../pages/organization/Roles';
import { Permissions } from '../../pages/organization/Permissions';
import { Programs } from '../../pages/commercial/Programs';
import { Levels } from '../../pages/commercial/Levels';
import { PaymentTypes } from '../../pages/commercial/PaymentTypes';
import { Tariffs } from '../../pages/commercial/Tariffs';
import { Promotions } from '../../pages/commercial/Promotions';
import { ItemCatalog } from '../../pages/logistics/ItemCatalog';
import { Recipes } from '../../pages/commercial/Recipes';
import { Stock } from '../../pages/logistics/Stock';
import { Shipments } from '../../pages/logistics/Shipments';
import { Transfers } from '../../pages/logistics/Transfers';
import { Receptions } from '../../pages/logistics/Receptions';
import { Kardex } from '../../pages/logistics/Kardex';
import { Adjustments } from '../../pages/logistics/Adjustments';
import { Messaging } from '../../pages/Messaging';
import { Schedule } from '../../pages/psychopedagogy/Schedule';
import { StudentHistory } from '../../pages/psychopedagogy/StudentHistory';
import { PendingRequests } from '../../pages/system/PendingRequests';
import { Closures, Reopenings } from '../../pages/system/Closures';
import { PortfolioReport } from '../../pages/reports/PortfolioReport';
import { MonthlySchedules } from '../../pages/psychopedagogy/MonthlySchedules';
import { Reminders } from '../../pages/psychopedagogy/Reminders';
import { PsychopedagogyReport } from '../../pages/reports/PsychopedagogyReport';
import { StaffPage } from '../../pages/Staff';
import { ContractsPage } from '../../pages/Contracts';
import { AssignmentsPage } from '../../pages/Assignments';
import { SettingsPage } from '../../pages/settings/SettingsPage';
import { slugify, unslugify } from '../../utils/string';
import { getAllItemsForModule } from '../../config/modules';
import { Drawer } from '../ui/Drawer';
import { Modal } from '../ui/Modal';
import { NewEnrollmentWizard } from '../../pages/NewEnrollmentWizard';
import { useData } from '../../context/DataContext';

export function AppShell() {
  const { isEnrollmentWizardOpen, setIsEnrollmentWizardOpen } = useData();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const pathParts = location.pathname.split('/').filter(Boolean);
  const activeModule = pathParts[0] || 'dashboard';
  const activeItemSlug = pathParts[1] || '';
  
  const moduleItems = getAllItemsForModule(activeModule);
  let activeItem = unslugify(activeItemSlug, moduleItems) || moduleItems[0] || 'Resumen general';

  useEffect(() => {
    if (location.pathname === '/') {
      navigate('/dashboard/resumen-general', { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleItemSelect = (item: string, moduleId: string) => {
    navigate(`/${moduleId}/${slugify(item)}`);
  };

  const handleNavigate = (item: string, state?: any) => {
    navigate(`/${activeModule}/${slugify(item)}`, { state });
  };

  const renderContent = () => {
    if (activeModule === 'dashboard') return <Dashboard />;
    if (activeModule === 'mensajeria') return <Messaging />;
    
    // Operation Module
    if (activeItem === 'Matrículas') return <Enrollments />;
    if (activeItem === 'Planes y cartera') return <Plans />;
    if (activeItem === 'Pagos') return <Payments />;
    if (activeItem === 'Verificación') return <Verification />;
    if (activeItem === 'Caja') return <Cash />;
    if (activeItem === 'Caja chica') return <PettyCash />;
    
    // People Module
    if (activeItem === 'Alumnos') return <Students />;
    if (activeItem === 'Titulares') return <Guardians />;
    if (activeItem === 'Personal') return <StaffPage />;
    if (activeItem === 'Contratos') return <ContractsPage />;
    if (activeItem === 'Asignaciones') return <AssignmentsPage />;
    
    // Organization Module
    if (activeItem === 'Empresas') return <Companies onNavigate={handleNavigate} />;
    if (activeItem === 'Filiales') return <Branches />;
    if (activeItem === 'Usuarios') return <Users />;
    if (activeItem === 'Roles') return <Roles onNavigate={handleNavigate} />;
    if (activeItem === 'Permisos') return <Permissions />;
    
    // Commercial Module
    if (activeItem === 'Programas') return <Programs />;
    if (activeItem === 'Niveles') return <Levels />;
    if (activeItem === 'Tipos de pago') return <PaymentTypes />;
    if (activeItem === 'Tarifarios') return <Tariffs />;
    if (activeItem === 'Promociones') return <Promotions />;
    if (activeItem === 'Recetas de materiales') return <Recipes />;
    
    // Logistics Module
    if (activeItem === 'Catálogo de artículos') return <ItemCatalog />;
    if (activeItem === 'Stock') return <Stock />;
    if (activeItem === 'Envíos') return <Shipments />;
    if (activeItem === 'Transferencias') return <Transfers />;
    if (activeItem === 'Recepciones') return <Receptions />;
    if (activeItem === 'Kardex') return <Kardex />;
    if (activeItem === 'Ajustes y mermas') return <Adjustments />;
    
    // System Module
    if (activeItem === 'Solicitudes pendientes') return <PendingRequests />;
    if (activeItem === 'Cierres') return <Closures />;
    if (activeModule === 'reportes' && activeItem === 'Cartera') return <PortfolioReport />;
    if (activeModule === 'reportes' && activeItem === 'Psicopedagogía') return <PsychopedagogyReport />;
    if (activeItem === 'Reaperturas') return <Reopenings />;

    // Psychopedagogy Module
    if (activeItem === 'Programación') return <Schedule />;
    if (activeItem === 'Historial del alumno') return <StudentHistory />;
    if (activeItem === 'Cronogramas mensuales') return <MonthlySchedules />;
    if (activeItem === 'Recordatorios') return <Reminders />;
    
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        <p>Vista en construcción: {activeItem}</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen w-full bg-surface overflow-hidden font-sans">
      <Topbar 
        title={activeItem} 
        breadcrumb={['ENSIL', activeModule.charAt(0).toUpperCase() + activeModule.slice(1), activeItem]} 
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      <div className="flex flex-1 overflow-hidden bg-surface relative">
        <Sidebar 
          isOpen={isSidebarOpen}
          activeModule={activeModule}
          activeItem={activeItem}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onItemSelect={handleItemSelect}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ease-in-out bg-app-bg rounded-tl-3xl rounded-bl-3xl shadow-[-8px_0_24px_rgba(0,0,0,0.02)]">
          <main className="flex-1 overflow-y-auto p-6 md:p-8 h-full">
            <div className="w-full mx-auto h-full">
              <Routes>
                <Route path="/*" element={renderContent()} />
              </Routes>
            </div>
          </main>
        </div>
      </div>

      {/* Global Enrollment Wizard */}
      <Modal 
        isOpen={isEnrollmentWizardOpen} 
        onClose={() => setIsEnrollmentWizardOpen(false)} 
        title="Registrar nueva matrícula"
        size="7xl"
      >
        <NewEnrollmentWizard onClose={() => setIsEnrollmentWizardOpen(false)} />
      </Modal>

      {/* Settings Modal */}
      <Modal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Configuración del Sistema"
        size="6xl"
        noPadding
      >
        <div className="h-[70vh] flex flex-col">
          <SettingsPage />
        </div>
      </Modal>
    </div>
  );
}

