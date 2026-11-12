/**
 * Traducción entre los artículos, sus precios de venta y las recetas del sistema y las filas de la base (tablas `articulos`,
 * `articulo_precios` y `recetas`), y de los errores de la base a mensajes claros. Funciones puras.
 *
 * El nombre de cada componente de un paquete NO se guarda (lo derivable no se guarda): sale del propio artículo con `withComponentNames`.
 */
import type { Item, ItemPrice, ItemType, Recipe } from '../context/DataContext';
import { catalogErrorMessage } from './catalogDb';
import type { DbErrorLike } from './orgDirectory';

type Estado = 'Activo' | 'Inactivo';
type Money = number | string;

export interface ArticuloRow {
  id: string; nombre: string; estado: Estado; tipo: ItemType; descripcion: string; unidad: string; costo: Money;
  se_entrega_en_matricula: boolean; es_paquete: boolean;
  sesiones: number | null; gimnasia_por_sesion: number | null; entrenamientos_por_sesion: number | null;
  modo_entrenamiento: 'General' | 'Variable' | null; entrenamientos_variables: { sesion: number; entrenamientos: number }[] | null;
  tipo_libro: 'Individual' | 'Paquete/Juego' | null; encuadernado: 'Anillado' | 'Encolado' | null;
  composicion: { articulo_id: string; cantidad: number }[] | null;
}
export interface PrecioRow {
  id: string; articulo_id: string; sede_id: string | null; monto: Money; vigente_desde: string; vigente_hasta: string | null; creado_en: string; creado_por: string | null;
}
export interface RecetaRow {
  id: string; nombre: string; programa_id: string; nivel_id: string | null; todas_las_sedes: boolean; sedes: string[]; estado: Estado;
  articulos: { articulo_id: string; cantidad: number }[]; vigencia_inicio: string; vigencia_fin: string | null;
}

const nul = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

// ------------------------------------------------------------------------------------------------------------------ Artículos

export const itemFromRow = (r: ArticuloRow): Item => ({
  id: r.id, name: r.nombre, status: r.estado, type: r.tipo, description: r.descripcion ?? '', unit: r.unidad, cost: Number(r.costo),
  isDeliveredOnEnrollment: r.se_entrega_en_matricula, isPackage: r.es_paquete,
  ...(r.sesiones !== null ? { sessions: Number(r.sesiones) } : {}),
  ...(r.gimnasia_por_sesion !== null ? { gymnasticsPerSession: Number(r.gimnasia_por_sesion) } : {}),
  ...(r.entrenamientos_por_sesion !== null ? { trainingsPerSession: Number(r.entrenamientos_por_sesion) } : {}),
  ...(r.modo_entrenamiento ? { trainingMode: r.modo_entrenamiento } : {}),
  ...(r.entrenamientos_variables ? { variableTrainings: r.entrenamientos_variables.map(v => ({ session: Number(v.sesion), trainings: Number(v.entrenamientos) })) } : {}),
  ...(r.tipo_libro ? { bookType: r.tipo_libro } : {}),
  ...(r.encuadernado ? { bindingType: r.encuadernado } : {}),
  ...(r.composicion ? { composition: r.composicion.map(c => ({ itemId: c.articulo_id, name: '', quantity: Number(c.cantidad) })) } : {}),
});

export const itemToRow = (i: Item): ArticuloRow => ({
  id: i.id.trim(), nombre: i.name.trim(), estado: i.status, tipo: i.type, descripcion: i.description ?? '', unidad: (i.unit ?? '').trim() || 'Unidad', costo: i.cost ?? 0,
  se_entrega_en_matricula: !!i.isDeliveredOnEnrollment, es_paquete: !!i.isPackage,
  sesiones: nul(i.sessions), gimnasia_por_sesion: nul(i.gymnasticsPerSession), entrenamientos_por_sesion: nul(i.trainingsPerSession),
  modo_entrenamiento: nul(i.trainingMode),
  entrenamientos_variables: i.trainingMode === 'Variable' || (i.variableTrainings?.length ?? 0) > 0
    ? (i.variableTrainings ?? []).map(v => ({ sesion: v.session, entrenamientos: v.trainings })) : null,
  tipo_libro: nul(i.bookType), encuadernado: nul(i.bindingType),
  composicion: i.isPackage || (i.composition?.length ?? 0) > 0 ? (i.composition ?? []).map(c => ({ articulo_id: c.itemId, cantidad: c.quantity })) : null,
});

/** Completa el nombre de cada componente de un kit con el nombre actual de su artículo (si ya no existe, queda su SKU). */
export function withComponentNames(items: Item[]): Item[] {
  const names = new Map(items.map(i => [i.id, i.name]));
  return items.map(i => (i.composition ? { ...i, composition: i.composition.map(c => ({ ...c, name: names.get(c.itemId) ?? c.itemId })) } : i));
}

// ------------------------------------------------------------------------------------------------------------------ Precios

export const priceFromRow = (r: PrecioRow): ItemPrice => ({
  id: r.id, itemId: r.articulo_id, branchId: r.sede_id ?? 'all', amount: Number(r.monto), validFrom: r.vigente_desde,
  ...(r.vigente_hasta ? { validTo: r.vigente_hasta } : {}), createdAt: r.creado_en, createdBy: r.creado_por ?? '',
});

// ------------------------------------------------------------------------------------------------------------------ Recetas

export const recipeFromRow = (r: RecetaRow): Recipe => ({
  id: r.id, name: r.nombre, programId: r.programa_id, ...(r.nivel_id ? { levelId: r.nivel_id } : {}), branchIds: r.todas_las_sedes ? [] : [...r.sedes],
  applyToAllBranches: r.todas_las_sedes, status: r.estado, items: r.articulos.map(a => ({ itemId: a.articulo_id, quantity: Number(a.cantidad) })),
  startDate: r.vigencia_inicio, ...(r.vigencia_fin ? { endDate: r.vigencia_fin } : {}),
});

export const recipeToRow = (r: Recipe): RecetaRow => ({
  id: r.id, nombre: r.name.trim(), programa_id: r.programId, nivel_id: r.levelId || null, todas_las_sedes: r.applyToAllBranches,
  sedes: r.applyToAllBranches ? [] : [...r.branchIds], estado: r.status, articulos: r.items.map(l => ({ articulo_id: l.itemId, cantidad: l.quantity })),
  vigencia_inicio: r.startDate, vigencia_fin: r.endDate || null,
});

// ------------------------------------------------------------------------------------------------------------------ Errores de la base

/** Un id de receta repetido por dos personas que crean a la vez: se reintenta con el siguiente. */
export const isRecipeIdConflict = (e: DbErrorLike | null | undefined): boolean =>
  !!e && e.code === '23505' && /recetas_pkey/.test(`${e.message ?? ''} ${e.details ?? ''}`.toLowerCase());

/** Un SKU repetido por dos personas que crean a la vez: se reintenta con el siguiente. */
export const isItemIdConflict = (e: DbErrorLike | null | undefined): boolean =>
  !!e && e.code === '23505' && /articulos_pkey|articulos_id_unico/.test(`${e.message ?? ''} ${e.details ?? ''}`.toLowerCase());

export function itemsErrorMessage(e: DbErrorLike | null | undefined): string {
  if (!e) return 'No se pudo guardar. Intente de nuevo.';
  const t = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  if (e.code === '23505') {
    if (t.includes('articulos_pkey') || t.includes('articulos_id_unico')) return 'El código SKU ya existe en el sistema.';
    if (t.includes('articulo_precios_inicio_unico')) return 'Ya existe un precio con esa fecha de inicio. Use una fecha posterior.';
  }
  if (e.code === '23514' && t.includes('articulos_id_check')) return 'El SKU solo admite letras, números, punto, guion y guion bajo (máximo 40 caracteres).';
  return catalogErrorMessage(e);
}
