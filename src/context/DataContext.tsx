import React, { createContext, useContext, useState, ReactNode } from 'react';

// Types
export interface Guardian {
  id: string;
  name: string;
  doc: string;
  phone: string;
  email: string;
  parentesco?: string;
  direccion?: string;
  students: number;
  enrollments: number;
  balance: string;
}

export interface Student {
  id: string;
  doc: string;
  name: string;
  age: number;
  grado?: string;
  colegio?: string;
  program: string;
  horario?: string;
  fechaInicio?: string;
  titular: string;
  status: string;
}

export interface Enrollment {
  id: string;
  date: string;
  student: string;
  program: string;
  programId?: string;
  level: string;
  levelId?: string;
  sede?: string;
  branchId?: string;
  asesor?: string;
  origen?: string;
  status: string;
  plan: string;
  verificationStatus?: 'Pendiente' | 'Verificado Incompleto' | 'Verificado Completo';
  verifiedItems?: string[]; // IDs of items delivered
  verificationDate?: string;
  verifier?: string;
  verificationObservation?: string;
}

export interface Plan {
  id: string;
  mat: string;
  titular: string;
  type: string;
  total: number;
  balance: number;
  next: string;
  status: string;
  installments: any[];
}

export interface Payment {
  id: string;
  date: string;
  student: string;
  concept: string;
  amount: number;
  method: string;
  receipt: string;
  status: string;
}

export type ItemType = 'Material educativo' | 'Herramienta / adicional' | 'Libro' | 'Paquete / kit logístico';

export interface Item {
  id: string;
  name: string;
  status: 'Activo' | 'Inactivo';
  type: ItemType;
  description: string;
  unit: string;
  cost: number;
  isSold: boolean;
  salePrice?: number;
  isDeliveredOnEnrollment: boolean;
  isPackage: boolean;
  allowUnpacking: boolean;

  // Material educativo
  sessions?: number;
  gymnasticsPerSession?: number;
  trainingsPerSession?: number;
  trainingMode?: 'General' | 'Variable';
  variableTrainings?: { session: number; trainings: number }[];

  // Libro
  bookType?: 'Individual' | 'Paquete/Juego';

  // Paquete
  composition?: { itemId: string; name: string; quantity: number }[];
}

export interface StockItem {
  id: string;
  itemId: string;
  branchId: string;
  stock: number;
  minStock: number;
}

export interface KardexEntry {
  id: string;
  date: string;
  branch: string;
  material: string;
  type: 'Ingreso' | 'Salida' | 'Transferencia Salida' | 'Transferencia Entrada' | 'Ajuste Positivo' | 'Ajuste Negativo' | 'Merma' | 'Venta' | 'Entrega por Verificación' | 'Empaquetado' | 'Desempaquetado' | 'Regularización Administrativa' | 'Salida por matrícula' | 'Transferencia' | 'Ajuste' | 'Devolución';
  qty: number;
  prevBalance: number;
  newBalance: number;
  user: string;
  doc: string;
  observation?: string;
}

export interface Courier {
  id: string;
  code: string;
  name: string;
  address: string;
  reference: string;
  phone: string;
  status: 'Activo' | 'Inactivo';
  observations: string;
}

export interface ShippingMethod {
  id: string;
  name: string;
  status: 'Activo' | 'Inactivo';
  observations: string;
}

export interface TransferBoxItem {
  itemId: string;
  quantity: number;
}

export interface TransferBox {
  id: string;
  boxNumber: string;
  observation?: string;
  items: TransferBoxItem[];
}

export interface TransferItem {
  itemId: string;
  quantity: number;
  observation?: string;
}

export interface Transfer {
  id: string;
  date: string;
  originId: string;
  destinationId: string;
  status: 'Borrador' | 'Solicitada' | 'Aprobada' | 'En tránsito' | 'Listo para recepción' | 'Recibida' | 'Recibida con diferencias' | 'Rechazada' | 'Cancelada' | 'Despachada' | 'Recepcionada';
  items: TransferItem[];
  boxes?: TransferBox[];
  reason: string;
  shippingMethodId?: string;
  courierId?: string;
  trackingNumber?: string;
  additionalReference?: string;
  travelerName?: string;
  travelerDocument?: string;
  shippingObservation?: string;
  internalLogisticsObservation?: string;
  eta?: string;
  observation?: string;
  attachments?: string[];
  receptionObservation?: string;
  receptionDate?: string;
  receivedBy?: string;
  manualEnable?: boolean;
}

export interface ShipmentBoxItem {
  itemId: string;
  quantity: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'danger';
  date: string;
  read: boolean;
  branchId?: string;
}

export interface ShipmentBox {
  id: string;
  boxNumber: string;
  observation?: string;
  items: ShipmentBoxItem[];
}

export interface ShipmentItem {
  itemId: string;
  quantity: number;
  observation?: string;
}

export interface Shipment {
  id: string;
  date: string;
  originId: string;
  destinationId: string;
  status: 'Borrador' | 'En tránsito' | 'Listo para recepción' | 'Recibido' | 'Recibido con diferencias' | 'Cancelado';
  boxes: ShipmentBox[];
  items: ShipmentItem[]; // Flattened list for easy querying
  shippingMethodId?: string;
  courierId?: string;
  trackingNumber?: string;
  additionalReference?: string;
  travelerName?: string;
  travelerDocument?: string;
  shippingObservation?: string;
  eta?: string;
  etaTime?: string; // e.g. "14:30"
  draftExpiry?: string;
  observation?: string;
  attachments?: string[];
  receptionObservation?: string;
  receptionDate?: string;
  receivedBy?: string;
  manualEnable?: boolean;
}

export interface ReceptionIncident {
  id: string;
  docId: string;
  docType: 'Envío' | 'Transferencia';
  itemId: string;
  type: 'missing' | 'damaged' | 'extra';
  quantity: number;
  observation: string;
  date: string;
  branchId: string;
}

export interface PromotionComposition {
  programId: string;
  quantity: number;
}

export interface Promotion {
  id: string;
  code: string;
  name: string;
  type: 'Grupal';
  requiredStudents: number;
  composition: PromotionComposition[];
  paymentTypeIds: string[];
  totalPrice: number;
  currency: 'PEN' | 'USD';
  internalDistributionRule: 'Igualitario';
  branchIds: string[];
  applyToAllBranches: boolean;
  startDate: string;
  endDate: string;
  status: 'Activo' | 'Inactivo';
  observations?: string;
}

export interface RecipeItem {
  itemId: string;
  quantity: number;
}

export interface Recipe {
  id: string;
  name: string;
  programId: string;
  levelId?: string; // Optional: if empty, applies to all levels
  branchIds: string[]; // List of branch IDs
  applyToAllBranches: boolean;
  status: 'Activo' | 'Inactivo';
  items: RecipeItem[];
  startDate: string;
  endDate?: string; // Optional: if empty, indefinite
}

export interface Adjustment {
  id: string;
  date: string;
  branch: string;
  material: string;
  type: 'Ajuste Positivo' | 'Ajuste Negativo' | 'Merma' | 'Regularización Administrativa' | 'Devolución';
  qty: number;
  reason: string;
  observation?: string;
  user: string;
}

export interface Schedule {
  id: string;
  student: string;
  program: string;
  level: string;
  type: string;
  date: string;
  time: string;
  duration: number;
  responsible: string;
  modality: string;
  status: string;
}

export interface Counseling {
  id: string;
  student: string;
  program: string;
  level: string;
  date: string;
  time: string;
  responsible: string;
  status: string;
}

export interface Tracking {
  id: string;
  studentId: string;
  date: string;
  status: string;
  metrics: any;
  observations: string;
}

export interface MonthlySchedule {
  id: string;
  sede: string;
  mes: string;
  anio: number;
  titulo: string;
  actividades: any[];
  observaciones: string;
}

export interface Staff {
  id: string;
  code: string;
  docType: string;
  docNumber: string;
  names: string;
  lastNameP: string;
  lastNameM: string;
  birthDate: string;
  age: number;
  gender?: string;
  civilStatus?: string;
  hasChildren?: boolean;
  childrenCount?: number;
  educationLevel?: string;
  profession?: string;
  specialty?: string;
  phone: string;
  institutionalEmail: string;
  personalEmail?: string;
  address?: string;
  status: string;
  observations?: string;
}

export interface Contract {
  id: string;
  staffId: string;
  type: string;
  startDate: string;
  endDate?: string;
  status: string;
  shift?: string;
  pensionSystem?: string;
  pensionFund?: string;
  commissionType?: string;
  grossSalary?: number;
  contribution?: number;
  netSalary?: number;
  vacationStart?: string;
  vacationEnd?: string;
  terminationReason?: string;
  observations?: string;
}

export interface Assignment {
  id: string;
  staffId: string;
  branch: string;
  area: string;
  role: string;
  systemRole?: string;
  startDate: string;
  endDate?: string;
  isMain: boolean;
  status: string;
  observations?: string;
}

export interface Company {
  id: string;
  ruc: string;
  name: string;
  commercialName: string;
  status: 'Activo' | 'Inactivo';
  observaciones?: string;
}

export interface Role {
  id: string;
  name: string;
  desc: string;
  users: number;
  status: 'Activo' | 'Inactivo';
  baseRole?: string;
  observations?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  branch: string;
  lastAccess: string;
  status: 'Activo' | 'Inactivo';
  document?: string;
  phone?: string;
  additionalBranches?: string[];
}

export interface Permission {
  roleId: string;
  permissions: string[];
}

export interface Branch {
  id: string; // Código
  name: string; // Nombre de filial
  company: string; // Empresa
  status: 'Activo' | 'Inactivo';
  address: string; // Dirección
  reference?: string; // Referencia
  department: string; // Departamento
  province: string; // Provincia
  district: string; // Distrito
  phoneFixed?: string;
  phoneMobile?: string;
  email?: string;
  responsibleId?: string; // ID del personal responsable
  observations?: string;
}

export interface LeadSource {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}

export interface Program {
  id: string;
  code: string;
  name: string;
  alias?: string;
  description?: string;
  hasLevels: boolean;
  durationBase: number;
  warranty: number;
  allBranches: boolean;
  enabledBranches?: string[];
  status: 'Activo' | 'Inactivo';
  observations?: string;
}

export interface Level {
  id: string;
  programId: string;
  code: string;
  name: string;
  order: number;
  status: 'Activo' | 'Inactivo';
  description?: string;
}

export interface PaymentType {
  id: string;
  code: string;
  name: string;
  installments: number;
  termDays: number;
  allowPartial: boolean;
  maxPartials?: number;
  applicablePrograms: string[]; // IDs of programs
  status: 'Activo' | 'Inactivo';
  description?: string;
}

export interface TariffInstallment {
  number: number;
  concept: string;
  amount: number;
  dueDays: number;
}

export interface Tariff {
  id: string;
  name: string;
  programId: string;
  paymentTypeId: string;
  branchId: string; // 'all' or specific ID
  currency: 'PEN' | 'USD';
  basePrice: number;
  includesEnrollment: boolean;
  enrollmentValue?: number;
  includesMaterials: boolean;
  materialsValue?: number;
  installments: TariffInstallment[];
  startDate: string;
  endDate?: string;
  status: 'Activo' | 'Inactivo';
}

interface DataContextType {
  guardians: Guardian[];
  students: Student[];
  enrollments: Enrollment[];
  plans: Plan[];
  payments: Payment[];
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  stockItems: StockItem[];
  kardex: KardexEntry[];
  transfers: Transfer[];
  setTransfers: React.Dispatch<React.SetStateAction<Transfer[]>>;
  couriers: Courier[];
  setCouriers: React.Dispatch<React.SetStateAction<Courier[]>>;
  shippingMethods: ShippingMethod[];
  setShippingMethods: React.Dispatch<React.SetStateAction<ShippingMethod[]>>;
  adjustments: Adjustment[];
  addAdjustment: (adjustment: Omit<Adjustment, 'id' | 'date' | 'user'>, stockId: string) => void;
  schedules: Schedule[];
  counselings: Counseling[];
  trackings: Tracking[];
  monthlySchedules: MonthlySchedule[];
  staff: Staff[];
  contracts: Contract[];
  assignments: Assignment[];
  roles: Role[];
  setRoles: React.Dispatch<React.SetStateAction<Role[]>>;
  addRole: (role: Role) => void;
  updateRole: (id: string, roleData: Partial<Role>) => void;
  deleteRole: (id: string) => void;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  addUser: (user: User) => void;
  updateUser: (id: string, userData: Partial<User>) => void;
  deleteUser: (id: string) => void;
  permissions: Permission[];
  savePermissions: (roleId: string, newPermissions: string[]) => void;
  companies: Company[];
  setCompanies: React.Dispatch<React.SetStateAction<Company[]>>;
  addCompany: (company: Company) => void;
  updateCompany: (id: string, companyData: Partial<Company>) => void;
  deleteCompany: (id: string) => void;
  branches: Branch[];
  leadSources: LeadSource[];
  programs: Program[];
  levels: Level[];
  paymentTypes: PaymentType[];
  tariffs: Tariff[];
  promotions: Promotion[];
  recipes: Recipe[];
  setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
  unpackPackage: (stockId: string) => void;
  packPackage: (stockId: string) => void;
  updateStock: (branchId: string, itemId: string, qty: number, type: KardexEntry['type'], observation: string, doc?: string) => void;
  updateMinStock: (stockId: string, minStock: number) => void;
  updateTransferStatus: (id: string, status: Transfer['status']) => void;
  updateTransfer: (id: string, transfer: Partial<Transfer>) => void;
  addTransfer: (transfer: Omit<Transfer, 'id'>) => void;
  addStaff: (staff: Omit<Staff, 'id'>) => void;
  updateStaff: (id: string, staff: Partial<Staff>) => void;
  deleteStaff: (id: string) => void;
  addStudent: (student: Omit<Student, 'id'>) => void;
  updateStudent: (id: string, student: Partial<Student>) => void;
  deleteStudent: (id: string) => void;
  addGuardian: (guardian: Omit<Guardian, 'id'>) => void;
  updateGuardian: (id: string, guardian: Partial<Guardian>) => void;
  deleteGuardian: (id: string) => void;
  addEnrollmentFlow: (data: any) => void;
  addTracking: (tracking: Omit<Tracking, 'id'>) => void;
  registerPayment: (planId: string, installmentId: string, paymentData: any) => void;
  refinanceInstallment: (planId: string, installmentId: string, refinanceData: any) => void;
  addLeadSource: (name: string) => void;
  updateLeadSource: (id: string, name: string, status: 'active' | 'inactive') => void;
  deleteLeadSource: (id: string) => void;
  updateEnrollmentVerification: (enrollmentId: string, data: {
    status: Enrollment['verificationStatus'];
    items: string[];
    observation?: string;
    date: string;
    verifier: string;
  }) => void;
  addProgram: (program: Omit<Program, 'id'>) => void;
  updateProgram: (id: string, program: Partial<Program>) => void;
  deleteProgram: (id: string) => void;
  addLevel: (level: Omit<Level, 'id'>) => void;
  updateLevel: (id: string, level: Partial<Level>) => void;
  deleteLevel: (id: string) => void;
  addPaymentType: (paymentType: Omit<PaymentType, 'id'>) => void;
  updatePaymentType: (id: string, paymentType: Partial<PaymentType>) => void;
  deletePaymentType: (id: string) => void;
  addTariff: (tariff: Omit<Tariff, 'id'>) => void;
  updateTariff: (id: string, tariff: Partial<Tariff>) => void;
  deleteTariff: (id: string) => void;
  addPromotion: (promotion: Omit<Promotion, 'id'>) => void;
  updatePromotion: (id: string, promotion: Partial<Promotion>) => void;
  deletePromotion: (id: string) => void;
  addBranch: (branch: Branch) => void;
  updateBranch: (id: string, branch: Partial<Branch>) => void;
  deleteBranch: (id: string) => void;
  isEnrollmentWizardOpen: boolean;
  setIsEnrollmentWizardOpen: (isOpen: boolean) => void;
  shipments: Shipment[];
  addShipment: (shipment: Omit<Shipment, 'id'>) => void;
  updateShipmentStatus: (id: string, status: Shipment['status'], observation?: string) => void;
  updateShipment: (id: string, shipment: Partial<Shipment>) => void;
  deleteShipment: (id: string) => void;
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'date' | 'read'>) => void;
  markNotificationAsRead: (id: string) => void;
  incidents: ReceptionIncident[];
  currentBranchId: string;
  setCurrentBranchId: (id: string) => void;
  currentUser: { id: string; name: string; role: string; branchId: string | 'all' };
  confirmReception: (data: {
    docId: string;
    docType: 'Envío' | 'Transferencia';
    receivedItems: { itemId: string; quantity: number; status: 'ok' | 'missing' | 'damaged' | 'extra'; observation?: string }[];
    generalObservation?: string;
  }) => void;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [guardians, setGuardians] = useState<Guardian[]>([
    { id: '1', name: 'Juan Ruiz', doc: '45678901', phone: '987654321', email: 'juan@email.com', students: 1, enrollments: 1, balance: '$800' },
    { id: '2', name: 'María Castro', doc: '45678902', phone: '987654322', email: 'maria@email.com', students: 1, enrollments: 1, balance: '$100' },
    { id: '3', name: 'Pedro Vega', doc: '45678903', phone: '987654323', email: 'pedro@email.com', students: 1, enrollments: 1, balance: '$1,750' },
    { id: '4', name: 'Ana Silva', doc: '45678904', phone: '987654324', email: 'ana@email.com', students: 1, enrollments: 1, balance: '$0' },
    { id: '5', name: 'Carlos Torres', doc: '45678905', phone: '987654325', email: 'carlos@email.com', students: 1, enrollments: 1, balance: '$0' },
  ]);

  const [students, setStudents] = useState<Student[]>([
    { id: 'ALU-001', doc: '76543210', name: 'Mateo Ruiz', age: 8, program: 'Kids - Básico 1', titular: 'Juan Ruiz', status: 'Activo' },
    { id: 'ALU-002', doc: '76543211', name: 'Sofia Castro', age: 14, program: 'Teens - Intermedio', titular: 'María Castro', status: 'Activo' },
    { id: 'ALU-003', doc: '76543212', name: 'Lucas Vega', age: 9, program: 'Kids - Básico 2', titular: 'Pedro Vega', status: 'Inactivo' },
    { id: 'ALU-004', doc: '76543213', name: 'Valentina Silva', age: 5, program: 'Pre-Kids - Inicial', titular: 'Ana Silva', status: 'Activo' },
    { id: 'ALU-005', doc: '76543214', name: 'Diego Torres', age: 15, program: 'Teens - Avanzado', titular: 'Carlos Torres', status: 'Activo' },
  ]);

  const [enrollments, setEnrollments] = useState<Enrollment[]>([
    { id: 'MAT-2024-001', date: '24 Mar 2024', student: 'Mateo Ruiz', program: 'Kids', programId: '1', level: 'Nivel 1', levelId: '1', sede: 'Piura', branchId: 'FIL-PIU', status: 'Activa', plan: 'Al día' },
    { id: 'MAT-2024-002', date: '23 Mar 2024', student: 'Sofia Castro', program: 'Kids', programId: '1', level: 'Nivel 2', levelId: '2', sede: 'Chiclayo', branchId: 'FIL-CHI', status: 'Activa', plan: 'Parcial' },
    { id: 'MAT-2024-003', date: '22 Mar 2024', student: 'Lucas Vega', program: 'Kids', programId: '1', level: 'Nivel 3', levelId: '3', sede: 'Piura', branchId: 'FIL-PIU', status: 'Caída', plan: 'Atrasado' },
    { id: 'MAT-2024-004', date: '20 Mar 2024', student: 'Valentina Silva', program: 'Pre-Kids', programId: '2', level: 'Nivel 1', levelId: '4', sede: 'Chiclayo', branchId: 'FIL-CHI', status: 'Activa', plan: 'Al día' },
    { id: 'MAT-2024-005', date: '19 Mar 2024', student: 'Diego Torres', program: 'Kids', programId: '1', level: 'Nivel 1', levelId: '1', sede: 'Piura', branchId: 'FIL-PIU', status: 'Activa', plan: 'Al día' },
  ]);

  const [plans, setPlans] = useState<Plan[]>([
    { 
      id: 'PLN-001', mat: 'MAT-2024-001', titular: 'Juan Ruiz', type: 'Plan 6 Cuotas', total: 1200, balance: 800, next: '15 Abr 2024', status: 'Al día',
      installments: [
        { id: 'C1', name: 'Cuota 1', amount: 200, balance: 0, dueDate: '15 Feb 2024', status: 'Pagada', payments: [{ id: 'P1', date: '10 Feb 2024', amount: 200, receipt: 'B001-000123' }] },
        { id: 'C2', name: 'Cuota 2', amount: 200, balance: 0, dueDate: '15 Mar 2024', status: 'Pagada', payments: [{ id: 'P2', date: '12 Mar 2024', amount: 200, receipt: 'B001-000456' }] },
        { id: 'C3', name: 'Cuota 3', amount: 200, balance: 200, dueDate: '15 Abr 2024', status: 'Pendiente', payments: [] },
        { id: 'C4', name: 'Cuota 4', amount: 200, balance: 200, dueDate: '15 May 2024', status: 'Pendiente', payments: [] },
        { id: 'C5', name: 'Cuota 5', amount: 200, balance: 200, dueDate: '15 Jun 2024', status: 'Pendiente', payments: [] },
        { id: 'C6', name: 'Cuota 6', amount: 200, balance: 200, dueDate: '15 Jul 2024', status: 'Pendiente', payments: [] },
      ]
    },
    { 
      id: 'PLN-002', mat: 'MAT-2024-002', titular: 'María Castro', type: 'Plan 6 Cuotas', total: 1200, balance: 100, next: '15 Abr 2024', status: 'Parcial',
      installments: [
        { id: 'C1', name: 'Cuota 1', amount: 200, balance: 0, dueDate: '15 Feb 2024', status: 'Pagada', payments: [{ id: 'P1', date: '10 Feb 2024', amount: 200, receipt: 'B001-000123' }] },
        { id: 'C2', name: 'Cuota 2', amount: 200, balance: 0, dueDate: '15 Mar 2024', status: 'Pagada', payments: [{ id: 'P2', date: '12 Mar 2024', amount: 200, receipt: 'B001-000456' }] },
        { id: 'C3', name: 'Cuota 3', amount: 200, balance: 100, dueDate: '15 Abr 2024', status: 'Parcial', payments: [{ id: 'P3', date: '10 Abr 2024', amount: 100, receipt: 'B001-000501' }] },
        { id: 'C4', name: 'Cuota 4', amount: 200, balance: 200, dueDate: '15 May 2024', status: 'Pendiente', payments: [] },
        { id: 'C5', name: 'Cuota 5', amount: 200, balance: 200, dueDate: '15 Jun 2024', status: 'Pendiente', payments: [] },
        { id: 'C6', name: 'Cuota 6', amount: 200, balance: 200, dueDate: '15 Jul 2024', status: 'Pendiente', payments: [] },
      ]
    },
    { 
      id: 'PLN-003', mat: 'MAT-2024-003', titular: 'Pedro Vega', type: 'Plan 12 Cuotas', total: 2100, balance: 1750, next: '05 Abr 2024', status: 'Atrasado',
      installments: [
        { id: 'C1', name: 'Cuota 1', amount: 175, balance: 0, dueDate: '05 Ene 2024', status: 'Pagada', payments: [{ id: 'P3', date: '04 Ene 2024', amount: 175, receipt: 'F001-000890' }] },
        { id: 'C2', name: 'Cuota 2', amount: 175, balance: 0, dueDate: '05 Feb 2024', status: 'Pagada', payments: [{ id: 'P4', date: '05 Feb 2024', amount: 175, receipt: 'F001-000912' }] },
        { id: 'C3', name: 'Cuota 3', amount: 175, balance: 75, dueDate: '05 Mar 2024', status: 'Parcial', payments: [{ id: 'P5', date: '10 Mar 2024', amount: 100, receipt: 'B001-000501' }] },
        { id: 'C4', name: 'Cuota 4', amount: 175, balance: 175, dueDate: '05 Abr 2024', status: 'Vencida', payments: [] },
      ]
    },
    { 
      id: 'PLN-004', mat: 'MAT-2024-004', titular: 'Ana Silva', type: 'Contado', total: 1000, balance: 0, next: '-', status: 'Al día',
      installments: []
    },
    { 
      id: 'PLN-005', mat: 'MAT-2024-005', titular: 'Carlos Torres', type: 'Contado', total: 1500, balance: 0, next: '-', status: 'Al día',
      installments: []
    },
  ]);

  const [payments, setPayments] = useState<Payment[]>([
    { id: 'PAG-001', date: '24 Mar 2024', student: 'Mateo Ruiz', concept: 'Cuota 1', amount: 250.00, method: 'Transferencia', receipt: 'B001-000123', status: 'Aprobado' },
    { id: 'PAG-002', date: '23 Mar 2024', student: 'Sofia Castro', concept: 'Matrícula', amount: 150.00, method: 'Yape', receipt: 'B001-000124', status: 'Aprobado' },
    { id: 'PAG-003', date: '22 Mar 2024', student: 'Lucas Vega', concept: 'Artículos', amount: 80.00, method: 'Efectivo', receipt: 'B001-000125', status: 'Aprobado' },
  ]);

  const [items, setItems] = useState<Item[]>([
    { 
      id: 'ITM-LIB-K1', 
      name: 'Libro Kids Nivel 1', 
      type: 'Libro', 
      cost: 45.00, 
      status: 'Activo',
      description: 'Libro de nivel 1 para programa Kids',
      unit: 'Unidad',
      isSold: true,
      salePrice: 60.00,
      isDeliveredOnEnrollment: true,
      isPackage: false,
      allowUnpacking: false,
      bookType: 'Individual'
    },
    { 
      id: 'ITM-MAT-01', 
      name: 'Material Lógico Matemático', 
      type: 'Material educativo', 
      cost: 20.00, 
      status: 'Activo',
      description: 'Material para desarrollo lógico',
      unit: 'Unidad',
      isSold: false,
      isDeliveredOnEnrollment: true,
      isPackage: false,
      allowUnpacking: false,
      sessions: 12,
      gymnasticsPerSession: 2,
      trainingsPerSession: 3,
      trainingMode: 'General'
    },
    { 
      id: 'ITM-KIT-BIENV', 
      name: 'Kit Bienvenida (Mochila + Útiles)', 
      type: 'Paquete / kit logístico', 
      cost: 80.00, 
      status: 'Activo',
      description: 'Kit entregado al matricular',
      unit: 'Kit',
      isSold: false,
      isDeliveredOnEnrollment: true,
      isPackage: true,
      allowUnpacking: true,
      composition: [
        { itemId: 'ITM-HER-01', name: 'Mochila Institucional', quantity: 1 },
        { itemId: 'ITM-HER-02', name: 'Cartuchera', quantity: 1 }
      ]
    },
    { 
      id: 'ITM-HER-01', 
      name: 'Mochila Institucional', 
      type: 'Herramienta / adicional', 
      cost: 25.00, 
      status: 'Activo',
      description: 'Mochila con logo ENSIL',
      unit: 'Unidad',
      isSold: true,
      salePrice: 45.00,
      isDeliveredOnEnrollment: true,
      isPackage: false,
      allowUnpacking: false
    },
    { 
      id: 'ITM-HER-02', 
      name: 'Cartuchera', 
      type: 'Herramienta / adicional', 
      cost: 5.00, 
      status: 'Activo',
      description: 'Cartuchera básica',
      unit: 'Unidad',
      isSold: true,
      salePrice: 10.00,
      isDeliveredOnEnrollment: true,
      isPackage: false,
      allowUnpacking: false
    },
  ]);

  const [stockItems, setStockItems] = useState<StockItem[]>([
    { id: 'STK-001', itemId: 'ITM-LIB-K1', branchId: 'FIL-PIU', stock: 150, minStock: 50 },
    { id: 'STK-002', itemId: 'ITM-MAT-01', branchId: 'FIL-PIU', stock: 50, minStock: 30 },
    { id: 'STK-003', itemId: 'ITM-KIT-BIENV', branchId: 'FIL-PIU', stock: 25, minStock: 5 },
    { id: 'STK-004', itemId: 'ITM-HER-01', branchId: 'FIL-PIU', stock: 60, minStock: 10 },
    { id: 'STK-005', itemId: 'ITM-HER-02', branchId: 'FIL-PIU', stock: 40, minStock: 5 },
    { id: 'STK-006', itemId: 'ITM-LIB-K1', branchId: 'FIL-CHI', stock: 85, minStock: 40 },
    { id: 'STK-007', itemId: 'ITM-HER-01', branchId: 'FIL-CHI', stock: 5, minStock: 5 },
    { id: 'STK-008', itemId: 'ITM-MAT-01', branchId: 'FIL-CHI', stock: 15, minStock: 10 },
    { id: 'STK-009', itemId: 'ITM-KIT-BIENV', branchId: 'FIL-CHI', stock: 8, minStock: 3 },
    { id: 'STK-010', itemId: 'ITM-HER-02', branchId: 'FIL-CHI', stock: 10, minStock: 5 },
  ]);

  const [kardex, setKardex] = useState<KardexEntry[]>([
    { id: 'KDX-001', date: '2024-03-15 14:30', branch: 'Piura', material: 'Libro Kids Nivel 1', type: 'Ingreso', qty: 50, prevBalance: 100, newBalance: 150, user: 'Admin', doc: 'COMP-2024-001' },
    { id: 'KDX-002', date: '2024-03-15 10:15', branch: 'Piura', material: 'Libro Kids Nivel 1', type: 'Salida por matrícula', qty: -1, prevBalance: 151, newBalance: 150, user: 'Ventas Piura', doc: 'MAT-2024-001' },
    { id: 'KDX-003', date: '2024-03-14 16:45', branch: 'Piura', material: 'Libro Kids Nivel 1', type: 'Transferencia Salida', qty: -10, prevBalance: 160, newBalance: 150, user: 'Logística Central', doc: 'TRF-2024-001' },
    { id: 'KDX-004', date: '2024-03-10 11:30', branch: 'Chiclayo', material: 'Mochila Institucional', type: 'Transferencia Entrada', qty: 5, prevBalance: 0, newBalance: 5, user: 'Logística Chiclayo', doc: 'TRF-2024-003' },
    { id: 'KDX-005', date: '2024-03-13 11:20', branch: 'Piura', material: 'Material Lógico Matemático', type: 'Ajuste Positivo', qty: 5, prevBalance: 45, newBalance: 50, user: 'Admin', doc: 'AJU-2024-001' },
    { id: 'KDX-006', date: '2024-03-12 15:00', branch: 'Chiclayo', material: 'Libro Kids Nivel 1', type: 'Merma', qty: -2, prevBalance: 87, newBalance: 85, user: 'Logística Chiclayo', doc: 'MER-2024-001' },
  ]);

  const [transfers, setTransfers] = useState<Transfer[]>([
    { 
      id: 'TRF-2024-001', 
      date: '2024-03-15', 
      originId: 'FIL-PIU', 
      destinationId: 'FIL-CHI', 
      status: 'En tránsito', 
      eta: '2024-03-20',
      items: [
        { itemId: 'ITM-LIB-K1', quantity: 10 },
        { itemId: 'ITM-MAT-01', quantity: 5 }
      ], 
      reason: 'Reposición', 
      shippingMethodId: 'SM-001', 
      courierId: 'COUR-001', 
      trackingNumber: 'TRK-123456' 
    },
    { 
      id: 'TRF-2024-002', 
      date: '2024-03-14', 
      originId: 'FIL-CHI', 
      destinationId: 'FIL-PIU', 
      status: 'Borrador', 
      items: [
        { itemId: 'ITM-KIT-BIENV', quantity: 2 }
      ], 
      reason: 'Redistribución', 
      shippingMethodId: 'SM-002', 
      travelerName: 'Juan Pérez' 
    },
    { 
      id: 'TRF-2024-003', 
      date: '2024-03-10', 
      originId: 'FIL-PIU', 
      destinationId: 'FIL-CHI', 
      status: 'Recibida', 
      receptionDate: '2024-03-10',
      receivedBy: 'María Torres',
      items: [
        { itemId: 'ITM-HER-01', quantity: 5 }
      ], 
      reason: 'Apoyo temporal', 
      shippingMethodId: 'SM-003', 
      internalLogisticsObservation: 'Vehículo de la empresa' 
    },
  ]);

  const [shipments, setShipments] = useState<Shipment[]>([
    {
      id: 'ENV-2024-001',
      date: '2024-03-15',
      originId: 'FIL-PIU', // Piura (Almacén Central)
      destinationId: 'FIL-CHI', // Chiclayo
      status: 'En tránsito',
      boxes: [
        {
          id: 'BOX-1',
          boxNumber: 'Caja 1',
          items: [
            { itemId: 'ITM-LIB-K1', quantity: 50 }
          ]
        },
        {
          id: 'BOX-2',
          boxNumber: 'Caja 2',
          items: [
            { itemId: 'ITM-HER-01', quantity: 20 }
          ]
        }
      ],
      items: [
        { itemId: 'ITM-LIB-K1', quantity: 50 },
        { itemId: 'ITM-HER-01', quantity: 20 }
      ],
      shippingMethodId: 'SM-001',
      courierId: 'COUR-001',
      trackingNumber: 'TRK-123456',
      eta: '2024-03-18',
      etaTime: '15:00'
    }
  ]);

  const [couriers, setCouriers] = useState<Courier[]>([
    { id: 'COUR-001', code: 'C-001', name: 'Olva Courier', address: 'Av. Argentina 123', reference: 'Frente al parque', phone: '01-123-4567', status: 'Activo', observations: 'Entrega en 24h' },
    { id: 'COUR-002', code: 'C-002', name: 'Shalom', address: 'Av. Javier Prado 456', reference: 'Cerca al óvalo', phone: '01-987-6543', status: 'Activo', observations: 'Recojo en agencia' },
  ]);

  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([
    { id: 'SM-001', name: 'Courier', status: 'Activo', observations: 'Envío por agencia externa' },
    { id: 'SM-002', name: 'Viajero', status: 'Activo', observations: 'Envío con personal viajero' },
    { id: 'SM-003', name: 'Recojo interno', status: 'Activo', observations: 'Recojo por logística interna' },
    { id: 'SM-004', name: 'Otro', status: 'Activo', observations: 'Otros métodos' },
  ]);

  const [adjustments, setAdjustments] = useState<Adjustment[]>([
    { id: 'AJU-2024-001', date: '2024-03-15', branch: 'Piura', material: 'Material Lógico Matemático', type: 'Ajuste Positivo', qty: 5, reason: 'Diferencia de conteo', user: 'Admin' },
    { id: 'MER-2024-001', date: '2024-03-14', branch: 'Chiclayo', material: 'Libro Kids Nivel 1', type: 'Merma', qty: -2, reason: 'Deterioro', user: 'Logística Chiclayo' },
    { id: 'AJU-2024-002', date: '2024-03-10', branch: 'Piura', material: 'Mochila Institucional', type: 'Ajuste Negativo', qty: -1, reason: 'Error anterior', user: 'Superadmin' },
    { id: 'DEV-2024-001', date: '2024-03-05', branch: 'Piura', material: 'Cartuchera', type: 'Devolución', qty: 1, reason: 'Devolución', user: 'Ventas Piura' },
  ]);

  const [schedules, setSchedules] = useState<Schedule[]>([
    { id: '1', student: 'Mateo Ruiz', program: 'Kids', level: 'Básico 1', type: 'Primera asesoría', date: '2026-04-01', time: '10:00', duration: 45, responsible: 'Lic. María Torres', modality: 'Presencial', status: 'Confirmado' },
    { id: '2', student: 'Sofia Castro', program: 'Teens', level: 'Intermedio', type: 'Seguimiento', date: '2026-04-01', time: '11:00', duration: 30, responsible: 'Lic. Juan Pérez', modality: 'Virtual', status: 'Reservado' },
    { id: '3', student: 'Lucas Vega', program: 'Kids', level: 'Básico 2', type: 'Reprogramación', date: '2026-04-02', time: '15:30', duration: 30, responsible: 'Lic. María Torres', modality: 'Presencial', status: 'Cancelado' },
    { id: '4', student: 'Valentina Silva', program: 'Pre-Kids', level: 'Inicial', type: 'Primera asesoría', date: '2026-04-03', time: '09:00', duration: 45, responsible: 'Lic. Juan Pérez', modality: 'Virtual', status: 'Confirmado' },
    { id: '5', student: 'Diego Torres', program: 'Teens', level: 'Avanzado', type: 'Seguimiento', date: '2026-04-04', time: '16:00', duration: 30, responsible: 'Lic. María Torres', modality: 'Presencial', status: 'Reservado' },
  ]);

  const [counselings, setCounselings] = useState<Counseling[]>([
    { id: '1', student: 'Mateo Ruiz', program: 'Kids', level: 'Básico 1', date: '2026-04-01', time: '10:00', responsible: 'Lic. María Torres', status: 'Pendiente' },
    { id: '2', student: 'Sofia Castro', program: 'Teens', level: 'Intermedio', date: '2026-04-01', time: '11:00', responsible: 'Lic. Juan Pérez', status: 'Pendiente' },
    { id: '3', student: 'Lucas Vega', program: 'Kids', level: 'Básico 2', date: '2026-03-30', time: '15:30', responsible: 'Lic. María Torres', status: 'Reprogramada' },
    { id: '4', student: 'Valentina Silva', program: 'Pre-Kids', level: 'Inicial', date: '2026-04-03', time: '09:00', responsible: 'Lic. Juan Pérez', status: 'Pendiente' },
    { id: '5', student: 'Diego Torres', program: 'Teens', level: 'Avanzado', date: '2026-04-04', time: '16:00', responsible: 'Lic. María Torres', status: 'Pendiente' },
  ]);

  const [trackings, setTrackings] = useState<Tracking[]>([
    { id: '1', studentId: 'ALU-001', date: '2026-03-24', status: 'Asistió', metrics: { modulo: 'Módulo 3', velocidad: 250, comprension: 85 }, observations: 'Buen progreso en lectura rápida.' },
    { id: '2', studentId: 'ALU-001', date: '2026-03-17', status: 'Asistió', metrics: { modulo: 'Módulo 3', velocidad: 220, comprension: 80 }, observations: 'Se recomienda repasar ejercicios de fijación.' },
    { id: '3', studentId: 'ALU-001', date: '2026-03-10', status: 'Faltó', metrics: null, observations: 'Avisó con anticipación por motivos de salud.' },
    { id: '4', studentId: 'ALU-002', date: '2026-03-25', status: 'Asistió', metrics: { modulo: 'Módulo 5', velocidad: 300, comprension: 90 }, observations: 'Excelente comprensión.' },
    { id: '5', studentId: 'ALU-004', date: '2026-03-26', status: 'Asistió', metrics: { nivel: 'Nivel 1', sesion: 'Sesión 2', velocidad: 100, comprension: 70 }, observations: 'Mejorando la pronunciación.' },
  ]);

  const [monthlySchedules, setMonthlySchedules] = useState<MonthlySchedule[]>([
    {
      id: '1',
      sede: 'Piura',
      mes: 'Abril',
      anio: 2026,
      titulo: 'Cronograma de Actividades - Abril 2026',
      actividades: [
        { id: 'a1', actividad: 'Evaluación de Campo Visual', fecha: '2026-04-05', hora: '09:00 - 13:00', responsable: 'Lic. María Torres', orden: 1 },
        { id: 'a2', actividad: 'Taller de Ortografía', fecha: '2026-04-12', hora: '15:00 - 17:00', responsable: 'Lic. Juan Pérez', orden: 2 },
        { id: 'a3', actividad: 'Maratón de Lectura', fecha: '2026-04-20', hora: '10:00 - 12:00', responsable: 'Equipo Psicopedagogía', orden: 3 },
      ],
      observaciones: 'Mes con enfoque en comprensión lectora.'
    },
    {
      id: '2',
      sede: 'Chiclayo',
      mes: 'Abril',
      anio: 2026,
      titulo: 'Actividades Psicopedagógicas Chiclayo',
      actividades: [
        { id: 'b1', actividad: 'Taller para Padres', fecha: '2026-04-08', hora: '18:00 - 19:30', responsable: 'Lic. Ana Gómez', orden: 1 },
        { id: 'b2', actividad: 'Evaluación de Avance', fecha: '2026-04-25', hora: 'Todo el día', responsable: '', orden: 2 },
      ],
      observaciones: ''
    }
  ]);

  const [isEnrollmentWizardOpen, setIsEnrollmentWizardOpen] = useState(false);

  const [currentBranchId, setCurrentBranchId] = useState<string>('all');
  const [currentUser] = useState({
    id: 'USR-001',
    name: 'Superadmin',
    role: 'Superusuario',
    branchId: 'all'
  });

  const [incidents, setIncidents] = useState<ReceptionIncident[]>([]);

  const [notifications, setNotifications] = useState<Notification[]>([
    { id: '1', title: 'Bienvenido', message: 'Bienvenido al sistema ENSIL', type: 'info', date: new Date().toISOString(), read: false }
  ]);

  const addNotification = (notif: Omit<Notification, 'id' | 'date' | 'read'>) => {
    const newNotif: Notification = {
      ...notif,
      id: `NOT-${Date.now()}`,
      date: new Date().toISOString(),
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const confirmReception = (data: {
    docId: string;
    docType: 'Envío' | 'Transferencia';
    receivedItems: { itemId: string; quantity: number; status: 'ok' | 'missing' | 'damaged' | 'extra'; observation?: string }[];
    generalObservation?: string;
  }) => {
    const { docId, docType, receivedItems, generalObservation } = data;
    
    // 1. Find the document
    let doc: Shipment | Transfer | undefined;
    if (docType === 'Envío') {
      doc = shipments.find(s => s.id === docId);
    } else {
      doc = transfers.find(t => t.id === docId);
    }

    if (!doc) return;

    // 2. Determine final status
    const hasDifferences = receivedItems.some(ri => ri.status !== 'ok' || ri.quantity !== (doc?.items.find(i => i.itemId === ri.itemId)?.quantity || 0));
    const finalStatus = hasDifferences ? (docType === 'Envío' ? 'Recibido con diferencias' : 'Recibida con diferencias') : (docType === 'Envío' ? 'Recibido' : 'Recibida');

    // 3. Update document status
    const receptionData = {
      status: finalStatus as any,
      receptionObservation: generalObservation,
      receptionDate: new Date().toISOString(),
      receivedBy: currentUser.name
    };

    if (docType === 'Envío') {
      setShipments(prev => prev.map(s => s.id === docId ? { ...s, ...receptionData } : s));
    } else {
      setTransfers(prev => prev.map(t => t.id === docId ? { ...t, ...receptionData } : t));
    }

    // 4. Update Stock, Kardex and Incidents
    receivedItems.forEach(ri => {
      // Add incident if not ok
      if (ri.status !== 'ok') {
        const newIncident: ReceptionIncident = {
          id: `INC-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          docId,
          docType,
          itemId: ri.itemId,
          type: ri.status as any,
          quantity: ri.status === 'missing' ? (doc?.items.find(i => i.itemId === ri.itemId)?.quantity || 0) - ri.quantity : ri.quantity,
          observation: ri.observation || '',
          date: new Date().toISOString(),
          branchId: doc?.destinationId || ''
        };
        setIncidents(prev => [...prev, newIncident]);
      }

      if (ri.quantity > 0) {
        // Deduct from Origin (According to new rule, deduccion of stock happens AT reception)
        updateStock(
          doc?.originId || '',
          ri.itemId,
          -ri.quantity,
          docType === 'Envío' ? 'Transferencia Salida' : 'Transferencia Salida',
          `Despacho diferido por recepción de ${docType} ${docId}.`,
          docId
        );

        // Add to Destination
        updateStock(
          doc?.destinationId || '',
          ri.itemId,
          ri.quantity,
          docType === 'Envío' ? 'Ingreso' : 'Transferencia Entrada',
          `Recepción de ${docType} ${docId}. Estado: ${ri.status}. ${ri.observation || ''}`,
          docId
        );
      }
    });

    // 5. Send Notification
    addNotification({
      title: hasDifferences ? 'Recepción con diferencias' : 'Recepción confirmada',
      message: `El ${docType} ${docId} ha sido recibido en ${branches.find(b => b.id === doc?.destinationId)?.name}. Estado: ${finalStatus}`,
      type: hasDifferences ? 'warning' : 'success',
      branchId: docType === 'Envío' ? 'all' : doc.originId // Notify central or origin branch
    });
  };

  const [staff, setStaff] = useState<Staff[]>([
    { id: '1', code: '000001', docType: 'DNI', docNumber: '12345678', names: 'Juan', lastNameP: 'Pérez', lastNameM: 'García', birthDate: '1985-05-15', age: 38, gender: 'Masculino', civilStatus: 'Casado', hasChildren: true, childrenCount: 2, educationLevel: 'Universitario', profession: 'Psicólogo', specialty: 'Psicopedagogía', phone: '987654321', institutionalEmail: 'juan.perez@ensil.com', personalEmail: 'juan.perez.personal@gmail.com', address: 'Av. Larco 123, Miraflores', status: 'Activo', observations: 'Docente principal' },
    { id: '2', code: '000002', docType: 'DNI', docNumber: '87654321', names: 'María', lastNameP: 'Torres', lastNameM: 'López', birthDate: '1990-08-20', age: 33, gender: 'Femenino', civilStatus: 'Soltera', hasChildren: false, childrenCount: 0, educationLevel: 'Técnico', profession: 'Administradora', specialty: 'Gestión Educativa', phone: '912345678', institutionalEmail: 'maria.torres@ensil.com', personalEmail: 'maria.torres.personal@gmail.com', address: 'Calle Lima 456, San Isidro', status: 'Activo', observations: 'Coordinadora de filial' },
  ]);

  const [contracts, setContracts] = useState<Contract[]>([
    { id: 'CON-001', staffId: '1', type: 'Indeterminado', startDate: '2023-01-01', status: 'Vigente', shift: 'Full time', pensionSystem: 'AFP', pensionFund: 'Integra', grossSalary: 3500, contribution: 450, netSalary: 3050, observations: 'Contrato inicial' },
    { id: 'CON-002', staffId: '2', type: 'Plazo Fijo', startDate: '2023-06-01', endDate: '2024-06-01', status: 'Vigente', shift: 'Full time', pensionSystem: 'ONP', grossSalary: 2800, contribution: 364, netSalary: 2436, observations: 'Renovación anual' },
  ]);

  const [assignments, setAssignments] = useState<Assignment[]>([
    { id: 'ASG-001', staffId: '1', branch: 'Piura', area: 'Psicopedagogía', role: 'Psicólogo Senior', systemRole: 'Psicopedagogía', startDate: '2023-01-01', isMain: true, status: 'Activa' },
    { id: 'ASG-002', staffId: '2', branch: 'Chiclayo', area: 'Administración', role: 'Coordinadora', systemRole: 'Administración', startDate: '2023-06-01', isMain: true, status: 'Activa' },
  ]);

  const [companies, setCompanies] = useState<Company[]>([
    { id: '1', ruc: '20123456789', name: 'Educación y Cultura S.A.C.', commercialName: 'ENSIL Central', status: 'Activo' },
    { id: '2', ruc: '20987654321', name: 'Instituto de Idiomas del Norte S.A.', commercialName: 'ENSIL Norte', status: 'Activo' },
  ]);

  const [branches, setBranches] = useState<Branch[]>([
    { 
      id: 'FIL-PIU', 
      name: 'Piura', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Av. Sullana #280', 
      reference: 'Frente al Museo Vicus (Almacén Central)',
      department: 'Piura',
      province: 'Piura',
      district: 'Piura',
      phoneFixed: '073-617445',
      phoneMobile: '933732053'
    },
    { 
      id: 'FIL-CHI', 
      name: 'Chiclayo', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Calle Andalucía #150 Urb. San Juan', 
      reference: 'Altura del Hotel Tumbas Reales',
      department: 'Lambayeque',
      province: 'Chiclayo',
      district: 'Chiclayo',
      phoneFixed: '074-525632',
      phoneMobile: '905464734'
    },
    { 
      id: 'FIL-CAJ', 
      name: 'Cajamarca', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Jr. Guadalupe #466', 
      reference: 'Huánuco y Silva Santiesteban',
      department: 'Cajamarca',
      province: 'Cajamarca',
      district: 'Cajamarca',
      phoneFixed: '076-772573',
      phoneMobile: '933722476'
    },
    { 
      id: 'FIL-LOL', 
      name: 'Los Olivos', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Jr. Carlos Monge #233', 
      reference: 'Espalda cdra. 4 Av. Izaguirre',
      department: 'Lima',
      province: 'Lima',
      district: 'Los Olivos',
      phoneFixed: '01-7504687',
      phoneMobile: '960508686'
    },
    { 
      id: 'FIL-SIS', 
      name: 'San Isidro', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Calle Francisco de Zela #2575', 
      reference: '1/2 cdra. del Touring',
      department: 'Lima',
      province: 'Lima',
      district: 'San Isidro',
      phoneMobile: '960508686'
    },
    { 
      id: 'FIL-HUA', 
      name: 'Huancayo', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Jr. Arequipa #218', 
      reference: 'Complejo Salesiano Sta. Rosa',
      department: 'Junín',
      province: 'Huancayo',
      district: 'El Tambo',
      phoneFixed: '064-419923',
      phoneMobile: '992195898'
    },
    { 
      id: 'FIL-PUN', 
      name: 'Puno', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Jr. Moquegua #422 (2° piso)', 
      reference: 'Frente al Restaurant Tamis',
      department: 'Puno',
      province: 'Puno',
      district: 'Puno',
      phoneFixed: '051-352969',
      phoneMobile: '961274101'
    },
    { 
      id: 'FIL-JUL', 
      name: 'Juliaca', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Jr. Bolívar #329', 
      reference: 'Costado del Mía Market',
      department: 'Puno',
      province: 'San Román',
      district: 'Juliaca',
      phoneMobile: '913632393'
    },
    { 
      id: 'FIL-TAC', 
      name: 'Tacna', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Av. Cusco #485', 
      reference: 'Frente a Mueblería Rony',
      department: 'Tacna',
      province: 'Tacna',
      district: 'Tacna',
      phoneFixed: '052-638377',
      phoneMobile: '933746179'
    },
  ]);

  const [roles, setRoles] = useState<Role[]>([
    { id: 'ROL-001', name: 'Administrador Global', desc: 'Acceso total al sistema y configuraciones', users: 3, status: 'Activo' },
    { id: 'ROL-002', name: 'Director Académico', desc: 'Gestión de programas, docentes y alumnos', users: 5, status: 'Activo' },
    { id: 'ROL-003', name: 'Coordinador de Ventas', desc: 'Gestión de matrículas, prospectos y caja', users: 12, status: 'Activo' },
    { id: 'ROL-004', name: 'Docente', desc: 'Acceso a sus cursos, asistencia y notas', users: 45, status: 'Activo' },
    { id: 'ROL-005', name: 'Cajero', desc: 'Gestión de caja y pagos', users: 8, status: 'Activo' },
  ]);

  const [users, setUsers] = useState<User[]>([
    { id: 'USR-001', name: 'Admin Sistema', email: 'admin@ensil.edu.pe', role: 'Administrador Global', branch: 'Todas', lastAccess: 'Hace 5 min', status: 'Activo' },
    { id: 'USR-002', name: 'Laura Martínez', email: 'lmartinez@ensil.edu.pe', role: 'Director Académico', branch: 'Piura', lastAccess: 'Ayer 14:30', status: 'Activo' },
    { id: 'USR-003', name: 'Jorge Torres', email: 'jtorres@ensil.edu.pe', role: 'Coordinador de Ventas', branch: 'Chiclayo', lastAccess: 'Hace 2 días', status: 'Inactivo' },
  ]);

  const [permissions, setPermissions] = useState<Permission[]>([
    { roleId: 'ROL-002', permissions: ['org-usuarios:view', 'op-matriculas:view', 'op-matriculas:create', 'op-caja:view'] }
  ]);

  const [leadSources, setLeadSources] = useState<LeadSource[]>([
    { id: '1', name: 'Facebook Ads', status: 'active' },
    { id: '2', name: 'Orgánico', status: 'active' },
    { id: '3', name: 'Referido', status: 'active' },
    { id: '4', name: 'Instagram', status: 'active' },
    { id: '5', name: 'WhatsApp', status: 'active' },
  ]);

  const [programs, setPrograms] = useState<Program[]>([
    { id: '1', code: 'PRG-KIDS', name: 'Kids', hasLevels: true, durationBase: 3, warranty: 3, allBranches: true, status: 'Activo' },
    { id: '2', code: 'PRG-PK', name: 'Pre-Kids', hasLevels: true, durationBase: 3, warranty: 3, allBranches: true, status: 'Activo' },
    { id: '3', code: 'PRG-PL', name: 'Pre-lectura', hasLevels: false, durationBase: 3, warranty: 3, allBranches: false, enabledBranches: ['FIL-PIU', 'FIL-CHI'], status: 'Activo' },
    { id: '4', code: 'PRG-ESP', name: 'Especialización', hasLevels: false, durationBase: 6, warranty: 6, allBranches: true, status: 'Activo' },
  ]);

  const [levels, setLevels] = useState<Level[]>([
    { id: '1', programId: '1', code: 'NVL-KIDS-1', name: 'Nivel 1', order: 1, status: 'Activo' },
    { id: '2', programId: '1', code: 'NVL-KIDS-2', name: 'Nivel 2', order: 2, status: 'Activo' },
    { id: '3', programId: '1', code: 'NVL-KIDS-3', name: 'Nivel 3', order: 3, status: 'Activo' },
    { id: '4', programId: '2', code: 'NVL-PK-1', name: 'Nivel 1', order: 1, status: 'Activo' },
  ]);

  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([
    { id: '1', code: 'TP-CONT', name: 'Contado', installments: 1, termDays: 0, allowPartial: false, applicablePrograms: ['1', '2', '3', '4'], status: 'Activo' },
    { id: '2', code: 'TP-C2P', name: 'Contado en 2 partes', installments: 2, termDays: 30, allowPartial: true, maxPartials: 2, applicablePrograms: ['1', '2'], status: 'Activo' },
    { id: '3', code: 'TP-P3', name: 'Plan 3', installments: 3, termDays: 30, allowPartial: true, maxPartials: 2, applicablePrograms: ['1', '2'], status: 'Activo' },
    { id: '4', code: 'TP-P6', name: 'Plan 6', installments: 6, termDays: 30, allowPartial: true, maxPartials: 2, applicablePrograms: ['1', '2'], status: 'Activo' },
  ]);

  const [tariffs, setTariffs] = useState<Tariff[]>([
    { 
      id: '1', name: 'Kids - Contado 2024', programId: '1', paymentTypeId: '1', branchId: 'all', currency: 'PEN', basePrice: 1200, 
      includesEnrollment: true, includesMaterials: true, 
      installments: [
        { number: 1, concept: 'Cuota Única', amount: 1200, dueDays: 0 }
      ], 
      startDate: '2024-01-01', endDate: '2024-12-31', status: 'Activo' 
    },
    { 
      id: '2', name: 'Kids - Plan 6 2024', programId: '1', paymentTypeId: '4', branchId: 'all', currency: 'PEN', basePrice: 1500, 
      includesEnrollment: true, includesMaterials: true, 
      installments: [
        { number: 1, concept: 'Cuota 1', amount: 250, dueDays: 0 },
        { number: 2, concept: 'Cuota 2', amount: 250, dueDays: 30 },
        { number: 3, concept: 'Cuota 3', amount: 250, dueDays: 60 },
        { number: 4, concept: 'Cuota 4', amount: 250, dueDays: 90 },
        { number: 5, concept: 'Cuota 5', amount: 250, dueDays: 120 },
        { number: 6, concept: 'Cuota 6', amount: 250, dueDays: 150 },
      ], 
      startDate: '2024-01-01', endDate: '2024-12-31', status: 'Activo' 
    },
    { 
      id: '3', name: 'Pre-Kids - Contado', programId: '2', paymentTypeId: '1', branchId: 'FIL-001', currency: 'PEN', basePrice: 800, 
      includesEnrollment: true, includesMaterials: true, 
      installments: [
        { number: 1, concept: 'Cuota Única', amount: 800, dueDays: 0 }
      ], 
      startDate: '2024-01-01', status: 'Activo' 
    },
    { 
      id: '4', name: 'Pre-lectura - Plan 3', programId: '3', paymentTypeId: '3', branchId: 'FIL-001', currency: 'PEN', basePrice: 900, 
      includesEnrollment: false, enrollmentValue: 100,
      includesMaterials: false, materialsValue: 150,
      installments: [
        { number: 1, concept: 'Cuota 1', amount: 300, dueDays: 0 },
        { number: 2, concept: 'Cuota 2', amount: 300, dueDays: 30 },
        { number: 3, concept: 'Cuota 3', amount: 300, dueDays: 60 }
      ], 
      startDate: '2024-01-01', status: 'Activo' 
    },
  ]);

  const [promotions, setPromotions] = useState<Promotion[]>([
    {
      id: '1',
      code: 'PROMO-2KIDS',
      name: '2 Kids por 700',
      type: 'Grupal',
      requiredStudents: 2,
      composition: [
        { programId: '1', quantity: 2 }
      ],
      paymentTypeIds: ['1'], // Contado
      totalPrice: 700,
      currency: 'PEN',
      internalDistributionRule: 'Igualitario',
      branchIds: [],
      applyToAllBranches: true,
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      status: 'Activo'
    },
    {
      id: '2',
      code: 'PROMO-2PK',
      name: '2 Pre-Kids por 700',
      type: 'Grupal',
      requiredStudents: 2,
      composition: [
        { programId: '2', quantity: 2 }
      ],
      paymentTypeIds: ['1'], // Contado
      totalPrice: 700,
      currency: 'PEN',
      internalDistributionRule: 'Igualitario',
      branchIds: [],
      applyToAllBranches: true,
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      status: 'Activo'
    },
    {
      id: '3',
      code: 'PROMO-MIX',
      name: '1 Kids + 1 Pre-Kids por 700',
      type: 'Grupal',
      requiredStudents: 2,
      composition: [
        { programId: '1', quantity: 1 },
        { programId: '2', quantity: 1 }
      ],
      paymentTypeIds: ['1'], // Contado
      totalPrice: 700,
      currency: 'PEN',
      internalDistributionRule: 'Igualitario',
      branchIds: [],
      applyToAllBranches: true,
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      status: 'Activo'
    }
  ]);

  const [recipes, setRecipes] = useState<Recipe[]>([
    {
      id: 'REC-001',
      name: 'Pack Kids Nivel 1 2024',
      programId: '1',
      levelId: '1',
      branchIds: [],
      applyToAllBranches: true,
      status: 'Activo',
      items: [
        { itemId: 'ITM-LIB-K1', quantity: 1 },
        { itemId: 'ITM-KIT-BIENV', quantity: 1 }
      ],
      startDate: '2024-01-01',
      endDate: '2024-12-31'
    },
    {
      id: 'REC-002',
      name: 'Pack Kids Nivel 2 2024',
      programId: '1',
      levelId: '2',
      branchIds: [],
      applyToAllBranches: true,
      status: 'Activo',
      items: [
        { itemId: 'ITM-LIB-K1', quantity: 1 },
        { itemId: 'ITM-MAT-01', quantity: 1 }
      ],
      startDate: '2024-01-01',
      endDate: '2024-12-31'
    }
  ]);

  const addLeadSource = (name: string) => {
    const newSource: LeadSource = {
      id: Date.now().toString(),
      name,
      status: 'active'
    };
    setLeadSources(prev => [...prev, newSource]);
  };

  const updateLeadSource = (id: string, name: string, status: 'active' | 'inactive') => {
    setLeadSources(prev => prev.map(s => s.id === id ? { ...s, name, status } : s));
  };

  const deleteLeadSource = (id: string) => {
    setLeadSources(prev => prev.filter(s => s.id !== id));
  };

  const updateEnrollmentVerification = (enrollmentId: string, data: {
    status: Enrollment['verificationStatus'];
    items: string[];
    observation?: string;
    date: string;
    verifier: string;
  }) => {
    setEnrollments(prev => prev.map(e => {
      if (e.id === enrollmentId) {
        return {
          ...e,
          verificationStatus: data.status,
          verifiedItems: data.items,
          verificationObservation: data.observation,
          verificationDate: data.date,
          verifier: data.verifier
        };
      }
      return e;
    }));
  };

  const updateStock = (branchId: string, itemId: string, qty: number, type: KardexEntry['type'], observation: string, doc?: string) => {
    setStockItems(prevStock => {
      const existingStockIndex = prevStock.findIndex(s => s.branchId === branchId && s.itemId === itemId);
      let newStockList = [...prevStock];
      
      const item = items.find(i => i.id === itemId);
      const branch = branches.find(b => b.id === branchId);
      const user = currentUser.name;

      if (existingStockIndex >= 0) {
        const currentStock = { ...newStockList[existingStockIndex] };
        const newQty = currentStock.stock + qty;
        
        const newKardexEntry: KardexEntry = {
          id: `KDX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: new Date().toISOString().replace('T', ' ').slice(0, 16),
          branch: branch?.name || branchId,
          material: item?.name || itemId,
          type,
          qty,
          prevBalance: currentStock.stock,
          newBalance: newQty,
          user,
          doc: doc || 'S/N',
          observation
        };
        setKardex(prevK => [newKardexEntry, ...prevK]);

        currentStock.stock = newQty;
        newStockList[existingStockIndex] = currentStock;
      } else {
        const newStockId = `STK-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const newStock: StockItem = {
          id: newStockId,
          itemId,
          branchId,
          stock: qty,
          minStock: 0
        };
        
        const newKardexEntry: KardexEntry = {
          id: `KDX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: new Date().toISOString().replace('T', ' ').slice(0, 16),
          branch: branch?.name || branchId,
          material: item?.name || itemId,
          type,
          qty,
          prevBalance: 0,
          newBalance: qty,
          user,
          doc: doc || 'S/N',
          observation
        };
        setKardex(prevK => [newKardexEntry, ...prevK]);
        
        newStockList.push(newStock);
      }
      return newStockList;
    });
  };

  const addAdjustment = (adjData: Omit<Adjustment, 'id' | 'date' | 'user'>, stockId: string) => {
    const stock = stockItems.find(s => s.id === stockId);
    if (!stock) return;

    const newAdjustment: Adjustment = {
      ...adjData,
      id: `ADJ-${Date.now()}`,
      date: new Date().toISOString().replace('T', ' ').slice(0, 16),
      user: currentUser.name
    };

    setAdjustments(prev => [newAdjustment, ...prev]);
    updateStock(stock.branchId, stock.itemId, adjData.qty, adjData.type, adjData.reason, newAdjustment.id);
  };

  const updateMinStock = (stockId: string, minStock: number) => {
    setStockItems(prev => prev.map(s => {
      if (s.id === stockId) {
        return { ...s, minStock };
      }
      return s;
    }));
  };

  const addTransfer = (transfer: Omit<Transfer, 'id'>) => {
    const newTransfer = {
      ...transfer,
      id: `TRF-${new Date().getFullYear()}-${String(transfers.length + 1).padStart(3, '0')}`
    } as Transfer;
    setTransfers(prev => [newTransfer, ...prev]);
  };

  const updateTransferStatus = (transferId: string, newStatus: Transfer['status']) => {
    const transfer = transfers.find(t => t.id === transferId);
    if (!transfer) return;

    // Logic for stock deduction when dispatching
    if (newStatus === 'En tránsito' && (transfer.status === 'Aprobada' || transfer.status === 'Solicitada')) {
      // Deduct stock from origin
      transfer.items.forEach(item => {
        updateStock(transfer.originId, item.itemId, -item.quantity, 'Transferencia Salida', `Despacho TRF: ${transfer.id}`, transfer.id);
      });
      
      // Send notification to destination
      addNotification({
        title: 'Transferencia en tránsito',
        message: `La transferencia ${transfer.id} desde ${branches.find(b => b.id === transfer.originId)?.name} está en tránsito.`,
        type: 'info',
        branchId: transfer.destinationId
      });
    }

    // Logic for stock reversal when canceling
    if (newStatus === 'Cancelada' && (transfer.status === 'En tránsito' || transfer.status === 'Listo para recepción')) {
      transfer.items.forEach(item => {
        updateStock(transfer.originId, item.itemId, item.quantity, 'Ingreso', `Cancelación TRF: ${transfer.id}`, transfer.id);
      });
    }

    setTransfers(prev => prev.map(t => t.id === transferId ? { ...t, status: newStatus } : t));
  };

  const updateTransfer = (transferId: string, updatedData: Partial<Transfer>) => {
    setTransfers(prev => prev.map(t => t.id === transferId ? { ...t, ...updatedData } : t));
  };

  const unpackPackage = (stockId: string) => {
    const stock = stockItems.find(s => s.id === stockId);
    if (!stock) return;

    const item = items.find(i => i.id === stock.itemId);
    if (!item || !item.isPackage || !item.composition) return;

    // 1. Restar 1 del paquete
    updateStock(stock.branchId, stock.itemId, -1, 'Desempaquetado', `Desempaquetado de ${item.name}`, 'DESEMP-001');

    // 2. Sumar componentes
    item.composition.forEach(comp => {
      updateStock(stock.branchId, comp.itemId, comp.quantity, 'Desempaquetado', `Componente de ${item.name}`, 'DESEMP-001');
    });
  };

  const packPackage = (stockId: string) => {
    const stock = stockItems.find(s => s.id === stockId);
    if (!stock) return;

    const item = items.find(i => i.id === stock.itemId);
    if (!item || !item.isPackage || !item.composition) return;

    // 1. Verificar si hay stock de todos los componentes
    const canPack = item.composition.every(comp => {
      const compStock = stockItems.find(s => s.itemId === comp.itemId && s.branchId === stock.branchId);
      return compStock && compStock.stock >= comp.quantity;
    });

    if (!canPack) {
      alert('No hay stock suficiente de todos los componentes para empaquetar.');
      return;
    }

    // 2. Restar componentes
    item.composition.forEach(comp => {
      updateStock(stock.branchId, comp.itemId, -comp.quantity, 'Empaquetado', `Componente para ${item.name}`, 'EMP-001');
    });

    // 3. Sumar 1 al paquete
    updateStock(stock.branchId, stock.itemId, 1, 'Empaquetado', `Empaquetado de ${item.name}`, 'EMP-001');
  };

  const registerPayment = (planId: string, installmentId: string, paymentData: any) => {
    setPlans(prevPlans => prevPlans.map(plan => {
      if (plan.id === planId) {
        let planBalanceReduction = 0;
        const updatedInstallments = plan.installments.map(inst => {
          if (inst.id === installmentId) {
            const newPayment = {
              id: `P-${Date.now()}`,
              date: paymentData.date,
              amount: paymentData.amount,
              receipt: paymentData.receipt
            };
            const newBalance = Math.max(0, inst.balance - paymentData.amount);
            planBalanceReduction = inst.balance - newBalance;
            
            return {
              ...inst,
              balance: newBalance,
              status: newBalance === 0 ? 'Pagada' : 'Parcial',
              payments: [...inst.payments, newPayment]
            };
          }
          return inst;
        });

        const newPlanBalance = Math.max(0, plan.balance - planBalanceReduction);
        return {
          ...plan,
          balance: newPlanBalance,
          status: newPlanBalance === 0 ? 'Completado' : plan.status,
          installments: updatedInstallments
        };
      }
      return plan;
    }));

    // Add to global payments
    const newPayment: Payment = {
      id: `PAG-${Date.now().toString().slice(-4)}`,
      date: paymentData.date,
      student: 'Alumno', // Ideally find student name from plan
      concept: `Pago de Cuota`,
      amount: paymentData.amount,
      method: paymentData.method,
      receipt: paymentData.receipt,
      status: 'Aprobado'
    };
    setPayments(prev => [newPayment, ...prev]);
  };

  const refinanceInstallment = (planId: string, installmentId: string, refinanceData: any) => {
    setPlans(prevPlans => prevPlans.map(plan => {
      if (plan.id === planId) {
        const updatedInstallments = plan.installments.map(inst => {
          if (inst.id === installmentId) {
            return {
              ...inst,
              status: 'Refinanciada'
            };
          }
          return inst;
        });

        // Add new installment
        const newInstallment = {
          id: `C-${Date.now()}`,
          name: refinanceData.name,
          amount: refinanceData.amount,
          balance: refinanceData.amount,
          dueDate: refinanceData.dueDate,
          status: 'Pendiente',
          payments: []
        };

        return {
          ...plan,
          installments: [...updatedInstallments, newInstallment],
          balance: plan.balance + refinanceData.amount // Assuming the old balance is kept or adjusted, let's just add the new amount for simplicity, or maybe the old installment's balance should be subtracted.
        };
      }
      return plan;
    }));
  };

  const addStaff = (staffData: Omit<Staff, 'id'>) => {
    const newStaff = {
      ...staffData,
      id: `STF-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
    };
    setStaff(prev => [...prev, newStaff]);
  };

  const updateStaff = (id: string, staffData: Partial<Staff>) => {
    setStaff(prev => prev.map(s => s.id === id ? { ...s, ...staffData } : s));
  };

  const deleteStaff = (id: string) => {
    setStaff(prev => prev.filter(s => s.id !== id));
  };

  const addStudent = (studentData: Omit<Student, 'id'>) => {
    const newStudent = {
      ...studentData,
      id: `ALU-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
    };
    setStudents(prev => [...prev, newStudent]);
  };

  const updateStudent = (id: string, studentData: Partial<Student>) => {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, ...studentData } : s));
  };

  const deleteStudent = (id: string) => {
    setStudents(prev => prev.filter(s => s.id !== id));
  };

  const addGuardian = (guardianData: Omit<Guardian, 'id'>) => {
    const newGuardian = {
      ...guardianData,
      id: (guardians.length + 1).toString(),
      students: 0,
      enrollments: 0,
      balance: '$0',
    };
    setGuardians(prev => [...prev, newGuardian]);
  };

  const updateGuardian = (id: string, guardianData: Partial<Guardian>) => {
    setGuardians(prev => prev.map(g => g.id === id ? { ...g, ...guardianData } : g));
  };

  const deleteGuardian = (id: string) => {
    setGuardians(prev => prev.filter(g => g.id !== id));
  };

  const addEnrollmentFlow = (data: any) => {
    const { context, titulares, students: studentsList, programDetails, payment } = data;
    
    // Handle old structure if necessary (though we should migrate)
    const finalTitulares = titulares || [data.titular];
    const finalStudents = studentsList || [data.student];
    const finalContext = context || data.contexto;
    const finalProgram = programDetails || { program: data.student?.programa, level: data.student?.nivel };
    const finalPayment = payment || data.payment;
    const finalPlan = data.plan || { tipo: payment?.plan, total: payment?.total, cuotas: payment?.cuotas };

    // 1. Register Guardians (Titulares)
    finalTitulares.forEach((t: any) => {
      if (!guardians.find(g => g.doc === t.doc || g.doc === t.documento)) {
        addGuardian({
          name: t.names ? `${t.names} ${t.lastNameP} ${t.lastNameM}` : t.nombres,
          doc: t.doc || t.documento,
          phone: t.phone || t.telefono,
          email: t.email,
          parentesco: t.parentesco,
          direccion: t.address || t.direccion,
          students: finalStudents.length,
          enrollments: finalStudents.length,
          balance: '$0'
        });
      }
    });

    // 2. Register Students and Enrollments
    finalStudents.forEach((s: any) => {
      const studentId = `ALU-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      const enrollmentId = `MAT-2024-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      const planId = `PLN-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      const studentName = s.names ? `${s.names} ${s.lastNameP} ${s.lastNameM}` : s.nombres;
      const titularName = finalTitulares[0].names ? `${finalTitulares[0].names} ${finalTitulares[0].lastNameP}` : finalTitulares[0].nombres;

      const newStudent: Student = {
        id: studentId,
        doc: s.doc || s.documento || 'S/D',
        name: studentName,
        age: parseInt(s.age || s.edad) || 0,
        grado: s.grado,
        colegio: s.colegio,
        program: finalProgram.program || `${s.programa} - ${s.nivel}`,
        horario: s.horario || finalProgram.horario,
        fechaInicio: s.fechaInicio || finalProgram.fechaInicio,
        titular: titularName,
        status: 'Activo'
      };

      const newEnrollment: Enrollment = {
        id: enrollmentId,
        date: new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }),
        student: studentName,
        program: finalProgram.program || s.programa,
        level: finalProgram.level || s.nivel,
        sede: finalContext.sede,
        asesor: finalContext.asesor,
        origen: finalContext.origen,
        status: 'Activa',
        plan: finalPlan.tipo === 'contado' ? 'Al día' : 'Al día'
      };

      const newPlan: Plan = {
        id: planId,
        mat: enrollmentId,
        titular: titularName,
        type: finalPlan.tipo === 'contado' ? 'Contado' : `Plan ${finalPlan.cuotas} Cuotas`,
        total: finalPlan.total,
        balance: finalPlan.tipo === 'contado' ? 0 : (finalPlan.total - (finalPayment ? finalPayment.monto : 0)),
        next: finalPlan.tipo === 'contado' ? '-' : 'Próximo mes',
        status: 'Al día',
        installments: finalPlan.tipo === 'contado' ? [] : Array.from({ length: finalPlan.cuotas }).map((_, i) => ({
          id: `C${i+1}`,
          name: `Cuota ${i+1}`,
          amount: (finalPlan.total - (finalPayment ? finalPayment.monto : 0)) / finalPlan.cuotas,
          balance: (finalPlan.total - (finalPayment ? finalPayment.monto : 0)) / finalPlan.cuotas,
          dueDate: `Mes ${i+1}`,
          status: 'Pendiente',
          payments: []
        }))
      };

      setStudents(prev => [...prev, newStudent]);
      setEnrollments(prev => [...prev, newEnrollment]);
      setPlans(prev => [...prev, newPlan]);

      // Add Initial Payment if exists
      if (finalPayment && finalPayment.monto > 0) {
        const newPayment: Payment = {
          id: `PAG-${Date.now().toString().slice(-4)}`,
          date: new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }),
          student: studentName,
          concept: finalPlan.tipo === 'contado' ? 'Pago Total' : 'Pago Inicial',
          amount: finalPayment.monto,
          method: finalPayment.metodo,
          receipt: `B001-${Date.now().toString().slice(-6)}`,
          status: 'Aprobado'
        };
        setPayments(prev => [newPayment, ...prev]);
      }
    });
  };

  const addTracking = (trackingData: Omit<Tracking, 'id'>) => {
    const newTracking: Tracking = {
      ...trackingData,
      id: `TRK-${Date.now().toString().slice(-4)}`
    };
    setTrackings(prev => [newTracking, ...prev]);
  };

  const addProgram = (programData: Omit<Program, 'id'>) => {
    const newProgram = {
      ...programData,
      id: Date.now().toString(),
    };
    setPrograms(prev => [...prev, newProgram]);
  };

  const updateProgram = (id: string, programData: Partial<Program>) => {
    setPrograms(prev => prev.map(p => p.id === id ? { ...p, ...programData } : p));
  };

  const deleteProgram = (id: string) => {
    setPrograms(prev => prev.filter(p => p.id !== id));
  };

  const addLevel = (levelData: Omit<Level, 'id'>) => {
    const newLevel = {
      ...levelData,
      id: Date.now().toString(),
    };
    setLevels(prev => [...prev, newLevel]);
  };

  const updateLevel = (id: string, levelData: Partial<Level>) => {
    setLevels(prev => prev.map(l => l.id === id ? { ...l, ...levelData } : l));
  };

  const deleteLevel = (id: string) => {
    setLevels(prev => prev.filter(l => l.id !== id));
  };

  const addPaymentType = (data: Omit<PaymentType, 'id'>) => {
    setPaymentTypes(prev => [...prev, { ...data, id: Date.now().toString() }]);
  };

  const updatePaymentType = (id: string, data: Partial<PaymentType>) => {
    setPaymentTypes(prev => prev.map(pt => pt.id === id ? { ...pt, ...data } : pt));
  };

  const deletePaymentType = (id: string) => {
    setPaymentTypes(prev => prev.filter(pt => pt.id !== id));
  };

  const addTariff = (data: Omit<Tariff, 'id'>) => {
    setTariffs(prev => [...prev, { ...data, id: Date.now().toString() }]);
  };

  const updateTariff = (id: string, data: Partial<Tariff>) => {
    setTariffs(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
  };

  const deleteTariff = (id: string) => {
    setTariffs(prev => prev.filter(t => t.id !== id));
  };

  const addPromotion = (data: Omit<Promotion, 'id'>) => {
    setPromotions(prev => [...prev, { ...data, id: Date.now().toString() }]);
  };

  const updatePromotion = (id: string, data: Partial<Promotion>) => {
    setPromotions(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  };

  const deletePromotion = (id: string) => {
    setPromotions(prev => prev.filter(p => p.id !== id));
  };

  const addBranch = (branch: Branch) => {
    setBranches(prev => [...prev, branch]);
  };

  const updateBranch = (id: string, branchData: Partial<Branch>) => {
    setBranches(prev => prev.map(b => b.id === id ? { ...b, ...branchData } : b));
  };

  const deleteBranch = (id: string) => {
    setBranches(prev => prev.filter(b => b.id !== id));
  };

  const addShipment = (shipment: Omit<Shipment, 'id'>) => {
    const newId = `ENV-${new Date().getFullYear()}-${String(shipments.length + 1).padStart(3, '0')}`;
    setShipments([...shipments, { ...shipment, id: newId }]);
  };

  const updateShipmentStatus = (id: string, status: Shipment['status'], observation?: string) => {
    const shipment = shipments.find(s => s.id === id);
    if (!shipment) return;

    if (status === 'En tránsito' && shipment.status === 'Borrador') {
      // Send notification to destination
      addNotification({
        title: 'Envío en tránsito',
        message: `El envío ${shipment.id} desde Sede Central ha sido despachado. El stock se deducirá al recepcionar.`,
        type: 'info',
        branchId: shipment.destinationId
      });
    }

    setShipments(prev => prev.map(s => s.id === id ? { ...s, status, observation: observation || s.observation } : s));
  };
  
  const deleteShipment = (id: string) => {
    setShipments(prev => prev.filter(s => s.id !== id));
  };

  const updateShipment = (id: string, shipment: Partial<Shipment>) => {
    setShipments(shipments.map(s => s.id === id ? { ...s, ...shipment } : s));
  };

  const addCompany = (company: Company) => {
    setCompanies(prev => [...prev, company]);
  };

  const updateCompany = (id: string, companyData: Partial<Company>) => {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...companyData } : c));
  };

  const deleteCompany = (id: string) => {
    setCompanies(prev => prev.filter(c => c.id !== id));
  };

  const addRole = (role: Role) => {
    setRoles(prev => [...prev, role]);
  };

  const updateRole = (id: string, roleData: Partial<Role>) => {
    setRoles(prev => prev.map(r => r.id === id ? { ...r, ...roleData } : r));
  };

  const deleteRole = (id: string) => {
    setRoles(prev => prev.filter(r => r.id !== id));
  };

  const addUser = (user: User) => {
    setUsers(prev => [...prev, user]);
  };

  const updateUser = (id: string, userData: Partial<User>) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...userData } : u));
  };

  const deleteUser = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  const savePermissions = (roleId: string, newPermissions: string[]) => {
    setPermissions(prev => {
      const existing = prev.find(p => p.roleId === roleId);
      if (existing) {
        return prev.map(p => p.roleId === roleId ? { ...p, permissions: newPermissions } : p);
      }
      return [...prev, { roleId, permissions: newPermissions }];
    });
  };

  return (
    <DataContext.Provider value={{ 
      guardians, 
      students, 
      enrollments, 
      plans, 
      payments, 
      items,
      setItems,
      stockItems, 
      kardex, 
      transfers, 
      setTransfers,
      couriers,
      setCouriers,
      shippingMethods,
      setShippingMethods,
      adjustments, 
      schedules, 
      counselings, 
      trackings, 
      monthlySchedules, 
      staff,
      contracts,
      assignments,
      companies,
      setCompanies,
      addCompany,
      updateCompany,
      deleteCompany,
      roles,
      addRole,
      updateRole,
      deleteRole,
      users,
      addUser,
      updateUser,
      deleteUser,
      permissions,
      savePermissions,
      branches,
      leadSources,
      programs,
      levels,
      paymentTypes,
      tariffs,
      promotions,
      recipes,
      setRecipes,
      unpackPackage,
      packPackage,
      updateStock,
      setRoles,
      setUsers,
      addAdjustment,
      updateMinStock,
      updateTransferStatus,
      updateTransfer,
      addTransfer,
      addStaff,
      updateStaff,
      deleteStaff,
      addStudent,
      updateStudent,
      deleteStudent,
      addGuardian,
      updateGuardian,
      deleteGuardian,
      addEnrollmentFlow, 
      addTracking, 
      registerPayment, 
      refinanceInstallment,
      addLeadSource,
      updateLeadSource,
      deleteLeadSource,
      addProgram,
      updateProgram,
      deleteProgram,
      addLevel,
      updateLevel,
      deleteLevel,
      addPaymentType,
      updatePaymentType,
      deletePaymentType,
      addTariff,
      updateTariff,
      deleteTariff,
      addPromotion,
      updatePromotion,
      deletePromotion,
      addBranch,
      updateBranch,
      deleteBranch,
      isEnrollmentWizardOpen,
      setIsEnrollmentWizardOpen,
      shipments,
      addShipment,
      updateShipmentStatus,
      updateShipment,
      deleteShipment,
      notifications,
      addNotification,
      markNotificationAsRead,
      incidents,
      currentBranchId,
      setCurrentBranchId,
      currentUser,
      confirmReception,
      updateEnrollmentVerification
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
