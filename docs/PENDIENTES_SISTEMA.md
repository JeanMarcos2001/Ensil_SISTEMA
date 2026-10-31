# Qué está inconcluso o sin lógica funcional (actualizado el 2026-10-30)

Recopilado en varias tandas de trabajo y **actualizado con la revisión general del 29 de octubre de 2026** (sección 0), hecha leyendo el código con conteos y búsquedas. Lo marcado «no revisado a fondo» necesita una pasada propia.

Leyenda: 🔴 bloquea un flujo real · 🟠 incompleto (existe la pantalla, falta la lógica) · 🟡 mejora o deuda · ✅ resuelto en esta tanda

> **Diagnóstico y plan actuales: sección 0 (revisión del 29 de octubre de 2026).**
>
> **Reglas de negocio de la última tanda (facturación, reversas, ciclo de la matrícula, solicitudes, contrato y ficha, cobranza): `REGLAS_DE_NEGOCIO.md`.**
>
> **Ver también `INFORME_CONEXIONES_SISTEMA.md` (2026-10-23):** qué quedó funcional en la última tanda y el análisis general de lo que sigue sin conectar (persistencia, sede, usuarios y permisos, estados derivados, reportes…).

## 0. Revisión general del 29 de octubre de 2026

Revisión hecha después de las tandas de reglas de negocio, verificación, Psicopedagogía, Personal y Planilla, menús de configuración y retiro de «Horarios de clases». **No cambió código**: es el diagnóstico y el plan. Lo afirmado aquí se comprobó en el código; lo marcado *(criterio)* es una recomendación de análisis.

### A. Flujos incompletos o sin lógica

| | Tema | Estado comprobado |
|---|---|---|
| 🔴 | **Sede activa** | Ver la fila de la sección 1: el selector solo afecta a 3 módulos; el resto muestra todas las sedes. Es el hueco funcional más visible. |
| 🔴 | **Permisos sin aplicar** | El catálogo tiene **67 acciones** y solo se consultan unas 40 (`PERM`). Ninguna de estas pantallas llama a `can()`: Matrículas, Alumnos, Titulares, Contratos, Asignaciones, Verificación, Usuarios, Roles, Tarifarios, Promociones, Programas, Stock, Envíos y Transferencias. Hoy no importa (solo existe el Superusuario), pero al activar roles no restringirían nada. |
| 🔴 | **Inicio de sesión y roles** | No existe. Usuarios y Roles son catálogos sin efecto; el «N usuarios asignados» de cada rol es un número **fijo**, no calculado. |
| 🔴 | **Persistencia** | Todo en memoria. El andamiaje de Supabase (`lib/supabase.ts`, `services/api.ts`, `hooks/useSupabaseQuery.ts`) **no lo importa nadie**: es código muerto hasta decidir la capa de datos. |
| 🟠 | **Centro de alertas** | «Alertas del sistema» y «Actividad reciente» (Dashboard) son dos ítems que abren el mismo Dashboard. |
| ✅ | **Reportes** | Los ocho reportes son reales (Matrículas, Cartera, Caja, Verificación, Stock, Psicopedagogía, Personal y Auditoría): filtros de período y sede, exportan CSV y PDF y respetan `reportView` / `reportExport`. Ver `REGLAS_DE_NEGOCIO.md` §10. Falta: cortes históricos (se calculan siempre al día). |
| 🟠 | **Planilla → Caja** | Pagar la planilla no genera el egreso ni cuenta en el cierre de caja. |
| 🟠 | **Contratos** | Sin renovación de contrato ni alerta de vencimiento (el Dashboard avisa cuotas y matrículas, no contratos). Sin liquidación de beneficios al cese. |
| 🟠 | **Vacaciones y ceses frente a la agenda** | Las vacaciones del contrato no se consultan en ningún lado: quien está de vacaciones sigue como responsable de asesorías y actividades. Cerrar un contrato tampoco revisa su agenda (solo se revisa al inactivar al trabajador). |
| 🟠 | **Ventas** | Hay un catálogo de «orígenes de leads» pero no hay prospectos ni seguimiento: no existe el flujo prospecto → matrícula. |
| 🟡 | **Facturación electrónica, envío automático de WhatsApp o correo, portal del apoderado** | Pendientes ya conocidos (ver abajo). |

### B. Inconsistencias en la lógica ya definida

1. 🟠 **Relaciones por nombre en vez de por id.** Las asignaciones y las cuentas de usuario guardan la **sede por nombre** (renombrar una sede rompe asignaciones, responsables de verificación y sedes de las cuentas); el responsable de una asesoría es un texto («Lic. María Torres») y los cruces se detectan comparando nombres normalizados; la matrícula guarda programa, nivel y sede como texto junto a sus ids.
2. 🟠 **Fechas duplicadas.** Algunas se guardan como texto para mostrar («24 Mar 2024») y otras en formato ISO; hay que convertir una en otra al calcular.
3. 🟡 **Datos derivables guardados:** `age` (edad) del alumno y del trabajador (se desactualiza sola) y los contadores del titular.
4. 🟡 **Identificadores frágiles.** Varios usan `Date.now()`; el del seguimiento de sesiones usa solo los últimos 4 dígitos y puede repetirse.
5. 🟡 **`DataContext.tsx` tiene casi 4 000 líneas:** cualquier cambio vuelve a pintar todo el sistema.
6. 🟡 **Pruebas sueltas:** los 16 scripts `check-*` no tienen ejecutor común ni integración continua (no corren solos al subir cambios).
7. 🟡 **Reloj local:** los plazos de 24 h y «hoy» usan la hora del navegador, no la de Lima.
8. 🟡 **Programa sin receta:** la primera asesoría no se bloquea por verificación (decisión acordada), pero nada avisa de la receta faltante fuera de la pantalla de Verificación.
9. 🟡 **Dos listas de roles:** el «rol del sistema» de la asignación (Administración, Psicopedagogía, Ventas, Sin acceso) y los roles de Organización son listas distintas, unidas solo por una sugerencia.

### C. Plan sugerido *(criterio)*

**Fase 1 — La base** (cada módulo nuevo se apoya en ella; migrarla cuesta más cada semana):
1. Cambiar nombres por ids (sede, responsable de asesoría, programa y nivel de la matrícula), con una función de migración de los datos de ejemplo.
2. Un solo formato de fecha (ISO) y la edad calculada.
3. Un selector central de datos por sede que usen **todas** las pantallas.
4. Un generador de ids único.
5. Integración continua (`tsc`, `vite build` y los 16 scripts en cada subida) y pasar los scripts a un ejecutor estándar (vitest).

**Fase 2 — Valor visible con lo que ya existe:**
6. ✅ **Auditoría única** (Sistema → Auditoría y Reportes → Auditoría, derivada de los registros que ya existen). Falta que alimente también la actividad reciente del Dashboard y que registre quién cambió precios, recetas y permisos.
7. **Centro de alertas**: stock bajo, verificación urgente, actividades sin responsable, contratos por vencer, mora, cierres pendientes y recetas faltantes.
8. Pagar planilla → egreso en Caja; renovación y alerta de vencimiento de contratos; que vacaciones y ceses afecten la agenda.

**Fase 3 — Lo que habilita producción:**
9. Elegir la capa de datos (Supabase u otra), separar `DataContext` por dominio y dejar un acceso a datos intercambiable.
10. Inicio de sesión y roles reales con `can()` en todas las pantallas (ocultar o deshabilitar lo que el rol no puede).

**Después:** prospectos (CRM), facturación electrónica, envío automático de mensajes y portal del apoderado.

### D. Mejoras a reglas ya definidas *(criterio)*

- **Planilla:** liquidación al cese (gratificación, CTS y vacaciones truncas), descuentos por tardanza desde la asistencia y archivo para PLAME / T-Registro.
- **Cobranza:** política distinta por sede o programa, y promesas de pago antes de escalar.
- **Vigencia:** definir qué pasa con las asesorías ya reservadas cuando termina la duración base del alumno.
- **Cuentas de usuario:** unificar el «rol del sistema» de la asignación con los roles de Organización.
- **Verificación:** avisar (sin bloquear) cuando una matrícula nueva cae en un programa sin receta.
- **Hora:** una sola función de «ahora» con zona horaria de Lima para todos los plazos.

## 1. Base del sistema

| Tema | Estado |
|---|---|
| 🔴 **Persistencia** | Todo vive en memoria (`DataContext`). Al recargar se pierde todo. Supabase está creado (`lib/supabase.ts`, `hooks/useSupabaseQuery.ts`, `services/api.ts`) pero sin uso. Solo el borrador del asistente de matrícula usa `localStorage`. |
| 🔴 **Autenticación y permisos** | Sigue sin haber inicio de sesión (usuario fijo «Superadmin»). **Avance:** existe un motor de permisos (`can()`) que ya consultan las acciones de control (solicitudes, reversas, cierres, documentos, cobranza): cuando haya roles basta marcar las casillas del rol. Falta: login, vincular Usuarios con Personal y Roles, y que el resto de pantallas también consulten los permisos. |
| 🟠 **Sede del encabezado** | El selector de sede del Topbar («Vista Global») solo lo respetan **Logística, Caja y el asistente de matrícula**. Matrículas, Pagos, Planes, Verificación, Alumnos, Titulares, Programación, Personal, Contratos y Planilla muestran todas las sedes. Programación tiene además su propio filtro. Ver sección 0 (B1). |
| 🟠 **Archivos y evidencias** | Los vouchers, capturas y fotos solo guardan el **nombre** del archivo; no hay almacenamiento. El detalle del pago dice «Vista previa no disponible». |
| ✅ **Auditoría** | Hay una línea de tiempo única (Sistema y Reportes) que reúne matrículas, pagos, cajas, planilla, contratos, agenda, cobranza y ajustes de stock. Sigue sin registrarse: quién cambia precios, recetas, tarifarios y permisos (cuando haya inicio de sesión). |
| 🟡 **Enrutado por nombre** | `AppShell` decide la pantalla por el **nombre** del ítem. Los reportes que comparten nombre con una pantalla operativa se resuelven antes con `activeModule === 'reportes'`; lo ideal es enrutar por módulo + ítem. |

## 2. Menú y pantallas que no existen

- ✅ **Dashboard:** los KPIs, el resumen por sedes, la caja por moneda, los vencimientos, la actividad y los accesos ya se calculan de los datos reales. Siguen pendientes «Alertas del sistema» y «Actividad reciente» (abren el mismo Dashboard).
- ✅ **Reportes:** los ocho son reales (ver la fila de la sección 1 y `REGLAS_DE_NEGOCIO.md` §10).
- 🟠 **Sistema:** ✅ **Solicitudes pendientes** (4 tipos), **Cierres** y **Reaperturas** ya funcionan. ✅ **Auditoría** ya funciona. Siguen «en construcción»: Preferencias y Ayuda.
- ✅ **Exportar:** los botones descargan CSV de lo que se ve (con filtros); Kardex y Cronogramas también PDF (impresión) e imagen. «Guardar vista» (Matrículas) guarda los filtros en el navegador.
- ✅ **Filtros:** los filtros de las tablas filtran de verdad y el botón de embudo ahora limpia los filtros. Queda pendiente que el selector de sede del encabezado se respete en las pantallas operativas (ver el informe).

## 3. Acciones con menú pero sin función (`onClick` vacío)

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

## 4. Reglas de negocio todavía sin lógica

- 🟠 **Facturación** (análisis completo en `REGLAS_DE_NEGOCIO.md` §1): ✅ hay notas de crédito con correlativo por serie (control interno). Falta: series y correlativos automáticos por sede, perfil fiscal del cliente (RUC, razón social, dirección), líneas del comprobante e IGV (a definir con contabilidad), **emisión electrónica con un proveedor OSE/PSE**, notas de débito, comunicación de baja y resumen diario, guías de remisión, entrega al cliente y reportes contables.
- ✅ **Anulaciones y reversas:** pagos, movimientos de Caja y de Caja chica se reversan con motivo y constancia; la **nota de crédito** se emite (correlativo BC01/FC01), se registra si ya existe, o se deja constancia de que no se entregó el comprobante; hay **cierres de caja y reaperturas**. Falta: nota de crédito con catálogo oficial de motivos y envío a SUNAT, y la nota de débito para la mora.
- ✅ **Ciclo de vida de la matrícula:** solicitar y aprobar la caída, **reactivar** (90 días), **cambio de programa/nivel**, **traslado de sede**, **renovación** (abre el asistente con los datos) y corregir datos administrativos. Falta: precio o promoción especial de renovación, devolver el dinero dentro de la propia aprobación de la caída (hoy es un paso aparte), recalcular el grupo promocional al caer o cambiar de programa, y reprogramar solas las asesorías canceladas por un traslado.
- ✅ **Solicitudes:** caída, reactivación, cambio de programa y traslado, todas con permisos del catálogo (`can()`). Falta decidir quién aprueba cada tipo y pasar `allowSelfApproval` a `false` cuando existan los roles; hoy cualquiera con el permiso (el Superusuario) puede resolver lo que pidió.
- ✅ **Contrato y ficha de la matrícula:** se generan con los datos de la matrícula (numeración, versión, firma, impresión) y la plantilla del contrato se edita en Configuración. Falta: **revisión del texto por el área legal** (hoy es un modelo), guardar los PDF y los escaneos firmados (almacenamiento de archivos), firma electrónica, y decidir si se exige el contrato firmado para verificar o cobrar.
- ✅ **Planes:** el estado de cuotas y planes se calcula solo; hay política de cobranza, **mora** (calculada y cobrable como cuota), **recordatorios** (texto listo, WhatsApp, registro de enviados u omitidos) y el **reporte de cartera**. Falta: envío automático por WhatsApp o correo (hoy se prepara y se registra), nota de débito por mora, escalamiento a cobranza externa o promesas de pago, y la evolución histórica de la cartera (no se guardan cortes mensuales).
- ✅ **Personal** (flujo completo en `REGLAS_DE_NEGOCIO.md` §9): la cuenta de acceso nace de la ficha (se crea desde Personal o desde Usuarios, hereda nombre, documento, teléfono y sedes de sus asignaciones, y se desactiva sola al inactivar al trabajador); el contrato se enlaza con una **Planilla** mensual (días trabajados, asignación familiar, pensión, **renta de 5.ª categoría**, gratificaciones, CTS, EsSalud, ajustes con motivo, cierre como foto, pago y boleta); el neto del contrato sale del mismo motor. Falta: **liquidación de beneficios al cese** (gratificación, CTS y vacaciones truncas), PLAME / T-Registro, ingresos de otros empleadores y la deducción adicional de 3 UIT en la renta, que el pago de la planilla genere su egreso en Caja o bancos, y pantalla para actualizar las tasas (AFP/ONP, UIT, RMV: hoy están en `utils/payrollEngine.ts`).
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

## 5. Modelo de datos: inconsistencias que conviene limpiar ✅

Resuelto el 2026-10-30. La lógica completa (qué se guarda, qué se calcula y por qué) está en `REGLAS_DE_NEGOCIO.md` §11.

- ✅ **Contadores guardados en vez de calculados:** `Guardian.students`, `enrollments` y `balance` ya no existen; la lista de titulares y su estado de cuenta los derivan de matrículas, planes y pagos (ya lo hacían las pantallas; se quitó el dato muerto que aún se escribía).
- ✅ **Nombres duplicados:** las relaciones son solo por id. `Student.titular` y `Plan.titular` se eliminaron (se derivan: `utils/identity.ts`). `Enrollment.student`, `Schedule.student` y `Enrollment.sede / program / level` quedan como *copias de visualización* que se corrigen en una sola puerta (`syncStudentName`, `syncCatalogLabels`) al renombrar al alumno, la sede, el programa o el nivel. Los comprobantes ya emitidos (`Payment.student`) conservan el nombre de ese día a propósito. Renombrar una sede corrige también asignaciones y cuentas. `studentId`, `programId` y `branchId` son obligatorios.
- ✅ **Fechas con desfase de zona horaria:** ya resuelto (`todayLocalISO`).
- ✅ **Fechas en dos formatos:** todo se guarda en ISO (`Enrollment.dateISO`, `Installment.dueDateISO`, `Payment.date`, fecha de cada cobro); el texto («24 Mar 2024») se arma al mostrar con `formatDisplayDate`. Desaparecieron `Enrollment.date`, `Installment.dueDate`, `Plan.next` y los conversores de texto a ISO.
- ✅ **`Student.program` de la ficha:** eliminado; el programa y el nivel salen de la matrícula más reciente (`studentProgramOf`). Un alumno sin matrícula ya no tiene programa que mostrar.
- ✅ **Estados como texto libre:** catálogo tipado en `utils/statuses.ts` (matrícula, contrato, plan, cuota, pago). El estado del alumno ya no se guarda: se deriva (Activo / Inactivo / Sin matrícula). El saldo y el estado del plan solo los escribe `recomputePlan`.
- ✅ **Datos de ejemplo desfasados:** reescritos en `src/data/seedPeople.ts` y `seedCatalog.ts`, con fechas relativas a hoy y armados con las mismas funciones del flujo real (`buildPaymentRecord`, `recomputePlan`). Sin `age` guardada (se calcula de la fecha de nacimiento). «Teens» ya no aparece como opción (solo queda su clave inerte en `sessionMetrics.ts`, que no tiene efecto).
- ✅ **IDs de varios estilos:** una política (`PREFIJO-NNN`, registro `ID_PREFIX`) y un solo generador (`nextSequentialId` / `createIdAllocator`). Se reemplazaron los ids por `Date.now()` y `Math.random()` (caja, kardex, stock, precios, ajustes, correcciones, seguimientos, incidencias, notificaciones, recetas, envíos, empresas, roles…). Titulares `TIT-`, personal `STF-`, asesorías `SES-`, seguimientos `TRK-`. Los catálogos de configuración conservan su número correlativo.
- ✅ **Eliminar con historial:** un alumno o titular con matrículas, asesorías o seguimiento ya no se puede eliminar.
- ✅ **Integridad verificable:** `utils/dataIntegrity.ts` + `scripts/check-integrity.ts` comprueban vínculos, copias de nombre, saldos, cobros ↔ pagos ↔ caja, fechas e ids sobre los datos de ejemplo.

## 6. Resuelto en esta tanda ✅

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

- **Séptima tanda (Personal ↔ Usuarios ↔ Planilla):** `utils/staffAccess.ts` (cuenta vinculada a la ficha, sedes desde las asignaciones, desactivación automática y sincronía de datos), `utils/payrollEngine.ts` (motor: prorrateo, asignación familiar, pensión, renta de 5.ª y 4.ª, gratificación, CTS, EsSalud), `utils/payrollRun.ts` (generar, ajustar, cerrar, pagar, reabrir y boleta), pantalla **Personas → Planilla**, «Crear usuario de acceso» en Personal, Usuarios con vínculo (y su botón «Desactivar», que antes no hacía nada), cierre de contrato que respeta las planillas cerradas, permisos nuevos de planilla.

- **Octava tanda (menús de configuración):** el módulo del menú «Configuración» pasa a llamarse **Oferta comercial** (programas, niveles, tipos de pago, tarifarios, promociones y recetas; las direcciones no cambian). El botón inferior sigue siendo **Configuración**, ahora agrupado por área en secciones desplegables que recuerdan la última usada (Comercial, Documentos, Cobranza, Psicopedagogía, Logística), sin el título técnico «CRUDS Básicos». «Ayuda» se abre solo desde el botón inferior (ya no se repite en el menú Sistema). La ruta de navegación mostraba «Mensajeria» y «Configuracion» sin tilde: ahora usa el nombre del menú.

- **Novena tanda (retiro de «Horarios de clases»):** ENSIL no tiene clases grupales de horario fijo, así que se retiró el catálogo (Configuración → Comercial), el campo «horario» del alumno, el de Corregir datos y el del asistente. El traslado de sede pide, en su lugar, la **nueva primera asesoría** en la sede destino (selector de bloques vacíos compartido: `components/enrollment/FirstSessionPicker.tsx`) cuando cancela la actual. El contrato y la ficha muestran la primera asesoría.

- **Décima tanda (revisión general, 2026-10-29):** diagnóstico de flujos incompletos, inconsistencias de datos y plan por fases (sección 0). Sin cambios de código.

- **Undécima tanda (Reportes, 2026-10-30):** los seis reportes que faltaban (`reportEnrollments`, `reportCash`, `reportStock`, `reportStaff` y `audit` en `utils`, con `reportCommon` y `components/reports/ReportParts`); Sistema → Auditoría y Reportes → Auditoría comparten la misma línea de tiempo; enrutado de Reportes antes que las pantallas operativas; permisos `reportView` y `reportExport`; `check-reports.ts` (89 casos). Los movimientos de caja de ejemplo ahora tienen sede. Pendiente: cortes históricos, que Cartera y Psicopedagogía usen las piezas compartidas y unificar sus permisos con `reportView`.

- **Duodécima tanda (modelo de datos, 2026-10-30):** se limpió la sección 5 completa: datos derivados que ya no se guardan (titular, estado, programa y edad del alumno; contadores del titular; próxima cuota del plan), relaciones por id, fechas solo ISO, estados tipados, ids con una sola política, datos de ejemplo coherentes y verificados (`check-integrity.ts`, 17 scripts en total). Quedan de la sección B: pasar a ids las asignaciones y las cuentas de usuario (hoy guardan la sede por nombre, aunque ya se corrigen al renombrar), el responsable de la asesoría (texto), y las pendientes de la fase 1 (selector central de sede, integración continua).
