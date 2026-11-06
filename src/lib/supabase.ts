import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/** Sin la URL y la clave pública (archivo `.env.local`) el sistema no puede iniciar sesión: la pantalla lo avisa en vez de romperse. */
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// `createClient` lanza un error si la URL está vacía; con valores de relleno el cliente se crea y nunca llega a usarse (ver AuthGate).
export const supabase = createClient(supabaseUrl || 'http://localhost', supabaseAnonKey || 'sin-configurar');
