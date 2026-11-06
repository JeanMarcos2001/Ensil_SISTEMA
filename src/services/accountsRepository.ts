/**
 * Repositorio de cuentas sobre Supabase: lee `cuentas`, `cuenta_sedes` y `cuenta_almacenes` (la política RLS decide cuáles ve cada quien) y
 * llama a la Edge Function `usuarios`, que es la ÚNICA que puede escribirlas (el navegador solo tiene permiso de lectura).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountRows, CuentaAlmacenRow, CuentaRow, CuentaSedeRow, SedeRef } from '../utils/accounts';
import { dbErrorMessage } from '../utils/orgDirectory';
import type { RepoResult } from './orgDirectory';

export interface FunctionResult { ok: boolean; error?: string; cuentaId?: string }

export interface AccountsRepository {
  listAccounts(): Promise<RepoResult<AccountRows>>;
  /** Llama a la función de cuentas (`invitar`, `editar`, `reenviar`, `ingreso`). Nunca lanza. */
  call(body: Record<string, unknown>): Promise<FunctionResult>;
}

const COLUMNS = 'id, nombre, correo, rol_id, estado, todas_las_sedes, nota_estado, personal_id, documento, telefono, ultimo_acceso';
const NO_SERVICE = 'No se pudo conectar con el servicio de cuentas. Revise su internet e intente de nuevo.';

export function createSupabaseAccountsRepository(client: SupabaseClient): AccountsRepository {
  return {
    async listAccounts() {
      const [cuentas, cuentaSedes, cuentaAlmacenes, sedes] = await Promise.all([
        client.from('cuentas').select(COLUMNS).order('nombre'),
        client.from('cuenta_sedes').select('cuenta_id, sede_id, es_principal'),
        client.from('cuenta_almacenes').select('cuenta_id, almacen_id'),
        client.from('sedes').select('id, nombre'),
      ]);
      const error = cuentas.error ?? cuentaSedes.error ?? cuentaAlmacenes.error ?? sedes.error;
      if (error) return { ok: false, error: dbErrorMessage(error) };
      return {
        ok: true,
        data: {
          cuentas: cuentas.data as CuentaRow[], cuentaSedes: cuentaSedes.data as CuentaSedeRow[],
          cuentaAlmacenes: cuentaAlmacenes.data as CuentaAlmacenRow[], sedes: sedes.data as SedeRef[],
        },
      };
    },

    async call(body) {
      try {
        const { data, error } = await client.functions.invoke('usuarios', { body });
        if (error) {
          // Una respuesta que no es 2xx (sesión vencida, cuenta inactiva…) trae su mensaje en el cuerpo
          const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
          const detail = context?.json ? await context.json().catch(() => null) : null;
          return { ok: false, error: detail?.error ?? NO_SERVICE };
        }
        const result = data as FunctionResult | null;
        return result && typeof result.ok === 'boolean' ? result : { ok: false, error: NO_SERVICE };
      } catch {
        return { ok: false, error: NO_SERVICE };
      }
    },
  };
}
