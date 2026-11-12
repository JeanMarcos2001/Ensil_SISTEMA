# Reglas de negocio: qué se resolvió, cómo funciona y qué falta (2026-10-23)

Cada punto dice **el problema**, **la solución** y **dónde está** en el sistema. Las decisiones que conviene confirmar están marcadas con ❓. Las reglas puras se verifican con `scripts/check-business.ts` (97 casos).

---

## 1. Facturación: qué le falta a esta lógica (solo explicación)

**Hoy existe:** el comprobante de cada pago se digita a mano (tipo, serie y número) y se valida su formato (serie de 4 caracteres que empieza con B o F; número de hasta 8 dígitos); se controla que no se repita, y un pago anulado libera su número. Desde esta tanda también hay **notas de crédito** con correlativo propio (ver punto 2). **Decidido el 2026-11-07:** la primera versión de producción **sigue así**: los comprobantes se emiten fuera del sistema con el facturador actual y el sistema solo registra tipo, serie y número; la emisión electrónica integrada (OSE/PSE) es de una versión futura.

**Lo que falta, ordenado de lo más básico a lo más grande:**

| # | Qué falta | Por qué importa |
|---|---|---|
| 1 | **Series y correlativos controlados por el sistema** (serie por sede y tipo de comprobante, siguiente número automático, sin saltos ni repetidos) | Hoy el número se escribe a mano: un error de tipeo o un salto no lo detecta nadie. |
| 2 | **Perfil fiscal del cliente**: tipo y número de documento del adquirente, razón social y dirección fiscal (RUC de 11 dígitos validado) y **a quién se factura** (titular, alumno o una empresa) | Una factura exige RUC y razón social; una boleta de importe alto exige identificar al adquirente. Los titulares y alumnos tienen DNI pero no un «receptor del comprobante». |
| 3 | **Líneas del comprobante y tratamiento del IGV**: concepto (matrícula, cuota, artículo), cantidad, valor de venta, afectación (gravado, exonerado o inafecto) y total | Hoy el comprobante es un número suelto: no tiene detalle ni impuestos. **Confirmar con contabilidad** cómo tributan los servicios educativos y los libros antes de programarlo. |
| 4 | **Moneda y tipo de cambio de SUNAT** para pagos en soles de obligaciones en dólares | El sistema ya guarda el TC de cada pago, pero no usa el oficial del día. |
| 5 | **Emisión electrónica**: generar el XML, firmarlo, enviarlo a SUNAT por un **proveedor autorizado (OSE o PSE)**, recibir la constancia (CDR), el hash, el código QR y la representación impresa | Es la pieza más grande: el sistema no puede emitir comprobantes con validez tributaria sin un proveedor. Hoy solo registra el número que el usuario emitió en otro sistema. |
| 6 | **Anulación y notas completas**: catálogo de motivos de la nota de crédito, **notas de débito** (p. ej. mora), **comunicación de baja** y resumen diario de boletas | La nota de crédito de hoy es un registro interno con correlativo; no se envía ni usa el catálogo oficial de motivos. |
| 7 | **Guías de remisión** de envíos y transferencias de stock | Mover mercadería entre sedes o a clientes las requiere. |
| 8 | **Un comprobante para varias matrículas** (pago grupal) o **una factura a crédito con cronograma** | Hoy un pago grupal lleva un solo comprobante pero sin líneas por alumno. |
| 9 | **Entrega y reimpresión** del comprobante (correo, WhatsApp), **permisos** para emitir y anular, y **bitácora** | Control y trazabilidad. |
| 10 | **Reportes contables**: registro de ventas, conciliación con caja y exportación al programa contable | Cierra el ciclo con contabilidad. |

**Camino recomendado:** (1) series y correlativos + perfil fiscal; (2) líneas e IGV según contabilidad; (3) integrar un PSE/OSE para emitir y recibir la constancia; (4) notas de crédito/débito, baja y guías sobre esa integración; (5) reportes contables. Los pasos 1 y 2 se pueden hacer ya; el 3 depende de elegir el proveedor.

---

## 2. Anulaciones y reversas: caja, caja chica y nota de crédito ✅

### Nota de crédito (corregida)
Antes el «N.º de nota de crédito» era un texto libre. Ahora, al reversar un pago:

| Si el pago… | Opciones |
|---|---|
| tiene comprobante | **Emitir** la nota (el sistema asigna el siguiente número de su serie: `BC01-000001` para boletas, `FC01-000001` para facturas) · **Registrar** una nota ya emitida en otro sistema (se valida el formato, que la serie corresponda al tipo y que no esté repetida) · **El comprobante nunca se entregó** (se deja constancia con explicación) |
| no tiene comprobante | No corresponde nota |

La nota sale por el **monto total** del pago, queda enlazada al comprobante que anula, al pago y a la matrícula, se lista en *Pagos → Notas de crédito* y se puede imprimir/exportar. Esa pantalla es un **control interno**: no envía nada a SUNAT (ver punto 1). Archivos: `utils/creditNotes.ts`, `components/payments/ReversePaymentModal.tsx`, `CreditNotesModal.tsx`.

### Caja (cada opción, completa)
| Opción | Qué hace ahora |
|---|---|
| **Registrar egreso** | Formulario validado: fecha no futura, **sede**, tipo, concepto, monto (un egreso en efectivo no supera el saldo), TC si es en soles, comprobante y **medio** (efectivo, o transferencia con banco y N.º de operación). |
| **Venta de artículo** | Igual que antes, y respeta los cierres. |
| **Crear lote de depósito** | Ya funcionaba; ahora respeta cierres y permisos. |
| **Ver detalle / comprobante / matrícula / cuota** | Funcionan. |
| **Reversar movimiento** | Con motivo y constancia; una venta devuelve el artículo al stock; lo nacido de un pago **se reversa desde el pago, en la misma pantalla** (se abre la ventana de reversa del pago, ya no hay que cambiar de página). |
| **Período** | Los totales «del período» tienen filtro Desde/Hasta (por defecto el mes en curso); el saldo es siempre el de toda la caja. |
| **Estado de la caja** | Ya no es un texto fijo: «Abierta» o «Cerrada al dd/mm». |
| **Arqueo y cierre** | Nuevo (ver abajo). |

### Cierres y reaperturas (nuevo: Sistema → Cierres y Sistema → Reaperturas)
- Cada caja (**Caja PEN, Caja USD y Caja chica**) se cierra por separado: se compara el **saldo del sistema** hasta una fecha con el **dinero contado**; si hay diferencia (sobrante o faltante) la nota es obligatoria.
- Un día cerrado **bloquea** registrar y reversar movimientos manuales de esa fecha o anteriores (lo explica el mensaje).
- Solo se **reabre el último cierre**, con motivo y permiso; queda en *Reaperturas* y genera una notificación.
- Si después de cerrar entra un movimiento automático con fecha cubierta (p. ej. un cobro), el cierre se marca **«Desactualizado»** con la diferencia.
- ❓ Un cobro registrado el mismo día después de cerrarlo no se bloquea (para no impedir cobrar): deja el cierre desactualizado y se avisa.

### Caja chica (cada opción, completa)
| Opción | Qué hace ahora |
|---|---|
| **Fondo fijo y tope por gasto** | Configurables (por defecto S/ 1,000 y S/ 200). Un gasto mayor al tope se registra como egreso en Caja con su comprobante. |
| **Por reponer / Solicitar reposición** | «Por reponer» = fondo − saldo; el botón abre un ingreso de reposición con ese monto. |
| **Registrar ingreso o egreso** | Valida saldo, tope, fecha y cierres. |
| **Ver detalle / comprobante, reversar** | Con constancia; un ingreso ya gastado no se reversa (dejaría el saldo negativo). |
| **Arqueo y cierre** | Igual que la Caja. |

---

## 3. Ciclo de vida de la matrícula ✅ (reactivar, cambio de programa/nivel, traslado de sede y renovación)

Los tres primeros son **solicitudes** (las pide quien atiende y las resuelve quien tiene autoridad, en *Sistema → Solicitudes pendientes*), con vista previa de los efectos antes de pedir y antes de aprobar. La renovación es una **matrícula nueva**. Se piden desde *Matrículas* (menú de la fila) o desde la ficha («Ciclo de la matrícula»). Archivo central: `utils/enrollmentChange.ts`.

### Reactivar una matrícula caída
- **Cuándo:** dentro de **90 días** desde que dejó de asistir, mientras no haya terminado la vigencia del programa, si el programa sigue disponible en la sede y el alumno no tiene otra matrícula activa del mismo programa. Pasado el plazo corresponde renovar.
- **Qué pasa:** la matrícula vuelve a «Activa»; las cuotas que la caída **anuló** se restituyen con su saldo y su calendario se corre tantos días como duró la ausencia; la deuda **condonada** no se restituye; la deuda vencida que se conservó sigue; lo ya cobrado no se toca; el alumno vuelve a «Activo».
- **Qué NO vuelve solo:** las asesorías y actividades canceladas por la caída (hay que programarlas de nuevo).
- ❓ La vigencia sigue contando desde la primera asesoría original (la ausencia no la extiende).

### Cambio de programa o de nivel
- **Precio nuevo** = tarifario vigente del programa/nivel destino para el **mismo tipo de pago** y la sede. Si no hay tarifario, no se puede.
- **Lo ya cobrado se abona** al precio nuevo: el saldo (precio nuevo − cobrado) se reparte en las cuotas aún sin cobrar; las cuotas con cobros parciales se cierran por lo cobrado y su saldo pasa al plan nuevo; si no hay cuotas libres se crea «Saldo por cambio de programa».
- Si lo cobrado **supera** el precio nuevo no se aplica: primero se devuelve la diferencia (reversa de pago con devolución).
- Los materiales ya entregados se conservan y la verificación vuelve a «Pendiente» para entregar los del programa nuevo. Las asesorías futuras pasan a mostrar el programa nuevo.
- No aplica a matrículas de grupo promocional ni a cronogramas de monto variable.

### Traslado de sede
- El programa debe estar habilitado en la sede destino.
- **No hay «horario de clases»:** el único horario del alumno es el de sus asesorías (Psicopedagogía). El catálogo «Horarios de clases» y el campo del alumno se **retiraron**; el texto `{{horario}}` del contrato ahora muestra el día y la hora de la primera asesoría.
- **El precio y el plan no cambian**; los pagos y la caja quedan registrados en la sede donde se cobraron.
- Las asesorías y actividades futuras de la sede anterior se **cancelan** para reprogramarlas en la nueva.
- **Si se cancela su primera asesoría** (la vigencia cuenta desde ella), la solicitud lleva la **fecha y la hora de la nueva primera asesoría** en la sede destino: de lunes a sábado, en un bloque **vacío** (sin asesorías, otra primera asesoría ni actividades), sin cruce con otra asesoría del alumno y con **personal de Psicopedagogía** en esa sede. Al aprobar, se programa sola (con su responsable) y la vigencia cuenta desde esa fecha. Si el bloque se ocupó mientras tanto, la aprobación avisa y hay que pedir de nuevo.
- Si el traslado no cancela su primera asesoría (ya se dio), no se pide horario: las asesorías canceladas se reservan después en Programación.

### Renovación
- **Cuándo:** matrícula activa **por vencer** o con la base terminada, o caída hace más de 90 días; y no renovada antes.
- **Cómo:** «Renovar matrícula» abre el asistente de matrícula **ya lleno**: alumno y titulares existentes, la misma sede y el mismo tipo de pago, y el **nivel siguiente** sugerido (o el mismo si cursó el último). La matrícula nueva guarda de cuál viene (`renewsId`). Si había un borrador sin terminar, pide confirmación antes de reemplazarlo.
- ❓ No hay precio ni promoción especial de renovación (se aplica el tarifario vigente).

### Historial
Cada cambio aprobado queda en la **línea de tiempo** de la ficha («Reactivación de la matrícula», «Cambio de programa o nivel», «Traslado de sede») y la solicitud conserva sus efectos.

---

## 4. Solicitudes: ¿se espera a definir los roles de sesión? **No hace falta** ✅

**Propuesta aplicada:** separar *qué se puede hacer* de *quién inició sesión*.
- Cada acción con control (pedir y aprobar una caída, una reactivación, un cambio de programa, un traslado; reversar un pago o un movimiento; reabrir una caja; emitir notas; generar documentos; configurar cobranza…) pide un **permiso del catálogo** de *Organización → Permisos*. Todas las pantallas lo preguntan con una sola función (`can(permiso)`, en `utils/authority.ts`).
- Hoy el único usuario es el **Superusuario**, que lo puede todo; **cuando se definan los roles basta marcar casillas** en el rol, sin tocar ninguna pantalla. Se agregaron al catálogo las acciones que faltaban (*Pagos, Caja chica, Cobranza y cartera* y varias de *Matrículas* y *Caja*).
- *Sistema → Solicitudes pendientes* ahora reúne los **cuatro tipos**, con filtro por tipo; el botón «Resolver» solo aparece activo a quien tenga el permiso de aprobar ese tipo.
- **Separación de funciones:** `APPROVAL_POLICY.allowSelfApproval` indica si quien pidió puede aprobar. Desde el 2026-11-03 está en `false`: quien pide una solicitud no la resuelve (el Superusuario, rol técnico, queda exento).
- **Lo que sí hay que decidir** (no es técnico): ❓ ¿quién aprueba cada tipo (administración de sede, gerencia)? ¿se exige otra persona distinta de quien pidió? ¿hay un monto o plazo a partir del cual aprueba un nivel superior?

---

## 5. Contrato y ficha de la matrícula ✅

**Dónde:** ficha de la matrícula → pestaña **«Contrato y ficha»** (también desde el menú de la fila de Matrículas, y desde la pantalla de éxito del asistente).

- **Se arman solos** con los datos de la matrícula: alumno, titular (o el propio alumno si es independiente), programa, duración y garantía, fecha de inicio y fin (desde la primera asesoría), horario, precio, tipo de pago, cronograma de cuotas, sede y empresa (razón social y RUC de la sede).
- **Antes de generar el contrato se comprueba que haya lo necesario** y se dice qué falta: matrícula activa, programa, plan de pagos, **dirección del titular**, mayoría de edad si el alumno es su propio contratante, sede y empresa con **RUC**. La ficha solo exige tener al alumno.
- **Numeración y versión:** `CTR-2026-001` / `FIC-2026-001`. Si los datos cambian después (precio, cuotas, titular…) el documento queda **«Desactualizado»**: se regenera (versión siguiente, mismo número) y hay que firmarlo de nuevo.
- **Firma:** se registra la fecha y el archivo escaneado (el sistema guarda el nombre; aún no almacena archivos). No se firma un documento desactualizado ni dos veces.
- **Imprimir / guardar PDF** desde la vista previa. En Matrículas se ven los avisos «Sin contrato» y «Contrato sin firma».
- **Plantilla del contrato editable** en *Configuración → Documentos → Plantillas de contrato y ficha*: texto con campos entre llaves dobles (`{{alumno}}`, `{{precio}}`…; se ven todos), cláusulas que se agregan o quitan y versión. **Importante:** el texto que trae el sistema es un **modelo, no asesoría legal**; debe revisarlo el área legal y marcarlo «revisado» (mientras no, cada contrato muestra una advertencia). Cambiar el texto quita la marca de revisado.
- ❓ El contrato no es obligatorio para verificar o cobrar (solo avisa). Si se quiere exigirlo hay que decidir en qué paso.

---

## 6. Planes y cartera: recordatorios, mora y reportes ✅

### Estados siempre al día
El estado de cada **cuota** y de cada **plan** ya no se confía al texto guardado: se calcula con lo cobrado y la fecha (`utils/planState.ts`). Una cuota «Pendiente» de ayer se ve «Vencida»; el plan pasa a «Atrasado» solo. Lo usan Planes, el detalle de la cuota y la columna «Plan» de Matrículas.

### Política de cobranza (Configuración → Cobranza → Política de cobranza)
Días de gracia (3 por defecto), **tasa de mora mensual** (0 % por defecto = sin interés) y los **días de recordatorio** antes (3 y el día del vencimiento) y después (1, 7, 15 y 30). Todo editable con vista previa del calendario.

### Mora
- Se calcula sobre el saldo vencido, proporcional a los días fuera de gracia (`tasa × días / 30`) y se muestra en el detalle de cada cuota vencida.
- **«Cobrar mora»** genera una cuota «Mora · Cuota N» por lo acumulado que aún no se cobró (se cobra con el mismo formulario de pagos); no se cobra dos veces lo mismo y **la mora no genera más mora**. La mora cobrada no cuenta como «cobrado del programa».
- ❓ El sistema calcula y genera el cargo, pero **el tratamiento contable y tributario de la mora (nota de débito)** lo debe definir contabilidad.

### Recordatorios (Planes y cartera → pestaña «Recordatorios de cobranza»)
- Por cada cuota abierta se muestra **el recordatorio más avanzado que ya corresponde y no se atendió** (así, si nadie abre el sistema unos días, no se acumulan mensajes repetidos).
- Cada uno trae el **texto listo** (cambia según falte, venza hoy o esté vencida), el destinatario (titular) y su celular, un botón **WhatsApp** que abre la conversación con el mensaje ya escrito, **Copiar**, **Marcar enviado**, registrar una **llamada** u **Omitir** (con motivo). Todo queda en el historial («Registrados») con quién y cuándo; se puede exportar.
- ❓ El sistema **no envía** los mensajes por sí solo (no hay integración con WhatsApp ni correo): prepara, abre y registra.

### Reporte de cartera (Reportes → Cartera, y botón en Planes)
Cartera total, por vencer y **vencida**, **morosidad** y atraso promedio, **cobrado del mes**, **proyección** (vence en 7, 30, 60 y 90 días), **antigüedad** de la deuda (por vencer, 1-30, 31-60, 61-90 y más de 90 días), cartera **por sede y por programa**, **principales deudores** (con enlace a su matrícula), **calendario semanal de vencimientos** y detalle por cuota. Filtros por sede, programa y estado; exporta **CSV y PDF**.

---

## 7. La verificación va antes de la primera asesoría ✅

**Por qué:** el alumno necesita sus materiales (la receta del programa) para dar la primera asesoría. Antes, la verificación y la agenda no se hablaban: se podía marcar «Asistió» sin haber entregado nada.

**Flujo (cada paso exige el anterior):**
1. **Matrícula** → queda la primera asesoría reservada (de ahí sale la vigencia).
2. **Primer pago** registrado (ya era condición de la verificación).
3. **Verificación** = entrega de materiales y descuento de stock. Completa **o incompleta** habilitan la primera asesoría (lo entregado alcanza para empezar; lo demás se completa en otra verificación).
4. **Primera asesoría**: recién ahora se puede marcar asistencia, falta o registrar la sesión.

**Qué pasa si la verificación no llega a tiempo** (ejemplo: asesoría a los 2 días y sin verificar):
| Situación | Nivel | Qué ve el personal |
|---|---|---|
| Faltan más de 3 días | Planificada | Se ve en Verificación, sin alarma |
| 3 días o menos | Urgente | Insignia amarilla en Verificación y Programación, y aviso en el Dashboard |
| Hoy o mañana | Crítica | En rojo |
| Ya pasó la hora de la asesoría | Vencida | «Reprogramar: sin materiales» |

- Sin verificar **no se puede** marcar «Asistió», «Faltó» ni registrar la sesión (el menú lo muestra deshabilitado y el sistema también lo rechaza si se intenta por otro camino).
- Si llega la hora sin materiales, **no cuenta como falta del alumno**: la asesoría se reprograma. Esa reprogramación **no exige las 24 horas** de anticipación porque el cambio es de la institución, y queda anotada en las observaciones («Reprogramada por falta de verificación de materiales…»). Si la nueva fecha tampoco se cumple, se repite.
- Si falta el primer pago, el aviso lo dice (no se puede verificar sin pagar) y la asesoría se reprograma igual.
- **No aplica** si la matrícula no está activa, si la primera asesoría ya se dio, faltó o se canceló, o si el programa **no tiene receta** vigente (no hay nada que entregar; Verificación lo indica con «sin receta: no se bloquea»).

**Confirmación al verificar:** «Guardar» ya no aplica la entrega de inmediato. Primero se revisan los datos y se abre una ventana con alumno, sede, verificador, resultado (completo o incompleto), lo que se entrega y descuenta, lo que queda pendiente y qué pasa con la primera asesoría; el botón **Confirmar y descontar stock** se habilita solo al marcar «Confirmo que los artículos fueron entregados físicamente». No se pide acta firmada ni foto de la firma (decisión: haría el proceso más largo).

**Dónde se ve:** Verificación (columna «1.ª Asesoría», orden por urgencia, filtro «Esperan la 1.ª asesoría»), Programación (aviso superior, etiqueta en la fila y en la agenda del día, menú «Reprogramar (matrícula sin verificar)») y Dashboard («Verificaciones pendientes» con cuántas son urgentes).

**Receta vigente:** ahora se busca con una sola regla (`recipeForEnrollment`): mismo programa, nivel (o todos), sede (o todas) y fecha dentro del rango; **el último día de la receta ya cuenta** (antes la excluía).

---

## 8. Psicopedagogía: actividades, historial, métricas, recordatorios y reporte ✅

**Idea central:** todo cambio de la agenda deja un evento, todo cambio que depende del alumno respeta las 24 horas, y todo lo que se registra (asistencia, sesión, métricas) alimenta el historial del alumno, los recordatorios y el reporte. Nada es un dato aparte.

### 8.1 Responsable de las actividades especiales
1. El **cronograma mensual** crea la actividad (fecha, horas, cupo) sin responsable y ya no lo borra al editarla.
2. En **Programación → Actividades especiales** se asigna el responsable: personal **activo** con una **asignación activa en Psicopedagogía** (los de la sede primero). Se rechaza si ya es responsable de otra actividad a esa hora o tiene una **asesoría** suya a esa hora (cruce).
3. Faltando **7 días o menos** sin responsable, Programación avisa y lleva directo a asignarlo.
4. Con asistencia ya registrada **no se cambia** el responsable ni la fecha y hora de la actividad.
5. Conexión con Personal: quien tiene actividades futuras a su cargo **no se puede inactivar** ni se le cierra su última asignación de Psicopedagogía hasta reasignarlas.

### 8.2 Asistencia a actividades
- **Desde el día de la actividad**, el responsable marca *Asistió* o *Faltó* por cada inscrito (hay «marcar todos como asistió» para los pendientes). **No se registra sin responsable** ni a quien no esté inscrito.
- Con asistencia registrada **no se quita la inscripción**. Quitar una marca pide explicación y queda en el historial.
- Se ve en el **historial del alumno** (actividades con su estado), en el **reporte** (asistencia y cupo ocupado) y detiene los recordatorios de esa actividad para quien ya tiene marca.
- Al caer una matrícula o trasladarse de sede, las inscripciones futuras se quitan solas y quedan en el historial con ese motivo.

### 8.3 Historial de reprogramaciones y cancelaciones
- Se genera **solo**, comparando la asesoría antes y después, así que ninguna pantalla puede olvidarlo. Guarda: qué pasó, de qué fecha, hora y responsable a cuáles, **quién lo hizo en el sistema**, **quién lo pidió** (alumno o titular / institución) y el **motivo**.
- Cancelar y reprogramar **exigen un motivo** de una lista; el motivo define quién lo pidió. «Institución: otro motivo» exige explicación.
- **Regla de las 24 horas:** el alumno o su titular solo puede cambiar con 24 horas o más de anticipación. Con menos, **solo la institución** (permiso «cancelar o reprogramar con menos de 24 h» y motivo de la institución); el menú lo muestra como «cambio de la institución».
- Una primera asesoría sin materiales (verificación pendiente) solo se cambia por el motivo «matrícula sin verificar», que es de la institución.
- Se ve en: Programación → *Ver historial* (línea de tiempo), la fila («Reprogramada N veces»), el historial del alumno (quién canceló y por qué) y el reporte (motivos y quién los pidió).

### 8.4 Métricas de la sesión: el flujo
1. Cada **programa define sus métricas** (`utils/sessionMetrics.ts`): Kids (nivel, sesión, velocidad, comprensión), Pre-Kids (nivel, semana, ¿identifica?, ¿lee solo?), Pre-lectura (sesión), Especialización, Teens y Profesional (módulo, velocidad, comprensión). El formulario sale de esa misma definición. *Profesional* antes no tenía formulario.
2. **Rango duro (no se guarda):** comprensión entera de 0 a 100; velocidad entera de 1 a 3000 pxm; sesión, semana o módulo enteros de 1 hasta su tope; opciones solo Sí / No / 50 %; el nivel debe ser uno del programa.
3. **Obligatorias:** todas las de cada programa deben estar completas para cerrar la sesión. En la **primera asesoría** además el diagnóstico inicial va en las observaciones.
4. **Avisos (se puede guardar, pero hay que explicarlo en las observaciones):** velocidad fuera de lo habitual del programa, caída de 30 % o más (o el doble) respecto a la sesión anterior, retroceder o saltarse más de 2 sesiones o módulos. Comprensión baja (< 60 %) y un nivel distinto al de la matrícula solo avisan.
5. Se guardan como **números** (la sesión como «Sesión 5»), para que el reporte pueda promediar y medir la mejora.

### 8.5 Recordatorios
- **Pantalla propia** (Psicopedagogía → Recordatorios) con tres tipos: **asesoría** (por defecto, el día anterior, que deja tiempo para avisar con las 24 h), **actividad** (2 días antes, solo inscritos sin marca) y **vigencia por vencer** (14, 7 y 1 días antes del fin de la duración base, solo sin extensión habilitada; el texto ofrece la extensión del programa).
- Destinatario: el **titular principal** del alumno (o el alumno si es independiente). El sistema **prepara el texto y abre WhatsApp**; registra quién y cuándo (o por qué se omitió). No envía solo.
- Cada pendiente muestra **un solo** recordatorio, el más cercano a la fecha que no se atendió. Una **primera asesoría sin verificar no se recuerda** (primero hay que verificar o reprogramar).
- Los días se editan en Configuración → *Recordatorios de Psicopedagogía*.

### 8.6 Reporte de Psicopedagogía (Reportes → Psicopedagogía)
Por rango de fechas, sede y programa: asesorías (por dar, vencidas sin marcar), **asistencia** (asistidas / asistidas + faltas), **sesiones registradas**, primeras asesorías (y cuántas esperan verificación), **cancelaciones y reprogramaciones por motivo y por quién las pidió**, tablas por sede, programa y responsable (con «sin sesión»), **progreso** (promedios y mejora entre la primera y la última sesión), **alumnos en riesgo** (2 faltas seguidas, 14 días sin asesoría ni reserva, o asistidas sin sesión) y **actividades** (inscritos, cupo ocupado, asistencia, sin responsable). Exporta CSV y PDF.

### 8.7 Permisos nuevos (Organización → Permisos)
Asignar el responsable de una actividad · Registrar asistencia a actividades · Cancelar o reprogramar con menos de 24 h · Ver, enviar y configurar recordatorios. El reporte usa «Ver reportes».

---

## 9. Personal: acceso al sistema, contrato y planilla ✅

**La inconsistencia:** Personal, Usuarios y Contratos eran islas. Una persona podía tener cuenta sin ficha (o ficha inactiva con la cuenta abierta), el contrato guardaba un «neto» que ignoraba la renta de 5.ª categoría y no había planilla donde se pagara.
**La solución:** una cadena **Ficha → Cuenta** y **Contrato → Planilla → Boleta**, con un solo motor de cálculo.

### 9.1 Personal ↔ Usuarios
- La cuenta **nace de la ficha**. Se crea desde Personal («Crear usuario de acceso») o desde Usuarios eligiendo «Personal vinculado»; hereda **nombre, documento y teléfono** de la ficha (no se editan en Usuarios: se editan en Personal y la cuenta se actualiza sola) y las **sedes** de sus asignaciones (la principal = la de su asignación principal; las demás, adicionales).
- Quién puede tener cuenta: personal **activo**, con una asignación **activa** marcada «con acceso al sistema», y **sin cuenta previa** (una por trabajador). *(Hasta 2026-11-06 el rol se sugería según un «rol del sistema» de la asignación; esa etiqueta se retiró: el rol se elige solo en Usuarios.)*
- **Inactivar al trabajador desactiva su cuenta sola**, con constancia («Se desactivó al inactivar al trabajador el …»); el aviso se muestra antes de confirmar. **Reactivarlo no reactiva la cuenta**: se hace a propósito en Usuarios (y se rechaza mientras la ficha esté inactiva).
- Si cambian sus asignaciones, la sede de la cuenta se corrige para no quedar en una sede donde ya no trabaja.
- Las cuentas sin ficha (administradores externos) siguen igual, sin estas restricciones.
- Arreglos de paso: el botón «Desactivar Usuario» **no hacía nada**; ahora desactiva (con permiso) y hay «Activar». Los roles del formulario salen del catálogo de Roles (antes faltaba *Cajero*). Crear, editar y desactivar usuarios pide los permisos del catálogo.

### 9.2 El neto del contrato = el de la planilla
El contrato guarda el **neto de un mes regular** calculado por el mismo motor de la planilla: sueldo + asignación familiar − aporte de pensión − **renta de 5.ª categoría** (o 4.ª en la locación). Por eso cambió la cifra (p. ej. S/ 3 500 con AFP Integra y sin hijos: antes S/ 3 047.80, ahora S/ 2 973.60).
- **Asignación familiar:** 10 % de la RMV (S/ 113) si el trabajador declaró hijos (se asume que cumplen la edad o estudian).
- **Renta de 5.ª (método de proyección):** ingreso anual proyectado (12 sueldos + 2 gratificaciones con su bonificación del 9 %) − 7 UIT (UIT 2026 = S/ 5 500, referencial) → escala 8 % / 14 % / 17 % / 20 % / 30 %. Se retiene 1/12 de enero a marzo y desde abril lo que falta entre 9, 8, 5, 4 y el saldo en diciembre (las 12 retenciones suman el impuesto anual).
- **Locación:** sin pensión ni beneficios; retención de 4.ª (8 %) si el honorario del mes pasa de S/ 3 300, salvo que el prestador tenga **suspensión** (casilla nueva en el contrato).

### 9.3 Planilla mensual (Personas → Planilla)
1. **Generar** el mes de UNA empresa (no futuro, una por empresa y mes; el mes anterior del año de esa empresa debe estar cerrado porque la renta depende de él). Una línea por **contrato que cubre algún día del mes**: se paga por **días** (ingreso o cese a mitad de mes), con asignación familiar, pensión, renta, gratificación (julio y diciembre: 1/6 por mes completo del semestre + 9 % de bonificación; **no paga pensión**), **CTS** (mayo y noviembre: se *deposita* en el banco, se informa aparte y no es parte del neto) y **EsSalud 9 %** del empleador (costo, no descuento).
2. **Ajustar** (solo en borrador): ingresos (bono, comisión, horas extra; *afectos* o *inafectos*) y descuentos (adelanto, tardanza), cada uno con concepto y motivo. En borrador la planilla **se recalcula con los contratos**.
3. **Avisos y errores:** personal activo sin contrato ese mes, contrato que vence dentro del mes, sin asignación (sede vacía) → avisos; falta de sistema de pensiones o neto negativo → **errores que impiden cerrar**.
4. **Cerrar:** guarda una **foto** de cada línea. Después, cambiar un contrato no la altera, y lo cobrado y retenido alimenta la renta de los meses siguientes.
5. **No hay «pagar»:** el sistema no registra pagos al personal; la planilla es solo información del trabajador (estados: Borrador y Cerrada).
6. **Reabrir** (solo cerrada, con motivo; no si ya hay una posterior cerrada del año): vuelve a ser borrador.
7. **Boleta de pago** por trabajador (imprimir o guardar como PDF), PDF y CSV de la planilla, e historial de cada acción (quién y cuándo).
- **Conexión con Contratos:** el detalle del contrato muestra los meses que ya pagó; **no se cierra un contrato** con fecha que toque una planilla cerrada que lo incluye (se reabre antes o se elige un mes posterior). Personal tiene «Ver planillas» por trabajador.
- Permisos nuevos (Organización → Permisos → Personas → Planilla): ver, generar, ajustar, cerrar, pagar y reabrir.

### 9.4 Supuestos y lo que no cubre
Las tasas (AFP/ONP, UIT, RMV, escala) son **referenciales** y están en `utils/payrollEngine.ts` para actualizarlas en un solo lugar; la retención la valida contabilidad. Fuera del sistema **por decisión del usuario (2026-11-07); no es un pendiente**: pagos de sueldos, liquidación de beneficios al cese (gratificación, CTS y vacaciones truncas), PLAME / T-Registro, ingresos de otros empleadores, deducción adicional de 3 UIT, ni el egreso en Caja o bancos al pagar (**no se hará**: el sistema no registra pagos al personal, ver §22).

---

## 10. Reportes: cómo se calculan y qué responde cada uno ✅

**Principio:** un reporte **no guarda datos propios**; se calcula en el momento con lo que ya guardan las pantallas operativas, así que nunca las contradice. Todos arrancan con la sede del selector del encabezado (temporal: luego será la sede de la sesión; se puede cambiar), filtran por período con atajos (este mes, mes anterior, 30 días, este año, todo el historial), exportan **CSV y PDF** y piden `reportView` / `reportExport`. Las reglas viven en `src/utils/report*.ts` y `audit.ts`.

| Reporte | Qué responde | Reglas que conviene recordar |
|---|---|---|
| **Matrículas** | Embudo (matriculadas → verificadas → primera asesoría dada → activas hoy), por sede, programa, tipo de pago, origen y entrevistador, vigencia, caídas y cambios aprobados. | La fecha de la matrícula es la ISO o, si no, la del texto antiguo. La tasa de caída cuenta solo las **aprobadas** en el período; las pendientes se avisan aparte. |
| **Verificación** | Qué falta entregar, cuánto tarda, qué artículos faltan y qué primera asesoría está en riesgo. | Solo cuenta matrículas **activas**. Las pendientes salen primero las que esperan su primera asesoría, la más urgente arriba. |
| **Caja** | Ingresos y egresos por moneda, depósitos, devoluciones, reversas, efectivo sin depositar, cierres con su diferencia y caja chica. | Una caja por moneda. Los depósitos y las devoluciones **no** son egresos operativos. El saldo es el actual, no el del período. Caja chica siempre en soles y sin filtro de sede. |
| **Stock** | Foto del inventario por sede, valor a costo y, sobre todo, si **alcanza** para lo que las recetas piden a las matrículas que aún esperan sus materiales. | Faltante = lo que piden las recetas vigentes de matrículas activas sin verificar − stock disponible de su sede. «Sin movimiento» = 90 días o más según el kardex. |
| **Personal** | Plantilla, contrato (vigente, por vencer en 30 días o vencido), cuenta de acceso, asignación, bajas del período y costo de la última planilla cerrada por sede. | Activos sin contrato vigente o sin asignación se listan para corregirlos. Las vacaciones se muestran a 60 días, pero **aún no bloquean la agenda**. |
| **Auditoría** (vive solo en Sistema → Auditoría, ya no en Reportes) | Quién hizo qué y cuándo, en una sola línea de tiempo con enlace a la pantalla de origen. | No hay tabla de auditoría: se **deriva** de las constancias de cada módulo (correcciones, solicitudes, reversas, notas de crédito, depósitos, cierres y reaperturas, agenda, planilla, contratos, cobranza, ajustes). |
| Cartera, Psicopedagogía | Ver §6 y §8. | — |

**Falta:** cortes históricos (todo se calcula al día), que la auditoría registre cambios de precios, recetas y permisos, y que Cartera y Psicopedagogía usen las piezas compartidas.

---

## 11. Modelo de datos: el id manda, lo derivable no se guarda ✅

**La inconsistencia:** el mismo dato vivía en dos o tres lugares (el titular en el alumno, en el plan y en la ficha; el programa del alumno en su ficha y en su matrícula; la fecha de la matrícula como texto y como ISO; el saldo del titular guardado y calculado). Cada copia se desactualizaba sola: al renombrar a una persona o pagar una cuota, unas pantallas decían una cosa y otras otra.

**La regla de oro:** cada dato tiene **un solo dueño**. Lo demás se calcula al mostrar o es una copia con una única puerta de corrección.

| Dato | Antes | Ahora (dueño) |
|---|---|---|
| Titular del alumno / del plan | Texto guardado en el alumno y en el plan | `guardianIds[0]` del alumno o de la matrícula; el independiente es su propio titular (`holderNameOf*`) |
| Alumnos, matrículas y saldo del titular | Contadores guardados | Se derivan de matrículas, planes y pagos (`guardianStatement.ts`) |
| Estado del alumno | `status` guardado | Activo si tiene alguna matrícula activa, Inactivo si todas cayeron, «Sin matrícula» si no tiene (`studentStatus`). Cae la última matrícula → pasa a Inactivo solo; se reactiva → vuelve a Activo |
| Programa y nivel del alumno | `program` en la ficha | La matrícula más reciente (`studentProgramOf`) |
| Edad | `age` guardada | Se calcula de la fecha de nacimiento (`studentAge`, `staffAge`); la fecha de nacimiento es obligatoria |
| Fechas | Texto «24 Mar 2024» + ISO opcional | Solo ISO; el texto se arma al mostrar (`formatDisplayDate`) |
| Próxima cuota del plan | `next` guardado | Se calcula de las cuotas abiertas (`nextInstallment`) |
| Saldo y estado del plan | Escritos por cuatro funciones distintas | Los escribe **solo** `recomputePlan` (cobros, reversas, refinanciación, caída, reactivación, cambio de programa) |
| Nombre del alumno en matrícula y agenda | Copia sin regla | Copia de visualización (listar y buscar sin cruces) que se corrige en `syncStudentName`; **nunca** se cruza por nombre |
| Sede, programa y nivel en la matrícula | Texto sin vínculo claro | El id manda; el texto se corrige en `syncCatalogLabels` al renombrar el catálogo (y la sede también en asignaciones y cuentas) |
| Nombre en un comprobante (pago, nota de crédito, contrato) | — | **Constancia:** conserva el nombre del día de la emisión y no se reescribe |

**Cómo encaja con el resto del sistema**
- *Reglas puras primero:* todo vive en `utils/identity.ts`, `statuses.ts`, `dates.ts`, `ids.ts` y `dataIntegrity.ts`; el contexto solo llama a esas funciones.
- *Cada panel muestra lo mismo:* Alumnos, Titulares, Matrículas, Planes, Pagos, Caja, Dashboard, Cobranza, Psicopedagogía y los reportes leen las mismas funciones; por eso pagar una cuota mueve a la vez el plan, la caja, el saldo del titular y la cartera.
- *Con historial se conserva:* un alumno o un titular con matrículas, asesorías o seguimiento no se elimina.
- *Estados tipados* (`statuses.ts`): matrícula (Activa / Caída), contrato (Vigente / Cesado; «Vencido» se calcula), plan (Al día / Atrasado / Completado / Caída), cuota (Pendiente / Parcial / Pagada / Vencida / Anulada / Refinanciada), pago (Aprobado / Anulado).
- *Ids:* una política `PREFIJO-NNN` (registro `ID_PREFIX`) y un asignador que no repite ni siquiera dentro del mismo instante. Los catálogos de configuración usan número correlativo.
- *Datos de ejemplo coherentes:* cinco casos con fechas relativas a hoy (al día, atrasado, caída con su solicitud, contado por verificar, vigencia por vencer), armados con las mismas funciones que el flujo real; cada cobro de una cuota existe como pago y deja su movimiento de caja.

**Qué falta:** pasar a ids las asignaciones y las cuentas de usuario (hoy guardan la sede por nombre y se corrigen al renombrar) y el responsable de la asesoría (texto).

---

## 12. Funciones y roles: un solo registro, con sus conexiones ✅

**El problema:** el catálogo de permisos estaba escrito a mano (67 acciones) y cada pantalla decidía por su cuenta qué mostrar; 109 acciones del contexto modifican datos y casi la mitad no tenía permiso. Armar roles así obliga a adivinar qué depende de qué.

**La regla:** cada cosa que una persona puede hacer es una **función** declarada **una sola vez** en `src/utils/capabilityRegistry.ts`. De ese registro se derivan el catálogo de Organización → Permisos, el constructor de roles, el reparto de avisos y el cuadro `docs/CATALOGO_DE_FUNCIONES.md` (generado con `npx tsx scripts/doc-capabilities.ts`; no se edita a mano).

| Dato de cada función | Para qué sirve |
|---|---|
| Identificador `funcionalidad:acción` (el permiso de siempre) | Los roles y los `can(PERM.x)` existentes siguen valiendo; los 67 identificadores anteriores se conservan |
| **Requiere** (mismo usuario) | Al marcar una función se marcan solas las que necesita; no se puede quitar una que otra marcada necesita. Toda función que no es «ver» exige poder ver su pantalla |
| **Contrapartes** (otras personas; puede haber varias) | Lo que alguien más debe poder hacer. **Obligatoria**: sin ella la función no se ofrece y se dice por qué (enviar, sin nadie que reciba en la sede destino). **Recomendada**: se ofrece y se avisa (matricular sin quien entregue materiales ni quien agende la primera asesoría; cobrar sin quien cierre la caja; armar la planilla sin quien la cierre y la pague; pedir una transferencia sin quien la apruebe) |
| Lee / escribe | Los datos que toca; alimentan el mapa de conexiones |
| Avisos que dispara | Cada aviso llega a quien tenga cierta función en la sede que corresponde (no a un nombre de rol); si nadie la tiene, a quien tenga «Recibir los avisos que nadie más puede recibir» |
| Sensibilidad | 💲 dinero · sueldos · control (pide motivo y deja historial) |
| Acciones del contexto que protege | Verificado: toda acción del contexto está dentro de una función o declarada como «no es una función» con su razón, y **todas piden su función antes de ejecutarse** (§17) |

- **Contrapartes y sedes:** se resuelven con las cuentas activas de roles activos y su sede (principal y adicionales). Quien tiene «Ver y operar todas las sedes» cubre cualquiera. **El Superusuario no cuenta como contraparte**: es un rol técnico y, si contara, nunca se notaría que falta crear al receptor real.
- **Separación de funciones:** quince combinaciones que un rol no debería reunir sin razón, por área. *Dinero:* cobrar + reversar + cerrar caja; cobrar + emitir notas de crédito; reversar + reabrir caja; egresos + reversa + cierre de caja; gasto + reversa + arqueo de caja chica. *Solicitudes:* pedir + aprobar (una regla por cada tipo: caída, reactivación, cambio de programa, traslado). *Mercadería:* despachar + recibir; aprobar + despachar + recepcionar una transferencia. *Personal:* generar + pagar planilla; fijar el sueldo del contrato + generar + pagar; crear la ficha + la cuenta + asignarle el rol. *Accesos:* definir permisos + asignar roles. Se muestran como advertencia y piden un motivo para guardar. Un administrador de sede típico (cobra, cierra, matricula, verifica, agenda, recibe) y un almacenero típico (prepara, despacha, ajusta) **no** reciben ninguna advertencia: se probó para no volverlas ruido.
- **Aprobar exige poder ver la bandeja:** las cuatro funciones «Aprobar…» piden «Ver solicitudes pendientes», que es donde se resuelven. **Crear un usuario** pide «Ver el personal» (la cuenta nace de la ficha).
- **Sueldos:** una función propia, «Ver remuneraciones y costo de planilla». Planilla la exige y, **sin ella, se ocultan los importes** en Contratos (columna, detalle y CSV), Personal (sueldo neto), Reporte de personal (costo de planilla) y Auditoría (el valor de los campos de sueldo y los importes de la planilla; sí se ve que cambiaron, quién y el motivo).
- **Un permiso por reporte** (además del base «Ver reportes»): Contabilidad puede ver Caja sin ver Personal. Auditoría usa su propia función.
- **Un rol nunca queda a medias:** al guardar los permisos de un rol, el sistema suma lo que cada función necesita (enviar suma «Ver envíos» y «Ver el stock»). Guardar permisos deja un aviso de control.
- **Funciones reservadas** (sin proceso detrás, no se ofrecen): editar borrador y confirmar matrícula, guardar vistas de reportes.
- **Qué falta:** el constructor de roles (paso 5) y el usuario activo (paso 7); las guardas ya están (§17).

---

## 13. Avisos con destinatario y alertas ✅

**El problema:** las notificaciones no decían a quién iban; todas las veía todo el mundo (y filtradas, si acaso, por la sede del selector temporal).

**La regla:** un aviso **no guarda a quién llegó**: guarda *qué pasó* (`eventId`) y *dónde* (`scope`: sede origen, sede destino, sede del alumno, quién lo pidió). Quién lo recibe se **calcula al mostrar** (`utils/notifications.ts`) con las cuentas activas y las funciones de su rol: llega a quien tenga la función indicada en la sede que corresponde, **no a un nombre de rol**.

- **Consecuencia buscada:** al crear un usuario con «Confirmar la recepción de un envío» en Piura, empieza a ver los envíos que ya iban hacia Piura; si se le quita la función, deja de verlos. El aviso de un envío a Arequipa no llega a Piura.
- **Varios destinatarios por aviso.** Ejemplos: una recepción con faltante llega a quien ajusta stock en el almacén de origen **y** a la supervisión; una cuota refinanciada, a cobranza de la sede del alumno **y** a la supervisión; el stock bajo el mínimo, a quien solicita transferencias en esa sede **y** al almacén.
- **Supervisión** (función propia): recibe copia de lo que se controla (pagos y movimientos de caja reversados, caja reabierta, diferencias de recepción, cambios de permisos, refinanciaciones). No es lo mismo que ver la Auditoría.
- **Respaldo:** si nadie cumple la regla (no hay quien reciba en la sede), el aviso llega a quien tenga «Recibir los avisos que nadie más puede recibir» y se marca «Te llega porque nadie más podía recibirlo». Sin respaldo, no llega a nadie y no falla.
- **Si falta la sede** en el aviso, llega a todos los que tienen la función (mejor de más que perderlo).
- **Lectura por usuario:** cada uno marca los suyos como leídos; que Piura lo lea no lo marca para Arequipa.
- **El Superusuario ve todos** (soporte); un aviso general (sin evento) lo ve cualquiera.
- **Alertas por regla** (`utils/systemAlerts.ts`): no se guardan, se calculan y desaparecen solas al corregir la causa. Son cuotas vencidas por sede (sin las matrículas caídas), primeras asesorías que esperan sus materiales por sede (rojo si es crítica o vencida), contratos vigentes que vencen en 30 días o menos, y artículos bajo el mínimo por sede (estar justo en el mínimo no cuenta). Llegan con las mismas reglas de destinatarios y cada una lleva a la pantalla donde se resuelve.
- **Dónde se ve:** la campana del encabezado: «Alertas por resolver» y «Avisos». Se reemplaza el ítem de menú «Alertas del sistema» (que era una copia del Dashboard).
- **Avisos que se emiten hoy:** envío despachado, cancelado y recibido; transferencia solicitada, aprobada o rechazada, en tránsito y recibida; recepción con diferencias; solicitud de caída, reactivación, cambio de programa y traslado pendientes y su resolución; pago y movimiento de caja reversados; caja reabierta; cuota refinanciada; permisos de un rol modificados.
- **Falta:** que la resolución de una **caída** y los **rechazos** también avisen a quien pidió (hoy solo avisa la aprobación de una reactivación, un cambio de programa o un traslado); identificar a quien pidió una solicitud por id (hoy las solicitudes guardan su nombre, y por eso el aviso lo busca por nombre).

---

## 14. Logística: un almacén central, rutas obligatorias y stock con reglas ✅

**La regla del negocio:** hay **un solo almacén central, aparte de las sedes** (entidad `Warehouse`, ids `ALM-NNN`, Organización → Almacenes), y todo lo que se mueve entre sedes pasa por él. **Los Olivos es una sede como las demás**, con su propio stock de venta: antes el almacén era esa filial marcada con una casilla y vendía del mismo stock con el que abastecía (se mezclaban). Una **ubicación de stock** es el almacén o una sede (`stockLocations`); el stock, el kardex, los envíos y las transferencias usan su id.

**El almacén no vende** (`locationSaleError`): recibe compras, despacha a las sedes y recibe devoluciones. Se inactiva solo si está vacío, y solo puede haber un almacén central activo.

**Ver no es mover (2026-11-05):** quien alcanza todas las sedes (`org-alcance:all_branches`, la sede «Todas» o un rol con esa función) **ve** el stock, el kardex, los envíos y las transferencias del almacén —necesita el total para aprobar reposiciones y para los reportes—, pero **solo lo mueve** quien tiene el almacén asignado en su cuenta (`User.warehouses`) o es Superusuario: despachar y cancelar envíos, ingresar compras, ajustar, empaquetar y recibir devoluciones (`warehouseOperationError`). Así quien aprueba o consulta no despacha ni ajusta. Los avisos y las contrapartes del almacén («¿quién recibe esta devolución?») se calculan con las cuentas asignadas a él, no con las de alcance total. El límite de cuentas de un rol cuenta **por sede o por almacén**.

| Operación | Ruta permitida | Reglas (`utils/logisticsRoutes.ts`) |
|---|---|---|
| **Envío** | Sale siempre del almacén central hacia una filial activa | No puede salir de una filial, ni ir al propio almacén; sin almacén definido no hay envíos |
| **Transferencia** | Siempre con el almacén en un extremo: reposición (almacén → filial) o devolución (filial → almacén) | **Entre dos filiales no hay transferencia directa**: lo que sobra se devuelve al almacén y desde allí se envía. En la pantalla, al elegir una filial en un extremo, el otro extremo pasa a ser el almacén |
| **Almacén central** | Uno solo activo, aparte de las sedes | No puede haber dos activos; no vende; no se inactiva con mercadería dentro |

- **Envío vs. transferencia:** el envío lo prepara el almacén (cajas, courier, seguimiento); la transferencia es una *solicitud con aprobación* (pedir reposición o devolver). Las dos terminan en una recepción.
- **El stock solo lo mueven acciones con función:** `updateStock` **ya no existe para las pantallas**. Lo que antes la llamaba directo ahora son acciones con validación:
  - **Vender un artículo en caja** (`registerItemSale`, función «Vender un artículo en caja»): comprueba el precio vigente de la sede, el stock, el tipo de cambio si se cobra en soles y que la caja del día no esté cerrada; descuenta el stock y registra el ingreso **en una sola operación** (si algo falla, no se hace nada).
  - **Entrega de materiales** (`updateEnrollmentVerification` con sus descuentos): primero comprueba el stock de **todas** las líneas y descuenta solo si alcanza para todas (todo o nada); si falta una, dice cuál con su nombre.
  - **Ingreso de stock** (`registerStockEntry`, función «Registrar un ingreso de stock»): exige sede, artículo, cantidad **entera** mayor a 0 y el **documento que lo respalda** (factura, guía o acta); queda en el kardex.
- **Semilla:** Los Olivos tiene stock propio (el almacén) y los envíos y transferencias de ejemplo respetan las rutas.
- **Falta:** guardas por función en el resto de acciones de logística (despachar, aprobar, recepcionar) y que la sede destino de un envío pida «Confirmar la recepción» como contraparte al preparar el envío en pantalla (hoy lo calcula `availability`, pero las pantallas aún no lo consultan).

---

## 15. Recetas de materiales: una sola activa por programa, nivel, sede y período ✅

**El problema:** la validación vivía dentro de la pantalla, la pantalla escribía el estado directo (`setRecipes`) y **duplicar** creaba una copia activa que chocaba con la original (la verificación no sabría cuál entregar); **activar** una receta tampoco comprobaba el solape.

- Las reglas viven en `utils/recipes.ts` y las usa la acción `saveRecipe`: nombre, programa, al menos un artículo, sin repetidos, cantidades ≥ 1, solo artículos activos y habilitados para matrícula (al editar se conserva uno que ya estaba), fecha de inicio, fin no anterior al inicio, y al menos una sede si no aplica a todas.
- **Solape:** mismo programa, niveles que se cruzan («todos los niveles» choca con cualquiera), sedes que se cruzan («todas las sedes» choca con cualquiera) y períodos que se tocan (sin fecha de fin = indefinida). Solo cuenta contra recetas **activas**; una receta no choca consigo misma al editarla.
- **Duplicar** crea la copia **inactiva** («(Copia)»), con listas propias. **Activarla** vuelve a comprobar el solape: mientras la original siga activa se rechaza diciendo con cuál choca; funciona cuando la original se desactivó. Desactivar siempre se puede.
- Tres funciones separadas: crear y duplicar, editar, y activar o desactivar (esta última es de control).

---

## 17. Guardas: cada acción pide su función y cada pantalla oculta lo que el rol no puede ✅

**El problema:** solo 33 de las ~120 acciones del contexto validaban permiso; el resto dependía de que la pantalla «se acordara» de ocultar el botón. Había además pantallas que escribían el estado sin pasar por el contexto (catálogo de artículos, couriers y métodos de envío) y funciones que no existían (crear o editar un artículo, mantener los couriers).

**La regla (dos capas, una sola fuente: el registro):**
- **Capa de acciones** (`utils/guards.ts`, `guardActions`): el contexto envuelve **todas** sus acciones. Antes de ejecutar una, comprueba la función que el registro le asigna. Sin ella devuelve `{ ok: false, error }` («Su rol no tiene la función «Reversar pago».»); las 47 acciones que no devuelven resultado (crear catálogos, guardar permisos…) lanzan `PermissionError`, porque una pantalla bien armada nunca las ofrece sin la función. Una acción nueva queda protegida sin escribir nada más: basta declararla en el registro.
- **Cuando la función depende de lo que se hace**, el resolutor mira los argumentos: un ingreso de caja pide «Registrar ingreso» y un egreso «Registrar egreso»; matricular pide «Crear» y renovar pide «Renovar»; el arqueo de la caja chica pide el suyo; cada estado de una transferencia pide su función (solicitar, aprobar, despachar, recepcionar; cancelar la puede quien solicita, aprueba o despacha); «Asistió» o «Faltó» piden marcar asistencia, cancelar o mover pide reprogramar; **un envío que nace «En tránsito» pide preparar y despachar** (despachar es lo que mueve el stock) y completar las cajas y el transporte de una transferencia pide despachar. `updateUser` mira qué campos cambian de verdad frente a la cuenta (desactivar, cambiar rol, cambiar sedes, corregir datos) y pide una función por cada uno.
- **Capa de pantallas** (`can('funcionalidad:acción')`): **sin la función el botón no se ve** (`hidden` en los menús de fila; `ActionMenu` desaparece si no le queda ningún ítem). **Con la función pero sin contraparte obligatoria, se ve apagado y dice por qué** (despachar un envío o una transferencia a una sede donde nadie puede recibir). Las acciones de control que ya mostraban «Reversar (requiere autorización)» apagado se conservan así.
- **Menú y rutas:** cada ítem se ve solo con su función de ver; un módulo sin ítems visibles desaparece (Dashboard y Mensajería incluidos); el botón «Configuración» solo se ofrece si hay alguna sección, y cada sección pide la suya (`config/settingsSections.ts`); la campana pide «Ver la bandeja de avisos»; el acceso directo «Nueva matrícula» pide crear. **Abrir por la barra de direcciones una pantalla sin permiso muestra «Su rol no tiene acceso a «X»» y nombra la función que falta** (`NoAccess`).
- **Dashboard:** las cifras de dinero (cartera, pagos del día, caja por moneda, vencimientos, ingresos y mora por sede) piden «Ver las cifras de dinero»; el resto del resumen se ve con «Ver el resumen general».
- **Al Superusuario se le ofrece siempre** lo que depende de una contraparte (es quien crea las cuentas que faltan y hoy puede hacerlo todo), con el motivo como aviso. Un rol que no es Superusuario sí queda bloqueado. **Esto se revisa cuando existan los usuarios reales.**
- **Lo que faltaba en el registro** (se agregó): «Crear artículos» (uno a uno o por carga masiva; un artículo que se vende nace con su precio general, ambos se guardan juntos o ninguno), «Editar, activar y desactivar artículos» y la funcionalidad «Couriers y métodos de envío» (ver, crear, editar). Estas pantallas escribían con modificadores crudos del estado (`setItems`, `setCouriers`, `setShippingMethods`); ya no existen: tampoco `setTransfers`, `setRoles`, `setUsers` ni `setCompanies`, que nadie usaba. **Ninguna pantalla puede saltar la validación porque ya no hay por dónde.**
- **Formularios:** al editar una cuenta, el rol y las sedes quedan bloqueados sin «Asignar rol» o «Asignar sedes»; la plantilla de contrato queda de solo lectura sin «Editar las plantillas».

---

## 18. Constructor de roles: plantillas, motivos, límite por sede y semáforo ✅

**Qué es:** Organización → **Permisos** es el constructor (dos paneles); **Roles** crea el rol (con plantilla y límite); **Usuarios** crea las cuentas y valida el rol y el límite. Todo sale del registro único (§12): no se escribe ningún permiso a mano ni se dibuja ninguna conexión.

- **Panel A · Mapa de conexiones** (solo lectura): filtro por módulo y búsqueda; al elegir una función se colorea qué necesita, qué la necesita, su contraparte y de qué es contraparte; el detalle muestra lo que lee y escribe, los avisos que dispara y recibe, las combinaciones a separar y **qué roles la tienen**.
- **Panel B · Editor de rol:** al marcar una función se marcan solas las que necesita (y se dice cuáles); una función que otra marcada necesita no se puede quitar (el candado dice cuál). A su lado, tres cuadros que se recalculan con lo que se está armando (aún sin guardar): **combinaciones a separar**, **semáforo de contrapartes** y **menú que verá** ese rol.
- **Combinaciones a separar piden motivo** (mínimo 5 letras): no impiden guardar, pero el rol no se guarda sin él. El motivo queda **en el rol** (`Role.acceptedRisks`: regla, motivo, quién y cuándo) y se ve en el detalle del rol. Lo ya aceptado no se vuelve a pedir mientras la combinación siga igual; si deja de aplicar, el motivo se descarta; un motivo nuevo reemplaza al anterior con su autor y fecha.
- **Semáforo de contrapartes** (con las cuentas de hoy, solo las activas, sin contar al Superusuario): rojo = falta una obligatoria («Envío: sin “Confirmar la recepción” en Chiclayo, Cajamarca…»), ámbar = falta una recomendada, gris = lo que debe cubrirse «en la misma sede» no se puede medir hasta que el rol tenga cuentas. Un envío sale siempre del almacén: el almacén no cuenta como destino.
- **Plantillas** (`utils/roleTemplates.ts`, son datos): Administrador de sede (hasta 3 cuentas por sede), Psicopedagogía (3), Almacén central (3: jefe y auxiliares), Administración general, Contabilidad (solo lectura y exportación) y Superusuario (rol del sistema). Se usan al crear el rol (nace ya con sus funciones, en una sola operación) o desde el editor («Partir de una plantilla»). **Solo es el punto de partida:** el rol se edita libremente. Las 6 cargan como roles de ejemplo, con 7 cuentas de ejemplo.
- **Separación de funciones en las plantillas:** la sede cobra y cierra la caja pero **no** reversa pagos, no emite notas de crédito ni reabre cierres; pide caídas, reactivaciones, cambios y traslados pero **no** los aprueba. El almacén despacha pero **no** confirma recepciones de envíos. Administración general aprueba y reversa pero no cobra. **Contabilidad es solo lectura y exportación.** **La planilla es informativa: el sistema no registra pagos al personal** (los sueldos son datos del trabajador), así que ninguna plantilla de negocio marca «Registrar el pago de la planilla» (solo el Superusuario) y se retiró la contraparte recomendada «quien registre el pago». **Solo Administración general, Contabilidad y el Superusuario ven sueldos.** Crear usuarios y asignar roles es solo del Superusuario.
- **Administración general reúne a propósito una combinación** (reversar movimientos de caja y reabrir cierres, porque la sede no puede hacerlo): la plantilla la **declara con su motivo** (`RoleTemplate.risks`) y por eso el rol de ejemplo ya la trae aceptada. Ninguna otra plantilla reúne combinaciones.
- **Límite de cuentas por sede** (`Role.branchUserLimit`, sin valor = sin límite): se mide con las cuentas **activas** del rol que cubren la sede (principal o adicional). Solo se mira lo que la cuenta pasa a ocupar: quien ya ocupa su lugar no se bloquea por un límite que se bajó después. Reactivar una cuenta en una sede llena se bloquea. «Todas» no ocupa lugar. Cada persona tiene su cuenta (no se comparte una por sede).
- **Quién puede dar qué rol:** el rol debe existir y estar activo; **el rol del sistema (Superusuario) solo lo da el Superusuario** (si no, quien asigna roles se daría cualquier acceso). Quien conserva su rol no se bloquea aunque se haya apagado después. Usuarios solo ofrece los roles que se pueden dar.
- **El número de cuentas de un rol ya no se guarda** (`Role.users` desapareció): se calcula con las cuentas (`roleUsage`). Renombrar un rol cambia el rol de sus cuentas (el enlace es por nombre hasta el paso 10). **Un rol con cuentas no se elimina** (se reasignan antes; cuenta inactiva también cuenta). **El rol del sistema no se edita, desactiva ni elimina** y sus funciones no se tocan.
- **Acciones del contexto:** `addRole` (puede traer `permissions` y `reasons`: nace armado o no nace), `updateRole`, `deleteRole` y `savePermissions` ahora devuelven `{ ok, error }` (antes no devolvían nada y las pantallas no se enteraban). Crear un rol ya con funciones pide además «Configurar permisos».
- **Rol de ejemplo anterior:** los 5 roles genéricos (Administrador Global, Director Académico, Coordinador de Ventas, Docente, Cajero) se reemplazaron por las plantillas; las cuentas de ejemplo pasaron a ellas y el rol sugerido al crear la cuenta de un trabajador sale de su rol del sistema (Psicopedagogía → «Psicopedagogía»; Administración y Ventas → «Administrador de sede»).
- **Con las cuentas de ejemplo** (Piura y Los Olivos con administrador, Chiclayo con su cuenta inactiva, almacén y contabilidad en Los Olivos): despachar a Piura se ofrece y a Chiclayo no; transferir hacia el almacén se ofrece.

---

## 19. Roles y cuentas se guardan en el navegador (provisional) ✅

> **Superado el 2026-11-05:** los roles y las cuentas ya viven en la base de datos (ver «Roles y permisos en la base de datos» y «Cuentas con invitación por correo» al final). Esta sección queda como historia.

**Qué es:** mientras no haya base de datos, los **roles, los permisos de cada rol y las cuentas** se guardan en el navegador (`localStorage`, clave `ensil.access`) y se recuperan al recargar. Es un puente hasta el paso 10: vive solo en ese navegador, no lo ven otras personas ni otros equipos y no protege nada (los permisos siguen ocultando botones). **Todo lo demás** (matrículas, pagos, stock, planilla…) sigue en memoria y vuelve a los datos de ejemplo al recargar.

- **Lo guardado no es confiable** (`utils/accessStore.ts`): se valida campo a campo al arrancar. Texto que no es JSON, de otra versión o con otra forma → se usan los datos de ejemplo y se avisa.
- **El Superusuario nunca sale de lo guardado:** el rol del sistema y sus funciones son siempre los de partida, aunque alguien edite el almacenamiento.
- **Funciones:** las que ya no existen o hoy son reservadas se quitan del rol, y lo que cada función necesita se vuelve a completar. Una combinación aceptada solo se conserva (con su motivo, autor y fecha) si todavía aplica.
- **Roles descartados:** sin nombre, repetidos (por id o por nombre, sin importar mayúsculas), con estado inválido, nombre de más de 60 letras; el límite por sede fuera de 1–50 se quita.
- **Cuentas descartadas:** las que apuntan a un rol, una sede o un trabajador que ya no existe (esos datos vuelven a los de ejemplo al recargar: un trabajador creado en la sesión no sobrevive) o con id repetido. Se avisa cuántas.
- **Lo borrado queda borrado:** un rol de partida eliminado no reaparece solo.
- **Pantallas:** Roles y Usuarios muestran un aviso con el estado («Se recuperó lo guardado la última vez», lo descartado) y «Volver a los de ejemplo» (pide función «Configurar permisos» y confirmación): borra lo guardado y recarga, así que el resto de los datos también vuelve a los de ejemplo.
- **Sin almacenamiento** (bloqueado, lleno, ventana privada): el sistema funciona igual en memoria; nada se rompe.

---

## 20. Sesión: cuenta activa, cambio rápido con PIN y la sede que se ve ✅

> **Superado el 2026-11-05:** el cambio rápido con PIN, el bloqueo de la sesión y las cuentas de ejemplo con PIN 1234 se retiraron (con ingreso real por contraseña eran una puerta para pasar a «Superadmin»). Siguen vigentes la sede que se ve y las protecciones de las cuentas.

**Qué es:** el sistema ya no trabaja siempre como «Superadmin»: trabaja con **una cuenta de Usuarios** (`currentUser` sale de ella) y todo lo que se hace queda a su nombre. Cambiar de persona es rápido (una laptop por sede): menú de la cuenta (arriba a la derecha) → **Cambiar de usuario** → elegir la cuenta → PIN. **No es seguridad real** (llega con el servidor, paso 10): el PIN se guarda como una marca irreversible, pero un PIN de 4 a 6 dígitos se adivina sin esfuerzo si alguien lee esa marca.

- **PIN:** de 4 a 6 números. Tras **5 fallos seguidos la cuenta se bloquea 60 segundos** (ni el PIN correcto entra mientras dura); un acierto limpia los fallos; un formato inválido no cuenta como intento. Los fallos viven en memoria (recargar los reinicia). Una cuenta **sin PIN no puede entrar** y se ve atenuada con «Sin PIN».
- **Quién fija el PIN:** cada persona el suyo (menú de la cuenta → «Cambiar mi PIN», pide el actual); el Superusuario o quien tenga «Resetear acceso» lo fija o lo restablece en Usuarios («Restablecer PIN», o el campo PIN al crear o editar); **el PIN de un Superusuario solo lo cambia otro Superusuario** (si no, quien edita cuentas tomaría su acceso). El PIN llega en claro a la acción y solo se guarda su marca (`User.pinHash`, con la cuenta como sal); una marca enviada desde fuera se ignora.
- **Con quién empieza:** la primera vez (nada guardado), el Superusuario **sin PIN** (comodidad de la etapa de pruebas, hasta el inicio de sesión real); después, la cuenta de la última vez (`ensil.session`). Si esa cuenta ya no existe o se desactivó, o si la sesión estaba **bloqueada**, empieza bloqueada. **Bloquear sesión** (botón inferior del menú y menú de la cuenta) deja una pantalla que no se puede cerrar hasta que una cuenta entre con su PIN. Si la cuenta de la sesión se desactiva o se elimina, la sesión se bloquea (reactivarla no la abre sola).
- **Al entrar otra cuenta** se abre su primera pantalla (Dashboard si su rol lo ve; si no, el primer ítem de su menú) y la vista de sede vuelve a la suya. Se anota «Hoy HH:MM» como último acceso.
- **Sede que se ve** (reemplaza al selector de pruebas): sale de la cuenta. Alcanzan **todas** las sedes el Superusuario, quien tiene sede «Todas» y quien tiene la función de alcance a todas las sedes (Almacén central, Contabilidad, Administración general): empiezan en «Vista global» y pueden elegir cualquiera. Quien alcanza una sola sede (administrador de sede, Psicopedagogía) **queda en ella y el encabezado solo la muestra**; con sedes adicionales elige solo entre las suyas. Una sede inactiva o inexistente no se alcanza; una cuenta sin sede alcanzable no ve datos de ninguna. `selectBranch` rechaza una sede fuera del alcance. **Recepciones** pide siempre elegir una sede concreta (en vista global ofrece las sedes que alcanza).
- **Menú:** ya no hay reglas por nombre de rol (`Logística nacional`, `Superusuario`) en la barra lateral: cada ítem se ve solo por su función. **Dashboard por rol:** cada tarjeta, enlace y panel aparece solo si el rol abre la pantalla a la que lleva; el dinero (cartera, cobros, caja, vencimientos y la actividad reciente) pide «Ver cifras de dinero»; «Resumen por sedes» pide Matrículas o dinero; **las cifras salen de la sede que se ve** (`scopeDashboard`: sus matrículas, los planes y pagos de esas matrículas, su caja, su stock y sus solicitudes). Los accesos rápidos son los de administración y, si sobran lugares, las pantallas de trabajo del rol (Programación, Stock, Pagos…).
- **Protecciones de las cuentas:** **nunca se queda el sistema sin una cuenta activa de Superusuario** (no se elimina, desactiva ni cambia de rol la última; si lo guardado en el navegador no trae ninguna, vuelve la de partida); **nadie elimina ni cambia el rol o el estado de su propia cuenta** (lo hace otra persona; sí edita sus otros datos). `deleteUser` ahora devuelve `{ ok, error }`.
- **Datos de ejemplo:** 8 cuentas, todas con el **PIN 1234** (incluida «Superadmin», el Superusuario). Lo guardado antes del PIN recupera el de ejemplo en las cuentas de ejemplo; las cuentas propias quedan sin PIN hasta que el Superusuario se lo fije. El id de la cuenta nueva se asigna con `nextSequentialId` (ya no por cantidad, que podía repetirse).
- **Qué no cambia:** las pantallas que no filtran por sede (Matrículas, Pagos, Planes, Alumnos, reportes…) siguen mostrando todas las sedes: el alcance por sede en cada pantalla es el trabajo pendiente de «alcance por sede según la sesión».

---

## 21. Pruebas por rol: la matriz de lo que ve y puede cada cuenta ✅

**Qué es:** `utils/roleMatrix.ts` calcula, para cada cuenta, con las mismas reglas del sistema: las funciones de su rol, el **menú** que ve, su **primera pantalla**, su **Dashboard**, las **sedes** que alcanza, los **avisos** que recibe y cuáles de 34 **acciones clave** puede ejecutar (con `guardActions`, la misma comprobación que frena a una pantalla). `scripts/check-role-matrix.ts` la contrasta con lo que el negocio decidió; `scripts/doc-role-matrix.ts` genera la matriz completa en **`docs/PRUEBAS_POR_ROL.md`** (no se edita a mano). Cambiar un rol o una plantilla y volver a ejecutar ambos muestra qué cambió para cada persona.

- **Qué se verifica:** que cada rol pueda y no pueda lo decidido (sede cobra y no reversa; Psicopedagogía marca asistencia y no ve dinero; Almacén despacha y no confirma recepciones; Administración general aprueba y reversa y no cobra; Contabilidad no ejecuta nada; el Superusuario puede todo); la **separación de funciones** (nadie cobra y reversa; quien pide una caída no la aprueba; quien despacha no recibe; solo Administración general y el Superusuario reversan o reabren la caja; solo el Superusuario paga la planilla, crea roles, cuentas o sedes); quién ve **sueldos y dinero**; que el **menú** de cada cuenta tenga un ítem por cada función de menú que su rol tiene (ni más ni menos); que ningún **Dashboard** quede vacío y que cada acceso lleve a una pantalla que el rol abre; que los **avisos** lleguen a la sede que corresponde (y al respaldo si nadie puede); que la **guarda real** deje pasar lo que la matriz dice y frene lo demás nombrando la función que falta.
- **El Dashboard sale de una regla pura** (`dashboardLayout(can)` en `utils/dashboard.ts`): la pantalla solo la pinta. Los accesos «Nuevo…» (promoción, tarifario, usuario, filial) se ofrecen solo a quien puede **crear** eso, no a quien solo ve la pantalla. La primera pantalla de quien entra (`firstPathFor`) vive en `utils/session.ts`.
- **Hallazgos corregidos:** (1) **Titulares mostraba saldo, deuda vencida y estado de cuenta a quien no ve pagos** (Psicopedagogía veía lo que debe cada titular): ahora esas columnas, el filtro de deuda, la exportación del saldo y «Ver estado de cuenta» piden «Ver pagos»; (2) los accesos rápidos «Nueva Filial» y «Nuevo Usuario» se ofrecían a quien no puede crearlos.
- **Hallazgos que se dejaron por confirmar y se resolvieron el 2026-11-03:** ver §23.
- **Qué no cubre:** el filtro por **sede** de cada pantalla. Mientras los datos sean de ejemplo en memoria no tiene sentido construirlo: con la base de datos lo hace la propia base (cada tabla con su sede y reglas por sede, paso 10) y no cada pantalla.

---

## 22. Reglas pendientes: vacaciones y ceses frente a la agenda, renovación de contratos y la planilla que NO pasa a caja ✅

**Planilla → Caja: descartada (decisión del negocio, 2026-11-03).** El sistema **no registra pagos al personal**: la planilla y los temas salariales son solo información del trabajador. Por eso «pagar la planilla» **no** genera un egreso en Caja ni cuenta en el cierre. La marca «Pagada» se **retiró** (ver §23).

### 22.1 Vacaciones y cese frente a la agenda (`utils/staffAvailability.ts`)
Una persona **no puede ser responsable** de una asesoría o actividad en una fecha en la que no trabaja:
- **De vacaciones:** las del contrato vigente, del inicio al retorno, ambos días incluidos.
- **Después de su cese:** contrato cerrado y sin otro contrato que la cubra (si vuelve con otro contrato, solo falta entre medio).
- Un contrato **vencido** sin renovar ni cerrar **no** bloquea la agenda: ya lo avisa la alerta «contratos por vencer» y la decisión es del negocio.

Se aplica en cada punto donde se decide quién atiende:
- **Programación (asesorías):** la lista de responsables marca «(no está ese día)» y no deja elegir a quien no trabaja en la fecha; al guardar y al **reprogramar** (`updateSchedule`) se vuelve a comprobar, también al cambiar solo el responsable.
- **Actividades especiales:** `validateResponsible` y la lista de responsables muestran el cruce («está de vacaciones del … al …») y no lo permiten.
- **Al revés:** no se **programan o cambian vacaciones** sobre la agenda de la persona (asesorías pendientes y actividades a su cargo en esas fechas; las ya atendidas o canceladas no cuentan) y no se **cierra un contrato** si tiene agenda **después** de la fecha de cese (el día del cese sí se trabaja). El mensaje cuenta lo que hay y dice qué hacer: «reasígnelas primero en Psicopedagogía → Programación». Al editar un contrato sin tocar las vacaciones no se vuelve a exigir lo que ya estaba.
- **No cubre:** el responsable de la **entrevista** del asistente de matrícula (es quien está ese día en la sede) ni las asesorías que ya existían cuando se carga un cese por otro medio.

### 22.2 Renovación de contratos (`utils/contractRenewal.ts`, acción `renewContract`, función «Renovar contrato»)
- Renovar es **seguir con la misma persona sin pasar por un cese**: el contrato que vence queda **«Renovado»** (historial, con su fecha de fin intacta) y nace uno **nuevo desde el día siguiente** a su fin, con las mismas condiciones salvo la nueva fecha de fin y, si cambia, el sueldo (se valida como un contrato nuevo, incluida la RMV, y el neto se recalcula). Las **vacaciones no se copian**.
- Solo se renueva un contrato **con fecha de fin** (plazo fijo o locación) que **ya venció o vence dentro de 30 días** (los mismos de la alerta «contratos por vencer»); un indeterminado, uno cesado o uno ya renovado no. **Pide motivo** (mínimo 5 letras) y queda en las observaciones del contrato nuevo.
- Bloqueos: otro contrato posterior de la persona; una **planilla cerrada** del mes de inicio o posterior (se reabre antes). El nuevo guarda de cuál viene (`renewsId`); a cuál dio paso el anterior se **deduce** (no se guarda).
- La persona sigue teniendo **un solo contrato vigente** y la planilla toma cada contrato por sus fechas (el anterior cubre hasta su fin y el nuevo desde el día siguiente). La alerta «contratos por vencer» desaparece al renovar.
- Función `per-contratos:renew` (sensible: sueldos): la tiene Administración general y el Superusuario. En Personas → Contratos aparece la acción «Renovar contrato» solo cuando se puede, y el detalle muestra «Renueva el contrato …» y «Dio paso al contrato …».

---

## 23. Decisiones del 2026-11-03 sobre los hallazgos de las pruebas por rol ✅

| # | Decisión | Cómo quedó |
|---|---|---|
| 1 | **El Almacén no fija precios** | `log-catalogo:edit_price` salió de la plantilla del Almacén (ve y mueve el stock, no toca dinero). **Administración general** lo fija (y por eso ve «Catálogo de artículos»). |
| 2 | **Reabrir el cierre de la caja chica es de Administración general** | Función nueva `op-caja-chica:reopen_box`; «Hacer arqueo y cierre» de la caja chica solo cierra. La sede cuenta y cierra su caja chica pero ya no la reabre; cada reapertura sigue pidiendo motivo y avisando («Caja reabierta»). Combinación nueva a separar `reversar-reabrir-caja-chica` (reversar gastos + reabrir su conteo), que Administración general declara con su motivo. |
| 3a | **Psicopedagogía ve Alumnos, no Titulares** | Salió `per-titulares:view` de su plantilla (necesita al alumno, no al apoderado). |
| 3b | **Psicopedagogía recibe el aviso «Primera asesoría sin materiales» de su sede** | El aviso llega también a quien puede marcar la asistencia en la sede del alumno: es quien se ve afectado (sin materiales no se marca asistencia). |
| 4 | **Se retiró la marca «Pagada» de la planilla** | Ya no existe `per-planilla:pay`, ni el estado «Pagada», ni la acción `payPayroll`, ni sus campos (fecha, referencia, quién), ni las combinaciones que la nombraban. La planilla queda en **Borrador → Cerrada** y una cerrada se reabre con motivo. |
| 5 | **Quien pide no resuelve** | `APPROVAL_POLICY.allowSelfApproval = false`: ninguna cuenta resuelve la solicitud que ella misma pidió, salvo el Superusuario (rol técnico). Las plantillas ya separan quién pide (sede) de quién aprueba (Administración general), así que ningún flujo se rompe. |
| 6 | **Quien recibe avisos puede verlos** | Hallazgo al verificar las decisiones: solo Administración general tenía «Ver la bandeja de avisos», así que la campana no aparecía a los administradores de sede, el almacén, Psicopedagogía ni Contabilidad aunque los avisos les llegaban. Ahora las 4 plantillas la tienen y `check-role-matrix.ts` exige que toda cuenta que recibe avisos pueda verlos. |
| — | **Se deja como está** | El responsable de la **entrevista** de matrícula no revisa vacaciones (es quien está ese día en la sede). |

---

## 16. Qué se probó
Avisos y alertas: `check-notifications.ts` (47 casos: a quién llega cada tipo de aviso por función y sede, respaldo, aviso sin sede, lectura por usuario, un usuario creado después que ve los avisos que le correspondían, y las cuatro alertas con sus colores, sedes y destinatarios). Logística y recetas: `check-logistics.ts` (56 casos: almacén único, rutas de envíos y transferencias, solapes y duplicado de recetas, movimientos de stock de todo o nada, ingreso y venta). Sueldos ocultos: 5 casos nuevos en `check-reports.ts`. En el navegador: la campana muestra alertas y avisos; Los Olivos aparece como almacén central y marcar un segundo se rechaza con su mensaje; en Transferencias elegir Piura como origen fija Los Olivos como destino (y al revés); en Envíos el origen es Los Olivos y no se ofrece como destino; duplicar una receta crea una copia inactiva, activarla se rechaza hasta desactivar la original; marcar «Realizar el envío» y guardar suma «Ver envíos» y «Ver el stock» y deja el aviso de control; registrar un ingreso de stock sin documento se rechaza y con documento sube el saldo (100 → 107) y queda en el kardex; vender 2 libros en caja descuenta el stock (107 → 105) y registra USD 120.00; entregar los materiales de una matrícula descuenta cada artículo y la deja verificada.

Constructor de roles: `check-roles.ts` (las 6 plantillas existen, están completas y no dan funciones reservadas; la separación de funciones del plan; el menú que ve cada plantilla; los datos de ejemplo; el plan de permisos con motivos —dependencias que se suman, funciones inexistentes o reservadas, rol del sistema, motivo que falta o es corto, motivo que se conserva, se reemplaza o se descarta—; el límite de cuentas por sede; qué rol se puede dar; el semáforo de contrapartes con las cuentas de ejemplo). En el navegador: el editor muestra las 56 funciones de la sede, el semáforo («Crear programación: nadie marca la asistencia en Los Olivos»), el menú que vería y, al marcar «Aprobar caída», se suma «Ver solicitudes pendientes», aparece la combinación y **Guardar queda apagado hasta escribir el motivo**; no deja quitar «Ver solicitudes pendientes» (la necesita «Aprobar caída»); guardado el motivo queda como «Aceptada por Superadmin el …». Desde Roles: un nombre repetido (sin importar mayúsculas) se rechaza; un rol nuevo con la plantilla «Almacén central» nace con sus 23 funciones y abre el editor; el rol con cuentas no se elimina; el Superusuario solo ofrece «Ver detalles» y «Ver usuarios». Desde Usuarios: la cuenta nueva de «Almacén central» en Los Olivos se rechaza («admite hasta 1 cuenta activa por sede y Los Olivos ya tiene 1»). Sin errores de consola.

Reglas del paso 9: `check-availability.ts` (quién no está cuándo —vacaciones con ambos días incluidos, cese, regreso con otro contrato, contrato vencido que no bloquea—; responsable de una asesoría por texto y de una actividad, con compatibilidad si no se pasa la regla; agenda entre dos fechas; vacaciones que cruzan la agenda en el formulario del contrato y al editar sin tocarlas; cese con agenda posterior; renovación: ventana, indeterminado/cesado/renovado, motivo, fechas, sueldo contra la RMV, contrato posterior, planilla cerrada, el contrato nuevo, el anterior «Renovado» y un solo vigente). En el navegador: cerrar el contrato de María Torres con una asesoría futura se rechaza («María Torres tiene 1 asesoría después de su cese…»); con su contrato por vencer aparece «Renovar contrato», y al renovar el anterior queda «Renovado» (fin 3 nov) y nace uno «Vigente» desde el 4 nov, con «Renueva el contrato CON-002» en el detalle. Sin errores de consola. La parte de vacaciones en el formulario y en la lista de responsables se comprobó con el script (el selector de fechas no se maneja bien con clics automáticos).

Pruebas por rol: `check-role-matrix.ts` (acciones clave por cuenta contra lo decidido, separación de funciones, dinero y sueldos, menú, primera pantalla y Dashboard, sedes, avisos y guardas reales). En el navegador se entró con las 7 cuentas activas y se comparó lo que muestra la pantalla con la matriz: el menú lateral coincide ítem por ítem, el Dashboard coincide en tarjetas y accesos, y las rutas escritas a mano que el rol no puede abrir muestran «Su rol no tiene acceso a…» con la función que falta. Evidencia completa en `docs/PRUEBAS_POR_ROL.md`.

Sesión: `check-session.ts` (formato y marca del PIN; bloqueo a los 5 fallos, durante el bloqueo y tras él; cambio de usuario y de PIN propio; quién fija el PIN de un Superusuario; sede que alcanza cada cuenta de ejemplo —Superusuario, «Todas», almacén y contabilidad por su rol, sede única, adicionales, inactivas, sin sede—; selector y vista válida; con quién empieza la sesión; última cuenta de Superusuario y cuenta propia; PIN que sobrevive a lo guardado y migración de lo anterior; Dashboard por sede sin perder ni duplicar nada; almacenamiento de la sesión que falla o no existe). En el navegador: primera entrada como Superadmin; Laura (Piura) entra con su PIN, ve solo Piura (2 matrículas, cartera $950 frente a 4 y $1,650 de la vista global), sin selector y sin los módulos de Organización ni Oferta comercial; el PIN equivocado dice cuántos intentos quedan y a los 5 bloquea; Bloquear sesión deja una pantalla sin botón de cerrar, que sigue tras recargar; Rosa (Almacén) entra a vista global y su Dashboard solo trae Alertas de Stock; Elena (Contabilidad) ve dinero y no ve matrículas; «Cambiar mi PIN» funciona (el anterior deja de servir); «Restablecer PIN» desde Usuarios; el Superusuario no puede desactivarse a sí mismo. Sin errores de consola.

Persistencia de roles y cuentas: `check-access-store.ts` (ida y vuelta sin pérdida; texto corrupto, versión distinta o forma errónea; el rol del sistema no se altera desde lo guardado; roles repetidos o inválidos; funciones inexistentes o reservadas; dependencias que se completan; combinaciones aceptadas que ya no aplican; cuentas con rol, sede o trabajador inexistente; lo borrado se queda borrado; almacenamiento que falla o no existe). En el navegador: un rol nuevo sobrevive a la recarga, una cuenta con sede inexistente y una función inexistente metidas a mano se depuran con aviso, y «Volver a los de ejemplo» deja los 6 roles de partida. Sin errores de consola.

Guardas: `check-guards.ts` (cada acción se niega sin función y se ejecuta con una de las que admite; los resolutores por argumentos; los cambios de cuenta de usuario; los envíos y transferencias; la disponibilidad con y sin Superusuario; el menú oculto; las secciones de Configuración; y que **toda pantalla que toma una acción de `useData()` consulta alguna función que la cubre**, salvo las ventanas que se abren desde un botón ya filtrado, declaradas con su razón). En el navegador, con un rol de prueba «Almacenero» (stock, envíos, recepciones, kardex): el menú queda en Dashboard, Matrículas, Stock, Envíos, Recepciones y Kardex; «Nueva matrícula» y «Configuración» desaparecen; abrir Usuarios, Planilla o Caja por la dirección muestra «Su rol no tiene acceso» con la función que falta; en Stock el menú de fila ofrece «Registrar ingreso» pero no «Ajustar stock» ni «Transferir»; las acciones directas se niegan con su mensaje (crear un programa, reversar un pago, guardar permisos, editar un usuario, recepcionar una transferencia); despachar a Chiclayo se niega porque nadie puede recibir allí, y al Superusuario se le ofrece con el motivo como aviso. Con un rol de configuración (leads y couriers) la ventana de Configuración ofrece solo Comercial y Logística, y Leads muestra «Agregar» sin editar ni eliminar. Como Superusuario todo sigue igual.

Funciones y roles: `check-capabilities.ts` (estructura del registro, dependencias, contrapartes, datos y avisos que existen, cobertura de las 120 acciones del contexto y de todo el menú, compatibilidad con los 67 permisos anteriores y con `PERM`, cierre de dependencias, advertencias y el caso del almacenero: sin receptor en Piura no se ofrece enviar, con uno sí, uno de Piura no sirve para Arequipa, cuenta o rol inactivo no cuentan). Se comprobó que los controles detectan fallos rompiendo el registro a propósito.

Modelo de datos: `check-integrity.ts` (los datos de ejemplo cumplen todas las reglas de integridad; los casos rotos a propósito se detectan; titular, estado, programa y edad derivados; sincronía de nombres; planes; ids) y los demás scripts actualizados; en el navegador: renombrar al alumno corrige su matrícula y su agenda pero no el comprobante; cobrar la cuota vencida de Sofia pasa el plan de «Atrasado» a «Al día» y mueve la caja y el saldo del titular.

Reportes: `check-reports.ts` (rangos y atajos, conteos, embudo y tasas de Matrículas, Verificación, Caja y Caja chica, Stock con faltantes, Personal con contratos y planilla, y Auditoría con sus filtros); en el navegador: las siete rutas de Reportes y Sistema → Auditoría abren sin errores y Caja separa por sede.

Personal, usuarios y planilla: `check-payroll.ts` (motor, flujo, boleta y acceso del personal); en el navegador: generar la planilla de octubre (Juan Pérez S/ 3 077.96 y María Torres S/ 2 429.55 de neto), agregar un ajuste (sin motivo se rechaza), cerrar, reabrir con motivo, volver a cerrar y registrar el pago (desaparece «Reabrir»); cerrar un contrato ya pagado (se rechaza); crear la cuenta de María desde Personal (formulario prellenado con sus datos y sede); inactivar a Juan (aviso previo, y su cuenta queda inactiva con constancia; activarla se rechaza mientras la ficha siga inactiva).

Psicopedagogía: `check-psychopedagogy.ts` (84 casos: responsable y cruces, asistencia, motivos y 24 h, eventos del historial, métricas, recordatorios y reporte); en el navegador: cancelar con un motivo del alumno a menos de 24 h (se rechaza), cancelarla por la institución (queda en el historial), asignar el responsable de una actividad (Juan Pérez aparece bloqueado por una asesoría suya a esa hora), marcar asistencia, el formulario de la sesión con sus obligatorias, los recordatorios (registrar un envío), el reporte, y reprogramar un cambio de responsable sin motivo (se rechaza) y con motivo (queda «Reprogramada 1 vez»).

Verificación antes de la primera asesoría: `check-first-session.ts` (42 casos: cuándo aplica, niveles de urgencia, pago vs. verificación, bloqueo, acciones sin las 24 horas, orden y receta vigente); en el navegador, Valentina Silva (asesoría en 3 días): sale primera en Verificación como «Urgente», la agenda muestra el aviso y el menú deshabilitado, la ventana de reprogramación explica el motivo, la confirmación pide la casilla y, al confirmar, el aviso desaparece.

`tsc` sin errores · `vite build` · los 15 scripts `check-*` pasan (`check-business`: 97; `check-first-session`: 42; `check-psychopedagogy`: 84; `check-payroll`: 64) · en el navegador: ficha de matrícula y su vista previa, cambio de programa (solicitar → aprobar → plan y programa actualizados), caída y reactivación, vista previa del traslado, arqueo y cierre de caja (con diferencia, bloqueo de reversa en día cerrado, reapertura y su registro), reversa de un pago con nota de crédito `BC01-000001`, política de cobranza con mora del 2 %, cobro de mora (USD 122.40 sobre una cuota de USD 200 con 921 días de atraso), recordatorios, reporte de cartera y renovación (el asistente abre con los datos y la observación).
No se probó en el navegador la generación del **contrato** (los datos de ejemplo no tienen dirección del titular, y el sistema lo avisa); sí está cubierta por el script de reglas.

## Inicio de sesión real (2026-11-05)

Se ingresa con **correo y contraseña** (Supabase Auth); la contraseña vive solo allí, cifrada. Tener usuario en Auth no basta: debe existir una fila en `cuentas` (la crea el Superusuario) con la cuenta y su rol **activos**. Mientras los roles sigan en el navegador, **solo entra el Superusuario** y trabaja como la cuenta de ejemplo de Superusuario; las demás cuentas verán un aviso que lo explica. El mensaje de error nunca distingue «correo inexistente» de «contraseña incorrecta». El **PIN** sigue siendo solo el cambio rápido de usuario dentro de una sesión ya abierta. «Cerrar sesión» (menú de usuario) reinicia los datos de ejemplo igual que recargar. Reglas en `utils/loginAccess.ts`, verificadas por `scripts/check-login.ts`.

## Empresas y Filiales en la base de datos (2026-11-05)

Organización → **Empresas** y **Filiales** leen y guardan en la base (tablas `empresas` y `sedes`); las pantallas muestran solo lo guardado allí, no los datos de ejemplo. El resto del sistema (matrícula, stock, personal…) sigue con sedes y empresas de ejemplo hasta que se pasen.

- **Empresa:** RUC de 11 dígitos y único; razón social obligatoria; el id `EMP-NNN` lo asigna el sistema (si dos personas crean a la vez, se reintenta con el siguiente). No se inactiva ni se elimina una empresa con filiales vinculadas.
- **Filial:** el **código** `FIL-NNN` (FIL-001, FIL-002…) lo **asigna el sistema**, igual que `EMP-`, `ALM-` y `ROL-`: nadie lo escribe, no cambia y, si dos personas crean a la vez, se reintenta con el siguiente. La empresa tampoco cambia después de crearla. El nombre no se repite (aunque cambie la mayúscula). Dirección, departamento, provincia y distrito son obligatorios; el correo, si se escribe, debe ser válido. La filial guarda el id de su empresa; el nombre de la empresa se calcula al mostrar. No existe un enlace con la web pública (`id_web` se eliminó en la migración 0002: nada dependía de él).
- **Lo que ya se usa no se borra:** las claves son RESTRICT; eliminar solo prospera si nada depende del registro y, si no, se propone inactivar.
- **Responsable de sede:** se asigna cuando el módulo Personal pase a la base (hoy no se elige personal de ejemplo para una sede real).
- **Motivo del cambio:** la pantalla de Filiales lo pide al editar, pero todavía no se guarda: llega con la bitácora.
- Reglas en `utils/orgDirectory.ts`, operaciones en `services/orgDirectory.ts`, verificadas por `scripts/check-org-directory.ts` (que además compara los patrones con la migración).

## Almacenes en la base de datos (2026-11-05)

Organización → **Almacenes** lee y guarda en la tabla `almacenes`; muestra solo lo guardado allí. El stock, los envíos y las transferencias siguen con el almacén de ejemplo hasta que pasen a la base, por eso la pantalla ya no muestra «unidades en stock».

- **Código `ALM-NNN`** asignado por el sistema (se reintenta si dos personas crean a la vez). Nombre obligatorio (hasta 80 caracteres) y sin repetir (aunque cambie la mayúscula).
- **Solo un almacén central activo:** lo exige el sistema y también la base (índice único parcial `almacenes_un_activo`). Para cambiar de almacén central se inactiva el actual y luego se activa el otro.
- **Empresa opcional;** si se elige debe existir y estar activa (un almacén que ya la tenía puede conservarla). Una empresa con filiales **o almacenes** vinculados no se inactiva ni se elimina.
- **Un almacén con mercadería no se inactiva** (`warehouseInactivationError`): la regla ya está en la operación y recibirá el stock real cuando este pase a la base.
- **Permisos:** crear y editar dependen de `org-almacenes:create` / `org-almacenes:edit` también en la base (migración 0003); verlos queda abierto a toda cuenta vigente porque la logística los necesita. Los almacenes no se eliminan.

## Roles y permisos en la base de datos (2026-11-05)

Los **roles y las funciones de cada rol** viven en las tablas `roles` y `rol_funciones`; el sistema los lee **antes de arrancar** (si la base no responde ofrece «Reintentar») y el navegador **ya no los guarda**: solo guarda las cuentas, de forma provisional. Lo que se cambie en Organización → Roles y Permisos lo ven todas las personas con acceso.

- **Ids `ROL-NNN` automáticos** (se reintenta si dos personas crean a la vez). El rol del sistema (Superusuario, `ROL-001`) lo crea la migración 0001; **no guarda funciones** en la base (puede todo) y en el sistema se le muestran todas. Un rol creado desde el sistema nunca es del sistema.
- **Defensa en dos capas:** el sistema impide tocar el rol del sistema (`roleLockedError`) y la base también (la política lo oculta y un disparador lo impide). Un rol con cuentas no se elimina (clave RESTRICT); se inactiva.
- **Crear un rol con funciones** guarda primero el rol y luego sus funciones; si las funciones fallan, el rol se borra: nunca queda a medias.
- **Cambiar las funciones de un rol** primero QUITA las que sobran y después AGREGA las nuevas: si algo falla a mitad, el rol queda con **menos** permisos de los pedidos, nunca con más; el sistema vuelve a leer la base para mostrar lo que quedó y avisa.
- **Las combinaciones a separar aceptadas** (con su motivo, quién y cuándo) se guardan con el rol (`riesgos_aceptados`).
- **Lo que se lee de la base se trata como no confiable:** una función que ya no existe en el código o que es reservada no se carga; un motivo mal formado se ignora.
- **Roles de partida:** `supabase/seed/roles_de_partida.sql` (generado desde las plantillas) carga Administrador de sede, Psicopedagogía, Almacén central, Administración general y Contabilidad como `ROL-002` a `ROL-006`. Se ejecuta una sola vez a mano, es repetible y omite un rol que ya exista (mismo id o mismo nombre). **Sin ese script, las cuentas de ejemplo con esos roles no aparecen** (solo la del Superusuario).
- **Cuentas ↔ roles:** las cuentas siguen enlazadas al rol por nombre; renombrar un rol arrastra a sus cuentas. Hasta que las cuentas pasen a la base (con invitación por correo), solo ingresa el Superusuario.

## Cuentas con invitación por correo (2026-11-05)

Las **cuentas** viven en las tablas `cuentas`, `cuenta_sedes` y `cuenta_almacenes`. El navegador **solo las lee** (la política RLS decide cuáles ve cada quien); **solo las escribe la Edge Function `usuarios`**, que antes de cada cambio identifica a quien llama por su sesión y vuelve a aplicar las reglas (la pantalla las aplica primero para avisar, pero no es lo que protege).

- **Crear:** el Superusuario (o quien tenga «Crear usuario») elige nombre, correo, rol y sede o almacén en Organización → Usuarios. Se manda una **invitación por correo** (Resend, `no-responder@envios.ensilperu.com`) y la persona abre el enlace y **fija su contraseña** (10 caracteres o más, con letras y números); nadie escribe la contraseña de otra persona. Si algo falla después de crear al usuario de acceso, se borra: nunca queda un usuario sin cuenta.
- **Reglas del servidor:** el rol debe existir y estar activo, y el del sistema (Superusuario) solo lo da un Superusuario; las sedes y almacenes deben existir, estar activos y ser alcanzables por quien las asigna (salvo que alcance todas las sedes: «Todas» exige ese alcance); se respeta el límite de cuentas del rol por sede o almacén; el correo no se repite; una cuenta necesita al menos una sede o un almacén (el Superusuario no).
- **Editar:** cada campo que cambia pide su función (corregir datos y activar: «Editar»; desactivar: «Desactivar»; rol: «Asignar rol»; sedes y almacenes: «Asignar sedes»). Nadie cambia el rol ni el estado de su propia cuenta; solo un Superusuario modifica una cuenta de Superusuario; nunca se queda el sistema sin un Superusuario activo (también lo impide la base). **El correo de una cuenta no se cambia:** se desactiva y se crea otra.
- **Desactivar:** primero el estado en la base (el acceso a los datos se corta al instante) y después el bloqueo del usuario de acceso; con constancia «Desactivado por … el …» (fecha de Lima). **Activar:** primero se quita el bloqueo y después el estado, así un fallo deja la cuenta inactiva, nunca a medias.
- **Reenviar acceso** (función «Reenviar acceso»): vuelve a mandar la invitación si la persona nunca entró, o el enlace para fijar una contraseña nueva si ya entró. En el ingreso hay además «¿Olvidó su contraseña?», que responde igual exista o no el correo.
- **Último acceso:** se anota al ingresar; «Nunca» = aún no entró (invitación pendiente).
- **Cuentas ↔ Personal:** desde la migración 0004 las cuentas vuelven a nacer de la ficha (ver «Personal y asignaciones en la base» más abajo). Las sedes de una cuenta son las guardadas en la base (Organización → Filiales); desde el 2026-11-07 el resto del sistema usa esas mismas sedes (ver «Sedes, empresas y almacén: una sola fuente»).
- **Retirado:** las 8 cuentas de ejemplo, el PIN, el bloqueo de sesión, el cambio rápido de usuario y el guardado de cuentas en el navegador. «Cerrar sesión» está en el menú de la cuenta y en la barra lateral. El cambio rápido con PIN volverá verificado en el servidor.
- Reglas del servidor en `supabase/functions/usuarios/reglas.ts` (verificadas por `scripts/check-cuentas-fn.ts`, 70 casos); lectura de filas y armado de peticiones en `utils/accounts.ts` (`scripts/check-accounts.ts`); contraseña y enlaces del correo en `utils/loginAccess.ts` (`scripts/check-login.ts`).

## Personal y asignaciones en la base; la cuenta nace de una persona (2026-11-06)

**La inconsistencia que había:** el formulario de «Nuevo usuario» pedía otra vez nombre, documento y teléfono (ya están en la ficha de Personal), dejaba elegir sedes y almacén a mano (distintos de los lugares donde la persona trabaja de verdad) y aceptaba combinaciones sin sentido (un rol de almacén sin trabajar en el almacén, o una almacenera con el rol de una sede). **La solución:** una sola fuente. La persona vive en Personal, el lugar donde trabaja en sus asignaciones, y la cuenta solo agrega correo de ingreso y rol.

- **Personal y Asignaciones** viven en las tablas `personal` y `asignaciones` (Personas → Personal / Asignaciones). La ficha **no se borra**: se inactiva con fecha y motivo (`inactivar_personal`: ficha, asignaciones cerradas y cuenta desactivada, todo o nada). La asignación **no se borra**: se cierra con fecha y motivo. Contratos, planilla, agenda y matrículas siguen con los datos de ejemplo hasta que se pasen.
- **El lugar de una asignación es UNA sede o el almacén central** (nunca los dos). (Hasta 2026-11-06 en el almacén solo valía el «rol del sistema» «Almacén» o «Sin acceso»: esa etiqueta se retiró, ver abajo.) No se repite lugar + área mientras la anterior siga activa y cada persona tiene una sola asignación principal (la primera lo es; si se cierra, pasa la más antigua).
- **Una persona, una cuenta.** Solo un Superusuario crea una cuenta técnica (sin persona), y solo con un rol del sistema. Puede tener cuenta quien está **activo**, sin cuenta previa y con al menos una asignación activa con acceso al sistema.
- **Lo que sale de Personal no se escribe en Usuarios:** nombre, documento y teléfono (de la ficha) y **sedes y almacén (de las asignaciones activas con acceso)**. Lo mantienen disparadores de la base, así que no depende de que alguien se acuerde. Si se edita la ficha o se cierra una asignación, la cuenta se actualiza sola.
- **Coherencia rol ↔ lugar.** El rol dice qué puede hacer y el lugar dónde. Un rol con alguna función que mueve el almacén (despachar, ingresar compras, ajustar stock, empacar, despachar transferencias) exige trabajar en el almacén; quien trabaja en el almacén necesita un rol que lo mueva. Es regla **dura** al crear la cuenta, cambiar su rol o reactivarla (el formulario solo ofrece los roles compatibles); al editar o cerrar asignaciones solo se **avisa** («corrija su rol en Usuarios») y la lista de Usuarios marca las cuentas que quedaron desencontradas. El Superusuario no tiene restricción. Quien trabaja en una sede **y** en el almacén necesita un rol que mueva el almacén.
- **Correo de ingreso:** debe ser institucional. Si es igual al correo personal de la ficha, **se bloquea** (la base también); si no es `@ensilperu.com`, solo **se avisa** (puede haber un dominio nuevo o un asesor externo). El correo de una cuenta no se cambia.
- **Baja y reactivación:** inactivar a la persona desactiva su cuenta sola con constancia; reactivarla **no** reactiva la cuenta (se decide en Usuarios; se rechaza mientras la ficha esté inactiva o sin asignación con acceso). La cuenta de la persona dada de baja conserva su historial.
- **Qué pide cada función:** «Crear usuario» necesita además ver Personal y ver Asignaciones (de ahí sale quién puede recibir cuenta). La función «Eliminar ficha de personal» se retiró: la ficha no se borra.
- Reglas del servidor en `supabase/functions/usuarios/reglas.ts` (`check-cuentas-fn.ts`); reglas de la pantalla en `utils/accountRules.ts` (importa las del servidor), `utils/assignments.ts` y `utils/staffDb.ts`; operaciones en `services/staffDirectory.ts` (`check-staff-db.ts`, con repositorio en memoria); lo que hace la base se probó contra su esquema real en Postgres en memoria.

## El área depende del lugar y el cargo sale del contrato (2026-11-06)

**La inconsistencia que había:** al elegir el almacén central como lugar de trabajo, el área seguía ofreciendo Administración, Psicopedagogía y Ventas, y la asignación pedía escribir un «Cargo» que en realidad es un dato del contrato.

- **Área según el lugar.** El almacén central es un lugar de logística: una asignación al almacén **solo puede ser del área «Logística»** (al elegir el almacén el área queda elegida sola). Una sede admite todas las áreas, incluida Logística (cada sede tiene su propio stock de venta). Regla en `utils/assignments.ts` (`areasForPlace`, `placeAreaError`) y también en la base (migración 0005, restricción `asignaciones_almacen_solo_logistica`). Va de la mano con la regla del rol del sistema: en el almacén solo «Almacén» o «Sin acceso».
- **El cargo es del contrato, no de la asignación.** El cargo es lo pactado con la persona (consta en su contrato y no cambia según dónde trabaje), así que se escribe **una sola vez, en el contrato** (campo obligatorio «Cargo», de 3 a 60 caracteres; al editar el contrato queda en la constancia de cambios y al renovarlo se conserva). La asignación ya no tiene cargo: solo lugar, área, rol del sistema y fechas. La columna `cargo` de `asignaciones` se quita (lo derivable no se guarda).
- **Dónde se ve el cargo:** Personal (lista, filtro, exportación y ficha), Contratos, el reporte de Personal, las boletas de la planilla. Sale del contrato vigente o, si no hay, del último vencido (`positionOf` / `currentContractOf` en `utils/payroll.ts`). **Sin contrato no hay cargo** y se muestra «Sin contrato».
- **Consecuencia mientras los contratos no estén en la base:** las personas que se crean ahora en Personal (base de datos) no tienen contrato (Contratos todavía usa los datos de ejemplo), así que su cargo aparece como «Sin contrato» hasta que Contratos pase a la base.

## Un solo lugar para cada dato: el rol en Usuarios, el acceso en la asignación, el alcance por sede (2026-11-06)

**Las inconsistencias que había:** (1) se elegía un «rol» en la asignación (Administración, Psicopedagogía, Ventas, Almacén, Sin acceso: una etiqueta de cuando el sistema tenía 4 roles fijos) y otro, el real, en Usuarios; (2) el Superusuario se ofrecía también a las personas de Personal; (3) Personal y Asignaciones se veían y se editaban enteros con solo tener la función, aunque Filiales y Cuentas sí respetan la sede; (4) los ids de la base (`STF-001`) coinciden en formato con los de los datos de ejemplo, así que Personal mostraba el cargo y el contrato de otra persona.

- **La asignación dice si la persona NECESITA ACCESO al sistema (Sí/No)**, no un rol. «No» es, por ejemplo, personal de limpieza: ese lugar no se suma a las sedes ni al almacén de su cuenta. El **rol real se elige una sola vez, en Organización → Usuarios**, y se filtra por el lugar de trabajo (quien trabaja en el almacén, solo roles que lo mueven; quien trabaja solo en sedes, los que no). Migración 0006: `rol_sistema` se reemplaza por `con_acceso` («Sin acceso» pasa a «No»; lo demás, «Sí»). Ya no hay rol sugerido desde la asignación.
- **El Superusuario es solo para cuentas técnicas (sin persona).** No se ofrece ni se da a una persona de Personal (lo impide la pantalla, la Edge Function y un disparador de la base). Una cuenta sin persona sigue pudiendo tener solo ese rol. Quien dirige la institución y también es personal tiene su ficha sin cuenta propia y una cuenta técnica aparte.
- **Alcance por sede en Personal y Asignaciones** (igual que Filiales y Cuentas). Quien alcanza todas las sedes (o es Superusuario) ve todo; quien no, ve a **las personas que tienen o tuvieron una asignación en sus sedes**, a sí mismo y a quien aún no tiene ninguna asignación (la persona que acaba de crear). Solo **asigna en sus sedes**; el **almacén** solo lo asigna el Superusuario o quien trabaja en él (alcanzar todas las sedes lo deja *ver* a su gente, no *moverla*). Dar de baja a alguien de otra sede se rechaza. El formulario solo ofrece los lugares donde se puede asignar.
- **Los mundos de datos ya no están separados (2026-11-07).** Antes, contratos, asesorías y actividades eran de ejemplo con ids `STF-001`… iguales en formato a los de la base y Personal los mantenía aparte. Hoy el personal, las asignaciones y los contratos son SIEMPRE los de la base y los leen todas las pantallas (ver «El puente de la agenda»). Las asesorías y actividades de ejemplo guardan al responsable por su nombre.

## Sedes, empresas y almacén: una sola fuente (2026-11-07)

- **Un solo lugar para cada dato.** Las sedes, las empresas y el almacén central son los de la base de datos (Organización → Filiales / Empresas / Almacenes). **Todo el sistema** (Matrículas, Caja, Stock, Kardex, Envíos, Agenda, Dashboard, planillas…) usa esas mismas listas; ya no hay una lista de sedes de ejemplo aparte. Si Organización cambia el nombre, el estado o la dirección de una sede, el cambio se ve en todas partes.
- **Se leen al iniciar sesión**, junto con los roles y las cuentas y antes de mostrar nada (`AccessGate`): así la sede que se ve (`currentBranchId`) y el alcance de la cuenta se calculan con las sedes reales desde el primer instante. Si la lectura falla, el sistema no se abre a medias: ofrece reintentar.
- **Quién ve qué:** quien alcanza todas las sedes o tiene la función «Ver filiales» recibe todas; el resto, solo las suyas (lo decide la política de la base). El almacén lo ve cualquier cuenta activa (ver ≠ mover sigue igual).
- **Los datos de ejemplo apuntan a sedes que existen.** Las matrículas, pagos, caja, stock, envíos, agenda y actividades de ejemplo usan los códigos reales (`FIL-001` Los Olivos, `FIL-002` Piura, `FIL-003` Chiclayo, `FIL-004` Cajamarca, `FIL-006` San Isidro, `FIL-007` Huancayo, `FIL-008` Puno, `FIL-009` Juliaca, `FIL-013` Tacna). La lista real está en `src/data/realOrg.ts` (de ella salen también la carga en la base y `docs/DATOS_SEDES.md`).
- **Las sedes de ejemplo ya no existen en el sistema:** donde antes había 9 (Piura, Chiclayo…, con direcciones de ejemplo) ahora hay 16, con las direcciones y teléfonos reales. Las sedes que no tienen datos de ejemplo (Trujillo, Arequipa, Cusco, Huaraz, Ica, Ayacucho) aparecen vacías: es lo esperado.
- **Planilla:** el contrato aún no sabe de qué empresa es (Lote 3). Con una sola empresa activa, la planilla lleva su nombre; con varias (hoy 6) se rotula «ENSIL» en lugar de adivinar una.
- **Pendiente de la base de datos real:** Ilo (el usuario pidió no cargarla todavía) y confirmar la razón social exacta de las 4 empresas nuevas con la ficha RUC de SUNAT.

## Contratos y planilla en la base; la empresa del contrato; una planilla por empresa y mes (2026-11-07)

- **El contrato tiene su empresa, y no es la de la sede.** Es la empresa que emplea al trabajador (la que firma el contrato y presenta su planilla). **No depende de la sede donde trabaja**: alguien puede trabajar en Juliaca y estar contratado por otra empresa del grupo; por eso se elige libremente al crear el contrato y el sistema **no la sugiere por la sede**. **Se puede cambiar** al editar el contrato (con motivo y constancia «Empresa: A → B» en el historial), salvo que una **planilla ya cerrada incluya ese contrato** (esa foto es de la empresa anterior: primero se reabre, o se cesa el contrato y se registra uno nuevo) o que el trabajador tenga **ajustes en el borrador de la planilla de su empresa actual** (quedarían escondidos: primero se quitan). La renovación es de la misma persona y la misma empresa (para cambiarla, se edita). Un contrato conserva su empresa aunque esta se inactive después; uno nuevo no puede nacer en una empresa inactiva. Una empresa con contratos vigentes no se inactiva ni se elimina.
- **Una planilla es de UNA empresa y UN mes** (`PLA-AAAA-MM-EMP-NNN`). Cada RUC presenta la suya, así que se genera, se ajusta, se cierra y se reabre por separado, y un problema en los contratos de una empresa no frena el cierre de las demás. Solo entran los contratos de esa empresa; el mes anterior del año debe estar cerrado **en esa empresa** (la renta de 5.ª depende de él); reabrir se frena solo por una posterior cerrada **de la misma empresa**. Lo ya retenido de un trabajador (renta de 5.ª) cuenta aunque haya sido en otra empresa del mismo año.
- **La boleta y la planilla llevan la razón social y el RUC de la empresa del contrato** (en una cerrada, los de la foto: quedan como estaban aunque después cambie la razón social). La sede de la boleta es el lugar de trabajo (puede ser de otra empresa). Los trabajadores activos sin contrato que cubra el mes en ninguna empresa salen en **un solo aviso**, con sus nombres, en la planilla de cualquier empresa (no se puede saber a cuál le tocaría: la empresa no se deduce de la sede). El costo por sede de Reportes → Personal suma las planillas de todas las empresas.
- **Los sueldos están protegidos por la base de datos, no solo por la pantalla.** El cargo, las fechas y la empresa del contrato los ve quien ve a Personal, Contratos o Planilla (de las personas que alcanza); **el sueldo, los aportes, la renta y el neto, solo quien tiene «Ver remuneraciones»**; el historial de modificaciones (trae sueldos), igual; la planilla (con sus ajustes y la foto de sus líneas), solo quien tiene la función de planilla, «Ver remuneraciones» y alcanza todas las sedes.
- **Nadie escribe estas tablas directo.** Crear, editar, cesar y renovar un contrato, y generar, ajustar, cerrar y reabrir una planilla, son funciones de la base: cada una vuelve a validar, pide la función del registro que le corresponde y deja **quién** (el nombre de la cuenta con la que se ingresó: no se puede falsear desde la pantalla) y **cuándo**. Cada una es todo o nada.
- **Reglas que la base exige además de la pantalla:** un solo contrato vigente por persona (uno vencido sin cerrar no estorba); trabajador y empresa activos; fechas coherentes (plazo fijo y locación con fin posterior al inicio; indeterminado sin fin); pensión (y AFP) obligatorias salvo en la locación; vacaciones dentro del contrato y no en la locación; **no se cesa un contrato con una fecha que toque una planilla cerrada que lo incluye**; **no se renueva si hay una planilla cerrada de su empresa de ese mes o posterior**; no se cierra una planilla con una línea de otra empresa; no se inactiva a quien tiene un contrato vigente. La remuneración mínima vital cambia cada año: se valida en la pantalla, no en la base.
- **La agenda y las matrículas leen el personal y los contratos de la base** (ver «El puente de la agenda»). Quien está de vacaciones o cesó en la base ya no se puede elegir como responsable.

## Regla de cierre: el sistema no paga ni liquida al personal (2026-11-07)

**Idea central: el sistema informa, no paga ni liquida.** Aprobada por el usuario, con sus cinco ajustes. Tres zonas:

1. **Se guarda (datos laborales):** empresa, cargo, tipo, fechas, sueldo pactado, pensión, vacaciones programadas, cese (fecha y motivo) e historial.
2. **Se muestra como referencia** (cálculo informativo con las tasas del sistema; contabilidad valida): la planilla mensual por empresa y el detalle por trabajador. No paga, no registra pagos y no genera egreso en Caja.
3. **Queda fuera del sistema, por decisión del usuario (no son pendientes):** pago de sueldos, depósito de CTS y gratificaciones, **liquidación de beneficios sociales al cese**, saldos de vacaciones, utilidades, PLAME / T-Registro y comprobantes de pago oficiales.

**Cómo se cierra sin huecos:**
- **La boleta no parece oficial.** Se llama «Detalle de remuneración (referencial)», no lleva casillas de firma y dice «no reemplaza la boleta oficial». El neto es «referencial» (no «a pagar»).
- **El cese no parece una liquidación.** En la ventana de cese y en el contrato cesado: «La liquidación la prepara contabilidad; aquí queda el cese (fecha y motivo)».
- **Cada empresa tiene su régimen laboral** (`empresas.regimen_laboral`: MYPE o General; las 6 son MYPE). En **MYPE** la planilla referencial muestra solo lo ordinario (sueldo, asignación familiar, aportes de pensión, renta de 5.ª y ajustes): la gratificación, la bonificación, la CTS y el aporte de salud del empleador **no se calculan** (los calcula contabilidad según su régimen) y la planilla lo dice. En **General** el sistema los estima como antes. Como el neto del contrato y el de la planilla salen del mismo motor, el neto del contrato también respeta el régimen de su empresa.
- **Las vacaciones** son «Vacaciones programadas (solo para la agenda)»: no se llevan saldos ni días acumulados.
- **El costo** se llama «Costo referencial de planilla».

**La puerta queda abierta (sin construir nada):** el contrato cesado ya guarda lo que una liquidación futura necesitaría; cada planilla cerrada conserva su foto y su historial; toda escritura pasa por funciones de la base con permiso propio (ampliar sería una función y una pantalla nuevas, sin tocar lo existente, y con un rol aparte); y el campo de régimen es la base para calcular después. Solo si el usuario lo pide.

- **Régimen laboral:** todas las empresas son MYPE (micro o pequeña; ninguna pasa de pequeña).
- **Un trabajador tiene un solo contrato vigente:** el usuario confirmó que no habrá dos a la vez con empresas distintas.

## El puente de la agenda: un solo personal (2026-11-07)

- **Quién puede ser responsable.** La agenda (Psicopedagogía → Programación y Cronogramas mensuales), la verificación de materiales y el asistente de matrícula ofrecen como responsable a las personas de **Personas → Personal** que están **activas** y tienen una **asignación activa en el área Psicopedagogía** (para las asesorías y actividades, en esa sede). No hace falta tener contrato para aparecer en la lista.
- **Quién no se puede elegir.** Los contratos solo sirven para saber **cuándo no está** la persona: de **vacaciones** (las programadas en su contrato vigente) o **después de su cese**. Esa persona aparece en el selector **desactivada** («no está ese día») y el sistema no deja guardar. Un contrato vencido sin cerrar no bloquea (lo avisa la alerta de contratos por vencer). Al revés, no se cesa ni se programan vacaciones sobre asesorías o actividades a su nombre: primero se reasignan.
- **Lo que sigue en memoria:** las asesorías, cronogramas y actividades de ejemplo (y las matrículas de ejemplo) guardan al responsable **por su nombre**; pasan a la base junto con los alumnos y las matrículas, porque cada asesoría apunta a un alumno y a una matrícula.
- **Mientras no haya psicopedagogas registradas**, los selectores de responsable salen vacíos y la matrícula pide un «Responsable de la entrevista»: se registran en Personas → Personal, se asignan al área Psicopedagogía de su sede en Asignaciones y, si corresponde, se les crea el contrato.
- Quienes usan esta agenda: **Administrador de sede** (reserva y reprograma asesorías, crea cronogramas, entrega materiales, matrículas), **Psicopedagogía** (ve su programación, marca asistencia, registra seguimiento, lidera actividades) y **Superusuario**.

## El catálogo comercial vive en la base (2026-11-07)

- **Qué es.** Programas, niveles, tipos de pago, tarifarios, promociones (Oferta comercial) y orígenes de leads (Configuración) se guardan en la base de datos y los lee toda la aplicación al iniciar sesión (la matrícula, los planes y las promociones usan estos mismos datos). Al recargar la página ya no vuelven a los de ejemplo: lo que se cambia queda.
- **Datos de partida.** Son los que había de ejemplo, sin «Especialización»: el programa avanzado es **solo «Profesional»**. Quedan 4 programas (Kids, Pre-Kids, Pre-lectura —solo en Piura y Chiclayo— y Profesional), 4 niveles (3 de Kids y 1 de Pre-Kids), 5 tipos de pago (Contado, Contado en 2 partes, Plan 3, Plan 6 y Plan 9), 8 tarifarios, 2 promociones (2 matrículas Pre-Kids/Kids por USD 700; 2 matrículas Profesional por USD 1 700) y 5 orígenes de leads. Los precios y condiciones son **de prueba**; los reales se cargan después.
- **Quién lo ve y quién lo cambia.** Lo **lee** cualquier cuenta vigente (quien matricula necesita los precios). Lo **cambia** quien tiene la función de cada pantalla (Programas, Niveles, Tipos de pago, Tarifarios, Promociones y Orígenes de leads: crear, editar, eliminar). La base lo exige, no solo la pantalla.
- **Reglas que la base vuelve a comprobar.** Programa: código oficial y nombre obligatorios; el código no se repite; el nombre no se repite entre programas activos; duración (meses enteros, desde 1) y garantía (desde 0); si no es de todas las sedes, al menos una sede que exista. Nivel: solo en programas con «Tiene niveles»; nombre y código; el código no se repite dentro del programa; orden desde 1. Tipo de pago: código único; el pago inmediato tiene 1 obligación y las demás modalidades, 2 o más; con cuotas de intervalo fijo, mínimo 1 día. Tarifario: programa, tipo de pago y (si lo hay) nivel del mismo programa; el desglose tiene las obligaciones del tipo de pago, sus montos fijos son mayores a 0 y el precio base es la suma (con montos variables rige el total objetivo); la fecha de fin no es anterior a la de inicio. Promoción: código sin espacios y único; al menos 2 alumnos, un programa elegible y un tipo de pago que existan; precio total mayor a 0; sedes y fechas.
- **Lo que ya se usa no se elimina: se inactiva.** No se elimina un programa con niveles, tarifarios, promociones, matrículas o recetas; ni un nivel con tarifarios, matrículas o recetas; ni un tipo de pago con tarifarios, promociones o matrículas; ni una promoción ya aplicada en matrículas; ni una filial que el catálogo nombra. Un tarifario o un origen de lead sí se eliminan.
- **Duplicar** crea una copia con nombre «(Copia)» y código «-COPY» (si ya existen, «(Copia 2)» y «-COPY-2»…).
- **Quién quedó registrado.** Cada fila guarda quién la creó y quién la cambió por última vez, y cuándo (el nombre sale de la cuenta con la que se ingresó).
- **Qué sigue en memoria.** Las matrículas, los planes, las recetas de materiales y las asesorías de ejemplo siguen en memoria y nombran al programa, nivel y tipo de pago **por su id**; por eso los ids del catálogo no cambiaron (siguen siendo '1', '2'…).

## Artículos, precios de venta y recetas de materiales en la base (2026-11-07)

- **Qué es.** El Catálogo de artículos, el historial de precios de venta y las recetas de materiales se guardan en la base de datos y los lee toda la aplicación al iniciar sesión. Al recargar la página lo que se cambió queda. Los datos de partida son los de ejemplo: 5 artículos (un libro, un material educativo, un kit de bienvenida, una mochila y una cartuchera), 3 precios generales y 3 recetas (Kids nivel 1, Kids nivel 2 y Pre-Kids nivel 1). Los precios son **de prueba**.
- **El SKU es el id** del artículo: lo escribe la persona (letras, números, punto, guion y guion bajo; hasta 40 caracteres), no se repite (sin importar mayúsculas) y **no se puede cambiar** después, porque el stock, el kardex y las recetas lo nombran.
- **Los artículos no se eliminan: se inactivan.** Desactivar un artículo no lo saca de las recetas que ya lo tenían; una receta nueva solo admite artículos activos y habilitados para matrícula.
- **Un precio nunca se sobrescribe ni se borra.** Registrar un precio nuevo cierra la vigencia abierta del mismo alcance (general o de una sede) el **día anterior** y deja el nuevo abierto. No se repite una fecha de inicio ni se registra un precio antes de una vigencia posterior del mismo alcance. La excepción por sede gana sobre el precio general mientras rige. Un artículo que se vende nace con su precio general (USD).
- **Crear artículos es todo o nada.** Una carga masiva con una fila mala no guarda ninguna, y si falla el precio de un artículo tampoco se guarda el artículo. Un paquete puede nombrar artículos de la misma carga; sus componentes se guardan por SKU y su nombre se muestra siempre con el nombre actual del artículo.
- **Recetas: una sola activa por programa, nivel, sede y período.** «Sin nivel» vale para todos los niveles y «todas las sedes» choca con cualquier sede. Una receta nueva que chocaría con otra activa se rechaza con el nombre de la otra; una copia nace **inactiva** y activarla vuelve a comprobar el choque. El nivel debe ser del programa y las sedes deben existir (nueva comprobación, también en la base).
- **Quién puede qué.** Lee cualquier cuenta con acceso. Crea artículos quien tiene «Crear artículos», los edita y activa quien tiene «Editar, activar y desactivar artículos» y registra precios quien tiene «Registrar el precio de un artículo». Las recetas: crear y duplicar, editar, y activar o desactivar son tres funciones; quien solo puede activar o desactivar no cambia nada más. La base lo exige, no solo la pantalla, y deja quién creó y quién cambió cada fila.
- **Reglas pequeñas nuevas** (antes la pantalla no las pedía): el SKU con el formato indicado, costo no negativo, y que el nivel de la receta sea del programa.
- **Qué pasó con el stock.** El stock, el kardex, los envíos, las transferencias y las recepciones también pasaron a la base (ver el apartado siguiente) y nombran a los artículos por su SKU.

## Stock, kardex, envíos, transferencias y recepciones en la base (2026-11-09)

- **Qué es.** El stock de cada artículo en cada lugar (el almacén central o una sede), el kardex, los ajustes, los envíos, las transferencias, las recepciones con sus incidencias, los couriers y los métodos de envío se guardan en la base y los lee toda la aplicación al iniciar sesión. Después de cada operación el sistema vuelve a leer lo que cambió: lo que se ve es lo que de verdad quedó guardado.
- **La cantidad en stock solo cambia con un movimiento.** Nadie la escribe: ni una pantalla, ni el editor de la base. Cada movimiento descuenta o suma, comprueba que el saldo **no quede negativo** y deja su línea en el kardex (saldo anterior, saldo nuevo, quién, cuándo y el documento que lo respalda), **todo o nada**: si un movimiento de varias líneas falla en una, no queda ninguna.
- **El kardex es un libro que solo se agrega.** No se modifica ni se borra. Un error se corrige con un ajuste. En cada fila de stock la cantidad es la suma de sus movimientos. Los ajustes y las incidencias de recepción también solo se agregan.
- **Lo derivable no se guarda.** El kardex y los ajustes guardan los ids del artículo y del lugar; el nombre sale de ellos al mostrarlos, así que un cambio de nombre se ve en todo el historial. El detalle de un envío es la suma de sus cajas.
- **Quién mueve y quién ve.** Una sede la mueve quien la alcanza; el almacén, solo el Superusuario o quien trabaja en él (ver el almacén no autoriza a moverlo). Cada operación pide su función del registro (ingreso, ajuste, paquetes, mínimo, venta, entrega, reversa, preparar o despachar un envío, solicitar, aprobar, despachar o recibir una transferencia, confirmar una recepción). Se ve el stock de las sedes que se alcanzan y el del almacén si se ve; el kardex y los ajustes piden además su función de ver.
- **Ajustes.** El tipo define el signo: el ajuste positivo y la devolución suman; el ajuste negativo y la merma descuentan; solo la regularización administrativa respeta el signo que se escribió. Todo ajuste lleva su motivo. (Antes, desde la pantalla de Stock, una merma con cantidad positiva sumaba stock: ya no.)
- **Paquetes.** Armar un paquete descuenta sus componentes y suma 1 al paquete; abrirlo hace lo contrario y solo si el paquete lo permite. Si falta algún componente, no se arma nada.
- **Envíos.** Salen del almacén central hacia una sede activa, en cajas. Borrador → En tránsito → (Listo para recepción) → Recibido (con o sin diferencias), o Cancelado. El stock sale del almacén **al despachar** (una sola vez); cancelar un envío ya despachado devuelve lo que salió. Un borrador se puede editar y eliminar; uno despachado ya no se edita (solo se habilita su recepción manual): se cancela y se prepara otro. Piden fecha y hora de llegada, método de envío, el transporte según el método («Courier»: courier y guía; «Viajero»: quién lleva la carga; otro: una observación), al menos una caja con artículos y que las cajas sumen el detalle. Los borradores vencen a las 36 horas (se ocultan de la lista).
- **Transferencias.** Una solicitud con aprobación; uno de sus extremos es siempre el almacén (reposición hacia una sede o devolución desde una sede; entre dos sedes no hay). Borrador → Solicitada → Aprobada → En tránsito → (Listo para recepción) → Recibida (con o sin diferencias); también Rechazada y Cancelada. **Solo se despacha lo aprobado** (antes el sistema aceptaba despachar una solicitud sin aprobarla; la pantalla nunca lo ofrecía). Para despachar piden método de envío, ETA y cajas que sumen el detalle.
- **Recepción.** Solo se confirma sobre un documento en tránsito: **no se puede recibir dos veces** (antes se podía confirmar de nuevo y sumaba otra vez al stock). Suma al destino lo recibido, anota una incidencia por cada diferencia (lo que faltó, llegó dañado o llegó de más) y deja el documento «Recibido con diferencias» o «Recibida con diferencias» si hubo alguna. Recibir en el almacén (devoluciones) lo hace quien trabaja en él.
- **Códigos.** `STK-NNN`, `KDX-NNN`, `ADJ-NNN` e `INC-NNN` correlativos; `ENV-AAAA-NNN` y `TRF-AAAA-NNN`, que reinician cada año; los asigna la base (dos personas a la vez no repiten).
- **Lo que tiene mercadería o documentos no se elimina.** El almacén no se inactiva con unidades en stock; una sede con stock, movimientos, envíos o transferencias no se elimina (se inactiva). Los couriers y métodos se inactivan, no se eliminan.
- **Venta en caja, entrega de materiales y reversa.** El descuento (o la devolución) del stock lo hace la base; el ingreso en caja, la matrícula y el movimiento reversado siguen en memoria y solo se registran si el stock salió bien. Si falla el stock, no se registra la venta.
- **Datos de partida.** El stock de ejemplo entra como un ingreso «Saldo inicial» (20 filas: el almacén, Los Olivos, Piura y Chiclayo), más 2 couriers y 4 métodos de envío. **No** se cargaron envíos, transferencias ni ajustes de ejemplo: eran de 2024 y dejarían un historial que no cuadra con el kardex.
- **Pendiente de esta parte.** Los archivos adjuntos de un envío guardan solo su nombre (falta el almacenamiento de archivos). El kardex y los ajustes cargan los últimos 1000 movimientos.

## Titulares y alumnos en la base (2026-11-10)

- **Qué es.** Los titulares (apoderados) y los alumnos, con el vínculo entre ellos, se guardan en la base de datos y los lee toda la aplicación al iniciar sesión. Al recargar la página lo que se creó o cambió queda. Los datos de partida son los 5 titulares y 5 alumnos de ejemplo, con los mismos códigos (TIT-001…, ALU-001…) porque las matrículas, los pagos y la agenda de ejemplo —que siguen en memoria— los nombran. Son datos de **prueba** (nombres y documentos inventados).
- **Lo derivable no se guarda.** El nombre completo sale de nombres y apellidos; la edad, de la fecha de nacimiento; el estado del alumno (Activo, Inactivo, Sin matrícula), su programa y su sede, de sus matrículas; los alumnos, matrículas y saldo de un titular, de los vínculos y las matrículas.
- **Los códigos los asigna la base** (TIT-NNN, ALU-NNN): dos personas registrando a la vez no repiten. Un alumno puede tener varios titulares en orden: el primero es el titular principal. Un alumno **independiente** no tiene titulares: es su propio titular y su teléfono es obligatorio; uno con apoderado no lleva teléfono propio y su parentesco con el titular es obligatorio.
- **Reglas que la base vuelve a comprobar** (las mismas que piden las pantallas): el documento es válido (DNI de 8 dígitos; carné de extranjería o pasaporte de 6 a 12 letras o números) y **no se repite** (sin importar mayúsculas; ni entre titulares ni entre alumnos); nombres y apellido paterno obligatorios; la fecha de nacimiento es obligatoria y no puede ser futura; el **titular es mayor de 18 años** y tiene teléfono de 9 dígitos; el correo, si se escribe, tiene formato de correo; el alumno indica qué hace (estudia: tipo de institución, institución y grado —o ciclo si no es colegio—; trabaja: ocupación; ambas; o ninguna) y solo se conserva lo que corresponde.
- **Matricular crea personas.** El asistente comprueba todo el registro; después guarda en la base, **en una sola operación (todo o nada)**, a los titulares y alumnos nuevos y los vincula, y deja la fecha de inicio y la situación de los alumnos que ya existían; por último matricula a esas personas ya registradas. Si algo de las personas falla, no queda ninguna a medias. (La matrícula, el plan y los pagos siguen en memoria: si se recarga antes de que pasen a la base, la persona queda registrada «Sin matrícula».)
- **Quién puede qué.** Crear: «Crear alumno» o «Crear titular», o quien matricula (matricular crea personas). Editar: «Editar alumno» / «Editar titular»; quien solo matricula puede dar la fecha de inicio y la situación de un alumno que ya existe, nada más. Eliminar: «Eliminar alumno» / «Eliminar titular»; un titular con alumnos no se elimina, y un alumno con matrículas, asesorías o seguimiento tampoco (eso se mira en el sistema mientras sigan en memoria). La base lo exige, no solo la pantalla, y deja quién creó y quién cambió cada ficha.
- **Quién ve a los menores.** Datos de menores y de sus familias: solo los lee quien tiene una función que muestre alumnos o titulares (Alumnos, Titulares, Matrículas, Cobranza, la programación y el historial de Psicopedagogía, y los reportes de matrículas, cartera y Psicopedagogía). Sin una de ellas, la base no entrega nada. **Todavía no se limitan por sede**: un alumno no sabe en qué sede está (lo dice su matrícula); el alcance por sede llega cuando las matrículas pasen a la base.
- **Reglas pequeñas nuevas** (antes las pantallas no las pedían): el titular nuevo del asistente de matrícula debe ser mayor de 18 años, y el correo y el teléfono se comprueban también al editar un alumno desde Personas.
- **Qué sigue en memoria.** Las matrículas, los planes y cuotas, los pagos, la caja, las notas de crédito, las solicitudes (caída, reactivación, cambio de programa, traslado), la cobranza y la agenda de Psicopedagogía.

## Matrículas y dinero en la base (2026-11-10)

Lote 8 (migración 0015 `supabase/migrations/20261110140000_matriculas_y_dinero.sql`): las matrículas, los planes con sus cuotas, los pagos, los movimientos de caja, las notas de crédito y los grupos promocionales pasan de la memoria a la base. **Aplicada a la base real el 2026-11-10; falta subir el código** (ver `docs/PLANTILLA_SUPABASE.md`).

- **El cliente calcula, la base guarda y vigila.** Las reglas de negocio no se repiten en SQL: cada acción calcula el estado nuevo con las mismas funciones puras de siempre (`recomputePlan`, `applyReversalToPlan`, `applyRefinance`, `applyDropToPlan`, `buildPaymentRecord`…) y `diffMoney` compara el estado de antes con el de después: solo viajan las filas nuevas (marcadas, completas) y las columnas que cambiaron. La base las aplica con UNA llamada atómica, `aplicar_cambios_matricula(accion, cambios)`: todo o nada.
- **Qué comprueba la base** (aunque la pantalla falle): (1) que la cuenta tenga la función de esa acción (la misma del registro que pide el contexto a la pantalla; `check-money-db.ts` lo compara); (2) que la acción solo toque las tablas que le corresponden (cobrar no toca matrículas; refinanciar y mora no tocan pagos ni caja; la caja no toca planes) y si puede solo agregar o también cambiar; (3) que la sede sea alcanzable (un traslado necesita alcanzar las dos); (4) que un ingreso no se registre con la acción de egresos ni al revés; (5) los **invariantes del dinero** sobre lo que quedó: cada cuota entre 0 y su monto, en una cuota abierta saldo = monto − cobrado, el saldo del plan = la suma de sus cuotas abiertas, cada cobro nombra un pago que existe, las partes de un pago suman su monto (± 0,02), un pago anulado tiene su constancia de reversa, un movimiento en dólares cuadra con su equivalente y en soles con su tipo de cambio, una nota de crédito nombra un pago que existe.
- **Lo que no se cambia.** Los pagos, los movimientos de caja y las notas de crédito **solo se agregan**: de un pago solo cambian el estado y la constancia de reversa; de un movimiento, el estado, la constancia y el lote de depósito; una nota no cambia. No se borran ni se vacían (ni desde el editor SQL). Un error se corrige con una reversa. Un alumno con matrículas no se elimina.
- **Stock y dinero en la misma operación.** La venta en caja, la reversa de una venta y la entrega de materiales (verificación) mueven el stock **dentro de la misma llamada** que guarda el dinero: si falta stock, no queda el ingreso; si el dinero se rechaza, no baja el stock. Antes eran dos pasos.
- **Lo derivable no se guarda.** El nombre del alumno, del programa, del nivel, de la sede, del asesor, del origen, del tipo de pago y del tarifario salen de sus ids al mostrar (si un programa cambia de nombre, la matrícula lo muestra al instante); el plan de una matrícula, de su `planId`; «Vencida» no la escribe nadie. El saldo y el estado del plan son el resumen que escribe `recomputePlan` y la base comprueba. El pago guarda la **constancia** del nombre del alumno ese día y la **sede donde se cobró** (no cambia si la matrícula se traslada).
- **Quién ve qué, por sede.** Matrículas, planes, cuotas, pagos, caja y notas se ven por sede (`app.ve_sede`) y con una función que las muestre (las listas de la base coinciden con el registro). Un movimiento sin sede (caja general) lo ve y lo registra quien alcanza todas las sedes. **Los alumnos y titulares también se limitan por sede ahora:** se ve a quien aún no tiene matrícula (el asistente lo acaba de crear) o la tiene en una sede que se alcanza. Quien no tiene «ver cuotas» ve el plan sin cuotas.
- **Códigos.** Siguen asignándolos las pantallas (máximo + 1): si dos personas registran a la vez, la base rechaza el repetido («otra persona registró algo al mismo tiempo, vuelva a intentarlo»); nunca se reparte mal. Es una limitación conocida para cuando haya muchas personas matriculando a la vez.
- **Un depósito lleva la sede de los ingresos** que se depositan (si vienen de una sola); de varias sedes es caja general.
- **Los datos de ejemplo** (5 matrículas, 5 planes, 10 pagos, 11 movimientos) se cargan con `supabase/seed/matriculas_de_ejemplo.sql` (**generado**: `npx tsx scripts/doc-matriculas-seed.ts`; repetible) con los mismos códigos, porque la agenda y las solicitudes de ejemplo en memoria los nombran. Las fechas salen de un día fijo (2026-11-10): con los días las cuotas de ejemplo se vuelven «Vencidas», lo esperado en una base de prueba. Al derivar el origen del id se corrigió el ejemplo (dos matrículas decían «Referido» con el id de «Orgánico»).
- **Qué sigue en memoria.** Las solicitudes (caída, reactivación, cambio de programa, traslado) y su historial, el registro de correcciones, los cierres de caja y la reapertura, la caja chica, los recordatorios de cobranza, la política de cobranza, la plantilla del contrato y la agenda de Psicopedagogía (asesorías, actividades, seguimiento). **Lo que esas acciones cambian en una matrícula o en un plan sí se guarda** (al aprobar una caída, la matrícula y las cuotas anuladas o condonadas se guardan juntas; la agenda y la solicitud se actualizan solo si eso salió bien). Una matrícula nueva crea su primera asesoría en memoria: al recargar, vuelve a pedirse (el próximo lote).

## El SKU de un artículo lo asigna el sistema (2026-11-10)

- **Nadie escribe el SKU.** Al crear un artículo (uno a uno o por carga masiva) el sistema le asigna el siguiente de su tipo: **ITM-LIB-001** (libros), **ITM-MAT-001** (material educativo), **ITM-HER-001** (herramientas y adicionales) e **ITM-KIT-001** (paquetes). Cada tipo lleva su propia numeración; los SKU que ya existían con otro formato (`ITM-LIB-K1`, `ITM-KIT-BIENV`…) se conservan tal cual y no se pisan. El SKU no cambia nunca (el stock, el kardex y las recetas lo nombran).
- **En el formulario:** al crear, el campo ya no se pide (dice que el sistema lo asigna al guardar); al editar, se ve y no se puede cambiar; al guardar sale un aviso con el código asignado («Artículo creado con el código ITM-LIB-004»). En la carga masiva se avisa el rango («del ITM-LIB-004 al ITM-LIB-009»).
- **Carga masiva de libros:** la plantilla ya no trae la columna SKU. Un archivo viejo con esa columna sigue sirviendo (se ignora).
- **Si dos personas crean a la vez** y el sistema ya había dado ese SKU a otro, se reintenta con el siguiente (hasta tres veces); si no se logra, pide intentar de nuevo y no deja nada a medias.
- **Regla nueva que lo acompaña:** como ya no hay un SKU escrito que impida cargar dos veces lo mismo (por ejemplo, subir el mismo archivo dos veces), **dos artículos del mismo tipo no pueden llamarse igual** (sin mirar mayúsculas, tildes ni espacios de más). Un nombre igual en otro tipo se permite. Al editar solo se comprueba si el nombre cambió. En la carga masiva el nombre no puede repetirse con un libro del catálogo ni dentro del archivo.

## Kits y precio de referencia de los artículos (acordado y aplicado en el código el 2026-11-11; falta aplicar la migración 0016 a la base real)

Lo que el usuario dictó sobre los kits y los precios, ya aplicado en las pantallas y reglas (`utils/inventory.ts`, `utils/recipes.ts`, `utils/verification.ts`, `utils/saleCatalog.ts`) y en la migración 0016 (`supabase/migrations/20261111100000_reglas_de_articulos_y_kits.sql`, que el usuario debe pegar en la base real).

- **Todo artículo lleva un precio de referencia**, también el material educativo y los kits. Motivo: un libro (o cualquier artículo) que se entregó con la matrícula y que el alumno extravía se vuelve a comprar en secretaría; ese precio es el que se cobra. Se registra como precio general con su fecha de inicio (como hoy) y puede cambiarse o fijarse por sede.
- **El encuadernado del libro (anillado o encolado) es solo información del libro**, no condiciona nada: no decide si se entrega con la matrícula ni si se vende.
- **El «paquete logístico» pasa a llamarse «Kit».** Su **composición es obligatoria** (no es informativa): es la receta para armarlo. Armar un kit descuenta cada artículo de su stock suelto y suma una unidad al stock del kit (así ya funciona «Empaquetar» en Stock). No hay kits dentro de kits.
- **Un kit se vende**, con su propio precio de referencia (el formulario sugiere la suma de los precios de sus artículos, y se puede cambiar). La venta sale del **stock del kit**, no de cada artículo. Es distinto de la entrega por matrícula, que la hace la verificación.
- **Un kit enviado como kit llega como kit.** Los envíos y las transferencias llevan el kit como un solo artículo y la recepción lo suma al stock del kit de la sede destino: no se abre ni se reparte en artículos sueltos (esto **ya es así** en el sistema).
- **Desarmar un kit es posible pero siempre queda registrado**: quién, cuándo, en qué sede y **por qué** (motivo obligatorio), con el kardex (sale 1 kit, entran sus componentes). La pantalla de Stock pide el motivo (obligatorio, hasta 300 caracteres) y la base lo vuelve a exigir; desarmar tiene su propia función, «Desarmar kits», separada de «Armar kits». «Desarmar» no es la forma normal de entregar: entregar por componentes en una verificación no desarma nada, descuenta cada artículo suelto.
- **Verificación de materiales:** una matrícula recibe siempre el **kit** como primera opción. Si no hay stock del kit, la ventana muestra el stock de cada artículo suelto: se puede entregar el kit completo sin armar o solo algunos artículos; en ese caso la verificación queda **Incompleta** (el sistema lo permite, el alumno puede empezar y lo que falta se completa en otra verificación). Esto **ya existe** en `pages/Verification.tsx` con otro nombre y atado a «Permite desempaquetado»; lo acordado el 2026-11-11 es:
  - **La receta puede traer kits y artículos sueltos a la vez**; cada línea tiene su casilla y **nada se marca solo**: quien entrega marca lo que de verdad entrega (con eso se descuenta el stock).
  - **El botón se llama «Buscar por componentes»** (no «desempaquetar»: no se abre ningún kit ni se descuenta el kit; se descuentan los artículos sueltos). No depende de ninguna casilla del artículo, solo de que el kit tenga composición.
  - Al buscar por componentes **aparece la lista completa de los componentes del kit**: los que tienen stock en la sede se pueden marcar; los que no, salen con su nombre en gris («Sin stock»). Se puede entregar todos, algunos o ninguno; si no se entrega todo, la verificación queda Incompleta.
  - **Si no hay stock de nada** (ni del kit, ni de sus componentes, ni de ningún artículo de la receta): en medio de la ventana sale el aviso y un botón **«Avisar a Logística»**, que envía una alerta como mensaje a quien tenga la función de logística central (puede ser más de una persona; se resuelve por función, no por nombre de rol). **Planificado, no se construye todavía:** llega con la mensajería y los avisos (Plan de lanzamiento §6.8). El aviso llevará la sede, la matrícula, los artículos que faltan y la fecha de la primera asesoría.
  - Mientras falte el stock, la primera asesoría sigue la regla de siempre: si aún faltan días se espera el stock de la sede; si la fecha llega o está por pasar, se reprograma (ya existe en `verificationGate.ts`).
  - **Desempaquetar un kit solo se hace en Stock** (administración de la sede), nunca dentro de una verificación ni de una venta: allí suma 1 a cada artículo y resta 1 al kit.
- **Unidad de medida:** lista corta (Unidad, Juego, Kit, Caja, Paquete, Par) en vez de texto libre; un kit propone «Kit».
- **Una sola casilla por artículo: «¿Se entrega con la matrícula?»** (si es «sí», se puede elegir en las recetas). Desaparecen «¿Se vende?» y «¿Permite desempaquetado?»: todo artículo con precio de referencia y stock se puede vender, y todo kit se puede desarmar (con motivo). El material educativo siempre se entrega con la matrícula; el libro y el kit parten en «sí».
- **Venta en Caja:** una lista con buscador que muestra el stock de la sede. Va primero lo de venta habitual (libros, herramientas y adicionales, kits); el **material educativo** queda plegado (casi nunca se vende), pero **la búsqueda siempre lo encuentra**. Los libros NO se pliegan aunque se entreguen con la matrícula: se entregan siempre y se venden siempre (por ejemplo, para reponer uno extraviado). Un kit sin kits armados avisa debajo del buscador y manda a Stock a armarlo. Una venta de un material que se entrega con la matrícula es **una venta cualquiera** (no hay «reposición» como concepto).
- **Un artículo sin precio de referencia no se vende** (los de partida que aún no lo tienen salen marcados «Sin precio de referencia» en el catálogo).
- **Una receta no puede llevar un kit y uno de sus artículos** (se entregaría dos veces); un kit junto a otros artículos que no están dentro de él sí se permite.

## Cierres de caja y caja chica: cada sede la suya (2026-11-12, Lote 9A)

- **Cada sede cierra su propia caja** (el arqueo diario del dinero contado contra el saldo del sistema): un cierre es de una sede y una moneda (Caja PEN y Caja USD de Piura, de Chiclayo…). Quien trabaja en una sede solo ve y cierra lo suyo. La caja sin sede («caja general») la cierra quien alcanza todas las sedes.
- **La caja chica es un fondo por sede**: cada sede tiene su monto asignado y su tope por gasto (si nadie lo definió, valen S/ 1 000 y tope S/ 200), sus ingresos y gastos y sus cierres. Un gasto no pasa del tope de SU sede ni deja el saldo de su caja chica en negativo; un ingreso solo se reversa si el saldo que queda cubre lo ya gastado.
- **El saldo esperado lo calcula la base** con los movimientos aplicados de esa sede y moneda hasta la fecha del cierre; lo que cuenta la persona se compara con eso. Si hay diferencia (sobrante o faltante), la nota es obligatoria (mínimo 5 letras). No se cierra una fecha futura ni una igual o anterior a la última cerrada de esa caja.
- **Un día cerrado no admite movimientos a mano** (ingreso, egreso o venta, ni su reversa). Para registrarlos hay que **reabrir el último cierre de esa caja**, con motivo (mínimo 5 letras); queda en el historial (Sistema → Reaperturas) y avisa. Los **cobros** de pagos con fecha cubierta siguen entrando: el cierre queda «desactualizado» y se avisa (conviene reabrir y volver a cerrar).
- **Un cierre no se borra** y un movimiento de caja chica tampoco: se reabre / se reversa con su motivo.
- La caja chica de la vista global pide elegir sede; «Arqueo y cierre» pide la sede en su ventana (y «Caja general» solo la ofrece a quien alcanza todas las sedes).
