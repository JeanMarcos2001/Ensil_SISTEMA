export const MODULE_DATA: Record<string, { title: string, groups: { title?: string, items: string[] }[] }> = {
  dashboard: {
    title: 'Dashboard',
    groups: [
      { items: ['Resumen general', 'Alertas del sistema', 'Actividad reciente'] }
    ]
  },
  operacion: {
    title: 'Operación',
    groups: [
      { items: ['Matrículas', 'Planes y cartera', 'Pagos', 'Verificación', 'Caja', 'Caja chica'] }
    ]
  },
  logistica: {
    title: 'Logística',
    groups: [
      { items: ['Catálogo de artículos', 'Stock', 'Envíos', 'Transferencias', 'Recepciones', 'Kardex', 'Ajustes y mermas'] }
    ]
  },
  psicopedagogia: {
    title: 'Psicopedagogía',
    groups: [
      { items: ['Programación', 'Historial del alumno', 'Cronogramas mensuales'] }
    ]
  },
  personas: {
    title: 'Personas',
    groups: [
      { items: ['Alumnos', 'Titulares', 'Personal', 'Contratos', 'Asignaciones'] }
    ]
  },
  configuracion: {
    title: 'Configuración comercial',
    groups: [
      { items: ['Programas', 'Niveles', 'Tipos de pago', 'Tarifarios', 'Promociones', 'Recetas de materiales'] }
    ]
  },
  organizacion: {
    title: 'Organización',
    groups: [
      { items: ['Empresas', 'Filiales', 'Roles', 'Permisos', 'Usuarios'] }
    ]
  },
  reportes: {
    title: 'Reportes',
    groups: [
      { items: ['Matrículas', 'Cartera', 'Caja', 'Verificación', 'Stock', 'Psicopedagogía', 'Personal', 'Auditoría'] }
    ]
  },
  sistema: {
    title: 'Sistema',
    groups: [
      { items: ['Auditoría', 'Solicitudes pendientes', 'Cierres', 'Reaperturas', 'Preferencias', 'Ayuda'] }
    ]
  }
};

export const getAllItemsForModule = (module: string) => {
  const moduleInfo = MODULE_DATA[module];
  if (!moduleInfo) return [];
  return moduleInfo.groups.flatMap(g => g.items);
};
