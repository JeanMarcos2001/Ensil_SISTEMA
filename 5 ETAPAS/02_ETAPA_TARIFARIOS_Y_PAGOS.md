# ETAPA 2 — TARIFARIOS, CRONOGRAMAS Y SEPARACIÓN ENTRE CUOTAS Y PARTES DE PAGO

Esta etapa se aplica DESPUÉS de completar la Etapa 1.

Antes de modificar nada, relee `REVISIÓN PROYECTO.MD` y verifica qué cambios quedaron aplicados.

## PROTOCOLO OBLIGATORIO DE INTERRUPCIÓN Y SEGURIDAD

1. Inspecciona primero la implementación real.
2. Si algo solicitado ya existe total o parcialmente, NO lo dupliques:
   - conserva lo correcto;
   - aplica solo el delta faltante.
3. Si existe contradicción entre este prompt, `REVISIÓN PROYECTO.MD` y el código actual, **DETENTE** y pregunta.
4. Si un cambio puede romper rutas, contratos de datos, estado global o componentes compartidos, **DETENTE** y pregunta.
5. No inventes reglas de negocio.
6. No elimines funcionalidades ajenas a esta etapa.
7. Mantén compatibilidad con la arquitectura y datos mock actuales.
8. Al finalizar, actualiza `REVISIÓN PROYECTO.MD` con cambios, archivos afectados, validaciones y pendientes.

## OBJETIVO

Corregir la lógica del Tarifario y del modelo de pagos para distinguir correctamente:

- **cuotas/obligaciones de un plan**;
- **partes que componen un mismo pago contado**.

No conectar todavía una BD nueva.

---

## 1. NO CONFUNDIR CUOTA CON PARTE DE PAGO

### Cuota
Es una obligación programada en el tiempo.

Ejemplos:
- Plan 2;
- Plan 3;
- Plan 6;
- Plan 9;
- Contado en 2 partes.

### Parte de pago
Es una fracción de UN MISMO pago realizado en el mismo momento.

Ejemplo:
Un contado de USD 700 puede pagarse:
- una parte por Yape;
- otra en efectivo;
- otra por transferencia.

Eso sigue siendo **un pago contado**, no tres cuotas.

### Cambio requerido
Si `Tipo de Pago` tiene campos como:
- “Permite pago parcial”;
- “Máximo parciales por cuota”;

y se usan para representar partes de un pago contado, refactoriza esa responsabilidad fuera de `Tipo de Pago`.

Las partes deben pertenecer al registro de pago o a una colección equivalente:
`paymentParts`, `partesPago`, etc.

No elimines campos si existen dependencias inciertas. Si hay riesgo, detente y pregunta.

---

## 2. RESPONSABILIDAD DEL TARIFARIO

El Tarifario debe vincular:

`Programa + Nivel opcional + Tipo de pago + Vigencia + Moneda + Estructura económica`

Debe determinar qué tipos de pago aparecen realmente en Matrícula para un programa/nivel.

### Regla
Si NO existe tarifario activo y vigente para:
`Programa/Nivel + Tipo de Pago`,
esa opción no debe aparecer disponible en matrícula.

---

## 3. SACAR MATERIALES DEL TARIFARIO

Los materiales se resuelven mediante:

`Programa/Nivel → Receta → Catálogo de artículos`

El Tarifario NO debe depender de:
- “Artículos incluidos en el precio base”;
- importes adicionales por artículos;
- componentes logísticos de la receta.

Si esos elementos ya existen:
- elimina su efecto sobre cálculos;
- si es seguro, retíralos de la UI;
- si quitarlos afecta datos actuales, mantenlos temporalmente sin impacto y documenta la deuda.

No modifiques Recetas ni Catálogo de artículos en esta etapa.

---

## 4. DESGLOSE DE CUOTAS COMO FUENTE DEL TOTAL

La estructura del tarifario debe generar obligaciones explícitas.

### Profesional Plan 3
- Matrícula — USD 300 — día 0.
- Cuota 1 — USD 300 — día 0.
- Cuota 2 — USD 300 — día 30.
- Cuota 3 — USD 300 — día 60.
- Total = USD 1200.

### Profesional Plan 6
- Matrícula — USD 200 — día 0.
- Cuota 1 — USD 200 — día 0.
- Cuota 2 — USD 200 — día 30.
- ...
- Cuota 6 — USD 200.
- Total = USD 1400.

### Profesional Plan 9
- Matrícula — USD 150 — día 0.
- Cuota 1 — USD 150 — día 0.
- ...
- Cuota 9 — USD 150.
- Total = USD 1500.

### Regla de fechas
En planes fijos:
- cada cuota posterior suma exactamente 30 días;
- no usar “mismo día del siguiente mes”.

### UI
`Generar desglose` debe mostrar:
- concepto;
- monto;
- días de vencimiento;
- total.

Si existe `Precio Base (Total)`, debe estar sincronizado o derivado del desglose para evitar dos fuentes de verdad.

---

## 5. CONTADO

Para Contado:
- una obligación económica;
- pago inmediato;
- puede componerse de varias partes;
- todas las partes deben sumar el total exigido.

Cada parte puede tener:
- moneda;
- monto;
- TC si PEN;
- medio de pago;
- banco/entidad si aplica;
- número de operación si aplica;
- evidencia;
- descripción/nota.

No rehagas todavía el wizard completo; crea una estructura compatible para la Etapa 5.

---

## 6. CONTADO EN 2 PARTES

Debe mantenerse separado del Contado inmediato.

Debe generar una estructura de 2 obligaciones para `Planes`.

No debe comportarse como:
- promoción;
- pago contado inmediato.

### Regla de seguridad
Si el código y `REVISIÓN PROYECTO.MD` muestran ambigüedad sobre:
- si montos y fechas se definen al registrar matrícula;
- o si el primer monto se digita recién al pagar en Planes;

**DETENTE** y pregunta antes de implementar una de las dos versiones.

No adivines.

---

## 7. PRUEBAS MÍNIMAS

Valida:

- Contado.
- Contado en 2 partes.
- Profesional Plan 3.
- Profesional Plan 6.
- Profesional Plan 9.
- Tarifario inactivo no disponible.
- Tarifario fuera de vigencia no disponible.
- Combinación programa/tipo de pago sin tarifario no disponible.
- El total del desglose coincide con el total mostrado.
- Las partes de un pago contado no se confunden con cuotas.

No continúes a promociones hasta estabilizar esta etapa.
