/**
 * Reglas de las cuentas de usuario que aplica el servidor (Edge Function `usuarios`). Son funciones PURAS (sin Deno, sin red): reciben lo
 * que hay en la base y devuelven el mensaje de error, o `null` si se puede.
 *
 * Por qué están aquí y no solo en la pantalla: la pantalla oculta botones y avisa antes de enviar, pero cualquiera con una sesión puede
 * llamar a la función por su cuenta. Lo que protege de verdad es esto:
 *  - quién llama necesita la función que corresponde (`org-usuarios:*`); el Superusuario puede todo;
 *  - el rol debe existir y estar activo, y el del sistema (Superusuario) solo lo da un Superusuario;
 *  - solo se asignan sedes y almacenes que existen, están activos y que quien llama alcanza (a menos que alcance todas las sedes);
 *  - se respeta el límite de cuentas por sede o almacén del rol;
 *  - nadie cambia el rol ni el estado de su propia cuenta; nunca se queda el sistema sin un Superusuario activo;
 *  - solo un Superusuario modifica una cuenta de Superusuario;
 *  - **una cuenta nace de una persona de Personal** (una persona, una cuenta); solo el Superusuario puede existir sin persona;
 *  - **las sedes y el almacén de la cuenta salen de las asignaciones activas de la persona** (no se eligen en la cuenta);
 *  - el rol del sistema (Superusuario) es solo para cuentas técnicas, sin persona;
 *  - coherencia rol ↔ lugar: un rol que mueve el almacén exige trabajar en él, y quien trabaja en el almacén necesita un rol que lo mueva;
 *  - el correo de ingreso nunca es el correo personal de la ficha.
 * Este archivo también lo usa la pantalla (para avisar antes de enviar): así hay UNA sola definición de estas reglas.
 * Los mensajes siguen el estilo de `src/utils/roleBuilder.ts` y `src/utils/session.ts`.
 */

export type Estado = 'Activo' | 'Inactivo';

export interface RolInfo { id: string; nombre: string; estado: Estado; esSistema: boolean; limite: number | null; /** El rol tiene alguna función que mueve el almacén. */ mueveAlmacen?: boolean }
export interface LugarInfo { id: string; nombre: string; estado: Estado }
export interface CuentaInfo {
  id: string; nombre: string; correo: string; rolId: string; estado: Estado; todasLasSedes: boolean;
  sedeIds: string[]; almacenIds: string[]; ultimoAcceso: string | null; documento?: string | null; telefono?: string | null;
  /** Persona de Personal de la que nace la cuenta (solo las cuentas del sistema no la tienen). */
  personalId?: string | null;
}
export interface PersonaInfo { id: string; nombre: string; estado: Estado; correoPersonal: string | null }
export interface AsignacionInfo {
  personalId: string; sedeId: string | null; almacenId: string | null; /** La persona necesita acceso al sistema en este lugar de trabajo. */ conAcceso: boolean;
  esPrincipal: boolean; estado: 'Activa' | 'Cerrada'; fechaInicio: string;
}
/** Quien llama: su cuenta, su rol y las funciones que ese rol tiene guardadas. */
export interface Llamante { cuenta: CuentaInfo; rol: RolInfo; funciones: string[] }

/** Todo lo que hay en la base y que las reglas necesitan mirar (son pocos datos: se leen completos en cada llamada). */
export interface Contexto {
  llamante: Llamante; roles: RolInfo[]; sedes: LugarInfo[]; almacenes: LugarInfo[]; cuentas: CuentaInfo[]; personal: PersonaInfo[]; asignaciones: AsignacionInfo[];
}

export interface SolicitudInvitar {
  /** La persona de Personal de la que nace la cuenta. Sin ella (cuenta técnica) solo se admite un rol del sistema. */
  personalId?: string;
  /** Solo en las cuentas técnicas: las demás toman el nombre de la ficha. */
  nombre?: string; correo: string; rolId: string; sedeIds: string[]; sedePrincipalId?: string; almacenIds: string[]; todasLasSedes: boolean;
  documento?: string; telefono?: string;
}

export interface Cambios {
  nombre?: string; rolId?: string; estado?: Estado; sedeIds?: string[]; sedePrincipalId?: string; almacenIds?: string[]; todasLasSedes?: boolean;
  documento?: string; telefono?: string; notaEstado?: string;
}

export const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normalizarCorreo = (c: string): string => c.trim().toLowerCase();

// ------------------------------------------------------------------------------------------------------------------ Quién llama

export const esSuperusuario = (l: Llamante): boolean => l.rol.esSistema && l.rol.estado === 'Activo' && l.cuenta.estado === 'Activo';
export const puede = (l: Llamante, funcion: string): boolean => esSuperusuario(l) || (l.cuenta.estado === 'Activo' && l.rol.estado === 'Activo' && l.funciones.includes(funcion));
/** Igual que `app.alcance_total()` en la base: la función de alcance total o la cuenta marcada «Todas». */
export const alcanceTotal = (l: Llamante): boolean => puede(l, 'org-alcance:all_branches') || (l.cuenta.estado === 'Activo' && l.cuenta.todasLasSedes);

export const sinPermiso = (funcion: string): string => `Su rol no tiene la función «${funcion}».`;

/** Quien llama debe tener cada una de esas funciones. */
export function errorPermisos(l: Llamante, funciones: string[]): string | null {
  const falta = funciones.find(f => !puede(l, f));
  return falta ? sinPermiso(falta) : null;
}

// ------------------------------------------------------------------------------------------------------------------ Datos de la cuenta

export function errorDatos(d: { nombre?: string; correo?: string }): string | null {
  if (d.nombre !== undefined) {
    const nombre = d.nombre.trim();
    if (!nombre) return 'El nombre es obligatorio.';
    if (nombre.length > 120) return 'El nombre es demasiado largo (máximo 120 caracteres).';
  }
  if (d.correo !== undefined) {
    const correo = normalizarCorreo(d.correo);
    if (!correo) return 'El correo es obligatorio.';
    if (correo.length > 254 || !CORREO_RE.test(correo)) return 'El correo no es válido.';
  }
  return null;
}

export const errorCorreoRepetido = (correo: string, cuentas: Pick<CuentaInfo, 'id' | 'correo'>[], exceptoId?: string): string | null =>
  cuentas.some(c => c.id !== exceptoId && normalizarCorreo(c.correo) === normalizarCorreo(correo)) ? 'Este correo ya está registrado.' : null;

// ------------------------------------------------------------------------------------------------------------------ Rol

/**
 * ¿Se puede dar este rol? Debe existir y estar activo, y el del sistema solo lo da un Superusuario (si no, quien puede asignar roles se
 * daría a sí mismo cualquier acceso). Si la cuenta ya tenía ese rol (`antes`), no se le exige nada.
 */
export function errorRol(rolId: string, roles: RolInfo[], l: Llamante, antes?: CuentaInfo): string | null {
  if (antes && antes.rolId === rolId) return null;
  const rol = roles.find(r => r.id === rolId);
  if (!rol) return rolId ? 'El rol elegido no existe.' : 'Elija el rol de la cuenta.';
  if (rol.estado !== 'Activo') return `El rol «${rol.nombre}» está inactivo: actívelo antes de asignarlo.`;
  if (rol.esSistema && !esSuperusuario(l)) return `Solo el Superusuario puede dar el rol «${rol.nombre}».`;
  return null;
}

// ------------------------------------------------------------------------------------------------------------------ Sedes y almacenes

const mismos = (a: string[], b: string[]): boolean => a.length === b.length && a.every(x => b.includes(x));

/**
 * Las sedes y almacenes de la cuenta: deben existir, estar activos (salvo los que ya tenía), ser alcanzables por quien llama y dejar a la
 * cuenta con al menos un lugar (salvo si el rol es del sistema: el Superusuario no necesita sede). Dar «todas las sedes» exige alcanzarlas todas.
 */
export function errorLugares(
  l: Llamante, sedes: LugarInfo[], almacenes: LugarInfo[],
  nuevo: { sedeIds: string[]; sedePrincipalId?: string; almacenIds: string[]; todasLasSedes: boolean },
  antes?: Pick<CuentaInfo, 'sedeIds' | 'almacenIds' | 'todasLasSedes'>,
  exigeLugar = true,
): string | null {
  for (const id of nuevo.sedeIds) {
    const sede = sedes.find(s => s.id === id);
    if (!sede) return `La sede ${id} no existe.`;
    const yaLaTenia = !!antes?.sedeIds.includes(id);
    if (!yaLaTenia && sede.estado !== 'Activo') return `La sede «${sede.nombre}» está inactiva.`;
    if (!yaLaTenia && !alcanceTotal(l) && !l.cuenta.sedeIds.includes(id)) return `No puede asignar la sede «${sede.nombre}»: su cuenta no la alcanza.`;
  }
  for (const id of nuevo.almacenIds) {
    const almacen = almacenes.find(a => a.id === id);
    if (!almacen) return `El almacén ${id} no existe.`;
    const yaLoTenia = !!antes?.almacenIds.includes(id);
    if (!yaLoTenia && almacen.estado !== 'Activo') return `El almacén «${almacen.nombre}» está inactivo.`;
    if (!yaLoTenia && !esSuperusuario(l) && !l.cuenta.almacenIds.includes(id)) return `No puede asignar el almacén «${almacen.nombre}»: su cuenta no trabaja en él.`;
  }
  if (nuevo.sedePrincipalId && !nuevo.sedeIds.includes(nuevo.sedePrincipalId)) return 'La sede principal debe estar entre las sedes de la cuenta.';
  if (nuevo.todasLasSedes && !antes?.todasLasSedes && !alcanceTotal(l)) return 'Solo quien alcanza todas las sedes puede dar ese alcance.';
  if (exigeLugar && nuevo.sedeIds.length === 0 && nuevo.almacenIds.length === 0 && !nuevo.todasLasSedes) return 'Elija la sede de la cuenta o, si solo trabaja en el almacén, marque su almacén.';
  return null;
}

// ------------------------------------------------------------------------------------------------------------------ Plazas por sede

/** Cuentas activas del rol que ocupan ese lugar, sin contar una cuenta (la que se edita). */
export function plazasUsadas(rolId: string, cuentas: CuentaInfo[], lugar: { tipo: 'sede' | 'almacen'; id: string }, exceptoId?: string): number {
  return cuentas.filter(c => c.id !== exceptoId && c.rolId === rolId && c.estado === 'Activo' && (lugar.tipo === 'sede' ? c.sedeIds : c.almacenIds).includes(lugar.id)).length;
}

/**
 * ¿La cuenta cabe en el límite del rol? Solo mira los lugares que pasa a ocupar: si ya ocupaba uno (misma cuenta, mismo rol, activa) no se
 * le quita por un límite que se bajó después.
 */
export function errorPlazas(
  rol: RolInfo | undefined, cuentas: CuentaInfo[], sedes: LugarInfo[],
  nuevo: { estado: Estado; sedeIds: string[]; almacenIds: string[] }, antes?: CuentaInfo,
): string | null {
  if (!rol || !rol.limite || nuevo.estado !== 'Activo') return null;
  const yaOcupaba = antes && antes.estado === 'Activo' && antes.rolId === rol.id;
  const lugares = [
    ...nuevo.sedeIds.map(id => ({ tipo: 'sede' as const, id })),
    ...nuevo.almacenIds.map(id => ({ tipo: 'almacen' as const, id })),
  ];
  for (const lugar of lugares) {
    if (yaOcupaba && (lugar.tipo === 'sede' ? antes!.sedeIds : antes!.almacenIds).includes(lugar.id)) continue;
    const usadas = plazasUsadas(rol.id, cuentas, lugar, antes?.id);
    if (usadas + 1 > rol.limite) {
      const donde = lugar.tipo === 'almacen' ? 'el almacén' : `«${sedes.find(s => s.id === lugar.id)?.nombre ?? lugar.id}»`;
      return `El rol «${rol.nombre}» admite hasta ${rol.limite} cuenta${rol.limite === 1 ? '' : 's'} activa${rol.limite === 1 ? '' : 's'} por sede o almacén y ${donde} ya tiene ${usadas}.`;
    }
  }
  return null;
}

// ------------------------------------------------------------------------------------------------------------------ La persona y sus lugares

/** Las funciones que MUEVEN el almacén (despachar, ingresar compras, empacar, ajustar): lo que `warehouseOperationError` exige a quien lo opera. */
export const FUNCIONES_QUE_MUEVEN_ALMACEN: readonly string[] = ['log-envios:dispatch', 'log-stock:entry', 'log-stock:pack', 'log-ajustes:create', 'log-transfer:dispatch'];
export const rolMueveAlmacen = (funciones: string[]): boolean => funciones.some(f => FUNCIONES_QUE_MUEVEN_ALMACEN.includes(f));

/** Asignaciones activas que dan acceso al sistema (las marcadas «sin acceso», como limpieza, no cuentan). */
export const asignacionesConAcceso = (asignaciones: AsignacionInfo[], personalId: string): AsignacionInfo[] =>
  asignaciones.filter(a => a.personalId === personalId && a.estado === 'Activa' && a.conAcceso);

/** El rol del sistema (Superusuario) es solo para cuentas técnicas, sin persona: igual que lo exige la base. */
export const ROL_SISTEMA_SOLO_TECNICO = 'El rol del sistema (Superusuario) es solo para cuentas técnicas, sin persona: no se le da a una persona de Personal.';

export interface LugaresDerivados { sedeIds: string[]; sedePrincipalId?: string; almacenIds: string[] }

/** Las sedes y el almacén de una cuenta: los de las asignaciones activas con acceso (la principal es la de su asignación principal). */
export function lugaresDeAsignaciones(asignaciones: AsignacionInfo[], personalId: string): LugaresDerivados {
  const own = asignacionesConAcceso(asignaciones, personalId);
  const enSede = own.filter(a => a.sedeId).sort((a, b) => Number(b.esPrincipal) - Number(a.esPrincipal) || a.fechaInicio.localeCompare(b.fechaInicio));
  const sedeIds = [...new Set(enSede.map(a => a.sedeId as string))];
  return { sedeIds, sedePrincipalId: sedeIds[0], almacenIds: [...new Set(own.filter(a => a.almacenId).map(a => a.almacenId as string))] };
}

/** ¿Puede tener cuenta esta persona? Debe existir, estar activa, no tener ya una y tener al menos una asignación activa con acceso. */
export function errorPersona(personalId: string, ctx: Pick<Contexto, 'personal' | 'cuentas' | 'asignaciones'>, exceptoCuentaId?: string): string | null {
  const persona = ctx.personal.find(p => p.id === personalId);
  if (!persona) return 'La persona elegida no existe en Personal.';
  if (persona.estado !== 'Activo') return `${persona.nombre} está inactivo: reactívelo en Personas → Personal antes de darle una cuenta.`;
  if (ctx.cuentas.some(c => c.id !== exceptoCuentaId && c.personalId === personalId)) return `${persona.nombre} ya tiene una cuenta: una persona tiene una sola.`;
  if (asignacionesConAcceso(ctx.asignaciones, personalId).length === 0) {
    const algunaActiva = ctx.asignaciones.some(a => a.personalId === personalId && a.estado === 'Activa');
    return algunaActiva
      ? `${persona.nombre} solo tiene asignaciones sin acceso al sistema: marque «Sí» en el acceso de alguna en Personas → Asignaciones.`
      : `${persona.nombre} no tiene una asignación activa: defina su sede o almacén y su área en Personas → Asignaciones.`;
  }
  return null;
}

/** El correo de ingreso es el institucional: nunca el correo personal de la ficha. */
export function errorCorreoPersonal(correo: string, persona: Pick<PersonaInfo, 'correoPersonal'>): string | null {
  return persona.correoPersonal && normalizarCorreo(persona.correoPersonal) === normalizarCorreo(correo)
    ? 'El correo de ingreso no puede ser el correo personal de la ficha: use el correo institucional.'
    : null;
}

/**
 * Coherencia entre el rol y el lugar de trabajo. El rol dice QUÉ puede hacer y el lugar DÓNDE; el almacén solo lo mueve quien tiene las dos cosas:
 *  - un rol que mueve el almacén exige una asignación al almacén;
 *  - quien trabaja en el almacén necesita un rol que lo mueva.
 * Los roles del sistema (Superusuario) no tienen restricción. No es seguridad (el permiso de mover exige función Y lugar al usarlo): es que la
 * cuenta no quede mal armada.
 */
export function errorCoherenciaRolLugar(rol: Pick<RolInfo, 'nombre' | 'esSistema' | 'mueveAlmacen'>, lugares: Pick<LugaresDerivados, 'almacenIds'>): string | null {
  if (rol.esSistema) return null;
  const trabajaEnAlmacen = lugares.almacenIds.length > 0;
  if (rol.mueveAlmacen && !trabajaEnAlmacen) {
    return `El rol «${rol.nombre}» mueve el almacén (despacha, ingresa compras o ajusta el stock): la persona necesita una asignación al almacén en Personas → Asignaciones.`;
  }
  if (trabajaEnAlmacen && !rol.mueveAlmacen) {
    return `La persona trabaja en el almacén: su rol debe tener funciones del almacén (por ejemplo «Almacén central») y «${rol.nombre}» no las tiene.`;
  }
  return null;
}

// ------------------------------------------------------------------------------------------------------------------ Invitar

/**
 * Todo lo que debe cumplirse para invitar (crear) una cuenta. `null` = se puede.
 * Con `personalId` la cuenta nace de esa persona (nombre, documento, teléfono, sedes y almacén salen de Personal); sin él es una cuenta
 * técnica: solo la crea un Superusuario y solo con un rol del sistema.
 */
export function errorInvitacion(s: SolicitudInvitar, ctx: Contexto): string | null {
  const { llamante: l } = ctx;
  const rol = ctx.roles.find(r => r.id === s.rolId);
  if (!s.personalId) {
    return errorPermisos(l, ['org-usuarios:create'])
      ?? (esSuperusuario(l) ? null : 'Solo un Superusuario crea una cuenta sin persona (cuenta técnica del sistema).')
      ?? errorDatos({ nombre: s.nombre ?? '', correo: s.correo })
      ?? errorCorreoRepetido(s.correo, ctx.cuentas)
      ?? errorRol(s.rolId, ctx.roles, l)
      ?? (rol?.esSistema ? null : 'Una cuenta sin persona solo puede tener un rol del sistema (Superusuario): las demás nacen de una persona de Personal.');
  }
  const persona = ctx.personal.find(p => p.id === s.personalId);
  const lugares = lugaresDeAsignaciones(ctx.asignaciones, s.personalId);
  return errorPermisos(l, ['org-usuarios:create'])
    ?? errorDatos({ correo: s.correo })
    ?? errorCorreoRepetido(s.correo, ctx.cuentas)
    ?? errorPersona(s.personalId, ctx)
    ?? errorCorreoPersonal(s.correo, persona!)
    ?? errorRol(s.rolId, ctx.roles, l)
    ?? (rol?.esSistema ? ROL_SISTEMA_SOLO_TECNICO : null)
    ?? errorCoherenciaRolLugar(rol!, lugares)
    ?? errorLugares(l, ctx.sedes, ctx.almacenes, { sedeIds: lugares.sedeIds, almacenIds: lugares.almacenIds, todasLasSedes: false }, undefined, false)
    ?? errorPlazas(rol, ctx.cuentas, ctx.sedes, { estado: 'Activo', sedeIds: lugares.sedeIds, almacenIds: lugares.almacenIds });
}

// ------------------------------------------------------------------------------------------------------------------ Editar

/** Las funciones que pide un cambio, según lo que de verdad cambia frente a la cuenta actual (igual que `userChangeNeeds` en la pantalla). */
export function funcionesDelCambio(c: Cambios, antes: CuentaInfo): string[] {
  const f: string[] = [];
  if (c.estado !== undefined && c.estado !== antes.estado) f.push(c.estado === 'Inactivo' ? 'org-usuarios:deactivate' : 'org-usuarios:edit');
  if (c.rolId !== undefined && c.rolId !== antes.rolId) f.push('org-usuarios:assign_role');
  const sedesCambian = c.sedeIds !== undefined && !mismos(c.sedeIds, antes.sedeIds);
  const almacenesCambian = c.almacenIds !== undefined && !mismos(c.almacenIds, antes.almacenIds);
  const todasCambia = c.todasLasSedes !== undefined && c.todasLasSedes !== antes.todasLasSedes;
  if (sedesCambian || almacenesCambian || todasCambia) f.push('org-usuarios:assign_branch');
  const distinto = (nuevo: string | undefined, actual: string | null | undefined) => nuevo !== undefined && nuevo.trim() !== (actual ?? '').trim();
  if (distinto(c.nombre, antes.nombre) || distinto(c.documento, antes.documento) || distinto(c.telefono, antes.telefono)) f.push('org-usuarios:edit');
  return [...new Set(f)];
}

export function errorEdicion(cuentaId: string, c: Cambios, ctx: Contexto): string | null {
  const { llamante: l } = ctx;
  const antes = ctx.cuentas.find(x => x.id === cuentaId);
  if (!antes) return 'No se encontró la cuenta.';
  const rolAntes = ctx.roles.find(r => r.id === antes.rolId);
  if (rolAntes?.esSistema && !esSuperusuario(l)) return 'Solo un Superusuario puede modificar una cuenta de Superusuario.';

  const rolId = c.rolId ?? antes.rolId;
  const estado = c.estado ?? antes.estado;
  const sedeIds = c.sedeIds ?? antes.sedeIds;
  const almacenIds = c.almacenIds ?? antes.almacenIds;
  const todasLasSedes = c.todasLasSedes ?? antes.todasLasSedes;

  const cambiaRol = rolId !== antes.rolId;
  const cambiaEstado = estado !== antes.estado;
  if (l.cuenta.id === antes.id && (cambiaRol || cambiaEstado)) return 'No puede cambiar el rol ni el estado de su propia cuenta: pídaselo a otra persona.';

  // Nunca se queda el sistema sin una cuenta de Superusuario activa
  if (rolAntes?.esSistema && antes.estado === 'Activo') {
    const sigueSiendoSistema = ctx.roles.find(r => r.id === rolId)?.esSistema === true;
    if (!sigueSiendoSistema || estado === 'Inactivo') {
      const otros = ctx.cuentas.filter(x => x.id !== antes.id && x.estado === 'Activo' && ctx.roles.find(r => r.id === x.rolId)?.esSistema).length;
      if (otros === 0) return 'Es la única cuenta activa de Superusuario: sin ella nadie podría administrar roles ni cuentas.';
    }
  }

  const rolDespues = ctx.roles.find(r => r.id === rolId);

  // Una cuenta que nace de una persona toma de Personal su nombre, su documento, su teléfono y sus lugares: no se editan aquí
  if (antes.personalId) {
    const datosCambian = (c.nombre !== undefined && c.nombre.trim() !== antes.nombre.trim()) || (c.documento !== undefined && c.documento.trim() !== (antes.documento ?? '').trim())
      || (c.telefono !== undefined && c.telefono.trim() !== (antes.telefono ?? '').trim());
    if (datosCambian) return 'El nombre, el documento y el teléfono salen de la ficha de la persona: se corrigen en Personas → Personal.';
    const lugaresCambian = (c.sedeIds !== undefined && !mismos(c.sedeIds, antes.sedeIds)) || (c.almacenIds !== undefined && !mismos(c.almacenIds, antes.almacenIds))
      || (c.todasLasSedes !== undefined && c.todasLasSedes !== antes.todasLasSedes);
    if (lugaresCambian) return 'Las sedes y el almacén de la cuenta salen de las asignaciones de la persona: se cambian en Personas → Asignaciones.';
    const lugares = lugaresDeAsignaciones(ctx.asignaciones, antes.personalId);
    const reactiva = antes.estado === 'Inactivo' && estado === 'Activo';
    return errorPermisos(l, funcionesDelCambio(c, antes))
      ?? errorRol(rolId, ctx.roles, l, antes)
      ?? (cambiaRol && rolDespues?.esSistema ? ROL_SISTEMA_SOLO_TECNICO : null)
      ?? (cambiaRol || reactiva ? errorCoherenciaRolLugar(rolDespues!, lugares) : null)
      ?? (reactiva ? errorPersona(antes.personalId, ctx, antes.id) : null)
      ?? errorPlazas(rolDespues, ctx.cuentas, ctx.sedes, { estado, sedeIds: lugares.sedeIds, almacenIds: lugares.almacenIds }, antes);
  }

  const nuevo = { sedeIds, sedePrincipalId: c.sedePrincipalId, almacenIds, todasLasSedes };
  // Los lugares solo se revisan si el cambio los toca o si la cuenta deja de ser del sistema (entonces sí necesita uno)
  const tocaLugares = c.sedeIds !== undefined || c.almacenIds !== undefined || c.todasLasSedes !== undefined || c.sedePrincipalId !== undefined || cambiaRol;
  return errorPermisos(l, funcionesDelCambio(c, antes))
    ?? errorDatos({ nombre: c.nombre })
    ?? errorRol(rolId, ctx.roles, l, antes)
    ?? (tocaLugares ? errorLugares(l, ctx.sedes, ctx.almacenes, nuevo, antes, rolDespues?.esSistema !== true) : null)
    ?? errorPlazas(ctx.roles.find(r => r.id === rolId), ctx.cuentas, ctx.sedes, { estado, sedeIds, almacenIds }, antes);
}

// ------------------------------------------------------------------------------------------------------------------ Reenviar el acceso

/** Reenviar la invitación (o el enlace para fijar la contraseña) es «Resetear acceso»; solo a cuentas activas y de su alcance. */
export function errorReenvio(cuentaId: string, ctx: Contexto): string | null {
  const { llamante: l } = ctx;
  const cuenta = ctx.cuentas.find(c => c.id === cuentaId);
  if (!cuenta) return 'No se encontró la cuenta.';
  const rol = ctx.roles.find(r => r.id === cuenta.rolId);
  if (rol?.esSistema && !esSuperusuario(l)) return 'Solo un Superusuario puede reenviar el acceso de una cuenta de Superusuario.';
  return errorPermisos(l, ['org-usuarios:reset_access'])
    ?? (cuenta.estado !== 'Activo' ? 'La cuenta está inactiva: actívela antes de reenviarle el acceso.' : null);
}
