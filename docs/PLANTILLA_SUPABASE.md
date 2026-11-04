# Plantilla de datos para conectar el sistema a Supabase (paso 10)

Rellena lo que esté marcado con ⏳ y pásamelo en el chat (o pega este archivo completo).
**Nunca** pegues la clave `service_role` ni contraseñas de personas: aquí solo van datos públicos o de configuración.
Estado al 2026-11-03.

## Resumen: qué está resuelto y qué falta

| Bloque | Estado | Qué falta |
|---|---|---|
| A. Proyecto | ✅ Resuelto | Nada. Conexión probada: la clave pública lee `filiales`. |
| B. Uso actual de `filiales` | ⏳ Falta | Pegar el resultado de las consultas 1 a 6 y contestar 6 preguntas (todas de sí/no o una palabra). |
| C. Sedes del sistema | 🟡 A medias | Las 17 sedes ya están listadas. Falta la empresa de cada una, confirmar el almacén central y, si quieres, correo, responsable y observaciones. |
| D. Cómo entra la gente | ⏳ Falta | Aceptar (o cambiar) el método de ingreso y dar el correo del primer Superusuario. |
| E. Cómo ejecutar los cambios | ⏳ Falta | Dos respuestas de sí/no. |

**Mínimo para que yo arranque con el script de sedes, roles y cuentas:**
1. Resultado de las consultas **1, 2, 3 y 5** del bloque B.
2. La **empresa** de cada sede y el **almacén central** (bloque C).
3. El **correo del primer Superusuario** (bloque D).

---

## A. Proyecto de Supabase (el mismo que usa ensilperu.com) ✅

| Dato | Valor |
|---|---|
| URL del proyecto | `https://jtrugvxgztnxbhwjtiou.supabase.co` |
| Clave pública | `sb_publishable_…` (la `anon` antigua `eyJ…` también es válida; ambas son públicas) |
| Referencia del proyecto | `jtrugvxgztnxbhwjtiou` |
| ¿Hay proyecto de pruebas o *branch*? | **No** → todo se ejecuta en producción, así que solo crearé tablas nuevas `erp_*` y no modificaré nada existente |

Ya está en `.env.local` (ignorado por git) como `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`; `src/lib/supabase.ts` las lee.

Comprobado el 2026-11-03: sin iniciar sesión, la clave pública puede leer `filiales` (17 filas) pero **no** puede leer la descripción del esquema (por eso necesito las consultas del bloque B).

## B. Cómo usa hoy la página web la tabla `filiales` ⏳

| Pregunta | Respuesta |
|---|---|
| ¿La web lee con la clave `anon` sin iniciar sesión? | ✅ Sí (verificado: la clave pública lee la tabla) |
| ¿Qué columnas pide la web? (`select *` o una lista) | ⏳ [ ] |
| ¿La web filtra por `activo = true`? | ⏳ [sí / no] |
| ¿Usa la web Supabase Auth (cuentas de usuarios) para algo? | ⏳ [sí / no] |
| ¿`file_path` apunta a un bucket de Storage? ¿Cuál? | ⏳ [ ] |
| ¿`id_mensaje_wsp` es una clave hacia otra tabla? ¿Cuál? | ⏳ [ ] |
| ¿Hay otras tablas, vistas, funciones o *edge functions* que usen `filiales`? | ⏳ [ ] (las consultas 2 y 5 lo responden solas) |

### Consultas para que me pases el estado real (solo lectura)

Ejecútalas en **SQL Editor** de Supabase y pega los resultados. No modifican nada.

```sql
-- 1) Columnas de filiales
select column_name, data_type, is_nullable, column_default, is_identity
from information_schema.columns
where table_schema = 'public' and table_name = 'filiales'
order by ordinal_position;

-- 2) Tablas que apuntan a filiales (claves foráneas)
select conrelid::regclass as tabla, conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where confrelid = 'public.filiales'::regclass;

-- 3) Seguridad por filas (RLS) y políticas de filiales
select relrowsecurity as rls_activo from pg_class where oid = 'public.filiales'::regclass;
select policyname, cmd, roles, qual, with_check from pg_policies where tablename = 'filiales';

-- 4) Disparadores de filiales
select tgname, pg_get_triggerdef(oid) as definicion
from pg_trigger
where tgrelid = 'public.filiales'::regclass and not tgisinternal;

-- 5) Vistas que dependen de filiales
select distinct v.relname as vista
from pg_depend d
join pg_rewrite r on r.oid = d.objid
join pg_class v on v.oid = r.ev_class
where d.refobjid = 'public.filiales'::regclass and v.oid <> d.refobjid;

-- 6) Todas las tablas del esquema public (para no chocar de nombre)
select table_name from information_schema.tables where table_schema = 'public' order by 1;
```

La consulta 7 de la versión anterior (lista de sedes) ya no hace falta: la leí yo.

## C. Sedes del sistema (ERP) 🟡

Ya están las 17 sedes de `filiales` (confirmado por ti: **son todas**; los ids 17 y 18 no existen).
Datos que la web no tiene y el sistema necesita: **empresa** (obligatoria), almacén central (solo uno), y opcionales correo, responsable y observaciones.

| id | Nombre | Departamento · Distrito | Empresa ⏳ | ¿Almacén central? | Correo (opcional) | Responsable (opcional) |
|---|---|---|---|---|---|---|
| 1 | Piura | Piura · Piura | [ ] | no | | |
| 2 | Chiclayo | Lambayeque · Chiclayo | [ ] | no | | |
| 3 | Cajamarca | Cajamarca · Cajamarca | [ ] | no | | |
| 4 | Trujillo | La Libertad · Trujillo | [ ] | no | | |
| 5 | Los Olivos | Lima · Los Olivos | [ ] | **sí (propuesto, confirmar)** | | |
| 6 | San Isidro | Lima · San Isidro | [ ] | no | | |
| 7 | Huancayo | Junín · El Tambo | [ ] | no | | |
| 8 | Puno | Puno · Puno | [ ] | no | | |
| 9 | Juliaca | Puno · Juliaca | [ ] | no | | |
| 10 | Arequipa | Arequipa · Cayma | [ ] | no | | |
| 11 | Cusco Magisterio | Cusco · Cusco | [ ] | no | | |
| 12 | Cusco Marcavalle | Cusco · Wanchaq | [ ] | no | | |
| 13 | Tacna | Tacna · Tacna | [ ] | no | | |
| 14 | Huaraz | Áncash · Huaraz | [ ] | no | | |
| 15 | Ica | Ica · Ica | [ ] | no | | |
| 16 | Ayacucho | Ayacucho · Ayacucho | [ ] | no | | |
| 19 | Ilo | Moquegua · Ilo | [ ] | no | | |

- Empresas (razones sociales) que existen: ⏳ [ ]
- Si todas las sedes son de **una sola empresa**, basta con decírmelo una vez.
- Los datos de ejemplo del sistema (sedes `SED-NNN`, responsables, etc.) se reemplazan por estas 17 sedes reales al conectar.

## D. Cómo entra la gente ⏳

| Decisión | Mi recomendación | Tu respuesta |
|---|---|---|
| Método de ingreso | Correo + contraseña (Supabase Auth); el PIN queda solo para el cambio rápido de usuario en el mismo equipo | ⏳ [aceptar / otra] |
| Correo del primer Superusuario (quien crea todo) | — | ⏳ [ ] |
| ¿Cada persona puede cambiar su contraseña? | sí | ⏳ [sí / no] |

Cuentas reales (después; para el primer paso basta el Superusuario):

| Nombre | Correo | Rol (plantilla) | Sede |
|---|---|---|---|
| [ ] | [ ] | [ ] | [ ] |

## E. Cómo vamos a ejecutar los cambios en la base ⏳

| Pregunta | Respuesta |
|---|---|
| ¿Te entrego los scripts SQL para pegarlos tú en SQL Editor? (lo seguro, y no hay *branch* de pruebas) | Recomendado: sí. ⏳ [sí / otra] |
| ¿Tienes el CLI de Supabase instalado y vinculado a este proyecto? | ⏳ [sí / no] |

---

## Cómo lo voy a hacer (para que no se rompa la web)

1. **`filiales` no se modifica**: ni columnas, ni nombres, ni políticas. La web sigue leyéndola exactamente igual.
2. El sistema usa `filiales` como **fuente única** de los datos básicos de la sede (nombre, dirección, ubicación, teléfonos, activo): se edita en un solo lugar.
3. Lo que solo le sirve al sistema (empresa, almacén central, correo, responsable, observaciones, código) va en una tabla **nueva** `erp_sedes_config`, 1 a 1 con `filiales.id`. Todas las tablas nuevas empiezan por `erp_`, así no chocan con las de la web.
4. Las tablas `erp_*` nacen con **RLS activo y sin acceso para `anon`**: solo entran cuentas autenticadas con permiso. Así la clave pública de la web no puede leerlas.
5. Primer alcance: sedes, roles, cuentas y permisos (inicio de sesión real). Después, matrículas, pagos y stock, siempre con `sede_id` en cada tabla.
6. Sin *branch* de pruebas: cada script será pequeño, reversible (con su script de deshacer) y de solo-agregar; tú lo ejecutas.
