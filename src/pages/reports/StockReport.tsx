import React, { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { BarsCard, BranchSelect, FilterBar, Kpi, NoAccess, ReportHeader, TableCard, money, selectCls, useDefaultBranch, useRange } from '../../components/reports/ReportParts';
import { useData } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { csvFileName, downloadCsv } from '../../utils/exportCsv';
import { printTable } from '../../utils/printTable';
import { dmy, isAllTime } from '../../utils/reportCommon';
import { STALE_DAYS, stockReport, type StockState } from '../../utils/reportStock';
import { todayLocalISO } from '../../utils/schedule';

const HEADERS = ['Sede', 'Artículo', 'Stock', 'Mínimo', 'Estado', 'Valor a costo (USD)', 'Último movimiento'];
const TONE: Record<StockState, 'danger' | 'warning' | 'success'> = { 'Sin stock': 'danger', 'Bajo el mínimo': 'warning', Normal: 'success' };

/**
 * Reportes → Stock: la foto del inventario y, sobre todo, si alcanza para lo que ya se debe entregar (matrículas que esperan sus
 * materiales según su receta), más los movimientos del período y lo que viene en camino.
 */
export function StockReport() {
  const { stockItems, items, branches, recipes, enrollments, kardex, transfers, shipments, can } = useData();
  const today = todayLocalISO();
  const { range, preset, setPreset, setRange } = useRange('mes');
  const [branchId, setBranchId] = useDefaultBranch();
  const [state, setState] = useState<'' | StockState>('');
  const [query, setQuery] = useState('');

  const report = useMemo(
    () => stockReport({ stockItems, items, branches, recipes, enrollments, kardex, transfers, shipments, today }, { range, branchId }),
    [stockItems, items, branches, recipes, enrollments, kardex, transfers, shipments, today, range, branchId]
  );
  if (!can(PERM.reportView)) return <NoAccess />;

  const { kpis } = report;
  const q = query.trim().toLowerCase();
  const shown = report.rows.filter(r => (!state || r.state === state) && (!q || r.item.toLowerCase().includes(q)));
  const rows = shown.map(r => [r.branch, r.item, r.stock, r.min, r.state, r.valueUSD, r.lastMove ?? '']);
  const period = isAllTime(range) ? 'todo el historial' : `${dmy(range.from)} al ${dmy(range.to)}`;

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        title="Reporte de stock"
        subtitle={`Inventario de hoy (${dmy(today)}) y movimientos del ${period}. Las cantidades salen del stock por sede y del kardex.`}
        onPdf={() => printTable('Reporte de stock', `Al ${dmy(today)}${branchId ? ` · ${branches.find(b => b.id === branchId)?.name}` : ''}`, HEADERS, rows)}
        onCsv={() => downloadCsv(csvFileName('Stock', today), HEADERS, rows)}
        disabled={rows.length === 0}
      />
      <FilterBar range={range} preset={preset} onPreset={setPreset} onRange={setRange}>
        <BranchSelect value={branchId} onChange={setBranchId} />
        <select className={selectCls} value={state} onChange={e => setState(e.target.value as '' | StockState)} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          <option value="Sin stock">Sin stock</option>
          <option value="Bajo el mínimo">Bajo el mínimo</option>
          <option value="Normal">Normal</option>
        </select>
        <input className={`${selectCls} w-56`} placeholder="Buscar artículo..." value={query} onChange={e => setQuery(e.target.value)} />
      </FilterBar>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Referencias" value={String(kpis.references)} hint={`${kpis.units.toLocaleString('en-US')} unidades`} />
        <Kpi label="Valor a costo" value={money(kpis.valueUSD)} />
        <Kpi label="Bajo el mínimo" value={String(kpis.low)} tone={kpis.low > 0 ? 'text-warning-text' : undefined} hint={`${kpis.empty} sin stock`} />
        <Kpi label="Faltará para las matrículas" value={String(kpis.shortfalls)} tone={kpis.shortfalls > 0 ? 'text-danger-text' : undefined} hint="Artículos que no alcanzan para entregar" />
        <Kpi label="En camino" value={String(kpis.inTransit)} hint="Envíos y transferencias sin recibir" />
      </div>

      <TableCard
        title="Faltantes frente a las matrículas por verificar"
        note="Lo que piden las recetas de las matrículas activas que aún no reciben sus materiales, comparado con el stock de su sede."
        headers={['Sede', 'Artículo', 'Se necesita', 'Hay', 'Falta', 'Matrículas']}
        right={[2, 3, 4, 5]}
        rows={report.shortfalls.map(s => [s.branch, s.item, s.required, s.stock, <span key="m" className="text-danger-text font-semibold">{s.missing}</span>, s.enrollments])}
        empty="El stock alcanza para todas las matrículas que esperan sus materiales."
      />

      <TableCard
        title={`Inventario por sede (${shown.length})`}
        note={shown.length > 120 ? 'Se muestran los primeros 120; el CSV trae todos.' : undefined}
        headers={['Sede', 'Artículo', 'Stock', 'Mínimo', 'Estado', 'Valor (USD)', 'Último movimiento']}
        right={[2, 3, 5]}
        rows={shown.slice(0, 120).map(r => [r.branch, r.item, r.stock, r.min, <Badge key="e" variant={TONE[r.state]}>{r.state}</Badge>, money(r.valueUSD), r.lastMove ? dmy(r.lastMove) : '—'])}
        empty="No hay artículos con esos filtros."
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TableCard title="Movimientos del período" headers={['Tipo', 'Movimientos', 'Unidades']} right={[1, 2]} rows={report.movements.map(m => [m.type, m.count, m.qty])} empty="No hubo movimientos en el período." />
        <BarsCard title="Entregas por verificación" items={report.delivered.map(d => ({ name: d.item, value: d.qty }))} tone="bg-success-text" empty="No hubo entregas en el período." />
      </div>

      <TableCard
        title={`Sin movimiento hace ${STALE_DAYS} días o más (${report.stale.length})`}
        note="Con stock, pero sin entradas ni salidas: candidatos a transferir o revisar."
        headers={['Sede', 'Artículo', 'Stock', 'Último movimiento']}
        right={[2]}
        rows={report.stale.map(r => [r.branch, r.item, r.stock, r.lastMove ? dmy(r.lastMove) : 'Sin registro'])}
        empty="Todo el stock tuvo movimiento reciente."
      />
      <TableCard
        title="En camino"
        headers={['Tipo', 'Código', 'Estado', 'Destino', 'Unidades']}
        right={[4]}
        rows={report.inTransit.map(t => [t.kind, t.id, t.status, t.to, t.units])}
        empty="No hay envíos ni transferencias pendientes de recibir."
      />
    </div>
  );
}
