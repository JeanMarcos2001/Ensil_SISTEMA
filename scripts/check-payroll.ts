/**
 * Verificación de la planilla (motor, flujo y boleta) y del acceso del personal al sistema.
 * Ejecutar: npx tsx scripts/check-payroll.ts
 */
import type { Assignment, Contract, PayrollAdjustment, PayrollRun, Staff, User } from '../src/context/DataContext';
import {
  RETENTION_DIVISOR, annualIncomeTax, computeLine, coveredDays, fullMonths, periodLabel, regularMonth, uitOf, addPeriods, type ContractTerms, type PriorMonth,
} from '../src/utils/payrollEngine';
import { estimateNet, pensionRate } from '../src/utils/payroll';
import {
  PAYROLL_HEADERS, buildLines, contractsInPeriod, linesOf, payrollRows, payslipHtml, priorMonths, runIdOf, totalsOf, validateAdjustment, validateClose, validateGenerate, validateReopen,
} from '../src/utils/payrollRun';
import { accessCheck, defaultsFromStaff, deactivationNote, syncPatch, validateLinkedUser } from '../src/utils/staffAccess';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const near = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------- Impuesto y fechas
check('UIT 2026 y deducción de 7 UIT', uitOf(2026) === 5500 && uitOf(2031) === 5500);
check('Escala acumulativa: 8 % hasta 5 UIT y 14 % el excedente', annualIncomeTax(10000, 2026) === 800 && near(annualIncomeTax(30000, 2026), 27500 * 0.08 + 2500 * 0.14));
check('Sin renta neta no hay impuesto', annualIncomeTax(0, 2026) === 0 && annualIncomeTax(-50, 2026) === 0);
check('Divisores de la retención (12, 9, 8, 5, 4 y saldo)', [1, 3, 4, 7, 8, 11, 12].map(m => RETENTION_DIVISOR[m]).join() === '12,12,9,8,5,4,1');
check('Días cubiertos por el contrato en el mes', coveredDays({ startDate: '2023-01-01' }, '2026-09') === 30 && coveredDays({ startDate: '2026-10-16' }, '2026-10') === 16 && coveredDays({ startDate: '2023-01-01', endDate: '2026-10-10' }, '2026-10') === 10 && coveredDays({ startDate: '2023-01-01', endDate: '2026-08-31' }, '2026-10') === 0 && coveredDays({ startDate: '2026-11-01' }, '2026-10') === 0);
check('Meses completos cubiertos', fullMonths({ startDate: '2026-03-15' }, '2026-01', '2026-06') === 3 && fullMonths({ startDate: '2025-01-01' }, '2026-01', '2026-06') === 6);
check('Períodos', addPeriods('2026-12', 1) === '2027-01' && addPeriods('2026-01', -1) === '2025-12' && periodLabel('2026-10') === 'octubre 2026');

// ---------------------------------------------------------------- Neto de un mes regular
const juan: ContractTerms = { type: 'Indeterminado', startDate: '2023-01-01', grossSalary: 3500, pensionSystem: 'AFP', pensionFund: 'Integra' };
const maria: ContractTerms = { type: 'Plazo Fijo', startDate: '2023-06-01', endDate: '2027-05-31', grossSalary: 2800, pensionSystem: 'ONP' };
const rj = regularMonth(juan, { hasChildren: true }, 2026)!;
const rm = regularMonth(maria, { hasChildren: false }, 2026)!;
check('Mes regular con AFP, hijos y renta de 5.ª: 3 500 + asignación familiar', rj.pension === 466.8 && rj.familyAllowance === 113 && rj.incomeTax === 84.88 && rj.net === 3061.32, JSON.stringify(rj));
check('Mes regular con ONP y sin hijos', rm.pension === 364 && rm.familyAllowance === 0 && rm.incomeTax === 8.03 && rm.net === 2427.97, JSON.stringify(rm));
check('El contrato y el motor coinciden (estimateNet usa el motor)', (() => { const e = estimateNet(3500, 'Indeterminado', 'AFP', 'Integra', { hasChildren: true }, 2026)!; return e.net === rj.net && e.incomeTax === rj.incomeTax && e.contribution === rj.pension; })());
check('Faltan datos de pensión: no se estima', estimateNet(3500, 'Indeterminado', '', '') === null && estimateNet(3500, 'Indeterminado', 'AFP', '') === null && estimateNet(0, 'Indeterminado', 'ONP', '') === null);
check('La tasa de pensión es la misma que usaba el contrato', pensionRate('Indeterminado', 'ONP', '') === 0.13 && near(pensionRate('Indeterminado', 'AFP', 'Integra'), 0.1292, 0.00001) && pensionRate('Locación de servicios', 'ONP', '') === 0);

// ---------------------------------------------------------------- Locación (4.ª categoría)
const loc = (gross: number, extra: Partial<ContractTerms> = {}): ContractTerms => ({ type: 'Locación de servicios', startDate: '2026-01-01', endDate: '2026-12-31', grossSalary: gross, ...extra });
check('Locación: 8 % si el honorario pasa de S/ 3 300', regularMonth(loc(4000), {}, 2026)!.incomeTax === 320 && regularMonth(loc(4000), {}, 2026)!.taxKind === '4.ª categoría');
check('Locación: hasta S/ 3 300 no se retiene', regularMonth(loc(3300), {}, 2026)!.incomeTax === 0 && regularMonth(loc(3000), {}, 2026)!.net === 3000);
check('Locación con suspensión de retenciones', regularMonth(loc(4000, { suspension4ta: true }), {}, 2026)!.incomeTax === 0);
check('Locación: sin pensión, sin asignación, sin gratificación ni EsSalud', (() => { const c = computeLine({ contract: loc(4000), staff: { hasChildren: true }, period: '2026-07' }); return c.pension === 0 && c.familyAllowance === 0 && c.gratification === 0 && c.essalud === 0; })());

// ---------------------------------------------------------------- Línea del mes
const jul = computeLine({ contract: juan, staff: { hasChildren: true }, period: '2026-07' });
check('Julio: gratificación completa + bonificación de 9 %', jul.gratification === 3613 && jul.gratificationBonus === 325.17, JSON.stringify(jul));
check('La gratificación no paga pensión pero sí entra al ingreso', jul.pensionBase === 3613 && jul.pension === 466.8 && jul.totalIncome === 7551.17);
check('EsSalud (9 %) lo paga el empleador y no baja el neto', jul.essalud === 325.17 && jul.net === round(jul.totalIncome - jul.pension - jul.incomeTax));
const mar = computeLine({ contract: { ...juan, startDate: '2026-03-01' }, staff: { hasChildren: true }, period: '2026-07' });
check('Gratificación proporcional a los meses completos del semestre (marzo a junio = 4/6)', mar.gratification === round(3613 * 4 / 6), String(mar.gratification));
check('Fuera de julio y diciembre no hay gratificación', computeLine({ contract: juan, staff: {}, period: '2026-08' }).gratification === 0);
const may = computeLine({ contract: juan, staff: { hasChildren: true }, period: '2026-05' });
check('CTS de mayo: (remuneración + 1/6 de gratificación) × 6/12, se deposita aparte', near(may.ctsDeposit, (3613 + 3613 / 6) * 6 / 12) && near(may.net, may.totalIncome - may.pension - may.incomeTax));
check('Sin CTS en otros meses', computeLine({ contract: juan, staff: {}, period: '2026-06' }).ctsDeposit === 0);
const part = computeLine({ contract: { type: 'Indeterminado', startDate: '2026-10-16', grossSalary: 3100, pensionSystem: 'ONP' }, staff: {}, period: '2026-10' });
check('Ingreso a mitad de mes: se paga por días (16 de 31)', part.days === 16 && part.basic === 1600 && part.pension === 208);
check('Cese a mitad de mes: se paga hasta el día de cese', computeLine({ contract: { ...juan, endDate: '2026-10-10' }, staff: {}, period: '2026-10' }).days === 10);
check('Un contrato que no cubre el mes no genera pago', computeLine({ contract: { ...juan, endDate: '2026-08-31' }, staff: {}, period: '2026-10' }).net === 0);

// Ajustes eventuales
const bonus = computeLine({ contract: maria, staff: {}, period: '2026-10', adjustments: [{ kind: 'Ingreso', amount: 500, taxable: true }, { kind: 'Ingreso', amount: 100, taxable: false }, { kind: 'Descuento', amount: 50 }] });
check('Ingreso afecto: suma a la base de pensión; inafecto: solo al ingreso; descuento: baja el neto', bonus.pensionBase === 3300 && bonus.pension === 429 && bonus.totalIncome === 3400 && bonus.otherDeductions === 50 && near(bonus.net, 3400 - 429 - bonus.incomeTax - 50));

// La suma de las retenciones del año coincide con el impuesto anual proyectado
const prior: PriorMonth[] = [];
let withheldTotal = 0;
let annualTax = 0;
for (let m = 1; m <= 12; m++) {
  const period = `2026-${String(m).padStart(2, '0')}`;
  const line = computeLine({ contract: juan, staff: { hasChildren: true }, period, prior });
  prior.push({ period, income: line.pensionBase + line.gratification + line.gratificationBonus, withheld: line.incomeTax });
  withheldTotal += line.incomeTax;
  annualTax = line.fifth!.annualTax;
}
check('Las 12 retenciones del año suman el impuesto anual (±1 por redondeo)', near(withheldTotal, annualTax, 1), `${withheldTotal} vs ${annualTax}`);
check('De enero a marzo se retiene 1/12 sin descontar lo anterior', computeLine({ contract: juan, staff: { hasChildren: true }, period: '2026-02' }).fifth!.alreadyWithheld === 0);
const higherPrior = computeLine({ contract: juan, staff: { hasChildren: true }, period: '2026-10', prior: [{ period: '2026-09', income: 100000, withheld: 0 }] });
check('Si lo realmente cobrado fue mayor, la retención sube', higherPrior.incomeTax > computeLine({ contract: juan, staff: { hasChildren: true }, period: '2026-10' }).incomeTax);

// ---------------------------------------------------------------- Planilla: líneas y avisos
const staffList: Staff[] = [
  { id: '1', code: '1', docType: 'DNI', docNumber: '12345678', names: 'Juan', lastNameP: 'Pérez', lastNameM: 'García', status: 'Activo', phone: '987654321', hasChildren: true } as Staff,
  { id: '2', code: '2', docType: 'DNI', docNumber: '87654321', names: 'María', lastNameP: 'Torres', lastNameM: 'López', status: 'Activo', phone: '912345678' } as Staff,
  { id: '3', code: '3', docType: 'DNI', docNumber: '11111111', names: 'Luis', lastNameP: 'Rojas', lastNameM: 'Vega', status: 'Activo', phone: '900000001' } as Staff,
  { id: '4', code: '4', docType: 'DNI', docNumber: '22222222', names: 'Ana', lastNameP: 'Cruz', lastNameM: 'Soto', status: 'Inactivo', phone: '900000002' } as Staff,
];
const contract = (id: string, staffId: string, t: ContractTerms, status = 'Vigente', companyId = 'EMP-001'): Contract => ({ id, staffId, companyId, status, shift: 'Full time', ...t } as Contract);
const contracts: Contract[] = [
  contract('C1', '1', juan),
  contract('C2', '2', maria),
  contract('C3', '4', { type: 'Indeterminado', startDate: '2024-01-01', endDate: '2026-10-10', grossSalary: 2000, pensionSystem: 'ONP' }, 'Cesado'),
];
const asg = (id: string, staffId: string, branch: string, o: Partial<Assignment> = {}): Assignment =>
  ({ id, staffId, branch, area: 'Psicopedagogía', hasAccess: true, startDate: '2023-01-01', isMain: true, status: 'Activa', ...o } as Assignment);
const assignments: Assignment[] = [asg('A1', '1', 'Piura'), asg('A2', '2', 'Chiclayo', { area: 'Administración' }), asg('A3', '2', 'Piura', { isMain: false, area: 'Ventas' })];
const companies = [{ id: 'EMP-001', name: 'SILEE E.I.R.L.', ruc: '20610010289' }, { id: 'EMP-002', name: 'ENSIL EVOLUTION S.R.L.', ruc: '20612459313' }];
const ctx = { contracts, staff: staffList, assignments, runs: [] as PayrollRun[], companies };
check('Contratos que cubren el mes (incluye el que cesó dentro de él)', contractsInPeriod(contracts, '2026-10').map(c => c.id).join() === 'C1,C2,C3' && contractsInPeriod(contracts, '2026-11').map(c => c.id).join() === 'C1,C2');
const built = buildLines('2026-10', 'EMP-001', ctx, []);
check('Una línea por contrato, ordenadas por nombre', built.lines.map(l => l.staffName.split(' ')[0]).join() === 'Ana,Juan,María', built.lines.map(l => l.staffName).join());
check('La línea trae sede, cargo y los días pagados', built.lines.find(l => l.staffId === '1')!.branch === 'Piura' && built.lines.find(l => l.staffId === '4')!.calc.days === 10);
check('Aviso: personal activo sin contrato en el mes', built.warnings.some(w => /Luis Rojas Vega/.test(w.text) && /no tiene contrato/.test(w.text)));
check('El cese a mitad de mes deja constancia en la línea', built.lines.find(l => l.staffId === '4')!.warnings.some(w => /10 de 31/.test(w)));
const broken = buildLines('2026-10', 'EMP-001', { ...ctx, contracts: [contract('C9', '1', { type: 'Indeterminado', startDate: '2024-01-01', grossSalary: 3000 })] }, []);
check('Falta el sistema de pensiones: error que impide cerrar', broken.warnings.some(w => w.level === 'error') && validateClose({ status: 'Borrador', period: '2026-10' }, broken, '2026-10-24').length > 0);
const expiring = buildLines('2026-10', 'EMP-001', { ...ctx, contracts: [contract('C8', '2', { ...maria, endDate: '2026-10-20' })] }, []);
check('Aviso: contrato que vence dentro del mes', expiring.warnings.some(w => /vence el 2026-10-20/.test(w.text)));
const adj: PayrollAdjustment = { id: 'AJU-001', staffId: '2', kind: 'Ingreso', concept: 'Bono por metas', amount: 500, taxable: true, reason: 'Metas de septiembre', by: 'u', at: '2026-10-20T10:00:00Z' };
const withAdj = buildLines('2026-10', 'EMP-001', ctx, [adj]);
check('Un ajuste se aplica a la línea del trabajador', withAdj.lines.find(l => l.staffId === '2')!.calc.pensionBase === 3300 && withAdj.lines.find(l => l.staffId === '2')!.adjustments.length === 1);

// Totales, filas y boleta
const tot = totalsOf(built.lines);
check('Totales: trabajadores, neto y costo del empleador', tot.headcount === 3 && near(tot.net, built.lines.reduce((s, l) => s + l.calc.net, 0)) && near(tot.employerCost, tot.income + tot.essalud));
check('Filas para exportar', payrollRows(built.lines).length === 3 && payrollRows(built.lines)[0].length === PAYROLL_HEADERS.length);
const slip = payslipHtml({ ...built.lines[1], staffName: 'Juan <b>Pérez</b>', companyName: 'ENSIL & Cía' }, '2026-10');
check('La boleta escapa el HTML, muestra el neto y lleva la empresa del contrato con su RUC', !slip.includes('<b>Pérez') && slip.includes('&lt;b&gt;') && slip.includes('NETO A PAGAR') && slip.includes('ENSIL &amp; Cía') && slip.includes('RUC 20610010289'));

// ---------------------------------------------------------------- Flujo
const run = (id: string, period: string, status: PayrollRun['status'], lines?: PayrollRun['lines'], companyId = 'EMP-001'): PayrollRun => ({ id, companyId, period, status, adjustments: [], lines, createdAt: 'x', createdBy: 'u', events: [] });
check('Generar: formato, mes futuro y duplicado', validateGenerate('', 'EMP-001', [], '2026-10-24').length === 1 && validateGenerate('2026-11', 'EMP-001', [], '2026-10-24').length === 1 && validateGenerate('2026-10', 'EMP-001', [run('PLA-2026-10', '2026-10', 'Borrador')], '2026-10-24').length === 1 && validateGenerate('2026-10', 'EMP-001', [], '2026-10-24').length === 0);
check('Generar: el mes anterior del año debe estar cerrado (la renta depende de él)', validateGenerate('2026-10', 'EMP-001', [run('PLA-2026-09', '2026-09', 'Borrador')], '2026-10-24').length === 1 && validateGenerate('2026-10', 'EMP-001', [run('PLA-2026-09', '2026-09', 'Cerrada', [])], '2026-10-24').length === 0 && validateGenerate('2026-01', 'EMP-001', [run('PLA-2025-12', '2025-12', 'Borrador')], '2026-01-31').length === 0);
const okAdj = { kind: 'Ingreso', concept: 'Bono', amount: 100, reason: 'Metas del mes' };
check('Ajuste: solo en borrador, con concepto, monto y motivo', validateAdjustment({ status: 'Borrador' }, okAdj, true).length === 0 && validateAdjustment({ status: 'Cerrada' }, okAdj, true).length === 1 && validateAdjustment({ status: 'Borrador' }, { ...okAdj, amount: 0 }, true).length === 1 && validateAdjustment({ status: 'Borrador' }, { ...okAdj, reason: 'x' }, true).length === 1 && validateAdjustment({ status: 'Borrador' }, okAdj, false).length === 1 && validateAdjustment({ status: 'Borrador' }, { ...okAdj, kind: 'Otro' }, true).length === 1);
check('Cerrar: sin trabajadores o con errores no se cierra; sin errores sí', validateClose({ status: 'Borrador', period: '2026-10' }, { lines: [], warnings: [] }, '2026-10-24').length === 1 && validateClose({ status: 'Borrador', period: '2026-10' }, built, '2026-10-24').length === 0 && validateClose({ status: 'Cerrada', period: '2026-10' }, built, '2026-10-24').length === 1);
const closedSep = run('PLA-2026-09', '2026-09', 'Cerrada', []);
const closedOct = run('PLA-2026-10', '2026-10', 'Cerrada', []);
check('Reabrir: con motivo, y no si ya hay una posterior cerrada del año (no existe «pagada»: el sistema no registra pagos al personal)', validateReopen(closedOct, [closedSep, closedOct], 'Error en un bono').length === 0 && validateReopen(closedOct, [closedSep, closedOct], '').length === 1 && validateReopen(closedSep, [closedSep, closedOct], 'motivo largo').length === 1 && validateReopen(run('PLA-2026-11', '2026-11', 'Borrador', []), [], 'motivo largo').length === 1);

// ---------------------------------------------------------------- Una planilla por empresa y mes (Lote 3)
check('El código de una planilla es el del mes y la empresa', runIdOf('2026-10', 'EMP-003') === 'PLA-2026-10-EMP-003');
check('Generar pide la empresa', validateGenerate('2026-10', '', [], '2026-10-24')[0] === 'Elija la empresa de la planilla.');
check('Cada empresa tiene su planilla del mismo mes (el borrador de otra no estorba ni cuenta como duplicado)', validateGenerate('2026-10', 'EMP-002', [run('PLA-2026-10-EMP-001', '2026-10', 'Borrador')], '2026-10-24').length === 0
  && validateGenerate('2026-10', 'EMP-001', [run('PLA-2026-10-EMP-001', '2026-10', 'Borrador')], '2026-10-24').some(m => /Ya existe/.test(m)));
check('El mes anterior en borrador solo frena a la MISMA empresa', validateGenerate('2026-10', 'EMP-002', [run('PLA-2026-09-EMP-001', '2026-09', 'Borrador')], '2026-10-24').length === 0
  && validateGenerate('2026-10', 'EMP-001', [run('PLA-2026-09-EMP-001', '2026-09', 'Borrador')], '2026-10-24').some(m => /Cierre primero/.test(m)));
check('Reabrir: la planilla posterior cerrada que frena es la de la misma empresa', validateReopen(run('a', '2026-09', 'Cerrada', [], 'EMP-001'), [run('a', '2026-09', 'Cerrada', [], 'EMP-001'), run('b', '2026-10', 'Cerrada', [], 'EMP-002')], 'Corrección').length === 0
  && validateReopen(run('a', '2026-09', 'Cerrada', [], 'EMP-001'), [run('a', '2026-09', 'Cerrada', [], 'EMP-001'), run('b', '2026-10', 'Cerrada', [], 'EMP-001')], 'Corrección').length === 1);
const twoCompanies = [...contracts, contract('C5', '3', { type: 'Indeterminado', startDate: '2024-01-01', grossSalary: 2500, pensionSystem: 'ONP' }, 'Vigente', 'EMP-002')];
const ctx2 = { ...ctx, contracts: twoCompanies };
check('Solo entran los contratos de la empresa de la planilla', contractsInPeriod(twoCompanies, '2026-10', 'EMP-002').map(x => x.id).join() === 'C5' && contractsInPeriod(twoCompanies, '2026-10', 'EMP-001').map(x => x.id).join() === 'C1,C2,C3' && contractsInPeriod(twoCompanies, '2026-10').length === 4);
const evo = buildLines('2026-10', 'EMP-002', ctx2, []);
const silee = buildLines('2026-10', 'EMP-001', ctx2, []);
check('La planilla de una empresa lleva solo a sus trabajadores, con el nombre y el RUC de esa empresa', evo.lines.length === 1 && evo.lines[0].staffId === '3' && evo.lines[0].companyId === 'EMP-002' && evo.lines[0].companyName === 'ENSIL EVOLUTION S.R.L.' && evo.lines[0].companyRuc === '20612459313'
  && silee.lines.length === 3 && silee.lines.every(l => l.companyId === 'EMP-001' && l.companyName === 'SILEE E.I.R.L.'));
check('Quien tiene contrato en otra empresa no figura «sin contrato» en ninguna planilla', !silee.warnings.some(w => /Luis/.test(w.text) && /contrato que cubra/.test(w.text)) && !evo.warnings.some(w => /Luis/.test(w.text) && /contrato que cubra/.test(w.text)));
check('Sin contrato en ninguna empresa el aviso sale UNA vez por planilla, con su nombre, sin depender de la sede (la empresa que emplea a alguien no es la de su sede)', built.warnings.filter(w => /no tiene contrato|no tienen contrato/.test(w.text)).length === 1 && buildLines('2026-10', 'EMP-002', ctx, []).warnings.filter(w => /Luis/.test(w.text)).length === 1 && !built.warnings.some(w => w.staffId !== undefined && /sin contrato/.test(w.text)));
check('Una planilla de una empresa sin contratos sale vacía (no se puede cerrar)', buildLines('2026-10', 'EMP-002', ctx, []).lines.length === 0 && validateClose({ status: 'Borrador', period: '2026-10' }, buildLines('2026-10', 'EMP-002', ctx, []), '2026-10-24').length > 0);

// Lo cerrado alimenta la renta de los meses siguientes
const sepLines = buildLines('2026-09', 'EMP-001', ctx, []).lines;
const closedRuns = [run('PLA-2026-09', '2026-09', 'Cerrada', sepLines), run('PLA-2026-10', '2026-10', 'Borrador')];
const prev = priorMonths(closedRuns, '1', '2026-10');
check('Los meses previos salen de las planillas cerradas del mismo año', prev.length === 1 && prev[0].period === '2026-09' && prev[0].income === sepLines.find(l => l.staffId === '1')!.calc.pensionBase && prev[0].withheld === sepLines.find(l => l.staffId === '1')!.calc.incomeTax);
check('Un borrador y otro año no cuentan como previos', priorMonths([run('PLA-2026-09', '2026-09', 'Borrador')], '1', '2026-10').length === 0 && priorMonths([run('PLA-2025-09', '2025-09', 'Cerrada', sepLines)], '1', '2026-10').length === 0);
check('Una planilla cerrada conserva su foto aunque el contrato cambie', (() => {
  const frozen = run('PLA-2026-10', '2026-10', 'Cerrada', built.lines);
  const changed = { ...ctx, contracts: contracts.map(c => (c.id === 'C1' ? { ...c, grossSalary: 9000 } : c)) };
  const keep = linesOf(frozen, changed).lines.find(l => l.staffId === '1')!.calc.basic;
  const live = linesOf(run('PLA-2026-10', '2026-10', 'Borrador'), changed).lines.find(l => l.staffId === '1')!.calc.basic;
  return keep === 3500 && live === 9000;
})());

// ---------------------------------------------------------------- Acceso del personal al sistema
const users: User[] = [{ id: 'USR-001', name: 'Admin', email: 'a@x.pe', role: 'Administrador Global', branch: 'Todas', lastAccess: '', status: 'Activo' }, { id: 'USR-004', name: 'Juan Pérez', email: 'j@x.pe', role: 'Docente', branch: 'Piura', lastAccess: '', status: 'Activo', staffId: '1', document: '12345678', phone: '987654321' }];
const mariaStaff = staffList[1];
const chk = accessCheck(mariaStaff, assignments, users);
check('María: puede tener cuenta; su sede principal es la de su asignación principal y las demás pasan a adicionales', chk.ok && chk.mainBranch === 'Chiclayo' && chk.branches.join() === 'Chiclayo,Piura', JSON.stringify(chk));
check('Quien ya tiene cuenta, está inactivo o no tiene asignación no puede', !accessCheck(staffList[0], assignments, users).ok && !accessCheck(staffList[3], assignments, users).ok && !accessCheck(staffList[2], assignments, users).ok);
check('«Sin acceso al sistema» en todas las asignaciones impide la cuenta', (() => { const r = accessCheck(mariaStaff, assignments.map(a => (a.staffId === '2' ? { ...a, hasAccess: false } : a)), users); return !r.ok && /sin acceso/.test(r.reasons[0]); })());
check('El rol de la cuenta no se sugiere desde la asignación: se elige una sola vez, en Usuarios', !('suggestedRole' in chk) && !('role' in defaultsFromStaff(mariaStaff, assignments, users)));
const def = defaultsFromStaff(mariaStaff, assignments, users);
check('La cuenta nace de la ficha', def.name === 'María Torres' && def.document === '87654321' && def.phone === '912345678' && def.branch === 'Chiclayo' && def.additionalBranches.join() === 'Piura');
const input = { staffId: '2', email: 'm@x.pe', role: 'Cajero', branch: 'Chiclayo', additionalBranches: ['Piura'], status: 'Activo' };
check('Cuenta vinculada válida', validateLinkedUser(input, staffList, assignments, users).length === 0);
check('Sin ficha no se validan reglas de personal', validateLinkedUser({ ...input, staffId: undefined, branch: 'Lima' }, staffList, assignments, users).length === 0);
check('Una sola cuenta por trabajador', validateLinkedUser({ ...input, staffId: '1', branch: 'Piura', additionalBranches: [] }, staffList, assignments, users).length === 1 && validateLinkedUser({ ...input, staffId: '1', branch: 'Piura', additionalBranches: [] }, staffList, assignments, users, 'USR-004').length === 0);
check('Sede principal y adicionales deben ser de sus asignaciones', validateLinkedUser({ ...input, branch: 'Cajamarca' }, staffList, assignments, users).length === 1 && validateLinkedUser({ ...input, additionalBranches: ['Tacna'] }, staffList, assignments, users).length === 1);
check('No se activa la cuenta de personal inactivo', validateLinkedUser({ ...input, staffId: '4', branch: 'Piura', additionalBranches: [] }, staffList, assignments, users).length >= 1 && validateLinkedUser({ ...input, staffId: '4', status: 'Inactivo' }, staffList, [], users).every(x => !/está inactivo/.test(x)));
const juanUser = users[1];
check('Cuenta al día: sin cambios pendientes', syncPatch(juanUser, staffList[0], assignments) === null);
check('Si cambia la ficha, la cuenta se actualiza', (() => { const p = syncPatch(juanUser, { ...staffList[0], phone: '999111222', docNumber: '99999999' }, assignments); return p?.phone === '999111222' && p?.document === '99999999' && p?.name === undefined; })());
check('Si cierra su asignación de la sede, la cuenta pasa a la sede donde sigue', syncPatch({ ...juanUser, branch: 'Chiclayo', additionalBranches: ['Piura'] }, staffList[0], assignments)?.branch === 'Piura');
check('Constancia de la desactivación', /inactivar al trabajador el 2026-10-24 \(Renuncia — x\)/.test(deactivationNote('2026-10-24', 'Renuncia — x')));

function round(n: number) { return Math.round(n * 100) / 100; }

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
