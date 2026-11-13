# Lote 8 — Matrículas y dinero en la base (diseño)

Documento de trabajo del **2026-11-10**. Es el bloque más grande y delicado: aquí está el dinero. Se construye por fases y **no se sube a `main` hasta que todas estén hechas y verificadas** (una matrícula guardada sin sus pagos dejaría saldos huérfanos).

**Estado (2026-11-10): las 5 fases están hechas y verificadas** (`tsc`, `vite build`, las 38 comprobaciones y la prueba contra una copia de la base). **La migración 0015 y la carga de partida ya están aplicadas en la base real** (2026-11-10). Falta probar el recorrido por rol y subir a `main`.

**Cambios respecto al diseño original** (decididos al construirlo): los pagos llevan `partes` como columna jsonb (no una tabla aparte) y las cuotas llevan `cobros` jsonb (no una tabla `cuota_pagos`); las filas nuevas viajan marcadas con `_nueva` y completas, y los cambios solo con las columnas que cambiaron; el pago guarda la sede donde se cobró (`pagos.sede_id`); la acción dice qué tipo de movimiento de caja puede agregar; el stock de la venta, la reversa de una venta y la entrega de materiales va dentro de la misma llamada.

## 1. Qué entra y qué no

**Entra (pasa a la base):** matrículas, planes, cuotas, pagos (con sus partes), lo cobrado en cada cuota, movimientos de caja, notas de crédito, grupos promocionales y los **efectos** sobre ellos de todas las acciones que hoy los tocan: cobrar, matricular, reversar un pago, reversar un movimiento de caja, depósitos, refinanciar, cobrar mora, caída y reactivación aprobadas, cambio de programa y traslado aprobados, corregir datos de una matrícula, habilitar extensión, contrato y ficha.

**Se queda en memoria (próximo lote):** las **solicitudes** (caída, reactivación, cambio de programa, traslado) y su historial, las correcciones auditadas, los cierres de caja, la caja chica, los recordatorios de cobranza, la política de cobranza, la plantilla del contrato y la agenda de Psicopedagogía. Lo que esas acciones **cambian** en una matrícula o un plan sí se guarda; el registro de la solicitud en sí se pierde al recargar (se anota en los documentos). Los códigos de esas solicitudes que guarda una matrícula (`dropRequestId`…) son texto sin vínculo.

## 2. Principio: el cliente calcula, la base guarda y vigila

Las reglas de negocio (armar un plan, aplicar un pago, reversar, caída…) ya son funciones puras con sus `check-*`. **No se duplican en SQL.** Cada acción sigue calculando el estado nuevo con esas funciones y luego pide a la base que lo aplique con UNA llamada atómica: `aplicar_cambios_matricula(accion, cambios)`. La base:
1. pide la función del registro que corresponde a esa **acción** (tabla acción → funciones, comparada con el registro en `check-money-db.ts`);
2. solo deja tocar las tablas que esa acción puede tocar;
3. aplica los cambios en orden y **todo o nada**;
4. vuelve a comprobar los **invariantes del dinero** (abajo) sobre lo que quedó; si algo no cuadra, no se guarda nada.

El cliente calcula los cambios con un **comparador** genérico (`diffMoney(antes, después)`) que da, por tabla, las filas nuevas, las cambiadas y las quitadas. Después de aplicar, se vuelve a leer lo tocado: se muestra lo que de verdad quedó.

## 3. Tablas (hechos; lo derivable no se guarda)

| Tabla | Qué guarda | Notas |
|---|---|---|
| `matriculas` | id `MAT-AAAA-NNN`, fecha, alumno, sede, programa, nivel, asesor (personal), origen, observación, estado (Activa/Caída/…), titulares (ids en orden), tipo de pago, tarifario, precio asignado, grupo promocional, verificación de materiales, extensión, caída y reactivación (fechas y códigos de solicitud como texto), renovación, documentos (contrato y ficha, jsonb), quién y cuándo | **No** guarda los nombres del alumno, programa, nivel, sede, asesor, origen, tipo de pago ni tarifario (salen de sus ids al mostrar) |
| `planes` | id `PLN-NNN`, matrícula (única), tipo, total, saldo y estado (resumen que solo escribe `recomputePlan`) | |
| `cuotas` | id, plan, orden, nombre, monto, saldo, vencimiento, estado guardado, banderas (variable, mora, refinanciada, reactivada, anulada por caída, condonada), nota | «Vencida» nunca se guarda |
| `cuota_pagos` | lo cobrado en una cuota: id, cuota, pago, fecha, monto, comprobante | |
| `pagos` | id `PAG-NNN`, fecha, **constancia** del nombre del alumno, concepto, monto USD, medio, comprobante (tipo, serie, número), estado (Aprobado/Anulado), reversa (constancia), moneda, grupo, matrículas, sede, quién | **Solo se agrega**: después solo cambian el estado y la constancia de reversa |
| `pago_partes` | cada medio usado: moneda, monto, tipo de cambio, medio, banco, operación, evidencia, nota | Inmutable |
| `movimientos_caja` | id `CJ-NNN`, fecha y hora, ingreso o egreso, concepto, referencia, moneda, monto, tipo de cambio, equivalente USD, medio, banco, operación, sede, pago, matrículas, estado, constancia de reversa, lote de depósito, depósito, venta de artículo | **Solo se agrega**: después solo cambian estado, reversa y lote de depósito |
| `notas_credito` | id `NC-NNN`, serie, correlativo, origen, pago, constancia del alumno, comprobante original, monto, moneda, motivo, detalle, quién y cuándo | Solo se agrega |
| `grupos_promocionales` | id `PGR-NNN`, promoción, moneda, precio total, reparto por alumno (jsonb), pago | |

Los códigos los asignaba el cliente (`máximo + 1`) y se resolvió el 2026-11-13: ahora los asigna la base (migración 0019, `docs/REGLAS_DE_NEGOCIO.md`, «Códigos que asigna la base»).

## 4. Invariantes del dinero que la base vigila (por plan, pago y movimiento tocados)

1. Un pago tiene monto > 0; sus partes suman su monto (± 0,02 USD); no se borra; su monto, fecha y partes no cambian.
2. Un movimiento de caja tiene monto > 0 y, si es en soles con equivalente USD, su tipo de cambio; no se borra; solo cambian estado, reversa y lote de depósito.
3. Lo cobrado en una cuota no pasa de su monto; en una cuota abierta, `saldo = monto − cobrado` (± 0,01) y `0 ≤ saldo ≤ monto`.
4. El saldo del plan es la suma de los saldos de sus cuotas abiertas (± 0,01).
5. Un pago anulado tiene su constancia de reversa; una nota de crédito nombra un pago que existe.
6. Un alumno, una sede, un programa… que una matrícula nombra existen.

## 5. Quién ve y quién cambia

- Se **ve** por sede: una matrícula, su plan, sus pagos y su caja los ve quien alcanza esa sede (`app.ve_sede`). Esto también limita a los **alumnos y titulares por sede** (se ve a quien no tiene matrícula todavía, o con una matrícula en una sede que se alcanza).
- Se **cambia** solo con `aplicar_cambios_matricula`, con la función de cada acción: cobrar `op-pagos:register`; matricular `op-matriculas:create|renew`; reversar `op-pagos:reverse_payment` (y la nota de crédito, `op-pagos:credit_note`); caja `op-caja:*`; refinanciar y mora `op-cobranza:*`; caída, cambios, traslado y reactivación `op-matriculas:approve_*`; corregir `op-matriculas:edit_data`; extensión `op-matriculas:extend`; documentos `op-matriculas:documents`; verificación `op-verificacion:deliver`.

## 6. Fases

1. **Base de datos** (migración 0015): tablas, disparadores de inmutabilidad, función `aplicar_cambios_matricula`, alcance por sede (también de alumnos y titulares), permisos. Prueba contra Postgres en memoria.
2. **Traducción y comparador** (`utils/moneyDb.ts`): filas ↔ modelo, vista con los nombres derivados, comparador, carga de partida desde los datos de ejemplo.
3. **Gancho `useMoney`, servicios y repositorio**: estado, `commit(cambios, acción)`, relectura.
4. **Acciones del contexto**: cada una calcula y llama a `commit`. Páginas que esperan.
5. **Pruebas** (`check-money-db.ts`), documentos, carga de partida y verificación con el navegador.

## 7. Riesgos y decisiones

- Los pagos reales no se prueban con sesión iniciada hasta que el usuario pruebe; por eso la base vigila los invariantes aunque el cliente falle.
- La agenda (asesorías) de una matrícula nueva sigue en memoria: al recargar, la primera asesoría de esa matrícula vuelve a pedirse (el próximo lote).
- Los datos de ejemplo se cargan con un día de referencia fijo; los vencimientos de ejemplo envejecen con los días (es lo esperado en una base de prueba).
