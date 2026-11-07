# Sistema ENSIL — ERP de institutos de lectura veloz (Perú)

Gestión de matrículas, pagos y cobranza, verificación de materiales, logística, Psicopedagogía, personal y planilla
para varias sedes. Hoy **el acceso vive en la base de datos** (cuentas, roles, empresas, filiales, almacenes, personal, asignaciones, contratos y planillas, con inicio de sesión real) y **todo lo demás** (matrículas, pagos, stock, personal…) sigue **en memoria**: al recargar la
página los datos vuelven a los de ejemplo (lo que ya pasó a la base se conserva).

## Idioma

Responder y escribir textos de interfaz, mensajes de error, comentarios y documentos **en español con tildes y ñ**.
Los identificadores del código van en inglés o español según el archivo vecino (seguir el estilo de lo que ya existe).

## Stack y comandos

React 19 · TypeScript · Vite 6 · Tailwind 4 · react-router 7. Sin pruebas de interfaz: se verifica con scripts.

- `npm run dev` (puerto 3000) · `npm run build` · `npm run lint` (= `npx tsc --noEmit`)
- Verificación de reglas: `npx tsx scripts/check-<tema>.ts` (hay 30). **Antes de dar algo por terminado**: `tsc` sin errores,
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
   cuentas por sede, semáforo de contrapartes, menú que verá) viven en `utils/roleBuilder.ts`; `check-roles.ts` las verifica. **Los roles y sus funciones viven en la base de datos** (tablas `roles` y `rol_funciones`; `AccessGate` los lee antes de montar el sistema y `DataProvider` recibe `access`; reglas de traducción en `utils/accessRoles.ts`, guardado en `services/accessRoles.ts` con el repositorio de `services/accessRolesRepository.ts`, `check-access-roles.ts`); `addRole`/`updateRole`/`deleteRole`/`savePermissions` son **asíncronas**. Los roles de partida se cargan con `supabase/seed/roles_de_partida.sql` (**generado** desde las plantillas con `npx tsx scripts/doc-roles-seed.ts`; no se edita a mano). El navegador ya no guarda nada del acceso (ni cuentas ni roles): todo viene de la base; el resto del estado sigue en memoria. **Sesión** (`utils/session.ts`, `check-session.ts`): el sistema trabaja con la cuenta con la que se ingresó (`currentUser` sale de ella) y la sede que se ve sale de lo que alcanza esa cuenta (`currentBranchId`, `selectBranch`, `sessionScope`); no hay cambio rápido de usuario (el PIN se retiró hasta poder verificarlo en el servidor).
   **Inicio de sesión real** (`AuthContext`, `AuthGate`, `pages/auth/LoginPage.tsx`, reglas en `utils/loginAccess.ts`, `check-login.ts`): correo y contraseña con Supabase Auth, por fuera de `DataProvider`;
   pasa quien tiene fila activa en `cuentas` con rol activo; quien llega desde el enlace de su invitación (o de «olvidé mi contraseña») fija primero su contraseña (`SetPasswordPage`). `AccessGate` carga roles, funciones y cuentas antes de montar el sistema. Cerrar sesión desmonta el sistema y los datos de ejemplo vuelven a empezar.
   **Las cuentas viven en la base y solo las escribe la Edge Function `usuarios`** (`supabase/functions/usuarios/`: `reglas.ts` puras, `manejador.ts` orquestador, `index.ts` conexión; `check-cuentas-fn.ts`). El cliente la llama con `services/accountsRepository.ts` y arma las peticiones con `utils/accounts.ts` (`check-accounts.ts`); `addUser`/`updateUser`/`resendAccess` son **asíncronas**. Se despliega con la herramienta `deploy_edge_function` de Supabase (o `supabase functions deploy usuarios`); nunca expone la clave de servicio al navegador.
   **Una cuenta nace de una persona de Personal** (`cuentas.personal_id`, una persona = una cuenta; solo un Superusuario crea una cuenta técnica sin persona, y **solo con el rol del sistema: el Superusuario es solo para cuentas técnicas y no se le da a una persona de Personal**). Su nombre, documento y teléfono salen de la ficha y sus **sedes y almacén salen de las asignaciones activas con acceso** (la asignación dice «acceso al sistema» Sí/No; **el rol real se elige una sola vez, en Usuarios**, filtrado por el lugar de trabajo): los mantienen disparadores de la base (migración 0004), no se escriben en Usuarios. **Coherencia rol ↔ lugar:** un rol con alguna función que mueve el almacén (`FUNCIONES_QUE_MUEVEN_ALMACEN` en `supabase/functions/usuarios/reglas.ts`) exige una asignación al almacén, y quien trabaja en el almacén necesita un rol que lo mueva (regla dura al crear la cuenta, cambiar su rol o reactivarla; al editar asignaciones solo se avisa). El correo de ingreso es institucional: nunca el personal de la ficha (bloquea) y si no es `@ensilperu.com` solo se avisa. La pantalla de Usuarios importa esas mismas reglas del servidor (`utils/accountRules.ts`, `check-staff-db.ts`; `check-cuentas-fn.ts` prueba el servidor).
   **Personal y Asignaciones ya viven en la base** (Personas → Personal / Asignaciones): `staff` / `assignments` / `orgPlaces` en el contexto (gancho `useStaffDirectory`, carga cuando ya están las sedes y el almacén), reglas en `utils/staff.ts`, `utils/assignments.ts`, `utils/staffStatus.ts`, `utils/staffDb.ts`, operaciones en `services/staffDirectory.ts` (repositorio inyectable) y repositorio de Supabase en `services/staffRepository.ts`. **UN solo personal, el de la base** (el puente de la agenda, 2026-11-07): `staff`, `assignments` y `contracts` del contexto son los de la base y los leen TODAS las pantallas, también la agenda (asesorías, actividades, cronogramas), la verificación y el asistente de matrícula: quién puede ser responsable sale de Personal (área Psicopedagogía con asignación activa en la sede) y las vacaciones y ceses reales se respetan (un responsable no disponible aparece desactivado en el selector). **Ya no hay personal, asignaciones ni contratos de ejemplo en la aplicación** (`seedStaff`/`seedAssignments`/`seedContracts` quedan solo para los `check-*`; se retiró `NOT_YET_IN_DB`). Las asesorías, actividades y matrículas de ejemplo siguen en memoria y guardan al responsable **por su nombre** (texto): no pueden pasar a la base hasta que los alumnos y las matrículas lo hagan, porque cada una apunta a un alumno y a una matrícula; hasta entonces, con ninguna psicopedagoga registrada los selectores salen vacíos y la matrícula pide un responsable de entrevista (se registra en Personas → Personal y Asignaciones). Una ficha no se borra (se inactiva con la función `inactivar_personal`, que cierra sus asignaciones y desactiva su cuenta, todo o nada) y una asignación no se borra (se cierra); el lugar de una asignación es UNA sede o el almacén; **no hay «rol del sistema» en la asignación: solo `hasAccess` (Sí/No)**; quien no alcanza todas las sedes solo asigna en las suyas y en el almacén solo si es Superusuario o trabaja en él (`assignablePlaces`; la base lo exige con `app.ve_persona`/`app.ve_asignacion`/`app.opera_lugar`, migración 0006: Personal y Asignaciones se ven y editan por sede). **En el almacén solo se trabaja en el área «Logística»** (`areasForPlace`, y la base lo exige desde la migración 0005). **La asignación no tiene cargo: el cargo es del contrato** (`Contract.position`, obligatorio; `positionOf` en `utils/payroll.ts` da el del contrato vigente; sin contrato se muestra «Sin contrato»). `addStaff`/`updateStaff`/`inactivateStaff`/`reactivateStaff`/`saveAssignment`/`closeAssignment` son **asíncronas**; `deleteStaff` ya no existe.
   **Empresas, Filiales y Almacenes ya viven en la base** (Organización → Empresas / Filiales / Almacenes): `companies` / `branches` / `warehouses` en el contexto (gancho `useOrgDirectory`), reglas en `utils/orgDirectory.ts`, operaciones en
   `services/orgDirectory.ts` (repositorio inyectable) y repositorio de Supabase en `services/orgRepository.ts`; `check-org-directory.ts` las verifica. **Son la ÚNICA fuente de sedes, empresas y almacén de todo el sistema** (Matrículas, Caja, Stock, Envíos, Agenda…; ya no hay otra lista): `AccessGate` las lee al iniciar sesión junto con roles y cuentas (`loadOrgDirectory`), `DataProvider` las recibe en `org` y `useOrgDirectory` arranca con eso; quien no alcanza todas las sedes ni tiene «Ver filiales» recibe solo las suyas (lo decide la política de la base). **Los datos de ejemplo (en memoria) apuntan a esas mismas sedes**: `seedBranches()` sale de `src/data/realOrg.ts` (mismos códigos `FIL-NNN`, nombres y empresas), así que las matrículas, pagos, stock y envíos de ejemplo son de sedes que existen; `check-real-org.ts` lo vigila. **La base tiene cargadas las 6 empresas y 16 sedes reales** (`supabase/seed/empresas_y_sedes_reales.sql` y la tabla de consulta `docs/DATOS_SEDES.md`, ambos **generados** por `scripts/doc-sedes-reales.ts` desde `src/data/realOrg.ts`; falta Ilo, que el usuario no quiere cargar todavía). La pantalla no cambia la empresa de una sede ya creada (eso va por SQL). Las acciones `addCompany`/`addBranch`/`addWarehouse`… ahora son **asíncronas** (devuelven `Promise<{ ok, error }>`; las pantallas hacen `await`).
   **Contratos y Planilla ya viven en la base** (Personas → Contratos / Planilla; migración 0007, `supabase/migrations/20261107120000_contratos_y_planilla.sql`): `contracts` y `payrollRuns` del contexto (gancho `useContractsPayroll`; operaciones en `services/contractsPayroll.ts` con repositorio inyectable y `services/contractsPayrollRepository.ts`; traducción de filas en `utils/contractsDb.ts`; `check-contracts-db.ts`). **Todo contrato tiene su EMPRESA** (la que lo emplea y presenta su planilla; obligatoria; **no depende de la sede donde trabaja**: alguien puede trabajar en Juliaca y estar contratado por otra empresa del grupo, así que se elige libremente y NO se sugiere por la sede; se puede cambiar al editar, con motivo, salvo que una planilla cerrada incluya el contrato o haya ajustes en el borrador de su empresa actual; migración 0008, `20261107150000_contrato_cambiar_empresa.sql`). **Una planilla es de UNA empresa y UN mes** (`PLA-AAAA-MM-EMP-NNN`; cada RUC cierra y reabre la suya; solo entran los contratos de esa empresa; la boleta lleva su razón social y RUC). **Nadie escribe las tablas directo**: solo las funciones de la base (`crear_contrato`, `editar_contrato`, `cesar_contrato`, `renovar_contrato`, `generar_planilla`, `eliminar_borrador_planilla`, `agregar_ajuste_planilla`, `quitar_ajuste_planilla`, `cerrar_planilla`, `reabrir_planilla`), que validan otra vez, piden la función del registro y dejan quién y cuándo (el nombre sale de la cuenta, no de la pantalla). **Los sueldos viven aparte** (`contratos_pago`): solo los lee quien tiene «Ver remuneraciones»; sin esa función el contrato llega sin sueldo (cargo y fechas sí los ve quien ve a Personal). La planilla solo la lee quien tiene la función, «Ver remuneraciones» y alcanza todas las sedes. La base impide cesar o renovar «encima» de una planilla cerrada con ese contrato e inactivar a quien tiene contrato vigente; una empresa con contratos vigentes no se inactiva ni se elimina. Las acciones (`addContract`, `editContract`, `closeContract`, `renewContract`, `generatePayroll`…) son **asíncronas**; `updateContract` ya no existe. Los datos de dinero de la base se leen de a mil filas (`fetchAll`), porque la API entrega mil por vez.
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

Mapa rápido de `src/utils`: logística (`logisticsRoutes`, `inventory`, `recipes`), matrícula (`enrollment*`, `validity`, `verification*`), dinero (`payments`, `planState`,
`collections`, `cash*`, `pettyCash`, `creditNotes`, `refinance`), Psicopedagogía (`schedule`, `psy*`, `sessionMetrics`),
Personas (`assignments`, `staff*`, `payroll*`, `staffAccess`), catálogo (`tariffs`, `promotions`, `inventory`),
funciones y roles (`authority`, `capabilityRegistry`, `capabilities`).

## Reglas de negocio que no hay que romper

- **Verificación antes de la primera asesoría:** sin materiales entregados no se marca asistencia; si llega la hora se
  reprograma sin contar como falta y sin las 24 h (`verificationGate.ts`).
- **24 horas:** el alumno o titular solo cambia con 24 h o más; con menos, solo la institución (permiso + motivo).
- **PAGOS AL PERSONAL: el sistema INFORMA, NO PAGA NI LIQUIDA** (regla del usuario, 2026-11-07, aprobada con sus cinco ajustes; **no volver a proponer pagos ni liquidaciones ni listarlos como pendiente**). Tres zonas: (1) **se guarda** (datos laborales): empresa, cargo, tipo, fechas, sueldo pactado, pensión, vacaciones programadas, cese (fecha y motivo) e historial; (2) **se muestra como referencia** (cálculo informativo con las tasas del sistema; contabilidad valida): la planilla mensual por empresa y el detalle por trabajador; no paga, no registra pagos, no genera egreso en Caja; (3) **queda fuera del sistema, por decisión:** pago de sueldos, depósito de CTS y gratificaciones, **liquidación de beneficios sociales al cese**, saldos de vacaciones, utilidades, PLAME / T-Registro y comprobantes de pago oficiales. Eso **no es un pendiente**: no sumarlo a listas de «lo que falta», planes ni propuestas, ni presentarlo como trabajo futuro. **Puede ampliarse más adelante** (la base ya guarda contratos, la foto de cada planilla y su historial; toda escritura pasa por funciones con permiso propio), pero solo si el usuario lo pide. **Cómo se cierra, sin huecos:** (a) la boleta NO parece oficial: se llama «Detalle de remuneración (referencial)», sin casillas de firma y con «no reemplaza la boleta oficial»; el neto es «referencial», no «a pagar»; (b) el cese muestra, en su ventana y en el contrato cesado, «La liquidación la prepara contabilidad; aquí queda el cese (fecha y motivo)»; (c) **cada empresa tiene su «Régimen laboral»** (MYPE o General): en MYPE la planilla referencial muestra solo lo ordinario (sueldo, asignación familiar, aportes de pensión, renta y ajustes) y la gratificación, la CTS y el aporte de salud del empleador los calcula contabilidad según su régimen; en General los estima el sistema; (d) las vacaciones son «Vacaciones programadas (solo para la agenda)»: no se llevan saldos ni días acumulados; (e) «Costo del empleador» se llama «Costo referencial de planilla».
- **Régimen laboral:** todas las empresas son MYPE (micro o pequeña empresa; ninguna pasa de pequeña; el usuario confirmó el 2026-11-07 «todas como MYPE»). Es un dato de cada empresa (`empresas.regimen_laboral`, por defecto MYPE).
- **Un trabajador tiene un solo contrato vigente** (el usuario confirmó el 2026-11-07 que no habrá dos a la vez con empresas distintas).
- **Planilla:** es de UNA empresa y UN mes (cada RUC la cierra por separado); el neto del contrato y el de la planilla salen del mismo motor (`payrollEngine.ts`). Una planilla cerrada
  guarda una **foto** (Borrador → Cerrada: no existe «pagada»; se reabre con motivo). Las tasas (AFP/ONP, UIT, RMV) son referenciales y viven solo en ese archivo.
- **Cuentas de Usuarios** nacen de la ficha de Personal (una persona, una cuenta), toman de ella nombre, documento y teléfono, y de sus asignaciones las sedes y el almacén; se desactivan solas al inactivar al trabajador (reactivarlas es una decisión aparte).
- Todo el dinero comercial es **USD**; la planilla y la caja chica, **soles**.
- **Un solo almacén central, aparte de las sedes** (entidad `Warehouse`, ids `ALM-NNN`, Organización → Almacenes; Los Olivos es una sede como las demás, con su stock de venta propio):
  los envíos salen siempre de él y toda transferencia lo tiene en un extremo; **entre dos filiales no hay transferencia directa** (`logisticsRoutes.ts`). El stock, el kardex, los envíos y
  las transferencias usan una **ubicación de stock** (el almacén o una sede: `stockLocations`, `StockItem.branchId` guarda su id). **El almacén no vende** (`locationSaleError`).
  **Ver ≠ mover:** quien alcanza todas las sedes (`org-alcance:all_branches`) VE el almacén, pero solo lo **mueve** (despachar, ingresar compras, ajustar, recibir devoluciones) quien lo tiene
  asignado en su cuenta (`User.warehouses`) o es Superusuario (`warehouseOperationError`, `SessionScope.operableWarehouseIds`, contrapartes con `Holder.warehouseIds`).
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
- `docs/DATOS_SEDES.md` — **generado** (`npx tsx scripts/doc-sedes-reales.ts`): las 6 empresas y las sedes reales (RUC, dirección, referencia, teléfonos, mapa, foto); **consultar esto antes de volver a pedir datos de sedes**. No se edita a mano.
- `docs/PLAN_LANZAMIENTO.md` — **el camino completo hasta producción** (seguridad, servicios, datos reales, persistir todo el sistema, legal y fiscal, pruebas, piloto y olas) con decisiones y riesgos; marcar ☑ al cerrar cada punto.
- `docs/PLAN_ROLES_Y_MODELO_DE_DATOS.md` — roles de partida, constructor de roles, avisos dirigidos y paso a paso (con su estado).
- `docs/CATALOGO_DE_FUNCIONES.md` — **generado** del registro (`npx tsx scripts/doc-capabilities.ts`); no se edita a mano.
- `docs/PRUEBAS_POR_ROL.md` — **generado**: matriz de qué ve y qué puede cada cuenta de ejemplo, con los hallazgos por confirmar.
- `docs/REVISION_PROYECTO.md`, `docs/INFORME_CONEXIONES_SISTEMA.md` — revisión y mapa de conexiones entre módulos.

Pendientes grandes conocidos: facturación electrónica (OSE/PSE), cambio rápido de usuario con PIN verificado en el servidor, persistencia del resto de los datos, alcance por sede en todas las pantallas
(la sede ya sale de la sesión, pero solo Stock, Kardex, Envíos, Transferencias, Recepciones, el asistente de matrícula y el Dashboard la respetan; el resto se hará con la base de datos, no pantalla por pantalla), almacenamiento de archivos, envío automático de WhatsApp/correo.

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
