import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Search, Save, Shield, CheckSquare, Square, ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { useData } from '../../../context/DataContext';
import {
  buildHolders, capabilityById, permissionCatalog, removalBlockers, roleClosure, roleWarnings, toggleCapability, type CatalogFunctionality,
} from '../../../utils/capabilities';
import { ROLE_TEMPLATES, templateById, templatePermissions } from '../../../utils/roleTemplates';
import { counterpartStatus, menuPreview, roleUsage } from '../../../utils/roleBuilder';
import { MIN_REASON } from '../../../utils/assignments';
import { CounterpartLights, MenuPreviewPanel, RoleWarnings } from './RoleInsights';

// El catálogo sale del registro único de funciones: aquí no se escribe ningún permiso a mano.
const MODULES = permissionCatalog();
const label = (id: string) => capabilityById(id)?.label ?? id;

interface Props { initialRoleId?: string }

/** Panel B · Editor de rol: se marcan funciones y el sistema completa lo que necesitan, avisa lo que conviene separar y muestra a quién llegan. */
export function RoleEditor({ initialRoleId }: Props) {
  const { roles, users, branches, stockLocations, permissions: allPermissions, savePermissions, can } = useData();
  const [selectedRole, setSelectedRole] = useState<string>(initialRoleId || roles[0]?.id || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 'mod-operacion': true });
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: 'info' | 'error' | 'ok'; text: string } | null>(null);

  const role = roles.find(r => r.id === selectedRole);
  const saved = useMemo(() => new Set(allPermissions.find(p => p.roleId === selectedRole)?.permissions ?? []), [allPermissions, selectedRole]);
  const readOnly = !role || !!role.locked || !can('org-roles:config_perms');

  // El borrador parte de lo guardado: al cambiar de rol y también después de guardar (el aviso de «guardado» se conserva)
  useEffect(() => {
    setDraft(new Set(saved));
    setReasons({});
  }, [saved]);
  useEffect(() => setNotice(null), [selectedRole]);

  const dirty = draft.size !== saved.size || [...draft].some(k => !saved.has(k));
  const warnings = useMemo(() => (role?.locked ? [] : roleWarnings(draft)), [draft, role]);
  const accepted = role?.acceptedRisks ?? [];
  const unjustified = warnings.filter(w => !accepted.some(a => a.ruleId === w.id) && (reasons[w.id] ?? '').trim().length < MIN_REASON);

  // Semáforo y menú: con las cuentas de hoy y las funciones que se están armando (todavía sin guardar)
  const rows = useMemo(() => {
    if (!role) return [];
    const holders = buildHolders({
      users, roles, branches,
      permissions: [...allPermissions.filter(p => p.roleId !== role.id), { roleId: role.id, permissions: [...draft] }],
    });
    const roleBranchNames = new Set(users.filter(u => u.role === role.name && u.status === 'Activo').flatMap(u => [u.branch, ...(u.additionalBranches ?? [])]));
    const roleBranchIds = branches.filter(b => roleBranchNames.has(b.name)).map(b => b.id);
    return counterpartStatus([...draft], holders, stockLocations, roleBranchIds);
  }, [role, users, roles, branches, stockLocations, allPermissions, draft]);
  const menu = useMemo(() => menuPreview(draft), [draft]);

  const toggle = (id: string) => {
    if (readOnly) return;
    const r = toggleCapability(draft, id);
    if (r.blockedBy) {
      setNotice({ kind: 'error', text: `No se puede quitar «${label(id)}»: la necesitan ${r.blockedBy.map(b => `«${label(b)}»`).join(', ')}.` });
      return;
    }
    setDraft(new Set(r.selected));
    setNotice(r.added && r.added.length > 0 ? { kind: 'info', text: `Se marcaron también las que «${label(id)}» necesita: ${r.added.map(a => `«${label(a)}»`).join(', ')}.` } : null);
  };

  const toggleFunctionality = (func: CatalogFunctionality) => {
    if (readOnly) return;
    const ids = func.actions.map(a => `${func.id}:${a.id}`);
    const next = new Set(draft);
    const allChecked = ids.every(id => next.has(id));
    ids.forEach(id => (allChecked ? next.delete(id) : next.add(id)));
    // Lo que otra función marcada necesita se vuelve a sumar solo
    const complete = roleClosure(next).all;
    setDraft(new Set(complete));
    setNotice(allChecked && ids.some(id => complete.includes(id)) ? { kind: 'info', text: 'Algunas funciones se conservaron porque otra marcada las necesita.' } : null);
  };

  const applyTemplate = (templateId: string) => {
    const template = templateById(templateId);
    if (!template || readOnly) return;
    setDraft(new Set(templatePermissions(template)));
    setReasons(template.risks ?? {});
    setNotice({ kind: 'info', text: `Se cargaron las funciones de la plantilla «${template.name}». Revise y pulse «Guardar» para aplicarlas.` });
  };

  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!role || saving) return;
    setSaving(true);
    const result = await savePermissions(role.id, [...draft], reasons);
    setSaving(false);
    setNotice(result.ok ? { kind: 'ok', text: 'Funciones guardadas.' } : { kind: 'error', text: result.error ?? 'No se pudo guardar.' });
  };

  const handleDiscard = () => {
    setDraft(new Set(saved));
    setReasons({});
    setNotice(null);
  };

  const counts = (module: typeof MODULES[number]) => {
    let total = 0, active = 0;
    module.functionalities.forEach(f => f.actions.forEach(a => { total++; if (draft.has(`${f.id}:${a.id}`)) active++; }));
    return { total, active };
  };

  const filteredRoles = roles.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const usage = role ? roleUsage(role, users) : { total: 0, active: 0 };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-start mb-4 gap-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">{role?.name ?? 'Elija un rol'}</h3>
          <p className="text-sm text-text-secondary">
            {role ? `${draft.size} funciones marcadas · ${usage.active} cuenta${usage.active === 1 ? '' : 's'} activa${usage.active === 1 ? '' : 's'}${role.branchUserLimit ? ` · máximo ${role.branchUserLimit} por sede` : ''}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {dirty && <span className="text-xs text-warning-text">Hay cambios sin guardar</span>}
          {!readOnly && (
            <select
              value=""
              onChange={e => applyTemplate(e.target.value)}
              className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
              aria-label="Cargar las funciones de una plantilla"
            >
              <option value="">Partir de una plantilla…</option>
              {ROLE_TEMPLATES.filter(t => !t.locked).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {!readOnly && (
            <>
              <Button variant="secondary" onClick={handleDiscard} disabled={!dirty}>Descartar cambios</Button>
              <Button variant="primary" className="flex items-center gap-2" onClick={handleSave} disabled={!dirty || unjustified.length > 0 || saving}>
                <Save size={16} />
                Guardar
              </Button>
            </>
          )}
        </div>
      </div>

      {role?.locked && (
        <div className="mb-4 rounded-xl border border-border-soft bg-surface-muted p-3 text-sm text-text-secondary flex items-center gap-2">
          <Lock size={16} className="shrink-0" /> «{role.name}» es un rol del sistema: puede todo, en todas las sedes, y no se edita.
        </div>
      )}
      {notice && (
        <div className={`mb-4 rounded-xl border p-3 text-sm ${notice.kind === 'error' ? 'border-error bg-danger-tint text-danger-text' : notice.kind === 'ok' ? 'border-border-soft bg-success-tint text-success-text' : 'border-border-soft bg-info-tint text-info-text'}`} role="status">
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Lista de roles */}
        <Card className="lg:col-span-2 flex flex-col p-4 h-full">
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4">Rol</h3>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              type="text"
              placeholder="Buscar rol..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
            />
          </div>
          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
            {filteredRoles.map(r => {
              const u = roleUsage(r, users);
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedRole(r.id)}
                  className={`w-full flex flex-col items-start p-3 rounded-xl border transition-all text-left ${
                    selectedRole === r.id ? 'bg-active-tint border-primary-accent shadow-sm' : 'bg-surface border-border-soft hover:border-primary-accent/30 hover:bg-surface-muted'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {r.locked ? <Lock size={14} className="text-text-muted" /> : <Shield size={14} className={selectedRole === r.id ? 'text-primary-accent' : 'text-text-muted'} />}
                    <span className={`text-sm font-medium ${selectedRole === r.id ? 'text-primary-accent' : 'text-text-primary'}`}>{r.name}</span>
                  </div>
                  <span className="text-xs text-text-secondary ml-6">{u.active} cuenta{u.active === 1 ? '' : 's'} activa{u.active === 1 ? '' : 's'}</span>
                  {r.status !== 'Activo' && <span className="ml-6 mt-1"><Badge variant="neutral">Inactivo</Badge></span>}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Matriz de funciones */}
        <Card className="lg:col-span-6 flex flex-col p-0 h-full overflow-hidden">
          <div className="p-4 border-b border-border-soft bg-surface-muted/30">
            <p className="text-sm text-text-secondary">
              Al marcar una función se marcan solas las que necesita; una función que otra necesita no se puede quitar (el candado dice cuál).
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {MODULES.map(module => {
              const stats = counts(module);
              const isExpanded = expanded[module.id];
              return (
                <div key={module.id} className="border border-border-soft rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpanded(prev => ({ ...prev, [module.id]: !prev[module.id] }))}
                    className="w-full flex items-center justify-between p-4 bg-surface-muted hover:bg-surface-muted/80 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown size={18} className="text-text-muted" /> : <ChevronRight size={18} className="text-text-muted" />}
                      <span className="font-semibold text-text-primary">{module.name}</span>
                    </div>
                    <span className="text-sm text-text-secondary">{stats.active}/{stats.total} funciones</span>
                  </button>
                  {isExpanded && (
                    <div className="p-4 bg-surface border-t border-border-soft">
                      <table className="w-full text-sm text-left">
                        <tbody className="divide-y divide-border-soft">
                          {module.functionalities.map(func => (
                            <tr key={func.id}>
                              <td className="py-4 pr-4 align-top w-1/4">
                                <span className="font-medium text-text-primary block">{func.name}</span>
                                {!readOnly && (
                                  <button onClick={() => toggleFunctionality(func)} className="text-[10px] text-primary-accent hover:underline mt-1">Seleccionar todo</button>
                                )}
                              </td>
                              <td className="py-4">
                                <div className="flex flex-wrap gap-x-6 gap-y-3">
                                  {func.actions.map(action => {
                                    const id = `${func.id}:${action.id}`;
                                    const checked = draft.has(id);
                                    const needed = checked ? removalBlockers(id, draft) : [];
                                    const def = capabilityById(id);
                                    const Icon = checked ? CheckSquare : Square;
                                    return (
                                      <div
                                        key={action.id}
                                        className={`flex items-center gap-2 group ${readOnly ? '' : 'cursor-pointer'}`}
                                        onClick={() => toggle(id)}
                                        title={needed.length > 0 ? `La necesitan: ${needed.map(label).join(', ')}` : undefined}
                                      >
                                        <Icon size={16} className={`${checked ? 'text-primary-accent' : 'text-border-strong'} group-hover:opacity-80 transition-opacity`} />
                                        <span className={`text-sm ${checked ? 'text-text-primary font-medium' : 'text-text-secondary'} group-hover:text-text-primary transition-colors`}>{action.label}</span>
                                        {needed.length > 0 && <Lock size={11} className="text-text-muted" />}
                                        {def?.sensitive === 'dinero' && <span className="text-[10px] text-text-muted" title="Mueve o muestra dinero">💲</span>}
                                        {def?.sensitive === 'control' && <span className="text-[10px] text-text-muted" title="Control: pide motivo y deja historial">🛡</span>}
                                        {def?.sensitive === 'remuneracion' && <span className="text-[10px] text-text-muted" title="Muestra sueldos">👁‍🗨</span>}
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
        </Card>

        {/* Lo que el sistema sabe del rol que se arma */}
        <Card className="lg:col-span-4 p-4 h-full overflow-y-auto space-y-6">
          <RoleWarnings warnings={warnings} accepted={accepted} reasons={reasons} onReason={(id, text) => setReasons(prev => ({ ...prev, [id]: text }))} readOnly={readOnly} />
          <CounterpartLights rows={rows} />
          <MenuPreviewPanel modules={menu.modules} settings={menu.settings} />
        </Card>
      </div>
    </div>
  );
}
