# Plan hasta el lanzamiento a producción — Sistema ENSIL

Documento de trabajo del **2026-11-06**. Reúne **todo lo que falta** para usar el sistema con matrículas y pagos reales: código, base de datos, configuraciones de los servicios, temas legales y fiscales, pruebas y el día del lanzamiento. Se actualiza al cerrar cada fase (marcar ☑ y anotar la fecha).

**Cómo leerlo:** primero el resumen (§1) y el orden (§2); después cada fase con sus casillas; al final, las decisiones que necesito de ti (§11) y los riesgos (§12).

- **Quién hace cada cosa:** 🧑 *Tú* (paneles, contraseñas, decisiones, trámites) · 🤖 *Claude* (código, migraciones, pruebas, documentos) · 🤝 *Ambos*.
- **Tamaño** *(estimación mía, no un compromiso)*: **S** = una sesión corta · **M** = una tanda · **L** = varias tandas · **XL** = un bloque grande de trabajo.
- Lo que está **✅ hecho** se resume en §1 y no se repite.

---

## 1. Dónde estamos hoy

**Funciona en producción** (`ensil-sistema.vercel.app`, desde `main`):
- Inicio de sesión real (correo y contraseña), invitación por correo para fijar la contraseña, «olvidé mi contraseña» y «reenviar acceso».
- Guardado en Supabase de: Empresas, Filiales (sedes), Almacén central, Roles y sus funciones, Cuentas de usuario, Personal y Asignaciones, con seguridad por función y por sede (RLS).
- Reglas del acceso: una cuenta nace de una persona de Personal; el rol real se elige solo en Usuarios y se filtra por el lugar de trabajo; el Superusuario es solo para cuentas técnicas; alcance por sede en Personal y Asignaciones.
- Hoy hay en la base: 6 empresas, 16 sedes, 1 almacén, 7 roles, 2 cuentas, 1 persona con su asignación; y las tablas de contratos y planillas (migración 0007, vacías todavía).

**Todavía NO está en la base de datos** (vive en memoria y se pierde al recargar): matrículas, alumnos, titulares, planes y cuotas, pagos, caja y caja chica, notas de crédito, cobranza, catálogo comercial (programas, niveles, tarifarios, promociones, tipos de pago), artículos, recetas, stock y kardex, envíos, transferencias, recepciones, ajustes, asesorías y actividades de Psicopedagogía, verificación de materiales, solicitudes, cierres, auditoría y avisos.

> **Consecuencia:** el sistema **no puede usarse todavía con datos reales de alumnos ni dinero**. Eso es el centro de este plan (Fase 3). Todo lo demás lo rodea.

**Estado de los servicios:**

| Servicio | Estado | Observación |
|---|---|---|
| Supabase `ensil-sistema` (`bgatbloodorruzjmbvxu`, región `us-east-1`) | Plan **gratis** | Pasar a Pro antes del primer dato real (§4) |
| Vercel `ensil-sistema` | Plan **Hobby** («Pasatiempo»), dirección provisional | Hobby es de uso personal/no comercial: revisar los términos vigentes y pasar a Pro (§4) |
| Resend (correo) | Configurado: `no-responder@envios.ensilperu.com`, funciona | Plan gratis: 3 000 correos/mes y 100/día (verificar vigente) |
| GitHub `JeanMarcos2001/Ensil_SISTEMA` | Rama `main` publica directo | Sin integración continua ni protección de rama (§4) |
| Dominio propio | Sin conectar | `ensilsistema.com` aparece disponible en Vercel (§4) |

**Avisos del analizador de Supabase (hoy):** (1) *Leaked password protection* desactivada: requiere el plan Pro; (2) `inactivar_personal` es ejecutable por usuarios con sesión: **es intencional** (la función exige el permiso y el alcance por dentro) → se marca como aceptado; (3) 6 índices «sin uso»: es normal, aún no hay tráfico; no se tocan.

---

## 2. El camino completo (orden y dependencias)

```
Fase 0  Seguridad pendiente ─────────────┐ (cuanto antes; no depende de nada)
Fase 1  Producción técnica (servicios) ──┤ (en paralelo con la 2 y la 3)
Fase 2  Datos reales de la organización ─┤
Fase 3  Pasar TODO el sistema a la base ─┴─► Fase 4  Lo legal y fiscal (decisiones tempranas; se cierra antes del piloto)
                                              Fase 5  Archivos y mensajes
                                              Fase 6  Calidad y pruebas
                                              Fase 7  Piloto en UNA sede ─► Fase 8  Lanzamiento por olas ─► Fase 9  Después
```

**Camino crítico:** Fase 3 (persistir el sistema) → Fase 6 (pruebas) → Fase 7 (piloto). Las decisiones de la Fase 4 (facturación y legal) **tienen plazos de terceros**: conviene tomarlas pronto aunque su trabajo venga después.

**Recomendación de salida:** **piloto en una sola sede** con datos reales (propongo Los Olivos, que ya está en la base), unas semanas, y luego **por olas** al resto de sedes. No lanzar las 17 sedes de golpe.

---

## 3. Fase 0 — Seguridad pendiente (hacer ya)

Son accidentes de seguridad que quedaron abiertos. Ninguno es código.

- ☐ 🧑 **Cambiar la contraseña del cPanel/FTP** (se pegó en el chat). Después, revisar si alguien más la conoce. *(S)*
- ☐ 🧑 **Eliminar la clave secreta de Supabase `sb_secret_…`** que se pegó en el chat el 2026-11-04 (Project Settings → API Keys → Secret keys). Nada del sistema la usa. *(S)*
- ☐ 🧑 **Eliminar la clave de Resend `re_…`** que se pegó el 2026-11-04 (Resend → API Keys) y confirmar que **la que hoy usa Supabase (Authentication → SMTP) es una nueva** que escribiste tú directamente. *(S)*
- ☐ 🤝 **Confirmar si el repositorio de GitHub es privado.** Contiene correos reales de la institución y la estructura de la base. Si es público, pasarlo a privado. *(S)*
- ☐ 🧑 **Revisar que `.env.local` y cualquier clave no estén en carpetas compartidas ni respaldos públicos.** *(S)*
- ☐ 🧑 **Gestor de contraseñas:** guardar la contraseña de la base de datos, la del cPanel, y las del correo de cada cuenta técnica. *(S)*

---

## 4. Fase 1 — Producción técnica (servicios y configuraciones)

Configuraciones que **no se hacen desde el código**. Se pueden ir haciendo en paralelo con las demás fases, pero todas deben estar listas **antes del piloto**.

### 4.1 Planes y costos (decidir y contratar)

> **Decidido el 2026-11-07:** por ahora **no se pasa a Pro** y las pruebas siguen en el despliegue de Vercel con datos de **prueba**. Mientras tanto: el proyecto gratis de Supabase **se pausa tras una semana sin uso** (se reactiva desde el panel) y **no tiene respaldos**. **Pasar a Pro sigue siendo obligatorio antes del primer dato real** (matrícula o pago).

- ☐ 🧑 **Supabase → Pro** antes del primer dato real (matrícula o pago): incluye respaldos diarios, no se pausa por inactividad y permite activar la protección de contraseñas filtradas y el límite de tiempo de sesión (verificar qué incluye hoy el plan). *(S)*
- ☐ 🧑 **Respaldo con recuperación a un punto del tiempo (PITR)** de Supabase: es un complemento de pago; recomendable porque habrá dinero. Decidir. *(S)*
- ☐ 🧑 **Vercel → Pro**: el plan Hobby es de uso personal y no comercial según sus términos (verificar vigente); este sistema es de una empresa. *(S)*
- ☐ 🧑 **Resend**: el plan gratis (100 correos/día) alcanza para invitaciones y contraseñas; **no** alcanzará para recordatorios de cobranza automáticos (Fase 5). Decidir el plan cuando se llegue a esa fase.

### 4.2 Dirección web definitiva (dominio)

Hoy es provisional (`ensil-sistema.vercel.app`).
- ☐ 🧑 Decidir el dominio (por ejemplo `sistema.ensilperu.com` o `ensilsistema.com`) y conectarlo en Vercel. El DNS de `ensilperu.com` lo sirve `wperu.com`. *(S)*
- ☐ 🤝 Al cambiar de dirección, actualizar **los cuatro lugares**: variable `VITE_APP_URL` en Vercel · *Site URL* y *Redirect URLs* en Supabase · remitente en Resend si cambia · enlaces ya enviados (se corrigen con «Reenviar acceso»). *(S)*

### 4.3 Entorno de pruebas separado (staging)

**Riesgo actual:** las variables de Vercel están en *Production, Preview y Development* con la **misma base**. Cualquier prueba o despliegue de rama escribe en la base real.
- ☐ 🤝 Crear un **segundo proyecto de Supabase** («ensil-sistema-pruebas») con las mismas migraciones, y usarlo en *Preview* y en tu `.env.local`. Producción solo para *Production*. *(M)*
- ☐ 🤖 Un script que aplique **todas** las migraciones en orden a un proyecto vacío (hoy se aplican una a una). *(S)*
- ☐ 🧑 Variables distintas por entorno en Vercel (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`). *(S)*

### 4.4 Flujo de cambios e integración continua

Hoy un `git push` a `main` **publica en producción sin pasar por nada**.
- ☐ 🤖 **GitHub Actions**: correr `tsc`, `vite build` y los 31 `check-*` en cada subida (hoy se hace a mano). *(S)*
- ☐ 🧑 **Proteger la rama `main`**: cambios por *pull request*, con la verificación en verde, antes de publicar. *(S)*
- ☐ 🤖 Pasar los `check-*` a un ejecutor estándar (vitest) para que corran en CI con un reporte. *(M)*
- ☐ 🤝 Regla de trabajo: **toda migración de la base se prueba primero en staging**, luego en producción, y se registra en `supabase_migrations.schema_migrations`. *(S)*

### 4.5 Seguridad de la aplicación y de Supabase

- ☐ 🧑 Activar **protección contra contraseñas filtradas** (Authentication → Policies; requiere Pro). *(S)*
- ☐ 🧑 Definir **política de contraseñas** (largo mínimo) y **tiempo máximo e inactividad de la sesión** (Authentication → Sessions; algunas opciones son del plan Pro). *(S)*
- ☐ 🧑 **Autenticación en dos pasos (TOTP)** al menos para el Superusuario y quien cierra caja. 🤖 en el código: pantalla para activarla. *(M)*
- ☐ 🧑 **Protección contra abuso en el ingreso** (Authentication → Attack protection / CAPTCHA) y revisar los límites de correos por hora. *(S)*
- ☐ 🤖 **Cabeceras de seguridad** en `vercel.json` (CSP, `X-Frame-Options`, `Referrer-Policy`). *(S)*
- ☐ 🤖 **Restringir el CORS de la función `usuarios`** (hoy acepta cualquier origen) a la dirección definitiva. *(S)*
- ☐ 🧑 **Plantillas de correo de Supabase en español** y con el nombre de la institución (invitación, restablecer contraseña, cambio de correo). *(S)*
- ☐ 🤖 Revisar de nuevo los **avisos de seguridad y rendimiento de Supabase** antes del piloto y después de cada migración grande. *(S, recurrente)*
- ☐ 🧑 **SPF/DKIM/DMARC** de `ensilperu.com`: el SPF actual no incluye a Google Workspace; revisarlo aparte para que el correo normal de la institución no caiga en spam. *(S)*

### 4.6 Observabilidad y respaldos

- ☐ 🧑 **Probar una restauración** del respaldo en el proyecto de pruebas (un respaldo que nunca se probó no cuenta). *(S)*
- ☐ 🤝 **Seguimiento de errores** (por ejemplo Sentry) en el navegador y en la función `usuarios`; *Vercel Analytics* y *Speed Insights* opcionales. *(M)*
- ☐ 🧑 **Aviso de caída** (un monitor externo gratuito que consulte la página y avise por correo o WhatsApp). *(S)*
- ☐ 🤖 Revisar los **registros** de Supabase y de la función después de cada despliegue grande. *(recurrente)*

---

## 5. Fase 2 — Datos reales de la organización

Lo que hoy tiene datos de prueba o está incompleto en la base.

- 🟡 🤝 **Empresas:** las **6** están cargadas en la base (2026-11-07): SILEE y Colegio Ensil de las Américas (que ya estaban) y, nuevas, Editorial Ensil de las Américas Tacna, Ensil Int, Ensil Evolution S.R.L. y Ensil Revolution S.A.C. (cada una con su RUC). **Pendiente:** confirmar la razón social exacta de las cuatro nuevas contra la ficha RUC de SUNAT (se cargaron como las escribió el usuario y llevan esa nota en «Observaciones»; se corrigen en Organización → Empresas). *(S)*
- 🟡 🤝 **Sedes:** **16 cargadas** en la base (2026-11-07), cada una con su empresa, dirección, referencia y teléfonos, con `supabase/seed/empresas_y_sedes_reales.sql`; la tabla de consulta está en [`DATOS_SEDES.md`](DATOS_SEDES.md) (ambos se generan con `scripts/doc-sedes-reales.ts`). Aclarado por el usuario: **Piura es de Ensil Evolution** (la de Colegio Ensil no cuenta; esa empresa queda sin sedes por ahora) y **San Isidro** también. **Ilo queda pendiente:** el usuario pidió no cargarla todavía (falta definir su empresa). *(S)*
- ☑ **Almacén central:** pertenece a la misma empresa que Los Olivos (SILEE); ya está así en la base (2026-11-07). Queda por confirmar con el contador que enviar libros a sedes de **otras** empresas (hay 6) es una operación entre empresas. *(S)*
- ☐ 🤝 **Roles:** revisar los 7 roles de hoy, quitar el rol de prueba («Prueba01») y ajustar las funciones de cada plantilla con quien las va a usar. *(M)*
- ☐ 🤝 **Personal real:** cargar las fichas, asignaciones (lugar + área + acceso Sí/No) y luego las cuentas, sede por sede. Cada cuenta recibe su invitación. *(M)*
- ☐ 🤖 **Limpieza de lo que quedó de pruebas:** los scripts de datos de prueba (`filiales_de_prueba.sql`, cuyo encabezado ya no es cierto: Piura ahora es de Ensil Evolution; **`empresas_y_sedes_reales.sql` NO se limpia: son datos reales**), personas o cuentas de prueba en la base. Y corregir un par de comentarios de tablas que quedaron desactualizados (migración pequeña). *(S)*

---

## 6. Fase 3 — Pasar TODO el sistema a la base (el bloque grande)

Es lo que más trabajo lleva. Se hace **por pasos, en este orden**, repitiendo el método ya probado con Personal: *reglas puras → tabla con seguridad por sede → repositorio intercambiable → pantalla → verificación → documentación*. Cada paso se prueba en staging antes de producción.

### 6.0 Preparación (una vez)

- ☐ 🤖 **Partir `DataContext`** (≈4 000 líneas, todo se repinta con cada cambio) en un contexto por dominio, con un acceso a datos intercambiable. Se hace paso a paso, a medida que cada dominio pasa a la base. *(XL, repartido)*
- ☐ 🤖 **Relaciones por id, no por nombre:** sede, responsable de asesoría, programa y nivel de la matrícula hoy se guardan como texto. *(M)*
- ☐ 🤖 **Un solo formato de fecha (ISO)**, edad calculada (no guardada), un generador único de ids (varios usan `Date.now()`), y **una sola función de «hoy» con hora de Lima** (hoy usa la del navegador). *(M)*
- ☐ 🤖 **Operaciones con varios pasos = una sola transacción en la base** (función de Postgres): registrar un pago actualiza el plan, la caja y la auditoría; matricular crea alumno, titular, plan y cuotas. Si falla un paso, no queda nada a medias. *(L, transversal)*
- ☐ 🤖 **Auditoría en la base** (quién, cuándo, qué cambió) para dinero, precios, recetas y permisos, con disparadores. Hoy no se registra quién cambia precios, recetas ni permisos. *(L)*

### 6.1 Sedes, almacén y empresas como única fuente  *(Lote 2 de la revisión)*

**Hecho el 2026-11-07:** el sistema ya no tiene sedes, empresas ni almacén de ejemplo aparte: usa los de la base (16 sedes, 6 empresas y el almacén `ALM-001`), que se leen al iniciar sesión. Los datos de ejemplo apuntan a esas mismas sedes (mismos códigos `FIL-NNN`).
- ☑ **Datos de ejemplo con sedes que no estaban en la base** (Chiclayo, Cajamarca…): decidido el 2026-11-07 **cargar primero todas las sedes reales** (hecho: ya están las 16). Los 9 nombres que usan los datos de ejemplo (Piura, Chiclayo, Cajamarca, Los Olivos, San Isidro, Huancayo, Puno, Juliaca, Tacna) existen en la base; no se reubica ni se quita nada ahora, y los datos de ejemplo se quitan al final, cuando todo esté en la base. *(S)*
- ☑ **Que Matrículas, Caja, Stock y el resto usen las sedes y el almacén de la base (por id)** (2026-11-07): `AccessGate` lee empresas, sedes y almacén junto con roles y cuentas; `DataProvider` los recibe y todas las pantallas leen `branches`, `warehouses` y `companies` del contexto; los códigos de los datos de ejemplo pasaron de `FIL-PIU`… a `FIL-001`…; se retiraron `orgBranches`/`orgCompanies`/`orgWarehouses` (un solo lugar para cada dato). *(L)*
- ☑ **Lote 3** (2026-11-07): el contrato sabe de qué empresa es y la planilla es de una empresa y un mes; ver 6.6. *(L)*

### 6.2 Catálogo comercial

- ☐ 🤖 Programas, niveles, tipos de pago, tarifarios, promociones (con su composición), orígenes de leads. *(L)*
- ☐ 🧑 **Cargar los precios y condiciones reales** (tarifarios por sede/programa, promociones vigentes). *(M)*

### 6.3 Logística y stock

- ☐ 🤖 Artículos, precios, recetas, y el stock como **movimientos que nunca se editan** (entrada de compra, despacho, recepción, venta, devolución, ajuste con motivo). Envíos, transferencias, recepciones, ajustes y mermas. *(XL)*
- ☐ 🧑 **Inventario inicial:** conteo físico del almacén y de cada sede; se carga como un movimiento de ajuste por ubicación. *(M)*

### 6.4 Personas: titulares y alumnos

- ☐ 🤖 Titulares, alumnos y su vínculo, con los datos de menores protegidos (ver Fase 4). *(L)*

### 6.5 Matrícula, plan, pagos y caja *(el corazón: aquí está el dinero)*

- ☐ 🤖 Matrículas (con su ciclo: caída, reactivación, cambio de programa, traslado, renovación), planes y cuotas, pagos y reversas, caja y caja chica con sus cierres y reaperturas, notas de crédito, política de cobranza, mora y recordatorios. *(XL)*
- ☐ 🤖 **Pruebas de «dinero cuadra»:** que la suma de pagos, cuotas, caja y cierres coincida siempre. *(M)*

### 6.6 Contratos y planilla  *(Lote 3)*

- ☑ **Contratos y planilla en la base** (2026-11-07, migración 0007): cada contrato lleva su **empresa** (obligatoria, independiente de la sede donde trabaja; se puede cambiar con motivo y resguardos) y su cargo; la planilla es **de una empresa y un mes** (cada RUC cierra la suya, con boleta a su nombre y RUC) y al cerrar guarda la foto de las líneas; vacaciones y ajustes incluidos. Nadie escribe las tablas directo (solo funciones de la base que validan y dejan quién y cuándo); los **sueldos van en una tabla aparte** que solo lee quien tiene «Ver remuneraciones». Probado en una copia local de Postgres (121 casos) y con `check-contracts-db.ts`. Migraciones **0007 y 0008** (empresa editable) aplicadas el 2026-11-07. *(L)*
- ☐ 🤖 **Lo que queda de esto:** la agenda (Psicopedagogía, entrevistas, matrículas) todavía lee el personal y los contratos **de ejemplo** (`agendaContracts`): quien está de vacaciones o cesó en la base aún no se refleja ahí; pasa a la base con la agenda (6.7). La liquidación de beneficios al cese sigue sin hacerse. *(M)*
- ☐ 🧑 **Validar con contabilidad** las tasas (AFP/ONP, UIT, RMV) y las reglas de renta de 5.ª categoría: hoy son referenciales y viven en `utils/payrollEngine.ts`. *(M)*

### 6.7 Psicopedagogía y verificación

- ☐ 🤖 Asesorías y programación mensual, actividades especiales, seguimiento, capacidad, verificación de materiales **antes de la primera asesoría**. Que **los responsables de entrevistas y asesorías salgan de Personal** (hoy leen el personal de ejemplo). *(XL)*

### 6.8 Solicitudes, avisos y cierre del bloque

- ☐ 🤖 Solicitudes (caída, reactivación, cambio, traslado), avisos y alertas por regla, y el alcance por sede en **todas** las pantallas (hoy solo Stock, Kardex, Envíos, Transferencias, Recepciones, el asistente de matrícula y el Dashboard la respetan). *(L)*
- ☐ 🤖 **Retirar el código y los datos de ejemplo** una vez que todo esté en la base. *(M)*

---

## 7. Fase 4 — Lo legal y lo fiscal (decidir temprano)

Tiene **plazos de terceros**: conviene empezarlo ya, aunque el trabajo de código venga después.

### 7.1 Facturación electrónica (SUNAT)

Hoy hay notas de crédito con correlativo propio (control interno), pero **no** emisión electrónica.
- ☑ **Decisión de fondo (2026-11-07):** la **primera versión de producción** sigue emitiendo los comprobantes **fuera del sistema** con el facturador actual; el sistema solo registra tipo, serie y número y valida que no se repitan (como hoy). La emisión integrada es de una **versión futura**, no de la primera. *(decisión)*
- ⏸ 🧑 **Versión futura** (no bloquea el lanzamiento): al integrar, elegir **OSE/PSE**, con certificado por empresa (**cada empresa tiene su RUC**), y definir con el contador series por sede, IGV, notas de crédito/débito, comunicación de baja, resumen diario y guías de remisión. *(L)* → 🤖 integrar. *(XL)*

### 7.2 Contrato de matrícula y documentos

- ☐ 🧑 **Revisión legal del texto del contrato y de la ficha** (hoy es un modelo). *(M)*
- ☐ 🤖 Guardar los PDF generados y los escaneos firmados (necesita Fase 5.1). *(M)*
- ☐ 🧑 Decidir si se exige el contrato firmado para verificar o cobrar. *(decisión)*

### 7.3 Protección de datos personales (Ley N.º 29733 y su reglamento)

El sistema guarda **datos de menores** (alumnos) y de sus apoderados. **Consultar con un asesor legal** qué corresponde a la institución; como mínimo suele implicar:
- ☐ 🧑 **Política de privacidad** y texto de **consentimiento del apoderado** en la ficha de matrícula. *(M)*
- ☐ 🧑 Verificar la **inscripción del banco de datos personales** y los procedimientos para que las personas ejerzan sus derechos (acceso, corrección, cancelación). *(M)*
- ☐ 🧑 **Política de conservación y borrado** de datos y a quién se da acceso. *(M)*
- ☐ 🤖 Que el sistema permita lo anterior: exportar, corregir y anonimizar un alumno o titular sin romper los pagos históricos. *(M)*

### 7.4 Planilla

- ☐ 🧑 **Liquidación de beneficios al cese** (gratificación, CTS, vacaciones truncas) y archivos para **PLAME / T-Registro**: definir con contabilidad si el sistema los genera o solo informa. *(decisión)* → 🤖 si se hace. *(L)*

---

## 8. Fase 5 — Archivos y comunicación

### 8.1 Almacenamiento de archivos

Hoy los vouchers, fotos, capturas y contratos firmados solo guardan **el nombre** del archivo.
- ☐ 🤖 **Supabase Storage** con depósitos **privados**, seguridad por sede y enlaces temporales; tamaños y tipos permitidos. *(L)*
- ☐ 🧑 Decidir cuánto tiempo se conservan y quién puede verlos. *(S)*

### 8.2 Mensajes automáticos (WhatsApp y correo)

Hoy los recordatorios de cobranza se **preparan y se registran**, pero no se envían solos.
- ☐ 🧑 Elegir el canal: **WhatsApp Business (API oficial)** — requiere cuenta verificada y **plantillas aprobadas por Meta** — o seguir con envío manual al inicio. *(decisión)*
- ☐ 🧑 Plan de correo de Resend acorde al volumen (el gratis es de 100/día). *(S)*
- ☐ 🤖 Envío programado, registro de entregados/fallidos y **consentimiento (opt-in)** de cada apoderado. *(L)*

### 8.3 Más adelante

- ☐ 🤖 **Prospectos (CRM):** el flujo prospecto → entrevista → matrícula, y conexión con la web (por ejemplo, una entrevista agendada en la web que llegue al sistema, por un canal controlado, **no compartiendo tablas**). *(XL)*
- ☐ 🤖 **Portal del apoderado.** *(XL)*

---

## 9. Fase 6 — Calidad y pruebas antes del piloto

- ☐ 🤖 **Pruebas por rol** (`PRUEBAS_POR_ROL.md`) con cuentas reales de cada rol: qué ve y qué puede cada uno, comprobado en pantalla, no solo en los scripts. *(M)*
- ☐ 🤝 **Prueba real de alcance por sede:** dos cuentas de sedes distintas no deben verse entre sí en ninguna pantalla ni por la dirección de la base. *(M)*
- ☐ 🤖 **Pruebas de extremo a extremo** de los flujos críticos (iniciar sesión → matricular → cobrar → cerrar caja → entregar materiales → asesoría). Hoy no hay pruebas de pantalla: solo scripts. *(L)*
- ☐ 🤖 **Rendimiento:** el paquete principal pesa más de 500 kB; partirlo por pantallas (carga diferida) y revisar consultas con muchos datos. *(M)*
- ☐ 🤖 **Pantallas «en construcción»** (Preferencias y Ayuda): terminarlas o quitarlas del menú. *(S)*
- ☐ 🤖 **Revisión final de seguridad:** avisos de Supabase, políticas RLS de **cada tabla nueva**, claves en el repositorio, permisos de la función `usuarios`. *(M)*
- ☐ 🤝 **Manual y capacitación** por rol (Administración, Caja, Psicopedagogía, Almacén, Ventas): guía corta con capturas y una sesión de práctica con datos de pruebas. *(M)*
- ☐ 🧑 **Simulacro de caja:** una persona de caja hace un día completo en el entorno de pruebas y se compara contra su registro manual. *(M)*

---

## 10. Fases 7, 8 y 9 — Piloto, lanzamiento y después

### Fase 7 — Piloto en UNA sede

- ☐ 🧑 **Elegir la sede piloto** (propuesta: Los Olivos) y su responsable. *(decisión)*
- ☐ 🤝 **Carga inicial** de esa sede: alumnos, titulares, matrículas vigentes, **saldos de cuotas**, stock inicial, contratos del personal. Con un día de **corte** definido: desde esa fecha, todo se registra en el sistema. *(L)*
- ☐ 🤝 **Plan de salida en caso de problema:** *Instant Rollback* de Vercel para el código; scripts `deshacer` para las migraciones; respaldo de la base antes del día del corte. *(S)*
- ☐ 🧑 **Canal de soporte** durante el piloto: quién responde, por qué medio, en qué horario. *(S)*
- ☐ 🤝 **Duración y criterios** para dar el piloto por bueno (por ejemplo: caja cuadra todos los días, sin pérdida de datos, tiempo de registro aceptable, sin errores graves abiertos). *(S)*
- ☐ 🤖 Corregir lo que salga; **cada hallazgo se anota** y se prueba en staging antes de publicarse.

### Fase 8 — Lanzamiento por olas

- ☐ 🤝 **Orden de las sedes** y fecha de corte de cada una (por ejemplo, de 2 a 4 sedes por ola). Cada ola repite: carga inicial → capacitación → corte → soporte reforzado la primera semana. *(L, repartido)*
- ☐ 🧑 **Apagar el proceso anterior** de cada sede cuando su corte esté estable (sin doble registro permanente). *(S por sede)*
- ☐ 🤖 Vigilar errores, rendimiento y avisos de Supabase entre olas. *(recurrente)*

### Fase 9 — Después del lanzamiento

- ☐ Facturación electrónica integrada, mensajes automáticos, prospectos, portal del apoderado (según §7 y §8).
- ☐ Revisar costos y límites (correos, almacenamiento, base de datos) cada mes durante el primer trimestre.
- ☐ Revisión de seguridad y de respaldos cada trimestre; simulacro de restauración cada semestre.
- ☐ Cortes históricos de los reportes (hoy se calculan siempre «al día») y reportes contables.

---

## 11. Decisiones que necesito de ti

| # | Decisión | Mi recomendación | Hace falta para |
|---|---|---|---|
| 1 | ¿Empresa de cada sede y del almacén? | ✅ Resuelto (2026-11-07): 6 empresas y 16 sedes cargadas; Piura es de Ensil Evolution; Ilo se carga después. Falta confirmar la razón social exacta de las 4 empresas nuevas | Fase 2 |
| 2 | Datos de ejemplo con sedes inexistentes | Cargar **todas** las sedes reales primero: los datos de ejemplo (que ya usan nombres de sedes reales) se enlazan solos por nombre; no hace falta reubicar ni quitar nada ahora | Fase 3 (6.1) |
| 3 | Planes de pago: Supabase Pro, Vercel Pro, PITR | ⏸ Diferido (2026-11-07): sigue el plan gratis con datos de prueba; **obligatorio antes del primer dato real** | Fase 1 |
| 4 | Dominio definitivo | ⏸ Diferido: se sigue con `ensil-sistema.vercel.app`; conectar el dominio antes del piloto | Fase 1 |
| 5 | Segundo proyecto de Supabase para pruebas | ⏸ Diferido; hacerlo antes del primer dato real (hoy las pruebas escriben en la base real, que solo tiene datos de prueba) | Fase 1 |
| 6 | Facturación: ¿fuera del sistema en el piloto? | ✅ Decidido (2026-11-07): sí, y también en la primera versión de producción; integrar OSE/PSE en una versión futura | Fase 4 |
| 7 | Revisión legal (contrato, privacidad, datos de menores) | Empezar ya con un asesor | Fase 4 |
| 8 | Canal de mensajes: ¿WhatsApp oficial o manual al inicio? | Manual al inicio; WhatsApp oficial después | Fase 5 |
| 9 | Sede piloto | Los Olivos | Fase 7 |
| 10 | Planilla: ¿el sistema genera PLAME/T-Registro y liquidaciones? | Informar primero; generar después | Fase 4 |

---

## 12. Riesgos que conviene tener presentes

1. **El piloto no puede empezar sin la Fase 3 completa para esa sede:** un solo dominio en memoria (por ejemplo, la caja) hace perder dinero registrado al recargar.
2. **Mezclar datos de ejemplo con datos reales:** ya pasó una vez (los ids `STF-001` chocaban). Hasta retirar los datos de ejemplo, cada pantalla debe leer **de un solo mundo**.
3. **Publicar directo a `main`:** un error llega a producción en minutos. La Fase 1.4 lo corrige.
4. **Previsualizaciones apuntando a la base real:** corregir con el entorno de pruebas (1.3).
5. **Dinero sin transacciones:** si un cobro falla a la mitad, el plan, la caja y la auditoría no coinciden. Por eso las operaciones con varios pasos van en la base (6.0).
6. **Datos de menores:** un error de acceso por sede es un problema legal, no solo técnico. Las pruebas de alcance (Fase 6) no son opcionales.
7. **Dependencia de pocas personas** para el acceso (una sola cuenta de Superusuario y un solo correo de entrega): agregar una segunda cuenta técnica de respaldo y guardar las claves en un gestor.
8. **Límites de los planes gratis** (correos, base de datos, pausa por inactividad): se resuelven con la Fase 1.1, antes del primer dato real.

---

## 13. Resumen de una página

| Fase | Qué | Quién | Tamaño |
|---|---|---|---|
| 0 | Seguridad pendiente (contraseñas y claves expuestas, repositorio privado) | 🧑 | S |
| 1 | Planes Pro, dominio, staging, CI, seguridad de Supabase/Vercel, respaldos, monitoreo | 🧑🤝🤖 | M–L |
| 2 | Empresas, 17 sedes, almacén, roles, personal y cuentas reales | 🧑🤝 | M |
| 3 | Persistir todo el sistema en la base (catálogos → stock → personas → matrícula y dinero → contratos → psicopedagogía → solicitudes), con auditoría y transacciones | 🤖 | **XL** |
| 4 | Facturación, contrato y privacidad (legal), planilla | 🧑🤖 | L (con plazos de terceros) |
| 5 | Archivos (Storage), WhatsApp/correo automáticos | 🤖🧑 | L |
| 6 | Pruebas por rol, alcance por sede, extremo a extremo, rendimiento, capacitación | 🤝🤖 | L |
| 7 | **Piloto en una sede** (Los Olivos) | 🤝 | L |
| 8 | Lanzamiento por olas al resto de sedes | 🤝 | L |
| 9 | Después: facturación electrónica, mensajes, prospectos, portal | — | — |

**Siguiente paso concreto:** Fase 0 (tú, hoy), las decisiones 1–5 de §11, y empezar la Fase 3 por 6.0 y 6.1 (preparación y sedes como fuente única).
