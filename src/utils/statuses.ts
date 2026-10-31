/**
 * Estados del modelo de datos: un solo catálogo, tipado (nada de `status: string`).
 *
 * Cada estado es de uno de dos tipos, y eso decide si se guarda o se calcula:
 *  - **Guardado** (es un hecho que alguien registró): matrícula caída, contrato cesado, pago anulado, cuota anulada o refinanciada.
 *  - **Derivado** (se calcula al mostrar con lo guardado y la fecha de hoy): estado del alumno (`identity.ts`), de la cuota y del
 *    plan (`planState.ts`) y «Vencido» de un contrato (`payroll.ts`). Del plan se conserva un resumen guardado (`balance`, `status`)
 *    que SOLO escribe `recomputePlan`; `dataIntegrity.ts` avisa si alguna vez difiere de lo calculado.
 */

export const ENROLLMENT_STATUSES = ['Activa', 'Caída'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

/** Estado guardado del contrato; «Vencido» no se guarda: sale de la fecha de fin (`contractStatus`). */
export const CONTRACT_STATUSES = ['Vigente', 'Cesado'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const PLAN_STATUSES = ['Al día', 'Atrasado', 'Completado', 'Caída'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const INSTALLMENT_STATUSES = ['Pendiente', 'Parcial', 'Pagada', 'Vencida', 'Anulada', 'Refinanciada'] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

export const PAYMENT_STATUSES = ['Aprobado', 'Anulado'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PERSON_STATUSES = ['Activo', 'Inactivo'] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

/** Cuota que ya no se cobra (anulada por una caída o reemplazada por una refinanciación). */
export const isClosedInstallment = (status: InstallmentStatus): boolean => status === 'Anulada' || status === 'Refinanciada';
