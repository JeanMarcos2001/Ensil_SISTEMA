# ETAPA 5 — INTEGRACIÓN END-TO-END DEL WIZARD “REGISTRAR NUEVA MATRÍCULA”

Esta es la etapa final. Solo ejecútala cuando las Etapas 1–4 estén terminadas y `REVISIÓN PROYECTO.MD` confirme que no existen regresiones conocidas.

## PROTOCOLO OBLIGATORIO DE INTERRUPCIÓN Y SEGURIDAD

1. Inspecciona primero la implementación real.
2. Si algo solicitado ya existe total o parcialmente, NO lo dupliques.
3. Si existe contradicción entre este prompt, `REVISIÓN PROYECTO.MD` y el código, **DETENTE** y pregunta.
4. Si un cambio puede romper rutas, contratos de datos, estado global o componentes compartidos, **DETENTE** y pregunta.
5. No inventes reglas de negocio.
6. No elimines funcionalidades ajenas.
7. Mantén la arquitectura modular y evita componentes monolíticos.
8. Al finalizar, actualiza `REVISIÓN PROYECTO.MD`.

## OBJETIVO

Conectar en el frontend/mock actual todos los catálogos y reglas ya corregidos al wizard de seis pasos:

1. Contexto.
2. Titulares.
3. Alumnos.
4. Programa.
5. Pago y cronograma.
6. Resumen.

No conectes una nueva BD salvo que el proyecto ya la use para estos módulos.

---

# PASO 1 — CONTEXTO

Inputs esperados:

- Sede.
- Fecha de matrícula.
- Origen del lead.
- Responsable de la entrevista.
- Observación general.

### Sede
Para usuario de filial:
- debe provenir de su sesión/perfil;
- no debe poder cambiarla manualmente.

Para Superadmin:
- respeta el comportamiento ya definido.
- si no está definido si registra en nombre de una sede, detente y pregunta.

### Fecha
- no puede ser futura;
- fecha/hora real de creación es automática y separada.

### Responsable
Debe provenir del personal activo de la sede.

---

# PASO 2 — TITULARES

La UI debe soportar:

## Independiente
- capturar la persona una sola vez;
- reutilizar esa misma entidad como alumno;
- no duplicar internamente sus datos.

## Con apoderado

Titular principal:
- nombres;
- apellidos;
- tipo documento;
- número documento;
- fecha nacimiento;
- edad derivada;
- teléfono;
- correo;
- dirección;
- estado civil.

Titular secundario:
- nombres;
- apellidos;
- tipo documento;
- número documento;
- fecha nacimiento;
- edad derivada;
- teléfono.

Conservar titulares adicionales solo si ya están soportados o claramente previstos. No inventar campos.

---

# PASO 3 — ALUMNOS

- Alumno 1 aparece por defecto.
- `+ Agregar alumno` crea Alumno 2, 3, etc.
- cada alumno terminará en una matrícula independiente.
- documento del alumno se valida con las reglas existentes.
- edad se deriva de la fecha de nacimiento.
- parentesco se usa cuando corresponde.
- para independiente, reutilizar la persona y dejar parentesco nulo si esa es la estructura actual.

No asignar correlativo definitivo mientras sea borrador.

---

# PASO 4 — PROGRAMA

Por cada alumno:

## 4.1 Programa
Mostrar solo programas:
- activos;
- disponibles para la sede.

## 4.2 Nivel
Si el programa utiliza niveles:
- mostrar selector;
- cargar niveles activos del programa.

Si no:
- omitir o deshabilitar el selector.

## 4.3 Tipo de pago
NO cargar opciones hardcodeadas.

Buscar Tarifarios:
- activos;
- vigentes para la fecha de matrícula;
- compatibles con Programa + Nivel.

Los tipos de pago disponibles deben salir de esos tarifarios.

## 4.4 Precio
Al elegir tipo de pago:
- seleccionar tarifario correspondiente;
- mostrar total y moneda;
- bloquear edición manual del precio.

## 4.5 Promociones
Cuando existan suficientes alumnos/configuraciones:
- ejecutar motor de promociones de Etapa 3;
- mostrar promociones disponibles;
- permitir aplicar una;
- validar grupo;
- guardar grupo promocional y costo asignado por matrícula.

---

# PASO 5 — PAGO Y CRONOGRAMA

El contenido cambia según modalidad.

## A. Contado individual

Mostrar pago inmediato.

Debe permitir:
`+ Agregar parte de pago`

Cada parte puede incluir:
- moneda;
- monto;
- TC si PEN;
- medio de pago;
- banco/entidad si aplica;
- número de operación si aplica;
- evidencia;
- descripción/nota.

Validar que la suma equivalente cubra exactamente el total.

Preparar:
- pago;
- partes del pago;
- ingreso en Caja según arquitectura actual.

## B. Contado con promoción

Un solo bloque de pago para todo el grupo.

Misma lógica de partes de pago.

Mostrar:
- promoción aplicada;
- alumnos cubiertos;
- total promocional;
- reparto interno informativo;
- un único pago.

## C. Contado en 2 partes

No tratarlo como Contado inmediato.

Generar/mostrar cronograma de 2 obligaciones para `Planes`.

### IMPORTANTE
Si todavía existe ambigüedad en el código respecto a cuándo se define el monto de cada parte, **DETENTE** y pregunta.

No asumas una versión diferente a lo documentado en `REVISIÓN PROYECTO.MD`.

## D. Plan 2 / 3 / 6 / 9 / futuros

Usar el desglose del Tarifario.

Para Profesional:
- Matrícula y Cuota 1 pueden aparecer en líneas separadas con vencimiento día 0;
- siguientes cuotas cada 30 días exactos.

No pedir comprobante/voucher en el wizard si el pago real se gestiona después desde Planes.

---

# PASO 6 — RESUMEN

Crear una vista legible y final, no un conjunto de inputs desordenados.

Mostrar:

## Contexto
- sede;
- fecha;
- origen;
- responsable.

## Titulares
- datos capturados.

## Alumnos/matrículas
Por alumno:
- persona;
- programa;
- nivel;
- tipo de pago;
- tarifario;
- costo asignado;
- promoción si aplica.

## Pago
Si Contado:
- total requerido;
- partes;
- equivalencias/TC;
- evidencias.

Si Plan:
- cronograma.

## Promoción
Si aplica:
- nombre;
- grupo;
- total;
- reparto.

Botón final:
`Guardar matrículas`

---

# GUARDADO LÓGICO

Aunque todavía se use mock, simula una operación coherente y atómica.

Al guardar:

1. Crear una matrícula por alumno.
2. Asignar correlativo global solo al confirmar guardado definitivo.
3. Registrar grupo promocional si aplica.
4. Registrar costo asignado por matrícula.
5. Si fue Contado:
   - crear un pago;
   - crear partes;
   - preparar/crear movimiento de Caja según arquitectura actual.
6. Si fue Plan o Contado en 2 partes:
   - crear Plan activo y obligaciones programadas.
7. Estado inicial de verificación:
   - `Pendiente`.
8. Habilitar acciones posteriores existentes:
   - Ver;
   - Generar contrato;
   - Generar ficha;
   - Verificar.

No inventes acciones nuevas que requieran módulos aún inexistentes; documenta el pendiente.

---

# COMPATIBILIDAD POSTERIOR

Comprueba que el resultado sea compatible con:

- Verificación y Recetas.
- Stock.
- Planes.
- Promociones.
- Caja.
- Traslados.
- Caídas/cancelaciones.
- Auditoría futura.

---

# PRUEBAS END-TO-END

Ejecuta al menos:

### Caso 1
1 alumno Kids, Contado.

### Caso 2
2 alumnos elegibles para promoción, Contado, pago grupal.

### Caso 3
2 alumnos no elegibles por precio base distinto.

### Caso 4
Profesional Plan 3.

### Caso 5
Profesional Plan 6.

### Caso 6
Contado con varios medios/partes de pago.

### Caso 7
Programa con niveles.

### Caso 8
Programa sin niveles.

### Caso 9
Tarifario vencido/inactivo.

### Caso 10
Promoción vencida/inactiva.

---

# CIERRE DE ETAPA

Antes de finalizar:

1. Ejecuta lint/build/tests disponibles.
2. Navega manualmente los seis pasos.
3. Comprueba volver atrás/adelante sin perder datos.
4. Comprueba que agregar/eliminar alumnos recalcule promociones.
5. Comprueba que cambiar programa/nivel/tipo de pago invalide correctamente selecciones dependientes.
6. Comprueba que no existan precios o tipos de pago hardcodeados donde deban venir de Configuración.
7. Actualiza `REVISIÓN PROYECTO.MD` con el estado final.
