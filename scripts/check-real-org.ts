/**
 * Verificación de las empresas y sedes reales y de que son la ÚNICA fuente de sedes del sistema (Lote 2 de la revisión):
 *  - la lista real (`src/data/realOrg.ts`) cumple las mismas reglas que la pantalla Organización;
 *  - los datos de ejemplo apuntan a sedes que existen (mismos códigos FIL-NNN que la base, mismos nombres);
 *  - la carga en la base (`supabase/seed/empresas_y_sedes_reales.sql`) y la tabla de consulta (`docs/DATOS_SEDES.md`) están al día;
 *  - el contexto, la puerta de acceso y las pantallas leen las sedes de la base (no de una lista de ejemplo).
 * Ejecutar: npx tsx scripts/check-real-org.ts
 */
import { readFileSync } from 'node:fs';
import { PENDING_BRANCH, REAL_BRANCHES, REAL_COMPANIES, RUC, realBranchId, realCompanyId, realOrgProblems } from '../src/data/realOrg';
import { seedAssignments, seedBranches, seedUsers, seedWarehouses } from '../src/data/seedCatalog';
import { buildPeopleSeed } from '../src/data/seedPeople';
import { BRANCH_CODE_PATTERN } from '../src/utils/orgDirectory';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// ------------------------------------------------------------------------------------------------ La lista real
const problems = realOrgProblems();
check('Las empresas y sedes reales cumplen las reglas de Organización (RUC, nombres sin repetir, dirección y ubicación)', problems.length === 0, problems.join(' | '));
check('Son 6 empresas y 16 sedes (Ilo queda fuera hasta que el usuario lo pida)', REAL_COMPANIES.length === 6 && REAL_BRANCHES.length === 16 && !REAL_BRANCHES.some(b => b.name === PENDING_BRANCH.name));
check('Los códigos salen del orden: Los Olivos FIL-001 y Piura FIL-002 (ya estaban en la base), el resto a continuación', realBranchId('Los Olivos') === 'FIL-001' && realBranchId('Piura') === 'FIL-002' && realBranchId('Chiclayo') === 'FIL-003' && realBranchId('Ayacucho') === 'FIL-016');
check('Todos los códigos de sede cumplen el patrón de la base y no se repiten', REAL_BRANCHES.every(b => BRANCH_CODE_PATTERN.test(realBranchId(b.name))) && new Set(REAL_BRANCHES.map(b => realBranchId(b.name))).size === REAL_BRANCHES.length);
check('SILEE (EMP-001) y Colegio Ensil (EMP-002) son las dos que ya estaban en la base; las 4 nuevas van a continuación', realCompanyId(RUC.silee) === 'EMP-001' && realCompanyId(RUC.colegio) === 'EMP-002' && realCompanyId(RUC.evolution) === 'EMP-005' && REAL_COMPANIES.filter(c => c.inBase).length === 2 && REAL_BRANCHES.filter(b => b.inBase).map(b => b.name).join() === 'Los Olivos,Piura');
check('Los Olivos y Piura son las dos primeras sedes (la carga numera a partir de ellas)', REAL_BRANCHES.slice(0, 2).every(b => b.inBase) && REAL_BRANCHES.slice(2).every(b => !b.inBase));
check('Piura es de Ensil Evolution (la de Colegio Ensil no cuenta) y Colegio Ensil no tiene sedes por ahora', REAL_BRANCHES.find(b => b.name === 'Piura')?.ruc === RUC.evolution && !REAL_BRANCHES.some(b => b.ruc === RUC.colegio));
check('Todas las sedes tienen empresa y teléfono móvil de 9 dígitos', REAL_BRANCHES.every(b => REAL_COMPANIES.some(c => c.ruc === b.ruc) && /^\d{9}$/.test(b.phoneMobile)));

// ------------------------------------------------------------------------------------------------ Los datos de ejemplo apuntan a sedes que existen
const branches = seedBranches();
const realIds = new Set(REAL_BRANCHES.map(b => realBranchId(b.name)));
const realNames = new Set(REAL_BRANCHES.map(b => b.name));
check('Las sedes de ejemplo son las reales: mismo código, nombre y empresa', branches.length === REAL_BRANCHES.length && branches.every((b, i) => b.id === realBranchId(REAL_BRANCHES[i].name) && b.name === REAL_BRANCHES[i].name && b.companyId === realCompanyId(REAL_BRANCHES[i].ruc) && b.status === 'Activo'));
check('El almacén de ejemplo es el de la base (ALM-001, de SILEE)', seedWarehouses().length === 1 && seedWarehouses()[0].id === 'ALM-001' && seedWarehouses()[0].companyId === 'EMP-001');

const people = buildPeopleSeed('2026-10-30');
const usedIds = [
  ...people.enrollments.map(e => e.branchId), ...people.cashMovements.map(m => m.branchId),
].filter((x): x is string => !!x);
check('Matrículas y caja de ejemplo apuntan a sedes reales (los pagos de ejemplo, también: se revisan abajo en seedPeople.ts)', usedIds.length > 0 && usedIds.every(id => realIds.has(id)), [...new Set(usedIds.filter(id => !realIds.has(id)))].join());
const literal = (path: string) => [...new Set(read(path).match(/FIL-\d{3,}/g) ?? [])];
const stray = ['src/data/seedPeople.ts', 'src/context/DataContext.tsx'].flatMap(p => literal(p).filter(id => !realIds.has(id)).map(id => `${p}: ${id}`));
check('Ningún dato de ejemplo (stock, envíos, agenda, actividades) usa un código de sede que no exista', stray.length === 0, stray.join(' | '));
check('Ya no queda ningún código de sede de ejemplo antiguo (FIL-PIU, FIL-CHI…) en el código', !['src/data/seedPeople.ts', 'src/data/seedCatalog.ts', 'src/context/DataContext.tsx'].some(p => /FIL-(PIU|CHI|CAJ|LOL|SIS|HUA|PUN|JUL|TAC)\b/.test(read(p))));
const userBranches = seedUsers().map(u => u.branch).filter(n => n && n !== 'Todas');
check('Las cuentas y asignaciones de ejemplo trabajan en sedes con nombre real', userBranches.every(n => realNames.has(n)) && seedAssignments().every(a => realNames.has(a.branch)), userBranches.filter(n => !realNames.has(n)).join());

// ------------------------------------------------------------------------------------------------ La carga y la tabla de consulta están al día
const sql = read('supabase/seed/empresas_y_sedes_reales.sql');
const md = read('docs/DATOS_SEDES.md');
const newBranches = REAL_BRANCHES.filter(b => !b.inBase);
check('La carga incluye cada sede nueva con su dirección, empresa (por RUC) y teléfonos, y en el MISMO orden que los códigos', (() => {
  const positions = newBranches.map(b => sql.indexOf(`('${b.name}', '${b.ruc}', '${b.address.replace(/'/g, "''")}'`));
  return positions.every(p => p > 0) && positions.every((p, i) => i === 0 || p > positions[i - 1]);
})());
check('La carga incluye las 4 empresas nuevas con su RUC y no repite las que ya estaban', REAL_COMPANIES.filter(c => !c.inBase).every(c => sql.includes(`('${c.ruc}', '${c.name}', '${c.regime}')`)) && REAL_COMPANIES.filter(c => c.inBase).every(c => !sql.includes(`('${c.ruc}', '`)));
check('Las 6 empresas son MYPE (el usuario lo confirmó) y la carga y la tabla de consulta lo dicen', REAL_COMPANIES.every(c => c.regime === 'MYPE') && sql.includes('regimen_laboral') && /\| MYPE \|/.test(md));
check('La carga corrige la empresa de Piura y NO carga Ilo', /update public\.sedes set empresa_id = eid where lower\(nombre\) = 'piura'/.test(sql) && !/'Ilo'/.test(sql));
check('La carga es repetible y todo o nada (busca por RUC y por nombre antes de crear)', sql.includes('if not exists (select 1 from public.empresas where ruc = e.ruc)') && sql.includes('if not exists (select 1 from public.sedes where lower(nombre) = lower(s.nombre))') && sql.includes('do $$'));
check('La tabla de consulta lista cada sede con su código, empresa y dirección', REAL_BRANCHES.every(b => md.includes(`\`${realBranchId(b.name)}\` | **${b.name}**`) && md.includes(b.address)) && REAL_COMPANIES.every(c => md.includes(c.ruc)));
check('La tabla de consulta deja Ilo como pendiente (no cargada) y su carga no la incluye', /## Sede pendiente: NO cargar todavía/.test(md) && !md.includes('`FIL-017`'));

// ------------------------------------------------------------------------------------------------ Una sola fuente de sedes en el código
const ctx = read('src/context/DataContext.tsx');
check('El contexto ya no tiene sedes, empresas ni almacén de ejemplo: usa los de la base', !/seedBranches|seedWarehouses/.test(ctx) && !/useState<Branch\[\]>|useState<Warehouse\[\]>|useState<Company\[\]>/.test(ctx) && /const org = useOrgDirectory\(orgData\)/.test(ctx) && /const branches = org\.branches/.test(ctx) && /const warehouses = org\.warehouses/.test(ctx) && /const companies = org\.companies/.test(ctx));
check('Ya no se exponen copias aparte de la base (orgBranches, orgCompanies, orgWarehouses): un solo lugar para cada dato', !/orgBranches|orgCompanies|orgWarehouses/.test(ctx) && !['Branches', 'Companies', 'Warehouses', 'Users'].some(n => /orgBranches|orgCompanies|orgWarehouses/.test(read(`src/pages/organization/${n}.tsx`))));
const gate = read('src/components/auth/AccessGate.tsx');
check('Las sedes se leen de la base al iniciar sesión (antes de montar el sistema), junto con roles y cuentas', /loadOrgDirectory\(orgRepo\)/.test(gate) && /children\(loaded\.access, account\.id, loaded\.org, loaded\.catalog, loaded\.items, loaded\.logistics, loaded\.people\)/.test(gate) && /org=\{org\}/.test(read('src/App.tsx')));
const hook = read('src/hooks/useOrgDirectory.ts');
check('El gancho arranca con lo ya leído (no vuelve a leer la base al montarse ni empieza vacío)', /useOrgDirectory\(initial: OrgDirectoryData\)/.test(hook) && /useState<OrgDirectoryStatus>\('ready'\)/.test(hook) && !/useEffect/.test(hook));

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodas las comprobaciones pasaron.');
