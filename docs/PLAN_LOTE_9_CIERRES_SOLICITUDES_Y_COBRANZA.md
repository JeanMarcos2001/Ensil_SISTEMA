# Lote 9 — Lo que queda en memoria del bloque de dinero (diseño)

Documento de trabajo del **2026-11-12**. Cierra el bloque de dinero: pasa a la base lo que el Lote 8 dejó en memoria. Se construye en **tres entregas**, cada una con su migración (más chicas = más seguras de pegar y probar) y se sube a `main` solo cuando el usuario diga «sube».

| Entrega | Qué pasa a la base | Migración |
|---|---|---|
| **9A** | Cierres y reaperturas de caja (por sede y moneda) y caja chica (un fondo por sede) | 0017 |
| **9B** | Solicitudes (caída, reactivación, cambio de programa, traslado) con su historial y el registro de correcciones de una matrícula | 0018 |
| **9C** | Política de cobranza, recordatorios enviados y plantilla del contrato | 0021 (la 0019 y la 0020 son las de los códigos asignados por la base) |

Queda fuera de este lote (tienen su propio lote): la agenda de Psicopedagogía y los avisos/mensajería (Plan de lanzamiento §6.7 y §6.8).

## Decisiones del usuario (2026-11-12)

1. **Cada sede cierra su propia caja.** Un cierre es de una sede y una moneda (Caja PEN y Caja USD de Piura, de Chiclayo…). Los movimientos sin sede (caja general) los cierra quien alcanza todas las sedes. Quien trabaja en una sede solo ve y cierra lo suyo.
2. **La caja chica es un fondo por sede**, con su propio monto asignado y tope por gasto, sus gastos y sus cierres.

## Principios (los de siempre)

- La regla es una función pura de `src/utils` con su `check-*`; **la base vuelve a comprobarla** (el cliente calcula, la base guarda y vigila). Las pantallas esperan el resultado (`await`) y vuelven a leer lo que quedó guardado.
- Nadie escribe las tablas directo: solo funciones de la base que piden la función del registro, comprueban que la sede se alcance y dejan quién y cuándo (el nombre sale de la cuenta, no de la pantalla).
- **Lo que se registra no se borra**: un cierre solo cambia al reabrirse (con motivo), un movimiento de caja chica solo cambia al reversarse (con motivo).
- Lo derivable no se guarda: el saldo esperado de un cierre **lo calcula la base** al cerrar (no se confía en el número de la pantalla); «desactualizado» (el cierre cambió porque entró un cobro con fecha cubierta) se calcula al mostrar.

## 9A — Cierres de caja y caja chica por sede (migración 0017)

**Estado (2026-11-12): hecho y verificado en el código** (`tsc`, `vite build`, los 40 `check-*`, la migración probada contra Postgres en memoria con 103 casos y su «deshacer»). **Falta que el usuario pegue la migración y la carga de partida, y probar en el navegador; no se sube a `main` antes** (la aplicación lee las tablas nuevas al iniciar sesión).

**Cambios respecto al diseño** (decididos al construirlo): el bloqueo de días cerrados va en un disparador propio de `movimientos_caja` (no toca la función `aplicar_cambios_matricula` del Lote 8); la lista de categorías, medios y motivos de la caja chica se repite en la base y `check-cash-boxes-db.ts` la compara con la del sistema; el reporte de caja chica de todas las sedes suma el fondo y lo que falta reponer sede por sede.

### Tablas

| Tabla | Qué guarda | Notas |
|---|---|---|
| `cierres_caja` | id `CIE-NNN` (lo asigna la base), ámbito (`caja` o `caja-chica`), moneda, **sede** (vacía = caja general, solo en `caja`), fecha del cierre, esperado, contado, diferencia, nota, quién y cuándo cerró, estado (Cerrada / Reabierta) y, si se reabrió, quién, cuándo y por qué | Una sola cerrada por caja y fecha. No se borra. La caja chica es siempre en soles y de una sede |
| `caja_chica_fondos` | sede (clave), monto asignado, tope por gasto, quién y cuándo | Sin fila = valores de partida (S/ 1 000 y tope S/ 200) |
| `caja_chica_movimientos` | id `CCH-NNN`, **sede**, fecha, ingreso o egreso, categoría, concepto, monto (S/), medio, referencia, evidencia (nombre del archivo), observaciones, quién, estado (Aplicado / Reversado) y la constancia de la reversa | **Solo se agrega**: después solo cambia el estado y la constancia de reversa |

### Funciones de la base (todas piden su función del registro y que la sede se alcance)

- `cerrar_caja(ámbito, moneda, sede, fecha, contado, nota)` — `op-caja:close_box` / `op-caja-chica:count`. La base calcula el esperado con los movimientos **aplicados** de esa sede y moneda hasta esa fecha (hora de Lima); la fecha no puede ser futura ni igual o anterior a la última cerrada; si hay diferencia, la nota es obligatoria (mínimo 5 letras).
- `reabrir_cierre(cierre, motivo)` — `op-caja:reopen_box` / `op-caja-chica:reopen_box`. Solo el **último** cierre vigente de esa caja, con motivo (mínimo 5 letras).
- `registrar_movimiento_caja_chica(...)`, `reversar_movimiento_caja_chica(...)`, `definir_fondo_caja_chica(sede, asignado, tope)` — con las reglas de `pettyCash.ts` (fecha no futura ni en un día cerrado; un egreso no pasa del tope ni deja el saldo en negativo; un ingreso solo se reversa si el saldo que queda cubre lo gastado; el tope no supera el fondo).
- **Un día cerrado no admite movimientos a mano:** un disparador de `movimientos_caja` rechaza un movimiento nuevo (ingreso, egreso o venta, sin pago asociado) o la reversa de uno, si su fecha ya está cubierta por un cierre de esa sede y moneda. Los cobros y las reversas de pagos (con pago asociado) siguen entrando: el cierre queda «desactualizado» y se avisa (igual que hoy).

### Quién ve

Se ve por sede (`app.ve_sede`; la caja general, quien alcanza todas) y con la función que muestra cada cosa (la misma lista de `app.puede_leer_caja()` para la caja; `op-caja-chica:view` para la caja chica).

### Pantallas que cambian

Sistema → Cierres (columna Sede; cerrar eligiendo sede), Caja (el estado y «Arqueo y cierre» son de la sede que se ve), Caja chica (el fondo y los movimientos son de la sede elegida; en vista global se elige sede), Reportes de caja y la auditoría (traen la sede).

### Datos de partida

`supabase/seed/caja_chica_de_ejemplo.sql` (generado): el fondo de Piura y los 3 movimientos de ejemplo que mostraba la pantalla (ahora de esa sede).

## 9B — Solicitudes y correcciones de matrículas (migración 0018)

**Estado (2026-11-12): hecho y verificado en el código** (`tsc`, `vite build`, los 41 `check-*`, la migración probada contra Postgres en memoria con más de 120 casos —también con los payloads que arma el propio cliente— y su «deshacer»). **Falta que el usuario pegue la migración y la carga de partida; no se sube a `main` antes** (la aplicación lee las tablas nuevas al iniciar sesión). Diseño:

### Tablas

| Tabla | Qué guarda | Notas |
|---|---|---|
| `solicitudes_matricula` | UNA tabla para las cuatro clases de solicitud (`tipo`: Caída, Reactivación, Cambio de programa, Traslado de sede). Código `CAI-NNN` (caídas) o `SOL-NNN` (las demás), matrícula, motivo, detalle, `fecha_efecto` (solo caídas), `datos` (lo propio de cada tipo: fecha de reinicio, programa y nivel destino, sede destino y primera asesoría), estado (Pendiente / Aprobada / Rechazada), quién y cuándo resolvió, nota de la resolución y `efectos` (lo que se hizo al aprobar, para el historial) | **Nace pendiente y después solo se aprueba o se rechaza** (nunca se borra ni se cambia otra cosa); una resuelta no vuelve a cambiar. Quién y cuándo (pidió y resolvió) salen de la cuenta, no de la pantalla. Una sola pendiente por matrícula (una de caída y una de cambio, como hoy en pantalla) |
| `correcciones_matricula` | Código `COR-NNN`, matrícula, campo, etiqueta, valor de antes y de después, motivo, quién y cuándo | **Solo se agrega** (un error se corrige con otra corrección). Solo puede nacer junto con un cambio de esa misma matrícula |

Lo derivable no se guarda: el alumno de la solicitud sale de su matrícula.

### La misma operación atómica (`aplicar_cambios_matricula`)

La función de la base de la matrícula y el dinero (Lote 8) pasa a poder tocar también estas dos tablas, **en la misma llamada**, así una aprobación y su efecto (la matrícula y el plan) quedan guardados juntos o no se guarda nada:

- **Pedir** (`solicitar_caida`, `solicitar_reactivacion`, `solicitar_cambio_programa`, `solicitar_traslado`): agrega UNA solicitud pendiente; pide la función de pedir de ese tipo (`op-matriculas:req_*`), la sede de la matrícula alcanzable y que la matrícula esté en el estado que ese tipo pide (la caída, el cambio y el traslado, activa; la reactivación, caída).
- **Aprobar** (`caida`, `reactivacion`, `cambio_programa`, `traslado`): cambia la matrícula y el plan **y** deja la solicitud aprobada con sus efectos (y la corrección en el registro, salvo en la caída). La base comprueba que el efecto cuadra con lo aprobado (la matrícula quedó caída y nombra esta solicitud; el programa y nivel o la sede quedaron como se pidió).
- **Rechazar** (`rechazar_caida`, `rechazar_reactivacion`, `rechazar_cambio_programa`, `rechazar_traslado`): solo deja la solicitud rechazada, con su nota (mínimo 5 letras).
- **Corregir** (`corregir`): además de la matrícula, agrega las correcciones al registro.
- **Quien pidió no resuelve** (salvo el Superusuario): ahora lo exige también la base (compara la cuenta, no el nombre).
- Se ve por sede (`app.ve_matricula`); las solicitudes las leen las funciones que, en el registro, leen «Solicitud sobre una matrícula» (se suma «Ver matrículas», que muestra las pendientes en su lista) y las correcciones, quien lee matrículas.

### Qué cambia en el sistema

`useMoney` guarda además las solicitudes y las correcciones (entran en el borrador y en el comparador `diffMoney`); `requestEnrollmentDrop`, `requestReactivation`, `requestProgramChange` y `requestTransfer` pasan a ser asíncronas; en cada aprobación el historial (`effects`) y el registro de correcciones se arman antes de guardar y viajan con la matrícula. Lo que sigue en memoria (agenda, avisos) se aplica solo después de que la base guardó.

**Los códigos** (`CAI-`, `SOL-`, `COR-`) los asigna la base (migración 0019, 2026-11-13): ver `docs/REGLAS_DE_NEGOCIO.md` («Códigos que asigna la base»). Antes los proponía la pantalla con lo que veía de su sede.

**Datos de partida:** `supabase/seed/solicitudes_de_ejemplo.sql` (generado desde `src/data/seedPeople.ts`): la solicitud de caída de ejemplo (CAI-001, ya aprobada) que la matrícula MAT-2026-003 ya nombra.

## 9C — Cobranza y plantilla del contrato (migración 0021) — por diseñar al llegar

Política de cobranza (una por grupo o por empresa: decidir al llegar), recordatorios enviados (no se envían solos: se preparan y se registran) y la plantilla del contrato con sus versiones.

## Verificación de cada entrega

`tsc`, `vite build`, todos los `check-*` en verde, la migración probada contra Postgres en memoria (con su «deshacer») y probada en el navegador con la sesión del usuario **sin guardar nada** hasta que él lo pida.
