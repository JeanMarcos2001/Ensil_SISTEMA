# Pruebas por rol: qué ve y qué puede hacer cada cuenta

> **Generado** con `npx tsx scripts/doc-role-matrix.ts`; las verificaciones están en `scripts/check-role-matrix.ts`. No se edita a mano.
> Se calcula con las mismas reglas del sistema (permisos del rol, guardas de las acciones, menú por función, Dashboard por rol, alcance de sedes y avisos), con las 7 cuentas activas de ejemplo (PIN 1234).

## 1. Resumen por cuenta

| Cuenta | Rol | Sedes que alcanza | Funciones | Acciones del sistema que puede | Ítems de menú | Tarjetas del Dashboard | Avisos que recibe |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Laura Martínez | Administrador de sede | Piura | 57 | 30 | 23 | 6 | 7 |
| Marco Salas | Administrador de sede | Los Olivos | 57 | 30 | 23 | 6 | 7 |
| Juan Pérez | Psicopedagogía | Piura | 15 | 6 | 8 | 0 | 1 |
| Rosa Quispe | Almacén central | todas (16) | 25 | 12 | 9 | 1 | 6 |
| Admin Sistema | Administración general | todas (16) | 87 | 47 | 31 | 5 | 13 |
| Elena Ramos | Contabilidad | todas (16) | 17 | 1 | 11 | 2 | 1 |
| Superadmin | Superusuario | todas (16) | 185 | 121 | 48 | 7 | todos (soporte) |

## 2. Acciones clave

✔ = la guarda deja ejecutarla · — = la guarda la frena nombrando la función que falta. Es lo que decide quién cobra, quién reversa, quién aprueba, quién mueve stock y quién ve sueldos.

| Acción | Sede (Piura) | Sede (Los Olivos) | Psicopedagogía | Almacén | Admin. general | Contabilidad | Superusuario |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Matrícula** ||||||||
| Matricular | ✔ | ✔ | — | — | — | — | ✔ |
| Renovar una matrícula | ✔ | ✔ | — | — | — | — | ✔ |
| Pedir una caída | ✔ | ✔ | — | — | — | — | ✔ |
| Aprobar o rechazar una caída | — | — | — | — | ✔ | — | ✔ |
| Entregar materiales (verificación) | ✔ | ✔ | — | — | — | — | ✔ |
| **Dinero** ||||||||
| Cobrar una cuota | ✔ | ✔ | — | — | — | — | ✔ |
| Registrar un ingreso en caja | ✔ | ✔ | — | — | — | — | ✔ |
| Registrar un egreso en caja | ✔ | ✔ | — | — | — | — | ✔ |
| Vender un artículo en caja | ✔ | ✔ | — | — | — | — | ✔ |
| Cerrar la caja | ✔ | ✔ | — | — | — | — | ✔ |
| **Control** ||||||||
| Reversar un pago | — | — | — | — | ✔ | — | ✔ |
| Reversar un movimiento de caja | — | — | — | — | ✔ | — | ✔ |
| Reabrir un cierre de la caja | — | — | — | — | ✔ | — | ✔ |
| Reabrir un cierre de la caja chica | — | — | — | — | ✔ | — | ✔ |
| **Logística** ||||||||
| Ingresar stock | — | — | — | ✔ | — | — | ✔ |
| Preparar un envío | — | — | — | ✔ | — | — | ✔ |
| Despachar un envío | — | — | — | ✔ | — | — | ✔ |
| Confirmar la recepción de un envío | ✔ | ✔ | — | — | — | — | ✔ |
| Aprobar una transferencia | — | — | — | ✔ | — | — | ✔ |
| Registrar un ajuste o merma | — | — | — | ✔ | — | — | ✔ |
| **Psicopedagogía** ||||||||
| Agendar una asesoría | ✔ | ✔ | — | — | — | — | ✔ |
| Reprogramar una asesoría | ✔ | ✔ | — | — | — | — | ✔ |
| Marcar la asistencia | — | — | ✔ | — | — | — | ✔ |
| Registrar una sesión de seguimiento | — | — | ✔ | — | — | — | ✔ |
| **Personal** ||||||||
| Crear un contrato | — | — | — | — | ✔ | — | ✔ |
| Renovar un contrato | — | — | — | — | ✔ | — | ✔ |
| Generar la planilla | — | — | — | — | ✔ | — | ✔ |
| Cerrar la planilla | — | — | — | — | ✔ | — | ✔ |
| **Oferta comercial** ||||||||
| Crear un tarifario | — | — | — | — | ✔ | — | ✔ |
| Crear una promoción | — | — | — | — | ✔ | — | ✔ |
| **Organización** ||||||||
| Crear una sede | — | — | — | — | — | — | ✔ |
| Crear un rol | — | — | — | — | — | — | ✔ |
| Configurar los permisos de un rol | — | — | — | — | — | — | ✔ |
| Crear una cuenta | — | — | — | — | — | — | ✔ |

## 3. Menú que ve cada cuenta

Solo los ítems que piden una función (todos ven «Preferencias» y el botón «Ayuda»). «Configuración» solo la ven quienes tienen alguna sección de configuración.

| Ítem | Sede (Piura) | Sede (Los Olivos) | Psicopedagogía | Almacén | Admin. general | Contabilidad | Superusuario |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Dashboard › Resumen general | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Mensajería | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Operación › Matrículas | ✔ | ✔ | — | — | ✔ | — | ✔ |
| Operación › Planes y cartera | ✔ | ✔ | — | — | ✔ | ✔ | ✔ |
| Operación › Pagos | ✔ | ✔ | — | — | ✔ | ✔ | ✔ |
| Operación › Caja | ✔ | ✔ | — | — | ✔ | ✔ | ✔ |
| Operación › Caja chica | ✔ | ✔ | — | — | ✔ | ✔ | ✔ |
| Logística › Catálogo de artículos | — | — | — | ✔ | ✔ | — | ✔ |
| Personas › Personal | — | — | — | — | ✔ | — | ✔ |
| Personas › Contratos | — | — | — | — | ✔ | — | ✔ |
| Personas › Asignaciones | — | — | — | — | ✔ | — | ✔ |
| Personas › Planilla | — | — | — | — | ✔ | ✔ | ✔ |
| Oferta comercial › Programas | — | — | — | — | ✔ | — | ✔ |
| Oferta comercial › Niveles | — | — | — | — | ✔ | — | ✔ |
| Oferta comercial › Tipos de pago | — | — | — | — | ✔ | — | ✔ |
| Oferta comercial › Tarifarios | — | — | — | — | ✔ | — | ✔ |
| Oferta comercial › Promociones | — | — | — | — | ✔ | — | ✔ |
| Oferta comercial › Recetas de materiales | — | — | — | — | ✔ | — | ✔ |
| Organización › Empresas | — | — | — | — | ✔ | — | ✔ |
| Organización › Filiales | — | — | — | — | ✔ | — | ✔ |
| Reportes › Matrículas | ✔ | ✔ | — | — | ✔ | — | ✔ |
| Reportes › Cartera | ✔ | ✔ | — | — | ✔ | ✔ | ✔ |
| Reportes › Caja | ✔ | ✔ | — | — | ✔ | ✔ | ✔ |
| Reportes › Verificación | ✔ | ✔ | — | — | ✔ | — | ✔ |
| Reportes › Stock | — | — | — | ✔ | ✔ | — | ✔ |
| Reportes › Psicopedagogía | — | — | ✔ | — | ✔ | — | ✔ |
| Reportes › Personal | — | — | — | — | ✔ | ✔ | ✔ |
| Sistema › Auditoría | — | — | — | — | ✔ | — | ✔ |
| Sistema › Solicitudes pendientes | — | — | — | — | ✔ | — | ✔ |
| Sistema › Cierres | ✔ | ✔ | — | — | ✔ | ✔ | ✔ |
| Sistema › Reaperturas | — | — | — | — | ✔ | — | ✔ |
| Operación › Verificación | ✔ | ✔ | — | — | — | — | ✔ |
| Logística › Stock | ✔ | ✔ | — | ✔ | — | — | ✔ |
| Logística › Transferencias | ✔ | ✔ | — | ✔ | — | — | ✔ |
| Logística › Recepciones | ✔ | ✔ | — | — | — | — | ✔ |
| Logística › Kardex | ✔ | ✔ | — | ✔ | — | — | ✔ |
| Psicopedagogía › Programación | ✔ | ✔ | ✔ | — | — | — | ✔ |
| Psicopedagogía › Historial del alumno | ✔ | ✔ | ✔ | — | — | — | ✔ |
| Psicopedagogía › Cronogramas mensuales | ✔ | ✔ | ✔ | — | — | — | ✔ |
| Psicopedagogía › Recordatorios | ✔ | ✔ | ✔ | — | — | — | ✔ |
| Personas › Alumnos | ✔ | ✔ | ✔ | — | — | — | ✔ |
| Personas › Titulares | ✔ | ✔ | — | — | — | — | ✔ |
| Logística › Envíos | — | — | — | ✔ | — | — | ✔ |
| Logística › Ajustes y mermas | — | — | — | ✔ | — | — | ✔ |
| Organización › Almacenes | — | — | — | — | — | — | ✔ |
| Organización › Roles | — | — | — | — | — | — | ✔ |
| Organización › Permisos | — | — | — | — | — | — | ✔ |
| Organización › Usuarios | — | — | — | — | — | — | ✔ |
| Botón «Configuración» | — | — | — | — | ✔ | — | ✔ |

## 4. Dashboard por rol

| Cuenta | Primera pantalla | Tarjetas | Resumen por sedes | Caja y vencimientos | Actividad reciente | Accesos rápidos |
|---|---|---|:-:|:-:|:-:|---|
| Laura Martínez (Sede (Piura)) | /dashboard/resumen-general | matriculas, cartera, pagos, verificaciones, por-vencer, stock | ✔ | ✔ | ✔ | Matrículas, Pagos, Caja, Verificación |
| Marco Salas (Sede (Los Olivos)) | /dashboard/resumen-general | matriculas, cartera, pagos, verificaciones, por-vencer, stock | ✔ | ✔ | ✔ | Matrículas, Pagos, Caja, Verificación |
| Juan Pérez (Psicopedagogía) | /dashboard/resumen-general | — | — | — | — | Programación, Historial del alumno, Cronogramas mensuales, Recordatorios |
| Rosa Quispe (Almacén) | /dashboard/resumen-general | stock | — | — | — | Stock, Envíos, Transferencias |
| Admin Sistema (Admin. general) | /dashboard/resumen-general | matriculas, cartera, pagos, por-vencer, solicitudes | ✔ | ✔ | ✔ | Nueva Promoción, Nuevo Tarifario, Matrículas, Pagos |
| Elena Ramos (Contabilidad) | /dashboard/resumen-general | cartera, pagos | ✔ | ✔ | ✔ | Pagos, Caja, Planilla |
| Superadmin (Superusuario) | /dashboard/resumen-general | matriculas, cartera, pagos, verificaciones, por-vencer, stock, solicitudes | ✔ | ✔ | ✔ | Nueva Promoción, Nuevo Tarifario, Nuevo Usuario, Nueva Filial |

## 5. Avisos que recibe cada cuenta

Para un caso en su propia sede (el origen de los envíos es el almacén). El Superusuario ve todos los avisos por ser el rol de soporte.

- **Laura Martínez** (Sede (Piura)): Envío despachado, Envío cancelado, Transferencia en tránsito, Stock por debajo del mínimo, Primera asesoría sin materiales entregados, Cuota refinanciada, Cuotas vencidas
- **Marco Salas** (Sede (Los Olivos)): Envío despachado, Envío cancelado, Transferencia en tránsito, Stock por debajo del mínimo, Primera asesoría sin materiales entregados, Cuota refinanciada, Cuotas vencidas
- **Juan Pérez** (Psicopedagogía): Primera asesoría sin materiales entregados
- **Rosa Quispe** (Almacén): Envío recibido, Transferencia solicitada, Transferencia en tránsito, Transferencia recibida, Recepción con faltante o daño, Stock por debajo del mínimo
- **Admin Sistema** (Admin. general): Transferencia aprobada o rechazada, Recepción con faltante o daño, Solicitud de caída pendiente, Solicitud de reactivación pendiente, Solicitud de cambio de programa pendiente, Solicitud de traslado de sede pendiente, Solicitud resuelta, Pago reversado, Movimiento de caja reversado, Caja reabierta, Cuota refinanciada, Contratos por vencer, Permisos de un rol modificados
- **Elena Ramos** (Contabilidad): Cuota refinanciada

## 6. Hallazgos del paso 8

| # | Hallazgo | Estado |
|---|---|---|
| 1 | **Titulares mostraba el saldo, la deuda vencida y el estado de cuenta a quien no ve pagos** (Psicopedagogía veía lo que debe cada titular). | ✅ Corregido: esas columnas, el filtro de deuda, la exportación del saldo y «Ver estado de cuenta» piden «Ver pagos». |
| 2 | **Los accesos rápidos «Nueva Filial» y «Nuevo Usuario» se ofrecían a Administración general**, que ve esas pantallas pero no puede crear nada ahí. | ✅ Corregido: los accesos «Nuevo…» piden poder crear eso. |
| 3 | **El Almacén central editaba los precios del catálogo** (`log-catalogo:edit_price`, función sensible de dinero). | ✅ Decidido: el Almacén ya no fija precios; los fija Administración general. |
| 4 | **El administrador de sede podía reabrir el cierre de la CAJA CHICA** (la función de contarla cubría cerrar y reabrir). | ✅ Decidido: reabrir la caja chica es de Administración general (función propia `op-caja-chica:reopen_box`); la sede la cuenta y la cierra. |
| 5 | **Psicopedagogía veía Alumnos y Titulares** (datos de contacto), aunque el plan no los menciona para ese rol. | ✅ Decidido: ve Alumnos y no Titulares. |
| 6 | **Psicopedagogía no recibía ningún aviso** (las primeras asesorías sin materiales iban solo al administrador de sede). | ✅ Decidido: recibe el aviso de primeras asesorías sin materiales de su sede. |
| 7 | **Administración general no crea sedes, cuentas ni roles** (solo el Superusuario), aunque ve «Empresas» y «Filiales». | ℹ Coherente con el plan; las pantallas ya no ofrecen el botón. |
| 8 | La lista «Sistema» muestra «Preferencias» a todos los roles (no pide función). | ⏳ Pendiente (ya anotado). |
| 11 | **La campana de avisos solo la veía Administración general**: los demás roles recibían avisos que no podían ver. | ✅ Las plantillas de sede, almacén, Psicopedagogía y Contabilidad tienen «Ver la bandeja de avisos». |
| 9 | **La marca «Pagada» de la planilla** no corresponde a ningún proceso (el sistema no registra pagos al personal). | ✅ Retirada: la planilla queda en Borrador → Cerrada. |
| 10 | **Quien pide una solicitud podía resolverla él mismo.** | ✅ `allowSelfApproval = false` (el Superusuario queda exento). |

## 7. Prueba en el navegador

Se entró con cada una de las 7 cuentas (cambio de usuario con PIN) y se comparó lo que muestra la pantalla con esta matriz:

- **Menú lateral:** para las 7 cuentas, los ítems visibles coinciden exactamente con los de la sección 3 (ninguno de más, ninguno de menos); el botón «Configuración» aparece solo para Administración general y el Superusuario.
- **Dashboard:** el número de tarjetas y los accesos rápidos coinciden con la sección 4 en las 7 cuentas, y todas entran al Dashboard.
- **Rutas escritas a mano en la barra de direcciones:** Laura no abre Usuarios ni Planilla; Juan no abre Caja; Rosa no abre Recepciones; Elena no abre Matrículas; cada una ve «Su rol no tiene acceso a…» con la función que falta. Sí abren lo suyo (Laura: Caja con sus botones de venta y egreso; Elena: Caja sin botones de registro, solo lectura y exportación; Juan: Programación; Rosa: Stock).
- **Corrección comprobada (hallazgo 1):** en Titulares, Juan (Psicopedagogía) ya no ve la columna de saldo, el filtro de deuda ni «Ver estado de cuenta»; Laura (sede) los sigue viendo.
- Sin errores de consola.

