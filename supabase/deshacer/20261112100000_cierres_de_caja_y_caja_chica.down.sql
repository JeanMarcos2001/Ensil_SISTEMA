-- Deshace 0017 · Cierres de caja y caja chica por sede: quita las tres tablas, sus funciones y el disparador que bloquea los días cerrados.
-- OJO: se pierden los cierres y los movimientos de caja chica guardados (la caja chica y los cierres vuelven a vivir solo en memoria).

begin;

drop trigger if exists movimientos_respetan_cierre on public.movimientos_caja;
drop function if exists app.movimiento_respeta_cierre();

drop function if exists public.cerrar_caja(text, text, text, date, numeric, text);
drop function if exists public.reabrir_cierre(text, text);
drop function if exists public.definir_fondo_caja_chica(text, numeric, numeric);
drop function if exists public.registrar_movimiento_caja_chica(text, text, date, text, text, numeric, text, text, text, text);
drop function if exists public.reversar_movimiento_caja_chica(text, text, text);

drop table if exists public.caja_chica_movimientos;
drop table if exists public.caja_chica_fondos;
drop table if exists public.cierres_caja;

drop function if exists app.puede_leer_cierres();
drop function if exists app.puede_leer_caja_chica();
drop function if exists app.codigo_siguiente_caja(text, text);
drop function if exists app.mensaje_caja_cerrada(text, date);
drop function if exists app.saldo_caja_chica(text);
drop function if exists app.saldo_caja_hasta(text, text, text, date);
drop function if exists app.cerrado_hasta(text, text, text);
drop function if exists app.cierre_inmutable();
drop function if exists app.caja_chica_inmutable();
drop function if exists app.cajas_no_se_vacian();

commit;
