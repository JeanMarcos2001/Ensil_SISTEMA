/**
 * Dirección pública del sistema para los enlaces de los correos (invitación, «olvidé mi contraseña», «reenviar acceso»).
 *
 * El enlace que llega por correo lleva de vuelta a esta dirección, así que NO puede depender de dónde estaba abierto el sistema cuando se
 * creó la cuenta (si se creaba desde `localhost`, el correo mandaba a `localhost`, que en otra computadora no existe). Si está configurada
 * `VITE_APP_URL` (la dirección del despliegue, p. ej. `https://ensil-sistema.vercel.app`) se usa esa; si no, la de la pestaña actual.
 *
 * Además, Supabase solo respeta la dirección si está en Authentication → URL Configuration → Redirect URLs.
 */

/** La dirección configurada si es una dirección http(s) válida (sin barra final); si no, la de la pestaña. Función pura. */
export function resolveAppUrl(configured: string | undefined, currentOrigin: string): string {
  const text = (configured ?? '').trim();
  if (/^https?:\/\/[^\s/]+(\/[^\s]*)?$/i.test(text)) return text.replace(/\/+$/, '');
  return currentOrigin.replace(/\/+$/, '');
}

export const appUrl = (): string => resolveAppUrl(import.meta.env.VITE_APP_URL as string | undefined, window.location.origin);
