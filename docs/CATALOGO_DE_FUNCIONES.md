# Catálogo de funciones y conexiones

> **Generado** desde `src/utils/capabilityRegistry.ts` con `npx tsx scripts/doc-capabilities.ts`. No se edita a mano: para cambiar algo, se cambia el registro y se vuelve a generar.
> Es el cuadro de referencia del constructor de roles: qué función existe, qué necesita, qué otra persona debe poder hacer, qué datos toca y qué avisos dispara.

**51 funcionalidades · 175 funciones** (3 reservadas) · 17 avisos · 9 combinaciones a separar.

Cómo leerlo:
- **Requiere:** lo que el mismo usuario necesita; al marcar la función se marca solo.
- **Contraparte:** lo que otra persona debe poder hacer. **Obligatoria** = sin ella la función no se ofrece; **recomendada** = se ofrece y se avisa.
- **Lee → Escribe:** los datos que toca (alimentan el mapa de conexiones).
- **Avisos:** los avisos que dispara. 💲 mueve dinero · 👁‍🗨 muestra sueldos · 🛡 control (pide motivo y deja historial).

## Dashboard

### Resumen general `dash-resumen`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver el resumen general** · menú «Resumen general»<br><code>dash-resumen:view</code> | ver | — | — | Matrícula, Plan de pago, Asesoría, Stock, Solicitud sobre una matrícula, Auditoría → — | — |
| **Ver las cifras de dinero (caja, cobros y vencimientos)** 💲<br><code>dash-resumen:view_money</code> | ver | Ver el resumen general | — | Pago, Movimiento de caja, Cuota → — | — |

## Mensajería

### Mensajería `msg-mensajeria`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver la mensajería** · menú «Mensajería»<br><code>msg-mensajeria:view</code> | ver | — | — | Personal → — | — |

## Operación

### Matrículas `op-matriculas`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver matrículas** · menú «Matrículas»<br><code>op-matriculas:view</code> | ver | — | — | Matrícula, Alumno, Titular, Plan de pago, Programa, Nivel → — | — |
| **Crear matrícula** 💲<br><code>op-matriculas:create</code> | crear | Ver matrículas | Registrar la entrega de materiales en la misma sede (recomendada) | Programa, Nivel, Tarifario, Promoción, Tipo de pago → Matrícula, Alumno, Titular, Plan de pago, Pago, Movimiento de caja, Verificación de materiales, Asesoría | — |
| **Editar borrador** _(reservada)_<br><code>op-matriculas:edit_draft</code> | editar | Ver matrículas | — | — → — | — |
| **Confirmar matrícula** _(reservada)_<br><code>op-matriculas:confirm</code> | operar | Ver matrículas | — | — → — | — |
| **Solicitar caída**<br><code>op-matriculas:req_drop</code> | operar | Ver matrículas | Aprobar caída en cualquier sede (recomendada) | — → Solicitud sobre una matrícula | Solicitud de caída pendiente |
| **Aprobar caída** 🛡 control<br><code>op-matriculas:approve_drop</code> | aprobar | Ver matrículas | — | Solicitud sobre una matrícula → Matrícula, Plan de pago, Cuota, Solicitud sobre una matrícula | Solicitud resuelta |
| **Solicitar reactivación**<br><code>op-matriculas:req_reactivation</code> | operar | Ver matrículas | Aprobar reactivación en cualquier sede (recomendada) | — → Solicitud sobre una matrícula | Solicitud de reactivación pendiente |
| **Aprobar reactivación** 🛡 control<br><code>op-matriculas:approve_reactivation</code> | aprobar | Ver matrículas | — | Solicitud sobre una matrícula → Matrícula, Plan de pago, Cuota, Solicitud sobre una matrícula | Solicitud resuelta |
| **Solicitar cambio de programa o nivel**<br><code>op-matriculas:req_program_change</code> | operar | Ver matrículas | Aprobar cambio de programa o nivel en cualquier sede (recomendada) | — → Solicitud sobre una matrícula | Solicitud de cambio de programa pendiente |
| **Aprobar cambio de programa o nivel** 🛡 control<br><code>op-matriculas:approve_program_change</code> | aprobar | Ver matrículas | — | Solicitud sobre una matrícula, Tarifario → Matrícula, Plan de pago, Cuota, Solicitud sobre una matrícula | Solicitud resuelta |
| **Solicitar traslado de sede**<br><code>op-matriculas:req_transfer</code> | operar | Ver matrículas | Aprobar traslado de sede en cualquier sede (recomendada) | — → Solicitud sobre una matrícula | Solicitud de traslado de sede pendiente |
| **Aprobar traslado de sede** 🛡 control<br><code>op-matriculas:approve_transfer</code> | aprobar | Ver matrículas | — | Solicitud sobre una matrícula, Filial → Matrícula, Asesoría, Solicitud sobre una matrícula | Solicitud resuelta |
| **Renovar matrícula** 💲<br><code>op-matriculas:renew</code> | crear | Ver matrículas | — | — → Matrícula, Plan de pago, Pago, Movimiento de caja | — |
| **Corregir datos administrativos** 🛡 control<br><code>op-matriculas:edit_data</code> | editar | Ver matrículas | — | — → Matrícula | — |
| **Generar contrato y ficha**<br><code>op-matriculas:documents</code> | operar | Ver matrículas | — | Matrícula, Plantilla de contrato → Contrato y ficha | — |
| **Habilitar extensión de vigencia** 🛡 control<br><code>op-matriculas:extend</code> | operar | Ver matrículas | — | — → Matrícula | — |

### Pagos `op-pagos`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver pagos** 💲 · menú «Pagos»<br><code>op-pagos:view</code> | ver | — | — | Pago, Plan de pago, Cuota → — | — |
| **Registrar pago o cobro de cuota** 💲<br><code>op-pagos:register</code> | crear | Ver pagos | — | Plan de pago, Cuota → Pago, Cuota, Plan de pago, Movimiento de caja | — |
| **Reversar pago** 🛡 control<br><code>op-pagos:reverse_payment</code> | operar | Ver pagos | — | — → Pago, Cuota, Plan de pago, Movimiento de caja, Nota de crédito | Pago reversado |
| **Emitir nota de crédito** 🛡 control<br><code>op-pagos:credit_note</code> | operar | Ver pagos | — | — → Nota de crédito | — |

### Verificación de materiales `op-verificacion`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver verificación** · menú «Verificación»<br><code>op-verificacion:view</code> | ver | — | — | Verificación de materiales, Matrícula, Receta de materiales, Stock → — | — |
| **Registrar la entrega de materiales**<br><code>op-verificacion:deliver</code> | operar | Ver verificación, Ver el stock | — | Receta de materiales, Stock → Verificación de materiales, Stock, Kardex | — |

### Caja `op-caja`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver caja** 💲 · menú «Caja»<br><code>op-caja:view</code> | ver | — | — | Movimiento de caja, Lote de depósito, Cierre de caja → — | — |
| **Registrar ingreso** 💲<br><code>op-caja:reg_income</code> | crear | Ver caja | — | — → Movimiento de caja | — |
| **Registrar egreso** 💲<br><code>op-caja:reg_expense</code> | crear | Ver caja | — | — → Movimiento de caja | — |
| **Reversar movimiento** 🛡 control<br><code>op-caja:reverse_movement</code> | operar | Ver caja | — | — → Movimiento de caja | Movimiento de caja reversado |
| **Crear lote de depósito** 💲<br><code>op-caja:deposit</code> | operar | Ver caja | — | — → Lote de depósito, Movimiento de caja | — |
| **Cerrar caja** 🛡 control<br><code>op-caja:close_box</code> | operar | Ver caja | — | Movimiento de caja → Cierre de caja | — |
| **Reabrir caja** 🛡 control<br><code>op-caja:reopen_box</code> | operar | Ver caja | — | — → Cierre de caja | Caja reabierta |

### Caja chica `op-caja-chica`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver caja chica** 💲 · menú «Caja chica»<br><code>op-caja-chica:view</code> | ver | — | — | Caja chica, Cierre de caja → — | — |
| **Registrar ingreso o gasto de caja chica** 💲<br><code>op-caja-chica:reg_movement</code> | crear | Ver caja chica | — | — → Caja chica | — |
| **Reversar movimiento** 🛡 control<br><code>op-caja-chica:reverse_movement</code> | operar | Ver caja chica | — | — → Caja chica | — |
| **Hacer arqueo y cierre** 🛡 control<br><code>op-caja-chica:count</code> | operar | Ver caja chica | — | — → Cierre de caja | — |
| **Configurar fondo y tope por gasto**<br><code>op-caja-chica:config</code> | configurar | Ver caja chica | — | — → Caja chica | — |

### Cobranza y cartera `op-cobranza`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver cartera y reportes de cobranza** 💲 · menú «Planes y cartera»<br><code>op-cobranza:view</code> | ver | — | — | Plan de pago, Cuota, Matrícula, Alumno, Titular, Recordatorio de cobro → — | — |
| **Enviar recordatorios**<br><code>op-cobranza:remind</code> | operar | Ver cartera y reportes de cobranza | — | Política de cobranza → Recordatorio de cobro | — |
| **Cobrar mora** 💲<br><code>op-cobranza:charge_mora</code> | operar | Ver cartera y reportes de cobranza | — | Política de cobranza → Cuota, Plan de pago | — |
| **Refinanciar una cuota** 🛡 control<br><code>op-cobranza:refinance</code> | operar | Ver cartera y reportes de cobranza | — | — → Cuota, Plan de pago | Cuota refinanciada |
| **Configurar políticas de cobranza**<br><code>op-cobranza:config</code> | configurar | Ver cartera y reportes de cobranza | — | — → Política de cobranza | — |

## Logística

### Catálogo de artículos `log-catalogo`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver el catálogo de artículos** · menú «Catálogo de artículos»<br><code>log-catalogo:view</code> | ver | — | — | Artículo, Precio de artículo → — | — |
| **Registrar el precio de un artículo** 💲<br><code>log-catalogo:edit_price</code> | editar | Ver el catálogo de artículos | — | — → Precio de artículo | — |

### Stock `log-stock`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver el stock** · menú «Stock»<br><code>log-stock:view</code> | ver | — | — | Stock, Artículo, Filial → — | — |
| **Definir el stock mínimo**<br><code>log-stock:edit_min</code> | editar | Ver el stock | — | — → Stock | — |
| **Armar y abrir paquetes**<br><code>log-stock:pack</code> | operar | Ver el stock | — | Artículo → Stock, Kardex | — |

### Envíos `log-envios`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver envíos** · menú «Envíos»<br><code>log-envios:view</code> | ver | — | — | Envío, Filial → — | — |
| **Preparar un envío**<br><code>log-envios:create</code> | crear | Ver envíos, Ver el stock | — | Stock, Filial → Envío | — |
| **Editar un envío**<br><code>log-envios:edit</code> | editar | Ver envíos | — | — → Envío | — |
| **Eliminar un envío** 🛡 control<br><code>log-envios:delete</code> | eliminar | Ver envíos | — | — → Envío | — |
| **Realizar el envío (despachar)**<br><code>log-envios:dispatch</code> | operar | Ver envíos, Ver el stock | Confirmar la recepción de un envío en la sede destino (obligatoria) | Stock, Envío, Filial → Envío, Stock, Kardex | Envío despachado |

### Transferencias `log-transfer`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver transferencias** · menú «Transferencias»<br><code>log-transfer:view</code> | ver | — | — | Transferencia, Filial → — | — |
| **Solicitar transferencia**<br><code>log-transfer:req_transfer</code> | crear | Ver transferencias, Ver el stock | — | Stock, Filial → Transferencia | — |
| **Aprobar transferencia** 🛡 control<br><code>log-transfer:approve_transfer</code> | aprobar | Ver transferencias | — | — → Transferencia | — |
| **Despachar transferencia**<br><code>log-transfer:dispatch</code> | operar | Ver transferencias, Ver el stock | Recepcionar transferencia en la sede destino (obligatoria) | Stock, Transferencia → Transferencia, Stock, Kardex | Transferencia en tránsito |
| **Recepcionar transferencia**<br><code>log-transfer:receive</code> | operar | Ver transferencias | — | Transferencia → Transferencia, Stock, Kardex, Recepción | Recepción confirmada, Recepción con faltante o daño |

### Recepciones `log-recepciones`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver recepciones** · menú «Recepciones»<br><code>log-recepciones:view</code> | ver | — | — | Envío, Transferencia, Recepción → — | — |
| **Confirmar la recepción de un envío**<br><code>log-recepciones:confirm</code> | operar | Ver recepciones | — | Envío → Recepción, Envío, Stock, Kardex | Recepción confirmada, Recepción con faltante o daño |

### Kardex `log-kardex`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver el kardex** · menú «Kardex»<br><code>log-kardex:view</code> | ver | — | — | Kardex, Stock, Artículo → — | — |

### Ajustes y mermas `log-ajustes`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver ajustes y mermas** · menú «Ajustes y mermas»<br><code>log-ajustes:view</code> | ver | — | — | Ajuste o merma, Stock → — | — |
| **Registrar un ajuste o una merma** 🛡 control<br><code>log-ajustes:create</code> | crear | Ver ajustes y mermas, Ver el stock | — | Stock → Ajuste o merma, Stock, Kardex | — |

## Psicopedagogía

### Programación `psi-prog`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver programación** · menú «Programación»<br><code>psi-prog:view</code> | ver | — | — | Asesoría, Alumno, Matrícula, Verificación de materiales → — | — |
| **Crear programación (agendar asesorías)**<br><code>psi-prog:create</code> | crear | Ver programación | Marcar la asistencia de la asesoría en la misma sede (recomendada) | Alumno, Matrícula, Verificación de materiales, Cupos → Asesoría | — |
| **Reprogramar o cancelar con 24 horas o más**<br><code>psi-prog:reschedule</code> | editar | Ver programación | — | — → Asesoría | — |
| **Marcar la asistencia de la asesoría**<br><code>psi-prog:mark_attendance</code> | operar | Ver programación | — | Verificación de materiales → Asesoría | — |
| **Registrar seguimiento de la sesión**<br><code>psi-prog:reg_tracking</code> | operar | Ver programación | — | — → Seguimiento de la sesión, Asesoría | — |
| **Exportar cronograma mensual**<br><code>psi-prog:export_schedule</code> | exportar | Ver programación | — | Cronograma mensual → — | — |
| **Asignar el responsable de una actividad especial**<br><code>psi-prog:activity_lead</code> | operar | Ver programación | — | — → Actividad especial | — |
| **Inscribir o retirar alumnos de una actividad especial**<br><code>psi-prog:activity_enroll</code> | operar | Ver programación | — | Cupos → Actividad especial | — |
| **Registrar asistencia a actividades especiales**<br><code>psi-prog:activity_attendance</code> | operar | Ver programación | — | — → Actividad especial | — |
| **Cancelar o reprogramar con menos de 24 h (cambio de la institución)** 🛡 control<br><code>psi-prog:institutional_change</code> | operar | Reprogramar o cancelar con 24 horas o más | — | — → Asesoría | — |
| **Configurar los cupos**<br><code>psi-prog:capacity</code> | configurar | Ver programación | — | — → Cupos | — |

### Historial del alumno `psi-historial`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver el historial del alumno** · menú «Historial del alumno»<br><code>psi-historial:view</code> | ver | — | — | Alumno, Asesoría, Seguimiento de la sesión, Actividad especial, Cronograma mensual → — | — |

### Cronogramas mensuales `psi-cronogramas`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver cronogramas mensuales** · menú «Cronogramas mensuales»<br><code>psi-cronogramas:view</code> | ver | — | — | Cronograma mensual, Actividad especial → — | — |
| **Crear cronograma mensual**<br><code>psi-cronogramas:create</code> | crear | Ver cronogramas mensuales | — | — → Cronograma mensual | — |
| **Editar cronograma mensual**<br><code>psi-cronogramas:edit</code> | editar | Ver cronogramas mensuales | — | — → Cronograma mensual | — |
| **Eliminar cronograma mensual** 🛡 control<br><code>psi-cronogramas:delete</code> | eliminar | Ver cronogramas mensuales | — | — → Cronograma mensual | — |

### Recordatorios de Psicopedagogía `psi-recordatorios`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver recordatorios** · menú «Recordatorios»<br><code>psi-recordatorios:view</code> | ver | — | — | Recordatorio de Psicopedagogía, Asesoría → — | — |
| **Enviar y registrar recordatorios**<br><code>psi-recordatorios:remind</code> | operar | Ver recordatorios | — | — → Recordatorio de Psicopedagogía | — |
| **Configurar los días de recordatorio**<br><code>psi-recordatorios:config</code> | configurar | Ver recordatorios | — | — → Recordatorio de Psicopedagogía | — |

## Personas

### Alumnos `per-alumnos`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver alumnos** · menú «Alumnos»<br><code>per-alumnos:view</code> | ver | — | — | Alumno, Titular, Matrícula → — | — |
| **Crear alumno**<br><code>per-alumnos:create</code> | crear | Ver alumnos | — | — → Alumno | — |
| **Editar alumno**<br><code>per-alumnos:edit</code> | editar | Ver alumnos | — | — → Alumno | — |
| **Eliminar alumno** 🛡 control<br><code>per-alumnos:delete</code> | eliminar | Ver alumnos | — | — → Alumno | — |

### Titulares `per-titulares`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver titulares** · menú «Titulares»<br><code>per-titulares:view</code> | ver | — | — | Titular, Alumno, Matrícula, Plan de pago → — | — |
| **Crear titular**<br><code>per-titulares:create</code> | crear | Ver titulares | — | — → Titular | — |
| **Editar titular**<br><code>per-titulares:edit</code> | editar | Ver titulares | — | — → Titular | — |
| **Eliminar titular** 🛡 control<br><code>per-titulares:delete</code> | eliminar | Ver titulares | — | — → Titular | — |

### Personal `per-personal`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver el personal** · menú «Personal»<br><code>per-personal:view</code> | ver | — | — | Personal, Contrato de trabajo, Asignación, Cuenta de usuario → — | — |
| **Crear ficha de personal**<br><code>per-personal:create</code> | crear | Ver el personal | — | — → Personal, Cuenta de usuario | — |
| **Editar ficha de personal**<br><code>per-personal:edit</code> | editar | Ver el personal | — | — → Personal, Cuenta de usuario | — |
| **Inactivar a un trabajador** 🛡 control<br><code>per-personal:inactivate</code> | operar | Ver el personal | — | — → Personal, Cuenta de usuario, Asignación | — |
| **Reactivar a un trabajador** 🛡 control<br><code>per-personal:reactivate</code> | operar | Ver el personal | — | — → Personal, Cuenta de usuario | — |
| **Eliminar ficha de personal** 🛡 control<br><code>per-personal:delete</code> | eliminar | Ver el personal | — | — → Personal | — |

### Contratos `per-contratos`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver contratos** · menú «Contratos»<br><code>per-contratos:view</code> | ver | — | — | Contrato de trabajo, Personal, Planilla → — | — |
| **Crear contrato** 👁‍🗨 sueldos<br><code>per-contratos:create</code> | crear | Ver contratos, Ver remuneraciones y costo de planilla | — | — → Contrato de trabajo | — |
| **Editar contrato (cambio de condiciones con motivo)** 👁‍🗨 sueldos<br><code>per-contratos:edit</code> | editar | Ver contratos, Ver remuneraciones y costo de planilla | — | — → Contrato de trabajo | — |
| **Cerrar contrato** 🛡 control<br><code>per-contratos:close</code> | operar | Ver contratos | — | — → Contrato de trabajo, Asignación | — |

### Asignaciones `per-asignaciones`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver asignaciones** · menú «Asignaciones»<br><code>per-asignaciones:view</code> | ver | — | — | Asignación, Personal, Filial → — | — |
| **Crear o editar una asignación**<br><code>per-asignaciones:save</code> | crear | Ver asignaciones | — | — → Asignación | — |
| **Cerrar una asignación** 🛡 control<br><code>per-asignaciones:close</code> | operar | Ver asignaciones | — | — → Asignación | — |

### Planilla `per-planilla`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver planillas y boletas** 👁‍🗨 sueldos · menú «Planilla»<br><code>per-planilla:view</code> | ver | Ver remuneraciones y costo de planilla | — | Planilla, Contrato de trabajo, Personal → — | — |
| **Generar y eliminar borradores de planilla** 👁‍🗨 sueldos<br><code>per-planilla:generate</code> | crear | Ver planillas y boletas | — | Contrato de trabajo → Planilla | — |
| **Agregar ajustes (bonos, descuentos)** 👁‍🗨 sueldos<br><code>per-planilla:adjust</code> | editar | Ver planillas y boletas | — | — → Planilla | — |
| **Cerrar planilla** 🛡 control<br><code>per-planilla:close</code> | operar | Ver planillas y boletas | — | — → Planilla | — |
| **Registrar el pago de la planilla** 💲<br><code>per-planilla:pay</code> | operar | Ver planillas y boletas | — | — → Planilla | — |
| **Reabrir planilla cerrada** 🛡 control<br><code>per-planilla:reopen</code> | operar | Ver planillas y boletas | — | — → Planilla | — |

### Remuneraciones `per-remuneracion`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver remuneraciones y costo de planilla** 👁‍🗨 sueldos<br><code>per-remuneracion:view</code> | ver | — | — | Contrato de trabajo, Planilla → — | — |

## Oferta comercial

### Programas `com-programas`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver programas** · menú «Programas»<br><code>com-programas:view</code> | ver | — | — | Programa, Nivel → — | — |
| **Crear programa**<br><code>com-programas:create</code> | crear | Ver programas | — | — → Programa | — |
| **Editar programa**<br><code>com-programas:edit</code> | editar | Ver programas | — | — → Programa | — |
| **Eliminar programa** 🛡 control<br><code>com-programas:delete</code> | eliminar | Ver programas | — | — → Programa | — |

### Niveles `com-niveles`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver niveles** · menú «Niveles»<br><code>com-niveles:view</code> | ver | — | — | Nivel, Programa → — | — |
| **Crear nivel**<br><code>com-niveles:create</code> | crear | Ver niveles | — | — → Nivel | — |
| **Editar nivel**<br><code>com-niveles:edit</code> | editar | Ver niveles | — | — → Nivel | — |
| **Eliminar nivel** 🛡 control<br><code>com-niveles:delete</code> | eliminar | Ver niveles | — | — → Nivel | — |

### Tipos de pago `com-tipos-pago`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver tipos de pago** · menú «Tipos de pago»<br><code>com-tipos-pago:view</code> | ver | — | — | Tipo de pago → — | — |
| **Crear tipo de pago**<br><code>com-tipos-pago:create</code> | crear | Ver tipos de pago | — | — → Tipo de pago | — |
| **Editar tipo de pago**<br><code>com-tipos-pago:edit</code> | editar | Ver tipos de pago | — | — → Tipo de pago | — |
| **Eliminar tipo de pago** 🛡 control<br><code>com-tipos-pago:delete</code> | eliminar | Ver tipos de pago | — | — → Tipo de pago | — |

### Tarifarios `com-tarifarios`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver tarifarios** · menú «Tarifarios»<br><code>com-tarifarios:view</code> | ver | — | — | Tarifario, Programa, Nivel, Tipo de pago → — | — |
| **Crear tarifario**<br><code>com-tarifarios:create</code> | crear | Ver tarifarios | — | — → Tarifario | — |
| **Editar tarifario**<br><code>com-tarifarios:edit</code> | editar | Ver tarifarios | — | — → Tarifario | — |
| **Eliminar tarifario** 🛡 control<br><code>com-tarifarios:delete</code> | eliminar | Ver tarifarios | — | — → Tarifario | — |

### Promociones `com-promociones`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver promociones** · menú «Promociones»<br><code>com-promociones:view</code> | ver | — | — | Promoción, Programa, Tarifario → — | — |
| **Crear promoción**<br><code>com-promociones:create</code> | crear | Ver promociones | — | — → Promoción | — |
| **Editar promoción**<br><code>com-promociones:edit</code> | editar | Ver promociones | — | — → Promoción | — |
| **Eliminar promoción** 🛡 control<br><code>com-promociones:delete</code> | eliminar | Ver promociones | — | — → Promoción | — |

### Recetas de materiales `com-recetas`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver recetas de materiales** · menú «Recetas de materiales»<br><code>com-recetas:view</code> | ver | — | — | Receta de materiales, Artículo, Programa, Nivel, Filial → — | — |
| **Crear, editar y activar recetas**<br><code>com-recetas:edit</code> | editar | Ver recetas de materiales | — | — → Receta de materiales | — |

## Organización

### Empresas `org-empresas`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver empresas** · menú «Empresas»<br><code>org-empresas:view</code> | ver | — | — | Empresa, Filial → — | — |
| **Crear empresa**<br><code>org-empresas:create</code> | crear | Ver empresas | — | — → Empresa | — |
| **Editar empresa**<br><code>org-empresas:edit</code> | editar | Ver empresas | — | — → Empresa | — |
| **Eliminar empresa** 🛡 control<br><code>org-empresas:delete</code> | eliminar | Ver empresas | — | — → Empresa | — |

### Filiales `org-filiales`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver filiales** · menú «Filiales»<br><code>org-filiales:view</code> | ver | — | — | Filial, Empresa → — | — |
| **Crear filial**<br><code>org-filiales:create</code> | crear | Ver filiales | — | — → Filial | — |
| **Editar filial**<br><code>org-filiales:edit</code> | editar | Ver filiales | — | — → Filial | — |
| **Eliminar filial** 🛡 control<br><code>org-filiales:delete</code> | eliminar | Ver filiales | — | — → Filial | — |

### Roles y Permisos `org-roles`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver roles** · menú «Roles»<br><code>org-roles:view</code> | ver | — | — | Rol, Permisos del rol, Cuenta de usuario → — | — |
| **Crear rol**<br><code>org-roles:create</code> | crear | Ver roles | — | — → Rol | — |
| **Editar rol**<br><code>org-roles:edit</code> | editar | Ver roles | — | — → Rol | — |
| **Eliminar rol** 🛡 control<br><code>org-roles:delete</code> | eliminar | Ver roles | — | — → Rol | — |
| **Configurar permisos** 🛡 control · menú «Permisos»<br><code>org-roles:config_perms</code> | configurar | Ver roles | — | Rol, Permisos del rol → Permisos del rol | — |

### Usuarios `org-usuarios`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver usuarios** · menú «Usuarios»<br><code>org-usuarios:view</code> | ver | — | — | Cuenta de usuario, Rol, Personal, Filial → — | — |
| **Crear usuario**<br><code>org-usuarios:create</code> | crear | Ver usuarios | — | — → Cuenta de usuario | — |
| **Editar usuario**<br><code>org-usuarios:edit</code> | editar | Ver usuarios | — | — → Cuenta de usuario | — |
| **Desactivar usuario** 🛡 control<br><code>org-usuarios:deactivate</code> | operar | Ver usuarios | — | — → Cuenta de usuario | — |
| **Resetear acceso** 🛡 control<br><code>org-usuarios:reset_access</code> | operar | Ver usuarios | — | — → Cuenta de usuario | — |
| **Asignar rol** 🛡 control<br><code>org-usuarios:assign_role</code> | operar | Ver usuarios, Ver roles | — | Rol → Cuenta de usuario | — |
| **Asignar sedes** 🛡 control<br><code>org-usuarios:assign_branch</code> | operar | Ver usuarios | — | Filial → Cuenta de usuario | — |
| **Eliminar usuario** 🛡 control<br><code>org-usuarios:delete</code> | eliminar | Ver usuarios | — | — → Cuenta de usuario | — |

### Alcance por sede `org-alcance`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver y operar todas las sedes**<br><code>org-alcance:all_branches</code> | ver | — | — | Filial → — | — |

## Reportes

### Reportes Generales `rep-general`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver reportes**<br><code>rep-general:view</code> | ver | — | — | — → — | — |
| **Exportar reportes**<br><code>rep-general:export</code> | exportar | Ver reportes | — | — → — | — |
| **Guardar vistas** _(reservada)_<br><code>rep-general:save_views</code> | configurar | Ver reportes | — | — → — | — |

### Reporte de matrículas `rep-matriculas`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver el reporte de matrículas** · menú «Matrículas»<br><code>rep-matriculas:view</code> | ver | Ver reportes | — | Matrícula, Solicitud sobre una matrícula, Alumno, Programa, Filial → — | — |

### Reporte de cartera `rep-cartera`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver el reporte de cartera** 💲 · menú «Cartera»<br><code>rep-cartera:view</code> | ver | Ver reportes | — | Plan de pago, Cuota, Matrícula, Titular → — | — |

### Reporte de caja `rep-caja`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver el reporte de caja** 💲 · menú «Caja»<br><code>rep-caja:view</code> | ver | Ver reportes | — | Movimiento de caja, Lote de depósito, Cierre de caja, Caja chica → — | — |

### Reporte de verificación `rep-verificacion`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver el reporte de verificación** · menú «Verificación»<br><code>rep-verificacion:view</code> | ver | Ver reportes | — | Verificación de materiales, Matrícula, Receta de materiales, Stock → — | — |

### Reporte de stock `rep-stock`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver el reporte de stock** · menú «Stock»<br><code>rep-stock:view</code> | ver | Ver reportes | — | Stock, Kardex, Receta de materiales, Matrícula → — | — |

### Reporte de Psicopedagogía `rep-psicopedagogia`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver el reporte de Psicopedagogía** · menú «Psicopedagogía»<br><code>rep-psicopedagogia:view</code> | ver | Ver reportes | — | Asesoría, Seguimiento de la sesión, Actividad especial, Alumno → — | — |

### Reporte de personal `rep-personal`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver el reporte de personal** · menú «Personal»<br><code>rep-personal:view</code> | ver | Ver reportes | — | Personal, Contrato de trabajo, Asignación, Cuenta de usuario → — | — |

## Sistema

### Auditoría `sis-auditoria`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver la auditoría** · menú «Auditoría»<br><code>sis-auditoria:view</code> | ver | — | — | Auditoría → — | — |

### Solicitudes pendientes `sis-solicitudes`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver solicitudes pendientes** · menú «Solicitudes pendientes»<br><code>sis-solicitudes:view</code> | ver | — | — | Solicitud sobre una matrícula, Matrícula → — | — |

### Cierres y reaperturas `sis-cierres`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver los cierres de caja** 💲 · menú «Cierres»<br><code>sis-cierres:view</code> | ver | — | — | Cierre de caja → — | — |
| **Ver las reaperturas de caja** 🛡 control · menú «Reaperturas»<br><code>sis-cierres:view_reopenings</code> | ver | — | — | Cierre de caja → — | — |

### Avisos `sis-avisos`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver la bandeja de avisos**<br><code>sis-avisos:view</code> | ver | — | — | Aviso → — | — |
| **Recibir los avisos que nadie más puede recibir**<br><code>sis-avisos:fallback</code> | ver | Ver la bandeja de avisos | — | Aviso → — | — |

## Configuración

### Orígenes de leads `cfg-leads`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver orígenes de leads**<br><code>cfg-leads:view</code> | ver | — | — | Origen de lead → — | — |
| **Crear origen de lead**<br><code>cfg-leads:create</code> | crear | Ver orígenes de leads | — | — → Origen de lead | — |
| **Editar origen de lead**<br><code>cfg-leads:edit</code> | editar | Ver orígenes de leads | — | — → Origen de lead | — |
| **Eliminar origen de lead** 🛡 control<br><code>cfg-leads:delete</code> | eliminar | Ver orígenes de leads | — | — → Origen de lead | — |

### Plantillas de contrato y ficha `cfg-plantillas`

| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |
|---|---|---|---|---|---|
| **Ver las plantillas de contrato y ficha**<br><code>cfg-plantillas:view</code> | ver | — | — | Plantilla de contrato → — | — |
| **Editar las plantillas de contrato y ficha**<br><code>cfg-plantillas:edit</code> | editar | Ver las plantillas de contrato y ficha | — | — → Plantilla de contrato | — |

## Avisos con destinatario

El aviso llega a quien tenga la función indicada en la sede que corresponde, no a un nombre de rol. Si nadie la tiene, llega a quien tenga «Recibir los avisos que nadie más puede recibir».

| Aviso | Lo dispara | Llega a quien tenga… | Dónde |
|---|---|---|---|
| Envío despachado | Realizar el envío (despachar) | Confirmar la recepción de un envío | sede destino |
| Transferencia en tránsito | Despachar transferencia | Recepcionar transferencia | sede destino |
| Recepción confirmada | Recepcionar transferencia · Confirmar la recepción de un envío | Realizar el envío (despachar) | sede origen |
| Recepción con faltante o daño | Recepcionar transferencia · Confirmar la recepción de un envío | Registrar un ajuste o una merma | sede origen |
| Solicitud de caída pendiente | Solicitar caída | Aprobar caída | cualquier sede |
| Solicitud de reactivación pendiente | Solicitar reactivación | Aprobar reactivación | cualquier sede |
| Solicitud de cambio de programa pendiente | Solicitar cambio de programa o nivel | Aprobar cambio de programa o nivel | cualquier sede |
| Solicitud de traslado de sede pendiente | Solicitar traslado de sede | Aprobar traslado de sede | cualquier sede |
| Solicitud resuelta | Aprobar caída · Aprobar reactivación · Aprobar cambio de programa o nivel · Aprobar traslado de sede | Quien hizo la solicitud | — |
| Pago reversado | Reversar pago | Ver la auditoría | cualquier sede |
| Movimiento de caja reversado | Reversar movimiento | Ver la auditoría | cualquier sede |
| Caja reabierta | Reabrir caja | Ver la auditoría | cualquier sede |
| Cuota refinanciada | Refinanciar una cuota | Ver cartera y reportes de cobranza | sede del alumno o documento |
| Cuota vencida | La regla del sistema (por fecha o estado) | Enviar recordatorios | sede del alumno o documento |
| Primera asesoría sin materiales entregados | La regla del sistema (por fecha o estado) | Registrar la entrega de materiales | sede del alumno o documento |
| Contrato por vencer | La regla del sistema (por fecha o estado) | Ver contratos | cualquier sede |
| Stock por debajo del mínimo | La regla del sistema (por fecha o estado) | Registrar un ajuste o una merma | sede del alumno o documento |

## Combinaciones que conviene separar

Si un rol reúne **todas** las funciones de la fila, el constructor avisa y pide un motivo para guardar.

| Funciones | Por qué |
|---|---|
| Registrar pago o cobro de cuota + Reversar pago + Cerrar caja | Quien cobra, reversa los pagos y cierra la caja puede ocultar una diferencia sin que nadie más lo vea. |
| Reversar movimiento + Reabrir caja | Quien reversa movimientos y también reabre los cierres puede modificar un día ya arqueado. |
| Solicitar caída + Aprobar caída | Quien pide una caída y la aprueba no tiene quien lo revise. |
| Solicitar reactivación + Aprobar reactivación | Quien pide una reactivación y la aprueba no tiene quien lo revise. |
| Solicitar cambio de programa o nivel + Aprobar cambio de programa o nivel | Quien pide un cambio de programa y lo aprueba no tiene quien lo revise. |
| Solicitar traslado de sede + Aprobar traslado de sede | Quien pide un traslado y lo aprueba no tiene quien lo revise. |
| Generar y eliminar borradores de planilla + Registrar el pago de la planilla | Quien arma la planilla y también registra su pago concentra todo el ciclo del dinero del personal. |
| Configurar permisos + Asignar rol | Quien define los permisos y también asigna los roles puede darse a sí mismo cualquier acceso. |
| Registrar un ajuste o una merma + Confirmar la recepción de un envío + Realizar el envío (despachar) | Quien despacha, recibe y ajusta el stock puede mover mercadería sin contrapeso. |

## Lo que no es una función

Acciones del contexto que no pertenecen a una persona (consultas, ayudas internas, estado de la interfaz):

- `can`: Consulta de permisos.
- `gateOfSchedule`: Consulta (puerta de verificación antes de la primera asesoría).
- `attendanceBlockOf`: Consulta (bloqueo de asistencia).
- `pendingFirstSessions`: Consulta (primeras asesorías pendientes).
- `payrollLinesOf`: Consulta (líneas de una planilla).
- `documentContextOf`: Consulta (datos para armar un documento).
- `addNotification`: Interna: la dispara cada función con su aviso (paso de avisos dirigidos).
- `updateStock`: Interna: la mueven el despacho, la recepción, la entrega de materiales y los ajustes; las pantallas no deberían llamarla directo (paso de guardas).
- `setIsEnrollmentWizardOpen`: Estado de la interfaz (abrir el asistente de matrícula).
- `setCurrentBranchId`: Selector de sede TEMPORAL de pruebas: desaparece con las sesiones.

Ítems del menú sin función todavía:

- `sistema/Preferencias`: Sin pantalla todavía.
- `sistema/Ayuda`: Se abre desde el botón inferior; no es un ítem del menú.
