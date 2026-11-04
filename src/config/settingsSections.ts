/**
 * Función que da acceso a cada sección de la ventana de Configuración (botón inferior del menú).
 * `check-guards.ts` exige que cada sección de `SettingsPage` esté aquí y que su función exista.
 */
export const SETTINGS_SECTION_CAPABILITY: Record<string, string> = {
  leads: 'cfg-leads:view',
  templates: 'cfg-plantillas:view',
  collections: 'op-cobranza:config',
  psyreminders: 'psi-recordatorios:config',
  shipping: 'cfg-couriers:view',
};

/** ¿Tiene el usuario alguna sección de Configuración? (si no, el botón no se ofrece) */
export const hasSettingsAccess = (can: (capabilityId: string) => boolean): boolean =>
  Object.values(SETTINGS_SECTION_CAPABILITY).some(can);
