/**
 * Verificación del inicio de sesión real (paso 10): validación del formulario, mensajes de error de Auth y quién puede pasar.
 * Ejecutar: npx tsx scripts/check-login.ts
 */
import { PASSWORD_MAX, PASSWORD_MIN, RESET_SENT, admitAccount, authErrorMessage, loginInputError, normalizeEmail, parseAuthHash, passwordError, type LoginAccountRow } from '../src/utils/loginAccess';
import { resolveAppUrl } from '../src/utils/appUrl';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

// ------------------------------------------------------------------------------------------------ Formulario
check('Sin correo no se envía', loginInputError('', 'x') === 'Escriba su correo.');
check('Un correo con solo espacios cuenta como vacío', loginInputError('   ', 'x') === 'Escriba su correo.');
check('Un correo mal escrito se rechaza', loginInputError('marketing@', 'x') === 'El correo no es válido.' && loginInputError('marketing.ensilperu.com', 'x') === 'El correo no es válido.');
check('Sin contraseña no se envía', loginInputError('marketing@ensilperu.com', '') === 'Escriba su contraseña.');
check('Correo y contraseña escritos: pasa a Auth', loginInputError(' marketing@ensilperu.com ', 'cualquiera') === null);
check('El correo se normaliza igual que en la tabla de cuentas', normalizeEmail('  Marketing@EnsilPeru.com ') === 'marketing@ensilperu.com');

// ------------------------------------------------------------------------------------------------ Mensajes de Auth
check('Credenciales erróneas: mensaje único, sin revelar si el correo existe', authErrorMessage('Invalid login credentials', 400) === 'Correo o contraseña incorrectos.');
check('Correo sin confirmar: indica abrir la invitación', /invitación/.test(authErrorMessage('Email not confirmed', 400)));
check('Demasiados intentos (429)', /Demasiados intentos/.test(authErrorMessage('lo que sea', 429)) && /Demasiados intentos/.test(authErrorMessage('Email rate limit exceeded')));
check('Sin red', /No hay conexión/.test(authErrorMessage('Failed to fetch')));
check('Error desconocido: mensaje genérico, sin texto técnico', authErrorMessage('xyz internal 500') === 'No se pudo iniciar sesión. Intente de nuevo.' && authErrorMessage(undefined) === 'No se pudo iniciar sesión. Intente de nuevo.');

// ------------------------------------------------------------------------------------------------ Quién pasa
const row = (patch: Partial<LoginAccountRow> = {}): LoginAccountRow => ({
  id: 'ed526181-5115-4ba5-8d90-aab440982f27', nombre: 'Superusuario', correo: 'marketing@ensilperu.com', estado: 'Activo', rol_id: 'ROL-001',
  roles: { estado: 'Activo', es_sistema: true }, ...patch,
});

const ok = admitAccount(row());
check('El Superusuario activo con rol del sistema pasa', ok.ok && ok.account?.isSuperuser === true && ok.account.email === 'marketing@ensilperu.com' && ok.account.roleId === 'ROL-001');
const none = admitAccount(null);
check('Un usuario de Auth sin fila en cuentas no pasa y se le dice a quién pedirla', !none.ok && /no tiene una cuenta/.test(none.error!) && /Superusuario/.test(none.error!));
const inactive = admitAccount(row({ estado: 'Inactivo' }));
check('Una cuenta inactiva no pasa', !inactive.ok && /inactiva/.test(inactive.error!));
const roleOff = admitAccount(row({ roles: { estado: 'Inactivo', es_sistema: true } }));
check('Un rol inactivo no deja pasar', !roleOff.ok && /rol/.test(roleOff.error!));
const noRole = admitAccount(row({ roles: null }));
check('Una cuenta sin rol legible no pasa', !noRole.ok);
const other = admitAccount(row({ rol_id: 'ROL-002', roles: { estado: 'Activo', es_sistema: false } }));
check('Una cuenta activa con otro rol (no del sistema) también pasa, y no es Superusuario', other.ok && other.account?.isSuperuser === false && other.account.roleId === 'ROL-002');
check('Todos los mensajes están en español con tilde donde corresponde', [none, inactive, roleOff].every(r => !r.ok && /[áéíóú]/.test(r.error!)));
check('Una cuenta inactiva con rol del sistema tampoco pasa (el estado de la cuenta manda)', !admitAccount(row({ estado: 'Inactivo' })).ok);

// ------------------------------------------------------------------------------------------------ Contraseña
check('La contraseña pide largo, letras y números, y que coincidan', passwordError('corta1', 'corta1') !== null && /al menos 10/.test(passwordError('abc123', 'abc123')!)
  && /letras y números/.test(passwordError('soloLetrasAqui', 'soloLetrasAqui')!) && /letras y números/.test(passwordError('1234567890123', '1234567890123')!)
  && passwordError('Clave-segura-2026', 'Clave-segura-2026') === null && passwordError('Clave-segura-2026', 'Clave-segura-2027') === 'Las contraseñas no coinciden.');
check('No puede pasar del límite de Auth ni ser igual al correo', /no puede pasar de/.test(passwordError('a1'.repeat(PASSWORD_MAX), 'a1'.repeat(PASSWORD_MAX))!) && PASSWORD_MIN === 10
  && /igual a su correo/.test(passwordError('marketing1@ensilperu.com', 'marketing1@ensilperu.com', ' Marketing1@EnsilPeru.com ')!));
check('El aviso de recuperar la contraseña no revela si el correo existe', !/no existe|no tiene cuenta|no se encontr/i.test(RESET_SENT) && /Si ese correo/.test(RESET_SENT));

// ------------------------------------------------------------------------------------------------ Enlaces del correo
check('El enlace de una invitación trae el tipo y el token', parseAuthHash('#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&type=invite').kind === 'invite');
check('El enlace de recuperar la contraseña se reconoce', parseAuthHash('#access_token=abc&type=recovery').kind === 'recovery');
check('Sin token, o con otro tipo, no es un enlace de acceso', parseAuthHash('').kind === null && parseAuthHash('#type=invite').kind === null && parseAuthHash('#access_token=abc&type=magiclink').kind === null && parseAuthHash('#/dashboard').kind === null);
const expired = parseAuthHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
check('Un enlace vencido se avisa con un mensaje claro y sin texto técnico', expired.kind === 'error' && /venció o ya se usó/.test(expired.error!) && !/otp|access_denied|Email link/.test(expired.error!));
check('Cualquier otro error del enlace también se explica', parseAuthHash('#error=server_error&error_code=unexpected_failure').kind === 'error' && /no es válido/.test(parseAuthHash('#error=server_error&error_code=unexpected_failure').error!));

// ------------------------------------------------------------------------------------------------ Dirección de los enlaces de los correos
check('Los enlaces de los correos usan la dirección configurada (p. ej. Vercel) aunque el sistema esté abierto en localhost', resolveAppUrl('https://ensil-sistema.vercel.app', 'http://localhost:3000') === 'https://ensil-sistema.vercel.app');
check('Sin configurar, o con una dirección inválida, se usa la de la pestaña; la barra final se quita', resolveAppUrl(undefined, 'http://localhost:3000') === 'http://localhost:3000' && resolveAppUrl('  ', 'https://a.com/') === 'https://a.com' && resolveAppUrl('ensil-sistema.vercel.app', 'http://localhost:3000') === 'http://localhost:3000' && resolveAppUrl('javascript:alert(1)', 'https://a.com') === 'https://a.com' && resolveAppUrl('https://ensil-sistema.vercel.app/', 'x') === 'https://ensil-sistema.vercel.app');

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodas las comprobaciones pasaron.');
