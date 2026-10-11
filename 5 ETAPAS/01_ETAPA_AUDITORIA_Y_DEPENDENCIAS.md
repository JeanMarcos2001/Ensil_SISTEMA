# ETAPA 1 — AUDITORÍA TÉCNICA Y ESTABILIZACIÓN DE DEPENDENCIAS

Actúa como desarrollador fullstack senior trabajando directamente en este proyecto mediante Claude Code.

El objetivo de esta primera etapa es **conocer el estado real del proyecto antes de tocar la lógica**, validar qué correcciones ya existen y preparar una base segura para las siguientes cuatro etapas.

## PROTOCOLO OBLIGATORIO DE INTERRUPCIÓN Y SEGURIDAD

Antes de modificar cualquier archivo:

1. Inspecciona la implementación real y las dependencias del módulo afectado.
2. Si detectas que un cambio solicitado **ya fue aplicado total o parcialmente**, NO lo dupliques ni lo reescribas por defecto:
   - compara lo existente con este prompt;
   - conserva lo correcto;
   - aplica únicamente el delta faltante.
3. Si encuentras una contradicción entre este prompt, `REVISIÓN PROYECTO.MD`, el código actual o una decisión implementada previamente, **DETENTE** y pregunta antes de cambiar nada.
4. Si una modificación exige cambiar una ruta, contrato de datos, estado global, componente compartido o API usada por otros módulos y no puedes garantizar compatibilidad, **DETENTE** y pregunta.
5. No inventes reglas de negocio para cubrir vacíos. Pregunta indicando:
   - archivo/componente afectado;
   - comportamiento actual;
   - comportamiento solicitado;
   - decisión exacta que necesitas del usuario.
6. No elimines funcionalidades, rutas, estilos, datos mock, permisos o componentes existentes que no sean parte explícita de esta etapa.
7. Prioriza cambios aditivos, compatibles y fáciles de revertir.
8. Mantén la arquitectura modular existente. No crees archivos monolíticos ni componentes excesivamente grandes si pueden separarse por responsabilidad.
9. Al finalizar la etapa:
   - ejecuta las validaciones disponibles;
   - revisa manualmente los flujos modificados;
   - actualiza `REVISIÓN PROYECTO.MD` indicando qué se cambió, qué archivos se tocaron, qué quedó pendiente y qué verificaciones se realizaron.

## 1. PRIMERA ACCIÓN OBLIGATORIA

Localiza y lee por completo el archivo:

`REVISIÓN PROYECTO.MD`

No empieces a modificar código hasta haberlo revisado.

Después inspecciona el código real de:

- Configuración → Programas.
- Configuración → Niveles.
- Configuración → Tipos de pago.
- Configuración → Tarifarios.
- Configuración → Promociones.
- Configuración → Recetas.
- Operación → Registrar nueva matrícula.
- Logística → Catálogo de artículos.
- mocks, stores, contextos, hooks, servicios o utilidades que alimenten estos módulos.

## 2. DOS CAMBIOS QUE PUEDEN ESTAR YA APLICADOS MANUALMENTE

El usuario indicó que probablemente ya fueron aplicados:

### A. Tarifario con nivel opcional
Debe existir la posibilidad de relacionar un tarifario con:
- Programa;
- Nivel, solo cuando el programa utiliza niveles;
- Tipo de pago.

### B. Tipo de pago desacoplado de programas
`Tipo de pago` debe definir la modalidad de pago, no ser la fuente que decide qué programas pueden usarlo.

La relación efectiva:
`Programa / Nivel + Tipo de pago`
debe resolverse mediante el Tarifario.

### Instrucción
Verifica ambos puntos.

- Si ya están correctamente aplicados, NO los vuelvas a implementar.
- Si están parcialmente aplicados, documenta exactamente qué falta y corrige solo ese faltante.
- Si corregirlo implica romper mocks, rutas o formularios actuales, detente y pregunta.

## 3. MAPA DE DEPENDENCIAS

Identifica qué fuente alimenta cada selector/regla de `Registrar nueva matrícula`:

- Sede.
- Fecha de matrícula.
- Origen del lead.
- Responsable de entrevista.
- Titulares.
- Alumnos.
- Programa.
- Nivel.
- Tipo de pago.
- Tarifario/precio.
- Promoción.
- Pago inicial / cronograma.
- Resumen.

En Configuración identifica las estructuras que representan:

- programas;
- niveles;
- tipos de pago;
- tarifarios;
- promociones;
- recetas;
- artículos.

No implementes Supabase ni una BD nueva si estos módulos aún trabajan con mocks. Mantén la capa actual y deja clara la fuente única de verdad de cada dato.

## 4. ESTABILIZACIÓN DE CONTRATOS DE DATOS

Sin cambiar reglas de negocio, revisa y unifica SOLO cuando sea seguro:

- IDs de programa, nivel, tipo de pago, tarifario, promoción, receta y artículo;
- `active/activo/status/estado`;
- fechas de vigencia;
- moneda;
- sede;
- referencias entre entidades.

No hagas una migración grande. El objetivo es evitar incompatibilidades entre etapas.

## 5. RESULTADO ESPERADO

Al terminar debe existir:

1. Inventario del estado actual en `REVISIÓN PROYECTO.MD`.
2. Confirmación de si los dos cambios manuales están correctamente aplicados.
3. Lista de archivos afectados por las siguientes etapas.
4. Cero regresiones visibles.
5. La aplicación sigue funcionando, salvo correcciones pequeñas y seguras detectadas durante la auditoría.

## 6. VALIDACIONES

Ejecuta lo disponible:

- lint;
- typecheck;
- tests;
- build.

Si algo ya fallaba antes, documenta el error y no lo atribuyas a esta etapa.
