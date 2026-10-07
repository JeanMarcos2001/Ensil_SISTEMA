# Flujo de Empresas

**Objetivo:** Gestionar la razón social legal base del sistema.

## Reglas de Negocio
* Una empresa puede tener muchas filiales.
* Una filial pertenece a una sola empresa activa.
* **No se debe eliminar físicamente** una empresa si ya tiene movimientos; solo se inactiva (Soft Delete).

## Diagrama de Flujo

```mermaid
flowchart TD
    A[Entrar a Organización > Empresas] --> B[Listado de empresas]
    B --> C{¿Qué acción desea realizar?}
    
    C --> D[Crear empresa]
    C --> E[Editar empresa]
    C --> F[Ver detalle]
    C --> G[Activar/Inactivar empresa]
    
    D --> H[Llenar formulario empresa]
    E --> H
    
    H --> I[Validar campos obligatorios]
    I --> J{¿RUC válido y no duplicado?}
    
    J -- No --> K[Mostrar error]
    K --> H
    
    J -- Sí --> L[Guardar empresa]
    
    G --> M{¿Empresa tiene filiales activas?}
    M -- Sí --> N[Advertir impacto y confirmar]
    N --> O[Cambiar estado]
    M -- No --> O
    
    L --> P[Registrar auditoría]
    O --> P
    
    P --> Q[Volver al listado]
```
