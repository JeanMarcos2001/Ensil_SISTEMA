/**
 * Verificación de la lista de artículos de la venta en Caja (funciones puras) y de su cableado en la pantalla.
 * Ejecutar: npx tsx scripts/check-sale-catalog.ts
 */
import { readFileSync } from 'node:fs';
import type { Item, ItemPrice, StockItem } from '../src/context/DataContext';
import { SALE_GROUPS, saleGroups, saleOption } from '../src/utils/saleCatalog';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const item = (o: Partial<Item> & { id: string; name: string; type: Item['type'] }): Item =>
  ({ status: 'Activo', description: '', unit: 'Unidad', cost: 1, isDeliveredOnEnrollment: true, isPackage: o.type === 'Kit', ...o } as Item);
const items: Item[] = [
  item({ id: 'LIB-2', name: 'Libro Kids Nivel 2', type: 'Libro', bindingType: 'Encolado' }),
  item({ id: 'LIB-1', name: 'Libro Kids Nivel 1', type: 'Libro', bindingType: 'Encolado' }),
  item({ id: 'LIB-9', name: 'Libro sin stock', type: 'Libro', bindingType: 'Anillado' }),
  item({ id: 'HER-1', name: 'Ábaco', type: 'Herramienta / adicional' }),
  item({ id: 'HER-2', name: 'Cronómetro sin precio', type: 'Herramienta / adicional' }),
  item({ id: 'MAT-1', name: 'Material Lógico Matemático', type: 'Material educativo' }),
  item({ id: 'KIT-1', name: 'Kit Bienvenida', type: 'Kit', composition: [{ itemId: 'HER-1', name: 'Ábaco', quantity: 1 }] }),
  item({ id: 'OLD', name: 'Libro antiguo', type: 'Libro', status: 'Inactivo' }),
];
const stock = (itemId: string, branchId: string, n: number): StockItem => ({ id: `${itemId}-${branchId}`, itemId, branchId, stock: n, minStock: 0 });
const stocks: StockItem[] = [stock('LIB-1', 'FIL-002', 10), stock('LIB-2', 'FIL-002', 3), stock('LIB-9', 'FIL-002', 0), stock('HER-1', 'FIL-002', 5), stock('HER-2', 'FIL-002', 4),
  stock('MAT-1', 'FIL-002', 8), stock('KIT-1', 'FIL-002', 0), stock('LIB-1', 'FIL-003', 1)];
const price = (itemId: string, amount: number, branchId = 'all'): ItemPrice => ({ id: `P-${itemId}-${branchId}`, itemId, branchId, amount, validFrom: '2026-01-01', createdAt: '', createdBy: 't' });
const prices: ItemPrice[] = [price('LIB-1', 60), price('LIB-2', 65), price('LIB-9', 50), price('HER-1', 45), price('MAT-1', 15), price('KIT-1', 55), price('LIB-1', 58, 'FIL-002')];

// ------------------------------------------------------------------------------------------------------------ Grupos y orden
const g = saleGroups(items, stocks, prices, 'FIL-002');
check('Los grupos salen en este orden: libros, herramientas y adicionales, kits y material educativo', g.map(x => x.type).join() === 'Libro,Herramienta / adicional,Kit,Material educativo' && SALE_GROUPS.map(x => x.type).join() === g.map(x => x.type).join());
check('Los artículos inactivos no aparecen', !g.flatMap(x => x.options).some(o => o.item.id === 'OLD'));
check('Sin búsqueda, solo el material educativo queda plegado (los libros, que son lo que más se vende, no)', g.filter(x => x.folded).map(x => x.type).join() === 'Material educativo' && !g.find(x => x.type === 'Libro')!.folded);
check('Dentro de un grupo van primero los que se pueden vender ahora y después los demás (por nombre)',
  g.find(x => x.type === 'Libro')!.options.map(o => o.item.id).join() === 'LIB-1,LIB-2,LIB-9' && g.find(x => x.type === 'Herramienta / adicional')!.options.map(o => o.item.id).join() === 'HER-1,HER-2');
check('Un grupo vacío no sale', !saleGroups([items[0]!], stocks, prices, 'FIL-002').some(x => x.type === 'Kit'));

// ------------------------------------------------------------------------------------------------------------ Cada opción: stock, precio y por qué no
const opt = (id: string, branch = 'FIL-002') => saleOption(items.find(i => i.id === id)!, stocks, prices, branch);
check('Una opción con stock y precio se puede vender', opt('LIB-2').ready && opt('LIB-2').stock === 3 && opt('LIB-2').price === 65 && opt('LIB-2').note === undefined);
check('El precio de la sede gana sobre el general, y el stock es el de esa sede', opt('LIB-1').price === 58 && opt('LIB-1').stock === 10 && opt('LIB-1', 'FIL-003').price === 60 && opt('LIB-1', 'FIL-003').stock === 1);
check('Sin stock: no se puede vender y lo dice', !opt('LIB-9').ready && opt('LIB-9').note === 'Sin stock');
check('Sin precio de referencia: no se puede vender y lo dice (aunque haya stock)', !opt('HER-2').ready && opt('HER-2').note === 'Sin precio de referencia' && opt('HER-2').stock === 4 && opt('HER-2').price === undefined);
check('Un kit sin kits armados necesita armarse en Stock (dice «Sin kits armados»)', opt('KIT-1').needsAssembly && !opt('KIT-1').ready && opt('KIT-1').note === 'Sin kits armados');
check('Un kit con stock se vende y no necesita armarse', (() => { const o = saleOption(items.find(i => i.id === 'KIT-1')!, [stock('KIT-1', 'FIL-002', 2)], prices, 'FIL-002'); return o.ready && !o.needsAssembly; })());
check('Un artículo sin stock que no es kit nunca «necesita armarse»', !opt('LIB-9').needsAssembly && !opt('HER-2').needsAssembly);
check('Sin sede elegida, ningún artículo tiene stock (hay que elegir la sede primero)', saleGroups(items, stocks, prices, '').flatMap(x => x.options).every(o => !o.ready && o.stock === 0));

// ------------------------------------------------------------------------------------------------------------ Búsqueda
const q = (text: string, open = false) => saleGroups(items, stocks, prices, 'FIL-002', text, open);
check('La búsqueda encuentra el material educativo por nombre y ya no lo pliega', (() => { const r = q('lógico'); return r.length === 1 && r[0]!.type === 'Material educativo' && !r[0]!.folded && r[0]!.options[0]!.item.id === 'MAT-1'; })());
check('La búsqueda no distingue mayúsculas ni tildes y encuentra por código', q('ABACO').flatMap(x => x.options).map(o => o.item.id).join() === 'HER-1' && q('lib-2').flatMap(x => x.options).map(o => o.item.id).join() === 'LIB-2');
check('La búsqueda recorre todos los tipos a la vez («ni» está en Nivel y en Bienvenida)',
  q('ni').flatMap(x => x.options).map(o => o.item.id).sort().join() === 'KIT-1,LIB-1,LIB-2' && q('ni').map(x => x.type).join() === 'Libro,Kit', q('ni').flatMap(x => x.options).map(o => o.item.id).join());
check('Una búsqueda sin resultados deja la lista vacía', q('zzz').length === 0);
check('El grupo plegado se abre a mano (openFolded)', q('', true).every(x => !x.folded) && q('', false).some(x => x.folded));

// ------------------------------------------------------------------------------------------------------------ Cableado de la pantalla
const cash = read('src/pages/Cash.tsx');
check('Caja usa la lista nueva (buscador, grupos, stock de la sede) y ya no depende de «se vende»', /saleGroups\(items, stockItems, itemPrices, selectedBranchId, saleQuery, showFolded\)/.test(cash) && /id="sale-search"/.test(cash) && !/isSold/.test(cash));
check('Si falta el kit armado, un aviso debajo del buscador manda a Stock (solo a quien puede armar), sin recargar la página', /selectedOption\?\.needsAssembly/.test(cash) && /navigate\('\/logistica\/stock'\)/.test(cash) && /can\('log-stock:pack'\)/.test(cash));
check('El material educativo plegado se abre con «Ver» y la búsqueda siempre lo encuentra', /setShowFolded\(true\)/.test(cash) && /Ver \{g\.options\.length\}/.test(cash));

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
