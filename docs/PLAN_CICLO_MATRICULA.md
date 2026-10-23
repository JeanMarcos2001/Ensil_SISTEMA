# Ciclo de vida de una matrícula registrada: caída, corrección de datos, plan y reversa de pagos

> Estado: **implementado** (2026-10-22). Este documento deja el análisis y las decisiones, para poder revisarlas.

## 1. Cómo se enlaza una matrícula en el modelo de datos

```
Titular (Guardian) ──< Alumno (Student) ──< Matrícula (Enrollment) ── 1 ── Plan (Plan) ──< Cuotas (installments) ──< cobros
        guardianIds ▲                              │                                              │ paymentId
                                                   ├── 0..1 ── Grupo promocional (PromotionGroup: reparto por matrícula)
                                                   ├──< Pagos (Payment.enrollmentIds) ──< Partes (medio, banco, operación) ──< Caja (CashMovement.paymentId)
                                                   ├──< Asesorías (Schedule: la primera trae enrollmentId; el resto cuelga del alumno)
                                                   ├──< Inscripciones en actividades (MonthlySchedule.actividades[].inscritos = alumnos)
                                                   ├── Verificación (estado, verificador, artículos entregados → stock)
                                                   ├── Vigencia (derivada de la primera asesoría + duración y garantía del Programa)
                                                   └── Solicitudes de caída (DropRequest) y correcciones (EnrollmentChange)
```

Consecuencia: **tocar una matrícula toca todo lo anterior**. Por eso ninguna acción es «editar un campo»: cada una tiene su flujo, su constancia y sus efectos explícitos.

## 2. Solicitar caída

**Idea:** la caída no se aplica al pedirla. Quien atiende **solicita**; alguien con autoridad **aprueba o rechaza** en *Sistema → Solicitudes pendientes*.

**Solicitud** (`DropRequest`): matrícula, motivo (catálogo), detalle (obligatorio, queda de constancia), «dejó de asistir desde» (no futura, no anterior a la matrícula). Una matrícula solo admite una solicitud pendiente; solo se solicita para matrículas **Activas**. Mientras está pendiente la fila muestra «Caída solicitada» y la ficha ofrece «Resolver caída solicitada».

**Antes de enviarla, el sistema muestra qué pasará si se aprueba** (`previewDrop`).

**Al aprobar** (`resolveEnrollmentDrop`):

| Qué | Efecto |
|---|---|
| Matrícula | Pasa a **Caída**, con la fecha desde la que dejó de asistir y la solicitud que la originó. Deja de contar como vigente (ya no aparece para programar asesorías). |
| Plan | Las **cuotas futuras sin pagar se anulan** (estado «Anulada», saldo 0). Las **vencidas sin pagar se conservan como deuda**, salvo que quien aprueba marque «Condonar». El plan pasa a «Caída»; su saldo es lo que queda como deuda. |
| Lo ya pagado | **Se conserva.** Si hay que devolver dinero se usa «Reversar pago» (queda en caja). |
| Asesorías | Las futuras activas se **cancelan** (se saltan las 24 h porque la causa es la caída). Si el alumno tiene otra matrícula activa, solo se cancela la primera asesoría de esta. |
| Actividades | Se quitan sus inscripciones futuras (salvo que tenga otra matrícula activa). |
| Alumno | Pasa a **Inactivo** si no le queda ninguna matrícula activa. Sus datos se conservan. |
| Materiales | La entrega ya hecha **no se revierte**: se informa. |
| Grupo promocional | Se **advierte** (la promoción puede dejar de cumplirse); no se recalcula solo. |

**Al rechazar:** la nota es obligatoria y no cambia nada.

**Decisiones tomadas (confirmar):** deuda vencida se conserva salvo condonación expresa; la devolución de dinero es un paso aparte; una caída aprobada no se deshace desde la pantalla (la reactivación queda como flujo futuro); como todavía no hay roles, cualquier usuario puede resolver (el único usuario es Superusuario).

## 3. «Ver plan» y «Editar datos» (lo que se analizó)

### Ver plan
Lleva a **Planes y cartera** con el cronograma de esa matrícula abierto (es donde se cobra, se refinancia y se ven las cuotas). La ficha de la matrícula también muestra el plan, pero la operación vive en Planes.

### Editar datos → «Corregir datos»
Se concluyó que **no debe ser una edición libre**, porque cada dato pertenece a algo distinto:

| Tipo de dato | Dónde se cambia | Por qué |
|---|---|---|
| **De la persona** (documento, nombres, teléfono, dirección…) | Personas → Alumnos / Titulares | Es de la persona, no de la matrícula: se corrige una vez para todas sus matrículas. |
| **Comerciales y financieros** (programa, nivel, tarifario, tipo de pago, precio, promoción, cuotas) | **No se editan aquí** | Cambian precio, plan, caja y recetas de entrega. Cada cambio necesita su flujo: refinanciar una cuota (ya existe en Planes), solicitar la caída (nuevo) y, a futuro, **cambio de programa/nivel** y **traslado de sede** (no existen). |
| **Administrativos** (observación, origen del contacto, responsable de la entrevista, horario de clases) | **Corregir datos** | No alteran el dinero. Se permiten con **motivo obligatorio** y **constancia** (`EnrollmentChange`: quién, cuándo, qué había, qué quedó), visible en el historial. Solo en matrículas activas. |

La ventana muestra los datos bloqueados y **por qué** y a dónde ir para cambiarlos.

## 4. Ficha de la matrícula («Ver detalle» y «Ver detalles de matrícula»)

Una sola ficha (`EnrollmentFichaModal`) reutilizada en Matrículas, Planes y cartera, Pagos («Ir a la matrícula»), Solicitudes pendientes y Alumnos («Ver matrículas» filtra por alumno). Pestañas:

1. **Resumen:** alumno (documento, edad, situación, institución, horario), titular(es) con contacto y parentesco, datos de la matrícula (fecha, sede, programa, tarifario, tipo de pago, precio, responsable, origen, registró), grupo promocional.
2. **Plan y pagos:** total, cobrado, saldo y próxima cuota; cronograma con estado y comprobante de cada cobro; pagos registrados (con los anulados tachados).
3. **Asesorías y vigencia:** estado de la vigencia, inicio (primera asesoría), fin de la base y de la extensión, «Habilitar extensión»; asistencias, faltas, sesiones y próximas asesorías.
4. **Verificación y entrega:** estado, fecha, verificador y artículos entregados.
5. **Historial:** línea de tiempo armada con los datos (matrícula, pagos, reversas, primera asesoría, verificación, extensión, solicitudes de caída y correcciones).

Acciones de la ficha: Ver plan, Corregir datos, Registrar pago, Solicitar / Resolver caída, Habilitar extensión.

## 5. Reversar un pago

**Idea:** reversar **no borra**: anula con constancia y repone todo lo que el pago tocó (`reversePayment`).

| Qué | Efecto |
|---|---|
| Pago | Pasa a **Anulado**, con quién, cuándo, motivo, explicación, si se devolvió el dinero y el N.º de la nota de crédito (opcional). |
| Cuota / plan | Se **repone la cuota exacta** que cubrió (cada cobro guarda el `paymentId`; los registros antiguos se reconocen por comprobante y monto). El plan recalcula saldo, estado y próxima cuota. En una matrícula de **contado** se crea un «Pago único» pendiente para poder cobrarla de nuevo. En un **pago grupal** se repone la parte de cada matrícula. |
| Caja | Si el dinero **se devolvió**: egreso «Devolución de pago» (por medio y moneda). Si **nunca ingresó / fue error**: los ingresos del pago se marcan «Reversados». |
| Comprobante y operación | Quedan **libres** para volver a usarse (el control de repetidos ignora los pagos anulados). La nota de crédito **no se emite aquí**: solo se registra su número. |

**Reglas:** motivo del catálogo y explicación obligatorios; «Devolución al cliente» implica que el dinero salió de caja; en **Contado en 2 partes** se reversa del pago más reciente al más antiguo; solo el superusuario puede reversar (hasta que existan permisos); si la matrícula ya fue verificada se **avisa** que la entrega no se revierte.

**Demás botones de cada fila de Pagos:** *Ver detalle* (ahora muestra la constancia de la reversa y las evidencias), *Ver evidencias* (antes «Ver comprobante (Foto)»: el sistema aún no guarda archivos, solo su nombre), *Ir a la matrícula* (abre su ficha), *Ver plan* (abre su cronograma) y *Reversar pago*.

## 6. Decisiones abiertas

1. **Reactivar una matrícula caída** (por error o porque el alumno regresa): hoy no existe. Propuesta: solicitud de reactivación con el mismo esquema (solicitar → aprobar).
2. **Devolución de dinero en la caída:** hoy es un paso aparte (reversar el pago con devolución). Propuesta futura: ofrecerla dentro de la aprobación.
3. **Quién aprueba:** hay que definirlo con los roles (¿administración de la sede, gerencia?).
4. **Cambio de programa/nivel y traslado de sede:** flujos futuros que recalculan precio, plan y recetas.
