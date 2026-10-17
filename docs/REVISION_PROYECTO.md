# Revisión del proyecto — Sistema ENSIL

**Fecha de revisión:** 2026-10-07 · **Rama:** `main` (commit `e91ad28`)
**Alcance:** 77 archivos versionados, ≈ 23 870 líneas.

> **Nota sobre la cobertura.** Leí completos `DataContext.tsx` (2 158 líneas, núcleo del sistema), `AppShell`, `Sidebar` (parte), `modules.ts`, `api.ts`, `supabase.ts`, `useSupabaseQuery.ts`, `mockData.ts`, la configuración (Vite, TS, `package.json`, `index.html`) y los documentos de `docs/`. Leí en detalle `Dashboard`, `Cash`, `Payments`, `PettyCash`, `Messaging`, `SettingsPage`, `Contracts`, el asistente de matrícula y la lógica de `Verification`. El resto de las páginas (≈ 14 000 líneas de formularios y tablas) las revisé con búsquedas sistemáticas: qué datos usan, qué funciones de escritura llaman y qué botones tienen o no handler. Compilé el proyecto (`tsc` y `vite build`). No ejecuté la app en navegador ni hay pruebas automáticas.

---

## 1. Objetivo real del sistema

**Qué es:** un sistema administrativo / ERP interno ("Sistema ENSIL") para una red de institutos educativos peruanos. Por los datos de ejemplo, ENSIL enseña **lectura veloz y comprensión lectora** a niños y adolescentes (programas *Pre-Kids*, *Kids*, *Pre-lectura*, *Especialización*; métricas de velocidad y comprensión; "evaluación de campo visual"). Esto es una inferencia a partir del código, no hay un documento que lo declare.

**Estructura del negocio que modela:**
- 1 empresa (*Educación y Cultura S.A.C.*), 9 filiales: Piura (almacén central), Chiclayo, Cajamarca, Los Olivos, San Isidro, Huancayo, Puno, Juliaca, Tacna.
- Ciclo comercial: **tarifario + tipo de pago + promoción → matrícula → plan de cuotas → pagos → caja**.
- Ciclo logístico: **catálogo de artículos → recetas de materiales por programa/nivel → stock por filial → envíos / transferencias → recepción → kardex**. La *Verificación* entrega al alumno los materiales de su receta y descuenta stock.
- Ciclo pedagógico: **programación de citas → primera asesoría → seguimiento (velocidad/comprensión) → cronogramas mensuales**.
- Personas y organización: alumnos, titulares (apoderados), personal, contratos, asignaciones; empresas, filiales, usuarios, roles, permisos.

**Objetivo final (según los menús y documentos de `docs/`):** reemplazar hojas de cálculo y procesos manuales por un solo sistema multi-sede con control de caja y cartera, inventario trazable (kardex auditable), roles/permisos por filial, auditoría y reportes.

**Estado frente a ese objetivo:** hoy es un **prototipo de interfaz con datos en memoria**. Cubre la apariencia y los flujos de la mayor parte del negocio, pero no hay backend, autenticación, persistencia ni reportes. Nada de lo que se registra sobrevive a recargar la página.

---

## 2. Ficha técnica

| Aspecto | Detalle |
|---|---|
| Tipo | SPA (aplicación de una página) en el navegador, sin servidor |
| Lenguaje | TypeScript 5.8 (sin `strict`) |
| UI | React 19.0, Tailwind CSS 4 (`@tailwindcss/vite`), lucide-react, `motion` (solo en 3 páginas) |
| Enrutado | react-router-dom 7 (`BrowserRouter`; una sola ruta comodín, el contenido se decide por texto del menú) |
| Build | Vite 6 · `npm run dev` (puerto 3000), `build`, `lint` (= `tsc --noEmit`) |
| Estado | Un único `DataContext` con `useState` y datos semilla |
| Backend previsto | Supabase (`@supabase/supabase-js` + `lib/supabase.ts`) — **creado pero sin uso** |
| Tipografía | Inter, cargada desde Google Fonts |
| Moneda / país | PEN y USD; DNI/RUC, `es-PE` |
| Tamaño | 77 archivos · ≈ 23 870 líneas · 38 páginas · 12 componentes UI |
| Bundle | 1 136 kB (244 kB gzip), un solo chunk (Vite avisa) |
| Calidad verificada | `tsc --noEmit`: **0 errores** · `vite build`: **OK** (11 s) |
| Pruebas / ESLint / README / CI | **No existen** |
| Origen | Generado desde plantilla de Google AI Studio (comentarios, `metadata.json`, `.env.example`) |

**Módulos de menú (`config/modules.ts`):** Dashboard · Mensajería · Operación (6) · Logística (7) · Psicopedagogía (4) · Personas (5) · Configuración comercial (6) · Organización (5) · Reportes (8) · Sistema (6) · más el modal de Configuración (Orígenes de leads, Couriers y métodos de envío).

---

## 3. Estado por módulo

Leyenda: ✅ funcional sobre datos en memoria · 🟡 parcial · ❌ maqueta / no funciona.

### Organización
| Pantalla | Estado | Observación |
|---|---|---|
| Empresas | ✅ | CRUD con validación. El texto del diálogo dice "eliminados permanentemente", contra la regla del documento (`01_flujo_empresas.md`: solo inactivar). `deleteCompany` borra físicamente. |
| Filiales | ✅ | CRUD, inactivación con confirmación. |
| Usuarios | 🟡 | CRUD de fichas. No crea credenciales reales; "resetear acceso" es solo interfaz. `Users.tsx:86-87` rellena documento y teléfono falsos. |
| Roles | ✅ | CRUD, duplicar. El contador de usuarios por rol (`users`) es un número fijo, no se calcula. |
| Permisos | 🟡 | La matriz se guarda, pero **ningún componente la consulta**. Los botones superiores no tienen acción. Faltan las excepciones por usuario que muestra el diagrama. |

### Configuración comercial
| Pantalla | Estado |
|---|---|
| Programas, Niveles, Tipos de pago, Tarifarios, Promociones | ✅ CRUD completos con validaciones y confirmación. |
| Recetas de materiales | ✅ CRUD; usa `setRecipes` directo. |

### Operación
| Pantalla | Estado | Observación |
|---|---|---|
| Matrículas (listado) | 🟡 | Lista y detalle. "Editar datos", "Ver plan", "Solicitar caída" y "Guardar vista" no hacen nada. |
| Asistente de nueva matrícula | 🟡 | Flujo de 6 pasos que sí crea titular, alumno, matrícula, plan y pago inicial. Ver problemas críticos (§4). |
| Planes y cartera | ✅ | Registrar pago por cuota y refinanciar. El saldo del plan al refinanciar se suma sin descontar la cuota anterior (comentario del propio código, `DataContext.tsx:1710`). |
| Pagos | ❌ | Lista fija local (`mockPayments`, 3 filas). "Guardar y aplicar" y "Confirmar reversa" no tienen acción. No lee `payments` del contexto. |
| Verificación | ✅ | Busca receta vigente por programa/nivel/sede, entrega artículos y descuenta stock (incluye componentes de kits). Depende de datos que el asistente no guarda (§4.2). |
| Caja | 🟡 | Solo la **venta directa** funciona (descuenta stock + kardex). Los movimientos son 3 filas fijas; "Registrar egreso" y "Crear lote" no hacen nada. |
| Caja chica | ❌ | Totalmente maqueta (`mockMovements`, sin contexto). |

### Logística
| Pantalla | Estado | Observación |
|---|---|---|
| Catálogo de artículos | ✅ | Asistente por pasos, tipos (material, libro, kit, herramienta). Dos botones de configuración de sesiones sin acción. |
| Stock | ✅ | Ingresos, mínimos, empaquetar/desempaquetar, ajustes. |
| Envíos | ✅ | Cajas, courier/viajero, estados, adjuntos (solo se guarda el nombre del archivo). |
| Transferencias | 🟡 | Flujo de solicitud→aprobación→despacho. **Descuenta stock dos veces** (§4.1). |
| Recepciones | ✅ | Confirma, detecta diferencias, genera incidencias. Las incidencias no tienen pantalla propia. |
| Kardex | ✅ | Solo lectura. "Exportar" no tiene acción. |
| Ajustes y mermas | ✅ | Impacta stock y kardex. |
| Couriers / métodos (Configuración) | ✅ | CRUD. |

### Psicopedagogía
| Pantalla | Estado | Observación |
|---|---|---|
| Programación | ❌ | "Guardar y Confirmar Reserva" solo cierra el modal. No crea la cita. |
| Primera asesoría | ❌ | "Guardar Registro" solo cierra el panel. |
| Seguimiento | ✅ | Registra seguimientos con métricas (`addTracking`). |
| Cronogramas mensuales | ❌ | "Guardar Cronograma" solo cierra; exportar PDF/imagen y eliminar sin acción. |

### Personas
| Pantalla | Estado | Observación |
|---|---|---|
| Alumnos, Titulares, Personal | ✅ | CRUD básico. "Ver matrículas", "Ver estado de cuenta", "Ver contratos" sin acción. En Titulares, `students`, `enrollments` y `balance` son valores fijos (`'$800'`), no calculados, y en dólares aunque la moneda base es PEN. |
| Contratos | ❌ | Solo lectura; "Guardar Contrato" cierra el modal sin guardar. |
| Asignaciones | ❌ | Igual: "Guardar Asignación" no guarda. |

### Otros
| Pantalla | Estado | Observación |
|---|---|---|
| Dashboard | ❌ | Todo es texto fijo (1 248 matrículas, sedes "Lima/Trujillo/Arequipa" que no existen en el sistema, "Pago a Proveedor IT"). No lee el contexto. Los botones de accesos rápidos no hacen nada. |
| Mensajería | 🟡 | Bandeja local en memoria (no usa notificaciones del sistema). Responder/Reenviar sin acción. |
| Notificaciones (campana) | ✅ | Funciona desde el contexto. |
| **Reportes** (8 ítems) | ❌ | Sin implementar: muestra "Vista en construcción". |
| **Sistema** (Auditoría, Solicitudes, Cierres, Reaperturas, Preferencias, Ayuda) | ❌ | Sin implementar. |

**Resumen cuantitativo:** de 38 pantallas, ≈ 24 funcionales, ≈ 7 parciales y ≈ 7 maquetas, **más 14 ítems de menú (Reportes y Sistema) sin ninguna vista**. Hay **26 acciones de menú contextual con `onClick: () => {}`** en 12 archivos.

---

## 4. Problemas encontrados (por prioridad)

### 4.1 Críticos (datos incorrectos)
1. **Doble descuento de stock en transferencias.** `updateTransferStatus` descuenta el origen al pasar a "En tránsito" (`DataContext.tsx:1561-1565`) y `confirmReception` lo vuelve a descontar al recibir (`:1070-1079`). Cada transferencia resta dos veces del origen.
2. **El asistente de matrícula no guarda `programId`, `levelId` ni `branchId`** (`:1819-1830`; solo texto en `program`, `level`, `sede`). La *Verificación* filtra recetas por esos tres campos (`Verification.tsx:~105-115`), por lo que **ninguna matrícula nueva puede verificarse ni entregar materiales**. Solo funcionan las 5 de ejemplo.
3. **El asistente no está conectado a Programas, Niveles, Tarifarios ni Promociones.** Programa y nivel son texto libre (`'Kids'`, `'Básico 1'`, que además no coinciden con los niveles reales "Nivel 1/2/3"); el total (1 200) y las cuotas (6) son campos manuales. Todo el módulo comercial no influye en el precio.
4. **Mutación de estado con efectos secundarios dentro de un actualizador.** `updateStock` llama a `setKardex` dentro de `setStockItems(prev => …)` (`:1463-1522`). En React 19 con `StrictMode` (activo en `main.tsx`), el actualizador se ejecuta dos veces en desarrollo y **duplica las entradas de kardex**.
5. **El stock puede quedar negativo.** `updateStock` no valida saldo; solo algunas pantallas lo comprueban antes de llamar.

### 4.2 Seguridad y control de acceso
6. **No existe autenticación.** El usuario es fijo: `Superadmin / Superusuario` (`:989-994`). No hay login, sesión ni protección de rutas.
7. **Los permisos no se aplican.** Solo `Sidebar.tsx` y `Receptions.tsx` miran el rol, con comparaciones de texto en tres opciones de Logística. La matriz de permisos y el rol de usuario no restringen nada.
8. **Auditoría ausente.** Los diagramas de `docs/` exigen "Registrar auditoría" tras cada guardado; el código no lo hace. Tampoco está el módulo *Auditoría*.
9. **`vite.config.ts` inyecta `GEMINI_API_KEY` en el bundle del cliente** (`define: 'process.env.GEMINI_API_KEY'`). Si el `.env` tiene una clave real, quedaría visible para cualquiera. Además la clave no se usa en ningún lugar del código.
10. **Datos personales de menores y de personal** (documentos, direcciones, sueldos en Contratos) están incrustados en el código fuente como datos semilla. Hay que verificar que sean ficticios antes de publicar el repositorio.

### 4.3 Integridad de datos
11. **Sin persistencia.** Todo vive en `useState`; recargar pierde todo. Solo el borrador del asistente se guarda en `localStorage` (con `JSON.parse` en `try` vacío).
12. **Identificadores frágiles:** `Math.random()` para alumnos/personal/matrículas/planes (`STF-xxx`, `ALU-xxx`, `MAT-2024-xxx`: colisionan y el año está fijo en 2024); `Date.now()` para casi todo lo demás; correlativos calculados con `length + 1`, que repiten número si se elimina un registro (`TRF-`, `ENV-`).
13. **Entidades enlazadas por nombre y no por ID:** `Enrollment.student`, `Student.titular`, `Payment.student`, `Kardex.branch/material`, `Assignment.branch`. Renombrar algo rompe el vínculo.
14. **Pago registrado con alumno genérico:** `registerPayment` guarda `student: 'Alumno'` (`:1673`). El listado global de pagos no corresponde.
15. **Fechas como texto** ("15 Abr 2024") mezcladas con ISO; imposibilita ordenar, calcular mora o vencimientos. Las cuotas nuevas del asistente tienen `dueDate: 'Mes 1'`.
16. **Eliminación física** de empresas, filiales, alumnos, roles, etc., sin verificar dependencias (contradice la regla de negocio de soft delete).
17. **Edición de transferencias/envíos con `setShipments(shipments.map…)`** usando el valor capturado, no el actualizador funcional; expuesto a perder cambios si hay dos actualizaciones seguidas.
18. **Datos semilla inconsistentes:** Tarifarios `3` y `4` apuntan a `branchId: 'FIL-001'`, que no existe. Varias fechas de ejemplo son 2024 (vencidas) frente a otras en 2026; las tarifas y recetas de 2024 ya habrían expirado, y la verificación filtra por vigencia, por lo que **las recetas de ejemplo no aplican hoy**.
19. **`alert()` del navegador** en `packPackage`.

### 4.4 Calidad de código y configuración
20. **`DataContext.tsx` monolítico** (2 158 líneas, 60+ funciones, ≈ 30 colecciones). Es lo primero que habrá que reemplazar con la capa de datos real.
21. **Uso de `any` extendido** (`addEnrollmentFlow(data: any)`, `registerPayment(..., any)`, `installments: any[]`, `metrics: any`). TypeScript sin `strict`.
22. **Código muerto:** `src/data/mockData.ts` es de **otra plantilla** (instituto técnico: "Desarrollo de Software", MINEDU); `api.ts` y `useSupabaseQuery.ts` no se usan; `logistics/Shipping.tsx` solo se ve desde el modal de Configuración; `types.ts` casi vacío; los tipos reales viven en `DataContext`.
23. **Dependencias no usadas:** `express`, `@google/genai`, `dotenv`, `framer-motion` (se usa `motion`), `tsx`, `@types/express`. `vite` está duplicado en `dependencies` y `devDependencies`.
24. **`package-lock.json` desincronizado:** `npm ci` falla ("Missing: @tailwindcss/oxide-*"). Hay que regenerarlo para builds reproducibles.
25. **Metadatos de plantilla:** `name: "react-example"`, `<title>Sistema de Gestión</title>`, `metadata.json` sin descripción, `.env.example` con instrucciones de AI Studio. El alias `@` apunta a la raíz del proyecto, no a `src`. Comentario con codificación dañada en `vite.config.ts`.
26. **Enrutado poco robusto:** una sola ruta `/*`; el contenido se resuelve comparando textos con tildes (`'Matrículas'`). Los ítems de Reportes/Sistema con el mismo nombre ("Matrículas", "Auditoría") se confunden entre módulos: p. ej. entrar a *Reportes → Matrículas* muestra la pantalla de **Operación → Matrículas**, y *Reportes → Stock*, *Caja*, *Verificación* abren las pantallas operativas en lugar de un reporte.
27. **Rendimiento:** un solo bundle de 1,1 MB, sin `lazy`/code-splitting.
28. **Accesibilidad / i18n:** tipografía externa en tiempo de ejecución, todo hardcodeado en español (adecuado para el alcance) y sin pruebas.

---

## 5. Qué está terminado y qué no

### Terminado (a nivel de interfaz y lógica en memoria)
- Estructura de navegación, layout, selector de filial global y notificaciones.
- Todo el módulo **Configuración comercial** (programas, niveles, tipos de pago, tarifarios, promociones, recetas).
- Todo el módulo de **Organización** salvo permisos efectivos y credenciales.
- **Logística completa en pantalla**: catálogo, stock, kits, envíos, recepciones con incidencias, kardex, ajustes (con la excepción del doble descuento en transferencias).
- Cobranza por cuotas (registrar pago, refinanciar) y verificación con entrega de materiales.
- CRUD de alumnos, titulares y personal.
- Documentación de flujos de Organización (2 diagramas).

### Parcial
- Asistente de matrícula (no usa catálogos, no guarda IDs).
- Caja (solo venta directa), Permisos (guardados pero ignorados), Mensajería (aislada), Usuarios (sin credenciales).

### Sin hacer
- **Backend / Supabase**, autenticación, autorización, persistencia, auditoría.
- Pagos (comprobantes y reversas), Caja chica, egresos y lotes de depósito, cierres y reaperturas.
- Contratos y Asignaciones (alta/edición), Programación de citas, Primera asesoría (guardado), Cronogramas mensuales (guardado/exportar).
- **Reportes (8)** y **Sistema (6)**: sin pantallas.
- Dashboard con datos reales; exportaciones (Excel/PDF); impresión de comprobantes.
- Facturación electrónica (SUNAT) — no hay rastro, aunque se registran boletas/facturas manualmente.
- Pruebas, CI, README, ESLint, control de errores.

---

## 6. Plan sugerido (orden recomendado)

1. **Corregir lo que da datos erróneos (1–2 días):** doble descuento en transferencias; mover el efecto de `setKardex` fuera del actualizador; validar stock negativo; guardar `programId/levelId/branchId` en la matrícula.
2. **Limpieza (½ día):** borrar `mockData.ts`, `api.ts` (o usarlos), dependencias sobrantes; regenerar `package-lock.json`; quitar `define` de `GEMINI_API_KEY`; renombrar paquete y título; añadir README.
3. **Definir el modelo de datos en Supabase** (tablas con IDs UUID, claves foráneas, fechas `date`/`timestamptz`, soft delete, auditoría) y reemplazar `DataContext` por una capa de servicios por módulo.
4. **Autenticación + RLS por empresa/filial** y hacer efectivos los permisos (hook `usePermission`).
5. **Conectar el asistente de matrícula** a programas/niveles/tarifarios/promociones y generar cuotas con fechas reales.
6. **Completar los módulos vacíos:** Pagos, Caja/Caja chica, Contratos, Asignaciones, Psicopedagogía; luego Dashboard y Reportes.
7. **Pruebas** (Vitest para reglas de stock y cartera; Playwright para los flujos de matrícula y recepción).

---

*Este documento describe el estado del repositorio a la fecha indicada. Las afirmaciones sobre el comportamiento en tiempo de ejecución (p. ej. duplicado de kardex bajo StrictMode) se derivan de la lectura del código y no se probaron en el navegador.*

---

# Etapa 1 — Auditoría técnica y dependencias (2026-10-10)

> Nota: los prompts citan `REVISIÓN PROYECTO.MD`; el archivo real es este (`docs/REVISION_PROYECTO.md`).
> Estado de la etapa: **auditoría completada, sin cambios de código**. Hay una decisión pendiente (sección E).

## A. Verificación de los dos cambios «probablemente ya aplicados»

| Cambio | Estado | Evidencia |
|---|---|---|
| **A. Tarifario con nivel opcional** (Programa + Nivel opcional + Tipo de pago) | **NO aplicado** | `Tariff` (`DataContext.tsx` ~517-533) no tiene `levelId`; `Tariffs.tsx` no usa `levels` ni muestra selector de nivel. |
| **B. Tipo de pago desacoplado de programas** | **NO aplicado** | `PaymentType.applicablePrograms: string[]` sigue en el tipo, en los 4 datos semilla y en el formulario de `PaymentTypes.tsx` (selector «Aplica a todos los programas» / lista). |

Dato relevante para B: `applicablePrograms` **no lo consume ninguna otra pantalla** (solo `PaymentTypes.tsx` y la semilla). `Tariffs.tsx` ya lista **todos** los tipos de pago sin filtrar por programa. Quitarlo de la UI no afectaría a otros módulos.

## B. Fuente de cada dato del asistente «Registrar nueva matrícula»

| Elemento | Fuente actual | Observación |
|---|---|---|
| Sede | `branches` (activas) | Select libre; ignora `currentBranchId` |
| Fecha de matrícula | `contexto.fecha` | El flujo guarda `new Date()`, no la elegida |
| Origen del lead | `leadSources` (activos) | Se guarda `origenId`, se lee `origen` |
| Responsable | `staff` filtrado por `assignments.area === 'Psicopedagogía'` | No filtra por sede ni estado |
| Titulares / Alumnos | Formulario libre + búsqueda en `guardians`/`students` | Apellidos se pierden en `addEnrollmentFlow` |
| Programa | **Lista fija en el JSX** (Kids, Teens, Pre-Kids, Especialización) | No usa `programs` |
| Nivel | **Texto libre** (`'Básico 1'`) | No usa `levels` |
| Tipo de pago / cuotas | **Select fijo** cuotas/contado + n.º manual | No usa `paymentTypes` ni `tariffs` |
| Tarifario / precio | **Número manual** (1 200) | No usa `tariffs` |
| Promoción | No existe en el asistente | `promotions` solo se edita en Configuración |
| Pago inicial | Formulario libre | Crea `Payment` con alumno genérico en `registerPayment` |
| Resumen | Solo `students[0]` | Ignora al segundo alumno |

## C. Estructuras de Configuración (fuente única = `DataContext`)

| Entidad | Tipo | ID | Estado | Vigencia | Moneda | Sede |
|---|---|---|---|---|---|---|
| Programa | `Program` | `Date.now()` / semilla `'1'..'4'` | `Activo/Inactivo` | — | — | `allBranches` + `enabledBranches[]` |
| Nivel | `Level` | ídem | `Activo/Inactivo` | — | — | — (por `programId`) |
| Tipo de pago | `PaymentType` | ídem | `Activo/Inactivo` | — | — | — |
| Tarifario | `Tariff` | ídem | `Activo/Inactivo` | `startDate/endDate?` | `PEN/USD` | `branchId` (`'all'` o id) |
| Promoción | `Promotion` | ídem | `Activo/Inactivo` | `startDate/endDate` | `PEN/USD` | `branchIds[]` + `applyToAllBranches` |
| Receta | `Recipe` | `REC-${Date.now()}` | `Activo/Inactivo` | `startDate/endDate?` | — | `branchIds[]` + `applyToAllBranches` |
| Artículo | `Item` | texto (`ITM-…`) | `Activo/Inactivo` | — | — (`cost`, `salePrice`) | — |

### Incompatibilidades de contrato detectadas (sin corregir aún)
1. `LeadSource.status` usa `'active'/'inactive'`; el resto usa `'Activo'/'Inactivo'`.
2. Sede representada de tres maneras: `branchId` + `'all'` (Tarifario), `allBranches` + `enabledBranches` (Programa), `applyToAllBranches` + `branchIds` (Promoción, Receta).
3. Semilla con referencias rotas: Tarifarios `3` y `4` → `branchId: 'FIL-001'` (no existe).
4. Vigencias semilla de Tarifarios, Promociones y Recetas vencen el 2024-12-31 → hoy ninguna aplica.
5. IDs generados con `Date.now()` (sin garantía de unicidad entre sesiones).
6. `Tariff.includesEnrollment/includesMaterials/materialsValue` mezcla materiales con precio (la etapa 2 pide separarlo).
7. `PaymentType.allowPartial/maxPartials` modela partes de pago dentro del tipo de pago (la etapa 2 pide moverlo).

## D. Archivos afectados por las etapas siguientes
- **Etapa 2** (Tarifarios y pagos): `Tariffs.tsx`, `PaymentTypes.tsx`, `DataContext.tsx` (`Tariff`, `PaymentType`, `Plan`, `Payment`, semillas), `Plans.tsx`.
- **Etapa 3** (Promociones): `Promotions.tsx`, `DataContext.tsx` (`Promotion`, semillas).
- **Etapa 4** (Catálogo y stock): `ItemCatalog.tsx`, `Recipes.tsx`, `Stock.tsx`, `Verification.tsx`, `DataContext.tsx` (`updateStock`, kardex, transferencias).
- **Etapa 5** (Integración): `NewEnrollmentWizard.tsx`, `AppShell.tsx`, `DataContext.tsx` (`addEnrollmentFlow`).

## E. Validaciones y pendiente
- `tsc --noEmit`: **0 errores** (línea base). `vite build`: OK en la revisión anterior. No existen `lint` propio ni tests.
- Código **sin modificar** en esta etapa: no hay regresiones posibles.
- **Pendiente de decisión del usuario:** los cambios A y B no están en este repositorio (`main`, commit `e91ad28`, árbol limpio). Ver pregunta en la conversación.

## F. Cierre de la Etapa 1 (2026-10-10)

Con el documento `CONTEXTO DE PUNTOS A CORREGIR.md` (puntos 1 y 2 de las correcciones aprobadas) se aplicaron los dos cambios que faltaban, de forma aditiva:

| Cambio | Archivos | Detalle |
|---|---|---|
| **A. Tarifario con nivel opcional** | `DataContext.tsx` (`Tariff.levelId?`), `Tariffs.tsx` | Selector «Nivel» solo si el programa `hasLevels`; vacío = «Todos los niveles». Cambiar de programa limpia el nivel. Validación: el nivel debe pertenecer al programa. La tabla muestra «Programa · Nivel». |
| **B. Tipo de pago desacoplado de programas** | `DataContext.tsx` (`PaymentType.applicablePrograms?` marcado `@deprecated`), `PaymentTypes.tsx` | Se retiró de la UI el bloque «Aplica a todos los programas / Programas seleccionados». El campo se conserva opcional en el tipo y en la semilla (sin consumidores) para no perder datos. |

**Validaciones:** `tsc --noEmit` 0 errores · `vite build` OK. Sin pruebas automáticas ni verificación manual en navegador (pendiente).
**Pendientes que NO se tocaron (corresponden a etapas 2–5):** `allowPartial/maxPartials` en Tipo de pago, materiales dentro del Tarifario, moneda por defecto USD, semillas vencidas (2024) y con `FIL-001`, regla de «Contado en 2 partes», regla de stock en transferencias.

---

# Etapa 2 — Tarifarios, cronogramas y separación cuotas / partes de pago (2026-10-10)

## Decisiones confirmadas por el usuario
- **Contado en 2 partes:** en matrícula solo se acuerdan las **fechas**; el **monto de la parte 1 se ingresa al cobrar en Planes** y la parte 2 es el **saldo** del total.
- Los programas son datos editables (se crean/editan desde Configuración); «Pre-lectura» se vende como programa aparte en algunas sedes y como plus de Especialización en otras → se modela por **sedes habilitadas del programa**, sin cambios de código.
- Responsable de la entrevista: cualquier trabajador activo de la sede (Etapa 5).
- Moneda del tarifario: USD por defecto; PEN aparece al cobrar con TC.

## Cambios realizados
| Área | Archivos | Detalle |
|---|---|---|
| Tipo de pago | `DataContext.tsx`, `PaymentTypes.tsx` | Nueva **modalidad del cronograma** (`scheduleMode`: pago inmediato / cuotas con intervalo fijo / fechas manuales). Se retiró «Permite pago parcial» y «Máximo parciales» de la UI y de la semilla; `allowPartial`/`maxPartials` quedan opcionales y `@deprecated`. Validaciones de coherencia (inmediato = 1 obligación; resto ≥ 2; intervalo ≥ 1 día). Columnas de la tabla: Obligaciones / Intervalo / Modalidad. |
| Partes de pago | `DataContext.tsx` | Nuevo tipo `PaymentPart` (moneda, monto, TC, medio, banco, N° operación, evidencia, nota) y `Payment.parts?`. Estructura lista para la Etapa 5. |
| Tarifario | `Tariffs.tsx`, `DataContext.tsx` | El **desglose es la fuente del total** (`basePrice` = suma; solo editable en cronogramas variables). Generador: matrícula opcional como línea propia (día 0) + cuotas a intervalo exacto. Sin «Matrícula incluida» ni «Artículos incluidos»; campos retirados de la UI y marcados `@deprecated` (sin efecto en cálculos). Validación: n.º de obligaciones = tipo de pago; montos > 0. Moneda por defecto USD. |
| Reglas puras | `src/utils/tariffs.ts` | `getAvailablePaymentTypes` / `findTariff` (activo + vigente + programa + nivel opcional + sede), `generateBreakdown`, `buildPlanInstallments` (30 días exactos), `sumPaymentParts` (TC), `tariffTotal`. |
| Cobro de cronogramas variables | `DataContext.tsx` (`registerPayment`) | En «Contado en 2 partes» el primer cobro fija el monto de la parte 1 y la parte 2 pasa a ser el saldo. |
| Semillas | `DataContext.tsx` | Tarifarios a vigencia 2026, `FIL-001` → `all`, desglose con `kind`; «Pre-lectura Plan 3» pasa a Matrícula 100 + 3×300 (el valor de artículos 150 sale del tarifario); nuevo tarifario «Kids – Contado en 2 partes». Tipos de pago con `scheduleMode`. |
| Verificación | `scripts/check-tariffs.ts` | 22 casos (Contado, Contado en 2 partes, Profesional Plan 3/6/9, tarifario inactivo/fuera de vigencia/sin tarifario/otro nivel/otra sede, total del desglose, partes ≠ cuotas). Ejecutar con `npx tsx scripts/check-tariffs.ts`. |

## Validaciones
`tsc --noEmit`: 0 errores · `vite build`: OK · `check-tariffs.ts`: 22/22 OK.
**No verificado en navegador** (formularios de Tipos de pago y Tarifarios, y cobro de la parte 1 en Planes).

## Deuda / pendientes
- **No se modificaron** Recetas ni Catálogo de artículos (según el prompt).
- `Plans.tsx` aún no distingue visualmente una línea `variable` ni valida el tope al cobrar la parte 1; la lógica está en `registerPayment`.
- Las **fechas reales** de «Contado en 2 partes» se capturan en el asistente (Etapa 5); el tarifario solo guarda los días por defecto.
- El asistente actual sigue con precio/cuotas manuales: **no consume** aún `getAvailablePaymentTypes` (Etapa 5).
- No existe un tipo de pago «Plan 9» ni un programa «Profesional» en la semilla; se crean desde Configuración (el soporte ya está).
- `PaymentType.applicablePrograms` sigue en la semilla como dato legado.

---

# Etapa 3 — Motor de promociones configurable y pago grupal (2026-10-10)

## Modelo
- `Promotion` gana: `eligibleProgramIds` (programas/familias elegibles), `requiredBasePrice` (precio contado base por alumno; vacío = sin condición), `allowMultipleGroups` (regla del diseño aprobado «Permitir múltiples grupos»). `composition` queda `@deprecated` y solo se usa si la promoción no define programas elegibles (promociones antiguas).
- Nuevos tipos: `PromotionGroup` (promoción, total, costo asignado por alumno, `paymentId`) y en `Payment`: `promotionGroupId`, `enrollmentIds`, `currency`.

## Motor (`src/utils/promotions.ts`, funciones puras para que la Etapa 5 las consuma)
| Función | Qué hace |
|---|---|
| `isPromotionAvailable` | Activa + vigente + sede incluida |
| `isStudentEligible` | Tipo de pago permitido, programa elegible, moneda y precio base del tarifario vigente del alumno |
| `findPromotionOffers` | Con 1 alumno no hay beneficio; con varios devuelve las promociones aplicables y cuántos grupos caben |
| `validateGroup` | Cantidad exacta, sin repetidos, todos elegibles, **mismo tipo de pago** (un grupo = un pago) y, en promociones antiguas, la composición |
| `suggestGroups` / `buildPromotionGroups` | Sugerencia y construcción de grupos; ningún alumno en dos grupos; respeta `allowMultipleGroups` |
| `distributeEqually` | Reparto igualitario; los centavos sobrantes van a los primeros alumnos y la suma es exacta |
| `prepareGroupPayment` | UN pago por grupo con sus partes (TC para PEN); valida que la suma equivalente = total; sin pagos individuales |

## UI (`Promotions.tsx`)
- «Composición del grupo» → **Programas elegibles** (selección múltiple).
- Nuevo campo **Precio contado base requerido** y conmutador **Permitir múltiples grupos**; moneda por defecto USD.
- Validaciones: ≥ 1 programa elegible, código único, precio base > 0 si se indica.
- Al abrir una promoción antigua se muestra un aviso: al guardar se convierte a elegibilidad por programas.
- Semilla: las 3 promociones pasan a vigencia 2026 (se conserva su composición y precios).

## Verificación
`tsc` 0 errores · `vite build` OK · `scripts/check-promotions.ts`: **27/27** casos (1 alumno, compatibles, precio base distinto, Profesional 1000, inactiva, vencida, sede, selección entre 3, sin duplicados en grupos, 4 alumnos → 2 grupos, reparto, pago grupal con 3 partes, composición antigua). No verificado en navegador.

## Decisiones que tomé (confirmar)
1. **Un grupo exige el mismo tipo de pago** (porque se paga una sola vez).
2. **Si hay varias promociones aplicables, la elección es de la Etapa 5** (el motor solo lista ofertas).
3. Al **editar** una promoción antigua, se amplía a «cualquier combinación» de sus programas.

## Pendiente
- Aún no hay estado global de grupos/pagos grupales ni integración en el asistente (Etapa 5).
- Las promociones semilla siguen en PEN con precios sin relación con los tarifarios; crear promociones nuevas con precio base para verlas funcionar.

---

# Etapa 4 — Catálogo de artículos, recetas, precios de venta y stock (2026-10-10)

## Decisiones confirmadas
- **Toda la configuración en USD** (tarifarios, promociones, costos y precios de venta). El tipo de cambio solo aparece al cobrar en matrícula. Se retiró el selector de moneda de Tarifarios y Promociones (campo fijo USD) y las semillas pasaron a USD.
- **Regla de stock:** el stock sale del origen **al despachar** (una sola vez) y se suma al destino **al recibir**. Aplica a Transferencias y a Envíos.

## Cambios
| Área | Archivos | Detalle |
|---|---|---|
| Catálogo | `ItemCatalog.tsx`, `DataContext.tsx`, `src/utils/inventory.ts` | **Tipo de libro** (Anillado/Encolado) obligatorio para Libro. Composición del paquete editable (antes el botón «Agregar artículo» no hacía nada): obligatoria solo si **permite desempaquetado**; si no, informativa y el paquete es **una unidad de stock**. «¿Se entrega por matrícula?» = habilita el artículo para Recetas. Costos en USD. |
| Precios de venta | `ItemPricesModal.tsx` (nuevo), `DataContext.tsx` (`ItemPrice`, `addItemPrice`) | Precio **general + excepciones por sede**, con vigencia e **historial**: registrar un precio cierra la vigencia anterior (no sobrescribe). `Item.salePrice` queda `@deprecated`. La tabla del catálogo muestra el precio vigente. |
| Recetas | `Recipes.tsx` | «Agregar artículo» lista solo artículos **activos y habilitados para matrícula** (sin duplicar la fuente). Valida filas vacías, repetidos, cantidades y artículos no habilitados. |
| Verificación | `Verification.tsx` | Artículo sin stock suficiente en la sede: **checkbox deshabilitado y fila gris**, no se puede entregar. Paquete sellado = una unidad (componentes solo si permite desempaquetado). «Completa» exige todo entregado. |
| Venta (Caja) | `Cash.tsx` | Usa el precio vigente (de la sede si hay excepción, si no el general) y bloquea la venta sin precio. |
| Stock | `DataContext.tsx`, `Stock.tsx`, `Adjustments.tsx`, `Transfers.tsx`, `Shipments.tsx` | Fin del **doble descuento** de transferencias/envíos. `updateStock` ya no tiene efectos dentro de actualizadores (duplicaba kardex con StrictMode) y **rechaza saldo negativo**. Despachar sin stock suficiente se bloquea con mensaje. Empaquetar/desempaquetar/ajustar devuelven error en pantalla (se retiró el `alert`). |
| Semillas | `DataContext.tsx` | Recetas a vigencia 2026; stock de Piura ajustado por ENV-2024-001 (ya despachado) con sus líneas de kardex; libro Kids = Encolado. |

## Verificación
- `tsc` 0 errores · `vite build` OK.
- Scripts: `check-inventory.ts` 21/21, `check-tariffs.ts` 22/22, `check-promotions.ts` 27/27.
- **En navegador (build de producción):** catálogo muestra precios vigentes en USD; registrar un precio nuevo cierra el anterior y conserva el historial; Verificación carga la receta y muestra stock; «Completa» sin entregar muestra el error; recibir ENV-2024-001 en Chiclayo suma **solo al destino** (Libro 85→135, Mochila 5→25) sin movimiento en el origen.
- **No probado en navegador:** despacho de transferencia/envío con stock insuficiente, ajuste negativo en exceso, formulario de paquete con composición, artículo sin stock deshabilitado en Verificación (no hay un caso en la semilla).

## Pendiente / deuda
- **Valores en USD sin convertir:** las semillas (tarifarios 1 200/1 500/800/1 000, promociones 700, costos y precios de artículos) conservan su número, ahora en USD. **Revisar precios reales.**
- Ajustes de stock: la cantidad negativa en «Ajuste negativo» aún depende de que el usuario ingrese el signo correcto según la pantalla.
- Caja: la venta no crea todavía el ingreso de caja (Caja sigue siendo maqueta); solo descuenta stock y kardex.
- Cobro en PEN/USD de ventas de artículos: se calculará con TC cuando Caja esté integrada.
- Etapa 5 pendiente: elección de promoción cuando hay varias, asistente de matrícula y consumo de todo lo anterior.

---

# Etapa 5 — Integración del asistente «Registrar nueva matrícula» (2026-10-10)

## Resolución de los pendientes de etapas previas
| Pendiente | Solución aplicada |
|---|---|
| Precios semilla sin convertir a USD | Las semillas se alinearon a los valores del contexto de configuración aprobado: Kids / Pre-Kids contado **USD 500**, Kids Contado en 2 partes **USD 500**, Profesional contado **USD 1000**, Plan 3 **1200** (300 + 3×300), Plan 6 **1400** (200 + 6×200), Plan 9 **1500** (150 + 9×150); promociones **2 × USD 700** (Pre-Kids/Kids, base 500) y **2 × USD 1700** (Profesional, base 1000). Se agregaron el programa **Profesional** (sin niveles) y el tipo de pago **Plan 9**. |
| Ajuste de stock dependía del signo ingresado | El signo lo define el tipo (Positivo/Devolución +, Negativo/Merma −); en Regularización se respeta lo ingresado. |
| Caja era maqueta (venta sin ingreso) | Nuevo **libro de caja** (`cashMovements`): cada parte de un pago es un movimiento en su moneda (PEN/USD) con TC y equivalente en USD. Alimentado por: matrícula (contado y promoción grupal), venta de artículos (cobro en USD o PEN con TC) y cobro de cuotas. «Registrar egreso» ya guarda. KPIs calculados. |
| Cobro de cuotas con alumno genérico / montos inválidos | `registerPayment` resuelve el alumno real, rechaza montos ≤ 0 o NaN y limita el cobro a lo adeudado. |
| Planes mostraba soles | Montos en USD y aviso en cuotas de monto variable (Contado en 2 partes). |
| Elegir promoción cuando hay varias | Se muestran todas las aplicables y se **sugiere la de menor precio total**; el vendedor puede elegir otra y qué alumnos participan. |

## Asistente (6 pasos, modular en `src/pages/enrollment/`)
1. **Contexto:** sede (bloqueada si la sesión es de una sede; el Superadmin en vista global la elige), fecha (no futura; fecha/hora real automática), origen, **responsable de la entrevista** (todo el personal activo asignado a Psicopedagogía, de cualquier sede; primero el de la sede elegida y con su sede junto al nombre). Cambiar la sede o la fecha invalida selecciones dependientes.
2. **Titulares:** *alumno independiente* (persona capturada una vez, sin duplicar) o *con apoderado* (principal con dirección y estado civil, secundario, adicionales). Búsqueda de titulares ya registrados.
3. **Alumnos:** Alumno 1 por defecto, «+ Agregar alumno»; edad derivada de la fecha de nacimiento; parentesco; documento validado (DNI 8 dígitos; CE/Pasaporte 6–12).
4. **Programa:** solo programas activos de la sede; nivel solo si el programa lo usa; **tipos de pago derivados de tarifarios activos y vigentes** (nada hardcodeado); precio bloqueado; promociones (disponible → aplicar → elegir alumnos → grupo).
5. **Pago y cronograma:** contado individual / promoción grupal = partes de pago (moneda, monto, TC si PEN, medio, banco, N° operación, evidencia, nota; la suma equivalente debe ser exacta); **Contado en 2 partes** y **Planes** = cronograma desde el tarifario (fechas acordadas para C2P), sin pedir comprobante.
6. **Resumen** legible y **Guardar matrículas** (atómico).

## Guardado (`registerEnrollments` → `buildEnrollmentBatch`, lógica pura)
Crea en una sola operación y solo si todo valida: una matrícula por alumno con **correlativo asignado al confirmar** (`MAT-AAAA-NNN`, máximo + 1), titulares/alumnos reutilizados o nuevos y vinculados por ID, plan por matrícula, **un pago por unidad** (grupo o alumno contado) con sus partes, un movimiento de caja por parte, grupo promocional con costo asignado por matrícula, y verificación inicial **Pendiente**. Se guardan `programId`, `levelId` y `branchId`, de modo que **Verificación** encuentra su receta.

## Verificación
- `tsc` 0 errores · `vite build` OK.
- Scripts: `check-enrollment.ts` **48/48** (los 10 casos pedidos + atomicidad, C2P, independiente, fecha futura, correlativo), `check-inventory.ts` 21/21, `check-tariffs.ts` 22/22, `check-promotions.ts` 27/27.
- **En navegador (build de producción):** matrícula grupal completa (2 alumnos Pre-Kids/Kids, promoción USD 700, pago en PEN con TC + USD) → 2 matrículas, titular y alumnos creados, Caja PEN recibe S/ 1,140 y Caja USD $ 400, ambas en Verificación como Pendiente; segunda matrícula reutilizando al titular (Profesional Plan 3 → plan USD 1200 con Matrícula + 3 cuotas a 30 días) → el titular pasa a 3 alumnos / $1,200; cobro de una cuota en Planes → ingreso $ 150 en Caja USD con el alumno correcto.
- **No probado en navegador:** Contado en 2 partes de extremo a extremo (solo en scripts), alumno independiente, borrador guardado/retomado, volver atrás/adelante tras editar, varios grupos con 4 alumnos.

## Pendiente / decisiones
- **Contrato y ficha de matrícula** (acciones posteriores): requieren módulos aún inexistentes; el asistente lo indica en la pantalla de éxito.
- **Cobro de cuotas en PEN con TC en Planes:** hoy se cobra en USD.
- **Un registro admite una sola promoción** (con varios grupos de la misma promoción).
- **Un grupo promocional exige el mismo tipo de pago** y solo aplica a pagos inmediatos (Contado).
- Dashboard, Pagos, Caja chica, Contratos, Asignaciones, Psicopedagogía (guardado), Reportes y Sistema siguen pendientes (fuera de estas 5 etapas).
- Autenticación/permisos y persistencia (Supabase) siguen pendientes: el sistema sigue en memoria.

---

# Pulido del asistente — Datos de alumnos y Programa (2026-10-16)

| Tema | Cambio |
|---|---|
| Alumno **existente o nuevo** | Cada tarjeta de alumno (y de titular) tiene un interruptor deslizante **Existente \| Nuevo**. *Existente*: solo el buscador (nombre o documento); al elegir, queda una tarjeta resumen con «Cambiar». *Nuevo*: solo los campos de datos, sin buscador. Al alternar se parte de una ficha limpia para no mezclar datos. Si queda en «Existente» sin elegir a nadie, no se avanza. |
| **Situación del alumno** (reemplaza grado + colegio sueltos) | Estudiando → tipo de institución (Colegio / Instituto / Universidad / Otro), institución y **grado** (lista de Inicial a 5.° Secundaria si es colegio) o **ciclo**. Trabajando → ocupación y centro de trabajo (opcional). Estudiando y trabajando → ambos bloques. Ninguna por el momento → nada más. Solo se guarda lo que corresponde a la situación elegida. El parentesco y la situación aparecen cuando ya hay una persona definida. |
| **Horario de clases** | Antes era una lista fija dentro del código. Ahora sale de **Configuración → CRUDS Básicos → Horarios de clases** (nombre, todas las sedes o sedes específicas, estado). El asistente ofrece los activos de la sede; es opcional («Por definir»). Un horario en uso no se puede eliminar (se inactiva); no se permiten nombres duplicados. |
| **Fecha de inicio de clases** | Se renombró y se explicó: es el primer día de clases del alumno (opcional, no anterior a la matrícula). **No afecta** los vencimientos de las cuotas, que se cuentan desde la fecha de matrícula. |

Verificación: `tsc` 0 errores · `check-enrollment.ts` 66/66 (se agregaron casos de existente sin elegir, cada situación, datos sobrantes descartados y horarios por sede/estado) · en navegador: interruptor Existente/Nuevo, búsqueda y selección, bloques condicionales de situación, selector de horarios y CRUD de horarios (alta por sede, duplicado rechazado).
No cambiado: la pantalla **Personas → Alumnos** (edición manual) sigue con «grado» y «colegio» sueltos.

---

# Primera asesoría en el paso Programa y registro de pagos desde «Pagos» (2026-10-16)

| Tema | Cambio |
|---|---|
| Sección «Clases (opcional)» del paso 4 | Pasó a **«Primera asesoría»**: fecha y hora específicas (obligatorias; la fecha no puede ser anterior a la matrícula). Se muestra en el Resumen y, al guardar, **crea la primera asesoría del alumno** (estado *Pendiente*, responsable *Por asignar*) en Psicopedagogía → Primera asesoría. Ya no se piden horario ni fecha de inicio de clases en el asistente. |
| Contado en 2 partes | Ya se registra como plan y figura en **Planes y cartera**; sus cuotas (Parte 1 y Parte 2 = saldo) se cobran desde Pagos. |
| **Pagos → Registrar pago** | El buscador ahora detecta **todas las matrículas que figuran en Planes y cartera** (por alumno, titular, matrícula o plan); las que no tienen saldo se muestran deshabilitadas. Tras elegir la matrícula se listan sus cuotas con saldo, se puede cobrar en USD o PEN (con TC y equivalente), con medio, comprobante (serie coherente con boleta/factura) y foto obligatoria. Valida que el monto no supere el saldo. Al guardar aplica el pago a la cuota (`registerPayment`), crea el pago y el ingreso en la caja de la moneda recibida. |
| Listado de Pagos | Muestra los **pagos reales del sistema** (matrículas y cobros de cuotas) en lugar de filas de ejemplo fijas. |
| Corrección | En «Contado en 2 partes», la Parte 1 quedaba con un monto inflado (tope del total + lo cobrado); ahora queda fijada en lo realmente cobrado y la Parte 2 es el saldo. |

Verificación: `tsc` 0 errores · `check-enrollment.ts` 74/74 (casos nuevos de primera asesoría) · en navegador: matrícula Contado en 2 partes con asesoría → aparece en Primera asesoría; Pagos → búsqueda por alumno, matrícula y titular; errores de monto, TC y serie; Parte 1 en PEN (S/ 950 a TC 3.8 = $ 250, ingreso en Caja PEN) y Parte 2 en USD → plan *Completado*.
Sin cambios (a pedido): «Reversar pago» sigue sin acción; **Configuración → Horarios de clases** se mantiene aunque el asistente ya no lo use.

---

# Verificación de entrega — estado automático, kits y condición de pago (2026-10-17)

Reglas en `src/utils/verification.ts` (puras) y pantalla `Verification.tsx`.

| Tema | Cambio |
|---|---|
| **Estado de verificación** | Ya no es un combo manual: se calcula solo (**Completa** si todos los artículos de la receta están entregados; si no, **Incompleta**) y se muestra con el conteo «N de M artículos». Solo las **observaciones** siguen siendo manuales. |
| **Kits** | Se marca el kit como una unidad (los componentes se listan solo como detalle, con ✓ automático cuando el kit está entregado); **no hay check por componente** ni se desempaqueta desde aquí. Junto al kit hay la opción **«Entregar por componentes»**, que reemplaza el kit por sus componentes (cada uno con su check y su propio stock); si falta el kit y hay stock de algunos componentes, la opción se resalta y lo avisa. Se puede volver a «kit completo». Un paquete sellado (sin desempaquetado) no ofrece la opción. |
| **Verificador** | Combo con el **personal activo asignado a la sede de la matrícula** (ya no «Admin (Usuario actual)»); obligatorio. |
| **Condición de pago** | Solo se puede verificar si la matrícula tiene su **primer pago registrado**: Contado cobrado en el registro de matrícula, o Plan / Contado en 2 partes con la **primera cuota cancelada**. El botón «Verificar» siempre funciona, pero si no se cumple abre una ventana con desenfoque: «Realice el primer pago antes de realizar la verificación» (indica qué cuota falta). Se vuelve a validar al guardar. |
| Corrección | El filtro «Pendiente» no encontraba las matrículas nuevas (nacen con estado «Pendiente»). |

Verificación: `tsc` 0 errores · `scripts/check-verification.ts` 27/27 · en navegador: sin combo de estado; el estado cambia solo al marcar (0/2 → 1/2 → 2/2 Completa); kit sin checks por componente y con opción de componentes; en modo componentes solo se descuenta lo marcado; combo de verificador (personal de Piura); guardar deshabilitado sin verificador; Contado en 2 partes sin pago → advertencia con desenfoque, tras registrar la Parte 1 → se abre la verificación.
