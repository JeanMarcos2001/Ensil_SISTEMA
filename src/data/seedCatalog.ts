/**
 * Datos de ejemplo del catálogo de la organización y del personal: sedes, programas, niveles, tipos de pago, tarifarios, promociones,
 * orígenes de leads, personal, contratos, asignaciones y cuentas. Viven aparte del contexto para poder verificarlos con
 * `scripts/check-integrity.ts` junto con las personas y las matrículas.
 *
 * El catálogo comercial (programas, niveles, tipos de pago, tarifarios, promociones y orígenes de leads) y los artículos con sus precios y
 * recetas YA viven en la base: el sistema no lee estas listas para mostrar nada. Sirven como datos de partida
 * (`supabase/seed/catalogo_comercial.sql` y `supabase/seed/articulos_y_recetas.sql`, generados desde aquí con `scripts/doc-catalogo-seed.ts` y
 * `scripts/doc-articulos-seed.ts`) y para que los datos de ejemplo en memoria (matrículas, stock) apunten a ids que existen.
 */
import type {
  Assignment, Branch, Contract, Item, ItemPrice, LeadSource, Level, PaymentType, Permission, Program, Promotion, Recipe, Role, Staff, Tariff, TariffInstallment, User, Warehouse,
} from '../context/DataContext';
import { ROLE_TEMPLATES, templatePermissions } from '../utils/roleTemplates';
import { REAL_BRANCHES, RUC, realBranchId, realCompanyId, realCompanyName } from './realOrg';
import { todayLocalISO } from '../utils/schedule';

/**
 * Un solo almacén central, aparte de las sedes: de él salen los envíos a todas las filiales (Los Olivos es una sede como las demás).
 * Es el mismo de la base (`ALM-001`, de SILEE, la empresa de Los Olivos).
 */
export const seedWarehouses = (): Warehouse[] => [
  {
    id: 'ALM-001', name: 'Almacén central', company: realCompanyName(RUC.silee), companyId: realCompanyId(RUC.silee), status: 'Activo',
    address: 'Jr. Carlos Monge #233, Los Olivos', observations: 'Abastece a todas las filiales; no vende.',
  },
];

/**
 * Las sedes de los datos de ejemplo son las REALES (`src/data/realOrg.ts`): mismos códigos `FIL-NNN`, nombres, empresas y direcciones que
 * Organización → Filiales. El sistema ya no usa esta lista para mostrar nada (lee las sedes de la base); sirve para los `check-*` y para
 * que los datos de ejemplo apunten a sedes que existen.
 */
export const seedBranches = (): Branch[] => REAL_BRANCHES.map(b => ({
  id: realBranchId(b.name), name: b.name, company: realCompanyName(b.ruc), companyId: realCompanyId(b.ruc), status: 'Activo' as const,
  address: b.address, reference: b.reference, department: b.department, province: b.province, district: b.district,
  ...(b.phoneFixed ? { phoneFixed: b.phoneFixed } : {}), ...(b.phoneMobile ? { phoneMobile: b.phoneMobile } : {}),
}));

export const seedPrograms = (): Program[] => [
    { id: '1', code: 'PRG-KIDS', name: 'Kids', hasLevels: true, durationBase: 3, warranty: 3, allBranches: true, status: 'Activo' },
    { id: '2', code: 'PRG-PK', name: 'Pre-Kids', hasLevels: true, durationBase: 3, warranty: 3, allBranches: true, status: 'Activo' },
    { id: '3', code: 'PRG-PL', name: 'Pre-lectura', hasLevels: false, durationBase: 3, warranty: 3, allBranches: false, enabledBranches: [realBranchId('Piura'), realBranchId('Chiclayo')], status: 'Activo' },
    // El id '4' (Especialización) no existe: el usuario indicó que el programa avanzado es solo «Profesional».
    { id: '5', code: 'PRG-PROF', name: 'Profesional', hasLevels: false, durationBase: 6, warranty: 6, allBranches: true, status: 'Activo' },
  ];

export const seedLevels = (): Level[] => [
    { id: '1', programId: '1', code: 'NVL-KIDS-1', name: 'Nivel 1', order: 1, status: 'Activo' },
    { id: '2', programId: '1', code: 'NVL-KIDS-2', name: 'Nivel 2', order: 2, status: 'Activo' },
    { id: '3', programId: '1', code: 'NVL-KIDS-3', name: 'Nivel 3', order: 3, status: 'Activo' },
    { id: '4', programId: '2', code: 'NVL-PK-1', name: 'Nivel 1', order: 1, status: 'Activo' },
  ];

export const seedPaymentTypes = (): PaymentType[] => [
  { id: '1', code: 'TP-CONT', name: 'Contado', installments: 1, termDays: 0, scheduleMode: 'inmediato', status: 'Activo' },
  { id: '2', code: 'TP-C2P', name: 'Contado en 2 partes', installments: 2, termDays: 30, scheduleMode: 'fechas_manuales', status: 'Activo' },
  { id: '3', code: 'TP-P3', name: 'Plan 3', installments: 3, termDays: 30, scheduleMode: 'intervalo_fijo', status: 'Activo' },
  { id: '4', code: 'TP-P6', name: 'Plan 6', installments: 6, termDays: 30, scheduleMode: 'intervalo_fijo', status: 'Activo' },
  { id: '5', code: 'TP-P9', name: 'Plan 9', installments: 9, termDays: 30, scheduleMode: 'intervalo_fijo', status: 'Activo' },
];

/** Matrícula + n cuotas iguales, cada 30 días (como las genera la pantalla de Tarifarios). */
const planLines = (enrollment: number, quota: number, count: number): TariffInstallment[] => [
  { number: 0, concept: 'Matrícula', amount: enrollment, dueDays: 0, kind: 'matricula' },
  ...Array.from({ length: count }, (_, i): TariffInstallment => ({ number: i + 1, concept: `Cuota ${i + 1}`, amount: quota, dueDays: i * 30, kind: 'cuota' })),
];
const singleLine = (amount: number): TariffInstallment[] => [{ number: 1, concept: 'Pago único', amount, dueDays: 0, kind: 'unica' }];

export const seedTariffs = (): Tariff[] => [
  { id: '1', name: 'Kids - Contado 2026', programId: '1', paymentTypeId: '1', branchId: 'all', currency: 'USD', basePrice: 500, installments: singleLine(500), startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo' },
  {
    // Contado en 2 partes: en matrícula solo se acuerdan las fechas; el monto de la parte 1 se registra al cobrar en Planes y la parte 2 es el saldo.
    id: '2', name: 'Kids - Contado en 2 partes 2026', programId: '1', paymentTypeId: '2', branchId: 'all', currency: 'USD', basePrice: 500,
    installments: [
      { number: 1, concept: 'Parte 1', amount: 0, dueDays: 0, kind: 'parte', variable: true },
      { number: 2, concept: 'Parte 2 (saldo)', amount: 0, dueDays: 30, kind: 'parte', variable: true },
    ],
    startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo',
  },
  { id: '3', name: 'Pre-Kids - Contado 2026', programId: '2', paymentTypeId: '1', branchId: 'all', currency: 'USD', basePrice: 500, installments: singleLine(500), startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo' },
  { id: '4', name: 'Pre-lectura - Plan 3 2026', programId: '3', paymentTypeId: '3', branchId: 'all', currency: 'USD', basePrice: 1000, installments: planLines(100, 300, 3), startDate: '2026-01-01', status: 'Activo' },
  { id: '5', name: 'Profesional - Contado 2026', programId: '5', paymentTypeId: '1', branchId: 'all', currency: 'USD', basePrice: 1000, installments: singleLine(1000), startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo' },
  { id: '6', name: 'Profesional - Plan 3 2026', programId: '5', paymentTypeId: '3', branchId: 'all', currency: 'USD', basePrice: 1200, installments: planLines(300, 300, 3), startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo' },
  { id: '7', name: 'Profesional - Plan 6 2026', programId: '5', paymentTypeId: '4', branchId: 'all', currency: 'USD', basePrice: 1400, installments: planLines(200, 200, 6), startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo' },
  { id: '8', name: 'Profesional - Plan 9 2026', programId: '5', paymentTypeId: '5', branchId: 'all', currency: 'USD', basePrice: 1500, installments: planLines(150, 150, 9), startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo' },
];

export const seedPromotions = (): Promotion[] => [
  {
    id: '1', code: 'PROMO-2X700', name: '2 matrículas Pre-Kids / Kids por USD 700', type: 'Grupal', requiredStudents: 2,
    eligibleProgramIds: ['2', '1'], // Pre-Kids y Kids (cualquier combinación y nivel)
    requiredBasePrice: 500, // Contado base de cada alumno
    allowMultipleGroups: true, paymentTypeIds: ['1'], // Contado
    totalPrice: 700, currency: 'USD', internalDistributionRule: 'Igualitario', branchIds: [], applyToAllBranches: true,
    startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo',
  },
  {
    id: '2', code: 'PROMO-PROF-2X1700', name: '2 matrículas Profesional por USD 1700', type: 'Grupal', requiredStudents: 2,
    eligibleProgramIds: ['5'], requiredBasePrice: 1000, allowMultipleGroups: true, paymentTypeIds: ['1'], // Contado
    totalPrice: 1700, currency: 'USD', internalDistributionRule: 'Igualitario', branchIds: [], applyToAllBranches: true,
    startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo',
  },
];

/**
 * Artículos de ejemplo. El id es el SKU: el stock, el kardex y las recetas de ejemplo (en memoria) los nombran por él, así que no cambian.
 * Ya viven en la base (`supabase/seed/articulos_y_recetas.sql`, generado desde aquí con `scripts/doc-articulos-seed.ts`).
 */
export const seedItems = (): Item[] => [
  {
    id: 'ITM-LIB-K1', name: 'Libro Kids Nivel 1', type: 'Libro', cost: 45, status: 'Activo', description: 'Libro de nivel 1 para programa Kids', unit: 'Unidad',
    isSold: true, isDeliveredOnEnrollment: true, isPackage: false, allowUnpacking: false, bookType: 'Individual', bindingType: 'Encolado',
  },
  {
    id: 'ITM-MAT-01', name: 'Material Lógico Matemático', type: 'Material educativo', cost: 20, status: 'Activo', description: 'Material para desarrollo lógico', unit: 'Unidad',
    isSold: false, isDeliveredOnEnrollment: true, isPackage: false, allowUnpacking: false, sessions: 12, gymnasticsPerSession: 2, trainingsPerSession: 3, trainingMode: 'General',
  },
  {
    id: 'ITM-KIT-BIENV', name: 'Kit Bienvenida (Mochila + Útiles)', type: 'Paquete / kit logístico', cost: 80, status: 'Activo', description: 'Kit entregado al matricular', unit: 'Kit',
    isSold: false, isDeliveredOnEnrollment: true, isPackage: true, allowUnpacking: true,
    composition: [
      { itemId: 'ITM-HER-01', name: 'Mochila Institucional', quantity: 1 },
      { itemId: 'ITM-HER-02', name: 'Cartuchera', quantity: 1 },
    ],
  },
  {
    id: 'ITM-HER-01', name: 'Mochila Institucional', type: 'Herramienta / adicional', cost: 25, status: 'Activo', description: 'Mochila con logo ENSIL', unit: 'Unidad',
    isSold: true, isDeliveredOnEnrollment: true, isPackage: false, allowUnpacking: false,
  },
  {
    id: 'ITM-HER-02', name: 'Cartuchera', type: 'Herramienta / adicional', cost: 5, status: 'Activo', description: 'Cartuchera básica', unit: 'Unidad',
    isSold: true, isDeliveredOnEnrollment: true, isPackage: false, allowUnpacking: false,
  },
];

/** Precios generales de los artículos que se venden (USD), vigentes desde el 2026-01-01. */
export const seedItemPrices = (): ItemPrice[] => [
  { id: 'PRC-001', itemId: 'ITM-LIB-K1', branchId: 'all', amount: 60, validFrom: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'Sistema' },
  { id: 'PRC-002', itemId: 'ITM-HER-01', branchId: 'all', amount: 45, validFrom: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'Sistema' },
  { id: 'PRC-003', itemId: 'ITM-HER-02', branchId: 'all', amount: 10, validFrom: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'Sistema' },
];

/** Recetas de ejemplo: nombran programas y niveles del catálogo comercial por su id. */
export const seedRecipes = (): Recipe[] => [
  {
    id: 'REC-001', name: 'Pack Kids Nivel 1 2024', programId: '1', levelId: '1', branchIds: [], applyToAllBranches: true, status: 'Activo',
    items: [{ itemId: 'ITM-LIB-K1', quantity: 1 }, { itemId: 'ITM-KIT-BIENV', quantity: 1 }], startDate: '2026-01-01', endDate: '2026-12-31',
  },
  {
    id: 'REC-002', name: 'Pack Kids Nivel 2 2024', programId: '1', levelId: '2', branchIds: [], applyToAllBranches: true, status: 'Activo',
    items: [{ itemId: 'ITM-LIB-K1', quantity: 1 }, { itemId: 'ITM-MAT-01', quantity: 1 }], startDate: '2026-01-01', endDate: '2026-12-31',
  },
  {
    id: 'REC-003', name: 'Pack Pre-Kids Nivel 1 2026', programId: '2', levelId: '4', branchIds: [], applyToAllBranches: true, status: 'Activo',
    items: [{ itemId: 'ITM-KIT-BIENV', quantity: 1 }, { itemId: 'ITM-MAT-01', quantity: 1 }], startDate: '2026-01-01', endDate: '2026-12-31',
  },
];

export const seedLeadSources = (): LeadSource[] => [
  { id: '1', name: 'Facebook Ads', status: 'active' },
  { id: '2', name: 'Orgánico', status: 'active' },
  { id: '3', name: 'Referido', status: 'active' },
  { id: '4', name: 'Instagram', status: 'active' },
  { id: '5', name: 'WhatsApp', status: 'active' },
];

export const seedStaff = (): Staff[] => [
    { id: 'STF-001', code: '000001', docType: 'DNI', docNumber: '12345678', names: 'Juan', lastNameP: 'Pérez', lastNameM: 'García', birthDate: '1985-05-15', gender: 'Masculino', civilStatus: 'Casado(a)', hasChildren: true, childrenCount: 2, educationLevel: 'Universitario', profession: 'Psicólogo', specialty: 'Psicopedagogía', phone: '987654321', personalEmail: 'juan.perez.personal@gmail.com', address: 'Av. Larco 123, Miraflores', status: 'Activo', observations: 'Docente principal' },
    { id: 'STF-002', code: '000002', docType: 'DNI', docNumber: '87654321', names: 'María', lastNameP: 'Torres', lastNameM: 'López', birthDate: '1990-08-20', gender: 'Femenino', civilStatus: 'Soltero(a)', hasChildren: false, childrenCount: 0, educationLevel: 'Técnico', profession: 'Administradora', specialty: 'Gestión Educativa', phone: '912345678', personalEmail: 'maria.torres.personal@gmail.com', address: 'Calle Lima 456, San Isidro', status: 'Activo', observations: 'Coordinadora de filial' },
  ];

export const seedContracts = (): Contract[] => [
    { id: 'CON-001', staffId: 'STF-001', type: 'Indeterminado', position: 'Psicólogo Senior', startDate: '2023-01-01', status: 'Vigente', shift: 'Full time', pensionSystem: 'AFP', pensionFund: 'Integra', grossSalary: 3500, contribution: 466.8, incomeTax: 84.88, familyAllowance: 113, netSalary: 3061.32, observations: 'Contrato inicial' },
    { id: 'CON-002', staffId: 'STF-002', type: 'Plazo Fijo', position: 'Coordinadora', startDate: '2023-06-01', endDate: '2027-05-31', status: 'Vigente', shift: 'Full time', pensionSystem: 'ONP', grossSalary: 2800, contribution: 364, incomeTax: 8.03, familyAllowance: 0, netSalary: 2427.97, observations: 'Renovación anual' },
  ];

export const seedAssignments = (): Assignment[] => [
    { id: 'ASG-001', staffId: 'STF-001', branch: 'Piura', area: 'Psicopedagogía', hasAccess: true, startDate: '2023-01-01', isMain: true, status: 'Activa' },
    { id: 'ASG-002', staffId: 'STF-002', branch: 'Chiclayo', area: 'Administración', hasAccess: true, startDate: '2023-06-01', isMain: true, status: 'Activa' },
    { id: 'ASG-003', staffId: 'STF-002', branch: 'Chiclayo', area: 'Psicopedagogía', hasAccess: true, startDate: '2023-06-01', isMain: false, status: 'Activa' },
  ];

/** Los 6 roles de partida salen de las plantillas (`utils/roleTemplates.ts`): son datos y se pueden editar o duplicar. */
export const seedRoles = (): Role[] =>
  ROLE_TEMPLATES.map((t, i) => ({
    id: `ROL-${String(i + 1).padStart(3, '0')}`, name: t.name, desc: t.desc, status: 'Activo' as const, templateId: t.id,
    branchUserLimit: t.branchUserLimit, locked: t.locked,
    acceptedRisks: t.risks ? Object.entries(t.risks).map(([ruleId, reason]) => ({ ruleId, reason, by: 'Plantilla de partida', at: todayLocalISO() })) : undefined,
  }));

export const seedPermissions = (): Permission[] =>
  seedRoles().map((r, i) => ({ roleId: r.id, permissions: templatePermissions(ROLE_TEMPLATES[i]) }));

export const seedUsers = (): User[] => ([
    { id: 'USR-001', name: 'Admin Sistema', email: 'admin@ensil.edu.pe', role: 'Administración general', branch: 'Todas', lastAccess: 'Hace 5 min', status: 'Activo' },
    { id: 'USR-002', name: 'Laura Martínez', email: 'lmartinez@ensil.edu.pe', role: 'Administrador de sede', branch: 'Piura', lastAccess: 'Ayer 14:30', status: 'Activo' },
    { id: 'USR-003', name: 'Jorge Torres', email: 'jtorres@ensil.edu.pe', role: 'Administrador de sede', branch: 'Chiclayo', lastAccess: 'Hace 2 días', status: 'Inactivo' },
    { id: 'USR-004', name: 'Juan Pérez', email: 'jperez@ensil.edu.pe', role: 'Psicopedagogía', branch: 'Piura', lastAccess: 'Nunca', status: 'Activo', staffId: 'STF-001', document: '12345678', phone: '987654321' },
    { id: 'USR-005', name: 'Rosa Quispe', email: 'rquispe@ensil.edu.pe', role: 'Almacén central', branch: '', warehouses: ['ALM-001'], lastAccess: 'Hace 1 hora', status: 'Activo' },
    { id: 'USR-006', name: 'Marco Salas', email: 'msalas@ensil.edu.pe', role: 'Administrador de sede', branch: 'Los Olivos', lastAccess: 'Hoy 08:10', status: 'Activo' },
    { id: 'USR-007', name: 'Elena Ramos', email: 'eramos@ensil.edu.pe', role: 'Contabilidad', branch: 'Los Olivos', lastAccess: 'Hace 3 días', status: 'Activo' },
    { id: 'USR-008', name: 'Superadmin', email: 'superadmin@ensil.edu.pe', role: 'Superusuario', branch: 'Todas', lastAccess: 'Ahora', status: 'Activo' },
  ] as User[]);
