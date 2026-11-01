# Prompts para Higgsfield: mapa de flujos del Sistema ENSIL (estado actual, 2026-10-30)

## Formato recomendado

- **Papel:** A3 vertical = 297 × 420 mm = proporción 1 : 1,414.
- **Proporción a pedir en Higgsfield: 2:3** (1 : 1,5). Es la más cercana a A3 entre las que suelen ofrecer los modelos; si el modelo no la trae, usar **3:4**.
  Al llevarlo a A3 se recorta ~6 % de alto (con 2:3) o de ancho (con 3:4): por eso cada prompt pide **margen de seguridad del 5 %**.
- **Resolución:** la más alta que ofrezca el modelo (2K o 4K) y luego el escalador. A3 a 300 dpi son 3508 × 4961 px.
- **Una imagen por grupo de menú (10 en total), no una sola para todo el sistema.** Los modelos de imagen deforman el texto cuando hay
  más de ~40 etiquetas. Con una imagen por grupo se mantienen legibles y A3 vertical alcanza para el flujo de arriba abajo.
- **Honestidad técnica:** un modelo de imagen no garantiza ortografía ni flechas exactas. Úsalo para el diseño y el estilo, y revisa los
  textos; si necesitas la versión exacta e imprimible (texto y flechas sin errores), se genera como vector (SVG/HTML A3) con los mismos
  contenidos de este documento.

---

## 1. Prompt maestro (pegar SIEMPRE primero, antes de cada grupo)

```
Infografía técnica de arquitectura de software en formato VERTICAL A3 (proporción 2:3), fondo blanco hueso (#FAF8F4), estilo diagrama
de flujo de sistemas / mapa de procesos, limpio, profesional, tipografía sans-serif geométrica (tipo Inter), alto contraste, legible
al imprimir. Composición de ARRIBA hacia ABAJO en 4 franjas horizontales: (1) cabecera con título y leyenda, (2) flujo principal
con los paneles del grupo, (3) conexiones con otros módulos, (4) cuadro inferior «PUNTOS ROTOS E INCONSISTENCIAS» numerado.
Margen de seguridad del 5 % en los cuatro bordes; nada importante pegado al borde.

LENGUAJE VISUAL (respetar exactamente):
- Rectángulo redondeado azul índigo (#4F46E5) con texto blanco = ÍTEM DE MENÚ.
- Rectángulo con cabecera gris y cuerpo blanco = PANEL o VENTANA (modal).
- Píldora pequeña de borde fino = INPUT o CAMPO de formulario (etiqueta dentro, p. ej. «Fecha de pago»).
- Hexágono violeta = REGLA DE NEGOCIO (función pura, p. ej. «recomputePlan»).
- Cilindro gris = DATO guardado en memoria.
- Flecha sólida VERDE (#16A34A) = conexión que funciona hoy.
- Flecha discontinua ÁMBAR (#F59E0B) = conexión parcial o manual.
- Flecha discontinua ROJA (#DC2626) con una ✖ en medio = conexión que NO existe o está rota.
- Insignia circular roja con número (E1, E2…) sobre el nodo afectado = error o inconsistencia, y se explica en el cuadro inferior.
- Insignia ámbar con «!» = deuda o mejora pendiente. Insignia verde con ✓ = resuelto y verificado.
Cada nodo lleva un texto corto (máximo 5 palabras) en ESPAÑOL con tildes, exactamente como se indica entre comillas. No inventar
texto. Sin personas, sin ilustraciones decorativas, sin sombras exageradas, sin degradados llamativos.
```

---

## 2. Prompts por grupo (pegar después del maestro)

### G1 · OPERACIÓN (Matrículas · Planes y cartera · Pagos · Verificación · Caja · Caja chica)

```
TÍTULO: «OPERACIÓN — flujo de dinero y matrícula». Subtítulo: «Estado actual · 30 oct 2026».

FLUJO PRINCIPAL (de arriba abajo, flechas verdes salvo indicación):
1. Menú «Matrículas» → panel «Asistente de matrícula» con inputs: «Titular», «Alumno», «Programa y nivel», «Tipo de pago»,
   «Fecha de inicio», «Primera asesoría», «Comprobante». Regla «buildEnrollmentBatch».
2. De ese asistente salen 6 flechas verdes hacia cilindros: «Titular», «Alumno», «Matrícula», «Plan de pagos», «Pago», «Primera asesoría».
3. «Pago» → cilindro «Movimiento de caja» (uno por medio de pago).
4. Menú «Planes y cartera» → panel «Cronograma» → inputs «Cuota», «Monto», «Medio», «Fecha» → hexágono «recomputePlan» (única función que
   escribe saldo y estado) → «Plan» y «Saldo del titular».
5. Menú «Pagos» → panel «Reversar pago» (inputs «Motivo», «Detalle», «¿Devolver dinero?») → «Nota de crédito» → «Caja».
6. Menú «Verificación» → panel «Entrega de materiales» → «Stock» (Logística) y bloqueo de la «Primera asesoría» (Psicopedagogía).
7. Menú «Caja» → paneles «Depósito», «Arqueo y cierre», «Reapertura»; menú «Caja chica» → «Fondo», «Gasto», «Reposición».

CONEXIÓN VERDE QUE DEBE VERSE CLARA: cobrar una cuota mueve a la vez Plan, Caja, Saldo del titular, Cartera y Dashboard.

PUNTOS ROTOS E INCONSISTENCIAS (cuadro inferior, numerados):
E1 «Planilla pagada no genera egreso en Caja» (flecha roja Planilla ✖ Caja).
E2 «Sin sesión no hay alcance por sede: cada usuario verá solo sus sedes cuando existan roles (el selector del encabezado es temporal)».
E3 «Permisos sin aplicar en Matrículas y Verificación» (no llaman a can()).
E4 «Sin facturación electrónica: comprobante solo es texto y serie manual».
E5 «Recordatorios de cobro: WhatsApp manual, sin envío automático».
E6 «Programa sin receta no avisa fuera de Verificación».
E7 «Cartera sin cortes históricos (se calcula siempre a hoy)».
E8 «Kardex y Verificación cruzan sede y artículo por nombre».
Marcar en verde ✓ lo resuelto: «Saldo y estado del plan: una sola función», «Fechas solo ISO», «Titular derivado».
```

### G2 · LOGÍSTICA (Catálogo · Stock · Envíos · Transferencias · Recepciones · Kardex · Ajustes y mermas)

```
TÍTULO: «LOGÍSTICA — inventario y movimientos». Subtítulo: «Estado actual · 30 oct 2026».

FLUJO PRINCIPAL:
1. Menú «Catálogo de artículos» → panel «Artículo» (inputs «Costo», «¿Paquete?», «Composición») → cilindro «Artículos».
2. Menú «Stock» (por sede) → inputs «Mínimo», «Cantidad» → cilindro «Stock por sede» ↔ hexágono «availableStock».
3. Menús «Envíos» y «Transferencias» → panel «Cajas y artículos» → estados «En tránsito» → «Recepciones» (inputs «Cantidad recibida»,
   «Faltante/Dañado/Extra») → suma al «Stock» y escribe en «Kardex».
4. Menú «Ajustes y mermas» → inputs «Tipo», «Cantidad», «Motivo» → «Stock» y «Kardex».
5. Desde Operación: «Verificación» → «Entrega por verificación» → resta «Stock» y escribe «Kardex» (flecha verde entrante).
6. «Receta» (Oferta comercial) → hexágono «Faltantes frente a matrículas» → Reporte «Stock» (flecha verde).

PUNTOS ROTOS E INCONSISTENCIAS:
E1 «Kardex guarda sede y artículo por NOMBRE, no por id» (insignia sobre el cilindro Kardex).
E2 «Datos de ejemplo del kardex son de 2024: todo aparece sin movimiento hace 90 días».
E3 «Permisos sin aplicar en Stock, Envíos y Transferencias».
E4 «Stock bajo solo es un contador del Dashboard: no hay centro de alertas».
E5 «Adjuntos de envío: solo se guarda el nombre del archivo, no el archivo».
E6 «Cajas de envío con id temporal (box-hora): no es un id del sistema».
E7 «Envíos y Transferencias aún no se limitan a las sedes del usuario (depende de la sesión)».
```

### G3 · PSICOPEDAGOGÍA (Programación · Historial del alumno · Cronogramas mensuales · Recordatorios)

```
TÍTULO: «PSICOPEDAGOGÍA — asesorías y actividades». Subtítulo: «Estado actual · 30 oct 2026».

FLUJO PRINCIPAL:
1. Origen en Operación: «Matrícula» → «Primera asesoría» (flecha verde) → hexágono «Vigencia» (base + garantía desde la primera asesoría).
2. Menú «Programación» → panel «Agenda semanal por sede» con inputs «Alumno», «Fecha», «Hora», «Responsable», «Observaciones» →
   hexágonos «Regla de 24 horas» y «Cupos por bloque» → cilindro «Asesorías».
3. «Verificación de materiales» → hexágono «Puerta de la primera asesoría» (sin materiales no se marca asistencia; si llega la hora se
   reprograma sin contar falta).
4. Menú «Historial del alumno» → panel «Sesión» (inputs «Velocidad», «Comprensión», «Módulo», «Observaciones») → cilindro «Seguimiento».
5. Menú «Cronogramas mensuales» → panel «Actividad especial» (inputs «Cupo», «Responsable», «Inscritos») → «Asistencia».
6. Menú «Recordatorios» → panel «Asesoría / actividad / vigencia» → «WhatsApp» (manual) y registro de enviados.
7. Todo cambio deja evento → «Auditoría» (flecha verde saliente).

PUNTOS ROTOS E INCONSISTENCIAS:
E1 «Vacaciones del contrato NO se consultan: quien está de vacaciones sigue como responsable» (flecha roja Contratos ✖ Agenda).
E2 «Cerrar un contrato no revisa su agenda (solo al inactivar al trabajador)».
E3 «Responsable de la asesoría es un texto: el cruce se hace por nombre normalizado».
E4 «Recordatorios sin envío automático (WhatsApp/correo)».
E5 «Rangos de métricas fijos en código; no configurables por programa».
E6 «Sin definir qué pasa con asesorías reservadas cuando termina la duración base».
E7 «Alertas de vigencia solo se ven al abrir Matrículas, Dashboard o Programación».
Resuelto ✓: «Alumno sin matrícula ya no aparece para programar», «Estado del alumno derivado de sus matrículas».
```

### G4 · PERSONAS (Alumnos · Titulares · Personal · Contratos · Asignaciones · Planilla)

```
TÍTULO: «PERSONAS — fichas, contratos y planilla». Subtítulo: «Estado actual · 30 oct 2026».

FLUJO PRINCIPAL:
1. Menú «Titulares» → panel «Titular» (inputs «Documento», «Nombres», «Nacimiento», «Celular», «Dirección») y botón «Estado de cuenta»
   (se deriva de matrículas, planes y pagos).
2. Menú «Alumnos» → panel «Alumno» (inputs «Titular(es)», «Parentesco», «Nacimiento», «Situación») → edad, estado y programa se calculan.
3. Menú «Personal» → panel «Trabajador» → crea automáticamente una «Cuenta de usuario» (flecha verde) que se desactiva sola al inactivar.
4. Menú «Contratos» → panel «Contrato» (inputs «Tipo», «Sueldo», «Sistema de pensiones», «Vacaciones») → hexágono «payrollEngine».
5. Menú «Asignaciones» (sede, área, cargo, rol del sistema) → define dónde trabaja y qué permisos sugiere.
6. Menú «Planilla» → «Generar», «Cerrar» (foto), «Pagar» → usa el mismo hexágono «payrollEngine» que el contrato.
7. Salida: «Reporte de Personal» (contratos por vencer, sin asignación, costo de planilla).

PUNTOS ROTOS E INCONSISTENCIAS:
E1 «Planilla pagada no genera egreso en Caja» (flecha roja).
E2 «Asignaciones y Cuentas guardan la SEDE por nombre» (insignia sobre ambos cilindros).
E3 «Dos listas de roles distintas: ‘rol del sistema’ de la asignación y Roles de Organización».
E4 «Sin renovación de contrato ni alerta de vencimiento (solo se ve en el reporte)».
E5 «Sin liquidación de beneficios al cese (gratificación, CTS, vacaciones truncas)».
E6 «Sin archivo PLAME / T-Registro ni descuentos por tardanza».
E7 «Contrato y ficha firmados: solo se guarda el nombre del archivo, no el archivo».
Resuelto ✓: «Titular, estado, edad y programa derivados», «Eliminar bloqueado si hay historial», «Ids PREFIJO-NNN».
```

### G5 · OFERTA COMERCIAL (Programas · Niveles · Tipos de pago · Tarifarios · Promociones · Recetas · Orígenes)

```
TÍTULO: «OFERTA COMERCIAL — de qué depende cada matrícula». Subtítulo: «Estado actual · 30 oct 2026».

FLUJO PRINCIPAL (catálogos que alimentan el asistente de matrícula):
1. «Programas» → «Niveles» → «Tipos de pago» → «Tarifarios» (precio, cuotas, vigencia, sede) → «Promociones» (grupales).
2. Los cuatro convergen en el hexágono «quoteEnrollment» (cotización) dentro del panel «Asistente de matrícula» (flecha verde).
3. «Tarifario» + «Tipo de pago» → hexágono «buildPlanInstallments» → «Plan de pagos».
4. «Recetas» (artículos por programa, nivel y sede) → «Verificación» → «Stock».
5. «Orígenes del contacto» → campo «Origen» de la matrícula → Reporte de Matrículas.
6. «Duración base y garantía» del programa → hexágono «Vigencia».

PUNTOS ROTOS E INCONSISTENCIAS:
E1 «No existe el flujo prospecto → matrícula: hay orígenes pero no prospectos ni seguimiento (sin CRM)» (flecha roja Orígenes ✖ Prospecto).
E2 «Una matrícula nueva en un programa sin receta no avisa que falta la receta».
E3 «Permisos sin aplicar en Tarifarios, Promociones y Programas».
E4 «Ids de catálogo numéricos (‘1’, ‘2’) mientras lo operativo usa PREFIJO-NNN (política distinta por diseño)».
E5 «Tarifas y recetas con vigencia vencida dejan al programa sin precio o sin receta sin aviso».
E6 «Cobranza: una sola política para todas las sedes y programas».
```

### G6 · ORGANIZACIÓN (Empresas · Filiales · Roles · Permisos · Usuarios)

```
TÍTULO: «ORGANIZACIÓN — sedes, roles y accesos». Subtítulo: «Estado actual · 30 oct 2026».

FLUJO PRINCIPAL:
1. «Empresas» (razón social, RUC) → «Filiales» (sedes: dirección, empresa) → alimenta contrato y ficha de la matrícula.
2. «Sede» → selector «Vista Global / sede» del encabezado, marcado «TEMPORAL (solo pruebas)» en gris punteado; flecha ámbar a 3 módulos. Flecha roja ✖ discontinua de «Sesión + asignaciones» hacia todos los módulos: así se limitará por sede en el futuro.
3. «Roles» → «Permisos» (catálogo de 67 acciones) → hexágono «can(PERM.x)» → pantallas.
4. «Usuarios» ← creados desde «Personal»; hoy el único usuario es el «Superusuario» (todo permitido).
5. «Inicio de sesión»: nodo gris punteado con ✖ (no existe).

PUNTOS ROTOS E INCONSISTENCIAS:
E1 «No existe inicio de sesión ni roles reales: Usuarios y Roles no tienen efecto».
E2 «De 67 permisos solo ~40 se consultan; muchas pantallas no llaman a can()».
E3 «El ‘N usuarios asignados’ de cada rol es un número fijo, no calculado».
E4 «El alcance por sede no existe: depende de sesión y asignaciones (por id, hoy por nombre)».
E5 «Dos listas de roles (Organización vs rol del sistema de la asignación)».
E6 «Auditoría muestra siempre ‘Superadmin’ porque no hay usuarios que ingresen».
Resuelto ✓: «Renombrar una sede corrige asignaciones, cuentas y copias en matrículas».
```

### G7 · REPORTES (8 reportes) + AUDITORÍA

```
TÍTULO: «REPORTES — todo se calcula, nada se guarda». Subtítulo: «Estado actual · 30 oct 2026».

FLUJO PRINCIPAL:
Fila superior: 5 cilindros de origen «Matrículas», «Pagos y caja», «Stock y kardex», «Personal y planilla», «Agenda».
Debajo, 8 paneles: «Matrículas», «Cartera», «Caja», «Verificación», «Stock», «Psicopedagogía», «Personal», «Auditoría».
Cada panel con inputs «Período», «Sede», más un filtro propio, y dos botones «PDF» y «CSV». Flechas verdes de cada origen a su reporte.
«Auditoría» recibe flechas de 9 módulos (Matrículas, Pagos, Caja, Caja chica, Planilla, Contratos, Psicopedagogía, Cobranza, Logística) y
se muestra en «Sistema → Auditoría» y «Reportes → Auditoría» (misma línea de tiempo).

PUNTOS ROTOS E INCONSISTENCIAS:
E1 «Sin cortes históricos: todo se calcula a hoy, no se puede ver ‘cómo estaba el mes pasado’».
E2 «Auditoría no registra quién cambió precios, recetas, tarifarios ni permisos».
E3 «Cartera y Psicopedagogía usan piezas propias y permisos distintos a ‘ver reportes’».
E4 «Reloj local del navegador, no hora de Lima, en plazos de 24 h y ‘hoy’».
E5 «Datos de ejemplo con kardex de 2024 hacen que Stock marque todo como sin movimiento».
E6 «Enrutado por NOMBRE del ítem: Reportes comparte nombres con pantallas operativas y se resuelve con una excepción».
```

### G8 · SISTEMA (Auditoría · Solicitudes pendientes · Cierres · Reaperturas · Preferencias · Ayuda)

```
TÍTULO: «SISTEMA — control y aprobaciones». Subtítulo: «Estado actual · 30 oct 2026».

FLUJO PRINCIPAL:
1. Origen en Matrículas: acciones «Solicitar caída», «Reactivar», «Cambiar programa», «Trasladar sede» (inputs «Motivo», «Detalle», «Fecha»).
2. Menú «Solicitudes pendientes» → panel «Aprobar / Rechazar» (permiso + motivo) → hexágonos «previewDrop», «previewReactivation»,
   «applyProgramChange», «applyTransfer» → efectos sobre Matrícula, Plan, Agenda, Actividades, Verificación.
3. Menú «Cierres» → «Arqueo y cierre de caja» bloquea reversas en días cerrados. Menú «Reaperturas» → panel «Reabrir» (motivo) → deja registro.
4. Menú «Auditoría» → línea de tiempo única.
5. «Preferencias» y «Ayuda»: nodos gris punteados con etiqueta «En construcción» y ✖.

PUNTOS ROTOS E INCONSISTENCIAS:
E1 «Preferencias y Ayuda siguen en construcción».
E2 «Las aprobaciones no notifican al solicitante (sin mensajería real)».
E3 «Sin login, el ‘quién aprobó’ es siempre el mismo usuario».
E4 «Caída: una solicitud pendiente deja la matrícula activa y sin aviso en el Dashboard salvo el contador».
E5 «Autoridad de aprobación definida por permisos de un solo usuario: no probada con roles reales».
```

### G9 · DASHBOARD + MENSAJERÍA

```
TÍTULO: «DASHBOARD Y MENSAJERÍA — lo que ve el usuario al entrar». Subtítulo: «Estado actual · 30 oct 2026».

FLUJO PRINCIPAL:
1. Menú «Resumen general» → 7 tarjetas KPI: «Matrículas activas», «Cartera pendiente», «Pagos del día», «Verificaciones pendientes»,
   «Matrículas por vencer», «Alertas de stock», «Solicitudes». Cada tarjeta con flecha verde de regreso a su módulo de origen
   (Matrículas, Planes y cartera, Pagos, Verificación, Matrículas, Stock, Solicitudes pendientes).
2. Paneles «Vencimientos próximos» y «Por sede».
3. Menú «Mensajería» → panel «Mensajes» (inputs «Destinatario», «Canal», «Texto»).

PUNTOS ROTOS E INCONSISTENCIAS:
E1 «‘Alertas del sistema’ y ‘Actividad reciente’ abren el mismo Dashboard: no existe centro de alertas».
E2 «Alertas que faltan: stock bajo por sede, actividades sin responsable, contratos por vencer, cierres pendientes, recetas faltantes».
E3 «Mensajería no envía por WhatsApp ni correo: solo prepara y registra».
E4 «Actividad reciente no usa la Auditoría única».
```

### G10 · MAPA GENERAL (portada del juego completo)

```
TÍTULO: «SISTEMA ENSIL — mapa general de conexiones». Subtítulo: «Estado actual · 30 oct 2026».

Centro de la imagen: un gran cilindro gris «ESTADO EN MEMORIA (DataContext)» con una insignia roja E1 «Sin base de datos: al recargar
se pierde todo». Alrededor, en círculo, los 9 grupos como rectángulos índigo: «Operación», «Logística», «Psicopedagogía», «Personas»,
«Oferta comercial», «Organización», «Reportes», «Sistema», «Dashboard / Mensajería».
Flechas VERDES entre grupos que funcionan: Oferta comercial → Operación (precio y plan), Operación → Logística (entrega de materiales),
Operación → Psicopedagogía (primera asesoría), Personas → Operación (titular y alumno), todos → Reportes, todos → Sistema/Auditoría.
Flechas ROJAS ✖: Personas(Planilla) → Operación(Caja); Personas(Contratos) → Psicopedagogía(Agenda); Organización(Sede) → todos los
módulos; Organización(Roles) → todas las pantallas; Operación → mensajes automáticos (WhatsApp/correo); Operación → facturación electrónica (SUNAT).
Cuadro inferior «LOS 6 HUECOS GRANDES»: E1 persistencia, E2 inicio de sesión y roles, E3 alcance por sede según la sesión, E4 facturación electrónica,
E5 envío automático de mensajes, E6 almacenamiento de archivos.
```

---

## 3. Cómo usarlos

1. Higgsfield → generación de imagen → elige el modelo que mejor maneje texto (prueba 2 y compara).
2. Pega el **prompt maestro** y, debajo, el del grupo. Formato **2:3** (o 3:4), resolución máxima.
3. Genera 4 variantes por grupo, elige la de texto más legible y **corrige las etiquetas** que salgan mal en Canva o Figma.
4. Escala la elegida con el escalador a ~3500 × 5000 px y exporta a PDF A3 (300 dpi).
5. Orden sugerido de entrega: G10 (portada) → G1 → G2 → G3 → G4 → G5 → G6 → G7 → G8 → G9.

> Nota: lo marcado ✓ se resolvió y se verificó el 2026-10-30 (modelo de datos y reportes). Lo marcado E# sale de
> `docs/PENDIENTES_SISTEMA.md` y de la revisión del código; si se resuelve algo, actualizar este documento.
