# Plan de reordenamiento — Módulo Psicopedagogía

> Estado: **implementado** (2026-10-17) con las 7 decisiones del usuario: cupo configurable por horario (o sin límite), sin atención sin reserva, menú Programación · Historial del alumno · Cronogramas mensuales, bloqueo por sede, «Confirmado» → «Asistió», Fase D autorizada y sede = sede del alumno. Detalle en `docs/REVISION_PROYECTO.md` (última sección).
> Alcance: solo archivos de Psicopedagogía (`src/pages/psychopedagogy/**`, `src/utils/schedule.ts`) y, mínimamente, los datos de Psicopedagogía dentro de `DataContext`. Lo que toque Matrícula u otros módulos se marca como **[requiere permiso]**.

## 1. Corrección inmediata (aplicada)

| Regla indicada | Resultado |
|---|---|
| No existe virtualidad | Se eliminó la modalidad. |
| No hay tipo de cita: todo son asesorías | Se eliminó el tipo de cita. La *primera asesoría* se distingue por origen (la crea la matrícula), no por un campo del formulario. |
| Horarios exactos, 1 hora | **Lun–Vie:** 3–4, 4–5, 5–6, 6–7, 7–8 p. m. **Sábado:** 9–10, 10–11, 11–12, 12–1 y 4–5, 5–6, 6–7, 7–8 p. m. **Domingo:** sin atención. Se eligen de una lista (ya no hay hora libre ni duración). |
| Estado automático | Al reservar → **Reservado**. Al cambiar fecha, hora o responsable → **Reprogramado**. **Confirmar asistencia / Marcar falta / Cancelar** son acciones manuales. |
| Calendario | Los domingos aparecen como «Sin atención» y no se pueden reservar. |

## 2. Análisis de cómo está hoy

Cuatro opciones separadas: **Programación · Primera asesoría · Seguimiento · Cronogramas mensuales**.

Problemas de flujo:
1. **Seguimiento está desconectado de Programación.** Hoy se registra una sesión eligiendo un alumno cualquiera, sin que exista una asesoría programada. No se puede saber a qué cita corresponde cada registro ni si el alumno realmente asistió.
2. **Primera asesoría es una lista aparte** que no aparece en la agenda y no respeta los horarios permitidos.
3. **Cronogramas mensuales no se conectan con el calendario:** sus fechas no bloquean horarios ni se pueden inscribir alumnos.
4. Dos estados distintos para lo mismo (`Asistió/Faltó/No reservó` en Seguimiento vs. `Reservado/Confirmado…` en Programación).

## 3. Propuesta de solución

### 3.1 Principio rector
> **Toda atención nace de una asesoría programada.** La agenda (Programación) es el centro; el registro de la sesión, el historial y las actividades especiales cuelgan de ella.

### 3.2 Menú propuesto (de 4 a 2 opciones, o 3 si prefiere conservar el historial)

| Opción | Contenido |
|---|---|
| **Programación** (centro) | Calendario y lista de asesorías (incluida la *primera asesoría* con etiqueta propia) + botón **Actividades especiales** + panel **Alumnos sin asesoría esta semana**. Al hacer clic en una asesoría se abre el panel **Atender**: si es la primera asesoría → checklist de cierre (lo que hoy hace «Primera asesoría»); si es regular → registro de sesión con las métricas (lo que hoy hace «Seguimiento»). Pestaña **Historial** por alumno (evolución de métricas), solo lectura. |
| **Cronogramas mensuales** | Se mantiene separado (es planificación mensual por sede) y gana: **fechas con horario y cupo**, **inscripción de alumnos** en cada fecha y estado «Inscritos». Cada actividad se muestra automáticamente en el calendario. |

*Alternativa:* conservar «Seguimiento» como una tercera opción de solo consulta (historial). La recomendación es integrarlo como pestaña de Programación para no volver a separar lo que va de la mano.

### 3.3 Modelo de datos

```
Asesoría (schedule)            Sesión (seguimiento)             Actividad (cronograma mensual)
- id                           - id                             - id, cronogramaId
- studentId, sedeId            - asesoriaId  (obligatorio)      - nombre, fecha, horaInicio, horaFin
- fecha, hora (bloque de 1 h)  - métricas, observaciones        - sedeId, cupo (opcional)
- responsable                  - checklist (si es primera)      - inscritos: studentId[]
- estado                       - registrada por, fecha          - bloquea horarios de ese rango
- esPrimera (origen matrícula)
- sesionId / reprogramadaDe
```

**Estados de la asesoría:** `Reservado → (Confirmado) → Atendida`, o `Reprogramado`, `Faltó`, `Cancelado`.
`Atendida` se marca **automáticamente** al guardar la sesión; los demás, como ya se definió.

### 3.4 Reglas
1. **Registrar sesión = abrir una asesoría del calendario.** Una sesión por asesoría; su fecha es la de la asesoría.
2. **Alumno que viene sin tener asesoría esta semana:** propuesta → botón **«Atención sin reserva»** que crea una asesoría en el bloque vigente (estado *Atendida*, con marca «sin reserva previa») y abre el registro. Así la sesión siempre cuelga de una asesoría y el historial queda íntegro. (*Decisión pendiente, ver 5.*)
3. **Frecuencia mínima:** panel «Alumnos sin asesoría esta semana» (alumnos activos sin asesoría Reservada/Confirmada/Atendida de lunes a sábado) para que secretaría los programe.
4. **Actividades especiales bloquean horarios:** una maratón de 4 a 6 p. m. el 10 de noviembre quita los bloques 4–5 y 5–6 de ese día para *toda la sede* (se ven bloqueados en el formulario y en el calendario). Se **inscribe** desde:
   - Programación → **Actividades especiales** (lista de todas las fechas de los cronogramas del mes), o
   - Cronogramas mensuales → botón **Inscribir** en cada actividad.
5. **Primera asesoría** respeta los mismos bloques y aparece en el calendario. **[requiere permiso]** porque se define en el asistente de matrícula (hoy admite cualquier hora y solo crea un registro en la lista de Primera asesoría).

## 4. Fases de implementación

| Fase | Contenido | Toca fuera de Psicopedagogía |
|---|---|---|
| **A** (hecha) | Reservar asesoría: horarios exactos, sin tipo/modalidad/duración, estado automático, acciones manuales. | No |
| **B** | Unificar estados; `Atendida`; panel **Atender** en Programación con el registro de sesión (métricas por programa) ligado a la asesoría; historial por alumno; «Atención sin reserva». Mover/renombrar el menú. | No (solo menú de Psicopedagogía) |
| **C** | Cronogramas mensuales: horario y cupo por actividad, inscripción de alumnos, actividades visibles en el calendario y **bloqueo de bloques** al reservar. Botón «Actividades especiales» en Programación. | No |
| **D** | Panel «Alumnos sin asesoría esta semana». Primera asesoría de la matrícula como asesoría real de la agenda (mismos bloques). | **Sí — asistente de matrícula (paso Programa y `registerEnrollments`)** |
| **E** | Sede en las asesorías (filtro por la sede del topbar) y permisos por rol. | Posible (topbar / permisos) |

## 5. Decisiones que necesito de usted

1. **¿Cuántos alumnos atiende un bloque a la vez?** Hoy se permite que *varios responsables* atiendan el mismo bloque (cada uno una asesoría); el mismo responsable no puede tener dos. ¿Hay un tope por bloque o por sede?
2. **Alumno sin asesoría programada:** ¿aprueba la «Atención sin reserva» (crea la asesoría al momento) o prefiere que no se pueda registrar sesión sin cita previa?
3. **Menú:** ¿Programación + Cronogramas mensuales (2 opciones, historial como pestaña) o conservar «Seguimiento» como tercera opción solo de consulta?
4. **Cronogramas mensuales:** ¿el bloqueo aplica a toda la sede (propuesto) o solo a ciertos responsables? ¿Las actividades tienen cupo?
5. **«Confirmado»:** ¿significa que el alumno confirmó que vendrá (antes de la cita)? Se propone mantenerlo así y que **Atendida** sea lo que marca el registro de la sesión.
6. **Fase D:** ¿autoriza tocar el asistente de matrícula para que la primera asesoría use los mismos bloques y aparezca en la agenda?
7. **Sede:** ¿cada asesoría pertenece a la sede del alumno y se filtra con el selector de sede del encabezado?
