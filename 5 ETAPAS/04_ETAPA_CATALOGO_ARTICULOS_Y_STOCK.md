# ETAPA 4 — CATÁLOGO DE ARTÍCULOS, RECETAS, PRECIOS DE VENTA Y STOCK

Esta etapa debe respetar que el catálogo maestro YA EXISTE en:

`Logística → Catálogo de artículos`

NO crear otro catálogo en Configuración.

Antes de modificar, relee `REVISIÓN PROYECTO.MD`.

## PROTOCOLO OBLIGATORIO DE INTERRUPCIÓN Y SEGURIDAD

1. Inspecciona primero la implementación real.
2. Si algo solicitado ya existe total o parcialmente, NO lo dupliques:
   - conserva lo correcto;
   - aplica solo el delta faltante.
3. Si existe contradicción entre este prompt, `REVISIÓN PROYECTO.MD` y el código, **DETENTE** y pregunta.
4. Si un cambio puede romper rutas, datos, estado global o componentes compartidos, **DETENTE** y pregunta.
5. No inventes reglas de negocio.
6. No elimines funcionalidades ajenas.
7. Mantén la arquitectura modular existente.
8. Al finalizar, actualiza `REVISIÓN PROYECTO.MD`.

## OBJETIVO

Ajustar el Catálogo de artículos existente para que sea la única fuente maestra de:

- materiales educativos;
- herramientas/adicionales;
- libros;
- paquetes logísticos;

y conectarlo correctamente con:

- Recetas;
- Verificación;
- Stock;
- Ventas;
- precios vigentes.

---

## 1. TIPOS EXISTENTES — CONSERVAR

Mantén estas cuatro categorías:

1. Material educativo.
2. Herramienta / adicional.
3. Libro.
4. Paquete logístico.

No crear una quinta categoría salvo instrucción explícita futura.

---

## 2. LIBRO — AGREGAR TIPO DE LIBRO

En el formulario `Libro`, agregar:

`Tipo de libro *`

Opciones:
- Anillado.
- Encolado.

No inferirlo por el nombre.

### Uso
- Anillado: normalmente material de programa.
- Encolado: puede ser vendible y tener precio comercial.

No conviertas estas descripciones en restricciones rígidas si los checkboxes existentes permiten excepciones.

---

## 3. ¿SE ENTREGA POR MATRÍCULA?

Debe significar:

> El artículo está habilitado para ser seleccionado dentro de una Receta de matrícula.

NO significa que se entrega automáticamente a todo alumno.

### Conexión con Recetas

En:
`Crear/Editar Receta → Agregar Artículo`

cargar artículos:
- activos;
- habilitados para matrícula cuando corresponda;
- sin duplicar la fuente de artículos.

Receta sigue siendo quien decide qué materiales corresponden a cada programa/nivel.

---

## 4. ¿SE VENDE? Y PRECIOS DE VENTA

No guardes un único precio mutable dentro del artículo si la arquitectura actual permite separar precios.

Debe soportar:

- precio general;
- precio por sede opcional;
- vigencia;
- moneda;
- historial.

### Comportamiento
Si `¿Se vende? = Sí`:
- habilitar una acción tipo `Configurar precios de venta`;
- permitir precio general;
- permitir excepciones por sede;
- no sobrescribir históricos: crear nuevas vigencias.

La tabla del catálogo puede mostrar el precio vigente.

Si ya existe un modelo de precios reutilizable, úsalo. No dupliques estructuras.

---

## 5. PAQUETE LOGÍSTICO

Conservar:
- `¿Se entrega por matrícula?`;
- `¿Permite desempaquetado?`;
- `Composición del paquete`.

### Regla
Si `Permite desempaquetado = Sí`:
- la composición debe ser obligatoria;
- debe definir artículos y cantidades.

Si `Permite desempaquetado = No`:
- la composición puede ser opcional/informativa;
- el paquete se controla como UNA unidad de stock.

### Caso real
`Paquete 8 libros KIDS`:
- se recibe empaquetado;
- se almacena empaquetado;
- se entrega empaquetado;
- no se descompone por títulos en matrícula;
- stock = cantidad de paquetes.

---

## 6. MATERIAL EDUCATIVO — METADATOS PEDAGÓGICOS

Conservar si ya existen:
- Sesiones;
- Modo de entrenamientos;
- Gimnasias por sesión;
- Entrenamientos por sesión.

Pero:
- mantenerlos opcionales;
- no usarlos como condición del flujo Matrícula → Receta → Verificación → Stock;
- no introducir lógica pedagógica nueva aquí.

---

## 7. NO AGREGAR “CONTROLA STOCK” SIN NECESIDAD

No agregues un checkbox nuevo `Controla stock` por defecto.

El Catálogo representa inventario físico/logístico.

Solo crea esa distinción si el sistema actual ya maneja artículos no inventariables y existe una necesidad real documentada.

---

## 8. FLUJO LOGÍSTICO REQUERIDO

Debe quedar preparado:

`Catálogo de artículos`
→ `Receta Programa/Nivel`
→ `Matrícula`
→ `Verificación`
→ `Salida de stock de sede`

Cuando un artículo requerido no tiene stock:
- aparece deshabilitado/gris en Verificación;
- no puede marcarse como entregado;
- la verificación puede quedar incompleta.

Si Verificación todavía no está implementada, prepara contratos/helpers y documenta el pendiente. No rehagas un módulo inexistente desde cero sin confirmación.

---

## 9. VENTA DE ARTÍCULOS

Para artículos vendibles:

- precio vigente;
- stock de sede;
- venta;
- futura creación de ingreso en Caja;
- salida de stock.

No implementes una Caja paralela si ya existe. Integra mediante la arquitectura actual.

---

## 10. PRUEBAS MÍNIMAS

Valida:

- Libro Anillado.
- Libro Encolado vendible.
- Herramienta vendible.
- Material educativo entregable por matrícula.
- Paquete 8 libros sin desempaquetado.
- Paquete con desempaquetado y composición obligatoria.
- Receta selecciona artículos válidos.
- precio vigente general;
- precio específico por sede si ya está soportado.
