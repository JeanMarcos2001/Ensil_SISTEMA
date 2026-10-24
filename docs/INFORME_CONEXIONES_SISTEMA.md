# Informe: qué quedó funcional y qué sigue sin conectar en el sistema (2026-10-23)

Documento hecho **después** de dar función a las acciones con menú que estaban vacías. Se basa en lo que se revisó en el código y en lo que se probó en el navegador; cada hallazgo dice dónde está para poder comprobarlo.

Leyenda: 🔴 bloquea un flujo real · 🟠 incompleto o desconectado · 🟡 mejora o deuda · ✅ resuelto ahora

---

## 1. Qué se corrigió en esta tanda

### 1.1 Acciones con menú que no hacían nada (sección 2 de `PENDIENTES_SISTEMA.md`)

| Pantalla | Acción | Ahora |
|---|---|---|
| **Asignaciones** | Nueva asignación | ✅ Guarda de verdad (antes el botón solo cerraba). La primera de un trabajador es la principal; si se marca otra, la anterior pasa a secundaria (con aviso). No repite sede + área activas. |
| | Editar asignación | ✅ Solo las activas; el trabajador no se cambia. |
| | Cerrar asignación | ✅ Con fecha y motivo (no se borra). Si era la principal, la activa más antigua pasa a serlo. **Se bloquea** si es la última de Psicopedagogía y tiene asesorías futuras. |
| **Contratos** | Editar contrato | ✅ Solo vigentes; muestra qué cambia (antes → después), pide motivo y deja el historial en el contrato. El neto se recalcula solo. |
| **Personal** | Ver contratos / Ver asignaciones | ✅ Abren Contratos / Asignaciones ya filtradas por el trabajador. |
| | Inactivar / Reactivar | ✅ Baja con motivo y fecha; cierra sus asignaciones. **Se bloquea** si tiene contrato vigente o asesorías futuras a su nombre. |
| **Titulares** | Ver estado de cuenta | ✅ Total, cobrado, saldo, deuda vencida, cuotas pendientes y pagos de todos sus alumnos (derivado de planes y pagos). La lista ya no usa el saldo guardado. |
| **Caja** | Ver detalle · Ver comprobante | ✅ Datos, origen, vínculos, comprobante y evidencias (nombres de archivo). |
| | Ver matrícula / Ver cuota | ✅ Abren la ficha o el plan; si el movimiento no tiene matrícula, la opción no aparece. |
| | Reversar movimiento | ✅ Con motivo y constancia. Egresos manuales y ventas: se reversan aquí (la venta devuelve el artículo al stock con registro en el Kardex). Lo nacido de un **pago** se reversa **desde el pago** (el menú lleva allí). |
| | Crear lote de depósito | ✅ Antes era una ventana con datos de ejemplo. Ahora lleva a un banco los ingresos **en efectivo**, crea el egreso «Depósito bancario» y marca los ingresos como depositados (reversar el lote los libera). |
| **Caja chica** | Todo | ✅ La pantalla era una maqueta con tres filas fijas y montos escritos a mano. Ahora tiene datos reales: registrar ingreso/egreso (valida saldo), ver detalle/comprobante, reversar, KPIs del mes y saldo calculados. |
| **Logística** | Confirmaciones de Envíos / Shipping | ✅ Revisadas: las de Envíos sí ejecutan su acción; las de Shipping con `onConfirm` vacío son solo avisos de «Entendido» (no pierden nada). Sin cambios. |

### 1.2 Otros controles que tampoco hacían nada y se encontraron al revisar

| Dónde | Antes | Ahora |
|---|---|---|
| Botones **Exportar** (Alumnos, Titulares, Personal, Contratos, Asignaciones, Pagos, Planes, Caja, Caja chica, Stock, Kardex, Cronogramas) | Sin lógica | ✅ Descargan CSV (con tildes para Excel) de lo que se ve, respetando los filtros. Kardex: Excel (CSV) y PDF (abre la impresión → «Guardar como PDF»). Cronogramas: PDF, imagen PNG y CSV de todos. |
| Filtros de las tablas (≈24 `<select>` y el botón de embudo) | Decorativos | ✅ Filtran de verdad en Asignaciones, Contratos, Personal, Alumnos, Titulares, Matrículas, Pagos, Planes, Caja, Caja chica, Stock y Verificación. El embudo ahora es «Limpiar» (se apaga si no hay filtros). |
| Matrículas → **Guardar vista** | Decorativo | ✅ Guarda los filtros en este navegador y aparece «Aplicar vista guardada». |
| Dashboard | KPIs, sedes, vencimientos, actividad y accesos eran **datos de maqueta** | ✅ Todo derivado de los datos reales; los accesos y «Gestionar» navegan. |
| Alumnos → Ver / Iniciar seguimiento | Sin lógica | ✅ Abren el historial del alumno. |
| Stock → Ver Kardex completo | Sin lógica | ✅ Abre el Kardex filtrado por ese artículo. |
| Organización → **Permisos**: Guardar / Descartar | Las funciones existían pero los botones no estaban conectados | ✅ Conectados; solo se activan si hay cambios sin guardar. |
| Catálogo → **Carga masiva** de libros | «Guardar lote» cerraba sin guardar nada | ✅ Plantilla CSV descargable, lectura y validación completa del archivo (línea y motivo de cada error); se guarda todo o nada. Registra el precio de venta con vigencia. |
| Catálogo → «Configurar tabla de sesiones» | Sin lógica | ✅ Editor de entrenamientos por sesión; el guardado exige la tabla completa. |
| **Refinanciar cuota** | Duplicaba el saldo del plan, no guardaba el motivo ni validaba nada, usaba un formato de fecha distinto | ✅ Reescrito: traslada el saldo pendiente a una cuota nueva (el monto ya no se edita), valida, guarda el motivo, recalcula saldo/próxima cuota/estado y notifica. |
| Mensajería | Responder, Reenviar, Destacar, Archivar, Papelera, Adjuntar y buscar no hacían nada | ✅ Funcionan sobre los mensajes de la pantalla (ver 2.9: siguen sin conectarse al resto). |
| Notificaciones → «Ver todas» | Sin lógica | ✅ Ahora es «Marcar todas como leídas». |
| Sidebar → Ayuda | Sin lógica | ✅ Abre Sistema → Ayuda (pantalla «en construcción»). |
| Sidebar → Cerrar sesión | Sin lógica | ⚠️ Deshabilitado con explicación: no hay inicio de sesión (ver 2.3). |
| Fecha «de hoy» en UTC | Varias pantallas mostraban el día siguiente por la noche | ✅ Corregido en Caja, Tarifarios, Recetas, Transferencias, Envíos, Recepciones, Stock, Asistente de matrícula, Planes y utilidades de inventario. |

### 1.3 Controles que siguen «sin acción» a propósito

| Control | Motivo |
|---|---|
| «Reversar (requiere autorización)» en Pagos, Caja y Caja chica | Deshabilitado para quien no sea Superusuario (hoy solo existe ese usuario). |
| «Reprogramar / Cancelar (requiere 24 h)» en Programación | Deshabilitado por la regla de las 24 h. |
| Paginador «1 / Anterior / Siguiente» de Kardex y Ajustes | Esas tablas muestran todo; el paginador es decorativo (🟡). |
| «Cerrar sesión» | Ver arriba. |

### 1.4 Reglas nuevas (`scripts/check-operations.ts`, 75 casos)
Asignaciones, baja de personal, edición de contratos, origen y reversa de movimientos de caja, lotes de depósito, caja chica, estado de cuenta, refinanciación, carga masiva, CSV/impresión y cifras del Dashboard. Los once scripts `check-*` pasan, `tsc` sin errores y `vite build` compila. Probado en navegador: nueva asignación → edición con cambio de principal → cierre bloqueado; edición de contrato con constancia; estado de cuenta; reversa de un egreso y lote de depósito en Caja; egreso en Caja chica (validación y saldo); refinanciación; carga masiva con errores y sin ellos; Mensajería; Personal (baja bloqueada).

---

## 2. Qué sigue sin conectar a nivel general

### 2.1 🔴 Persistencia: todo vive en memoria
Al recargar la página se pierde todo (en las pruebas se vio: cada recarga devuelve los datos de ejemplo). Supabase está preparado (`lib/supabase.ts`, `hooks/useSupabaseQuery.ts`, `services/api.ts`) pero **ningún módulo lo usa**. Solo el borrador del asistente de matrícula usa `localStorage`; ahora también «Guardar vista». Es la desconexión de fondo: hasta que no exista, nada de lo demás es productivo.

### 2.2 🔴 El selector de sede del encabezado casi no se respeta
`currentBranchId` solo lo leen Logística (Stock, Kardex, Envíos, Transferencias, Recepciones), el asistente de matrícula, las notificaciones y el menú. **No filtran por la sede elegida**: Matrículas, Planes, Pagos, Caja, Caja chica, Verificación, Alumnos, Titulares, Personal, Contratos, Asignaciones y el Dashboard (Programación tiene su propio filtro). Una administradora de Piura ve la cartera y la caja de todas las sedes.
Datos que lo impiden hoy: `CashMovement.branchId` opcional (los movimientos de ejemplo no lo traen), Caja chica no tiene sede, los titulares no pertenecen a una sede.

### 2.3 🔴 Sin usuarios, roles ni permisos reales
- No hay inicio de sesión: el usuario es fijo («Superadmin», rol «Superusuario»).
- **Permisos**: el catálogo define 35 acciones (p. ej. «Aprobar caída», «Cerrar caja»), se pueden guardar por rol… y **ninguna pantalla las consulta**. Lo único que se comprueba está escrito a mano: `currentUser.role === 'Superusuario'` en Pagos, Caja, Caja chica y Recepciones, y tres opciones de Logística en el menú.
- **Usuarios** (Organización) es una lista aparte con 3 usuarios de ejemplo: no está vinculada a **Personal** (ni por trabajador, ni por correo), su rol es un texto suelto que no se valida contra **Roles**, «Superadmin» (el usuario actual) ni siquiera está en la lista, y **Roles.users** es un número escrito a mano (no se cuenta).
- Hay acciones nuevas que piden «autoridad» (aprobar caída, reversar pagos o movimientos) sin permiso propio en el catálogo. Quién aprueba qué sigue sin definirse.

### 2.4 🟠 Estados guardados que deberían calcularse
Se guardan como texto y se desfasan; solo algunos ya se derivan:

| Dato | Estado |
|---|---|
| Estado de cada **cuota** (`Pendiente` aunque haya vencido) y del **plan** (`Al día` con cuotas vencidas) | 🟠 En Planes se ve «Pendiente / Al día» con cuotas de 2024; el Dashboard y el estado de cuenta sí calculan la mora. Falta una única función `estado derivado` usada en todas partes. |
| `Enrollment.plan` (texto «Al día») | 🟠 Duplica a `Plan.status`. |
| `Guardian.students / enrollments / balance` | 🟠 Contadores guardados. Titulares ya los **calcula**, pero el asistente de matrícula (`utils/enrollment.ts`) aún los escribe. |
| `Student.status` y `Student.program` | 🟡 Se actualizan en eventos concretos (caída), no se derivan de las matrículas. |
| `Role.users` | 🟠 Ver 2.3. |
| Estado de contratos | 🟡 Ya se muestra derivado (`contractStatus`); el dato guardado puede quedar «Vigente» con fecha pasada. |

### 2.5 🟠 Relaciones por texto en vez de por código
Alumno ↔ matrícula/asesoría/pago por **nombre** (`Enrollment.student`, `Schedule.student`, `Payment.student`, `Student.titular`, `Plan.titular`), responsable de la asesoría (`Schedule.responsible`, un texto que se compara con «nombre + apellido»), sede en asignaciones, usuarios y matrículas por **nombre de sede**, y la referencia de los movimientos de caja es un texto libre (de ahí que «Ver matrícula» tenga que leerla con una expresión). Si alguien cambia un nombre se rompe el vínculo. En 19 lugares del código se compara por nombre.

### 2.6 🟠 Datos de ejemplo que no cuadran entre sí
Se nota apenas se mira de punta a punta:
- Los **pagos** de ejemplo (PAG-001…003) no tienen matrícula: el estado de cuenta de un titular muestra «cobrado USD 400» pero «ningún pago registrado».
- Los **movimientos de caja** de ejemplo tienen equivalente en USD en 0 y se refieren a planes/matrículas con texto.
- Las **cuotas** de ejemplo vencieron en 2024: el Dashboard muestra «Vencida hace 962 días» y 10 críticos.
- Los trabajadores de ejemplo («Juan Pérez», «María Torres») tienen asesorías futuras: por eso no se pueden inactivar ni cerrar su asignación de Psicopedagogía (comportamiento correcto, pero conviene un juego de datos coherente para las demostraciones).

### 2.7 🟠 Módulos casi vacíos
- **Reportes** (8 opciones): ninguno es un reporte. «Matrículas, Caja, Verificación, Stock, Personal» abren las **mismas pantallas operativas** (AppShell elige la pantalla por el *nombre* del ítem); «Cartera, Psicopedagogía, Auditoría» están «en construcción».
- **Sistema** (6 opciones): solo «Solicitudes pendientes» existe. Auditoría, Cierres, Reaperturas, Preferencias y Ayuda: «en construcción».
- **Dashboard**: «Alertas del sistema» y «Actividad reciente» abren el mismo Dashboard.
- **Cierres de caja** no existen: en el catálogo de permisos hay «Cerrar caja» / «Reabrir caja»; la tarjeta «Estado: Abierta» de Caja es fija.

### 2.8 🟠 Eventos que no se enlazan con otros módulos
| Evento | Qué falta |
|---|---|
| Caída de matrícula | No se devuelven los materiales ya entregados ni se avisa a Logística; el grupo promocional no se recalcula. |
| Reversa de un pago | La entrega de materiales (Verificación) no se revierte; la nota de crédito solo guarda su número. |
| Baja de un trabajador | Sus asesorías futuras no se reasignan solas (se bloquea y se pide hacerlo a mano); no hay vínculo con su usuario del sistema ni con planilla. |
| Contratos | No alimentan planilla ni vacaciones reales; el neto es una estimación. |
| Cuotas por vencer / vencidas, stock bajo, vigencia por vencer, contratos por vencer | **No generan notificaciones** (el Dashboard las cuenta, pero nadie recibe un aviso). Solo se notifican: transferencias/envíos en tránsito y, desde hoy, solicitudes de caída, reversas y refinanciaciones. |
| Depósitos de Caja | No hay conciliación con el banco ni vínculo con la «cuenta» como catálogo (las cuentas del lote están escritas en el código; la de dólares es una suposición). |
| Venta de artículo en Caja | Sí descuenta stock y se puede reversar; no genera comprobante ni se enlaza con el alumno. |

### 2.9 🟠 Mensajería es una isla
Los mensajes viven solo en la pantalla (ni siquiera en el contexto), los «avisos del sistema» son textos fijos, no hay usuarios destinatarios (se elige del Personal), y no se conecta con las notificaciones ni con WhatsApp/correo. Los recordatorios de asesorías, vigencia y pagos tampoco existen.

### 2.10 🟡 Archivos y documentos
Los vouchers, evidencias y adjuntos guardan **solo el nombre** del archivo (Pagos, Caja, Caja chica, Mensajería): «Ver comprobante» muestra los datos, no la imagen. No hay emisión de comprobantes (boleta/factura se digitan), ni datos fiscales del cliente, ni acta de verificación, ni generación de contrato o ficha de matrícula en PDF.

### 2.11 🟡 Auditoría solo parcial
Hay **constancia** (quién, cuándo, por qué) para: caída, corrección de datos de la matrícula, reversa de pagos, reversa de movimientos de caja y caja chica, modificación de contratos, cierre de asignaciones y bajas de personal. No existe una **bitácora general** ni la pantalla «Auditoría», y muchas acciones (alta de alumnos, cambios de precios, ajustes de stock) no dejan constancia de autor.

### 2.12 🟡 Otros
- Fechas en dos formatos (`15 Abr 2024` y ISO) en matrículas, cuotas y pagos antiguos.
- Ids de varios estilos (`STF`, números, `ALU-`, `MAT-AAAA-NNN`, `PAG-`, `CON-`, `CJ-…-aleatorio` en caja).
- El responsable de Psicopedagogía en actividades especiales no está definido.
- Caja chica: no hay límite por gasto ni por sede, ni arqueo; el fondo no tiene «monto asignado».
- Carga masiva: solo CSV (no .xlsx, para no depender de una librería).
- «Cerrar sesión» y «Ayuda» dependen de módulos que no existen.

---

## 3. Orden sugerido para conectar lo que falta

| # | Paso | Por qué primero | Esfuerzo |
|---|---|---|---|
| 1 | **Persistencia con Supabase** (empezar por maestros: personas, sedes, catálogo; luego matrículas/planes/pagos/caja) | Sin ella nada es productivo; además obliga a ordenar los ids y las relaciones | Alto |
| 2 | **Relaciones por código** (alumno, titular, sede, responsable) y **estados derivados** (cuota, plan, alumno) | Elimina los desfases y es el paso previo a persistir | Medio |
| 3 | **Usuarios ↔ Personal ↔ Roles** y **motor de permisos** (`can(accion)`) usado por todas las pantallas | Hoy cualquier acción «con autoridad» no tiene dueño | Alto |
| 4 | **Alcance por sede** (selector del encabezado + sede del usuario) en todas las pantallas operativas | Evita que cada sede vea lo de las demás | Medio |
| 5 | **Alertas**: cuotas vencidas, stock bajo, vigencia, contratos, solicitudes (centro de notificaciones real) | Convierte los números del Dashboard en avisos | Medio |
| 6 | **Reportes** reales (cartera, caja, matrículas, verificación, stock, psicopedagogía, personal) y **Auditoría/Cierres** | Cierra los dos módulos vacíos | Alto |
| 7 | **Archivos y comprobantes** (almacenamiento, emisión, PDF de contrato y ficha) | Vuelve utilizables vouchers y evidencias | Medio |
| 8 | Flujos pendientes de matrícula: reactivación, cambio de programa/nivel, traslado de sede, renovación; devolución dentro de la caída | Completan el ciclo de vida | Medio |

---

## 4. Decisiones tomadas en esta tanda (conviene confirmarlas)

1. **Inactivar personal** exige antes cerrar su contrato y reasignar sus asesorías futuras (el sistema lo bloquea y lo explica).
2. **Cerrar la última asignación de Psicopedagogía** con asesorías futuras también se bloquea.
3. **Los movimientos nacidos de un pago** no se reversan desde Caja: se reversa el pago (así el plan y el comprobante quedan coherentes).
4. **Lote de depósito**: solo ingresos en **efectivo**, de una sola caja (PEN o USD); no se puede reversar un ingreso ya depositado hasta reversar el lote. Las cuentas bancarias son las que ya mostraba la ventana (BCP, BBVA en soles) más una de dólares **supuesta** (BCP USD): hay que sustituirla por un catálogo real.
5. **Caja chica** se reconstruyó con datos reales: el egreso no puede superar el saldo; reversar un ingreso ya gastado se bloquea.
6. **Refinanciar** traslada **todo** el saldo de la cuota (no se condona ni se recarga); un monto distinto necesitaría su propio flujo (condonación / recargo).
7. **Exportar** genera CSV; los PDF salen del diálogo de impresión del navegador («Guardar como PDF»).
8. **Cerrar sesión** queda deshabilitado hasta que exista el inicio de sesión.
9. El **estado de cuenta** y el saldo de Titulares ya no usan el contador guardado: se calculan de los planes (lo anulado por una caída no cuenta como deuda).
