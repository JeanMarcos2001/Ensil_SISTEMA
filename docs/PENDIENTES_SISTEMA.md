# Qué está inconcluso o sin lógica funcional (2026-10-22)

Recopilado mientras se hacían las correcciones de Personas, Contratos, Verificación y calendarios. Se basa en lo que **se revisó en el código**; lo marcado «no revisado a fondo» necesita una pasada propia.

Leyenda: 🔴 bloquea un flujo real · 🟠 incompleto (existe la pantalla, falta la lógica) · 🟡 mejora o deuda · ✅ resuelto en esta tanda

> **Reglas de negocio de la última tanda (facturación, reversas, ciclo de la matrícula, solicitudes, contrato y ficha, cobranza): `REGLAS_DE_NEGOCIO.md`.**
>
> **Ver también `INFORME_CONEXIONES_SISTEMA.md` (2026-10-23):** qué quedó funcional en la última tanda y el análisis general de lo que sigue sin conectar (persistencia, sede, usuarios y permisos, estados derivados, reportes…).

## 1. Base del sistema

| Tema | Estado |
|---|---|
| 🔴 **Persistencia** | Todo vive en memoria (`DataContext`). Al recargar se pierde todo. Supabase está creado (`lib/supabase.ts`, `hooks/useSupabaseQuery.ts`, `services/api.ts`) pero sin uso. Solo el borrador del asistente de matrícula usa `localStorage`. |
| 🔴 **Autenticación y permisos** | Sigue sin haber inicio de sesión (usuario fijo «Superadmin»). **Avance:** existe un motor de permisos (`can()`) que ya consultan las acciones de control (solicitudes, reversas, cierres, documentos, cobranza): cuando haya roles basta marcar las casillas del rol. Falta: login, vincular Usuarios con Personal y Roles, y que el resto de pantallas también consulten los permisos. |
| 🟠 **Sede del encabezado** | El selector de sede del Topbar es provisional (solo afecta a unas pocas pantallas). Programación tiene su propio filtro de sede. |
| 🟠 **Archivos y evidencias** | Los vouchers, capturas y fotos solo guardan el **nombre** del archivo; no hay almacenamiento. El detalle del pago dice «Vista previa no disponible». |
| 🟡 **Auditoría** | No hay bitácora (quién cambió qué y cuándo). Solo algunos registros guardan `user`. La pantalla «Auditoría» no existe. |
| 🟡 **Enrutado por nombre** | `AppShell` decide la pantalla por el **nombre** del ítem, no por módulo + ítem. Por eso «Reportes → Matrículas / Caja / Verificación / Stock / Personal» muestran las pantallas **operativas**, no reportes. |

## 2. Menú y pantallas que no existen

- ✅ **Dashboard:** los KPIs, el resumen por sedes, la caja por moneda, los vencimientos, la actividad y los accesos ya se calculan de los datos reales. Siguen pendientes «Alertas del sistema» y «Actividad reciente» (abren el mismo Dashboard).
- 🔴 **Reportes:** ✅ **Cartera** ya es un reporte real (antigüedad, morosidad, proyección, por sede y programa, deudores, calendario; exporta CSV y PDF). ✅ **Psicopedagogía** también es un reporte real. Siguen sin ser reportes Matrículas, Caja, Verificación, Stock y Personal (abren las pantallas operativas) y Auditoría («en construcción»).
- 🟠 **Sistema:** ✅ **Solicitudes pendientes** (4 tipos), **Cierres** y **Reaperturas** ya funcionan. Siguen «en construcción»: Auditoría, Preferencias y Ayuda.
- ✅ **Exportar:** los botones descargan CSV de lo que se ve (con filtros); Kardex y Cronogramas también PDF (impresión) e imagen. «Guardar vista» (Matrículas) guarda los filtros en el navegador.
- ✅ **Filtros:** los filtros de las tablas filtran de verdad y el botón de embudo ahora limpia los filtros. Queda pendiente que el selector de sede del encabezado se respete en las pantallas operativas (ver el informe).

## 2. Acciones con menú pero sin función (`onClick` vacío)

| Pantalla | Acciones sin lógica |
|---|---|
| Matrículas | ✅ Ver detalle (ficha), Corregir datos, Ver plan y Solicitar caída ya funcionan (ver `PLAN_CICLO_MATRICULA.md`) |
| Planes y cartera | ✅ Ver detalles de matrícula (abre la ficha) |
| Pagos | ✅ Reversar pago, Ver evidencias, Ir a la matrícula y Ver plan ya funcionan. Falta el almacenamiento real de archivos |
| Caja y Caja chica | ✅ Ver detalle, Ver comprobante, Ver matrícula/cuota, Reversar movimiento y Crear lote de depósito. Caja chica pasó de maqueta a datos reales |
| Alumnos | ✅ Ver matrículas (abre Matrículas filtrada por el alumno) |
| Titulares | ✅ Ver estado de cuenta (derivado de planes y pagos) |
| Personal | ✅ Ver contratos, Ver asignaciones, Inactivar y Reactivar |
| Contratos | ✅ Editar contrato (con motivo e historial) y Cerrar contrato |
| Asignaciones | ✅ Nueva, Editar y Cerrar asignación (con reglas de principal y de Psicopedagogía) |
| Logística | ✅ Revisado: las confirmaciones de Envíos ejecutan su acción; las de Shipping son avisos de «Entendido» |

## 3. Reglas de negocio todavía sin lógica

- 🟠 **Facturación** (análisis completo en `REGLAS_DE_NEGOCIO.md` §1): ✅ hay notas de crédito con correlativo por serie (control interno). Falta: series y correlativos automáticos por sede, perfil fiscal del cliente (RUC, razón social, dirección), líneas del comprobante e IGV (a definir con contabilidad), **emisión electrónica con un proveedor OSE/PSE**, notas de débito, comunicación de baja y resumen diario, guías de remisión, entrega al cliente y reportes contables.
- ✅ **Anulaciones y reversas:** pagos, movimientos de Caja y de Caja chica se reversan con motivo y constancia; la **nota de crédito** se emite (correlativo BC01/FC01), se registra si ya existe, o se deja constancia de que no se entregó el comprobante; hay **cierres de caja y reaperturas**. Falta: nota de crédito con catálogo oficial de motivos y envío a SUNAT, y la nota de débito para la mora.
- ✅ **Ciclo de vida de la matrícula:** solicitar y aprobar la caída, **reactivar** (90 días), **cambio de programa/nivel**, **traslado de sede**, **renovación** (abre el asistente con los datos) y corregir datos administrativos. Falta: precio o promoción especial de renovación, devolver el dinero dentro de la propia aprobación de la caída (hoy es un paso aparte), recalcular el grupo promocional al caer o cambiar de programa, y reprogramar solas las asesorías canceladas por un traslado.
- ✅ **Solicitudes:** caída, reactivación, cambio de programa y traslado, todas con permisos del catálogo (`can()`). Falta decidir quién aprueba cada tipo y pasar `allowSelfApproval` a `false` cuando existan los roles; hoy cualquiera con el permiso (el Superusuario) puede resolver lo que pidió.
- ✅ **Contrato y ficha de la matrícula:** se generan con los datos de la matrícula (numeración, versión, firma, impresión) y la plantilla del contrato se edita en Configuración. Falta: **revisión del texto por el área legal** (hoy es un modelo), guardar los PDF y los escaneos firmados (almacenamiento de archivos), firma electrónica, y decidir si se exige el contrato firmado para verificar o cobrar.
- ✅ **Planes:** el estado de cuotas y planes se calcula solo; hay política de cobranza, **mora** (calculada y cobrable como cuota), **recordatorios** (texto listo, WhatsApp, registro de enviados u omitidos) y el **reporte de cartera**. Falta: envío automático por WhatsApp o correo (hoy se prepara y se registra), nota de débito por mora, escalamiento a cobranza externa o promesas de pago, y la evolución histórica de la cartera (no se guardan cortes mensuales).
- 🟠 **Personal:** inactivar y reactivar ya existen; no hay vínculo con usuarios del sistema; el contrato no se enlaza con planilla. El sueldo neto es una **estimación** (tasas AFP/ONP referenciales en `utils/payroll.ts`, sin renta de 5.ª categoría).
- ✅ **Verificación:** ahora va **antes de la primera asesoría** (sin materiales no se registra la asistencia y, si llega la hora, se reprograma) y pide una **confirmación** antes de entregar y descontar el stock (`REGLAS_DE_NEGOCIO.md` §7). Decisión: **no** se exige acta firmada ni foto de la firma por ahora. Falta: decidir qué hacer cuando un programa no tiene receta (hoy no se bloquea la asesoría y la pantalla lo avisa), y que el asistente de matrícula muestre al registrar si la fecha elegida da tiempo para verificar.
- ✅ **Psicopedagogía** (flujos completos en `REGLAS_DE_NEGOCIO.md` §8):
  - ✅ **Responsable de actividades:** se asigna desde Programación → Actividades especiales (personal activo de Psicopedagogía, sin cruces); avisa cuando faltan 7 días o menos.
  - ✅ **Asistencia a actividades:** Asistió / Faltó por inscrito, desde el día de la actividad y con responsable; aparece en el historial del alumno y en el reporte.
  - ✅ **Recordatorios** de asesorías, actividades y vigencia por vencer (pantalla propia; los días se configuran en Configuración). Falta el **envío automático** por WhatsApp o correo: hoy se prepara el texto, se abre WhatsApp y se registra.
  - ✅ **Historial** de reprogramaciones y cancelaciones: quién, cuándo, de qué a qué, por qué y quién lo pidió (alumno o institución). Cambiar con menos de 24 h solo lo decide la institución, con permiso y motivo.
  - ✅ **Métricas de la sesión** con rangos duros, avisos de lo inusual (que exigen explicarlo), comparación con la sesión anterior y obligatorias por programa.
  - ✅ **Reporte de Psicopedagogía** (Reportes → Psicopedagogía).
  - Falta: rangos de métricas **configurables por programa** (hoy están en `utils/sessionMetrics.ts`), alertas por mensaje cuando un alumno entra en riesgo, y que el reporte guarde cortes históricos (se calcula siempre al día).
- 🟡 **Alertas de vigencia:** solo se ven al abrir Matrículas / Dashboard / Programación; no hay notificación activa.

## 4. Modelo de datos: inconsistencias que conviene limpiar

- 🟡 **Contadores guardados en vez de calculados:** `Guardian.students`, `Guardian.enrollments` y `Guardian.balance` (texto como `'$800'`). Pueden desactualizarse; deberían derivarse de matrículas y planes.
- 🟡 **Nombres duplicados:** muchas relaciones se hacen por **nombre** (`Enrollment.student`, `Student.titular`, `Plan.titular`, `Schedule.student`) además de por id. Si alguien cambia de nombre, se desfasan (al editar un titular ya se actualiza el nombre en sus alumnos, pero no en planes ni matrículas).
- ✅ **Fechas con desfase de zona horaria:** el «hoy» de todas las pantallas ya es la fecha local de Perú (`todayLocalISO`). Solo quedan cálculos de fechas explícitas, que no dependen de la hora.
- 🟡 **Fechas en dos formatos:** matrículas antiguas con fecha de texto («24 Mar 2024») y `dateISO` solo en las nuevas.
- 🟡 **`Student.program` de la ficha** es un dato heredado que se desfasa de la matrícula; Psicopedagogía y Alumnos ya muestran el de la matrícula más reciente, pero otras pantallas aún leen la ficha.
- 🟡 **Estados como texto libre** (`status: string`): Alumno, Contrato y Matrícula siguen sin tipo común. ✅ Ya se **derivan** al mostrar el estado de las cuotas y de los planes (`utils/planState.ts`) y el de los contratos de trabajo; el dato guardado puede quedar desfasado.
- 🟡 **Datos de ejemplo desfasados:** `age` fijo en personal, edades de alumnos estáticas; el programa «Teens» aún aparece como opción decorativa en el filtro de Matrículas.
- 🟡 **IDs** de varios estilos: `STF`, numéricos, `ALU-`, `MAT-AAAA-NNN`, `PAG-`, `CON-`. Los alumnos, titulares, personal y contratos nuevos ya usan correlativos (✅ antes eran aleatorios y podían repetirse).

## 5. Resuelto en esta tanda ✅

- **Actividades especiales:** quitar un alumno pide confirmación («SÍ, QUITAR» / «NO, MANTENER»).
- **Calendario único** (`DateInput`) en las 35 fechas del sistema: mes y año elegibles, días no disponibles tachados (p. ej. domingos), «Hoy», «Borrar», cuadrícula con números centrados y proporciones uniformes.
- **Personas:** paneles **Nuevo Alumno** y **Nuevo Titular** (y su edición) con las mismas reglas que el asistente de matrícula; el alumno puede vincularse a uno o varios titulares (el primero es el principal) o ser independiente; un titular se puede registrar desde el panel del alumno. Un alumno nuevo queda «Sin matrícula» hasta su primera matrícula. Se arreglaron: dirección fija «Av. Principal 123» en el perfil del titular, titulares fijos en el selector del alumno, programas «Lectura Veloz / Matemáticas» inexistentes, y la «próxima asesoría» que buscaba el estado antiguo «Confirmado».
- **Nuevo Trabajador:** sin correo institucional; campos obligatorios con asterisco, errores en cada campo (documento por tipo y sin repetir, mayoría de edad, celular de 9 dígitos que empieza con 9, correo con formato, dirección, hijos…); la edad se calcula y el código es correlativo.
- **Nuevo Contrato:** ahora guarda de verdad; sin Part time (todo es Full time); **sueldo neto estimado** calculado (bruto − aportes ONP / AFP por fondo; locación sin aportes); sin tipo de comisión; fecha de fin obligatoria según el tipo; sueldo mínimo vital; un solo contrato vigente por trabajador; **Cerrar contrato** con fecha y motivo.
- **Verificación:** la fecha de verificación es solo fecha (no hora), obligatoria y no futura.

- **Acciones con menú sin función (segunda tanda):** Solicitar caída, Ver plan, Editar datos (como «Corregir datos»), Ver detalles de matrícula (ficha única con 5 pestañas), Reversar pago (y sus demás botones) y Ver matrículas del alumno. Nueva pantalla *Sistema → Solicitudes pendientes*. El Dashboard muestra el número real de solicitudes pendientes.

- **Tercera tanda (todas las acciones con menú sin función):** Asignaciones (nueva, editar, cerrar), editar contrato, ver contratos, inactivar/reactivar personal, estado de cuenta del titular, Caja (detalle, comprobante, matrícula/cuota, reversa, lote de depósito), Caja chica con datos reales, exportaciones CSV/PDF/imagen, filtros, carga masiva de libros, tabla de sesiones, refinanciación corregida, Permisos (guardar/descartar), Mensajería, Dashboard real y fecha local en las pantallas que usaban UTC.

- **Cuarta tanda (reglas de negocio):** facturación explicada (§1 de `REGLAS_DE_NEGOCIO.md`); nota de crédito con correlativo; Caja y Caja chica completas (egreso con sede y medio, período, arqueo y cierre, reapertura, fondo y tope, reposición, reversa desde el pago); Sistema → Cierres y Reaperturas; reactivación, cambio de programa/nivel, traslado de sede y renovación; solicitudes con permisos (`can()`); contrato y ficha con plantilla; estados derivados de cuotas y planes; política de cobranza, mora, recordatorios y reporte de cartera.

- **Quinta tanda (verificación antes de la primera asesoría):** regla `utils/verificationGate.ts` (bloqueo de asistencia, urgencia por días y reprogramación sin las 24 horas); la agenda avisa y ofrece «Reprogramar (matrícula sin verificar)»; Verificación muestra la fecha de la primera asesoría, ordena por urgencia y pide una ventana de confirmación con casilla antes de descontar stock; el Dashboard indica cuántas esperan en 3 días o menos. Receta de ejemplo para Pre-Kids Nivel 1 (para ver el caso con los datos de prueba).

- **Sexta tanda (Psicopedagogía):** responsable y asistencia de actividades especiales; historial de reprogramaciones y cancelaciones con motivo y quién lo pidió (regla de las 24 h con la institución como excepción); métricas de sesión validadas por programa; recordatorios de asesorías, actividades y vigencia; reporte de Psicopedagogía; personal con actividades a su cargo no se inactiva ni pierde su última asignación; permisos nuevos en el catálogo. Datos de ejemplo: asignación de María Torres en Psicopedagogía y una actividad pasada con asistencia.
