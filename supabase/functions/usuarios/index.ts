/**
 * Edge Function `usuarios`: crear, editar y reenviar el acceso de las cuentas del sistema. Es la ÚNICA vía para escribir en `cuentas`,
 * `cuenta_sedes` y `cuenta_almacenes` (el navegador solo puede leerlas) y para crear usuarios en Auth.
 *
 * Corre con la clave de servicio (`SUPABASE_SERVICE_ROLE_KEY`, que Supabase inyecta sola en la función; nunca llega al navegador), pero
 * antes de hacer nada identifica a quien llama por su token y aplica `reglas.ts`. La lógica está en `manejador.ts`; aquí solo se conecta
 * con Supabase. Desplegada con verificación de JWT activada.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { manejar, type CuentasDb, type NuevaCuenta, type PatchCuenta } from './manejador.ts';
import { FUNCIONES_QUE_MUEVEN_ALMACEN, type AsignacionInfo, type Contexto, type CuentaInfo, type Estado, type LugarInfo, type PersonaInfo, type RolInfo } from './reglas.ts';

const URL_BASE = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const admin = createClient(URL_BASE, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const publico = createClient(URL_BASE, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Texto de un error de Auth sin detalles técnicos. */
function textoAuth(error: { message?: string; status?: number } | null): string {
  const t = (error?.message ?? '').toLowerCase();
  if (t.includes('already been registered') || t.includes('already registered') || t.includes('email_exists')) return 'Este correo ya tiene un usuario en el sistema de acceso.';
  if (error?.status === 429 || t.includes('rate limit')) return 'Se superó el límite de correos por hora: espere un momento e intente de nuevo.';
  if (t.includes('invalid') && t.includes('email')) return 'El correo no es válido.';
  return 'No se pudo enviar el correo.';
}

/** Los avisos de los disparadores propios (código EN001) ya vienen en español y se muestran tal cual; el resto no revela nada técnico. */
const fallo = (e: { code?: string; message?: string } | null): string | null => (e ? (e.code === 'EN001' && e.message ? e.message : `error de la base de datos (${e.code ?? 'sin código'})`) : null);

const db: CuentasDb = {
  async usuarioDelToken(jwt) {
    const { data, error } = await admin.auth.getUser(jwt);
    return error || !data.user ? null : data.user.id;
  },

  async cargarContexto(llamanteId) {
    const [cuentas, sedesRel, almacenesRel, roles, sedes, almacenes, personal, asignaciones, movers] = await Promise.all([
      admin.from('cuentas').select('id, nombre, correo, rol_id, estado, todas_las_sedes, ultimo_acceso, documento, telefono, personal_id'),
      admin.from('cuenta_sedes').select('cuenta_id, sede_id'),
      admin.from('cuenta_almacenes').select('cuenta_id, almacen_id'),
      admin.from('roles').select('id, nombre, estado, es_sistema, limite_cuentas_por_sede'),
      admin.from('sedes').select('id, nombre, estado'),
      admin.from('almacenes').select('id, nombre, estado'),
      admin.from('personal').select('id, nombres, apellido_paterno, estado, correo_personal'),
      admin.from('asignaciones').select('personal_id, sede_id, almacen_id, con_acceso, es_principal, estado, fecha_inicio').eq('estado', 'Activa'),
      // Qué roles tienen alguna función que mueve el almacén (solo esas filas: son pocas)
      admin.from('rol_funciones').select('rol_id').in('funcion_id', [...FUNCIONES_QUE_MUEVEN_ALMACEN]),
    ]);
    if (cuentas.error || sedesRel.error || almacenesRel.error || roles.error || sedes.error || almacenes.error || personal.error || asignaciones.error || movers.error) throw new Error('No se pudo leer la base de datos.');

    const conMovers = new Set(movers.data.map(m => m.rol_id));
    const infoRoles: RolInfo[] = roles.data.map(r => ({ id: r.id, nombre: r.nombre, estado: r.estado as Estado, esSistema: r.es_sistema, limite: r.limite_cuentas_por_sede, mueveAlmacen: conMovers.has(r.id) }));
    const infoPersonal: PersonaInfo[] = personal.data.map(p => ({ id: p.id, nombre: `${p.nombres} ${p.apellido_paterno}`.trim(), estado: p.estado as Estado, correoPersonal: p.correo_personal }));
    const infoAsignaciones: AsignacionInfo[] = asignaciones.data.map(a => ({
      personalId: a.personal_id, sedeId: a.sede_id, almacenId: a.almacen_id, conAcceso: a.con_acceso, esPrincipal: a.es_principal, estado: a.estado as 'Activa' | 'Cerrada', fechaInicio: a.fecha_inicio,
    }));
    const infoCuentas: CuentaInfo[] = cuentas.data.map(c => ({
      id: c.id, nombre: c.nombre, correo: c.correo, rolId: c.rol_id, estado: c.estado as Estado, todasLasSedes: c.todas_las_sedes, ultimoAcceso: c.ultimo_acceso, documento: c.documento, telefono: c.telefono, personalId: c.personal_id,
      sedeIds: sedesRel.data.filter(x => x.cuenta_id === c.id).map(x => x.sede_id),
      almacenIds: almacenesRel.data.filter(x => x.cuenta_id === c.id).map(x => x.almacen_id),
    }));
    const cuenta = infoCuentas.find(c => c.id === llamanteId);
    const rol = cuenta ? infoRoles.find(r => r.id === cuenta.rolId) : undefined;
    if (!cuenta || !rol || cuenta.estado !== 'Activo' || rol.estado !== 'Activo') return null;

    const funciones = await admin.from('rol_funciones').select('funcion_id').eq('rol_id', rol.id);
    if (funciones.error) throw new Error('No se pudo leer la base de datos.');
    const lugares = (filas: { id: string; nombre: string; estado: string }[]): LugarInfo[] => filas.map(f => ({ id: f.id, nombre: f.nombre, estado: f.estado as Estado }));
    const ctx: Contexto = {
      llamante: { cuenta, rol, funciones: funciones.data.map(f => f.funcion_id) },
      roles: infoRoles, sedes: lugares(sedes.data), almacenes: lugares(almacenes.data), cuentas: infoCuentas, personal: infoPersonal, asignaciones: infoAsignaciones,
    };
    return ctx;
  },

  async invitar(correo, redirectTo) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(correo, redirectTo ? { redirectTo } : undefined);
    if (error || !data.user) return { error: textoAuth(error) };
    return { id: data.user.id };
  },

  async crearCuenta(c: NuevaCuenta) {
    // De una persona, la base completa nombre, documento, teléfono, sedes y almacén (disparadores): aquí no se mandan
    const cuenta = await admin.from('cuentas').insert({
      id: c.id, nombre: c.nombre, correo: c.correo, rol_id: c.rolId, estado: 'Activo', todas_las_sedes: c.todasLasSedes, personal_id: c.personalId ?? null,
      documento: c.documento ?? null, telefono: c.telefono ?? null,
    });
    if (cuenta.error) return fallo(cuenta.error);
    if (c.sedeIds.length > 0) {
      const sedes = await admin.from('cuenta_sedes').insert(c.sedeIds.map(sede_id => ({ cuenta_id: c.id, sede_id, es_principal: sede_id === c.sedePrincipalId })));
      if (sedes.error) { await admin.from('cuentas').delete().eq('id', c.id); return fallo(sedes.error); }
    }
    if (c.almacenIds.length > 0) {
      const almacenes = await admin.from('cuenta_almacenes').insert(c.almacenIds.map(almacen_id => ({ cuenta_id: c.id, almacen_id })));
      if (almacenes.error) { await admin.from('cuentas').delete().eq('id', c.id); return fallo(almacenes.error); }
    }
    return null;
  },

  async borrarUsuarioAuth(id) {
    await admin.auth.admin.deleteUser(id);
  },

  async actualizarCuenta(id, p: PatchCuenta) {
    const cambios: Record<string, unknown> = {};
    if (p.nombre !== undefined) cambios.nombre = p.nombre;
    if (p.rolId !== undefined) cambios.rol_id = p.rolId;
    if (p.estado !== undefined) cambios.estado = p.estado;
    if (p.notaEstado !== undefined) cambios.nota_estado = p.notaEstado;
    if (p.todasLasSedes !== undefined) cambios.todas_las_sedes = p.todasLasSedes;
    if (p.documento !== undefined) cambios.documento = p.documento || null;
    if (p.telefono !== undefined) cambios.telefono = p.telefono || null;
    if (Object.keys(cambios).length > 0) {
      const r = await admin.from('cuentas').update(cambios).eq('id', id);
      if (r.error) return fallo(r.error);
    }
    // Las sedes y almacenes se reemplazan: primero se quitan y luego se agregan, así un fallo deja MENOS acceso, nunca más.
    if (p.sedeIds !== undefined || p.sedePrincipalId !== undefined) {
      let sedeIds = p.sedeIds;
      if (sedeIds === undefined) {
        const actuales = await admin.from('cuenta_sedes').select('sede_id').eq('cuenta_id', id);
        if (actuales.error) return fallo(actuales.error);
        sedeIds = actuales.data.map(x => x.sede_id);
      }
      const borradas = await admin.from('cuenta_sedes').delete().eq('cuenta_id', id);
      if (borradas.error) return fallo(borradas.error);
      if (sedeIds.length > 0) {
        const principal = p.sedePrincipalId ?? sedeIds[0];
        const nuevas = await admin.from('cuenta_sedes').insert(sedeIds.map(sede_id => ({ cuenta_id: id, sede_id, es_principal: sede_id === principal })));
        if (nuevas.error) return fallo(nuevas.error);
      }
    }
    if (p.almacenIds !== undefined) {
      const borrados = await admin.from('cuenta_almacenes').delete().eq('cuenta_id', id);
      if (borrados.error) return fallo(borrados.error);
      if (p.almacenIds.length > 0) {
        const nuevos = await admin.from('cuenta_almacenes').insert(p.almacenIds.map(almacen_id => ({ cuenta_id: id, almacen_id })));
        if (nuevos.error) return fallo(nuevos.error);
      }
    }
    return null;
  },

  async fijarBloqueo(id, bloqueado) {
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: bloqueado ? '876000h' : 'none' });
    return error ? 'no se pudo cambiar el bloqueo del usuario' : null;
  },

  async enviarAcceso(id, correo, redirectTo) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error || !data.user) return 'no se encontró al usuario en el sistema de acceso';
    if (!data.user.email_confirmed_at) {
      const r = await admin.auth.admin.inviteUserByEmail(correo, redirectTo ? { redirectTo } : undefined);
      return r.error ? textoAuth(r.error) : null;
    }
    const r = await publico.auth.resetPasswordForEmail(correo, redirectTo ? { redirectTo } : undefined);
    return r.error ? textoAuth(r.error) : null;
  },

  async registrarIngreso(id) {
    await admin.from('cuentas').update({ ultimo_acceso: new Date().toISOString() }).eq('id', id);
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const responder = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return responder(405, { ok: false, error: 'Método no permitido.' });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim() || null;
  let cuerpo: unknown = null;
  try { cuerpo = await req.json(); } catch { /* sin cuerpo válido: el manejador responde que falta el formato */ }
  try {
    const r = await manejar(jwt, cuerpo, db);
    return responder(r.status, r.cuerpo);
  } catch {
    return responder(500, { ok: false, error: 'No se pudo completar la operación. Intente de nuevo.' });
  }
});
