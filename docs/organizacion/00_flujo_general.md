# Flujo General de Organización

**Objetivo:** Visualizar la arquitectura global del módulo de Organización y las rutas de acción principales para Empresas, Filiales, Usuarios, Roles y Permisos.

## Diagrama de Flujo General

```mermaid
flowchart TD
    A[Ingresar a Organización] --> B{¿Qué desea gestionar?}
    
    B --> C[Empresas]
    B --> D[Filiales]
    B --> E[Usuarios]
    B --> F[Roles]
    B --> G[Permisos]

    C --> C1[Listar empresas]
    C1 --> C2[Crear empresa] & C3[Editar empresa] & C4[Activar/Inactivar empresa] & C5[Ver detalle de empresa]

    D --> D1[Listar filiales]
    D1 --> D2[Crear filial] & D3[Editar filial] & D4[Activar/Inactivar filial] & D5[Ver detalle de filial]

    E --> E1[Listar usuarios]
    E1 --> E2[Crear usuario] & E3[Editar usuario] & E4[Activar/Inactivar usuario] & E5[Resetear acceso] & E6[Ver detalle de usuario]

    F --> F1[Listar roles]
    F1 --> F2[Crear rol] & F3[Editar rol] & F4[Duplicar rol] & F5[Activar/Inactivar rol] & F6[Ver detalle de rol]

    G --> G1[Listar permisos]
    G1 --> G2[Ver matriz de permisos] & G3[Asignar permisos a rol] & G4[Aplicar excepciones por usuario]

    C2 & C3 & D2 & D3 & E2 & E3 & F2 & F3 & F4 & G3 & G4 --> V[Validar formulario]
    
    V --> V1{¿Validación correcta?}
    V1 -- No --> V2[Mostrar errores y corregir]
    V2 --> V
    V1 -- Sí --> V3[Guardar cambios]
    
    V3 --> V4[Registrar auditoría]
    V4 --> V5[Mostrar confirmación]
```
