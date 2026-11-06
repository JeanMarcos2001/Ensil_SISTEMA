/**
 * La dirección con la que se abrió el sistema, capturada ANTES de que el cliente de Supabase la procese y la limpie: así se puede saber si
 * la persona llegó desde el enlace de una invitación o de «olvidé mi contraseña» y pedirle que fije su contraseña.
 * Debe importarse primero en `main.tsx`.
 */
export const initialAuthHash: string = typeof window === 'undefined' ? '' : window.location.hash;
