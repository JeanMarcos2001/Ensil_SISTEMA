# ETAPA 3 — MOTOR DE PROMOCIONES CONFIGURABLE Y PAGO GRUPAL

Esta etapa se aplica después de estabilizar Tarifarios y cronogramas.

Relee `REVISIÓN PROYECTO.MD` y usa la implementación real como fuente de verdad técnica.

## PROTOCOLO OBLIGATORIO DE INTERRUPCIÓN Y SEGURIDAD

1. Inspecciona primero la implementación real.
2. Si algo solicitado ya existe total o parcialmente, NO lo dupliques.
3. Si existe contradicción entre este prompt, `REVISIÓN PROYECTO.MD` y el código, **DETENTE** y pregunta.
4. Si una modificación puede romper rutas, contratos de datos, estado global o componentes compartidos, **DETENTE** y pregunta.
5. No inventes reglas de negocio.
6. No elimines funcionalidades ajenas a esta etapa.
7. Mantén la arquitectura modular existente.
8. Al terminar, actualiza `REVISIÓN PROYECTO.MD`.

## OBJETIVO

Corregir `Crear Nueva Promoción` y construir una lógica que permita detectar promociones dinámicamente durante el registro de matrícula.

Las promociones deben ser configurables por Superadmin y NO estar hardcodeadas en el wizard.

---

## 1. CAMPOS MÍNIMOS DE UNA PROMOCIÓN

Debe poder definir:

- código;
- nombre;
- estado activo/inactivo;
- cantidad requerida de alumnos;
- tipo de pago requerido;
- moneda;
- precio promocional total;
- vigencia;
- sedes aplicables o todas;
- programas/familias elegibles;
- precio contado base requerido o regla equivalente;
- regla de reparto interno;
- observaciones.

### Reparto actual
Por defecto:
`precio promocional total / cantidad de alumnos`

Ejemplo:
- total = USD 700;
- 2 alumnos;
- costo asignado = USD 350 por matrícula.

El pago real es UNO para el grupo.

---

## 2. ELEGIBILIDAD DINÁMICA

No dependas exclusivamente de una composición rígida como:
`PreKids x1 + Kids x1`.

Ejemplo de promoción:

- cantidad = 2;
- tipo de pago = Contado;
- precio contado base requerido = USD 500;
- programas elegibles = Pre-Kids y Kids;
- total promocional = USD 700.

Deben ser válidos, si sus tarifarios vigentes cumplen:
- Pre-Kids 1 + Kids 2;
- Kids 1 + Kids 3;
- Pre-Kids 2 + Pre-Kids 1;
- Kids 2 + Kids 2.

No debe ser válido:
- Pre-Kids USD 500 + Profesional USD 1000.

La elegibilidad debe calcularse usando el tarifario vigente del alumno.

---

## 3. DATOS NECESARIOS POR ALUMNO

El motor debe recibir:

- programa;
- nivel si aplica;
- tipo de pago seleccionado;
- tarifario vigente;
- precio contado/base utilizado para la regla;
- sede;
- fecha de matrícula.

No dupliques precios salvo:
- precio total promocional;
- valor base usado como condición.

---

## 4. COMPORTAMIENTO EN MATRÍCULA

Prepara funciones/componentes reutilizables para que la Etapa 5 los consuma.

### Con 1 alumno
No mostrar beneficio grupal.

### Con varios alumnos
Evaluar promociones:
- activas;
- vigentes;
- aplicables a la sede;
- compatibles por tipo de pago;
- compatibles por precio base;
- compatibles por programa/familia.

### Si existe promoción
Mostrar:
`Promoción disponible`

Al aplicar:
- permitir seleccionar alumnos;
- revalidar la combinación;
- crear `grupoPromocional` o equivalente.

Debe conservar:
- promoción aplicada;
- alumnos/matrículas participantes;
- total promocional;
- costo asignado por alumno;
- futura referencia a un único pago grupal.

---

## 5. PAGO GRUPAL

Debe soportar:

- un único pago total;
- varias partes dentro de ese pago;
- cada parte con sus propios datos/evidencia;
- el pago vinculado al grupo;
- cada matrícula participante puede consultar ese pago.

Ejemplo USD 700:
- Parte A: Yape en PEN;
- Parte B: efectivo USD;
- Parte C: transferencia.

La suma equivalente debe ser USD 700.

No confundir partes con cuotas.

---

## 6. EVITAR DOBLE USO DE ALUMNOS

Un alumno no debe pertenecer a dos grupos promocionales incompatibles en el mismo registro.

Con 4 alumnos y promoción de 2:
- pueden formarse 2 grupos si la promoción/regla lo permite;
- cada alumno solo puede pertenecer a un grupo.

Si la UI actual no tiene una regla clara sobre múltiples grupos, no la inventes: detente y pregunta.

---

## 7. PRUEBAS MÍNIMAS

Valida:

- 1 alumno → sin promoción.
- 2 compatibles → promoción disponible.
- 2 incompatibles por precio base → no disponible.
- promoción inactiva → no disponible.
- promoción fuera de vigencia → no disponible.
- sede no incluida → no disponible.
- selección correcta entre 3 alumnos.
- ningún alumno duplicado en dos grupos.
- reparto correcto del total.
- pago grupal preparado sin duplicar pagos individuales.
