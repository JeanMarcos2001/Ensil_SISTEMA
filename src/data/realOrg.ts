/**
 * Empresas y sedes REALES de ENSIL: la única lista de la que salen
 *  - la carga en la base (`supabase/seed/empresas_y_sedes_reales.sql`) y la tabla de consulta (`docs/DATOS_SEDES.md`),
 *    ambas generadas por `scripts/doc-sedes-reales.ts`;
 *  - los datos de ejemplo del sistema (`seedBranches()` en `seedCatalog.ts`), para que **sus códigos `FIL-NNN` sean los de la base**:
 *    los datos de ejemplo (matrículas, pagos, stock…) apuntan a las mismas sedes que Organización → Filiales.
 * Origen: tabla `filiales` del proyecto de la web (`jtrugvxgztnxbhwjtiou`), exportada por el usuario el 2026-11-07, y la empresa de cada
 * sede, informada por el usuario el mismo día.
 *
 * Los códigos salen del ORDEN de estas listas (EMP-001…, FIL-001…): es el orden en que los asigna la carga. No reordenar una lista que
 * ya se cargó; lo nuevo va al final.
 */
import { branchFieldErrors, companyFieldErrors, firstError } from '../utils/orgDirectory';

export const PHOTO_BASE = 'https://jtrugvxgztnxbhwjtiou.supabase.co/storage/v1/object/public/Filiales/';

// ------------------------------------------------------------------------------------------------------------------ Empresas

export interface RealCompany { ruc: string; name: string; inBase: boolean }

export const RUC = {
  silee: '20610010289',
  colegio: '20611694092',
  editorial: '20533093133',
  int: '20612421243',
  evolution: '20612459313',
  revolution: '20614185229',
} as const;

/** Las dos primeras ya estaban en la base antes de la carga; las demás las crea `empresas_y_sedes_reales.sql`. */
export const REAL_COMPANIES: RealCompany[] = [
  { ruc: RUC.silee, name: 'SILEE E.I.R.L.', inBase: true },
  { ruc: RUC.colegio, name: 'COLEGIO ENSIL DE LAS AMERICAS E.I.R.L.', inBase: true },
  { ruc: RUC.editorial, name: 'EDITORIAL ENSIL DE LAS AMERICAS TACNA', inBase: false },
  { ruc: RUC.int, name: 'ENSIL INT EIRL', inBase: false },
  { ruc: RUC.evolution, name: 'ENSIL EVOLUTION S.R.L.', inBase: false },
  { ruc: RUC.revolution, name: 'ENSIL REVOLUTION S.A.C.', inBase: false },
];

// ------------------------------------------------------------------------------------------------------------------ Sedes

export interface RealBranch {
  name: string; ruc: string; address: string; reference: string;
  department: string; province: string; district: string;
  phoneFixed: string; phoneMobile: string;
  webId: number; maps: string; photo: string;
  inBase: boolean;
}

/** Los Olivos y Piura ya estaban en la base; el resto se numera a continuación (FIL-003…). */
export const REAL_BRANCHES: RealBranch[] = [
  { name: 'Los Olivos', ruc: RUC.silee, address: 'Carlos Monge Jr. #233', reference: 'Espalda cdra. 4 Av. Izaguirre', department: 'Lima', province: 'Lima', district: 'Los Olivos', phoneFixed: '01-7504687', phoneMobile: '960508686', webId: 5, maps: 'https://maps.app.goo.gl/V6BU6hs1KHxLb3yeA', photo: 'los_olivos_1778176758423.png', inBase: true },
  { name: 'Piura', ruc: RUC.evolution, address: 'Av. Los Cocos Mz. N Lt. 1 Urbanización Club Grau', reference: 'Costado de la Biblioteca Municipal de Piura', department: 'Piura', province: 'Piura', district: 'Piura', phoneFixed: '073-554090', phoneMobile: '933732053', webId: 1, maps: 'https://maps.app.goo.gl/q1YKzNRmgxZ7JDD58', photo: 'piura_1778176811322.webp', inBase: true },
  { name: 'Chiclayo', ruc: RUC.evolution, address: 'Calle Andalucía #150 Urb. san juan', reference: 'Altura del Hotel Tumbas Reales', department: 'Lambayeque', province: 'Chiclayo', district: 'Chiclayo', phoneFixed: '074-525632', phoneMobile: '905464734', webId: 2, maps: 'https://maps.app.goo.gl/jDMpqd8e6nTFPYAK6', photo: 'chiclayo_1778176353071.webp', inBase: false },
  { name: 'Cajamarca', ruc: RUC.evolution, address: 'Jr. Guadalupe #466', reference: 'Huánuco y Silva Santiesteban', department: 'Cajamarca', province: 'Cajamarca', district: 'Cajamarca', phoneFixed: '076-772573', phoneMobile: '933722476', webId: 3, maps: 'https://maps.app.goo.gl/KSk86c7ucQcdmTTM7', photo: 'cajamarca_1778176331132.jpeg', inBase: false },
  { name: 'Trujillo', ruc: RUC.silee, address: 'San Martín #150', reference: 'Frente al Club Libertad', department: 'La Libertad', province: 'Trujillo', district: 'Trujillo', phoneFixed: '', phoneMobile: '928140527', webId: 4, maps: 'https://maps.app.goo.gl/pVePrPXkWWpyyvxdA', photo: 'trujillo_1778177242819.png', inBase: false },
  { name: 'San Isidro', ruc: RUC.evolution, address: 'Calle Francisco de Zela #2575', reference: '1/2 cdra. del Touring', department: 'Lima', province: 'Lima', district: 'San Isidro', phoneFixed: '', phoneMobile: '960508686', webId: 6, maps: 'https://maps.app.goo.gl/YewKJvyKrUFiUa5V6', photo: 'san_isidro_1778176913932.png', inBase: false },
  { name: 'Huancayo', ruc: RUC.int, address: 'Jr. Arequipa #218', reference: 'Complejo Salesiano Sta. Rosa', department: 'Junín', province: 'Huancayo', district: 'El Tambo', phoneFixed: '064-419923', phoneMobile: '992195898', webId: 7, maps: 'https://maps.app.goo.gl/LtPAWUmtBaF8q6ot8', photo: 'huancayo_1778176596042.webp', inBase: false },
  { name: 'Puno', ruc: RUC.int, address: 'Jr. Moquegua #422 (2° piso)', reference: 'Frente al Restaurante Tamis', department: 'Puno', province: 'Puno', district: 'Puno', phoneFixed: '051-352969', phoneMobile: '961274101', webId: 8, maps: 'https://maps.app.goo.gl/YDWVAPVmq8yy99sn6', photo: 'puno_1778176886640.webp', inBase: false },
  { name: 'Juliaca', ruc: RUC.evolution, address: 'Jr. Bolívar #329', reference: 'Costado del Mía Market', department: 'Puno', province: 'San Román', district: 'Juliaca', phoneFixed: '', phoneMobile: '913632393', webId: 9, maps: 'https://maps.app.goo.gl/RsMy7vTGKt1FFYr29', photo: 'juliaca_1778176720849.png', inBase: false },
  { name: 'Arequipa', ruc: RUC.evolution, address: 'Urbanización León XIII M 60 - A, CAYMA', reference: 'A media cuadra de la Clínica García Braganini', department: 'Arequipa', province: 'Arequipa', district: 'Cayma', phoneFixed: '054-325886', phoneMobile: '980756620', webId: 10, maps: 'https://maps.app.goo.gl/TkU657R3jqvUA84D8?g_st=ac', photo: 'arequipa_1778176242815.webp', inBase: false },
  { name: 'Cusco Magisterio', ruc: RUC.revolution, address: 'Parque Amauta #210 Urb. Magisterio', reference: 'A 2 casas de Caprichos', department: 'Cusco', province: 'Cusco', district: 'Cusco', phoneFixed: '084-782957', phoneMobile: '953802527', webId: 11, maps: 'https://maps.app.goo.gl/aUpFLwEPvcgfzEcz8', photo: 'cusco_magisterio_1778176415663.jpeg', inBase: false },
  { name: 'Cusco Marcavalle', ruc: RUC.editorial, address: 'Emilio Balcay #27 Urb. Cerveceros', reference: 'Paradero Marcavalle', department: 'Cusco', province: 'Cusco', district: 'Wanchaq', phoneFixed: '', phoneMobile: '922477489', webId: 12, maps: 'https://maps.app.goo.gl/4fLD7QmMcLmjpF44A', photo: 'cusco_marcavalle_1778176508264.webp', inBase: false },
  { name: 'Tacna', ruc: RUC.editorial, address: 'Av. Venezuela # 144', reference: 'Frente al Parque Villa Hermosa', department: 'Tacna', province: 'Tacna', district: 'Tacna', phoneFixed: '052-638072', phoneMobile: '933746179', webId: 13, maps: 'https://maps.app.goo.gl/QsM1r7N7YJJfqbvc8', photo: 'tacna_1778177208868.jpeg', inBase: false },
  { name: 'Huaraz', ruc: RUC.int, address: 'Jr. Larrea y Laredo #796', reference: 'Frente al Parque El Encuentro', department: 'Áncash', province: 'Huaraz', district: 'Huaraz', phoneFixed: '', phoneMobile: '933741997', webId: 14, maps: 'https://maps.app.goo.gl/kmChH4DBozHcWyYL8', photo: 'huaraz_1778176635989.png', inBase: false },
  { name: 'Ica', ruc: RUC.int, address: 'Av. San Martín #507', reference: 'Al costado de Serpost', department: 'Ica', province: 'Ica', district: 'Ica', phoneFixed: '', phoneMobile: '936770444', webId: 15, maps: 'https://maps.app.goo.gl/zfvzJ9DpZN8r1W2d9', photo: 'ica_1778176668860.png', inBase: false },
  { name: 'Ayacucho', ruc: RUC.int, address: 'Jr. Las Gardenias Mz K Teniente 14', reference: 'Urb. Mariscal Cáceres', department: 'Ayacucho', province: 'Huamanga', district: 'Ayacucho', phoneFixed: '', phoneMobile: '925846402', webId: 16, maps: 'https://maps.app.goo.gl/sXsuE3qKsjC1U6jp6', photo: 'ayacucho_1778176309907.png', inBase: false },
];

/** Sede de la web que el usuario pidió NO cargar todavía (sin empresa definida): no va en la lista de arriba. */
export const PENDING_BRANCH = { name: 'Ilo', address: 'Calle Chile N°146', reference: 'A pocos minutos del malecón costero y zonas comerciales de Ilo', department: 'Moquegua', province: 'Ilo', district: 'Ilo', phoneFixed: '', phoneMobile: '981 116 176', webId: 19, maps: 'https://maps.app.goo.gl/8mXYqLaT4jyY3sor9', photo: 'ilo_1793060047451.png' };

// ------------------------------------------------------------------------------------------------------------------ Códigos

const code = (prefix: string, i: number) => `${prefix}-${String(i + 1).padStart(3, '0')}`;

/** `EMP-NNN` de la empresa con ese RUC (el de la base, si se cargó en este orden). */
export function realCompanyId(ruc: string): string {
  const i = REAL_COMPANIES.findIndex(c => c.ruc === ruc);
  if (i < 0) throw new Error(`La empresa con RUC ${ruc} no está en la lista de empresas reales.`);
  return code('EMP', i);
}

/** `FIL-NNN` de la sede con ese nombre (el de la base, si se cargó en este orden). */
export function realBranchId(name: string): string {
  const i = REAL_BRANCHES.findIndex(b => b.name === name);
  if (i < 0) throw new Error(`La sede «${name}» no está en la lista de sedes reales.`);
  return code('FIL', i);
}

export const realCompanyName = (ruc: string): string => {
  const c = REAL_COMPANIES.find(x => x.ruc === ruc);
  if (!c) throw new Error(`La empresa con RUC ${ruc} no está en la lista de empresas reales.`);
  return c.name;
};

// ------------------------------------------------------------------------------------------------------------------ Validación

/**
 * Problemas de estos datos según las MISMAS reglas que usa la pantalla Organización (RUC de 11 dígitos sin repetir, nombre de sede sin
 * repetir, dirección y ubicación obligatorias, empresa existente), más que Ilo no esté entre las sedes a cargar. Vacía = todo en orden.
 */
export function realOrgProblems(): string[] {
  const problems: string[] = [];
  const seenCompanies: { id: string; ruc: string; status: 'Activo' }[] = [];
  REAL_COMPANIES.forEach((c, i) => {
    const err = firstError(companyFieldErrors({ ruc: c.ruc, name: c.name, status: 'Activo' }, seenCompanies));
    if (err) problems.push(`Empresa ${c.name}: ${err}`);
    seenCompanies.push({ id: code('EMP', i), ruc: c.ruc, status: 'Activo' });
  });
  const companies = seenCompanies.map(c => ({ id: c.id, status: c.status }));
  const seenBranches: { id: string; name: string }[] = [];
  REAL_BRANCHES.forEach((b, i) => {
    if (!REAL_COMPANIES.some(c => c.ruc === b.ruc)) { problems.push(`Sede ${b.name}: la empresa ${b.ruc} no está en la lista.`); return; }
    const err = firstError(branchFieldErrors(
      { name: b.name, companyId: realCompanyId(b.ruc), address: b.address, department: b.department, province: b.province, district: b.district },
      seenBranches, companies,
    ));
    if (err) problems.push(`Sede ${b.name}: ${err}`);
    if (b.name.length > 80) problems.push(`Sede ${b.name}: el nombre pasa de 80 caracteres.`);
    seenBranches.push({ id: code('FIL', i), name: b.name });
  });
  if (REAL_BRANCHES.some(b => b.name.toLowerCase() === PENDING_BRANCH.name.toLowerCase())) problems.push('Ilo no se carga todavía: no debe estar en la lista de sedes.');
  return problems;
}
