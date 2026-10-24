import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Search, Save, Shield, CheckSquare, Square, ChevronDown, ChevronRight } from 'lucide-react';
import { useData } from '../../context/DataContext';

type Action = { id: string; label: string };
type Functionality = { id: string; name: string; actions: Action[] };
type Module = { id: string; name: string; functionalities: Functionality[] };

const MODULES: Module[] = [
  {
    id: 'mod-org',
    name: 'Organización',
    functionalities: [
      {
        id: 'org-usuarios',
        name: 'Usuarios',
        actions: [
          { id: 'view', label: 'Ver usuarios' },
          { id: 'create', label: 'Crear usuario' },
          { id: 'edit', label: 'Editar usuario' },
          { id: 'deactivate', label: 'Desactivar usuario' },
          { id: 'reset_access', label: 'Resetear acceso' },
          { id: 'assign_role', label: 'Asignar rol' },
          { id: 'assign_branch', label: 'Asignar sedes' },
        ]
      },
      {
        id: 'org-roles',
        name: 'Roles y Permisos',
        actions: [
          { id: 'view', label: 'Ver roles' },
          { id: 'create', label: 'Crear rol' },
          { id: 'edit', label: 'Editar rol' },
          { id: 'config_perms', label: 'Configurar permisos' },
        ]
      }
    ]
  },
  {
    id: 'mod-operacion',
    name: 'Operación',
    functionalities: [
      {
        id: 'op-matriculas',
        name: 'Matrículas',
        actions: [
          { id: 'view', label: 'Ver matrículas' },
          { id: 'create', label: 'Crear matrícula' },
          { id: 'edit_draft', label: 'Editar borrador' },
          { id: 'confirm', label: 'Confirmar matrícula' },
          { id: 'req_drop', label: 'Solicitar caída' },
          { id: 'approve_drop', label: 'Aprobar caída' },
          { id: 'req_reactivation', label: 'Solicitar reactivación' },
          { id: 'approve_reactivation', label: 'Aprobar reactivación' },
          { id: 'req_program_change', label: 'Solicitar cambio de programa o nivel' },
          { id: 'approve_program_change', label: 'Aprobar cambio de programa o nivel' },
          { id: 'req_transfer', label: 'Solicitar traslado de sede' },
          { id: 'approve_transfer', label: 'Aprobar traslado de sede' },
          { id: 'renew', label: 'Renovar matrícula' },
          { id: 'edit_data', label: 'Corregir datos administrativos' },
          { id: 'documents', label: 'Generar contrato y ficha' },
        ]
      },
      {
        id: 'op-pagos',
        name: 'Pagos',
        actions: [
          { id: 'view', label: 'Ver pagos' },
          { id: 'reverse_payment', label: 'Reversar pago' },
          { id: 'credit_note', label: 'Emitir nota de crédito' },
        ]
      },
      {
        id: 'op-caja',
        name: 'Caja',
        actions: [
          { id: 'view', label: 'Ver caja' },
          { id: 'reg_income', label: 'Registrar ingreso' },
          { id: 'reg_expense', label: 'Registrar egreso' },
          { id: 'reverse_movement', label: 'Reversar movimiento' },
          { id: 'deposit', label: 'Crear lote de depósito' },
          { id: 'close_box', label: 'Cerrar caja' },
          { id: 'reopen_box', label: 'Reabrir caja' },
        ]
      },
      {
        id: 'op-caja-chica',
        name: 'Caja chica',
        actions: [
          { id: 'view', label: 'Ver caja chica' },
          { id: 'reverse_movement', label: 'Reversar movimiento' },
          { id: 'count', label: 'Hacer arqueo y cierre' },
          { id: 'config', label: 'Configurar fondo y tope por gasto' },
        ]
      },
      {
        id: 'op-cobranza',
        name: 'Cobranza y cartera',
        actions: [
          { id: 'view', label: 'Ver cartera y reportes' },
          { id: 'remind', label: 'Enviar recordatorios' },
          { id: 'charge_mora', label: 'Cobrar mora' },
          { id: 'config', label: 'Configurar políticas de cobranza' },
        ]
      }
    ]
  },
  {
    id: 'mod-logistica',
    name: 'Logística',
    functionalities: [
      {
        id: 'log-transfer',
        name: 'Transferencias',
        actions: [
          { id: 'req_transfer', label: 'Solicitar transferencia' },
          { id: 'approve_transfer', label: 'Aprobar transferencia' },
          { id: 'dispatch', label: 'Despachar transferencia' },
          { id: 'receive', label: 'Recepcionar transferencia' },
        ]
      }
    ]
  },
  {
    id: 'mod-psico',
    name: 'Psicopedagogía',
    functionalities: [
      {
        id: 'psi-prog',
        name: 'Programación',
        actions: [
          { id: 'view', label: 'Ver programación' },
          { id: 'create', label: 'Crear programación' },
          { id: 'reg_tracking', label: 'Registrar seguimiento' },
          { id: 'export_schedule', label: 'Exportar cronograma mensual' },
          { id: 'activity_lead', label: 'Asignar el responsable de una actividad especial' },
          { id: 'activity_attendance', label: 'Registrar asistencia a actividades especiales' },
          { id: 'institutional_change', label: 'Cancelar o reprogramar con menos de 24 h (cambio de la institución)' },
        ]
      },
      {
        id: 'psi-recordatorios',
        name: 'Recordatorios de Psicopedagogía',
        actions: [
          { id: 'view', label: 'Ver recordatorios' },
          { id: 'remind', label: 'Enviar y registrar recordatorios' },
          { id: 'config', label: 'Configurar los días de recordatorio' },
        ]
      }
    ]
  },
  {
    id: 'mod-reportes',
    name: 'Reportes',
    functionalities: [
      {
        id: 'rep-general',
        name: 'Reportes Generales',
        actions: [
          { id: 'view', label: 'Ver reportes' },
          { id: 'export', label: 'Exportar reportes' },
          { id: 'save_views', label: 'Guardar vistas' },
        ]
      }
    ]
  }
];

export function Permissions() {
  const location = useLocation();
  const { roles, permissions: allPermissions, savePermissions } = useData();
  const [selectedRole, setSelectedRole] = useState<string>(location.state?.selectedRoleId || roles[0]?.id || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    'mod-org': true,
    'mod-operacion': true,
  });

  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (selectedRole) {
      const rolePerms = allPermissions.find(p => p.roleId === selectedRole);
      setPermissions(new Set(rolePerms?.permissions || []));
    }
  }, [selectedRole, allPermissions]);

  const toggleModule = (id: string) => {
    setExpandedModules(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const togglePermission = (funcId: string, actionId: string) => {
    setPermissions(prev => {
      const newSet = new Set(prev);
      const key = `${funcId}:${actionId}`;
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const toggleAllInFunctionality = (func: Functionality) => {
    setPermissions(prev => {
      const newSet = new Set(prev);
      const allChecked = func.actions.every(a => newSet.has(`${func.id}:${a.id}`));
      
      func.actions.forEach(a => {
        const key = `${func.id}:${a.id}`;
        if (allChecked) {
          newSet.delete(key);
        } else {
          newSet.add(key);
        }
      });
      return newSet;
    });
  };

  const getModuleStats = (module: Module) => {
    let total = 0;
    let active = 0;
    module.functionalities.forEach(f => {
      f.actions.forEach(a => {
        total++;
        if (permissions.has(`${f.id}:${a.id}`)) active++;
      });
    });
    return { total, active };
  };

  const currentRole = roles.find(r => r.id === selectedRole);

  const filteredRoles = roles.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()));

  // ¿Hay cambios sin guardar? (se compara con lo guardado para el rol elegido)
  const savedSet = new Set(allPermissions.find(p => p.roleId === selectedRole)?.permissions || []);
  const dirty = !!selectedRole && (savedSet.size !== permissions.size || [...permissions].some(k => !savedSet.has(k)));

  const handleSave = () => {
    if (selectedRole) {
      savePermissions(selectedRole, Array.from(permissions));
    }
  };

  const handleDiscard = () => {
    if (selectedRole) {
      const rolePerms = allPermissions.find(p => p.roleId === selectedRole);
      setPermissions(new Set(rolePerms?.permissions || []));
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Permisos</h2>
          <p className="text-sm text-text-secondary">Configuración detallada de accesos por rol</p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-warning-text">Hay cambios sin guardar</span>}
          <Button variant="secondary" className="flex items-center gap-2" onClick={handleDiscard} disabled={!dirty}>
            Descartar Cambios
          </Button>
          <Button variant="primary" className="flex items-center gap-2" onClick={handleSave} disabled={!dirty}>
            <Save size={16} />
            Guardar Configuración
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        {/* Roles List */}
        <Card className="lg:col-span-1 flex flex-col p-4 h-full">
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">Seleccionar Rol</h3>
          
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input 
              type="text" 
              placeholder="Buscar rol..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
            />
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-2">
            {filteredRoles.map((role) => (
              <button
                key={role.id}
                onClick={() => setSelectedRole(role.id)}
                className={`w-full flex flex-col items-start p-3 rounded-xl border transition-all text-left ${
                  selectedRole === role.id 
                    ? 'bg-active-tint border-primary-accent shadow-sm' 
                    : 'bg-surface border-border-soft hover:border-primary-accent/30 hover:bg-surface-muted'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="flex items-center gap-2">
                    <Shield size={14} className={selectedRole === role.id ? 'text-primary-accent' : 'text-text-muted'} />
                    <span className={`text-sm font-medium ${selectedRole === role.id ? 'text-primary-accent' : 'text-text-primary'}`}>
                      {role.name}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-text-secondary ml-6">{role.users} usuarios asignados</span>
              </button>
            ))}
          </div>
        </Card>

        {/* Permissions Matrix */}
        <Card className="lg:col-span-3 flex flex-col p-0 h-full overflow-hidden">
          <div className="p-4 border-b border-border-soft bg-surface-muted/30 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-text-primary">Matriz de Permisos: {currentRole?.name}</h3>
              <p className="text-sm text-text-secondary">Configura las acciones específicas permitidas para este rol.</p>
            </div>
            <div className="flex gap-2">
              <Badge variant={currentRole?.status === 'Activo' ? 'success' : 'neutral'}>{currentRole?.status}</Badge>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              
              {MODULES.map(module => {
                const stats = getModuleStats(module);
                const isExpanded = expandedModules[module.id];
                
                return (
                  <div key={module.id} className="border border-border-soft rounded-xl overflow-hidden">
                    <button 
                      onClick={() => toggleModule(module.id)}
                      className="w-full flex items-center justify-between p-4 bg-surface-muted hover:bg-surface-muted/80 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown size={18} className="text-text-muted" /> : <ChevronRight size={18} className="text-text-muted" />}
                        <span className="font-semibold text-text-primary">{module.name}</span>
                      </div>
                      <div className="flex gap-4 text-sm">
                        <span className="text-text-secondary">{stats.active}/{stats.total} permisos</span>
                      </div>
                    </button>
                    
                    {isExpanded && (
                      <div className="p-4 bg-surface border-t border-border-soft">
                        <table className="w-full text-sm text-left">
                          <tbody className="divide-y divide-border-soft">
                            {module.functionalities.map(func => (
                              <tr key={func.id}>
                                <td className="py-4 pr-4 align-top w-1/4">
                                  <span className="font-medium text-text-primary block">{func.name}</span>
                                  <button 
                                    onClick={() => toggleAllInFunctionality(func)}
                                    className="text-[10px] text-primary-accent hover:underline mt-1"
                                  >
                                    Seleccionar todo
                                  </button>
                                </td>
                                <td className="py-4">
                                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                                    {func.actions.map(action => {
                                      const isChecked = permissions.has(`${func.id}:${action.id}`);
                                      const Icon = isChecked ? CheckSquare : Square;
                                      const colorClass = isChecked ? 'text-primary-accent' : 'text-border-strong';
                                      return (
                                        <div 
                                          key={action.id} 
                                          className="flex items-center gap-2 cursor-pointer group" 
                                          onClick={() => togglePermission(func.id, action.id)}
                                        >
                                          <Icon size={16} className={`${colorClass} group-hover:opacity-80 transition-opacity`} />
                                          <span className={`text-sm ${isChecked ? 'text-text-primary font-medium' : 'text-text-secondary'} group-hover:text-text-primary transition-colors`}>
                                            {action.label}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
