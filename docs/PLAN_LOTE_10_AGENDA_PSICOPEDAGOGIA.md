# Lote 10 — La agenda de Psicopedagogía pasa a la base (diseño)

Documento de trabajo del **2026-11-13**. Es lo último del sistema que sigue solo en memoria (aparte de los avisos, que tienen su propio lote de mensajería). Se construye en **tres entregas**, cada una con su migración, y se sube a `main` solo cuando el usuario diga «sube».

| Entrega | Qué pasa a la base | Migración |
|---|---|---|
| **10A** | Asesorías, su historial de cambios, el seguimiento de cada sesión y la capacidad por horario | 0022 |
| **10B** | Cronogramas mensuales y actividades especiales (inscripción y asistencia) | 0023 |
| **10C** | Política de recordatorios de Psicopedagogía y los recordatorios registrados | 0024 |

Queda fuera: los **avisos** (notificaciones) y el botón «Avisar a Logística» (lote de mensajería, Plan de lanzamiento §6.8).

## Qué hay hoy en memoria

Asesorías (`schedules`), historial (`psyEvents`), seguimiento (`trackings`), cronogramas mensuales con sus actividades, inscritos y asistencia (`monthlySchedules`), capacidad (`capacityConfig`), política y registro de recordatorios (`psyReminderPolicy`, `psyReminderLogs`). Las asesorías y actividades de ejemplo guardan al responsable **por su nombre** (texto).

## El punto delicado: la agenda se toca desde el dinero

Hoy, **después** de que la base guarda una matrícula, el sistema cambia la agenda en memoria. Si la base guardara lo del dinero y fallara la agenda, quedarían matrículas sin su primera asesoría o caídas con asesorías vivas. Lo mismo en cada aprobación:

| Operación del dinero | Efecto en la agenda |
|---|---|
| Matricular | nace la **primera asesoría** (y comparte horario con los alumnos del mismo registro) |
| Aprobar una caída | se cancelan las asesorías futuras y se quita al alumno de las actividades futuras |
| Aprobar un traslado de sede | igual que la caída (las asesorías son de la sede) |
| Cambio de programa / reactivación | se ajusta o se vuelve a crear la primera asesoría |
| Cambiar el nombre del alumno | se corrige la copia del nombre en la agenda |

**Decisión de diseño:** esos efectos viajan **en la misma operación atómica** que ya existe (`aplicar_cambios_matricula`), como se hizo con las solicitudes (0018): todo se guarda o no se guarda nada. Los códigos (`SES`, `TRK`, `EVT`…) los asigna la base con el mecanismo de borradores (0019).

## 10A — Asesorías, historial, seguimiento y capacidad (migración 0022)

**Estado (2026-11-14): hecho y verificado en el código** (`tsc`, `vite build`, los 45 `check-*`; la migración 0022 probada contra una copia de la base con unos 130 casos y con los envíos que arma el propio cliente, y su «deshacer»). **La migración 0022 ya está aplicada a la base real (la pegó el usuario; verificada por SQL el 2026-11-14) y el código se subió a `main` después, porque la aplicación lee las tablas nuevas al iniciar sesión.** Falta probar en el navegador con la sesión del usuario (sin guardar nada hasta que él lo pida).
- ✅ **Migración 0022** (`supabase/migrations/20261114100000_agenda_asesorias_y_seguimiento.sql`, con su «deshacer» en `supabase/deshacer/`).
- ✅ **Sistema:** `utils/agendaDb.ts` (filas ↔ modelo, lo que viaja, cupos), `services/agenda.ts` + `services/agendaRepository.ts`, gancho `useAgenda`, el contexto sin la agenda en memoria (las acciones `addSchedule`, `updateSchedule`, `addTracking`, `updateTracking` y `setCapacityConfig` son asíncronas), la clave `agenda` dentro de las operaciones `matricular`, `caida` y `traslado` del dinero, las pantallas de Programación, reserva, sesión y cupos con `await`, el registro de funciones (se sumó «schedule» a lo que leen las pantallas que la consultan) y `check-agenda-db.ts`.
- Lo que la base ya vigila: sede alcanzable; la función del registro de cada acción; horario válido; no en el pasado; el alumno no se cruza consigo mismo; cupo y horario de primeras asesorías; responsable de Psicopedagogía de esa sede y disponible ese día; estados permitidos; asistencia solo desde el día de la asesoría y **sin materiales entregados no se marca**; motivo, quién lo pidió y regla de las 24 horas (la institución solo con su función); y **cada cambio trae su evento**.
- Límites a anotar: las actividades especiales siguen en memoria hasta la 0023, así que el bloqueo de horarios por una actividad y quitar al alumno de una actividad al caer o trasladarse siguen en el cliente; y las reglas de Personal (no dar vacaciones, cesar ni cerrar una asignación de quien tiene agenda) siguen comprobándose solo en el cliente (con la agenda ya leída de la base).

Tablas: `asesorias` (alumno, sede, fecha, hora, **responsable por su id de Personal**, estado, primera asesoría y su matrícula), `psy_eventos` (historial: **solo se agrega**; cada cambio de una asesoría o actividad deja su evento, y la base lo exige), `seguimientos` (la sesión a la que el alumno asistió: métricas, observaciones y lista de la primera asesoría) y `capacidad_asesorias` (cupo general, por sede y excepciones por fecha y horario).

Lo que la base vuelve a comprobar (las reglas siguen siendo funciones puras de `src/utils`): sede alcanzable; función del registro por acción (reservar, reprogramar, cancelar, marcar asistencia, registrar sesión, capacidad); el cupo del horario no se pasa; el responsable es de Psicopedagogía, de esa sede y está disponible ese día (vacaciones o cese); cancelar o reprogramar pide motivo y quién lo pidió, y con menos de 24 h solo lo decide la institución; **sin materiales entregados no se marca asistencia** (regla de la verificación); cada cambio deja su evento.

## 10B — Cronogramas mensuales y actividades (migración 0023)

Tablas: cronogramas por sede y mes, sus actividades (bloquean los horarios de asesoría de la sede), inscritos con su cupo y asistencia (quién y cuándo). La base comprueba cupo, que el responsable sea de Psicopedagogía de la sede y que la actividad no pise asesorías ya reservadas.

## 10C — Recordatorios de Psicopedagogía (migración 0024)

El mismo patrón que la cobranza (Lote 9C): la política **por versiones** (días antes de una asesoría, de una actividad y del fin de la vigencia) y los recordatorios registrados por sede, sin repetirse y con el código asignado por la base. El sistema sigue sin enviar mensajes: prepara el texto, abre WhatsApp y deja el registro.

## Principios (los de siempre)

- La regla es una función pura de `src/utils` con su `check-*`; la base vuelve a comprobarla. Las pantallas esperan el resultado (`await`) y vuelven a leer lo guardado.
- Nadie escribe las tablas directo: solo funciones que piden la función del registro, comprueban la sede y dejan quién y cuándo (el nombre sale de la cuenta).
- **Lo que se registra no se borra**: el historial solo se agrega; una asesoría se cancela (no se elimina).
- Se ve por sede (cada sede tiene sus propios horarios, cupos y cronogramas).
- Lo derivable no se guarda: el nombre del alumno y del responsable salen de sus ids; la vigencia se calcula.

## Decisiones del usuario

1. **La agenda empieza vacía** (2026-11-13): no se cargan asesorías ni actividades de ejemplo (sus responsables eran inventados y la base los exige de Personal). Las 5 matrículas de ejemplo quedan sin primera asesoría; las matrículas nuevas sí la crean. Lo de ejemplo en memoria se retira.
2. **Tres entregas** (2026-11-13), cada una con su migración y su «sube».

## Verificación de cada entrega

`tsc`, `vite build`, todos los `check-*` en verde, la migración probada contra una copia de la base (con cuentas de dos sedes, los envíos que arma el propio cliente y su «deshacer»), y probada en el navegador con la sesión del usuario **sin guardar nada** hasta que él lo pida.
