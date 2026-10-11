import type { EnrollmentCatalogs, EnrollmentDraft, EnrollmentQuote } from '../../utils/enrollment';

export interface StepProps {
  draft: EnrollmentDraft;
  /** Actualiza el borrador de forma inmutable. */
  update: (fn: (d: EnrollmentDraft) => EnrollmentDraft) => void;
  catalogs: EnrollmentCatalogs;
  quote: EnrollmentQuote;
  /** Hoy (YYYY-MM-DD). */
  today: string;
}

export const STEPS = [
  { label: 'Contexto', description: 'Base comercial y sede', title: 'Contexto del registro', subtitle: 'Define el contexto comercial y operativo desde donde se generará la matrícula.' },
  { label: 'Titulares', description: 'Responsables del registro', title: 'Titulares y Responsables', subtitle: 'Ingresa los datos de los padres o apoderados responsables de la matrícula.' },
  { label: 'Alumnos', description: 'Beneficiarios a matricular', title: 'Datos de los Alumnos', subtitle: 'Cada alumno terminará en una matrícula independiente.' },
  { label: 'Programa', description: 'Programa, nivel y tipo de pago', title: 'Selección de Programa', subtitle: 'Elige programa, nivel y tipo de pago. El precio sale del tarifario vigente.' },
  { label: 'Pago y cronograma', description: 'Pago o cronograma según modalidad', title: 'Pago y cronograma', subtitle: 'El contenido cambia según el tipo de pago elegido por cada alumno.' },
  { label: 'Resumen', description: 'Validación final del expediente', title: 'Resumen de Matrícula', subtitle: 'Verifica que toda la información sea correcta antes de guardar.' },
] as const;
