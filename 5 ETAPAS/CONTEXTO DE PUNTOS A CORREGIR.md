Sí. Revisando lo que ya definimos y los pantallazos actuales, **la idea general está bien encaminada**, pero ahora mismo hay varias conexiones que todavía se contradicen entre sí. Antes de conectar a Supabase conviene corregirlas, porque de lo contrario el frontend terminaría funcionando con reglas distintas a las que luego tendrá la BD.

La decisión más importante que veo en tus pantallas es esta:

> **Programa pasa a ser la familia principal y Nivel pasa a ser una entidad hija.**

Por ejemplo:

- Programa **Pre-Kids**
  - Nivel 1
  - Nivel 2
- Programa **Kids**
  - Nivel 1
  - Nivel 2
  - Nivel 3
- Programa **Profesional**
  - sin niveles de matrícula.

Esto me parece **mejor** que tratar `Kids 1`, `Kids 2`, `Kids 3` como programas independientes. Profesional no debe tener niveles 1–20 en matrícula: sus etapas 1–5, 6–10, etc. siguen siendo **materiales/etapas de entrega**, no niveles de inscripción.

---

# 1. Mapa maestro de conexiones

La configuración debería funcionar conceptualmente así:

```text
PROGRAMA
   │
   ├──> NIVELES (si el programa los usa)
   │
   ├──> RECETA DE MATERIALES
   │         │
   │         └──> Verificación + Stock
   │
   └──────────────┐
                  │
TIPO DE PAGO ─────┼──> TARIFARIO
                  │       │
                  │       ├── Precio
                  │       ├── Cronograma
                  │       └── Vigencia
                  │
                  └──────────────> PROMOCIONES
                                      │
                                      └──> Matrícula

FILIAL + PERSONAL + ORIGEN LEAD
              │
              └──────────────────────> Matrícula
```

Y después de guardar:

```text
MATRÍCULA
   ├── Contado ───────> Pago ──────> Caja
   ├── Plan ──────────> Planes ─────> Pago cuota ──> Caja
   ├── Receta ────────> Verificación ──> Stock
   ├── Promoción ─────> Pago grupal ──> Caja
   └── Contrato/Ficha PDF
```

Ese debería ser el mapa rector.

---

# 2. Programa: la pantalla está casi correcta

Tu pantalla **Crear Nuevo Programa** puede mantenerse prácticamente como está.

### Lo que realmente afecta matrícula

`Código oficial`
: identificador técnico. Una vez usado no debería cambiar.

`Nombre oficial`
: Pre-Kids, Kids, Profesional.

`Tiene niveles`
: define si en matrícula aparecerá un segundo selector.

Ejemplo:

```text
Programa: Kids
↓
Nivel: Kids 1 / Kids 2 / Kids 3
```

Si:

```text
Programa: Profesional
Tiene niveles = NO
```

entonces no aparece selector de nivel.

`Sedes habilitadas`
: correcto. Sirve para que una filial solo pueda seleccionar programas habilitados en ella.

`Estado`
: si queda inactivo, deja de aparecer para nuevas matrículas, pero **no afecta las anteriores**.

### Campos que no conducen actualmente ninguna lógica

- duración base
- garantía
- alias
- descripción
- observaciones

Pueden quedarse, pero por ahora son metadatos. No deben mezclarse con tarifas ni planes.

---

# 3. Niveles: correcta, pero depende estrictamente de Programa

La pantalla está bien estructurada:

```text
Programa Padre
Código
Nombre
Orden
Estado
Descripción
```

Pero debe existir una validación:

> Solo pueden crearse niveles dentro de programas donde `Tiene niveles = Sí`.

Y `Orden` debería proponerse automáticamente.

Ejemplo:

```text
Kids
 ├─ Kids 1 → orden 1
 ├─ Kids 2 → orden 2
 └─ Kids 3 → orden 3
```

No debería salir manualmente `5` por defecto como veo ahora.

---

# 4. Aquí encuentro el primer problema importante: Tipo de Pago

Tu pantalla actual mezcla **tres conceptos diferentes**.

Actualmente contiene:

- cantidad de cuotas
- plazo
- permite pago parcial
- máximo parciales por cuota
- programas seleccionados

Pero nuestra lógica real es más precisa.

## Yo cambiaría esta pantalla

### Datos principales

```text
Código
Nombre

Modalidad del cronograma:
○ Pago inmediato
○ Cuotas con intervalo fijo
○ Fechas manuales
```

Esto resuelve:

### Contado

```text
Modalidad: Pago inmediato
N° obligaciones: 1
```

### Contado en 2 partes

```text
Modalidad: Fechas manuales
N° obligaciones: 2
```

### Plan 6

```text
Modalidad: Intervalo fijo
N° cuotas: 6
Intervalo: 30 días
```

---

## Y quitaría de aquí “Permite pago parcial”

Porque estamos confundiendo dos cosas distintas.

Un cliente puede pagar $700 contado mediante:

- S/500 Yape
- S/500 Yape
- S/500 Yape
- resto en efectivo

Eso **no es una cuota parcial**.

Es:

> **un mismo pago compuesto por varias partes o medios de pago.**

Ese comportamiento debe vivir en el módulo **Pago**, no en `Tipo de Pago`.

Por tanto, el botón:

> Permite pago parcial

como está planteado ahora, yo **lo quitaría por el momento**.

---

# 5. Segundo problema: no asignaría Programas dentro de Tipo de Pago

Ahora tienes:

> Aplica a todos los programas  
> Programas seleccionados

Pero después, en Tarifario, nuevamente eliges:

> Programa + Tipo de Pago

Eso crea dos fuentes de verdad.

Podría ocurrir esto:

```text
Tipo Pago:
Plan 6 → solo Profesional

Tarifario:
Kids + Plan 6
```

¿Quién gana?

No deberíamos permitir esa contradicción.

### Mejor solución

`Tipo de Pago` define solamente **cómo funciona**.

Y `Tarifario` define:

> qué programa puede utilizar qué tipo de pago.

Por tanto:

```text
TIPO DE PAGO
Plan 6
↓
TARIFARIO
Profesional + Plan 6
```

Si no existe ese tarifario, esa combinación simplemente no existe.

Eso hace el sistema considerablemente más robusto.

---

# 6. Tarifario necesita una corrección importante

Aquí es donde se conecta:

```text
Programa
+ Nivel
+ Tipo de Pago
+ Precio
+ Cronograma
+ Vigencia
```

Tu pantalla actualmente no tiene **Nivel**.

Yo lo agregaría.

Ejemplo:

```text
Programa: Kids
Nivel: Kids 2
Tipo de pago: Contado
Precio: USD 500
```

Aunque hoy Kids 1, 2 y 3 cuesten igual, mañana podría cambiar uno y tu sistema ya estaría preparado.

---

## Moneda

Ahora veo `Soles (PEN)`.

Para tus programas debería normalmente ser:

```text
USD
```

Porque tus precios comerciales están definidos en dólares.

El PEN aparece cuando **el cliente paga**, aplicando el TC.

No deberíamos convertir el tarifario nacional a soles.

---

# 7. Simplificaría “Matrícula incluida” y “Artículos incluidos”

Aquí también veo una posible sobreingeniería.

Los materiales no deberían formar parte del tarifario.

Para eso ya tienes:

> **Receta**

Por tanto yo eliminaría:

> Artículos incluidos en el precio base.

El tarifario no debería preocuparse por libros, módulos ni maletines.

---

## La matrícula adicional sí existe

Eso sí es real para Profesional Plan 3/6/9.

Pero lo modelaría directamente en el **desglose**.

### Plan 3 profesional

```text
Concepto           Monto     Vencimiento
Matrícula          $300      Día 0
Cuota 1            $300      Día 0
Cuota 2            $300      Día 30
Cuota 3            $300      Día 60
-----------------------------------------
TOTAL              $1200
```

En vez de mantener:

```text
Precio Base
+
Matrícula adicional
```

como dos lógicas independientes.

---

# 8. Generar desglose debería ser el corazón del Tarifario

Ejemplo Plan 6:

```text
Matrícula     $200       día 0
Cuota 1       $200       día 0
Cuota 2       $200       día 30
Cuota 3       $200       día 60
Cuota 4       $200       día 90
Cuota 5       $200       día 120
Cuota 6       $200       día 150
--------------------------------
TOTAL        $1400
```

El `Precio Total` debería salir de esa suma.

No al revés.

Esto evita que alguien configure:

```text
Precio total = 1400
```

pero por error cree cuotas por:

```text
1350
```

---

# 9. Contado en 2 partes necesita tratamiento especial

Aquí todavía encuentro **un hueco histórico que debemos cerrar**.

Hemos manejado dos versiones durante la conversación:

### Versión antigua

En matrícula se definían:

- fecha 1
- monto 1
- fecha 2
- monto 2

### Tu aclaración posterior

En matrícula se definen las fechas, pero **el monto real del primer adelanto se registra cuando realmente se paga en Planes**, y la segunda parte se calcula con el saldo.

Considero que esta última versión es más coherente.

Yo propondría definitivamente:

### Matrícula

```text
Total objetivo: $500
Fecha compromiso 1: manual
Fecha compromiso 2: manual
```

### Planes → registrar primer pago

```text
Pagó: $180
```

Entonces:

```text
Saldo segunda parte:
$500 - $180 = $320
```

Necesito que confirmemos esta última interpretación antes de programarlo.

---

# 10. Promociones: la pantalla actual todavía no representa exactamente tu lógica

Está cerca, pero actualmente obliga a:

> Composición del grupo → Programa + cantidad.

Tu lógica real es más flexible.

Ejemplo:

```text
Cantidad requerida: 2

Tipo de pago:
Contado

Condición:
Precio contado base = $500

Programas elegibles:
Pre-Kids
Kids

Precio promocional:
$700
```

Entonces serían válidas automáticamente:

```text
PreKids 1 + Kids 2
Kids 1 + Kids 3
PreKids 2 + PreKids 1
Kids 2 + Kids 2
```

Siempre que ambos tengan tarifario contado = $500.

---

## Cómo debería verse Crear Promoción

### Condiciones

```text
Nombre
Código

Cantidad alumnos: 2

Tipo de pago requerido:
Contado

Precio contado requerido:
USD 500

Programas elegibles:
☑ Pre-Kids
☑ Kids

Precio promocional:
USD 700

Reparto:
Igualitario

Permitir múltiples grupos:
Sí

Vigencia
Sedes
Estado
```

Y para Profesional:

```text
Cantidad: 2
Base contado requerido: $1000
Programas: Profesional
Promo total: $1700
```

---

# 11. Receta: conceptualmente está bien

Esta pantalla está bastante bien diseñada.

```text
Programa
Nivel
Lista de artículos + cantidades
Vigencia
Estado
```

Ejemplo:

```text
Programa: Kids
Nivel: Kids 2

Maletín                   1
Módulo Kids 2             1
Paquete 8 libros          1
Velóptico Kids 2          1
```

Luego esa receta impacta en:

```text
Matrícula
   ↓
Verificación
   ↓
lista exacta de materiales
   ↓
Stock
```

---

## Cambio que haría

Si todas las sedes entregan el mismo kit, no necesitas realmente:

> Sedes

en la receta.

Puede mantenerse por escalabilidad, pero aumenta posibilidades de configurar accidentalmente recetas diferentes.

Yo lo dejaría como:

```text
Alcance:
○ Nacional
○ Sedes específicas
```

con Nacional por defecto.

---

# 12. Falta una configuración: Catálogo de Materiales

La receta tiene:

> Agregar artículo

pero ese artículo debe salir de algún lado.

Necesitas como mínimo un catálogo administrado por Logística/Superadmin:

```text
Material
Código
Nombre
Tipo
Unidad
Controla stock
Estado
```

Ejemplos:

```text
MAT-MALETIN
Maletín ENSIL

MAT-KIDS2
Módulo Kids 2

PACK-LIB8
Paquete 8 libros

VELO-K2
Velóptico Kids 2
```

Ese mismo catálogo alimentará:

- recetas
- stock central
- stock filiales
- transferencias
- verificación.

---

# 13. Ahora sí: los 6 pasos de Registrar Nueva Matrícula

Tu wizard actual es bueno conceptualmente. Pero necesita algunos ajustes.

---

## PASO 1 — CONTEXTO

En tu captura aparece:

- Sede
- Fecha de matrícula
- Origen lead
- Ejecutivo
- Observación.

### Corrección importante: Sede

Para usuario filial:

> **NO debe existir selector de sede.**

La sede sale automáticamente de la sesión.

Ejemplo:

```text
Usuario: filial Ayacucho
Sede: Ayacucho (bloqueado o simplemente mostrado)
```

Superadmin sí podría tener selector si registra en representación de una sede.

### Inputs finales

```text
Sede                         automático
Fecha matrícula              <= hoy
Origen del contacto          combo
Responsable de entrevista    trabajador activo sede
Observación general          opcional
```

Y oculto:

```text
Fecha/hora registro          automática
Usuario que registra         automático
```

Además cambiaría `Ejecutivo` por:

> **Responsable de la entrevista**

porque acordamos que puede seleccionarse cualquier trabajador de la filial.

---

# 14. PASO 2 — TITULARES

Antes de mostrar los formularios:

```text
¿Cómo se realizará la matrícula?

○ Alumno independiente
○ Con apoderado
```

Esto es **una decisión de interfaz**, no necesariamente una columna de matrícula.

### Con apoderado

Titular principal:

```text
Nombres
Apellidos
Tipo documento
N° documento
Nacimiento
Edad automática
Teléfono
Correo
Dirección
Estado civil
```

Titular secundario:

```text
Nombres
Apellidos
Tipo documento
N° documento
Nacimiento
Edad automática
Teléfono
```

Y:

```text
+ Agregar titular
```

si existe un tercero.

---

## Independiente

Solo se completa la persona una vez.

Después, en el paso alumno:

> el sistema reutiliza internamente esa misma persona.

No duplica registros.

---

# 15. PASO 3 — ALUMNOS

Aparece inicialmente:

> Alumno 1

Inputs:

```text
Nombres
Apellidos
Tipo documento
N° documento
Fecha nacimiento
Edad automática
Parentesco con titular
```

Botón:

```text
+ Agregar alumno
```

genera:

```text
Alumno 2
Alumno 3
Alumno 4...
```

Si es independiente:

```text
Alumno = titular
Parentesco = null
```

y los campos vienen autocompletados.

---

# 16. PASO 4 — PROGRAMA

Aquí convergen prácticamente todas las configuraciones.

Por cada alumno:

### 4.1 Programa

Se cargan únicamente:

```text
programas activos
+
habilitados para la sede
```

### 4.2 Nivel

Si:

```text
programa.tiene_niveles = true
```

se habilita:

```text
Nivel
```

Ejemplo:

```text
Programa: Kids
Nivel: Kids 2
```

---

### 4.3 Tipo de pago

Ahora el sistema busca:

```text
Tarifarios activos
vigentes hoy/fecha matrícula
para:
Kids
Kids 2
```

Y a partir de ellos sabe cuáles tipos de pago existen.

Entonces podría mostrar:

```text
○ Contado
○ Contado en 2 partes
○ Plan 2
```

No salen porque estén hardcodeados.

Salen porque **existe tarifario vigente**.

---

### 4.4 Mostrar precio

Al seleccionar:

```text
Contado
```

se encuentra:

```text
Kids 2 + Contado
USD 500
```

y aparece:

> **Costo total: $500**

bloqueado.

---

# 17. Aquí entra el motor de promociones

Supongamos:

```text
Alumno 1:
PreKids 1 → Contado → $500

Alumno 2:
Kids 2 → Contado → $500
```

El sistema consulta promociones vigentes y detecta:

```text
Promoción:
2 alumnos
base contado = $500
PreKids/Kids elegibles
total = $700
```

Entonces aparece:

> 🎁 **Promoción disponible — 2 matrículas por $700**

Botón:

> Aplicar beneficio

---

Si tienes 3 alumnos elegibles, al pulsarlo aparecen checkboxes:

```text
☑ Alumno 1
☑ Alumno 2
☐ Alumno 3
```

Y crea:

```text
Grupo Promoción #1
Total: $700
Asignación:
Alumno 1 → $350
Alumno 2 → $350
```

El tercer alumno continúa:

```text
$500
```

Total del registro:

```text
$700 + $500 = $1,200
```

---

# 18. PASO 5 — no debería llamarse siempre “Pago inicial”

Este es otro punto que cambiaría.

Ahora tu sidebar dice:

> **Pago inicial**

Pero no todas las matrículas registran un pago aquí.

### Contado

Sí.

### Promoción contado

Sí.

### Plan

No.

### Contado en dos partes

Según la última regla, tampoco.

Por eso sugiero renombrarlo:

> **Pago y cronograma**

Y la pantalla cambia dinámicamente.

---

## Caso A: Contado

Formulario de pago.

Puede existir:

```text
+ Agregar parte de pago
```

### Parte 1

```text
Moneda
Monto
TC si PEN
Medio de pago
Banco/entidad si aplica
N° operación si aplica
Evidencia
```

### Parte 2

lo mismo.

Y al final:

```text
Total requerido: USD 500
Total registrado equivalente: USD 500
Saldo: USD 0
```

---

## Caso B: promoción contado

Exactamente igual, pero:

```text
Pago requerido:
$700

Cubre:
MAT Alumno 1
MAT Alumno 2
```

Un solo bloque de pago.

---

## Caso C: Plan 3

No solicita voucher.

Muestra:

```text
Matrícula        $300    fecha matrícula
Cuota 1          $300    fecha matrícula
Cuota 2          $300    +30 días
Cuota 3          $300    +60 días
```

Y mensaje:

> Los pagos serán gestionados desde Planes.

---

# 19. PASO 6 — RESUMEN

Debe servir como la pantalla de control final.

### Contexto

```text
Ayacucho
Fecha
Origen
Responsable
```

### Titulares

datos completos.

### Matrículas a crear

```text
Alumno A
PreKids 1
Contado
Promoción 2x700
Costo asignado: $350

Alumno B
Kids 2
Contado
Promoción 2x700
Costo asignado: $350
```

### Pago

```text
Promoción $700

Parte 1: Yape S/ ...
Parte 2: efectivo USD ...
Total equivalente: $700
```

Botón final:

> **Guardar matrículas**

---

# 20. Qué ocurre al pulsar Guardar

Aquí debería ocurrir todo dentro de una sola operación lógica:

```text
Registro familiar / lote de matrícula
       │
       ├── Matrícula global 000501
       │       └─ Alumno A
       │
       ├── Matrícula global 000502
       │       └─ Alumno B
       │
       ├── Grupo promocional
       │       ├─ 000501 → $350
       │       └─ 000502 → $350
       │
       └── Pago grupal $700
               ├─ parte pago 1
               └─ parte pago 2
```

Y después:

```text
Pago → Caja
```

Cada matrícula queda inicialmente:

```text
Verificación: PENDIENTE
```

Y aparecen botones:

```text
Generar contrato
Generar ficha matrícula
Ver matrícula
Verificar
```

---

# 21. Las correcciones que haría antes de conectar BD

Actualmente yo **no conectaría todavía Supabase**. Primero corregiría estas seis cosas en frontend:

1. **Tarifario debe incorporar Nivel opcional.**
2. **Tipo de Pago no debe decidir Programas**; esa relación debe nacer del Tarifario.
3. Separar **“partes de un pago”** de **“cuotas del plan”**.
4. El Tarifario debe generar el cronograma y no depender de `Artículos incluidos`.
5. Promociones deben evaluar **precio contado base + programas elegibles + cantidad**, no depender exclusivamente de una composición rígida.
6. En Nueva Matrícula, `Sede` debe salir de la sesión para usuarios de filial, no seleccionarse manualmente.

Y añadiría un séptimo:

7. Crear el **Catálogo de Materiales/Artículos**, porque Recetas y Stock dependen de él.

---

## Un único hueco que sí debemos cerrar ahora

Antes de convertir esto en lógica de código, necesito confirmar solo este caso:

**Contado en dos partes:** ¿en el Paso 4 de Matrícula se registran únicamente las dos **fechas comprometidas**, y el monto del primer pago recién se ingresa al cobrar desde `Planes`, calculándose automáticamente el saldo de la segunda parte?

Esa es la versión más reciente que entendí de tus correcciones. Si me confirmas eso, ya tenemos cerrado el recorrido Configuración → Matrícula y podemos pasar a elaborar el **mapa funcional técnico componente por componente** para que corrijas el sistema mock antes de conectarlo a Supabase.


--------------------
RESPUESTA DOS
--------------------

Sí. Con estas capturas, el **punto 12 queda resuelto**: no necesitamos crear otro “Catálogo de materiales”. El módulo que ya tienes en **Logística → Catálogo de artículos** debe ser la **fuente maestra única** para materiales, libros, herramientas y paquetes.

He revisado las cuatro ramas y la estructura es buena. Haría únicamente estas correcciones.

## 1. La clasificación actual sí sirve

Las cuatro opciones encajan con lo que hemos definido:

| Tipo actual | Uso dentro de ENSIL |
|---|---|
| **Material educativo** | módulos, flashcards, cuadernos, lecturas de comprensión, contenidos pedagógicos, etc. |
| **Herramienta / adicional** | velópticos, cronómetros, palitos chinos, maletines y otros elementos físicos |
| **Libro** | libros individuales controlados por stock |
| **Paquete logístico** | paquete de 8 libros, paquetes cerrados, conjuntos logísticos |

Por tanto, **no crearía una quinta categoría**.

---

# 2. Corrección necesaria en “Libro”

Este es el cambio más claro que falta.

Actualmente tienes:

- Código SKU
- Nombre
- Estado
- Unidad de medida
- Costo referencial
- Descripción
- ¿Se vende?
- ¿Se entrega por matrícula?

Falta el campo que ya habíamos definido:

### Tipo de libro *

```text
Tipo de libro
[ Anillado ▼ ]

Opciones:
- Anillado
- Encolado
```

Esto es importante porque en tu operación tienen comportamientos diferentes.

**Anillado**
- normalmente se entrega como material del programa;
- no se vende independientemente.

**Encolado**
- puede formar parte de inventario comercial;
- puede venderse desde Caja;
- puede tener precio de venta.

No lo inferiría del nombre. Debe quedar como dato explícito.

---

# 3. “¿Se vende?” necesita conectarse con precios

Aquí sí encuentro una inconsistencia funcional.

En la tabla general muestras, por ejemplo:

> Venta: Sí (S/ 60.00)

pero en los formularios de Libro o Herramienta solo existe:

> ☑ ¿Se vende?

No veo dónde se define el **precio de venta**.

Además, nosotros ya definimos que el precio puede ser:

- general;
- o diferente por filial;
- administrado por Logística;
- con trazabilidad/vigencia.

Por eso **no recomiendo agregar simplemente un input “Precio: S/ 60” al artículo**. Eso volvería a crear el problema de cambiar precios históricos.

La mejor conexión sería:

```text
Artículo
↓
¿Se vende? = Sí
↓
Habilitar "Configurar precios de venta"
↓
Precio general
+ opcionalmente precios específicos por sede
+ vigencia
```

Ejemplo:

```text
Cronómetro
Precio general: S/ 35.00

Excepciones:
Juliaca: S/ 32.00
San Isidro: S/ 38.00

Vigente desde: 01/11/2026
```

Si cambia el precio, se crea **una nueva vigencia**, no se sobrescribe el anterior.

La columna `VENTA` de tu listado simplemente mostraría el precio vigente.

---

# 4. “¿Se entrega por matrícula?” está bien, pero tiene un significado específico

Este checkbox **no debe determinar automáticamente qué programa recibe el artículo**.

Debe significar:

> “Este artículo está habilitado para poder formar parte de una receta de matrícula”.

Después:

```text
Catálogo de artículos
    ↓
¿Se entrega por matrícula? = Sí
    ↓
Crear receta
    ↓
Programa / nivel
    ↓
Seleccionar artículo
```

Por ejemplo:

```text
Velóptico Kids 2
¿Se entrega por matrícula? Sí
```

no significa que todos los alumnos lo reciben.

La **Receta Kids 2** es la que establece:

```text
Kids 2
├─ Maletín x1
├─ Módulo Kids 2 x1
├─ Paquete 8 libros x1
└─ Velóptico Kids 2 x1
```

### Único impacto sobre otro panel

En **Crear Receta → Agregar Artículo**, deberían aparecer preferentemente:

> artículos activos + `¿Se entrega por matrícula? = Sí`.

Ese es el vínculo correcto con el panel que ya tienes.

---

# 5. Paquete logístico: está muy bien planteado, pero falta definir su comportamiento

La existencia de:

> ¿Permite desempaquetado?

me parece correcta y además encaja perfectamente con tu operación.

### Para “Paquete 8 libros KIDS”

Debe crearse así:

```text
Tipo: Paquete logístico
Nombre: Paquete 8 libros KIDS
Unidad: Paquete
¿Se entrega por matrícula?: Sí
¿Permite desempaquetado?: No
```

El stock sería:

```text
Paquete 8 libros KIDS
Stock Juliaca: 7
```

Cuando verificas una matrícula Kids:

```text
Entregar paquete 8 libros
↓
-1 paquete
↓
Stock = 6
```

No interesa qué títulos están dentro porque tú ya aclaraste que **llega empaquetado, se almacena empaquetado y se entrega empaquetado**.

### Cuando “Permite desempaquetado = Sí”

Ahí sí la composición cobra función real.

Ejemplo hipotético:

```text
Pack X
├─ Artículo A x2
├─ Artículo B x1
└─ Artículo C x1
```

Al desempaquetar:

```text
-1 Pack X
+2 Artículo A
+1 Artículo B
+1 Artículo C
```

Por tanto recomiendo esta regla:

> **Si no permite desempaquetado, la composición puede ser informativa/opcional. Si permite desempaquetado, la composición debe ser obligatoria.**

Así no fuerzas al paquete de 8 libros a inventariar ocho libros que tú expresamente no quieres controlar individualmente.

---

# 6. Material educativo: hay campos que hoy no tienen conexión con el sistema de matrícula

Veo:

- Sesiones
- Modo de entrenamientos: General / Variable
- Gimnasias por sesión
- Entrenamientos por sesión

No están mal, pero pertenecen a una futura lógica **pedagógica**, no logística.

Hasta ahora ninguno de nuestros flujos de:

```text
Matrícula
→ Receta
→ Verificación
→ Stock
```

necesita esos cuatro campos.

Mi recomendación es:

- pueden conservarse;
- deben ser **opcionales**;
- no deben condicionar stock, receta ni matrícula;
- eventualmente los puede consumir el módulo de Psicopedagogía.

No los eliminaría si ya sabes que los usarás, pero tampoco construiría lógica alrededor de ellos todavía.

---

# 7. No agregaría “¿Controla stock?”

En mi propuesta anterior aparecía ese atributo. Viendo tu sistema actual, **ya no lo considero necesario**.

Todo lo que entra en este catálogo es un artículo físico/logístico. El control de stock puede ser inherente al artículo activo.

Eso mantiene el formulario más limpio.

---

# 8. Cómo queda conectado este módulo

Con estas correcciones, la ruta sería:

```text
LOGÍSTICA
│
└── Catálogo de artículos
     │
     ├── Material educativo
     ├── Herramienta / adicional
     ├── Libro
     │      └── Tipo: Anillado / Encolado
     │
     └── Paquete logístico
            └── Composición / desempaquetado
                 │
                 ▼
CONFIGURACIÓN → RECETAS
                 │
                 ▼
Programa + Nivel
                 │
                 ▼
Materiales requeridos
                 │
                 ▼
MATRÍCULA
                 │
                 ▼
VERIFICACIÓN
                 │
          ¿hay stock en filial?
           /             \
         Sí               No
         ↓                ↓
    Se entrega       Deshabilitado
         ↓          Verif. incompleta
   Salida Stock
```

Y paralelamente:

```text
Artículo
↓
¿Se vende? Sí
↓
Precio de venta vigente
↓
Stock filial
↓
Venta
↓
Caja PEN/USD
↓
Salida Stock
```

## Conclusión

El módulo que tienes **sí reemplaza completamente** al catálogo que te había propuesto. No construiría otro.

Solo corregiría ahora:

1. **Libro → añadir `Tipo de libro: Anillado / Encolado`.**
2. **¿Se vende? → conectar con precios generales/por sede y vigencias.**
3. **Paquete → composición obligatoria solo si permite desempaquetado; los paquetes sellados se controlan como una unidad.**
4. **Recetas → `Agregar Artículo` debe alimentarse de este catálogo, especialmente de artículos activos habilitados para matrícula.**
5. Los metadatos pedagógicos pueden quedarse, pero **no participan todavía en la lógica matrícula–stock**.

Con eso, el Catálogo de artículos queda perfectamente preparado para adaptarse a las demás correcciones que ya aprobaste, sin obligarnos a rehacer Programa, Tarifario, Promociones o el wizard de matrícula.