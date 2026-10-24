# Reglas de negocio: qué se resolvió, cómo funciona y qué falta (2026-10-23)

Cada punto dice **el problema**, **la solución** y **dónde está** en el sistema. Las decisiones que conviene confirmar están marcadas con ❓. Las reglas puras se verifican con `scripts/check-business.ts` (97 casos).

---

## 1. Facturación: qué le falta a esta lógica (solo explicación)

**Hoy existe:** el comprobante de cada pago se digita a mano (tipo, serie y número) y se valida su formato (serie de 4 caracteres que empieza con B o F; número de hasta 8 dígitos); se controla que no se repita, y un pago anulado libera su número. Desde esta tanda también hay **notas de crédito** con correlativo propio (ver punto 2).

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
- El programa debe estar habilitado en la sede destino y el **horario** del alumno existir allí (si no, se elige otro).
- **El precio y el plan no cambian**; los pagos y la caja quedan registrados en la sede donde se cobraron.
- Las asesorías y actividades futuras de la sede anterior se **cancelan** para reprogramarlas en la nueva (si se cancela la primera asesoría, la vigencia no cuenta hasta programar la nueva).

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
- **Separación de funciones:** `APPROVAL_POLICY.allowSelfApproval` indica si quien pidió puede aprobar. Está en `true` porque hoy hay un solo usuario; al definir los roles se pasa a `false` y nadie aprueba lo que pidió.
- **Lo que sí hay que decidir** (no es técnico): ❓ ¿quién aprueba cada tipo (administración de sede, gerencia)? ¿se exige otra persona distinta de quien pidió? ¿hay un monto o plazo a partir del cual aprueba un nivel superior?

---

## 5. Contrato y ficha de la matrícula ✅

**Dónde:** ficha de la matrícula → pestaña **«Contrato y ficha»** (también desde el menú de la fila de Matrículas, y desde la pantalla de éxito del asistente).

- **Se arman solos** con los datos de la matrícula: alumno, titular (o el propio alumno si es independiente), programa, duración y garantía, fecha de inicio y fin (desde la primera asesoría), horario, precio, tipo de pago, cronograma de cuotas, sede y empresa (razón social y RUC de la sede).
- **Antes de generar el contrato se comprueba que haya lo necesario** y se dice qué falta: matrícula activa, programa, plan de pagos, **dirección del titular**, mayoría de edad si el alumno es su propio contratante, sede y empresa con **RUC**. La ficha solo exige tener al alumno.
- **Numeración y versión:** `CTR-2026-001` / `FIC-2026-001`. Si los datos cambian después (precio, cuotas, titular…) el documento queda **«Desactualizado»**: se regenera (versión siguiente, mismo número) y hay que firmarlo de nuevo.
- **Firma:** se registra la fecha y el archivo escaneado (el sistema guarda el nombre; aún no almacena archivos). No se firma un documento desactualizado ni dos veces.
- **Imprimir / guardar PDF** desde la vista previa. En Matrículas se ven los avisos «Sin contrato» y «Contrato sin firma».
- **Plantilla del contrato editable** en *Configuración → Plantillas de documentos*: texto con campos entre llaves dobles (`{{alumno}}`, `{{precio}}`…; se ven todos), cláusulas que se agregan o quitan y versión. **Importante:** el texto que trae el sistema es un **modelo, no asesoría legal**; debe revisarlo el área legal y marcarlo «revisado» (mientras no, cada contrato muestra una advertencia). Cambiar el texto quita la marca de revisado.
- ❓ El contrato no es obligatorio para verificar o cobrar (solo avisa). Si se quiere exigirlo hay que decidir en qué paso.

---

## 6. Planes y cartera: recordatorios, mora y reportes ✅

### Estados siempre al día
El estado de cada **cuota** y de cada **plan** ya no se confía al texto guardado: se calcula con lo cobrado y la fecha (`utils/planState.ts`). Una cuota «Pendiente» de ayer se ve «Vencida»; el plan pasa a «Atrasado» solo. Lo usan Planes, el detalle de la cuota y la columna «Plan» de Matrículas.

### Política de cobranza (Configuración → Política de cobranza)
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

## 9. Qué se probó
Psicopedagogía: `check-psychopedagogy.ts` (84 casos: responsable y cruces, asistencia, motivos y 24 h, eventos del historial, métricas, recordatorios y reporte); en el navegador: cancelar con un motivo del alumno a menos de 24 h (se rechaza), cancelarla por la institución (queda en el historial), asignar el responsable de una actividad (Juan Pérez aparece bloqueado por una asesoría suya a esa hora), marcar asistencia, el formulario de la sesión con sus obligatorias, los recordatorios (registrar un envío), el reporte, y reprogramar un cambio de responsable sin motivo (se rechaza) y con motivo (queda «Reprogramada 1 vez»).

Verificación antes de la primera asesoría: `check-first-session.ts` (42 casos: cuándo aplica, niveles de urgencia, pago vs. verificación, bloqueo, acciones sin las 24 horas, orden y receta vigente); en el navegador, Valentina Silva (asesoría en 3 días): sale primera en Verificación como «Urgente», la agenda muestra el aviso y el menú deshabilitado, la ventana de reprogramación explica el motivo, la confirmación pide la casilla y, al confirmar, el aviso desaparece.

`tsc` sin errores · `vite build` · los 14 scripts `check-*` pasan (`check-business`: 97 casos; `check-first-session`: 42; `check-psychopedagogy`: 84) · en el navegador: ficha de matrícula y su vista previa, cambio de programa (solicitar → aprobar → plan y programa actualizados), caída y reactivación, vista previa del traslado, arqueo y cierre de caja (con diferencia, bloqueo de reversa en día cerrado, reapertura y su registro), reversa de un pago con nota de crédito `BC01-000001`, política de cobranza con mora del 2 %, cobro de mora (USD 122.40 sobre una cuota de USD 200 con 921 días de atraso), recordatorios, reporte de cartera y renovación (el asistente abre con los datos y la observación).
No se probó en el navegador la generación del **contrato** (los datos de ejemplo no tienen dirección del titular, y el sistema lo avisa); sí está cubierta por el script de reglas.
