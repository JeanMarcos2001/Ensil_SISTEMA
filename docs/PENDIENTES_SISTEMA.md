# Qué está inconcluso o sin lógica funcional (2026-10-22)

Recopilado mientras se hacían las correcciones de Personas, Contratos, Verificación y calendarios. Se basa en lo que **se revisó en el código**; lo marcado «no revisado a fondo» necesita una pasada propia.

Leyenda: 🔴 bloquea un flujo real · 🟠 incompleto (existe la pantalla, falta la lógica) · 🟡 mejora o deuda · ✅ resuelto en esta tanda

## 1. Base del sistema

| Tema | Estado |
|---|---|
| 🔴 **Persistencia** | Todo vive en memoria (`DataContext`). Al recargar se pierde todo. Supabase está creado (`lib/supabase.ts`, `hooks/useSupabaseQuery.ts`, `services/api.ts`) pero sin uso. Solo el borrador del asistente de matrícula usa `localStorage`. |
| 🔴 **Autenticación y permisos** | No hay login: el usuario es fijo («Superadmin»). Los permisos por rol se pueden editar en Organización → Permisos, pero **ninguna pantalla los consulta**: no se oculta ni bloquea nada. |
| 🟠 **Sede del encabezado** | El selector de sede del Topbar es provisional (solo afecta a unas pocas pantallas). Programación tiene su propio filtro de sede. |
| 🟠 **Archivos y evidencias** | Los vouchers, capturas y fotos solo guardan el **nombre** del archivo; no hay almacenamiento. El detalle del pago dice «Vista previa no disponible». |
| 🟡 **Auditoría** | No hay bitácora (quién cambió qué y cuándo). Solo algunos registros guardan `user`. La pantalla «Auditoría» no existe. |
| 🟡 **Enrutado por nombre** | `AppShell` decide la pantalla por el **nombre** del ítem, no por módulo + ítem. Por eso «Reportes → Matrículas / Caja / Verificación / Stock / Personal» muestran las pantallas **operativas**, no reportes. |

## 2. Menú y pantallas que no existen

- 🟠 **Dashboard:** «Alertas del sistema» y «Actividad reciente» muestran el mismo Dashboard. Los KPIs («1,248 matrículas», «$45,200 cartera», «$8,450 pagos del día», «24 verificaciones», «7 alertas de stock», «12 solicitudes»), la tabla «Resumen por Sedes» y el panel de vencimientos son **datos fijos de maqueta**. Solo la tarjeta «Matrículas por vencer» es real.
- 🔴 **Reportes:** no existe ningún reporte real. «Cartera», «Psicopedagogía» y «Auditoría» dicen «Vista en construcción».
- 🔴 **Sistema:** las 6 opciones (Auditoría, Solicitudes pendientes, Cierres, Reaperturas, Preferencias, Ayuda) están en construcción. «Solicitar caída» y las reversas hablan de solicitudes y permisos que no existen.
- 🟠 **Exportar:** hay botones «Exportar» en 12 pantallas (Alumnos, Titulares, Personal, Contratos, Asignaciones, Pagos, Planes, Caja, Kardex, Stock, Permisos, Cronogramas) **sin ninguna lógica**. También «Exportar a PDF / imagen» y «Previsualizar PDF» en Cronogramas. «Guardar vista» (Matrículas) es decorativo.
- 🟡 **Filtros decorativos:** unos 24 `<select>` y los botones de filtro (embudo) no filtran nada. Ejemplos: Matrículas (Programa, Estado), Contratos (Tipo, Estado), Personal (Cargo, Estado), Alumnos (Estado).

## 2. Acciones con menú pero sin función (`onClick` vacío)

| Pantalla | Acciones sin lógica |
|---|---|
| Matrículas | ✅ Ver detalle (ficha), Corregir datos, Ver plan y Solicitar caída ya funcionan (ver `PLAN_CICLO_MATRICULA.md`) |
| Planes y cartera | ✅ Ver detalles de matrícula (abre la ficha) |
| Pagos | ✅ Reversar pago, Ver evidencias, Ir a la matrícula y Ver plan ya funcionan. Falta el almacenamiento real de archivos |
| Caja y Caja chica | Ver detalle · Ver comprobante · Ver matrícula/cuota · **Reversar movimiento** |
| Alumnos | ✅ Ver matrículas (abre Matrículas filtrada por el alumno) |
| Titulares | Ver estado de cuenta |
| Personal | Ver contratos · **Inactivar** |
| Contratos | **Editar contrato** (✅ «Cerrar contrato» sí funciona ahora) |
| Asignaciones | **Nueva asignación no guarda** (el botón solo cierra), Editar y Cerrar asignación. 🔴 Importante: los responsables de Psicopedagogía y los verificadores salen de las asignaciones, y hoy no se pueden crear nuevas. |
| Logística | Varias confirmaciones en Envíos / Shipping con `onConfirm` vacío (no revisado a fondo). |

## 3. Reglas de negocio todavía sin lógica

- 🟠 **Facturación:** el comprobante se digita a mano (serie y número). No hay datos fiscales del cliente (RUC / razón social para facturas), ni emisión electrónica, ni control de correlativo por serie.
- 🟠 **Anulaciones y reversas:** ✅ el pago ya se reversa (queda anulado, repone la cuota y ajusta la caja). Siguen sin lógica **Reversar movimiento** en Caja y Caja chica, y la **nota de crédito** (solo se registra su número).
- 🟠 **Ciclo de vida de la matrícula:** ✅ solicitar y aprobar la caída, y corregir datos administrativos. Faltan: **reactivar** una matrícula caída, **cambio de programa / nivel**, **traslado de sede** y la **renovación** tras terminar la vigencia.
- 🟠 **Solicitudes:** solo existe el tipo «caída». Sin roles, cualquier usuario puede resolverlas.
- 🟠 **Contrato y ficha de la matrícula:** el asistente avisa «generar contrato y ficha» como pendiente de módulos inexistentes.
- 🟠 **Planes:** la refinanciación existe, pero no hay recordatorios, mora ni reportes de cartera.
- 🟠 **Personal:** inactivar a un trabajador no existe; no hay vínculo con usuarios del sistema; el contrato no se enlaza con planilla. El sueldo neto es una **estimación** (tasas AFP/ONP referenciales en `utils/payroll.ts`, sin renta de 5.ª categoría).
- 🟠 **Verificación:** no genera acta ni comprobante de entrega firmable.
- 🟠 **Psicopedagogía:**
  - Las actividades especiales no tienen **responsable** definido: se previó asignarlo desde una sesión, pero esa asignación aún no existe.
  - No hay **asistencia a actividades** (solo inscripción).
  - No hay recordatorios (WhatsApp / correo) de asesorías ni de vigencia por vencer.
  - Sin historial de reprogramaciones ni de quién canceló.
  - Las métricas de la sesión no tienen rangos ni validaciones (p. ej. comprensión 0–100).
  - Reportes de Psicopedagogía: ninguno.
- 🟡 **Alertas de vigencia:** solo se ven al abrir Matrículas / Dashboard / Programación; no hay notificación activa.

## 4. Modelo de datos: inconsistencias que conviene limpiar

- 🟡 **Contadores guardados en vez de calculados:** `Guardian.students`, `Guardian.enrollments` y `Guardian.balance` (texto como `'$800'`). Pueden desactualizarse; deberían derivarse de matrículas y planes.
- 🟡 **Nombres duplicados:** muchas relaciones se hacen por **nombre** (`Enrollment.student`, `Student.titular`, `Plan.titular`, `Schedule.student`) además de por id. Si alguien cambia de nombre, se desfasan (al editar un titular ya se actualiza el nombre en sus alumnos, pero no en planes ni matrículas).
- 🟡 **Fechas con desfase de zona horaria:** varias pantallas antiguas calculan «hoy» con `toISOString()` (UTC): por la noche en Perú muestran el día siguiente. Ya corregido en Psicopedagogía, vigencia, pagos de cuotas, caída y ficha; faltan Caja, Caja chica, Kardex, Logística y otras.
- 🟡 **Fechas en dos formatos:** matrículas antiguas con fecha de texto («24 Mar 2024») y `dateISO` solo en las nuevas.
- 🟡 **`Student.program` de la ficha** es un dato heredado que se desfasa de la matrícula; Psicopedagogía y Alumnos ya muestran el de la matrícula más reciente, pero otras pantallas aún leen la ficha.
- 🟡 **Estados como texto libre** (`status: string`): Alumno (Activo / Inactivo / Sin matrícula / Egresado), Contrato (Vigente / Vencido / Cesado), Matrícula (Activa / Caída), sin tipo común. La vigencia de contratos se **deriva** al mostrar (✅), pero el dato guardado puede quedar «Vigente» con fecha pasada.
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
