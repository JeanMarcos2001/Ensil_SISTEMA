# Plan — Ajustes de Nueva matrícula, primera asesoría, pagos y vigencia

> Estado: **ejecutado** (2026-10-20). Incorpora las respuestas del usuario; detalle de lo hecho en `docs/REVISION_PROYECTO.md` (última sección).
> Alcance autorizado: asistente de matrícula (pasos Alumnos, Programa y Pago), Pagos / Planes (registro de pagos), Psicopedagogía (bloques de la agenda) y Matrículas (vigencia). Todo lo demás queda intacto.

## Resumen

| # | Frente | Tamaño | Riesgo |
|---|---|---|---|
| A | Paso 3 «Alumnos»: interruptor Existente/Nuevo en la esquina del título; sin teléfono para dependientes | Pequeño | Bajo |
| C | Pagos: **un solo modelo y un solo formulario** de pago en matrícula, Pagos y Planes | Grande | Medio |
| B | Tres tipos de sesión sin mezclarse; primera asesoría exclusiva y sin cupo; regla de 24 h para cancelar/reprogramar | Mediano | Medio |
| D | Vigencia del programa: duración base + garantía desde la primera asesoría, alertas y «Habilitar extensión» | Grande | Medio |

Orden: **A → C → B → D**. Cada frente se verifica (`tsc`, `vite build`, scripts `check-*`, prueba en navegador) antes de pasar al siguiente, y se documenta en `docs/REVISION_PROYECTO.md`.

---

## A. Paso 3 «Alumnos»

1. `StepStudents` pasa `title="Alumno N"` y el botón de eliminar como `headerActions` a `PersonForm` (que ya los dibuja como en Titulares): título a la izquierda, interruptor Existente/Nuevo (y eliminar) en la esquina superior derecha. Se elimina el encabezado duplicado.
2. Nueva propiedad `hidePhone` en `PersonForm`: en modo **apoderado** los alumnos (dependientes) no muestran Teléfono, ni en el formulario ni en la tarjeta del alumno ya registrado; el teléfono queda vacío al guardar. En modo **independiente** la persona es titular y alumno: su teléfono se sigue pidiendo en el paso Titulares.
3. Prueba: un dependiente sin teléfono se valida y se guarda.

Archivos: `StepStudents.tsx`, `fields.tsx`, `check-enrollment.ts`.

---

## C. Pagos — análisis y solución

### Diagnóstico

Hay **tres formularios distintos** para el mismo acto («cobrar»): paso Pago del asistente, Pagos → Registrar pago y Planes → Pagar cuota. Cada uno pide cosas distintas:

| Dato | Asistente (matrícula) | Pagos | Planes |
|---|---|---|---|
| Moneda / monto / TC | ✅ | ✅ | ⚠️ la moneda no se guarda ni pide TC |
| Medio de pago | ✅ 6 medios | ✅ 4 medios distintos («Yape / Plin», «Otros») | ⚠️ 3 medios en minúsculas |
| Banco · N° de operación | ✅ | ❌ | ❌ |
| Comprobante (boleta / factura, serie, número) | ❌ | ✅ | ⚠️ un solo texto libre |
| Evidencia | opcional | obligatoria | solo dibujada |
| Varias partes (Yape + efectivo) | ✅ | ❌ | ❌ |

Y hay un error conceptual: en la matrícula `Payment.receipt` guarda los **números de operación** (lo que recibe la empresa) en vez del **comprobante** (lo que entrega la empresa). Por eso Pagos muestra «S/N» u operaciones donde debería ir la boleta.

Dos cosas distintas que hoy se mezclan:
- **Lo que recibe la empresa** (por cada medio de pago usado): moneda, monto, TC, medio, banco, N° de operación, evidencia (voucher / captura).
- **Lo que entrega la empresa** (una vez por pago): comprobante — tipo (boleta / factura), serie y número.

### Conclusión (diseño)

**Un pago = un comprobante + una o varias partes.** Si el cliente paga una cuota con Yape y efectivo a la vez, se emite *una* boleta por el total (no una por medio); en cambio, dos cuotas pagadas en días distintos son dos pagos con su comprobante cada una. Eso es lo que ocurre en la realidad y evita pedir el mismo número dos veces.

**Una sola implementación, tres puntos de entrada:**
1. `src/utils/payments.ts` (puro, con `scripts/check-payments.ts`):
   - `PAYMENT_METHODS` única (Efectivo, Transferencia, Yape, Plin, Depósito, Tarjeta) y reglas por medio: banco (Transferencia, Depósito), operación (Transferencia, Yape, Plin, Depósito), evidencia (todo menos Efectivo).
   - `validateParts` (monto, TC si es soles, banco/operación/evidencia según medio) y `validateDocument` (tipo, serie con B/F según el tipo, número numérico).
   - Controles de integridad: **comprobante no repetible** (mismo tipo + serie + número) y **operación no repetible** (mismo medio + banco + N° de operación), ignorando pagos anulados.
   - `buildPaymentRecords`: arma el `Payment` y un movimiento de caja **por parte**, igual para el asistente y para las cuotas (hoy se construyen en dos sitios distintos).
2. Componentes compartidos: `PaymentPartsEditor` (las partes, ya existe en el asistente) y `ReceiptFields` (tipo, serie y número del comprobante), en `src/components/payments/`.
3. **Un solo modal `RegisterPaymentModal`** para cobrar cuotas: lo usan Pagos y Planes (Planes lo abre con la cuota ya elegida; Pagos con el buscador de matrícula). Se elimina el formulario propio de Planes.

**Modelo:** `Payment.document?: { type: 'Boleta' | 'Factura'; serie: string; number: string }`; `Payment.receipt` se mantiene como texto `B001-000123` (compatibilidad con la lista y reportes) y siempre es el comprobante; la operación vive solo en cada `PaymentPart` y en caja. `registerPayment` pasa a recibir `{ date, parts, document, note }` (varias partes) y valida con las mismas reglas.

**Reglas finales:**
- Comprobante: **obligatorio** en todo pago (matrícula, cuota). Boleta → serie `B…`; factura → serie `F…`.
- Evidencia: **obligatoria salvo en Efectivo**, por parte.
- Moneda: el cobro se registra en la moneda recibida con su TC; la deuda sigue en USD (como ya está decidido).
- Contado y promociones grupales: un comprobante por unidad de pago (grupal = uno solo).
- Planes (3/6/9, 2 partes) siguen sin cobro en la matrícula: se cobran desde Pagos / Planes, ahora con los mismos datos completos.

**No se cambia:** la lista de pagos, caja, anulaciones y verificación (solo se comprueba que lean bien `receipt`/`parts`). Pendiente futuro (no se hace ahora): datos fiscales del cliente (RUC / razón social) para facturas y emisión electrónica.

Archivos: nuevos `utils/payments.ts`, `components/payments/*`, `check-payments.ts`; `DataContext.tsx` (`PaymentPart`, `Payment`, `registerPayment`), `utils/enrollment.ts` (arma el lote con `buildPaymentRecords`), `StepPayment.tsx`, `Payments.tsx`, `Plans.tsx`, `check-enrollment.ts`.

---

## B. Primera asesoría

Hay **tres tipos de sesión** y **nunca se mezclan en un mismo horario**:
1. **Primera asesoría** (la crea la matrícula).
2. **Asesoría** (las que se llevan a lo largo de todo el programa).
3. **Actividad programada** por cronograma mensual (maratón, taller…).

**Reglas confirmadas:**
1. En el asistente, solo se puede elegir un horario **totalmente vacío**. El selector lista únicamente horarios libres (los demás aparecen deshabilitados con el motivo: «Con asesorías», «Primera asesoría de otro registro», «Bloqueado: Maratón»).
2. Los alumnos del **mismo registro** de matrícula pueden compartir ese horario.
3. **Sin cupo**: la primera asesoría no tiene límite de alumnos (el cupo configurable de Programación → Cupos aplica solo a las asesorías; las actividades ya tienen su propio cupo opcional o «sin límite»).
4. Al guardar, el horario queda **reservado a ese registro**: ningún otro registro lo puede elegir y no admite asesorías normales (como una actividad).
5. **Cancelar libera el horario. Faltar no**: la falta se marca el día de la asesoría o después, así que el horario ya pasó; queda ocupado como registro histórico.
6. **Cancelar y reprogramar** una primera asesoría se hace **solo desde Psicopedagogía → Programación** (lista, calendario o agenda del día), no desde la matrícula. Reprogramar solo a un horario vacío o de su mismo registro. Si el alumno faltó o la asesoría ya se canceló, se puede reprogramar a una fecha nueva (el horario original ya pasó).
7. **Regla general de 24 horas** (sección siguiente): rige para la primera asesoría, las asesorías y las actividades.

### Regla general de 24 horas (todas las programaciones)

Cancelar o reprogramar una sesión **activa** (Reservado / Reprogramado) exige **al menos 24 horas de anticipación** respecto a su fecha y hora de inicio:
- **Primera asesoría y asesorías:** Reprogramar y Cancelar. Con menos de 24 h las acciones no están disponibles y se muestra el motivo: «Solo se puede cancelar o reprogramar con 24 horas de anticipación (la asesoría es el 21 oct a las 4:00 p. m.)».
- **Actividades del cronograma:** quitar la inscripción de un alumno (Actividades especiales) exige las mismas 24 h. Crear, editar o eliminar el cronograma es planificación y no está sujeto a esta regla.
- **No aplica** a: reservar una asesoría nueva (secretaría puede reservar para el mismo día), marcar Asistió / Faltó, ni reprogramar una asesoría ya marcada como Faltó o Cancelada (su horario original ya pasó).
- Una sola constante `MIN_NOTICE_HOURS = 24` y una función pura `canChangeWithNotice(fecha, hora, ahora)` compartida por la agenda y las actividades; `availableActions` recibe la hora actual y devuelve las acciones ya filtradas.

**Modelo:** `Schedule.registrationId?` (lote al que pertenece la primera asesoría; se toma del primer correlativo de matrícula del lote) y `Schedule.enrollmentId?` (matrícula a la que pertenece; lo usa D).

**Lógica pura (`utils/schedule.ts`):**
- `OCCUPYING_STATUSES` = activos + Faltó (ocupan el horario); `ACTIVE_STATUSES` se mantiene para conflictos del alumno y frecuencia semanal (Faltó no cuenta como asistencia).
- `blockKind(ctx, branchId, date, time)` → `vacio | normal | primera | actividad | cerrado` (+ `registrationId` si es primera).
- `checkFirstSessionBlock`: permitido si está vacío o es primera del mismo registro (sin cupo).
- `checkBlock` (normal) rechaza horarios `primera`: «Ese horario está reservado para primeras asesorías».
- `canChangeWithNotice(fecha, hora, ahora)`: ≥ 24 h antes (regla general); `availableActions(s, today, now)` la aplica.

**UI:** `StepProgram` (selector con motivos), formulario Reservar/Reprogramar (horarios de primera asesoría deshabilitados), calendario y agenda del día (etiqueta «Primera asesoría» en el horario), acciones Reprogramar/Cancelar con mensaje claro si faltan menos de 24 h.

**Datos de ejemplo:** las 2 primeras asesorías semilla reciben `registrationId` y `enrollmentId`.

Archivos: `utils/schedule.ts`, `utils/enrollment.ts`, `StepProgram.tsx`, `ScheduleFormModal.tsx`, `ScheduleCalendar.tsx`, `DayAgendaModal.tsx`, `Schedule.tsx`, `ActivityEnrollModal.tsx` (quitar inscripción con 24 h), `DataContext.tsx`, `check-schedule.ts`, `check-enrollment.ts`.

---

## D. Vigencia del programa (duración base + garantía)

**Definiciones:**
- El programa ya trae `durationBase` y `warranty` en meses (Kids 3 + 3, Especialización y Profesional 6 + 6…).
- **Inicio = fecha de la primera asesoría** de la matrícula (la que no está cancelada; si se reprograma, la vigencia se recalcula). Se **deriva** de la asesoría, no se guarda una fecha aparte, para que nunca se desincronice.
- **Fin de la duración base** = inicio + `durationBase` meses − 1 día. **Fin con extensión** = inicio + (`durationBase` + `warranty`) meses − 1 día. Meses de calendario (15-oct + 3 meses → 14-ene; si el día no existe, último día del mes).
- Alerta: **14 días** antes del fin de la duración base (constante `EXPIRY_ALERT_DAYS`).

**Estados:**

| Estado | Cuándo | ¿Aparece para programar? |
|---|---|---|
| Sin inicio | Matrícula sin primera asesoría vinculada (antiguas o cancelada sin reprogramar) | Sí (no se altera nada) |
| Por iniciar | Falta para la fecha de la primera asesoría | Sí |
| Vigente | Dentro de la duración base | Sí |
| **Por vencer** | ≤ 14 días para terminar la base → alerta con fecha de fin y meses de extensión | Sí |
| **Base finalizada** | Pasó la base y no se habilitó la extensión | **No** (sus datos y su matrícula siguen en el sistema) |
| En extensión | Extensión habilitada, hasta el fin con extensión | Sí |
| Finalizada | Pasó también la extensión | No |

**Alumno «trabajable»** (aparece en Programación y Actividades) si tiene al menos una matrícula en estado Sin inicio / Por iniciar / Vigente / Por vencer / En extensión. **Historial del alumno** y **Alumnos** siguen mostrándolos a todos (son consulta). Además, no se puede reservar una asesoría con fecha posterior al fin de su vigencia («La vigencia del alumno termina el 14 de enero»).

**Botón «Habilitar extensión»:** un solo botón con confirmación; disponible en *Por vencer* y *Base finalizada*. Guarda quién y cuándo (`extensionEnabledAt`, `extensionEnabledBy`); al habilitarla, el alumno vuelve a aparecer hasta el fin con extensión.

### Dónde se ve la alerta (recomendación)

Criterio: la alerta debe estar donde se **decide y actúa**, mostrarse **una sola vez** por tema, y **calcularse** (no guardarse) para no quedar desactualizada ni generar ruido.

1. **Operación → Matrículas (principal y único lugar de acción):** columna «Vigencia» (estado + fecha de fin + meses de extensión), filtros rápidos con contador («Por vencer (n)», «Base finalizada (n)», «En extensión»), y la acción **Habilitar extensión**. Habilitar una extensión es una decisión administrativa/comercial (renovación o continuidad), por eso el botón vive solo aquí.
2. **Dashboard:** tarjeta «Matrículas por vencer» con el conteo; al hacer clic lleva a Matrículas con el filtro aplicado (resumen que invita a actuar).
3. **Psicopedagogía (informativo, sin botón):** al reservar muestra «Vigencia hasta el 14 ene · quedan 9 días» y los alumnos *Por vencer* llevan una etiqueta en la lista; así la psicopedagoga avisa a la familia sin salir de su flujo.

No se agregan correos ni notificaciones (no hay backend) ni la pantalla «Alertas del sistema» (hoy vacía); queda como siguiente paso natural reutilizando el mismo cálculo.

**Modelo:** `Enrollment.extensionEnabledAt?`, `Enrollment.extensionEnabledBy?`; cálculo puro en `src/utils/validity.ts` (`addMonths`, `enrollmentValidity`, `isStudentWorkable`) y acción `enableExtension` en `DataContext`.

**Datos de ejemplo:** Diego Torres con una primera asesoría histórica para ver «Por vencer»; Mateo y Valentina vinculados a su matrícula.

Archivos: nuevos `utils/validity.ts` y `scripts/check-validity.ts`; `DataContext.tsx`; `Enrollments.tsx`; `Dashboard.tsx` (solo la tarjeta); filtros de alumno en `ScheduleFormModal.tsx`, `ActivityEnrollModal.tsx` y panel «Sin asesoría esta semana»; `check-schedule.ts`.

---

## Verificación prevista
- `tsc` · `vite build`.
- Scripts: `check-enrollment` (dependientes sin teléfono, primera asesoría exclusiva, comprobante), `check-schedule` (tipos de bloque, Faltó ocupa / Cancelado libera, regla de 24 h en asesorías y en inscripciones de actividades, vigencia en reservas), **nuevos** `check-payments` (medios, banco/operación/evidencia, comprobante B/F, duplicados, varias partes, USD/PEN) y `check-validity` (fin de mes, año bisiesto, alerta a 14 días, extensión, derivación desde la primera asesoría).
- Navegador: cada frente (interruptor en la esquina; pago con 2 partes y comprobante; cobro de cuota desde Pagos y desde Planes con el mismo modal; horarios de primera asesoría; alerta, botón y desaparición/reaparición del alumno en Programación).
- Documentación en `docs/REVISION_PROYECTO.md`.
