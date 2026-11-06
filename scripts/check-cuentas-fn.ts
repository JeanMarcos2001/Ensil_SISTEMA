/**
 * Verificación de la Edge Function `usuarios` (cuentas con invitación por correo): quién puede llamar, las reglas del servidor (permisos,
 * rol asignable, persona de Personal, lugares que salen de las asignaciones, coherencia rol ↔ lugar, correo, plazas por sede, cuenta propia,
 * último Superusuario) y el orden de las operaciones con una base en memoria que permite simular fallos en cada paso.
 * Ejecutar: npx tsx scripts/check-cuentas-fn.ts
 */
import { hoyLima, leerPeticion, manejar, type CuentasDb, type NuevaCuenta, type PatchCuenta } from '../supabase/functions/usuarios/manejador.ts';
import {
  FUNCIONES_QUE_MUEVEN_ALMACEN, errorCoherenciaRolLugar, errorCorreoPersonal, errorLugares, errorPersona, errorPlazas, funcionesDelCambio, lugaresDeAsignaciones, plazasUsadas, rolMueveAlmacen,
  type AsignacionInfo, type Contexto, type CuentaInfo, type LugarInfo, type PersonaInfo, type RolInfo,
} from '../supabase/functions/usuarios/reglas.ts';
import { capabilityById } from '../src/utils/capabilities';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

// ------------------------------------------------------------------------------------------------ Datos de partida
const roles: RolInfo[] = [
  { id: 'ROL-001', nombre: 'Superusuario', estado: 'Activo', esSistema: true, limite: null },
  { id: 'ROL-002', nombre: 'Administrador de sede', estado: 'Activo', esSistema: false, limite: 3 },
  { id: 'ROL-003', nombre: 'Psicopedagogía', estado: 'Activo', esSistema: false, limite: 3 },
  { id: 'ROL-004', nombre: 'Almacén central', estado: 'Activo', esSistema: false, limite: 1, mueveAlmacen: true },
  { id: 'ROL-005', nombre: 'Rol apagado', estado: 'Inactivo', esSistema: false, limite: null },
  { id: 'ROL-006', nombre: 'Contabilidad', estado: 'Activo', esSistema: false, limite: null },
  { id: 'ROL-007', nombre: 'Jefe de sede y almacén', estado: 'Activo', esSistema: false, limite: 1, mueveAlmacen: true },
];
const sedes: LugarInfo[] = [
  { id: 'FIL-001', nombre: 'Los Olivos', estado: 'Activo' }, { id: 'FIL-002', nombre: 'Piura', estado: 'Activo' }, { id: 'FIL-003', nombre: 'Cerrada', estado: 'Inactivo' },
];
const almacenes: LugarInfo[] = [{ id: 'ALM-001', nombre: 'Almacén central', estado: 'Activo' }, { id: 'ALM-002', nombre: 'Viejo', estado: 'Inactivo' }];

const SU = 'su-0000', ADM = 'adm-0000', SIN = 'sin-0000', OTRO = 'otro-0000';
const cuenta = (id: string, rolId: string, extra: Partial<CuentaInfo> = {}): CuentaInfo =>
  ({ id, nombre: `Cuenta ${id}`, correo: `${id}@x.com`, rolId, estado: 'Activo', todasLasSedes: false, sedeIds: [], almacenIds: [], ultimoAcceso: null, ...extra });

/** Las funciones de cada rol (el Superusuario no necesita ninguna). */
const FUNCIONES: Record<string, string[]> = {
  'ROL-002': ['org-usuarios:view', 'org-usuarios:create', 'org-usuarios:edit', 'org-usuarios:assign_role', 'org-usuarios:assign_branch', 'org-usuarios:deactivate', 'org-usuarios:reset_access'],
  'ROL-003': ['dash-resumen:view'],
  'ROL-006': ['org-alcance:all_branches', 'org-usuarios:create'],
};

// Las personas de Personal y sus asignaciones
const persona = (id: string, nombre: string, extra: Partial<PersonaInfo> = {}): PersonaInfo => ({ id, nombre, estado: 'Activo', correoPersonal: null, ...extra });
const asg = (personalId: string, lugar: string, extra: Partial<AsignacionInfo> = {}): AsignacionInfo => ({
  personalId, sedeId: lugar.startsWith('FIL') ? lugar : null, almacenId: lugar.startsWith('ALM') ? lugar : null, rolSistema: lugar.startsWith('ALM') ? 'Almacén' : 'Administración',
  esPrincipal: false, estado: 'Activa', fechaInicio: '2026-01-01', ...extra,
});
const personasBase = (): PersonaInfo[] => [
  persona('P-LAURA', 'Laura Martínez', { correoPersonal: 'laura@gmail.com' }), persona('P-ANA', 'Ana Ruiz'), persona('P-ROSA', 'Rosa Quispe'), persona('P-ROSA2', 'Rosa Dos'),
  persona('P-MIXTO', 'Marco Salas'), persona('P-MIXTO2', 'Mixto Dos'), persona('P-LIMPIEZA', 'Luz Limpieza'), persona('P-SINASIG', 'Sin Asignación'),
  persona('P-BAJA', 'Baja Total', { estado: 'Inactivo' }), persona('P-ADM', 'Admin Piura'), persona('P-SIN', 'Sin Función'), persona('P-OTRO', 'Otro Admin'),
];
const asignacionesBase = (): AsignacionInfo[] => [
  asg('P-LAURA', 'FIL-002', { esPrincipal: true }),
  asg('P-ANA', 'FIL-002', { esPrincipal: true }), asg('P-ANA', 'FIL-001', { rolSistema: 'Psicopedagogía', fechaInicio: '2026-02-01' }),
  asg('P-ROSA', 'ALM-001', { esPrincipal: true }), asg('P-ROSA2', 'ALM-001', { esPrincipal: true }),
  asg('P-MIXTO', 'FIL-001', { esPrincipal: true }), asg('P-MIXTO', 'ALM-001'), asg('P-MIXTO2', 'FIL-001', { esPrincipal: true }), asg('P-MIXTO2', 'ALM-001'),
  asg('P-LIMPIEZA', 'FIL-002', { esPrincipal: true, rolSistema: 'Sin acceso' }),
  asg('P-ADM', 'FIL-002', { esPrincipal: true }), asg('P-SIN', 'FIL-002', { esPrincipal: true }), asg('P-OTRO', 'FIL-001', { esPrincipal: true }),
  asg('P-LAURA', 'FIL-001', { estado: 'Cerrada', fechaInicio: '2025-01-01' }),
];

interface Fallos { crearCuenta?: boolean; invitar?: string; actualizar?: boolean; bloqueo?: boolean; enviar?: boolean; token?: boolean }

function memoria(inicial: CuentaInfo[], fallos: Fallos = {}, personal = personasBase(), asignaciones = asignacionesBase()) {
  const cuentas = inicial.map(c => ({ ...c, sedeIds: [...c.sedeIds], almacenIds: [...c.almacenIds] }));
  const auth = new Set(cuentas.map(c => c.id));
  const llamadas: string[] = [];
  const bloqueados = new Set<string>();
  let n = 0;
  const nuevas: NuevaCuenta[] = [];
  const db: CuentasDb = {
    async usuarioDelToken(jwt) { return fallos.token ? null : jwt === 'token-valido' ? 'su-0000' : jwt.startsWith('de:') ? jwt.slice(3) : null; },
    async cargarContexto(id) {
      const c = cuentas.find(x => x.id === id); const rol = roles.find(r => r.id === c?.rolId);
      if (!c || !rol || c.estado !== 'Activo' || rol.estado !== 'Activo') return null;
      const ctx: Contexto = { llamante: { cuenta: c, rol, funciones: FUNCIONES[rol.id] ?? [] }, roles, sedes, almacenes, cuentas, personal, asignaciones };
      return ctx;
    },
    async invitar(correo) {
      llamadas.push(`invitar:${correo}`);
      if (fallos.invitar) return { error: fallos.invitar };
      const id = `nuevo-${++n}`; auth.add(id); return { id };
    },
    async crearCuenta(c: NuevaCuenta) {
      llamadas.push('crearCuenta'); nuevas.push(c);
      if (fallos.crearCuenta) return 'error de la base de datos (23505)';
      // La base completa lo demás: de una persona, sedes y almacén salen de sus asignaciones
      const lugares = c.personalId ? lugaresDeAsignaciones(asignaciones, c.personalId) : { sedeIds: c.sedeIds, almacenIds: c.almacenIds };
      cuentas.push({ id: c.id, nombre: c.nombre, correo: c.correo, rolId: c.rolId, estado: 'Activo', todasLasSedes: c.todasLasSedes, sedeIds: lugares.sedeIds, almacenIds: lugares.almacenIds, ultimoAcceso: null, personalId: c.personalId });
      return null;
    },
    async borrarUsuarioAuth(id) { llamadas.push(`borrarAuth:${id}`); auth.delete(id); },
    async actualizarCuenta(id, p: PatchCuenta) {
      llamadas.push('actualizar');
      if (fallos.actualizar) return 'error de la base de datos (XX000)';
      const c = cuentas.find(x => x.id === id)!;
      if (p.nombre !== undefined) c.nombre = p.nombre;
      if (p.rolId !== undefined) c.rolId = p.rolId;
      if (p.estado !== undefined) c.estado = p.estado;
      if (p.todasLasSedes !== undefined) c.todasLasSedes = p.todasLasSedes;
      if (p.sedeIds !== undefined) c.sedeIds = p.sedeIds;
      if (p.almacenIds !== undefined) c.almacenIds = p.almacenIds;
      (c as CuentaInfo & { nota?: string | null }).nota = p.notaEstado;
      return null;
    },
    async fijarBloqueo(id, b) { llamadas.push(`bloqueo:${b}`); if (fallos.bloqueo) return 'no se pudo cambiar el bloqueo del usuario'; if (b) bloqueados.add(id); else bloqueados.delete(id); return null; },
    async enviarAcceso(id, correo) { llamadas.push(`enviar:${id}:${correo}`); return fallos.enviar ? 'No se pudo enviar el correo.' : null; },
    async registrarIngreso(id) { llamadas.push(`ingreso:${id}`); },
  };
  return { db, cuentas, auth, llamadas, bloqueados, nuevas };
}

/** El Superusuario (técnica, sin persona) y tres cuentas de personas: su lugar sale de sus asignaciones. */
const base = () => [
  cuenta(SU, 'ROL-001', { nombre: 'Superusuario', correo: 'su@x.com' }),
  cuenta(ADM, 'ROL-002', { nombre: 'Admin Piura', sedeIds: ['FIL-002'], personalId: 'P-ADM', documento: '111', telefono: '999' }),
  cuenta(SIN, 'ROL-003', { sedeIds: ['FIL-002'], personalId: 'P-SIN', documento: '222', telefono: '888' }),
  cuenta(OTRO, 'ROL-002', { nombre: 'Otro admin Los Olivos', sedeIds: ['FIL-001'], personalId: 'P-OTRO' }),
];
const como = (id: string) => `de:${id}`;
/** Invitar a una persona (por defecto Laura, de Piura, con el rol de Psicopedagogía). */
const invitar = (extra: Record<string, unknown> = {}) => ({ accion: 'invitar', personalId: 'P-LAURA', correo: 'Laura@Ensilperu.com', rolId: 'ROL-003', ...extra });
/** Cuenta técnica: sin persona. */
const tecnica = (extra: Record<string, unknown> = {}) => ({ accion: 'invitar', nombre: 'Soporte Técnico', correo: 'soporte@ensilperu.com', rolId: 'ROL-001', ...extra });

(async () => {
  // ------------------------------------------------------------------------------------------ Las funciones que mueven el almacén existen
  check('Todas las funciones que «mueven el almacén» existen en el registro y no son reservadas', FUNCIONES_QUE_MUEVEN_ALMACEN.every(f => !!capabilityById(f) && !capabilityById(f)!.reserved), FUNCIONES_QUE_MUEVEN_ALMACEN.filter(f => !capabilityById(f)).join());
  check('rolMueveAlmacen: basta una de ellas', rolMueveAlmacen(['log-envios:dispatch']) && rolMueveAlmacen(['dash-resumen:view', 'log-ajustes:create']) && !rolMueveAlmacen(['log-stock:view', 'log-transfer:receive', 'op-caja:view']) && !rolMueveAlmacen([]));

  // ------------------------------------------------------------------------------------------ Quién llama
  const m0 = memoria(base());
  check('Sin sesión: 401', (await manejar(null, invitar(), m0.db)).status === 401);
  check('Con una sesión que no vale (o venció): 401 y no se toca nada', (await manejar('basura', invitar(), m0.db)).status === 401 && m0.llamadas.length === 0);
  const inactiva = memoria([...base(), cuenta('baja-0000', 'ROL-002', { estado: 'Inactivo', sedeIds: ['FIL-002'] })]);
  check('Una cuenta inactiva (o sin cuenta) no puede llamar: 403', (await manejar(como('baja-0000'), invitar(), inactiva.db)).status === 403 && (await manejar(como('desconocido'), invitar(), inactiva.db)).status === 403);
  const rolApagado = memoria([...base(), cuenta('rolap-0000', 'ROL-005', { sedeIds: ['FIL-002'] })]);
  check('Tampoco la de un rol inactivo', (await manejar(como('rolap-0000'), invitar(), rolApagado.db)).status === 403);

  // ------------------------------------------------------------------------------------------ Lectura de la petición
  check('Una acción que no existe o una petición mal formada se rechazan con mensaje', !(await manejar(como(SU), { accion: 'borrarTodo' }, m0.db)).cuerpo.ok && !(await manejar(como(SU), 'texto', m0.db)).cuerpo.ok && !(await manejar(como(SU), null, m0.db)).cuerpo.ok);
  check('Sin persona hace falta el nombre; con persona solo el correo y el rol', /Faltan datos/.test((await manejar(como(SU), { accion: 'invitar', correo: 'a@b.co', rolId: 'ROL-001' }, m0.db)).cuerpo.error!)
    && /Faltan el correo y el rol/.test((await manejar(como(SU), { accion: 'invitar', personalId: 'P-LAURA' }, m0.db)).cuerpo.error!));
  check('Una persona con formato inválido se rechaza', !leerPeticion({ accion: 'invitar', personalId: 5, correo: 'a@b.co', rolId: 'ROL-002' }).peticion && !!leerPeticion({ accion: 'invitar', personalId: 'P-1', correo: 'a@b.co', rolId: 'ROL-002' }).peticion);
  check('Listas que no son listas de textos se rechazan', !leerPeticion({ accion: 'invitar', nombre: 'X', correo: 'a@b.co', rolId: 'ROL-002', sedeIds: 'FIL-001' }).peticion && !leerPeticion({ accion: 'editar', cuentaId: 'x', cambios: { almacenIds: [1] } }).peticion);
  check('Un estado inventado se rechaza', !leerPeticion({ accion: 'editar', cuentaId: 'x', cambios: { estado: 'Borrado' } }).peticion);
  check('Un redirectTo que no es http(s) se ignora', (leerPeticion({ accion: 'invitar', personalId: 'P-1', correo: 'a@b.co', rolId: 'ROL-002', redirectTo: 'javascript:alert(1)' }).peticion as { redirectTo?: string }).redirectTo === undefined);

  // ------------------------------------------------------------------------------------------ Invitar a una persona
  const m1 = memoria(base());
  const ok1 = await manejar(como(SU), invitar(), m1.db);
  const nueva = m1.cuentas.find(c => c.id === ok1.cuerpo.cuentaId);
  check('El Superusuario invita a una persona: el correo se guarda en minúsculas y la cuenta toma el nombre de la ficha', ok1.status === 200 && ok1.cuerpo.ok && nueva?.correo === 'laura@ensilperu.com' && nueva.nombre === 'Laura Martínez' && nueva.personalId === 'P-LAURA' && nueva.estado === 'Activo');
  check('Sus sedes salen de las asignaciones activas (la cerrada no cuenta) y no se mandan al guardar', nueva?.sedeIds.join() === 'FIL-002' && m1.nuevas[0].sedeIds.length === 0 && m1.nuevas[0].almacenIds.length === 0 && m1.nuevas[0].todasLasSedes === false);
  check('El orden es invitar y luego guardar la cuenta', m1.llamadas.join(',') === 'invitar:laura@ensilperu.com,crearCuenta');
  check('Una persona no tiene dos cuentas', /ya tiene una cuenta/.test((await manejar(como(SU), invitar({ correo: 'otra@ensilperu.com' }), m1.db)).cuerpo.error!) && m1.llamadas.filter(l => l.startsWith('invitar')).length === 1);
  check('Un correo repetido (aunque cambie la mayúscula) se rechaza sin invitar', (await manejar(como(SU), invitar({ personalId: 'P-ANA', correo: 'LAURA@ensilperu.com' }), m1.db)).cuerpo.error === 'Este correo ya está registrado.');
  const malos = [invitar({ personalId: 'P-ANA', correo: 'sin-arroba' }), invitar({ personalId: 'P-ANA', correo: '' })];
  const respMalos = await Promise.all(malos.map(m => manejar(como(SU), m, m1.db)));
  check('Un correo vacío o inválido se rechaza', respMalos.every(r => r.status === 200 && !r.cuerpo.ok), JSON.stringify(respMalos.map(r => r.cuerpo.error)));
  const mC = memoria(base());
  check('El correo de ingreso no puede ser el personal de la ficha (aunque cambie la mayúscula)', /correo personal de la ficha/.test((await manejar(como(SU), invitar({ correo: ' LAURA@gmail.com ' }), mC.db)).cuerpo.error!) && mC.llamadas.length === 0);
  check('errorCorreoPersonal: sin correo personal no hay nada que comparar', errorCorreoPersonal('a@b.co', { correoPersonal: null }) === null && errorCorreoPersonal('A@B.co', { correoPersonal: 'a@b.CO' }) !== null);

  // La persona
  const quien = async (personalId: string, quienLlama = SU) => (await manejar(como(quienLlama), invitar({ personalId, correo: `x${Math.random()}@ensilperu.com` }), memoria(base()).db)).cuerpo.error;
  check('La persona debe existir', /no existe en Personal/.test((await quien('P-NADIE'))!));
  check('Una persona inactiva no recibe cuenta', /está inactivo/.test((await quien('P-BAJA'))!));
  check('Una persona ya con cuenta no recibe otra', /ya tiene una cuenta/.test((await quien('P-SIN'))!));
  check('Sin ninguna asignación activa no se puede, y dice dónde crearla', /no tiene una asignación activa.*Personas → Asignaciones/.test((await quien('P-SINASIG'))!));
  check('Solo con asignaciones «Sin acceso» (limpieza) tampoco, y lo explica', /solo tiene asignaciones «Sin acceso»/.test((await quien('P-LIMPIEZA'))!));
  check('errorPersona: lo dicho a nivel de reglas', errorPersona('P-LAURA', { personal: personasBase(), cuentas: [], asignaciones: asignacionesBase() }) === null && errorPersona('P-LAURA', { personal: personasBase(), cuentas: [cuenta('x', 'ROL-003', { personalId: 'P-LAURA' })], asignaciones: asignacionesBase() }, 'x') === null);

  // El rol
  const rolErr = async (rolId: string, quienLlama = SU) => (await manejar(como(quienLlama), invitar({ rolId, correo: 'r@ensilperu.com' }), memoria(base()).db)).cuerpo.error;
  check('El rol debe existir, estar activo; el del sistema solo lo da un Superusuario', /no existe/.test((await rolErr('ROL-999'))!) && /inactivo/.test((await rolErr('ROL-005'))!) && /Solo el Superusuario/.test((await rolErr('ROL-001', ADM))!));
  check('El Superusuario sí puede dar el rol del sistema a una persona (sin las reglas del almacén)', (await manejar(como(SU), invitar({ rolId: 'ROL-001', personalId: 'P-ROSA', correo: 'otro-su@ensilperu.com' }), memoria(base()).db)).cuerpo.ok === true);

  // Permisos y alcance
  const m2 = memoria(base());
  check('Sin la función org-usuarios:create no se invita', /Su rol no tiene la función «org-usuarios:create»/.test((await manejar(como(SIN), invitar(), m2.db)).cuerpo.error!) && m2.llamadas.length === 0);
  check('Con la función y dentro de su sede sí', (await manejar(como(ADM), invitar({ correo: 'a@ensilperu.com' }), m2.db)).cuerpo.ok === true);
  check('Pero no a una persona que trabaja en una sede que su cuenta no alcanza', /«Los Olivos»: su cuenta no la alcanza/.test((await manejar(como(ADM), invitar({ personalId: 'P-ANA', correo: 'b@ensilperu.com' }), m2.db)).cuerpo.error!));
  const m2b = memoria([...base(), cuenta('cont-0000', 'ROL-006', { personalId: 'P-CONT' })], {}, [...personasBase(), persona('P-CONT', 'Contador')], [...asignacionesBase(), asg('P-CONT', 'FIL-001', { esPrincipal: true })]);
  check('Quien tiene org-alcance:all_branches sí da cuenta a personas de cualquier sede', (await manejar(como('cont-0000'), invitar({ personalId: 'P-ANA', correo: 'd@ensilperu.com' }), m2b.db)).cuerpo.ok === true);
  const m2c = memoria(base());
  check('Un administrador de sede no da cuenta a una persona del almacén (no lo alcanza)', /no trabaja en él/.test((await manejar(como(ADM), invitar({ personalId: 'P-ROSA', rolId: 'ROL-004', correo: 'e@ensilperu.com' }), m2c.db)).cuerpo.error!));

  // Coherencia rol ↔ lugar
  const mR = memoria(base());
  const rosaRol3 = await manejar(como(SU), invitar({ personalId: 'P-ROSA', rolId: 'ROL-003', correo: 'rosa1@ensilperu.com' }), mR.db);
  check('Quien trabaja en el almacén no recibe un rol que no lo mueve', !rosaRol3.cuerpo.ok && /trabaja en el almacén.*«Psicopedagogía» no las tiene/.test(rosaRol3.cuerpo.error!), rosaRol3.cuerpo.error);
  const lauraRol4 = await manejar(como(SU), invitar({ personalId: 'P-LAURA', rolId: 'ROL-004', correo: 'laura4@ensilperu.com' }), mR.db);
  check('Un rol que mueve el almacén exige una asignación al almacén', !lauraRol4.cuerpo.ok && /mueve el almacén.*asignación al almacén en Personas → Asignaciones/.test(lauraRol4.cuerpo.error!), lauraRol4.cuerpo.error);
  const rosaOk = await manejar(como(SU), invitar({ personalId: 'P-ROSA', rolId: 'ROL-004', correo: 'rosa@ensilperu.com' }), mR.db);
  const rosa = mR.cuentas.find(c => c.id === rosaOk.cuerpo.cuentaId);
  check('La almacenera con el rol de almacén sí: queda con almacén y sin sede', rosaOk.cuerpo.ok === true && rosa?.almacenIds.join() === 'ALM-001' && rosa.sedeIds.length === 0, rosaOk.cuerpo.error);
  const mixtoOk = await manejar(como(SU), invitar({ personalId: 'P-MIXTO', rolId: 'ROL-007', correo: 'marco@ensilperu.com' }), mR.db);
  check('Quien trabaja en una sede Y en el almacén necesita un rol que mueva el almacén (y queda con las dos cosas)', mixtoOk.cuerpo.ok === true && mR.cuentas.find(c => c.id === mixtoOk.cuerpo.cuentaId)?.sedeIds.join() === 'FIL-001' && mR.cuentas.find(c => c.id === mixtoOk.cuerpo.cuentaId)?.almacenIds.join() === 'ALM-001');
  check('El mismo mixto con un rol que no mueve el almacén se rechaza', /trabaja en el almacén/.test((await manejar(como(SU), invitar({ personalId: 'P-MIXTO2', rolId: 'ROL-002', correo: 'mixto2@ensilperu.com' }), mR.db)).cuerpo.error!));
  check('errorCoherenciaRolLugar: el rol del sistema no tiene restricción', errorCoherenciaRolLugar({ nombre: 'Superusuario', esSistema: true }, { almacenIds: ['ALM-001'] }) === null && errorCoherenciaRolLugar({ nombre: 'X', esSistema: true, mueveAlmacen: true }, { almacenIds: [] }) === null);
  check('errorCoherenciaRolLugar: sede sin movers y almacén con movers son coherentes', errorCoherenciaRolLugar({ nombre: 'A', esSistema: false }, { almacenIds: [] }) === null && errorCoherenciaRolLugar({ nombre: 'B', esSistema: false, mueveAlmacen: true }, { almacenIds: ['ALM-001'] }) === null);

  // Plazas
  const mP = memoria(base());
  await manejar(como(SU), invitar({ personalId: 'P-ROSA', rolId: 'ROL-004', correo: 'a1@ensilperu.com' }), mP.db);
  const llena = await manejar(como(SU), invitar({ personalId: 'P-ROSA2', rolId: 'ROL-004', correo: 'a2@ensilperu.com' }), mP.db);
  check('El límite del rol por almacén se respeta (1 cuenta de Almacén central por almacén)', !llena.cuerpo.ok && /admite hasta 1 cuenta activa por sede o almacén y el almacén ya tiene 1/.test(llena.cuerpo.error!), llena.cuerpo.error);
  const mP2 = memoria(base());
  await manejar(como(SU), invitar({ personalId: 'P-MIXTO', rolId: 'ROL-007', correo: 'm1@ensilperu.com' }), mP2.db);
  check('Y por sede, nombrando la sede', /«Los Olivos» ya tiene 1/.test((await manejar(como(SU), invitar({ personalId: 'P-MIXTO2', rolId: 'ROL-007', correo: 'm2@ensilperu.com' }), mP2.db)).cuerpo.error!));
  const mP3 = memoria(base());
  const idM = (await manejar(como(SU), invitar({ personalId: 'P-MIXTO', rolId: 'ROL-007', correo: 'm3@ensilperu.com' }), mP3.db)).cuerpo.cuentaId!;
  mP3.cuentas.find(c => c.id === idM)!.estado = 'Inactivo';
  check('Una cuenta inactiva no ocupa plaza', (await manejar(como(SU), invitar({ personalId: 'P-MIXTO2', rolId: 'ROL-007', correo: 'm4@ensilperu.com' }), mP3.db)).cuerpo.ok === true);

  // Cuenta técnica
  const mT = memoria(base());
  const tec = await manejar(como(SU), tecnica(), mT.db);
  check('El Superusuario crea una cuenta técnica (sin persona) con un rol del sistema, sin exigir sede', tec.cuerpo.ok === true && !mT.cuentas.find(c => c.id === tec.cuerpo.cuentaId)?.personalId && mT.nuevas[0].personalId === undefined && mT.nuevas[0].nombre === 'Soporte Técnico');
  check('Sin persona solo se admite un rol del sistema', /solo puede tener un rol del sistema/.test((await manejar(como(SU), tecnica({ rolId: 'ROL-002', correo: 't2@ensilperu.com' }), mT.db)).cuerpo.error!));
  check('Solo un Superusuario crea cuentas sin persona', /Solo un Superusuario crea una cuenta sin persona/.test((await manejar(como(ADM), tecnica({ correo: 't3@ensilperu.com' }), mT.db)).cuerpo.error!) && /Solo un Superusuario crea una cuenta sin persona/.test((await manejar(como(ADM), tecnica({ rolId: 'ROL-002', correo: 't4@ensilperu.com' }), mT.db)).cuerpo.error!));
  check('Una cuenta técnica pide nombre y un correo válido', !(await manejar(como(SU), tecnica({ nombre: '  ', correo: 't5@ensilperu.com' }), mT.db)).cuerpo.ok && !(await manejar(como(SU), tecnica({ correo: 'sin-arroba' }), mT.db)).cuerpo.ok);

  // Compensación
  const f1 = memoria(base(), { crearCuenta: true });
  const r1 = await manejar(como(SU), invitar(), f1.db);
  check('Si falla guardar la cuenta, se borra el usuario creado en Auth: nunca queda un usuario sin cuenta', !r1.cuerpo.ok && /No se pudo crear la cuenta/.test(r1.cuerpo.error!) && f1.llamadas.some(l => l.startsWith('borrarAuth:nuevo-')) && ![...f1.auth].some(id => id.startsWith('nuevo-')));
  const f2 = memoria(base(), { invitar: 'Este correo ya tiene un usuario en el sistema de acceso.' });
  const r2 = await manejar(como(SU), invitar(), f2.db);
  check('Si Auth rechaza la invitación (correo ya usado, límite de correos) no se crea nada', !r2.cuerpo.ok && /ya tiene un usuario/.test(r2.cuerpo.error!) && !f2.llamadas.includes('crearCuenta'));

  // ------------------------------------------------------------------------------------------ Editar
  const edit = (id: string, cambios: Record<string, unknown>, quienLlama = SU) => ({ quien: quienLlama, cuerpo: { accion: 'editar', cuentaId: id, cambios } });
  const run = async (db: CuentasDb, e: { quien: string; cuerpo: unknown }, ahora = () => new Date('2026-11-05T15:00:00Z')) => manejar(como(e.quien), e.cuerpo, db, ahora);

  const e1 = memoria(base());
  check('Una cuenta que no existe da un mensaje claro', (await run(e1.db, edit('nadie', { nombre: 'X' }))).cuerpo.error === 'No se encontró la cuenta.');
  check('El nombre, el documento y el teléfono de una cuenta de persona no se editan aquí: salen de la ficha', /salen de la ficha.*Personas → Personal/.test((await run(e1.db, edit(SIN, { nombre: 'Ana Pérez' }))).cuerpo.error!)
    && /salen de la ficha/.test((await run(e1.db, edit(SIN, { documento: '999' }))).cuerpo.error!) && /salen de la ficha/.test((await run(e1.db, edit(SIN, { telefono: '111' }))).cuerpo.error!));
  check('Mandar los mismos datos que ya tiene no es un cambio', (await run(e1.db, edit(SIN, { documento: '222', telefono: '888' }))).cuerpo.ok === true);
  check('Las sedes y el almacén salen de las asignaciones: no se cambian desde la cuenta', /Personas → Asignaciones/.test((await run(e1.db, edit(SIN, { sedeIds: ['FIL-001'] }))).cuerpo.error!) && /Personas → Asignaciones/.test((await run(e1.db, edit(SIN, { almacenIds: ['ALM-001'] }))).cuerpo.error!)
    && /Personas → Asignaciones/.test((await run(e1.db, edit(SIN, { todasLasSedes: true }))).cuerpo.error!));
  check('Pero mandar las mismas sedes que ya tiene no es un cambio', (await run(e1.db, edit(SIN, { sedeIds: ['FIL-002'] }))).cuerpo.ok === true);
  check('En una cuenta técnica (sin persona) sí se edita el nombre', (await run(e1.db, edit(SU, { nombre: 'Soporte' }))).cuerpo.ok === true && e1.cuentas.find(c => c.id === SU)!.nombre === 'Soporte');

  // Rol y coherencia al editar
  const e2 = memoria(base());
  check('Cambiar el rol a uno coherente con su lugar de trabajo: ADM lo hace con «Asignar rol»', (await run(e2.db, edit(SIN, { rolId: 'ROL-006' }, ADM))).cuerpo.ok === true);
  check('Pero no a un rol que mueve el almacén si la persona no trabaja en él', /mueve el almacén/.test((await run(memoria(base()).db, edit(SIN, { rolId: 'ROL-004' }))).cuerpo.error!));
  const eAlm = memoria([...base(), cuenta('rosa-0000', 'ROL-004', { almacenIds: ['ALM-001'], personalId: 'P-ROSA' })]);
  check('Ni quitarle el rol de almacén a quien trabaja en el almacén', /trabaja en el almacén/.test((await run(eAlm.db, edit('rosa-0000', { rolId: 'ROL-003' }))).cuerpo.error!));
  const soloEditar = memoria([...base(), cuenta('ed-0000', 'ROL-003', { personalId: 'P-ED', sedeIds: ['FIL-002'] })], {}, [...personasBase(), persona('P-ED', 'Editor')], [...asignacionesBase(), asg('P-ED', 'FIL-002', { esPrincipal: true })]);
  FUNCIONES['ROL-003'] = ['org-usuarios:edit'];
  check('Con solo «editar» no se cambia el rol ni el estado', /assign_role/.test((await run(soloEditar.db, edit(SIN, { rolId: 'ROL-006' }, 'ed-0000'))).cuerpo.error!) && /deactivate/.test((await run(soloEditar.db, edit(SIN, { estado: 'Inactivo' }, 'ed-0000'))).cuerpo.error!));
  FUNCIONES['ROL-003'] = ['dash-resumen:view'];

  const e3 = memoria(base());
  check('Nadie cambia su propio rol ni su propio estado', /su propia cuenta/.test((await run(e3.db, edit(ADM, { rolId: 'ROL-006' }, ADM))).cuerpo.error!) && /su propia cuenta/.test((await run(e3.db, edit(ADM, { estado: 'Inactivo' }, ADM))).cuerpo.error!));
  check('Solo un Superusuario modifica una cuenta de Superusuario', /Solo un Superusuario puede modificar/.test((await run(e3.db, edit(SU, { nombre: 'Hack' }, ADM))).cuerpo.error!));
  check('Ni el único Superusuario se desactiva a sí mismo', /su propia cuenta/.test((await run(e3.db, edit(SU, { estado: 'Inactivo' }, SU))).cuerpo.error!));
  const dosSu = memoria([...base(), cuenta('su2-0000', 'ROL-001', { nombre: 'Segundo Su' })]);
  check('Con otro Superusuario activo, sí se puede desactivar a uno', (await run(dosSu.db, edit('su2-0000', { estado: 'Inactivo' }))).cuerpo.ok === true);
  check('Editar una cuenta de Superusuario (sin sedes) no exige sede mientras no se toquen los lugares', (await run(dosSu.db, edit('su2-0000', { nombre: 'Segundo Superusuario' }))).cuerpo.ok === true);

  // Desactivar y activar
  const e4 = memoria(base());
  const des = await run(e4.db, edit(SIN, { estado: 'Inactivo' }), () => new Date('2026-11-06T03:30:00Z'));
  check('Desactivar: primero el estado y la constancia, después el bloqueo en Auth', des.cuerpo.ok === true && e4.llamadas.join(',') === 'actualizar,bloqueo:true' && e4.bloqueados.has(SIN)
    && (e4.cuentas.find(c => c.id === SIN) as CuentaInfo & { nota?: string }).nota === 'Desactivado por Superusuario el 2026-11-05.', JSON.stringify(e4.llamadas));
  check('La fecha de la constancia es la de Lima (no la del servidor)', hoyLima(new Date('2026-11-06T03:30:00Z')) === '2026-11-05' && hoyLima(new Date('2026-11-06T06:00:00Z')) === '2026-11-06');
  const act = await run(e4.db, edit(SIN, { estado: 'Activo' }));
  check('Activar: primero se quita el bloqueo y después el estado, y se borra la constancia', act.cuerpo.ok === true && e4.llamadas.slice(-2).join(',') === 'bloqueo:false,actualizar' && !e4.bloqueados.has(SIN)
    && (e4.cuentas.find(c => c.id === SIN) as CuentaInfo & { nota?: string | null }).nota === null);
  const f3 = memoria(base(), { bloqueo: true });
  const rf3 = await run(f3.db, edit(SIN, { estado: 'Inactivo' }));
  check('Si falla el bloqueo al desactivar, la cuenta ya quedó inactiva y se avisa', !rf3.cuerpo.ok && /quedó inactiva/.test(rf3.cuerpo.error!) && f3.cuentas.find(c => c.id === SIN)!.estado === 'Inactivo');
  const inactivaSin = () => base().map(c => c.id === SIN ? { ...c, estado: 'Inactivo' as const } : c);
  const f4 = memoria(inactivaSin(), { bloqueo: true });
  const rf4 = await run(f4.db, edit(SIN, { estado: 'Activo' }));
  check('Si falla quitar el bloqueo al activar, la cuenta sigue inactiva (no se abre un acceso a medias)', !rf4.cuerpo.ok && f4.cuentas.find(c => c.id === SIN)!.estado === 'Inactivo' && !f4.llamadas.includes('actualizar'));
  const f5 = memoria(base(), { actualizar: true });
  check('Si falla guardar, se informa sin bloquear a nadie', !(await run(f5.db, edit(SIN, { estado: 'Inactivo' }))).cuerpo.ok && !f5.llamadas.includes('bloqueo:true'));
  // Activar exige a la persona activa y con asignación
  const pBaja = memoria(inactivaSin(), {}, personasBase().map(p => p.id === 'P-SIN' ? { ...p, estado: 'Inactivo' as const } : p));
  check('No se activa la cuenta de una persona inactiva', /está inactivo.*Personas → Personal/.test((await run(pBaja.db, edit(SIN, { estado: 'Activo' }))).cuerpo.error!));
  const sinAsig = memoria(inactivaSin(), {}, personasBase(), asignacionesBase().filter(a => a.personalId !== 'P-SIN'));
  check('Ni la de una persona sin asignación activa con acceso', /no tiene una asignación activa/.test((await run(sinAsig.db, edit(SIN, { estado: 'Activo' }))).cuerpo.error!));
  // Plazas al activar y al conservar
  const dosAlm = memoria([...base(), cuenta('a-1', 'ROL-004', { almacenIds: ['ALM-001'], personalId: 'P-ROSA' }), cuenta('a-2', 'ROL-004', { almacenIds: ['ALM-001'], personalId: 'P-ROSA2', estado: 'Inactivo' })]);
  check('Reactivar una cuenta pide plaza de nuevo', /ya tiene 1/.test((await run(dosAlm.db, edit('a-2', { estado: 'Activo' }))).cuerpo.error!));
  const bajaronLimite = memoria([...base(), cuenta('a-1', 'ROL-004', { almacenIds: ['ALM-001'], personalId: 'P-ROSA' }), cuenta('a-3', 'ROL-004', { almacenIds: ['ALM-001'], personalId: 'P-ROSA2' })]);
  check('A quien ya ocupaba su plaza no se le quita porque el límite bajó después', (await run(bajaronLimite.db, edit('a-3', { rolId: 'ROL-004' }))).cuerpo.ok === true);

  // funciones por cambio y reglas sueltas
  check('Enviar el mismo documento y teléfono que ya tiene la cuenta no pide «editar»', funcionesDelCambio({ documento: ' 123 ', telefono: '999', rolId: 'ROL-002' }, cuenta(SIN, 'ROL-003', { documento: '123', telefono: '999' })).join() === 'org-usuarios:assign_role'
    && funcionesDelCambio({ documento: '', telefono: '' }, cuenta(SIN, 'ROL-003')).length === 0 && funcionesDelCambio({ telefono: '111' }, cuenta(SIN, 'ROL-003', { telefono: '999' })).join() === 'org-usuarios:edit');
  check('funcionesDelCambio: solo pide lo que de verdad cambia', funcionesDelCambio({ nombre: 'Cuenta sin-0000', estado: 'Activo', rolId: 'ROL-003', sedeIds: ['FIL-002'] }, cuenta(SIN, 'ROL-003', { sedeIds: ['FIL-002'] })).length === 0
    && funcionesDelCambio({ estado: 'Inactivo' }, cuenta(SIN, 'ROL-003')).join() === 'org-usuarios:deactivate'
    && funcionesDelCambio({ estado: 'Activo' }, cuenta(SIN, 'ROL-003', { estado: 'Inactivo' })).join() === 'org-usuarios:edit');
  check('plazasUsadas y errorPlazas sin límite no estorban', plazasUsadas('ROL-006', [cuenta('x', 'ROL-006', { sedeIds: ['FIL-001'] })], { tipo: 'sede', id: 'FIL-001' }) === 1 && errorPlazas(roles[5], [], sedes, { estado: 'Activo', sedeIds: ['FIL-001'], almacenIds: [] }) === null);
  const llam = { cuenta: cuenta(SU, 'ROL-001'), rol: roles[0], funciones: [] };
  check('Una sede que la cuenta ya tenía y se desactivó después no estorba; una nueva inactiva sí', errorLugares(llam, sedes, almacenes, { sedeIds: ['FIL-003'], almacenIds: [], todasLasSedes: false }, { sedeIds: ['FIL-003'], almacenIds: [], todasLasSedes: false }) === null
    && /inactiva/.test(errorLugares(llam, sedes, almacenes, { sedeIds: ['FIL-003'], almacenIds: [], todasLasSedes: false })!));

  // lugares derivados de las asignaciones
  const asigs: AsignacionInfo[] = [
    asg('P1', 'FIL-002', { fechaInicio: '2026-03-01' }), asg('P1', 'FIL-001', { esPrincipal: true, fechaInicio: '2026-05-01' }), asg('P1', 'ALM-001'), asg('P1', 'FIL-003', { rolSistema: 'Sin acceso' }),
    asg('P1', 'FIL-002', { estado: 'Cerrada' }), asg('P2', 'FIL-002'),
  ];
  const lug = lugaresDeAsignaciones(asigs, 'P1');
  check('Los lugares de la cuenta salen de las asignaciones activas con acceso; la principal es la de su asignación principal', lug.sedeIds.join() === 'FIL-001,FIL-002' && lug.sedePrincipalId === 'FIL-001' && lug.almacenIds.join() === 'ALM-001');
  check('Sin asignación principal, la principal es la sede más antigua; sin asignaciones con acceso, no hay lugares', lugaresDeAsignaciones([asg('P1', 'FIL-002', { fechaInicio: '2026-03-01' }), asg('P1', 'FIL-001', { fechaInicio: '2026-01-01' })], 'P1').sedePrincipalId === 'FIL-001'
    && lugaresDeAsignaciones([asg('P1', 'FIL-002', { rolSistema: 'Sin acceso' })], 'P1').sedeIds.length === 0);
  check('Solo asignaciones al almacén: no hay sede principal', lugaresDeAsignaciones([asg('P1', 'ALM-001')], 'P1').sedePrincipalId === undefined);

  // ------------------------------------------------------------------------------------------ Reenviar e ingreso
  const r3 = memoria(base());
  const env = await manejar(como(ADM), { accion: 'reenviar', cuentaId: SIN, redirectTo: 'http://localhost:3000' }, r3.db);
  check('Reenviar el acceso (con la función reset_access) llama al envío con el id y el correo de la cuenta', env.cuerpo.ok === true && r3.llamadas.join() === `enviar:${SIN}:${SIN}@x.com`);
  check('Sin reset_access no se reenvía', /reset_access/.test((await manejar(como(SIN), { accion: 'reenviar', cuentaId: SIN }, r3.db)).cuerpo.error!));
  check('Una cuenta inactiva no recibe el acceso hasta activarla', /inactiva/.test((await manejar(como(SU), { accion: 'reenviar', cuentaId: 'baja' }, memoria([...base(), cuenta('baja', 'ROL-003', { estado: 'Inactivo' })]).db)).cuerpo.error!));
  check('Solo un Superusuario reenvía el acceso de un Superusuario', /Solo un Superusuario/.test((await manejar(como(ADM), { accion: 'reenviar', cuentaId: SU }, r3.db)).cuerpo.error!));
  check('Si el correo no sale (límite, error de Auth) se informa', /No se pudo enviar/.test((await manejar(como(SU), { accion: 'reenviar', cuentaId: SIN }, memoria(base(), { enviar: true }).db)).cuerpo.error!));
  const ing = memoria(base());
  check('El ingreso anota el último acceso de quien llama y no pide permisos', (await manejar(como(SIN), { accion: 'ingreso' }, ing.db)).cuerpo.ok === true && ing.llamadas.join() === `ingreso:${SIN}`);

  if (failed > 0) {
    console.log(`\n${failed} comprobaciones fallaron.`);
    process.exit(1);
  }
  console.log('\nTodas las comprobaciones pasaron.');
})();
