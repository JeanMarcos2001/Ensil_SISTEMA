/**
 * Inicio de sesión real (paso 10): reglas puras de la pantalla de ingreso con correo y contraseña (Supabase Auth) y de quién puede pasar.
 *
 * - La contraseña vive solo en Supabase Auth; el sistema nunca la guarda ni la valida por su cuenta.
 * - Tener usuario en Auth no basta: debe existir una fila en `cuentas` (la crea el Superusuario), con la cuenta y su rol activos.
 * - Los roles y las cuentas viven en la base: entra cualquier cuenta activa con un rol activo.
 * - La primera vez, la persona llega desde el enlace de su invitación y fija su contraseña (`passwordError`, `parseAuthHash`).
 * - El cambio rápido con PIN se retiró mientras no se verifique en el servidor (ver `docs/REGLAS_DE_NEGOCIO.md`).
 */

export const LOGIN_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Revisa lo escrito en el formulario antes de llamar al servidor. */
export function loginInputError(email: string, password: string): string | null {
  if (!email.trim()) return 'Escriba su correo.';
  if (!LOGIN_EMAIL_PATTERN.test(email.trim())) return 'El correo no es válido.';
  if (!password) return 'Escriba su contraseña.';
  return null;
}

/** El correo se compara siempre en minúsculas y sin espacios, igual que en la tabla `cuentas`. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Traduce el error de Auth a un mensaje claro. Nunca distingue «correo inexistente» de «contraseña errónea». */
export function authErrorMessage(message: string | undefined, status?: number): string {
  const text = (message ?? '').toLowerCase();
  if (text.includes('invalid login credentials') || text.includes('invalid credentials')) return 'Correo o contraseña incorrectos.';
  if (text.includes('email not confirmed')) return 'Falta confirmar su correo: abra el enlace de la invitación que le llegó.';
  if (status === 429 || text.includes('rate limit') || text.includes('too many')) return 'Demasiados intentos. Espere unos minutos e intente de nuevo.';
  if (text.includes('failed to fetch') || text.includes('network') || text.includes('load failed')) return 'No hay conexión con el servidor. Revise su internet e intente de nuevo.';
  return 'No se pudo iniciar sesión. Intente de nuevo.';
}

/** Fila de `cuentas` con el estado y la marca de su rol, tal como la devuelve la consulta de ingreso. */
export interface LoginAccountRow {
  id: string;
  nombre: string;
  correo: string;
  estado: string;
  rol_id: string;
  roles: { estado: string; es_sistema: boolean } | null;
}

export interface LoginAccount { id: string; name: string; email: string; roleId: string; isSuperuser: boolean }

export interface Admission { ok: boolean; error?: string; account?: LoginAccount }

/** ¿Puede pasar esta cuenta? `null` = el usuario de Auth no tiene fila en `cuentas`. */
export function admitAccount(row: LoginAccountRow | null): Admission {
  if (!row) return { ok: false, error: 'Su correo y contraseña son correctos, pero no tiene una cuenta en el sistema: pídale al Superusuario que la cree.' };
  if (row.estado !== 'Activo') return { ok: false, error: 'Su cuenta está inactiva: pídale al Superusuario que la reactive.' };
  if (!row.roles || row.roles.estado !== 'Activo') return { ok: false, error: 'El rol de su cuenta está inactivo: pídale al Superusuario que lo revise.' };
  return { ok: true, account: { id: row.id, name: row.nombre, email: row.correo, roleId: row.rol_id, isSuperuser: row.roles.es_sistema } };
}

// ------------------------------------------------------------------------------------------------------------------ Contraseña

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;

/** Reglas de la contraseña que fija cada persona (Auth la guarda cifrada; el sistema nunca la ve después). */
export function passwordError(password: string, confirm: string, email = ''): string | null {
  if (password.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  if (password.length > PASSWORD_MAX) return `La contraseña no puede pasar de ${PASSWORD_MAX} caracteres.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'La contraseña debe combinar letras y números.';
  if (email && password.toLowerCase() === email.trim().toLowerCase()) return 'La contraseña no puede ser igual a su correo.';
  if (password !== confirm) return 'Las contraseñas no coinciden.';
  return null;
}

/** El mismo aviso exista o no el correo: no se revela quién tiene cuenta. */
export const RESET_SENT = 'Si ese correo tiene una cuenta, le enviamos un enlace para fijar una contraseña nueva. Revise también la carpeta de spam.';

// ------------------------------------------------------------------------------------------------------------------ Enlaces del correo

/** Qué trae la dirección con la que se abrió el sistema: el enlace de una invitación, el de recuperar la contraseña, un error o nada. */
export interface AuthLink { kind: 'invite' | 'recovery' | 'error' | null; error?: string }

export function parseAuthHash(hash: string): AuthLink {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.get('error') || params.get('error_code')) {
    const code = params.get('error_code') ?? '';
    return { kind: 'error', error: code === 'otp_expired' || params.get('error') === 'access_denied' ? 'El enlace venció o ya se usó: pida que le envíen uno nuevo.' : 'El enlace no es válido: pida que le envíen uno nuevo.' };
  }
  const type = params.get('type');
  if ((type === 'invite' || type === 'recovery') && params.get('access_token')) return { kind: type };
  return { kind: null };
}
