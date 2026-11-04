# Plan: roles, constructor de roles y modelo de datos (actualizado 2026-10-31)

Objetivo: que **cada función del sistema esté declarada una sola vez, con sus conexiones**, y que la Administración general arme
roles y usuarios marcando funciones, con la certeza de que el sistema sabe qué necesita cada una. Después, el modelo de datos
definitivo y las sesiones.

> Lo marcado **(medido)** salió de recorrer el código. Lo marcado **(decidido)** lo confirmó el negocio. Lo marcado **(propuesta)** se puede ajustar.
> El selector de sede del encabezado es temporal (solo pruebas): la sede de cada persona saldrá de su sesión y de sus asignaciones.

---

## 1. Cómo opera el negocio (decidido)

- Una empresa con **varias filiales (sedes)**. Cada trabajador pertenece a una sede, con su especialidad y su contrato.
- **Un solo almacén para toda la empresa, en Los Olivos**, que abastece a todas las filiales. Los Olivos también es una sede con alumnos.
- Cada filial tiene **2 o 3 personas** y normalmente **una laptop**. Secretaría y matrícula son lo mismo. No se puede estar cerrando y abriendo sesión.
- **Administrador de sede:** matrícula, ventas, caja, cobranza, verificación y entrega de materiales, recepción de envíos y **programación de asesorías y cronogramas** (el alumno fija su horario en secretaría).
- **Psicopedagogía:** seguimiento del alumno, **asistencia** y avance en clase. No ve dinero.
- **Almacén:** catálogo, stock, envíos, transferencias, kardex y ajustes. Al despachar, la sede destino recibe un **aviso** y lo recibe su administrador.
- **Cuentas por persona** con cambio rápido de usuario por PIN (no una cuenta compartida por sede): conserva la velocidad y la trazabilidad de la caja. Límite de cuentas por sede configurable en el rol.
- Las asesorías y la asistencia se reparten por **permiso**, no por menú: la pantalla «Programación» la comparten el administrador (agendar, reprogramar) y Psicopedagogía (marcar asistencia, registrar sesión).

## 2. Los 6 roles de partida (decidido) — son plantillas, no código

Se cargan como datos de ejemplo usando el mismo constructor y se pueden editar o duplicar.

| Rol | Cuántos | Qué hace |
|---|---|---|
| **Administrador de sede** | 1 a 3 cuentas por sede | Matrículas, alumnos y titulares, asesorías y cronogramas, recordatorios, pagos, caja, cobranza, verificación y materiales, recepción de envíos, reportes de su sede |
| **Psicopedagogía** | por sede | Historial y seguimiento, asistencia, reporte de Psicopedagogía; agenda en lectura; sin dinero |
| **Almacén central** | 1 a 3 cuentas (Los Olivos) | Catálogo, stock de todas las sedes, envíos, transferencias, kardex, ajustes, reporte de stock |
| **Administración general** | central | Aprueba caídas, reactivaciones, cambios y traslados; reaperturas y devoluciones; oferta comercial; personal, contratos y planilla; todos los reportes y la auditoría |
| **Contabilidad** | opcional | Lectura y exportación de caja, cartera y planilla |
| **Superusuario** | sistemas | Roles, usuarios y configuración técnica |

Separación de funciones: las **reversas con devolución de dinero** y la **reapertura de cierres** pasan a Administración general, porque la sede reúne matrícula, caja y cobranza en una sola sesión.
Quién ve sueldos: **solo** quien tenga el permiso `ver remuneración` (hoy la Auditoría y el Reporte de Personal los dejan ver a cualquiera con `reportView`; se corrige en las guardas).

## 3. Registro único de funciones (la base de todo) ✅

Hecho: `src/utils/capabilityRegistry.ts` (datos) y `src/utils/capabilities.ts` (reglas). Cuadro completo generado en `docs/CATALOGO_DE_FUNCIONES.md`; reglas de negocio en `REGLAS_DE_NEGOCIO.md` §12.

Hoy el catálogo de permisos está escrito a mano en `pages/organization/Permissions.tsx` (67 acciones, 41 consultadas) y cada pantalla decide por su cuenta.
Cada función se declara **una sola vez** y el catálogo de permisos, el constructor y los avisos se derivan de ahí:

| Campo | Ejemplo: «Realizar envío» |
|---|---|
| Identificador, nombre, módulo, tipo (ver / crear / editar / aprobar…) | `shipment:send` · Realizar envío · Logística |
| **Requiere** (mismo usuario) | `stock:view` |
| **Contraparte** (otro usuario) | alguien con `shipment:receive` en la sede destino |
| Lee / escribe | lee stock y sedes; escribe envío y kardex |
| Avisa | «Envío despachado» → quien recibe en la sede destino |
| Alcance | una sede o todas |
| Incompatibilidades | p. ej. cobrar + reversar con devolución + cerrar caja en el mismo rol |

Tres tipos de conexión:
1. **Dependencia interna:** al marcar «Realizar envío», se marca sola «Ver stock» y no se puede quitar.
2. **Contraparte:** no impide crear el rol; decide si la función aparece al usarla. Sin receptor en la sede destino, el botón «Enviar» no aparece y se explica por qué.
3. **Datos:** informativa; alimenta el grafo de qué lee y escribe cada función.

Reglas puras (con su `check-capabilities.ts`): cierre de dependencias de un rol, advertencias de incompatibilidad, disponibilidad de una función según el estado, y verificación de que toda pantalla usa permisos declarados y que toda dependencia existe.

## 4. Constructor de roles (solo Administración general / Superusuario)

- **Panel A · Mapa de conexiones:** el cuadro de referencia en solo lectura. Filtro por módulo; al tocar una función resalta dependencias, contrapartes, datos y avisos. Es el mismo registro, no una copia.
- **Panel B · Editor de rol:** se marcan funciones; semáforo por contraparte («Envío: sin receptor en Piura»), advertencias de incompatibilidad (piden motivo para guardar) y vista previa del menú que verá ese rol.
- **Panel C · Usuarios:** se crean personas con rol y sede, con el límite por sede definido en el rol.
- Las conexiones **no se dibujan a mano**: se eligen funciones y el grafo traza las conexiones existentes. Así nadie puede crear un flujo que rompa las reglas (cobrar sin caja, entregar sin verificar).
- Mientras no haya persistencia, roles y usuarios se guardan de forma provisional en el navegador (**paso 6** ✅: `utils/accessStore.ts`; el resto de los datos sigue en memoria hasta el paso 10).
- **Hecho en el paso 5:** el panel A y el B viven en Organización → Permisos (dos pestañas); el panel C es Organización → Usuarios (con el rol y el límite validados). Las plantillas son datos en `utils/roleTemplates.ts`.
- Los permisos en pantalla ocultan y bloquean la interfaz; la seguridad real llega con el servidor (sesiones reales).

## 5. Avisos con destinatario ✅ (paso 3, 2026-11-02)

Los avisos se dirigen por **función y sede**, no por nombre de rol; un usuario nuevo con «Confirmar la recepción de un envío» en Piura empieza a ver los envíos que iban hacia Piura. El aviso guarda qué pasó y dónde; **quién lo recibe se calcula al mostrar** (`utils/notifications.ts`). Hay 22 avisos (cuadro completo en `CATALOGO_DE_FUNCIONES.md`, con sus varios destinatarios) y una función de **supervisión** que recibe copia de lo que se controla (reversas, cajas reabiertas, diferencias de recepción, cambios de permisos). Si nadie puede recibir un aviso, llega a quien tenga la función de **respaldo**. Cuatro **alertas por regla** (cuotas vencidas, primeras asesorías sin materiales, contratos por vencer, stock bajo el mínimo) se calculan sin guardarse. Todo se ve en la **campana** del encabezado. Detalle y reglas: `REGLAS_DE_NEGOCIO.md` §13.

### Decisiones del 2026-11-02 (hallazgos del paso 2)

| Hallazgo | Decisión | Por qué |
|---|---|---|
| `setRecipes` (la pantalla escribía el estado directo; duplicar creaba una copia activa que chocaba con la original) | Tres acciones con validación y permiso (`saveRecipe`, `duplicateRecipe`, `setRecipeStatus`); las reglas pasan a `utils/recipes.ts`; la copia nace **inactiva** y activarla comprueba el solape | La verificación no puede dudar qué receta entregar |
| `updateStock` (varias pantallas la llamaban directo) | Deja de existir para las pantallas: **venta en caja** (stock + ingreso en una operación), **entrega de materiales** (todo o nada) e **ingreso de stock** (con documento) son acciones con función propia | Cada movimiento de stock responde a una función que se puede dar o quitar a un rol; ninguno queda sin kardex |
| Envíos y Transferencias entre sedes | Se **conservan las dos**, con reglas de ruta: hay un **único almacén central** (Los Olivos, por dato); el envío sale siempre de él; la transferencia tiene siempre al almacén en un extremo; **entre dos filiales no hay transferencia directa** | Es la lógica del negocio (todo pasa por el almacén) sin perder la solicitud con aprobación. Se corrigió que los datos de ejemplo trataran a Piura como almacén |
| Reportes | Un permiso base y **uno por reporte** (más uno para Auditoría) | Contabilidad ve Caja sin ver Personal |
| Sueldos | Función propia «Ver remuneraciones»; **sin ella se ocultan los importes** en Contratos, Personal, reporte de personal y Auditoría | Solo quien administra personal ve lo que gana cada quien |

### Revisión de contrapartes y combinaciones (2026-11-02)
- **Contrapartes:** ahora una función puede tener varias. Nuevas (recomendadas): matricular → quien verifique y quien agende; cobrar → quien cierre la caja; verificar → quien reciba la reposición; preparar un envío → quien lo despache; pedir una transferencia → quien la apruebe; crear un contrato → quien arme la planilla; generar la planilla → quien la cierre; cerrarla → quien la pague. Obligatorias (siguen siendo solo las de despacho): quien recibe en la sede destino.
- **Requisitos nuevos:** aprobar una solicitud exige ver «Solicitudes pendientes»; crear un usuario exige ver «Personal».
- **Combinaciones:** de 9 a 15 (más por área). Se reemplazó «despachar + recibir + ajustar stock» (que describía al almacén normal) por «despachar + recibir». Se probó que un administrador de sede y un almacenero típicos no reciben ninguna advertencia.

## 6. Estado del menú (medido)

| Hecho | Dato |
|---|---|
| Menú | 9 módulos; 48 ítems con pantalla propia tras la limpieza del 2026-10-31 |
| ✅ Dashboard | Un solo ítem directo («Resumen general»); «Alertas del sistema» y «Actividad reciente» se retiraron (eran copias) |
| ✅ Auditoría | Solo en Sistema; se retiró de Reportes (quedan 7 reportes) |
| «Ayuda» | Vive en el botón inferior (el ítem de Sistema ya no se muestra) |
| «Preferencias» | Sigue sin pantalla; se decide más adelante |
| «Cierres» y «Reaperturas» | **No** duplican a Caja: Cierres es el historial y la reapertura; Caja y Caja chica solo traen el botón de cerrar. Reaperturas es un subconjunto de Cierres: se puede fundir luego |
| «Programación», «Cronogramas», «Recordatorios» | Se quedan en su sitio: la pantalla se comparte por permiso (agendar vs. marcar asistencia) |
| Catálogo de permisos | 67 acciones en 12 funcionalidades; 41 se consultan con `can()` |
| Archivos de pantalla que modifican datos **sin `can()`** | **35** |
| Cuentas | `User.role`, `branch` y `additionalBranches` guardan nombres, no ids; `Role.users` es un número fijo; 3 de 4 cuentas de ejemplo no nacen de una ficha |

## 7. Paso a paso

| # | Paso | Resultado | Estado |
|---|---|---|---|
| 1 | **Limpiar el menú** (Dashboard directo, Auditoría única) | Menú sin copias | ✅ 2026-10-31 |
| 2 | **Registro único de funciones** + catálogo de permisos derivado + `check-capabilities.ts` | 52 funcionalidades y 185 funciones con sus conexiones; cuadro en `CATALOGO_DE_FUNCIONES.md` (**a validar contigo**) | ✅ 2026-10-31 |
| 3 | **Avisos dirigidos**: catálogo de eventos, resolutor de destinatarios, bandeja y campana | 22 avisos con destinatario por función y sede, 4 alertas por regla y campana; más las decisiones de los hallazgos del paso 2 | ✅ 2026-11-02 |
| 4 | **Guardas en las pantallas y en las acciones**: toda acción pide su función (`guardActions`), cada botón responde al rol y a su contraparte, menú y rutas por función | Cada botón responde al rol y a su contraparte; ninguna pantalla salta la validación (2026-11-02, ver `REGLAS_DE_NEGOCIO.md` §17) | ✅ 2026-11-02 |
| 5 | **Constructor de roles** (paneles A, B y C) con las 6 plantillas | Administración arma roles y usuarios: funciones con dependencias, motivos para lo que se debe separar, semáforo de contrapartes, menú que verá, límite de cuentas por sede (2026-11-02, ver `REGLAS_DE_NEGOCIO.md` §18) | ✅ 2026-11-02 |
| 6 | **Persistencia provisional** de roles y usuarios en el navegador | Lo armado no se pierde al recargar; lo guardado se valida y depura al arrancar; «Volver a los de ejemplo» (2026-11-03, ver `REGLAS_DE_NEGOCIO.md` §19) | ✅ 2026-11-03 |
| 7 | **Usuario activo con cambio rápido por PIN**; menú y Dashboard por rol; reemplaza al selector de sede | Cada persona trabaja con su cuenta (PIN de 4 a 6 números, bloqueo a los 5 fallos), ve el menú y el Dashboard de su rol y la sede que alcanza (2026-11-03, ver `REGLAS_DE_NEGOCIO.md` §20). **Falta el filtro por sede en las pantallas que hoy muestran todas** | ✅ 2026-11-03 |
| 8 | **Pruebas por rol**: script que recorre cada plantilla + prueba en el navegador | Evidencia de qué ve y qué puede cada rol: `check-role-matrix.ts` + `docs/PRUEBAS_POR_ROL.md` (generado). Encontró y corrigió una fuga de dinero en Titulares; los tres puntos por confirmar se resolvieron el 2026-11-03 (ver `REGLAS_DE_NEGOCIO.md` §21 y §23) | ✅ 2026-11-03 |
| 9 | **Reglas pendientes** (Planilla → Caja, contratos, vacaciones → agenda), en paralelo desde el paso 4 | **Planilla → Caja descartada** (el sistema no registra pagos al personal); **renovación de contratos** y **vacaciones y ceses frente a la agenda** hechas (2026-11-03, ver `REGLAS_DE_NEGOCIO.md` §22) | ✅ 2026-11-03 |
| 10 | **Esquema de base de datos** (Supabase), partir `DataContext`, sesiones reales y seguridad en servidor | Datos persistentes y permisos exigidos por el servidor. **Aquí va el filtro por sede** de cada pantalla: lo aplica la base con `sede_id` y reglas por sede, no cada pantalla (decidido el 2026-11-03: no se construye sobre datos de ejemplo) | |

Los pasos 2 y 3 son la base: sin ellos el constructor trabajaría con datos inventados. Los pasos 1 a 8 no cambian ninguna regla de negocio.

## 8. Modelo de datos hacia base relacional **(propuesta)**

### 8.1 Decisiones de partida (a confirmar)
- **Claves:** cada tabla con `id uuid` interno **y** `codigo` legible (`MAT-2026-001`, `ALU-001`…) único, el que ve el usuario. El código ya existe y se conserva.
- **Dinero:** `numeric(12,2)`; la moneda y el tipo de cambio se guardan en cada movimiento (hoy ya es así). Comercial en USD; planilla y caja chica en PEN.
- **Fechas:** `date` para fechas de calendario y `timestamptz` para instantes. Ya son ISO.
- **Borrado:** lógico (`eliminado_en`) en todo lo que tenga historial; nunca físico.
- **Auditoría:** hoy se *deriva* de los registros de cada módulo. Con usuarios reales conviene una tabla `auditoria` (quién, cuándo, qué, antes y después).
- **Alcance por sede:** toda tabla operativa lleva `sede_id`; la base aplica el filtro según las sedes del usuario, no cada pantalla.
- **Copias de nombre:** se eliminan en la base (se une por id); solo quedan las *constancias* (nombre en comprobante, contrato y ficha emitidos).
- **Estados derivados** (alumno, cuota, plan, vigencia): siguen calculándose; en base solo se guardan los hechos.
- **Roles y funciones:** `rol`, `rol_funcion` (una fila por función marcada), `usuario`, `usuario_sede`, `notificacion` con `destinatario_usuario_id`. El **registro de funciones** vive en el código (versionado), no en la base.

### 8.2 Dominios y entidades

| Dominio | Tablas |
|---|---|
| Organización | `empresa`, `sede`, `rol`, `rol_funcion`, `usuario`, `usuario_sede` |
| Personas | `titular`, `alumno`, `alumno_titular`, `personal`, `contrato`, `contrato_revision`, `asignacion` |
| Oferta comercial | `programa`, `nivel`, `tipo_pago`, `tarifario`, `tarifario_cuota`, `promocion`, `receta`, `receta_item`, `origen_lead` |
| Matrícula y cobranza | `matricula`, `matricula_correccion`, `plan`, `cuota`, `cobro_cuota`, `grupo_promocional`, `solicitud_caida`, `solicitud_cambio`, `documento_matricula` |
| Dinero | `pago`, `pago_parte`, `comprobante`, `nota_credito`, `movimiento_caja`, `deposito`, `cierre_caja`, `movimiento_caja_chica`, `politica_cobranza`, `recordatorio_cobro` |
| Logística | `articulo`, `articulo_composicion`, `articulo_precio`, `stock`, `kardex`, `transferencia`, `transferencia_caja`, `envio`, `envio_caja`, `courier`, `metodo_envio`, `ajuste`, `incidencia_recepcion` |
| Psicopedagogía | `asesoria`, `sesion`, `cronograma_mensual`, `actividad`, `actividad_inscrito`, `evento_psi`, `politica_recordatorio_psi`, `recordatorio_psi`, `config_cupos` |
| Planilla | `planilla`, `planilla_linea`, `planilla_ajuste`, `planilla_evento` |
| Sistema | `auditoria`, `notificacion`, `plantilla_contrato`, `config_general` |

### 8.3 Relaciones que sostienen el flujo (ya probadas con `check-integrity.ts`)
`alumno ⟷ titular` (N:M, uno principal) · `matricula → alumno, programa, nivel, sede` · `plan → matricula` (1:1) · `cuota → plan` ·
`cobro_cuota → cuota, pago` · `pago → comprobante` · `movimiento_caja → pago, sede` · `asesoria → alumno, matricula (primera), sede` ·
`sesion → asesoria` · `contrato/asignacion → personal` · `usuario → personal, rol` · `rol_funcion → rol`.

### 8.4 Decisiones pendientes antes del DDL
1. **Una sola empresa** (supuesto vigente): ¿se confirma? Define si `empresa_id` filtra.
2. ¿Los archivos (contrato firmado, evidencias de pago, adjuntos de envío) van a almacenamiento de archivos? Hoy solo se guarda el nombre.
3. ¿Historial de precios y tarifas consultable por fecha? Define si `tarifario` se versiona.
4. ¿Cortes históricos de cartera? Si sí, hace falta una tabla de «fotos» periódicas.

## 9. Supuestos vigentes (corregir si alguno no es así)
- La psicopedagoga marca asistencia; el administrador de sede solo la corrige, con motivo.
- El administrador de sede verifica y entrega materiales.
- Los envíos van del almacén a las filiales; entre filiales se piden a través del almacén.
- Los Olivos es almacén y también sede con alumnos.
- Una sola empresa (un RUC).
- Administración general es el dueño del sistema, con posibilidad de sumar personas.
