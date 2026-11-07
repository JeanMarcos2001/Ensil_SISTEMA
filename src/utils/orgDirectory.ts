/**
 * Empresas, Filiales y Almacenes guardados en la base de datos (paso 10): reglas puras, traducción entre el modelo del sistema y las
 * tablas `empresas`, `sedes` y `almacenes`, y los mensajes claros para los errores que devuelve la base.
 *
 * - La base repite lo imprescindible (RUC de 11 dígitos, código de sede, unicidad, claves que no se borran si algo depende de ellas);
 *   aquí están las mismas reglas para avisar en el formulario antes de enviar. `check-org-directory.ts` compara ambas.
 * - Una filial o un almacén guarda el id de su empresa (`companyId`); el nombre de la empresa NO se guarda en la filial, se calcula al mostrar
 *   (`withCompanyNames`): si se corrige la razón social, todas las filiales la muestran corregida.
 * - Lo que ya se usa no se borra: una empresa con filiales, almacenes o contratos vigentes no se inactiva ni se elimina.
 */
import type { Branch, Company, Warehouse } from '../context/DataContext';
import { warehouseDefinitionError } from './logisticsRoutes';

export const RUC_PATTERN = /^\d{11}$/;
/** Igual que la restricción de `sedes.id`: el código `FIL-NNN` lo asigna el sistema (nadie lo escribe). */
export const BRANCH_CODE_PATTERN = /^FIL-\d{3,}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ------------------------------------------------------------------------------------------------------------------ Filas de la base

export interface EmpresaRow {
  id: string;
  ruc: string;
  razon_social: string;
  nombre_comercial: string | null;
  estado: string;
  observaciones: string | null;
}

export interface SedeRow {
  id: string;
  nombre: string;
  empresa_id: string | null;
  estado: string;
  direccion: string;
  referencia: string | null;
  departamento: string;
  provincia: string;
  distrito: string;
  telefono_fijo: string | null;
  telefono_movil: string | null;
  correo: string | null;
  responsable_id: string | null;
  observaciones: string | null;
}

export interface AlmacenRow {
  id: string;
  nombre: string;
  empresa_id: string | null;
  estado: string;
  direccion: string | null;
  observaciones: string | null;
}

const orNull = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t ? t : null;
};
const status = (v: string): 'Activo' | 'Inactivo' => (v === 'Inactivo' ? 'Inactivo' : 'Activo');

export const companyFromRow = (r: EmpresaRow): Company => ({
  id: r.id, ruc: r.ruc, name: r.razon_social, commercialName: r.nombre_comercial ?? '', status: status(r.estado), observaciones: r.observaciones ?? '',
});

export const companyToRow = (c: Company): EmpresaRow => ({
  id: c.id, ruc: c.ruc.trim(), razon_social: c.name.trim(), nombre_comercial: orNull(c.commercialName), estado: c.status, observaciones: orNull(c.observaciones),
});

/** Solo los campos que cambian (el id no se toca). */
export function companyPatchToRow(p: Partial<Company>): Partial<EmpresaRow> {
  const row: Partial<EmpresaRow> = {};
  if (p.ruc !== undefined) row.ruc = p.ruc.trim();
  if (p.name !== undefined) row.razon_social = p.name.trim();
  if (p.commercialName !== undefined) row.nombre_comercial = orNull(p.commercialName);
  if (p.status !== undefined) row.estado = p.status;
  if (p.observaciones !== undefined) row.observaciones = orNull(p.observaciones);
  return row;
}

/** La filial sin el nombre de su empresa: ese se completa con `withCompanyNames`. */
export const branchFromRow = (r: SedeRow): Branch => ({
  id: r.id, name: r.nombre, company: '', companyId: r.empresa_id ?? undefined, status: status(r.estado), address: r.direccion,
  reference: r.referencia ?? '', department: r.departamento, province: r.provincia, district: r.distrito,
  phoneFixed: r.telefono_fijo ?? '', phoneMobile: r.telefono_movil ?? '', email: r.correo ?? '', responsibleId: r.responsable_id ?? undefined, observations: r.observaciones ?? '',
});

export const branchToRow = (b: Branch): SedeRow => ({
  id: b.id.trim(), nombre: b.name.trim(), empresa_id: b.companyId ?? null, estado: b.status, direccion: b.address.trim(),
  referencia: orNull(b.reference), departamento: b.department.trim(), provincia: b.province.trim(), distrito: b.district.trim(),
  telefono_fijo: orNull(b.phoneFixed), telefono_movil: orNull(b.phoneMobile), correo: orNull(b.email), responsable_id: orNull(b.responsibleId), observaciones: orNull(b.observations),
});

/** Solo los campos que cambian. El código y la empresa de una filial no se cambian después de crearla. */
export function branchPatchToRow(p: Partial<Branch>): Partial<SedeRow> {
  const row: Partial<SedeRow> = {};
  if (p.name !== undefined) row.nombre = p.name.trim();
  if (p.status !== undefined) row.estado = p.status;
  if (p.address !== undefined) row.direccion = p.address.trim();
  if (p.reference !== undefined) row.referencia = orNull(p.reference);
  if (p.department !== undefined) row.departamento = p.department.trim();
  if (p.province !== undefined) row.provincia = p.province.trim();
  if (p.district !== undefined) row.distrito = p.district.trim();
  if (p.phoneFixed !== undefined) row.telefono_fijo = orNull(p.phoneFixed);
  if (p.phoneMobile !== undefined) row.telefono_movil = orNull(p.phoneMobile);
  if (p.email !== undefined) row.correo = orNull(p.email);
  if (p.observations !== undefined) row.observaciones = orNull(p.observations);
  return row;
}

/** El almacén sin el nombre de su empresa: ese se completa con `withCompanyNames`. */
export const warehouseFromRow = (r: AlmacenRow): Warehouse => ({
  id: r.id, name: r.nombre, companyId: r.empresa_id ?? undefined, status: status(r.estado), address: r.direccion ?? undefined, observations: r.observaciones ?? undefined,
});

export const warehouseToRow = (w: Warehouse): AlmacenRow => ({
  id: w.id, nombre: w.name.trim(), empresa_id: w.companyId ?? null, estado: w.status, direccion: orNull(w.address), observaciones: orNull(w.observations),
});

/** Solo los campos que cambian (el id no se toca). Quitar la empresa (`companyId: undefined`) la deja en blanco. */
export function warehousePatchToRow(p: Partial<Warehouse>): Partial<AlmacenRow> {
  const row: Partial<AlmacenRow> = {};
  if (p.name !== undefined) row.nombre = p.name.trim();
  if ('companyId' in p) row.empresa_id = p.companyId ?? null;
  if (p.status !== undefined) row.estado = p.status;
  if ('address' in p) row.direccion = orNull(p.address);
  if ('observations' in p) row.observaciones = orNull(p.observations);
  return row;
}

/** Completa el nombre de la empresa de cada filial o almacén a partir de su id (lo derivable no se guarda). */
export function withCompanyNames<T extends { companyId?: string }>(items: T[], companies: Pick<Company, 'id' | 'name'>[]): T[] {
  return items.map(i => ({ ...i, company: companies.find(c => c.id === i.companyId)?.name ?? '' }));
}

// ------------------------------------------------------------------------------------------------------------------ Reglas

export type FieldErrors = Record<string, string>;

/** El primer mensaje de un conjunto de errores (para las acciones, que devuelven uno solo). */
export const firstError = (errors: FieldErrors): string | null => Object.values(errors).find(Boolean) ?? null;

/** ¿Alguna filial, almacén (de cualquier estado) o contrato vigente pertenece a esa empresa? Se pasan las listas juntas. */
export const hasLinkedBranches = (companyId: string, linked: { companyId?: string }[]): boolean => linked.some(b => b.companyId === companyId);

export const companyInactivationError = (company: Pick<Company, 'id'>, linked: { companyId?: string }[]): string | null =>
  hasLinkedBranches(company.id, linked) ? 'No se puede inactivar una empresa con filiales, almacenes o contratos vigentes vinculados.' : null;

export const companyDeletionError = (company: Pick<Company, 'id'>, linked: { companyId?: string }[]): string | null =>
  hasLinkedBranches(company.id, linked) ? 'No se puede eliminar esta empresa: tiene filiales, almacenes o contratos vinculados. Inactívela si ya no se usa.' : null;

/**
 * Errores por campo de una empresa (claves: `ruc`, `name`, `status`). `selfId` = la empresa que se edita (no se compara consigo misma).
 * La inactivación con filiales, almacenes o contratos vigentes (`linked`) solo se revisa al editar (`selfId`) y solo si la empresa estaba activa.
 */
export function companyFieldErrors(
  input: Pick<Company, 'ruc' | 'name' | 'status'>,
  companies: Pick<Company, 'id' | 'ruc' | 'status'>[],
  selfId?: string,
  linked: { companyId?: string }[] = [],
): FieldErrors {
  const errors: FieldErrors = {};
  const ruc = input.ruc.trim();
  if (!ruc) errors.ruc = 'El RUC es obligatorio.';
  else if (!RUC_PATTERN.test(ruc)) errors.ruc = 'El RUC debe tener exactamente 11 dígitos numéricos.';
  else if (companies.some(c => c.ruc === ruc && c.id !== selfId)) errors.ruc = 'Este RUC ya está registrado en otra empresa.';
  if (!input.name.trim()) errors.name = 'La razón social es obligatoria.';
  if (selfId && input.status === 'Inactivo') {
    const before = companies.find(c => c.id === selfId);
    const problem = before && before.status === 'Activo' ? companyInactivationError({ id: selfId }, linked) : null;
    if (problem) errors.status = problem;
  }
  return errors;
}

/**
 * Errores por campo de una filial (claves: `companyId`, `name`, `address`, `department`, `province`, `district`, `email`).
 * El código no se valida: lo asigna el sistema. Al crear se revisa la empresa (debe existir y estar activa); al editar (`selfId`) la
 * empresa no cambia y no se vuelve a revisar.
 */
export function branchFieldErrors(
  input: Partial<Branch>,
  branches: Pick<Branch, 'id' | 'name'>[],
  companies: Pick<Company, 'id' | 'status'>[],
  selfId?: string,
): FieldErrors {
  const errors: FieldErrors = {};
  const name = (input.name ?? '').trim();
  if (!selfId) {
    if (!input.companyId) errors.companyId = 'Debe seleccionar una empresa.';
    else {
      const company = companies.find(c => c.id === input.companyId);
      if (!company) errors.companyId = 'La empresa elegida no existe.';
      else if (company.status !== 'Activo') errors.companyId = 'La empresa elegida está inactiva.';
    }
  }
  if (!name) errors.name = 'El nombre es obligatorio.';
  else if (branches.some(b => b.id !== selfId && b.name.trim().toLowerCase() === name.toLowerCase())) errors.name = 'Ya existe una filial con ese nombre.';
  if (!(input.address ?? '').trim()) errors.address = 'La dirección es obligatoria.';
  if (!(input.department ?? '').trim()) errors.department = 'El departamento es obligatorio.';
  if (!(input.province ?? '').trim()) errors.province = 'La provincia es obligatoria.';
  if (!(input.district ?? '').trim()) errors.district = 'El distrito es obligatorio.';
  const email = (input.email ?? '').trim();
  if (email && !EMAIL_PATTERN.test(email)) errors.email = 'Formato de correo inválido.';
  return errors;
}

/**
 * Errores por campo de un almacén (claves: `name`, `companyId`, `status`). La empresa es opcional; si se elige debe existir y estar activa
 * (un almacén que ya la tenía puede conservarla). Solo puede haber un almacén central activo.
 */
export function warehouseFieldErrors(
  input: Pick<Warehouse, 'name' | 'status' | 'companyId'>,
  warehouses: Pick<Warehouse, 'id' | 'name' | 'status' | 'companyId'>[],
  companies: Pick<Company, 'id' | 'status'>[],
  selfId?: string,
): FieldErrors {
  const errors: FieldErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = 'El nombre del almacén es obligatorio.';
  else if (name.length > 80) errors.name = 'El nombre del almacén no puede pasar de 80 caracteres.';
  else if (warehouses.some(w => w.id !== selfId && w.name.trim().toLowerCase() === name.toLowerCase())) errors.name = 'Ya existe un almacén con ese nombre.';
  if (input.companyId) {
    const company = companies.find(c => c.id === input.companyId);
    const unchanged = !!selfId && warehouses.find(w => w.id === selfId)?.companyId === input.companyId;
    if (!company) errors.companyId = 'La empresa elegida no existe.';
    else if (company.status !== 'Activo' && !unchanged) errors.companyId = 'La empresa elegida está inactiva.';
  }
  if (input.status === 'Activo') {
    const problem = warehouseDefinitionError([...warehouses.filter(w => w.id !== selfId), { name, status: input.status }]);
    if (problem) errors.status = problem;
  }
  return errors;
}

// ------------------------------------------------------------------------------------------------------------------ Errores de la base

export interface DbErrorLike { code?: string; message?: string; details?: string; hint?: string }

const text = (e: DbErrorLike): string => `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();

/** ¿El error es que ya existe una fila con ese id generado (dos personas crearon a la vez)? Se reintenta con el id siguiente. */
export const isIdConflict = (e: DbErrorLike | null | undefined): boolean => !!e && e.code === '23505' && /(empresas|sedes|almacenes|roles|personal|asignaciones|contratos|planilla_ajustes)_pkey|sedes_id_unico|personal_codigo_key/.test(text(e));

/** Mensaje claro para un error de la base. No muestra texto técnico. */
export function dbErrorMessage(e: DbErrorLike | null | undefined): string {
  if (!e) return 'No se pudo guardar. Intente de nuevo.';
  const t = text(e);
  if (e.code === '23505') {
    if (t.includes('empresas_ruc_key')) return 'Este RUC ya está registrado en otra empresa.';
    if (t.includes('sedes_id_unico') || t.includes('sedes_pkey')) return 'Este código ya está en uso.';
    if (t.includes('sedes_nombre_unico')) return 'Ya existe una filial con ese nombre.';
    if (t.includes('almacenes_nombre_unico')) return 'Ya existe un almacén con ese nombre.';
    if (t.includes('roles_nombre_unico')) return 'Ya existe un rol con este nombre.';
    if (t.includes('personal_documento_unico')) return 'Este documento ya está registrado en el personal.';
    if (t.includes('personal_codigo_key')) return 'Este código de personal ya está en uso.';
    if (t.includes('asignaciones_una_principal')) return 'La persona ya tiene una asignación principal activa.';
    if (t.includes('asignaciones_sin_duplicar')) return 'Esta persona ya tiene una asignación activa en ese lugar y área.';
    if (t.includes('cuentas_personal_unico')) return 'Esta persona ya tiene una cuenta.';
    if (t.includes('planillas_pkey') || t.includes('planillas_empresa_id_periodo_key')) return 'Ya existe la planilla de ese mes de esa empresa.';
    if (t.includes('contratos_pkey')) return 'Este código de contrato ya está en uso.';
    if (t.includes('almacenes_un_activo')) return 'Solo puede haber un almacén central activo: inactive el actual antes de activar otro.';
    return 'Ya existe un registro con esos datos.';
  }
  // Eliminar algo de lo que dependen otras filas: las claves son RESTRICT, así que Postgres responde 23001 (23503 si fuera NO ACTION).
  if (e.code === '23001' || t.includes('violates restrict') || t.includes('is still referenced') || t.includes('is referenced from')) {
    return 'No se puede eliminar: hay datos que dependen de este registro. Inactívelo si ya no se usa.';
  }
  if (e.code === '23503') return 'La empresa elegida no existe.';
  if (e.code === '23514') {
    if (t.includes('empresas_ruc_check')) return 'El RUC debe tener exactamente 11 dígitos numéricos.';
    if (t.includes('sedes_id_check')) return 'El código debe tener de 2 a 20 caracteres: letras, números, guion o guion bajo, sin espacios.';
    if (t.includes('asignaciones_almacen_solo_logistica')) return 'En el almacén central solo se trabaja en el área «Logística».';
    return 'Algún dato no cumple el formato que exige la base de datos.';
  }
  // Los avisos de los disparadores propios (código EN001: permisos, personal, asignaciones, cuentas) ya vienen en español
  if (e.code === 'EN001' && e.message) return e.message;
  // Los avisos de los disparadores de la base (rol del sistema, último Superusuario) ya vienen en español y no revelan nada técnico.
  if (e.code === 'P0001' && /rol del sistema|pasar a ser del sistema|cuenta de superusuario/i.test(e.message ?? '')) return e.message!;
  if (e.code === '42501' || t.includes('row-level security') || t.includes('permission denied')) return 'Su cuenta no tiene permiso en la base de datos para esta operación.';
  if (t.includes('failed to fetch') || t.includes('network') || t.includes('load failed')) return 'No hay conexión con el servidor. Revise su internet e intente de nuevo.';
  if (e.code === 'PGRST301' || t.includes('jwt')) return 'Su sesión venció: cierre sesión y vuelva a ingresar.';
  return 'No se pudo completar la operación en la base de datos. Intente de nuevo.';
}
