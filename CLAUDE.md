# Sistema ENSIL — ERP de institutos de lectura veloz (Perú)

Gestión de matrículas, pagos y cobranza, verificación de materiales, logística, Psicopedagogía, personal y planilla
para varias sedes. Hoy todo el estado vive **en memoria** (sin base de datos ni inicio de sesión): al recargar la
página los datos vuelven a los de ejemplo.

## Idioma

Responder y escribir textos de interfaz, mensajes de error, comentarios y documentos **en español con tildes y ñ**.
Los identificadores del código van en inglés o español según el archivo vecino (seguir el estilo de lo que ya existe).

## Stack y comandos

React 19 · TypeScript · Vite 6 · Tailwind 4 · react-router 7. Sin pruebas de interfaz: se verifica con scripts.

- `npm run dev` (puerto 3000) · `npm run build` · `npm run lint` (= `npx tsc --noEmit`)
- Verificación de reglas: `npx tsx scripts/check-<tema>.ts` (hay 18). **Antes de dar algo por terminado**: `tsc` sin errores,
  `vite build` y todos los `check-*` en verde.

## Arquitectura: «reglas puras primero»

1. La **regla de negocio** va en una función pura en `src/utils/*.ts` (sin React, sin estado), con su `scripts/check-*.ts`.
2. `src/context/DataContext.tsx` (muy grande) guarda el estado y expone **acciones** que validan con esas reglas y devuelven
   `{ ok, error }` (`StockResult`). Las pantallas nunca saltan la validación.
3. Las pantallas (`src/pages/**`, `src/components/**`) solo muestran y llaman acciones. Modales y paneles pequeños y modulares.
4. Los permisos se consultan siempre con `can(PERM.x)` (`utils/authority.ts`). Cada función del sistema se declara **una sola vez**
   en `utils/capabilityRegistry.ts` (con lo que requiere, su contraparte, los datos que toca y los avisos que dispara); de ahí salen
   el catálogo de Permisos, el constructor de roles y los avisos (`utils/capabilities.ts`). **Una función nueva se agrega al registro**
   y `check-capabilities.ts` falla si queda una acción del contexto o un ítem de menú sin función. Hoy el único usuario es el
   Superusuario (todo permitido); al definir roles basta marcar casillas.
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
  guarda una **foto**; una pagada no se reabre. Las tasas (AFP/ONP, UIT, RMV) son referenciales y viven solo en ese archivo.
- **Cuentas de Usuarios** de personal nacen de la ficha y se desactivan solas al inactivar al trabajador.
- Todo el dinero comercial es **USD**; la planilla y la caja chica, **soles**.

## Menú

`src/config/modules.ts` define los módulos. El menú «Oferta comercial» (antes «Configuración comercial») contiene
catálogos de venta; el botón inferior «Configuración» abre la ventana de parámetros agrupados por área
(`pages/settings/SettingsPage.tsx`). El enrutado es por **nombre del ítem** (`AppShell.renderContent`), no por módulo + ítem.

## Documentos (leer antes de proponer algo que ya esté decidido)

- `docs/REGLAS_DE_NEGOCIO.md` — qué se resolvió y cómo funciona, por tema. **Actualizarlo al cambiar una regla.**
- `docs/PENDIENTES_SISTEMA.md` — lo que falta; marcar ✅ lo resuelto y sumar una «tanda» al final.
- `docs/PLAN_ROLES_Y_MODELO_DE_DATOS.md` — roles de partida, constructor de roles, avisos dirigidos y paso a paso (con su estado).
- `docs/CATALOGO_DE_FUNCIONES.md` — **generado** del registro (`npx tsx scripts/doc-capabilities.ts`); no se edita a mano.
- `docs/REVISION_PROYECTO.md`, `docs/INFORME_CONEXIONES_SISTEMA.md` — revisión y mapa de conexiones entre módulos.

Pendientes grandes conocidos: facturación electrónica (OSE/PSE), inicio de sesión y roles, persistencia, alcance por sede según la sesión
(el selector de sede del encabezado es temporal y desaparecerá), almacenamiento de archivos, envío automático de WhatsApp/correo, liquidación de beneficios al cese.

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
