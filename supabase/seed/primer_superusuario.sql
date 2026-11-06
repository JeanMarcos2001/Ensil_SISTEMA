-- Primer Superusuario. NO es una migración: depende de una persona real, así que se ejecuta una sola vez a mano.
--
-- Antes: en el panel de Supabase → Authentication → Users → «Invite user» con marketing@ensilperu.com
--        (la persona abre el enlace del correo y elige su contraseña; hasta entonces la cuenta no entra).
-- Después: pegar este script en el SQL Editor del proyecto.
-- Es seguro repetirlo: si la cuenta ya existe, no hace nada.

insert into public.cuentas (id, nombre, correo, rol_id)
select u.id, 'Superusuario', lower(u.email), 'ROL-001'
from auth.users u
where lower(u.email) = 'marketing@ensilperu.com'
on conflict (id) do nothing;

-- Comprobación: debe mostrar una fila con rol ROL-001 y estado Activo.
select id, nombre, correo, rol_id, estado from public.cuentas;
