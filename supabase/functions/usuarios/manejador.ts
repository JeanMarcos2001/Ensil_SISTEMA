/**
 * Orquestador de la Edge Function `usuarios`: lee la petición, identifica a quien llama, aplica las reglas (`reglas.ts`) y ejecuta los
 * cambios en el orden que deja menos riesgo. No conoce Deno ni Supabase: recibe la base como `CuentasDb` (la real está en `index.ts` y una
 * en memoria en `scripts/check-cuentas-fn.ts`).
 *
 * Acciones (`{ accion: ... }`):
 *  - `invitar`: crea la cuenta (invitación por correo + fila en `cuentas`). La cuenta nace de una persona de Personal (`personalId`): su
 *    nombre, documento y teléfono salen de la ficha y sus sedes y almacén de sus asignaciones (los mantiene la base). Sin persona solo se
 *    admite una cuenta técnica con rol del sistema. Si algo falla después de crear al usuario en Auth, lo borra: nunca queda un usuario sin cuenta.
 *  - `editar`: cambia datos, rol, sedes, almacenes o estado. Desactivar: primero el estado (la base deja de dar acceso al instante) y
 *    después el bloqueo en Auth. Activar: primero se quita el bloqueo y después el estado, así un fallo deja la cuenta inactiva.
 *  - `reenviar`: vuelve a mandar la invitación (si nunca entró) o el enlace para fijar la contraseña.
 *  - `ingreso`: anota el último acceso de quien llama.
 * Los errores de negocio responden 200 con `{ ok: false, error }`; 401 si falta o vence la sesión; 403 si la cuenta no está activa.
 */
import {
  errorEdicion, errorInvitacion, errorReenvio, normalizarCorreo,
  type Cambios, type Contexto, type Estado, type SolicitudInvitar,
} from './reglas.ts';

export interface NuevaCuenta {
  id: string; nombre: string; correo: string; rolId: string; todasLasSedes: boolean; documento?: string; telefono?: string;
  sedeIds: string[]; sedePrincipalId?: string; almacenIds: string[];
  /** La persona de la que nace la cuenta: la base le da su nombre, documento, teléfono, sedes y almacén. */
  personalId?: string;
}

export interface PatchCuenta {
  nombre?: string; rolId?: string; estado?: Estado; notaEstado?: string | null; todasLasSedes?: boolean; documento?: string; telefono?: string;
  sedeIds?: string[]; sedePrincipalId?: string; almacenIds?: string[];
}

export interface CuentasDb {
  /** Id del usuario de Auth al que pertenece el token, o `null` si no es válido o venció. */
  usuarioDelToken(jwt: string): Promise<string | null>;
  /** Lo que las reglas necesitan; `null` si quien llama no tiene una cuenta activa. */
  cargarContexto(llamanteId: string): Promise<Contexto | null>;
  invitar(correo: string, redirectTo?: string): Promise<{ id: string } | { error: string }>;
  /** Crea la cuenta y sus sedes y almacenes; si algo falla no deja nada a medias. Devuelve el error o `null`. */
  crearCuenta(c: NuevaCuenta): Promise<string | null>;
  borrarUsuarioAuth(id: string): Promise<void>;
  actualizarCuenta(id: string, p: PatchCuenta): Promise<string | null>;
  fijarBloqueo(id: string, bloqueado: boolean): Promise<string | null>;
  /** Invitación si el usuario nunca confirmó su correo; si no, el enlace para fijar la contraseña. */
  enviarAcceso(id: string, correo: string, redirectTo?: string): Promise<string | null>;
  registrarIngreso(id: string): Promise<void>;
}

export interface Respuesta { status: number; cuerpo: { ok: boolean; error?: string; cuentaId?: string } }

const ok = (extra: { cuentaId?: string } = {}): Respuesta => ({ status: 200, cuerpo: { ok: true, ...extra } });
const falla = (error: string, status = 200): Respuesta => ({ status, cuerpo: { ok: false, error } });

// ------------------------------------------------------------------------------------------------------------------ Lectura de la petición

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown, max = 200): string | undefined => (typeof v === 'string' && v.length <= max ? v : undefined);
const lista = (v: unknown): string[] | undefined => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 50 || !v.every(x => typeof x === 'string' && x.length <= 40)) return undefined;
  return [...new Set(v as string[])];
};
/** Solo direcciones http(s): Supabase además comprueba que estén en la lista de Redirect URLs permitidas. */
const url = (v: unknown): string | undefined => (typeof v === 'string' && /^https?:\/\/[^\s]+$/.test(v) && v.length <= 300 ? v : undefined);

export type Peticion =
  | { accion: 'invitar'; solicitud: SolicitudInvitar; redirectTo?: string }
  | { accion: 'editar'; cuentaId: string; cambios: Cambios }
  | { accion: 'reenviar'; cuentaId: string; redirectTo?: string }
  | { accion: 'ingreso' };

export function leerPeticion(raw: unknown): { peticion?: Peticion; error?: string } {
  if (!isRec(raw)) return { error: 'La petición no tiene el formato esperado.' };
  switch (raw.accion) {
    case 'ingreso': return { peticion: { accion: 'ingreso' } };
    case 'invitar': {
      const sedeIds = lista(raw.sedeIds) ?? [];
      const almacenIds = lista(raw.almacenIds) ?? [];
      if (raw.sedeIds !== undefined && lista(raw.sedeIds) === undefined) return { error: 'Las sedes no tienen el formato esperado.' };
      if (raw.almacenIds !== undefined && lista(raw.almacenIds) === undefined) return { error: 'Los almacenes no tienen el formato esperado.' };
      const nombre = texto(raw.nombre, 300);
      const correo = texto(raw.correo, 300);
      const rolId = texto(raw.rolId, 40);
      const personalId = texto(raw.personalId, 40) || undefined;
      if (raw.personalId !== undefined && raw.personalId !== null && personalId === undefined) return { error: 'La persona elegida no tiene el formato esperado.' };
      // Con persona, el nombre sale de la ficha; sin ella (cuenta técnica) hace falta
      if (correo === undefined || rolId === undefined || (!personalId && nombre === undefined)) return { error: personalId ? 'Faltan el correo y el rol de la cuenta.' : 'Faltan datos de la cuenta (nombre, correo y rol).' };
      return {
        peticion: {
          accion: 'invitar', redirectTo: url(raw.redirectTo),
          solicitud: {
            personalId, nombre, correo, rolId, sedeIds, almacenIds, sedePrincipalId: texto(raw.sedePrincipalId, 40) || undefined, todasLasSedes: raw.todasLasSedes === true,
            documento: texto(raw.documento, 60), telefono: texto(raw.telefono, 60),
          },
        },
      };
    }
    case 'editar': {
      const cuentaId = texto(raw.cuentaId, 40);
      if (!cuentaId || !isRec(raw.cambios)) return { error: 'Falta indicar la cuenta y los cambios.' };
      const c = raw.cambios;
      const estado = c.estado === 'Activo' || c.estado === 'Inactivo' ? c.estado : undefined;
      if (c.estado !== undefined && !estado) return { error: 'El estado no es válido.' };
      for (const k of ['sedeIds', 'almacenIds'] as const) if (c[k] !== undefined && lista(c[k]) === undefined) return { error: 'Las sedes o almacenes no tienen el formato esperado.' };
      return {
        peticion: {
          accion: 'editar', cuentaId,
          cambios: {
            nombre: texto(c.nombre, 300), rolId: texto(c.rolId, 40), estado, sedeIds: lista(c.sedeIds), sedePrincipalId: texto(c.sedePrincipalId, 40) || undefined,
            almacenIds: lista(c.almacenIds), todasLasSedes: typeof c.todasLasSedes === 'boolean' ? c.todasLasSedes : undefined,
            documento: texto(c.documento, 60), telefono: texto(c.telefono, 60),
          },
        },
      };
    }
    case 'reenviar': {
      const cuentaId = texto(raw.cuentaId, 40);
      return cuentaId ? { peticion: { accion: 'reenviar', cuentaId, redirectTo: url(raw.redirectTo) } } : { error: 'Falta indicar la cuenta.' };
    }
    default: return { error: 'La acción pedida no existe.' };
  }
}

/** Fecha de hoy en Lima (AAAA-MM-DD), para las constancias de «Desactivado por … el …». */
export const hoyLima = (ahora: Date): string => ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

// ------------------------------------------------------------------------------------------------------------------ Manejador

export async function manejar(jwt: string | null, cuerpo: unknown, db: CuentasDb, ahora: () => Date = () => new Date()): Promise<Respuesta> {
  if (!jwt) return falla('Falta iniciar sesión.', 401);
  const llamanteId = await db.usuarioDelToken(jwt);
  if (!llamanteId) return falla('Su sesión no es válida o venció: vuelva a ingresar.', 401);

  const leida = leerPeticion(cuerpo);
  if (!leida.peticion) return falla(leida.error ?? 'La petición no tiene el formato esperado.');
  const peticion = leida.peticion;

  if (peticion.accion === 'ingreso') {
    await db.registrarIngreso(llamanteId);
    return ok();
  }

  const ctx = await db.cargarContexto(llamanteId);
  if (!ctx) return falla('Su cuenta no está activa en el sistema.', 403);

  if (peticion.accion === 'invitar') {
    const s: SolicitudInvitar = { ...peticion.solicitud, nombre: peticion.solicitud.nombre?.trim(), correo: normalizarCorreo(peticion.solicitud.correo) };
    const problema = errorInvitacion(s, ctx);
    if (problema) return falla(problema);
    const invitado = await db.invitar(s.correo, peticion.redirectTo);
    if ('error' in invitado) return falla(invitado.error);
    // De una persona, la cuenta toma de la ficha el nombre, el documento y el teléfono, y de sus asignaciones las sedes y el almacén (lo hace la base)
    const persona = s.personalId ? ctx.personal.find(p => p.id === s.personalId) : undefined;
    const fallo = await db.crearCuenta(persona
      ? { id: invitado.id, personalId: persona.id, nombre: persona.nombre, correo: s.correo, rolId: s.rolId, todasLasSedes: false, sedeIds: [], almacenIds: [] }
      : {
        id: invitado.id, nombre: s.nombre ?? '', correo: s.correo, rolId: s.rolId, todasLasSedes: s.todasLasSedes, documento: s.documento?.trim() || undefined,
        telefono: s.telefono?.trim() || undefined, sedeIds: s.sedeIds, sedePrincipalId: s.sedeIds.length > 0 ? (s.sedePrincipalId ?? s.sedeIds[0]) : undefined, almacenIds: s.almacenIds,
      });
    if (fallo) {
      await db.borrarUsuarioAuth(invitado.id);
      return falla(`No se pudo crear la cuenta: ${fallo}`);
    }
    return ok({ cuentaId: invitado.id });
  }

  if (peticion.accion === 'editar') {
    const { cuentaId, cambios } = peticion;
    const problema = errorEdicion(cuentaId, cambios, ctx);
    if (problema) return falla(problema);
    const antes = ctx.cuentas.find(c => c.id === cuentaId)!;
    const patch: PatchCuenta = { ...cambios, nombre: cambios.nombre?.trim() };
    // Lo que sale de la ficha y de las asignaciones lo mantiene la base: no se escribe desde aquí
    if (antes.personalId) {
      delete patch.nombre; delete patch.documento; delete patch.telefono; delete patch.sedeIds; delete patch.sedePrincipalId; delete patch.almacenIds; delete patch.todasLasSedes;
    }
    const desactiva = cambios.estado === 'Inactivo' && antes.estado === 'Activo';
    const activa = cambios.estado === 'Activo' && antes.estado === 'Inactivo';
    if (desactiva) patch.notaEstado = `Desactivado por ${ctx.llamante.cuenta.nombre} el ${hoyLima(ahora())}.`;
    if (activa) patch.notaEstado = null;
    if (activa) {
      const bloqueo = await db.fijarBloqueo(cuentaId, false);
      if (bloqueo) return falla(`No se pudo reactivar el acceso: ${bloqueo}`);
    }
    const fallo = await db.actualizarCuenta(cuentaId, patch);
    if (fallo) return falla(`No se pudo guardar la cuenta: ${fallo}`);
    if (desactiva) {
      const bloqueo = await db.fijarBloqueo(cuentaId, true);
      if (bloqueo) return falla(`La cuenta quedó inactiva, pero no se pudo bloquear su ingreso: ${bloqueo}`);
    }
    return ok({ cuentaId });
  }

  // reenviar
  const problema = errorReenvio(peticion.cuentaId, ctx);
  if (problema) return falla(problema);
  const cuenta = ctx.cuentas.find(c => c.id === peticion.cuentaId)!;
  const fallo = await db.enviarAcceso(cuenta.id, cuenta.correo, peticion.redirectTo);
  return fallo ? falla(`No se pudo enviar el correo: ${fallo}`) : ok({ cuentaId: cuenta.id });
}
