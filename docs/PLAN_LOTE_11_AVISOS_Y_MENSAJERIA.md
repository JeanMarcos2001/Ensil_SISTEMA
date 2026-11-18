# Plan del Lote 11 — Avisos y mensajería

Documento de trabajo del **2026-11-18**. **Estado:** la entrega 11A está construida, probada, aplicada a la base real (migración 0026 y eventos, verificada por SQL el 2026-11-18) y subida a `main`; la 11B está por decidir. Es lo último del sistema que sigue solo en memoria. Se construye en **dos entregas**, cada una con su migración, y se sube a `main` solo cuando el usuario diga «sube».

## Por qué hace falta

Hoy un aviso (la campana) vive en el estado de **cada navegador**: lo que dispara una cuenta no le llega a otra. Y el cliente tampoco puede calcular «quién lo recibe» por su cuenta, porque una cuenta común **no lee las cuentas, roles ni funciones de las demás** (las políticas de la base lo impiden: `cuentas_leer`, `roles_leer`, `rol_funciones_leer`). Por eso quien resuelve los destinatarios tiene que ser **la base**.

## Entrega 11A — Avisos en la base + «Avisar a Logística» (migración 0026)

**Lo que cambia**
- Los avisos de la campana pasan a la base. Cada aviso guarda **qué pasó y dónde** (el evento, la sede de destino, de origen o del asunto, y quién lo pidió), **nunca a quién llega**: el destinatario se calcula al leer, con las funciones del rol y las sedes de cada cuenta (lo mismo que hoy hace `utils/notifications.ts`, ahora dentro de la base). Crear una cuenta con la función correcta en una sede hace que empiece a ver los avisos que ya iban hacia esa sede.
- Los eventos y sus reglas de destinatario **no se copian a mano a SQL**: se generan desde el registro de funciones (`EVENTS` en `capabilityRegistry.ts`) con `npx tsx scripts/doc-avisos-seed.ts` → `supabase/seed/avisos_eventos.sql` (tabla `aviso_eventos`). `check-notices-db.ts` falla si el archivo no coincide con el registro.
- **Quién emite:** solo con una de las funciones que declaran `emits` ese aviso en el registro (la base lo vuelve a comprobar) y alcanzando al menos una de las sedes del aviso. El aviso lleva la cuenta que lo emitió (el nombre sale de la cuenta, no de la pantalla).
- **Leído por cuenta** (tabla de lecturas: cada cuenta marca los suyos). Los avisos **solo se agregan** (no se modifican ni se borran).
- Las **alertas por regla** (cuotas vencidas, stock bajo el mínimo, contratos por vencer…) **no se guardan**: se siguen calculando al mostrar.
- La campana se **actualiza sola** (cada minuto y al volver a la pestaña) porque ahora los avisos los generan otras personas.
- El «Bienvenido» de ejemplo se retira.

**Botón «Avisar a Logística»** (pedido del usuario el 2026-11-11)
- En la verificación de materiales, cuando en la sede no hay stock de nada de la receta. Lo puede pulsar quien puede registrar la entrega de materiales (`op-verificacion:deliver`; no hay función nueva ni cambia ningún rol).
- Llega a quien tenga **«Preparar un envío»** (`log-envios:create`): la logística central, las mismas cuentas a las que ya llega el aviso de stock bajo el mínimo. Si nadie la tiene, a quien reciba los avisos de respaldo.
- Lleva la sede, la matrícula y el alumno, los artículos que faltan y la fecha de la primera asesoría.
- **Una vez por matrícula y por día** (si se pulsa otra vez, el sistema dice que ya se avisó).

**Lo que NO cambia**
- El sistema sigue sin enviar WhatsApp ni correos (§8.2 del Plan de lanzamiento).

## Entrega 11B — Mensajería interna (por decidir con el usuario)

La pantalla «Mensajería» hoy es una bandeja **de ejemplo**: tiene mensajes inventados y lo que se envía no llega a nadie. Opciones: hacerla real en la base (mensajes entre cuentas, con carpetas, leídos y destacados por cuenta), dejarla como está, o retirarla del menú hasta que sea real. Los adjuntos esperan al almacenamiento de archivos (Fase 5).
