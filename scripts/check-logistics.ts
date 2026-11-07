/**
 * Verificación de las reglas de logística y recetas: un solo almacén central (aparte de las sedes) y rutas obligatorias (envíos y transferencias),
 * recetas sin solapes (copias inactivas), movimientos de stock de todo o nada, ingresos de stock y ventas en caja.
 * Ejecutar: npx tsx scripts/check-logistics.ts
 */
import type { Item, Recipe, StockItem } from '../src/context/DataContext';
import { seedBranches, seedWarehouses } from '../src/data/seedCatalog';
import { itemSaleError, stockEntryError, stockMovesError } from '../src/utils/inventory';
import { centralWarehouse, isWarehouseId, locationSaleError, shipmentRouteError, stockLocations, transferRouteError, warehouseDefinitionError, warehouseInactivationError } from '../src/utils/logisticsRoutes';
import { duplicateRecipe, overlappingRecipe, recipeStatusError, recipesOverlap, validateRecipe } from '../src/utils/recipes';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

// ------------------------------------------------------------------------------------------------------------------ Almacén central y rutas
type St = 'Activo' | 'Inactivo';
const W = (id: string, name: string, status: St = 'Activo') => ({ id, name, status });
const B = (id: string, name: string, status: St = 'Activo') => ({ id, name, status });
const warehouses = [W('ALM-001', 'Almacén central')];
const branches = [B('LOL', 'Los Olivos'), B('PIU', 'Piura'), B('CHI', 'Chiclayo'), B('CAJ', 'Cajamarca', 'Inactivo')];
const locs = stockLocations(branches, warehouses);
const noWarehouse = stockLocations(branches, []);

check('Los datos de ejemplo tienen un solo almacén central, aparte de las sedes (Los Olivos es una sede)', centralWarehouse(seedWarehouses())?.id === 'ALM-001' && warehouseDefinitionError(seedWarehouses()) === null && !seedBranches().some(b => b.id === 'ALM-001'));
check('Una ubicación de stock es el almacén o una sede, con su tipo', locs.length === 5 && locs[0].kind === 'almacén' && locs.slice(1).every(l => l.kind === 'sede'));
check('El id del almacén se reconoce por su prefijo y nunca choca con una sede', isWarehouseId('ALM-001') && isWarehouseId('ALM-012') && !isWarehouseId('FIL-001') && !isWarehouseId('LOL') && !isWarehouseId('ALM-1'));
check('El almacén central se define por dato, no por nombre', centralWarehouse(warehouses)?.id === 'ALM-001' && centralWarehouse([]) === undefined);
check('Un almacén inactivo no cuenta como almacén central', centralWarehouse([W('ALM-001', 'Almacén central', 'Inactivo')]) === undefined);
check('No puede haber dos almacenes centrales activos', /Solo puede haber un almacén central activo/.test(warehouseDefinitionError([...warehouses, W('ALM-002', 'Otro')]) ?? ''));
check('Uno inactivo y otro activo es válido (un reemplazo); ninguno también', warehouseDefinitionError([W('ALM-001', 'Viejo', 'Inactivo'), W('ALM-002', 'Nuevo')]) === null && warehouseDefinitionError([]) === null);
const stk = (branchId: string, stock: number) => ({ branchId, stock });
check('Un almacén con mercadería no se inactiva (quedaría stock que nadie mueve)', /todavía tiene 12 unidades/.test(warehouseInactivationError(warehouses[0], 'Inactivo', [stk('ALM-001', 10), stk('ALM-001', 2), stk('PIU', 99)]) ?? ''));
check('Vacío sí se inactiva; y el stock de una sede no cuenta', warehouseInactivationError(warehouses[0], 'Inactivo', [stk('PIU', 99)]) === null && warehouseInactivationError(warehouses[0], 'Inactivo', [stk('ALM-001', 0)]) === null);
check('Reactivarlo o dejarlo igual no pide nada', warehouseInactivationError(warehouses[0], 'Activo', [stk('ALM-001', 5)]) === null && warehouseInactivationError(W('ALM-001', 'x', 'Inactivo'), 'Inactivo', [stk('ALM-001', 5)]) === null);
check('El almacén no vende: la venta es en una sede', /no vende/.test(locationSaleError('ALM-001') ?? '') && locationSaleError('FIL-002') === null && locationSaleError('LOL') === null);

check('Un envío sale del almacén central hacia una filial', shipmentRouteError('ALM-001', 'PIU', locs) === null);
check('Los Olivos recibe envíos como cualquier otra sede (ya no es el almacén)', shipmentRouteError('ALM-001', 'LOL', locs) === null);
check('Un envío no puede salir de una filial', /salen del almacén central \(Almacén central\)/.test(shipmentRouteError('PIU', 'CHI', locs) ?? ''));
check('Un envío no puede ir al propio almacén', /no el propio almacén/.test(shipmentRouteError('ALM-001', 'ALM-001', locs) ?? ''));
check('Un envío exige destino, que exista y esté activo', shipmentRouteError('ALM-001', '', locs) === 'Indique la filial de destino.' && /no existe/.test(shipmentRouteError('ALM-001', 'XXX', locs) ?? '') && /inactiva/.test(shipmentRouteError('ALM-001', 'CAJ', locs) ?? ''));
check('Sin almacén definido no hay envíos y se dice cómo arreglarlo', /Organización → Almacenes/.test(shipmentRouteError('ALM-001', 'PIU', noWarehouse) ?? ''));

check('Una transferencia puede ser del almacén a una filial (reposición)', transferRouteError('ALM-001', 'PIU', locs) === null);
check('…o de una filial al almacén (devolución)', transferRouteError('CHI', 'ALM-001', locs) === null);
check('Los Olivos devuelve al almacén como cualquier otra sede', transferRouteError('LOL', 'ALM-001', locs) === null);
check('Entre dos filiales no hay transferencia: todo pasa por el almacén', /Entre filiales todo pasa por el almacén central \(Almacén central\)/.test(transferRouteError('PIU', 'CHI', locs) ?? '') && /Entre filiales/.test(transferRouteError('LOL', 'PIU', locs) ?? ''));
check('El origen y el destino deben ser distintos', transferRouteError('PIU', 'PIU', locs) === 'El origen y el destino deben ser distintos.');
check('Una transferencia exige las dos sedes', transferRouteError('', 'PIU', locs) !== null && transferRouteError('ALM-001', '', locs) !== null);
check('La sede de una transferencia debe estar activa', /inactiva/.test(transferRouteError('ALM-001', 'CAJ', locs) ?? '') && /inactiva/.test(transferRouteError('CAJ', 'ALM-001', locs) ?? ''));
check('Sin almacén definido tampoco hay transferencias', /Organización → Almacenes/.test(transferRouteError('PIU', 'CHI', noWarehouse) ?? ''));

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
