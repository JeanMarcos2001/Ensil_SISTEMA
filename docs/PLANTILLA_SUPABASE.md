# Plantilla de datos para conectar el sistema a Supabase (paso 10)

Rellena lo que esté marcado con ⏳ y pásamelo en el chat (o pega este archivo completo).
**Nunca** pegues la clave `service_role`, la contraseña de la base ni contraseñas de personas.
Estado al 2026-11-04.

## Decisión tomada: proyecto de Supabase aparte para el sistema ✅

El sistema **no** comparte el proyecto de la web y el panel (`jtrugvxgztnxbhwjtiou`). Motivos:
- Aísla el dinero, los pagos y los datos de menores de un proyecto con políticas abiertas y sin rama de pruebas (ver `HALLAZGOS_PROYECTO_WEB_SUPABASE.md`).
- Esquema limpio: RLS desde el primer día, `sede_id` en cada tabla, roles y cuentas propios.
- Cero riesgo para la web y el panel en producción.

La conexión con la web (por ejemplo que una entrevista agendada llegue al sistema) se resolverá más adelante por un canal controlado, no compartiendo tablas.

## Resumen: qué falta

| Bloque | Estado | Qué falta |
|---|---|---|
| A. Proyecto nuevo | ✅ | Creado y conectado (Auth responde). Pendiente solo regenerar la clave secreta que se pegó en el chat. |
| C. Sedes | 🟡 | Las 17 sedes están listadas. Falta la empresa de cada una y confirmar el almacén central. |
| D. Cómo entra la gente | 🟡 | Método y correo del Superusuario ✅. Falta elegir el servicio de correo (se puede dejar para antes de crear cuentas reales). |
| E. Cómo ejecutar los cambios | 🟡 | CLI instalado, con sesión y enlazado ✅. Falta decidir scripts pegados vs `db push`. |
| G. Almacén central | ✅ | Separación aceptada y **hecha en el código** (2026-11-05). Falta solo a qué empresa pertenece. |

---

## A. Proyecto nuevo de Supabase ✅

**Cómo crearlo** (supabase.com → New project):
| Campo | Qué poner |
|---|---|
| Nombre | `ensil-sistema` (o el que prefieras) |
| Región | **South America (São Paulo)**, la más cercana a Perú |
| Contraseña de la base | Una larga y única; **guárdala en tu gestor de contraseñas y no me la pases** |
| Plan | Para desarrollo basta el gratis. **Antes de cargar datos reales, pasar a Pro**: el gratis pausa el proyecto tras un tiempo sin uso y no incluye respaldos (verifica precios vigentes) |

**Datos que me pasas** (Project Settings → API):
| Dato | Valor |
|---|---|
| URL del proyecto | ✅ `https://bgatbloodorruzjmbvxu.supabase.co` |
| Clave pública | ✅ `sb_publishable_…` (recibida; también la `anon` antigua) |
| Referencia del proyecto | ✅ `bgatbloodorruzjmbvxu` |
| Plan | Gratis por ahora; pasar a Pro **antes del primer dato real** (matrícula o pago) |
| ⚠️ Clave secreta (`sb_secret_…`) | Se pegó en el chat el 2026-11-04. **No se guardó en ningún archivo** y nada del sistema la usa; hay que **eliminarla** en Project Settings → API Keys → «Secret keys» (la que se necesite luego se crea nueva) |
| Región | `us-east-1` (no São Paulo); se deja así: la diferencia desde Perú es pequeña |
| ⚠️ Clave de Resend (`re_…`) | Se pegó en el chat el 2026-11-04. **No se guardó en ningún archivo**; hay que **eliminarla** en Resend → API Keys y crear otra cuando se configure el correo; esa nueva la escribe el usuario directamente en Supabase (Authentication → SMTP), sin pasarla por el chat |

La clave pública puede compartirse; la `service_role` **nunca**. Irá en `.env.local` (ignorado por git).
⚠️ `.env.local` hoy apunta todavía al proyecto de la web: se reemplaza por el nuevo en cuanto lo tenga (el código del sistema aún no lo usa).

## C. Sedes del sistema 🟡

> **Esta tabla NO es la tabla real de la base**: es solo una hoja para juntar datos. La tabla real la diseño yo en la migración.
> Las columnas «Correo» y «Responsable» se pueden **dejar vacías**: el correo es opcional y se agrega después, y el responsable es una persona del módulo Personal, que aún no existe en la base.
> La columna «¿Almacén central?» queda **en revisión** (ver bloque G): probablemente el almacén deje de ser una sede.

Las 17 sedes de la web (confirmado: **son todas**; los ids 17 y 18 no existen). Sus datos públicos (dirección exacta, referencia, ubicación, teléfonos) los copio yo de la web al script de carga; tú solo completas lo que el sistema necesita y la web no tiene.

| id web | Nombre | Departamento · Distrito | Empresa ⏳ | ¿Almacén central? | Correo (opcional) | Responsable (opcional) |
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

**Hay varias empresas** (confirmado 2026-11-04), cada una con un grupo de sedes. La empresa es una entidad aparte (Organización → Empresas); la sede solo apunta a la suya. Completa la empresa de cada sede en la tabla de arriba y estos datos de cada empresa (el RUC es obligatorio: las fichas y contratos lo imprimen):

| Empresa (razón social) | RUC | Nombre comercial | Estado |
|---|---|---|---|
| ⏳ [ ] | [ ] | [ ] | Activo |
| ⏳ [ ] | [ ] | [ ] | Activo |

## D. Cómo entra la gente ⏳

| Decisión | Mi recomendación | Tu respuesta |
|---|---|---|
| Método de ingreso | Correo + contraseña (Supabase Auth); el PIN queda solo para el cambio rápido de usuario en el mismo equipo (tarjetas de atajo) | ✅ Aceptado |
| Correo del primer Superusuario (quien crea todo) | — | ✅ `marketing@ensilperu.com` (confirmado el 2026-11-04) |
| ¿Cada persona puede cambiar su contraseña? | sí | ✅ Sí (recuperación con código al correo) |

Las cuentas reales de cada sede se cargan después; para el primer paso basta el Superusuario.

### D.2 Correos, códigos y contraseñas (cómo funcionará)

1. **Validar que el correo existe:** solo se comprueba **enviando un mensaje**. Al crear una cuenta, el Superusuario la **invita** por correo; la persona abre el enlace y elige su propia contraseña. Hasta que no lo haga, la cuenta no entra. Esa invitación necesita la clave secreta, por eso se hace en una **función de Supabase (Edge Function)** que comprueba que quien la llama es Superusuario; la clave secreta nunca está en el navegador ni en el repositorio.
2. **Enviar correos reales:** el envío que trae Supabase es solo de pruebas (muy limitado). Para producción hay que configurar un **servicio de correo propio (SMTP)**, con el dominio autenticado (SPF, DKIM, DMARC) para que no caiga en spam. **Recomendación: Resend (plan gratis)** enviando desde un subdominio (p. ej. `envios.ensilperu.com`) para no tocar el SPF de Google Workspace; alternativa gratuita: Brevo. Evitar el SMTP de Google Workspace ligado a una persona (si esa persona cambia su clave o se va, dejan de llegar los códigos). Verificar los límites gratuitos vigentes antes de contratar. ✅ Comparado el 2026-11-04: Resend gratis = 3.000 correos/mes, 100/día, 3 dominios; Brevo gratis = 300/día pero es una herramienta de campañas. **Elegido: Resend.** El DNS de `ensilperu.com` lo sirve `wperu.com` (ns21/ns22.wperu.com), donde se compró el dominio; el correo (MX) es de Google Workspace; `envios.ensilperu.com` está libre. Nota: el SPF actual del dominio (`v=spf1 +a +mx +ip4:… include:relay.mailchannels.net ~all`) no incluye a Google (`_spf.google.com`); revisarlo aparte, sin tocarlo para esto.
   - **Cuentas con correo no institucional** (p. ej. Psicopedagogía): el sistema **no** restringe el dominio del correo; la invitación llega a cualquier correo. La cuenta se desactiva desde el sistema (no depende del buzón).
3. **Olvidé mi contraseña:** la persona pide un código al correo (Supabase puede enviar un código de 6 dígitos o un enlace) y define una contraseña nueva. No interviene nadie más.
4. **El Superusuario NO ve ni administra contraseñas** (nadie puede: se guardan cifradas). Lo que sí hace: invitar, cambiar el correo, activar/desactivar, forzar el cierre de sesión y **enviar un restablecimiento** al correo de la persona; en caso extremo, una contraseña temporal que obliga a cambiarla. Así cada acción queda a nombre de quien la hizo (trazabilidad).
5. **PIN de atajo:** la primera vez cada persona entra con correo y contraseña en ese equipo; luego aparece como **tarjeta** y se vuelve a entrar con su PIN. Es una comodidad contra cambios accidentales, no seguridad fuerte: la sesión se cierra por inactividad.

## E. Cómo vamos a ejecutar los cambios en la base ⏳

| Pregunta | Respuesta |
|---|---|
| ¿Cómo se ejecutan los scripts SQL? | ✅ Con `npx supabase db push` desde las migraciones del repositorio (decidido 2026-11-04; pedirá la contraseña de la base la primera vez) |
| ¿Tienes el CLI de Supabase instalado? (permite versionar las migraciones en el repositorio) | ✅ Instalado en el proyecto: `npx supabase --version` → 3.0.0. ✅ `login` hecho por ti; ✅ `link` al proyecto `bgatbloodorruzjmbvxu` hecho (2026-11-04, sin contraseña de la base: se pedirá solo al subir migraciones con `db push`) |

**Nota sobre el CLI:** se usa con `npx supabase` (instalado como dependencia de desarrollo; la instalación global con npm no está soportada). Una sola vez, en tu terminal: `npx supabase login` (abre el navegador) y `npx supabase link --project-ref bgatbloodorruzjmbvxu` (te pide la contraseña de la base: la escribes tú, yo no la veo).

## G. Almacén central y ventas ⏳ (decisión de diseño)

Hoy el almacén central **es la filial Los Olivos** marcada con `isWarehouse`, y el stock se guarda por *artículo + filial*. Eso significa que Los Olivos vende desde el mismo stock con el que abastece a las demás filiales: **mezcla el stock de ventas con el del almacén**.

**Propuesta (mi recomendación):** el almacén central pasa a ser una **entidad aparte**, sin sede ni empresa de alumnos, con su propio stock.
- Cada sede, **incluida Los Olivos**, tiene su **propio stock de venta** y recibe del almacén igual que las demás.
- El almacén **no vende**: solo recibe compras, envía a las sedes y recibe devoluciones.
- Los Olivos tiene su Administrador de sede (sin funciones del almacén) y el almacén tiene sus propias cuentas de Almacén.
- Impacto en el código: se reemplaza `Branch.isWarehouse` por un almacén propio y el stock, envíos, transferencias y recepciones pasan a usar «ubicación de stock» (el almacén o una sede). Conviene hacerlo **antes** de crear las tablas de stock.

| Pregunta | Respuesta |
|---|---|
| ¿Aceptas separar el almacén central de la sede Los Olivos? | ✅ Sí (2026-11-04) |
| ¿Se quedará el almacén físicamente en Los Olivos? (no afecta al modelo, solo a la dirección del almacén) | ⏳ [ ] |
| ¿A qué empresa pertenece el almacén? (si las sedes son de empresas distintas, enviar libros a una sede de otra empresa es una operación entre empresas: conviene confirmarlo con el contador) | ⏳ [ ] |

**Diseño propuesto (resumen):** una «ubicación de stock» puede ser el almacén o una sede. El stock se calcula a partir de **movimientos** que nunca se editan (entrada de compra, despacho, recepción, venta, devolución, ajuste con motivo). Un despacho descuenta del almacén al salir y suma a la sede al recibir; lo que queda en medio está «en tránsito», y una diferencia al recibir se registra con motivo. Entre sedes no hay traslado directo (regla vigente). Inventario inicial = un movimiento de ajuste por ubicación.

---

## Cómo lo voy a hacer

1. **Primer alcance:** sedes, roles, cuentas y permisos con inicio de sesión real (Supabase Auth). Después matrículas, pagos y stock, siempre con `sede_id` en cada tabla y la sede decidida por la base (RLS), no pantalla por pantalla.
2. **Todas las tablas nacen con RLS activo y sin acceso para `anon`.** Entra solo quien tiene sesión **y** la función necesaria (las mismas funciones del registro, `utils/capabilityRegistry.ts`).
3. **Las sedes no se borran**, solo se inactivan; las claves entre tablas usan `ON DELETE RESTRICT`.
4. **Los scripts son migraciones** (`supabase/migrations/AAAAMMDDHHMMSS_nombre.sql`; el CLI exige esa marca de tiempo) en el repositorio, pequeñas y con su script de deshacer en `supabase/deshacer/`; el sistema sigue funcionando con datos de ejemplo hasta que cada pantalla se pase a la base.
   - **0001 `acceso_base`** (redactada, auditada contra el código y probada en un Postgres en memoria, 72 comprobaciones; **subida el 2026-11-05** con la versión `20261105181142` (Empresas y Filiales del sistema ya leen y guardan en ella; la **0002** `sedes_codigo_automatico` le suma el código `FIL-NNN` automático y quita `id_web`; la **0003** `almacenes_funciones` da permisos por función a los almacenes y exige un solo almacén central activo; los **roles y sus funciones** ya los lee y guarda el sistema, y sus 5 roles de partida se cargan con `supabase/seed/roles_de_partida.sql`; las **cuentas** las escribe la Edge Function `usuarios`, desplegada el 2026-11-05), 8 tablas con RLS y 0 permisos para `anon`): empresas, sedes, almacenes, roles, funciones por rol, cuentas y sus sedes/almacenes, con RLS y sin acceso `anon`. La primera cuenta se crea con `supabase/seed/primer_superusuario.sql` (no es migración).
   - **Auditoría de la 0001 contra el código (2026-11-04)** — ajustes hechos: (1) el código de sede lo escribe la persona y la pantalla no exige formato: la base acepta 2–20 letras/números/guion y compara sin mayúsculas; (2) el alcance «Todas» de una cuenta existe hoy (`scopeOfUser`): se agregó `cuentas.todas_las_sedes`; (3) las funciones `org-empresas:delete` y `org-filiales:delete` existen en el registro: se agregó el borrado con ellas, protegido por `RESTRICT`; (4) al separar el almacén, su personal ya no se asigna a una sede: se agregó `cuenta_almacenes`. Los ids de las 186 funciones del registro caben en el formato de la base y las 13 que usan las políticas existen.
   - **Reglas que NO quedan en la base** y deberá aplicar la Edge Function de usuarios (hoy están en `roleBuilder.ts`, `session.ts` y `staffAccess.ts`): rol activo y solo el Superusuario da el rol del sistema (`accountRoleError`), límite de cuentas por sede (`seatLimitError`), nadie cambia su propio rol/estado ni se elimina (`selfAccountError`), una sola cuenta por trabajador y sedes dentro de sus asignaciones (`validateLinkedUser`), PIN (`session.ts`). La base solo garantiza el último Superusuario, el rol del sistema, la unicidad y la integridad.
   - **Hecho en el código el 2026-11-05:** el almacén separado (`Warehouse`, `ALM-NNN`, `stockLocations`, sin `Branch.isWarehouse`; `logisticsRoutes.ts`, `roleBuilder.ts`, `roleMatrix.ts`, `Branches.tsx` y la pantalla nueva Organización → Almacenes). **Ver ≠ mover:** `alcance_total` (todas las sedes) VE el almacén (`app.ve_almacen_lectura`), pero solo quien lo tiene asignado (`cuenta_almacenes`) o el Superusuario lo MUEVE (`app.ve_almacen`); la misma regla vive en `scopeOfUser` y en las contrapartes del código.
   - **Pendientes que no son de la 0001:** los ids de cuenta pasarán de `USR-001` a uuid (aceptado; 12 usos de `currentUser.id`, el resto de las pantallas guarda el nombre, 60 usos); las sedes de las cuentas de personal se derivarán de las asignaciones cuando Personal pase a la base (hoy `syncPatch` ya las mantiene alineadas; en la base `cuenta_sedes` dejará de ser un dato propio para ser una vista de las asignaciones activas con acceso al sistema); las asignaciones de Personal todavía no pueden apuntar a un almacén.
   - Siguientes: 0002 carga de las 17 sedes · 0003 bitácora de cambios · Edge Function de usuarios (invitar, desactivar, cambiar correo) · luego matrículas, pagos y stock.
5. **Las reglas de negocio siguen en `src/utils/*.ts`** (puras, con sus `check-*`); la base las respalda con restricciones y RLS, sin duplicar la lógica en SQL salvo lo imprescindible (seguridad e integridad).

## Personal y asignaciones en la base de datos (2026-11-06)

- **Migración 0004** (`supabase/migrations/20261106100000_personal_y_asignaciones.sql`; para deshacer, `supabase/deshacer/20261106100000_personal_y_asignaciones.down.sql`): tablas `personal` (ids `STF-NNN`, código de 6 dígitos, documento único) y `asignaciones` (ids `ASG-NNN`, una sede **o** el almacén, una principal activa por persona, sin repetir lugar + área activos), políticas RLS por función (`per-personal:*`, `per-asignaciones:*`), disparadores que mantienen la cuenta (nombre, documento, teléfono, sedes y almacén) y la desactivan al dar de baja, y la función `inactivar_personal`. Los errores de negocio de los disparadores usan el código `EN001` y su texto (en español) se muestra tal cual.
- **Cómo aplicarla:** pegar el archivo completo en el SQL Editor de Supabase y ejecutarlo; después registrar la versión con `insert into supabase_migrations.schema_migrations (version, name) values ('20261106100000', 'personal_y_asignaciones');`. Verificar con `select count(*) from public.personal;` (debe dar 0) y `select tablename from pg_tables where schemaname = 'public' and tablename in ('personal','asignaciones');`.
- **Después** hay que volver a desplegar la Edge Function `usuarios` (ahora también lee `personal` y `asignaciones`); desplegarla **antes** de la migración rompería la creación de cuentas.
- Lo que cambia para las cuentas: `cuentas.personal_id` ahora es obligatorio salvo para el rol del sistema, y nombre/documento/teléfono/sedes/almacén dejan de escribirse a mano.

## Asignaciones sin cargo y almacén solo de Logística (2026-11-06)

- **Migración 0005** (`supabase/migrations/20261106120000_asignaciones_sin_cargo.sql`; para deshacer, `supabase/deshacer/20261106120000_asignaciones_sin_cargo.down.sql`): quita la columna `cargo` de `asignaciones` (el cargo sale del contrato) y agrega la restricción `asignaciones_almacen_solo_logistica` (una asignación al almacén solo puede ser del área «Logística»). Si ya hubiera asignaciones al almacén con otra área, la migración se detiene con un aviso y no cambia nada.
- **Cómo aplicarla:** pegar el archivo completo en el SQL Editor y ejecutarlo; después registrar `insert into supabase_migrations.schema_migrations (version, name) values ('20261106120000', 'asignaciones_sin_cargo');`. **Hacerlo antes de guardar asignaciones con la versión nueva de la pantalla**: la pantalla ya no envía el cargo y, hasta que se quite la columna, la base lo seguiría exigiendo.
- Después, volver a desplegar la Edge Function `usuarios` (solo cambia un mensaje de error).
