/**
 * Repositorio de las contrapartes sobre Supabase (función `contrapartes_de_funciones` de la migración 0028). Solo traduce: filas y errores de la base a
 * mensajes claros. La seguridad no está aquí: la función de la base entrega solo función y lugar (nunca nombres ni ids de cuentas).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { counterpartsErrorMessage, type CounterpartRow } from '../utils/counterpartsDb';
import type { CounterpartsRepository } from './counterparts';

export function createSupabaseCounterpartsRepository(client: SupabaseClient): CounterpartsRepository {
  return {
    async list(functionIds) {
      const { data, error } = await client.rpc('contrapartes_de_funciones', { p_funciones: functionIds });
      if (error) return { ok: false, error: counterpartsErrorMessage(error) };
      return { ok: true, data: (data ?? []) as CounterpartRow[] };
    },
  };
}
