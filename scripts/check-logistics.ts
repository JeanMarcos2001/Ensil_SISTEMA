/**
 * Verificación de las reglas de logística y recetas: un solo almacén central y rutas obligatorias (envíos y transferencias),
 * recetas sin solapes (copias inactivas), movimientos de stock de todo o nada, ingresos de stock y ventas en caja.
 * Ejecutar: npx tsx scripts/check-logistics.ts
 */
import type { Item, Recipe, StockItem } from '../src/context/DataContext';
import { seedBranches } from '../src/data/seedCatalog';
import { itemSaleError, stockEntryError, stockMovesError } from '../src/utils/inventory';
import { centralWarehouse, shipmentRouteError, transferRouteError, warehouseDefinitionError, warehouseInactivationError } from '../src/utils/logisticsRoutes';
import { duplicateRecipe, overlappingRecipe, recipeStatusError, recipesOverlap, validateRecipe } from '../src/utils/recipes';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

// ------------------------------------------------------------------------------------------------------------------ Almacén central y rutas
const B = (id: string, name: string, extra: { isWarehouse?: boolean; status?: 'Activo' | 'Inactivo' } = {}) => ({ id, name, status: extra.status ?? ('Activo' as const), isWarehouse: extra.isWarehouse });
const branches = [B('LOL', 'Los Olivos', { isWarehouse: true }), B('PIU', 'Piura'), B('CHI', 'Chiclayo'), B('CAJ', 'Cajamarca', { status: 'Inactivo' })];

check('Los datos de ejemplo tienen un solo almacén central y es Los Olivos', centralWarehouse(seedBranches())?.id === 'FIL-LOL' && warehouseDefinitionError(seedBranches()) === null);
check('El almacén central se define por dato, no por nombre', centralWarehouse(branches)?.id === 'LOL' && centralWarehouse(branches.map(b => ({ ...b, isWarehouse: false }))) === undefined);
check('Un almacén inactivo no cuenta como almacén central', centralWarehouse([B('LOL', 'Los Olivos', { isWarehouse: true, status: 'Inactivo' }), B('PIU', 'Piura')]) === undefined);
check('No puede haber dos almacenes centrales', /Solo puede haber un almacén central/.test(warehouseDefinitionError([...branches, B('PIU2', 'Piura 2', { isWarehouse: true })]) ?? ''));
check('Uno o ninguno es válido', warehouseDefinitionError(branches) === null && warehouseDefinitionError(branches.map(b => ({ ...b, isWarehouse: false }))) === null);
check('El almacén central no se puede inactivar', /No se puede inactivar el almacén central/.test(warehouseInactivationError(branches[0], 'Inactivo') ?? '') && warehouseInactivationError(branches[1], 'Inactivo') === null && warehouseInactivationError(branches[0], 'Activo') === null);

check('Un envío sale del almacén central hacia una filial', shipmentRouteError('LOL', 'PIU', branches) === null);
check('Un envío no puede salir de una filial', /salen del almacén central \(Los Olivos\)/.test(shipmentRouteError('PIU', 'CHI', branches) ?? ''));
check('Un envío no puede ir al propio almacén', /no el propio almacén/.test(shipmentRouteError('LOL', 'LOL', branches) ?? ''));
check('Un envío exige destino, que exista y esté activo', shipmentRouteError('LOL', '', branches) === 'Indique la filial de destino.' && /no existe/.test(shipmentRouteError('LOL', 'XXX', branches) ?? '') && /inactiva/.test(shipmentRouteError('LOL', 'CAJ', branches) ?? ''));
check('Sin almacén definido no hay envíos y se dice cómo arreglarlo', /Organización → Filiales/.test(shipmentRouteError('LOL', 'PIU', branches.map(b => ({ ...b, isWarehouse: false }))) ?? ''));

check('Una transferencia puede ser del almacén a una filial (reposición)', transferRouteError('LOL', 'PIU', branches) === null);
check('…o de una filial al almacén (devolución)', transferRouteError('CHI', 'LOL', branches) === null);
check('Entre dos filiales no hay transferencia: todo pasa por el almacén', /Entre filiales todo pasa por el almacén central \(Los Olivos\)/.test(transferRouteError('PIU', 'CHI', branches) ?? ''));
check('El origen y el destino deben ser distintos', transferRouteError('PIU', 'PIU', branches) === 'El origen y el destino deben ser distintos.');
check('Una transferencia exige las dos sedes', transferRouteError('', 'PIU', branches) !== null && transferRouteError('LOL', '', branches) !== null);
check('La sede de una transferencia debe estar activa', /inactiva/.test(transferRouteError('LOL', 'CAJ', branches) ?? '') && /inactiva/.test(transferRouteError('CAJ', 'LOL', branches) ?? ''));
check('Sin almacén definido tampoco hay transferencias', /Organización → Filiales/.test(transferRouteError('PIU', 'CHI', branches.map(b => ({ ...b, isWarehouse: false }))) ?? ''));

// ------------------------------------------------------------------------------------------------------------------ Recetas
const item = (id: string, extra: Partial<Item> = {}): Item => ({ id, name: `Artículo ${id}`, status: 'Activo', type: 'Libro', description: '', unit: 'u', cost: 1, isSold: false, isDeliveredOnEnrollment: true, ...extra } as Item);
const items = [item('LIB'), item('MAT'), item('OFF', { status: 'Inactivo' }), item('NOENT', { isDeliveredOnEnrollment: false })];
const R = (id: string, extra: Partial<Recipe> = {}): Recipe => ({
  id, name: `Receta ${id}`, programId: 'P1', levelId: 'N1', branchIds: [], applyToAllBranches: true, status: 'Activo', items: [{ itemId: 'LIB', quantity: 1 }],
  startDate: '2026-01-01', endDate: '2026-12-31', ...extra,
});

check('Mismo programa, nivel, sede y período se solapan', recipesOverlap(R('A'), R('B')));
check('Otro programa no se solapa', !recipesOverlap(R('A'), R('B', { programId: 'P2' })));
check('Niveles distintos no se solapan; «todos los niveles» sí se solapa con cualquiera', !recipesOverlap(R('A'), R('B', { levelId: 'N2' })) && recipesOverlap(R('A'), R('B', { levelId: undefined })) && recipesOverlap(R('A', { levelId: undefined }), R('B', { levelId: 'N9' })));
check('Sedes distintas no se solapan; una receta para todas las sedes sí', !recipesOverlap(R('A', { applyToAllBranches: false, branchIds: ['PIU'] }), R('B', { applyToAllBranches: false, branchIds: ['CHI'] })) && recipesOverlap(R('A', { applyToAllBranches: false, branchIds: ['PIU'] }), R('B')) && recipesOverlap(R('A', { applyToAllBranches: false, branchIds: ['PIU', 'CHI'] }), R('B', { applyToAllBranches: false, branchIds: ['CHI'] })));
check('Períodos que no se tocan no se solapan; uno sin fin es indefinido', !recipesOverlap(R('A'), R('B', { startDate: '2027-01-01', endDate: '2027-12-31' })) && recipesOverlap(R('A'), R('B', { startDate: '2026-12-31', endDate: '' })) && recipesOverlap(R('A', { endDate: '' }), R('B', { startDate: '2030-01-01', endDate: '' })));
check('Solo choca con una receta activa (una inactiva no estorba)', overlappingRecipe(R('A'), [R('B', { status: 'Inactivo' })]) === undefined && overlappingRecipe(R('A'), [R('B')])?.id === 'B');
check('Una receta no choca consigo misma al editarla', overlappingRecipe(R('A'), [R('A')]) === undefined);
check('Una receta inactiva no se compara (puede coexistir)', overlappingRecipe(R('A', { status: 'Inactivo' }), [R('B')]) === undefined);

check('Una receta completa es válida', validateRecipe(R('N'), [], items).length === 0, validateRecipe(R('N'), [], items).join(' | '));
check('Nombre, programa, artículos y fecha de inicio son obligatorios', validateRecipe(R('N', { name: ' ', programId: '', items: [], startDate: '' }), [], items).length >= 4);
check('No admite artículos repetidos, sin elegir ni con cantidad menor a 1', validateRecipe(R('N', { items: [{ itemId: 'LIB', quantity: 1 }, { itemId: 'LIB', quantity: 1 }] }), [], items).some(e => /repetidos/.test(e)) && validateRecipe(R('N', { items: [{ itemId: '', quantity: 1 }] }), [], items).some(e => /Seleccione/.test(e)) && validateRecipe(R('N', { items: [{ itemId: 'LIB', quantity: 0 }] }), [], items).some(e => /mayores a 0/.test(e)));
check('No admite artículos inactivos ni no habilitados para matrícula', validateRecipe(R('N', { items: [{ itemId: 'OFF', quantity: 1 }] }), [], items).some(e => /inactivos o no habilitados/.test(e)) && validateRecipe(R('N', { items: [{ itemId: 'NOENT', quantity: 1 }] }), [], items).some(e => /inactivos o no habilitados/.test(e)));
check('Al editar se conserva un artículo que hoy ya no cumple (estaba en la receta)', validateRecipe(R('A', { items: [{ itemId: 'OFF', quantity: 1 }] }), [], items, R('A', { items: [{ itemId: 'OFF', quantity: 1 }] })).length === 0);
check('La fecha de fin no puede ser anterior a la de inicio', validateRecipe(R('N', { startDate: '2026-06-01', endDate: '2026-05-01' }), [], items).some(e => /anterior/.test(e)));
check('Una receta para sedes elegidas debe elegir al menos una', validateRecipe(R('N', { applyToAllBranches: false, branchIds: [] }), [], items).some(e => /al menos una sede/.test(e)));
check('Se avisa del solape con otra receta activa, con su nombre', validateRecipe(R('N'), [R('B', { name: 'Kids 2026' })], items).some(e => /Kids 2026/.test(e) && /se solapa/.test(e)));
check('Una receta inactiva sí se puede guardar aunque se solape', validateRecipe(R('N', { status: 'Inactivo' }), [R('B')], items).length === 0);

const copy = duplicateRecipe(R('A'), 'REC-099');
check('La copia nace inactiva, con otro id y «(Copia)» en el nombre', copy.status === 'Inactivo' && copy.id === 'REC-099' && copy.name === 'Receta A (Copia)');
check('La copia no comparte listas con la original', (() => { const o = R('A'); const c = duplicateRecipe(o, 'X'); c.items[0].quantity = 9; c.branchIds.push('PIU'); return o.items[0].quantity === 1 && o.branchIds.length === 0; })());
check('La copia no estorba a la original (inactiva)', validateRecipe(copy, [R('A')], items).length === 0);
check('Activar la copia mientras la original sigue activa se rechaza', /se solapa con la receta activa "Receta A"/.test(recipeStatusError(copy, 'Activo', [R('A'), copy]) ?? ''));
check('Activar es posible cuando la original se desactivó', recipeStatusError(copy, 'Activo', [R('A', { status: 'Inactivo' }), copy]) === null);
check('Desactivar siempre es posible, y no cambiar el estado no es error', recipeStatusError(R('A'), 'Inactivo', [R('A'), R('B')]) === null && recipeStatusError(R('A'), 'Activo', [R('A'), R('B')]) === null);
check('Activar una receta que no choca con nadie es posible', recipeStatusError(R('A', { status: 'Inactivo', programId: 'P9' }), 'Activo', [R('B')]) === null);

// ------------------------------------------------------------------------------------------------------------------ Movimientos de stock de todo o nada
const stock: StockItem[] = [
  { id: 'S1', itemId: 'LIB', branchId: 'PIU', stock: 10, minStock: 0 },
  { id: 'S2', itemId: 'MAT', branchId: 'PIU', stock: 3, minStock: 0 },
];
const nameOf = (id: string) => items.find(i => i.id === id)?.name ?? id;
check('Entregar lo que alcanza no da error', stockMovesError(stock, [{ branchId: 'PIU', itemId: 'LIB', qty: -10 }, { branchId: 'PIU', itemId: 'MAT', qty: -3 }], nameOf) === null);
check('Si falta una línea, toda la operación se rechaza y dice cuál (con el nombre)', /"Artículo MAT".*disponible 3.*descontar 4/.test(stockMovesError(stock, [{ branchId: 'PIU', itemId: 'LIB', qty: -1 }, { branchId: 'PIU', itemId: 'MAT', qty: -4 }], nameOf) ?? ''));
check('Se suman los movimientos del mismo artículo y sede (dos líneas de 6 con 10 en stock)', stockMovesError(stock, [{ branchId: 'PIU', itemId: 'LIB', qty: -6 }, { branchId: 'PIU', itemId: 'LIB', qty: -6 }], nameOf) !== null);
check('Un ingreso en la misma operación compensa una salida', stockMovesError(stock, [{ branchId: 'PIU', itemId: 'LIB', qty: -12 }, { branchId: 'PIU', itemId: 'LIB', qty: 5 }], nameOf) === null);
check('Un artículo sin registro en la sede tiene stock cero', stockMovesError(stock, [{ branchId: 'CHI', itemId: 'LIB', qty: -1 }], nameOf) !== null && stockMovesError(stock, [{ branchId: 'CHI', itemId: 'LIB', qty: 5 }], nameOf) === null);
check('Sin movimientos no hay error', stockMovesError(stock, [], nameOf) === null);

check('Un ingreso de stock pide sede, artículo, cantidad entera y documento', stockEntryError({ branchId: 'PIU', itemId: 'LIB', qty: 5, doc: 'F001-23' }) === null);
check('Sin sede o artículo se rechaza', stockEntryError({ branchId: '', itemId: 'LIB', qty: 5, doc: 'F1' }) !== null && stockEntryError({ branchId: 'PIU', itemId: '', qty: 5, doc: 'F1' }) !== null);
check('La cantidad debe ser un entero mayor a 0', stockEntryError({ branchId: 'PIU', itemId: 'LIB', qty: 0, doc: 'F1' }) !== null && stockEntryError({ branchId: 'PIU', itemId: 'LIB', qty: 2.5, doc: 'F1' }) !== null && stockEntryError({ branchId: 'PIU', itemId: 'LIB', qty: NaN, doc: 'F1' }) !== null && stockEntryError({ branchId: 'PIU', itemId: 'LIB', qty: -3, doc: 'F1' }) !== null);
check('Sin documento que lo respalde no hay ingreso', /documento que respalda/.test(stockEntryError({ branchId: 'PIU', itemId: 'LIB', qty: 5, doc: '   ' }) ?? ''));

check('Una venta con stock y en dólares es válida', itemSaleError({ qty: 2, available: 5, currency: 'USD' }) === null);
check('Una venta en soles pide el tipo de cambio', /tipo de cambio/.test(itemSaleError({ qty: 2, available: 5, currency: 'PEN' }) ?? '') && itemSaleError({ qty: 2, available: 5, currency: 'PEN', exchangeRate: 3.7 }) === null && itemSaleError({ qty: 2, available: 5, currency: 'PEN', exchangeRate: 0 }) !== null);
check('Una venta sin stock suficiente se rechaza', /No hay stock suficiente/.test(itemSaleError({ qty: 6, available: 5, currency: 'USD' }) ?? '') && itemSaleError({ qty: 5, available: 5, currency: 'USD' }) === null);
check('La cantidad vendida debe ser entera y mayor a 0', itemSaleError({ qty: 0, available: 5, currency: 'USD' }) !== null && itemSaleError({ qty: 1.5, available: 5, currency: 'USD' }) !== null);

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
