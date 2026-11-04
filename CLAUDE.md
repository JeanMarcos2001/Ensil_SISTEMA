# Sistema ENSIL — ERP de institutos de lectura veloz (Perú)

Gestión de matrículas, pagos y cobranza, verificación de materiales, logística, Psicopedagogía, personal y planilla
para varias sedes. Hoy todo el estado vive **en memoria** (sin base de datos ni inicio de sesión): al recargar la
página los datos vuelven a los de ejemplo (salvo roles, permisos, cuentas y con quién se trabaja, que se guardan en el navegador de forma provisional).

## Idioma

Responder y escribir textos de interfaz, mensajes de error, comentarios y documentos **en español con tildes y ñ**.
Los identificadores del código van en inglés o español según el archivo vecino (seguir el estilo de lo que ya existe).

## Stack y comandos

React 19 · TypeScript · Vite 6 · Tailwind 4 · react-router 7. Sin pruebas de interfaz: se verifica con scripts.

- `npm run dev` (puerto 3000) · `npm run build` · `npm run lint` (= `npx tsc --noEmit`)
- Verificación de reglas: `npx tsx scripts/check-<tema>.ts` (hay 26). **Antes de dar algo por terminado**: `tsc` sin errores,
  `vite build` y todos los `check-*` en verde.

## Arquitectura: «reglas puras primero»

1. La **regla de negocio** va en una función pura en `src/utils/*.ts` (sin React, sin estado), con su `scripts/check-*.ts`.
2. `src/context/DataContext.tsx` (muy grande) guarda el estado y expone **acciones** que validan con esas reglas y devuelven
   `{ ok, error }` (`StockResult`). Las pantallas nunca saltan la validación.
3. Las pantallas (`src/pages/**`, `src/components/**`) solo muestran y llaman acciones. Modales y paneles pequeños y modulares.
4. Los permisos se consultan siempre con `can(PERM.x)` o `can('funcionalidad:acción')` (`utils/authority.ts`). Cada función del sistema se declara **una sola vez**
   en `utils/capabilityRegistry.ts` (con lo que requiere, su contraparte, los datos que toca y los avisos que dispara); de ahí salen
   el catálogo de Permisos, el constructor de roles y los avisos (`utils/capabilities.ts`). **Una función nueva se agrega al registro**
   y `check-capabilities.ts` falla si queda una acción del contexto o un ítem de menú sin función. Hoy el único usuario es el
   Superusuario (todo permitido); al definir roles basta marcar casillas. **Toda acción del contexto se protege sola**
   (`guardActions` en `utils/guards.ts`: sin la función devuelve `{ ok:false, error }` o lanza `PermissionError`): basta declararla
   en el registro. Las pantallas además **ocultan** lo que el rol no puede (`can(...)`, `hidden` en `ActionMenu`) y **apagan con motivo**
   lo que depende de una contraparte (`availabilityOf`); `check-guards.ts` falla si una pantalla toma una acción sin consultar su función.
   No se exponen modificadores crudos del estado (`setX`) en el contexto. **Los roles se arman en Organización → Permisos** (constructor):
   las 6 plantillas de partida son datos en `utils/roleTemplates.ts`; las reglas del constructor (plan de permisos con motivos, límite de
   cuentas por sede, semáforo de contrapartes, menú que verá) viven en `utils/roleBuilder.ts`; `check-roles.ts` las verifica. Roles, permisos y cuentas se **guardan en el navegador** (`utils/accessStore.ts`, provisional hasta la base de datos): lo guardado se valida al arrancar y `check-access-store.ts` lo verifica; el resto del estado sigue en memoria. **Sesión provisional** (`utils/session.ts`, `check-session.ts`): el sistema trabaja con una cuenta de Usuarios
   (`currentUser` sale de ella), cambio rápido de usuario con **PIN** (ejemplo: 1234 en las 8 cuentas), bloqueo tras 5 fallos y la sede que se ve sale de la
   cuenta (`currentBranchId`, `selectBranch`, `sessionScope`); no es seguridad real hasta el paso 10.
   **Pruebas por rol** (`utils/roleMatrix.ts`, `check-role-matrix.ts`): qué ve y qué puede cada cuenta; la matriz generada está en `docs/PRUEBAS_POR_ROL.md`
   (`npx tsx scripts/doc-role-matrix.ts`, no se edita a mano). **Al cambiar un rol, una plantilla o una pantalla, volver a correr ambos.**
   **Personal ↔ agenda** (`utils/staffAvailability.ts`, `utils/contractRenewal.ts`, `check-availability.ts`): quien está de vacaciones o cesó no puede ser responsable de asesorías ni
   actividades; los contratos se renuevan sin cese. **La planilla no genera pagos ni egreso en Caja** (el sistema no registra pagos al personal).
5. Lo **derivable no se guarda**: estados de cuotas y planes, vigencia, urgencias, etc. se calculan al mostrar.
6. Los cambios con control (reversas, cierres, cancelaciones, bajas) piden **motivo** (`ReasonDialog`) y dejan **historial**.
7. Datos de ejemplo con fechas **relativas a hoy** (`seedDay`) para que siempre haya casos visibles.

Modelo de datos: **el id manda, lo derivable no se guarda** (titular, estado, programa y edad del alumno se calculan en
`utils/identity.ts`; fechas solo ISO; estados tipados en `utils/statuses.ts`; ids `PREFIJO-NNN` con `utils/ids.ts`; saldo y estado
del plan solo los escribe `recomputePlan`). Datos de ejemplo en `src/data/seed*.ts`, verificados por `check-integrity.ts`.

Mapa rápido de `src/utils`: matrícula (`enrollment*`, `validity`, `verification*`), dinero (`payments`, `planState`,
`collections`, `cash*`, `pettyCash`, `creditNotes`, `refinance`), Psicopedagogía (`schedule`, `psy*`, `sessionMetrics`),
Personas (`assignments`, `staff*`, `payroll*`, `staffAccess`), catálogo (`tariffs`, `promotions`, `inventory`),
funciones y roles (`authority`, `capabilityRegistry`, `capabilities`).

## Reglas de negocio que no hay que romper

- **Verificación antes de la primera asesoría:** sin materiales entregados no se marca asistencia; si llega la hora se
  reprograma sin contar como falta y sin las 24 h (`verificationGate.ts`).
- **24 horas:** el alumno o titular solo cambia con 24 h o más; con menos, solo la institución (permiso + motivo).
- **Planilla:** el neto del contrato y el de la planilla salen del mismo motor (`payrollEngine.ts`). Una planilla cerrada
  guarda una **foto** (Borrador → Cerrada: no existe «pagada»; se reabre con motivo). Las tasas (AFP/ONP, UIT, RMV) son referenciales y viven solo en ese archivo.
- **Cuentas de Usuarios** de personal nacen de la ficha y se desactivan solas al inactivar al trabajador.
- Todo el dinero comercial es **USD**; la planilla y la caja chica, **soles**.
- **Un solo almacén central** (Los Olivos, por dato `Branch.isWarehouse`): los envíos salen siempre de él y toda transferencia lo
  tiene en un extremo; **entre dos filiales no hay transferencia directa** (`logisticsRoutes.ts`).
- **El stock solo lo mueven acciones con función** (`registerItemSale`, entrega de materiales, `registerStockEntry`, despachos y
  recepciones): `updateStock` es interna del contexto y las pantallas no la llaman. Una operación con varias líneas es de todo o nada.
- **Una sola receta activa** por programa, nivel, sede y período (`recipes.ts`); la copia de una receta nace inactiva.
- **Los avisos no guardan a quién llegan**: guardan qué pasó y dónde; el destinatario se calcula por función y sede
  (`notifications.ts`). Las alertas por regla (`systemAlerts.ts`) tampoco se guardan. Sin «Ver remuneraciones» no se muestra ningún sueldo.

## Menú

`src/config/modules.ts` define los módulos. El menú «Oferta comercial» (antes «Configuración comercial») contiene
catálogos de venta; el botón inferior «Configuración» abre la ventana de parámetros agrupados por área
(`pages/settings/SettingsPage.tsx`). El enrutado es por **nombre del ítem** (`AppShell.renderContent`), no por módulo + ítem.

## Documentos (leer antes de proponer algo que ya esté decidido)

- `docs/REGLAS_DE_NEGOCIO.md` — qué se resolvió y cómo funciona, por tema. **Actualizarlo al cambiar una regla.**
- `docs/PENDIENTES_SISTEMA.md` — lo que falta; marcar ✅ lo resuelto y sumar una «tanda» al final.
- `docs/PLAN_ROLES_Y_MODELO_DE_DATOS.md` — roles de partida, constructor de roles, avisos dirigidos y paso a paso (con su estado).
- `docs/CATALOGO_DE_FUNCIONES.md` — **generado** del registro (`npx tsx scripts/doc-capabilities.ts`); no se edita a mano.
- `docs/PRUEBAS_POR_ROL.md` — **generado**: matriz de qué ve y qué puede cada cuenta de ejemplo, con los hallazgos por confirmar.
- `docs/REVISION_PROYECTO.md`, `docs/INFORME_CONEXIONES_SISTEMA.md` — revisión y mapa de conexiones entre módulos.

Pendientes grandes conocidos: facturación electrónica (OSE/PSE), inicio de sesión y roles, persistencia, alcance por sede en todas las pantallas
(la sede ya sale de la sesión, pero solo Stock, Kardex, Envíos, Transferencias, Recepciones, el asistente de matrícula y el Dashboard la respetan; el resto se hará con la base de datos, no pantalla por pantalla), almacenamiento de archivos, envío automático de WhatsApp/correo, liquidación de beneficios al cese.

## Cómo trabajar

- No tocar lo que está fuera de lo pedido. Si algo del pedido se contradice con lo existente, plantearlo y proponer.
- **Commit y push solo cuando el usuario lo pida** (rama `main`). Terminar el mensaje con
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Probar en el navegador lo que se hace (`npx vite build` + `npx vite preview --port 4173 --strictPort`). Como el estado es
  en memoria, **navegar dentro de la app** (clics del menú o `history.pushState` + evento `popstate`) para no perderlo;
  recargar reinicia los datos. Detener el servidor al terminar.

## Trampas del entorno (Windows)

- Los archivos mezclan **LF y CRLF** (p. ej. `AppShell.tsx`, `modules.ts`, `Permissions.tsx` son CRLF). Al parchar con
  scripts, normalizar y restaurar el fin de línea; con `Edit` suele bastar.
- En el `Bash` de esta herramienta, los *heredocs* con comillas, `$` o `\b` se **corrompen**: para parches grandes escribir el
  script con la herramienta de archivos y ejecutarlo. En Python usar `python` (no `python3`, es un alias de la tienda).
- Un `OSError` al escribir un archivo puede ser transitorio: verificar el archivo y repetir.
- Los selectores/entradas controlados por React no se llenan con `.value =`: usar el *setter* nativo del prototipo y
  disparar el evento `input` o `change`.
