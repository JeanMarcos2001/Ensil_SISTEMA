/**
 * Datos de ejemplo del catálogo de la organización y del personal: sedes, programas, niveles, personal, contratos, asignaciones y
 * cuentas. Viven aparte del contexto para poder verificarlos con `scripts/check-integrity.ts` junto con las personas y las matrículas.
 */
import type { Assignment, Branch, Contract, Level, Permission, Program, Role, Staff, User, Warehouse } from '../context/DataContext';
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
    { id: '4', code: 'PRG-ESP', name: 'Especialización', hasLevels: false, durationBase: 6, warranty: 6, allBranches: true, status: 'Activo' },
    { id: '5', code: 'PRG-PROF', name: 'Profesional', hasLevels: false, durationBase: 6, warranty: 6, allBranches: true, status: 'Activo' },
  ];

export const seedLevels = (): Level[] => [
    { id: '1', programId: '1', code: 'NVL-KIDS-1', name: 'Nivel 1', order: 1, status: 'Activo' },
    { id: '2', programId: '1', code: 'NVL-KIDS-2', name: 'Nivel 2', order: 2, status: 'Activo' },
    { id: '3', programId: '1', code: 'NVL-KIDS-3', name: 'Nivel 3', order: 3, status: 'Activo' },
    { id: '4', programId: '2', code: 'NVL-PK-1', name: 'Nivel 1', order: 1, status: 'Activo' },
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
