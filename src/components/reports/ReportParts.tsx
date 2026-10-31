import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { DateInput } from '../ui/DateInput';
import { useData } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { ALL_TIME, PRESET_LABEL, isAllTime, presetRange, type Count, type DateRange, type RangePreset } from '../../utils/reportCommon';
import { todayLocalISO } from '../../utils/schedule';

/** Piezas comunes de las ventanas de Reportes: mismo encabezado, mismos filtros, mismas tarjetas y mismos botones de exportar. */

export const selectCls = 'h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:outline-none focus:border-primary-accent';
export const money = (n: number, cur: 'USD' | 'PEN' = 'USD') => `${cur === 'USD' ? '$' : 'S/'} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pctText = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)} %`);

export function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card className="p-4">
      <span className="text-sm font-medium text-text-secondary">{label}</span>
      <h3 className={`text-xl font-semibold mt-2 ${tone ?? 'text-text-primary'}`}>{value}</h3>
      {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
    </Card>
  );
}

/** Sede con la que arrancan los reportes: la elegida en el encabezado («Vista Global» = todas). */
export function useDefaultBranch(): [string, (id: string) => void] {
  const { currentBranchId } = useData();
  const [branchId, setBranchId] = useState(currentBranchId && currentBranchId !== 'all' ? currentBranchId : '');
  return [branchId, setBranchId];
}

/** Rango de fechas con atajos; arranca en `initial`. */
export function useRange(initial: RangePreset): { range: DateRange; preset: RangePreset | null; setPreset: (p: RangePreset) => void; setRange: (r: DateRange) => void } {
  const today = todayLocalISO();
  const [preset, setPresetState] = useState<RangePreset | null>(initial);
  const [range, setRangeState] = useState<DateRange>(presetRange(initial, today));
  return {
    range, preset,
    setPreset: p => { setPresetState(p); setRangeState(presetRange(p, today)); },
    setRange: r => { setPresetState(null); setRangeState(r); },
  };
}

export function ReportHeader({ title, subtitle, onPdf, onCsv, disabled }: { title: string; subtitle: string; onPdf?: () => void; onCsv?: () => void; disabled?: boolean }) {
  const { can } = useData();
  const mayExport = can(PERM.reportExport);
  return (
    <div className="flex flex-wrap justify-between items-start gap-3">
      <div>
        <h2 className="text-2xl font-semibold text-text-primary mb-1">{title}</h2>
        <p className="text-sm text-text-secondary">{subtitle}</p>
      </div>
      <div className="flex gap-2">
        {onPdf && <Button variant="secondary" className="gap-2" onClick={onPdf} disabled={disabled || !mayExport} title={mayExport ? undefined : 'Su rol no puede exportar reportes'}><Printer size={16} /> PDF</Button>}
        {onCsv && <Button variant="secondary" onClick={onCsv} disabled={disabled || !mayExport} title={mayExport ? undefined : 'Su rol no puede exportar reportes'}>Exportar CSV</Button>}
      </div>
    </div>
  );
}

/** Barra de filtros: atajos y fechas (si el reporte usa período) más lo que cada reporte agregue. */
export function FilterBar({ range, preset, onPreset, onRange, presets = ['mes', 'mes-anterior', '30d', 'anio', 'todo'], children }: {
  range?: DateRange; preset?: RangePreset | null; onPreset?: (p: RangePreset) => void; onRange?: (r: DateRange) => void; presets?: RangePreset[]; children?: React.ReactNode;
}) {
  const all = range ? isAllTime(range) : false;
  return (
    <div className="flex flex-wrap gap-3 items-end">
      {range && onRange && (
        <>
          <div className="w-40"><label className="text-xs font-medium text-text-secondary">Desde</label><DateInput value={all ? '' : range.from} max={range.to} onChange={e => onRange({ from: e.target.value || ALL_TIME.from, to: range.to })} /></div>
          <div className="w-40"><label className="text-xs font-medium text-text-secondary">Hasta</label><DateInput value={all ? '' : range.to} min={range.from} onChange={e => onRange({ from: range.from, to: e.target.value || ALL_TIME.to })} /></div>
          {onPreset && (
            <div className="flex flex-wrap gap-1.5 pb-0.5">
              {presets.map(p => (
                <button key={p} type="button" onClick={() => onPreset(p)} className={`h-8 px-3 rounded-lg border text-xs font-medium transition-colors ${preset === p ? 'bg-primary-accent border-primary-accent text-white' : 'bg-surface border-border-soft text-text-secondary hover:bg-surface-muted'}`}>{PRESET_LABEL[p]}</button>
              ))}
            </div>
          )}
        </>
      )}
      {children}
    </div>
  );
}

export function BranchSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { branches } = useData();
  return (
    <select className={selectCls} value={value} onChange={e => onChange(e.target.value)} aria-label="Filtrar por sede">
      <option value="">Todas las sedes</option>
      {branches.filter(b => b.status === 'Activo').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );
}

type Cell = React.ReactNode;

/** Tabla en una tarjeta. `right` indica las columnas (por posición) que se alinean a la derecha. */
export function TableCard({ title, note, headers, rows, right = [], empty = 'Sin datos.', action }: {
  title: string; note?: string; headers: string[]; rows: Cell[][]; right?: number[]; empty?: string; action?: React.ReactNode;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex justify-between items-center px-4 pt-4 pb-2 gap-3">
        <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">{title}</h4>
        {action}
      </div>
      {note && <p className="px-4 pb-2 text-xs text-text-muted">{note}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
            <tr>{headers.map((h, i) => <th key={h + i} className={`px-4 py-2 font-medium ${right.includes(i) ? 'text-right' : ''}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {rows.length === 0 && <tr><td colSpan={headers.length} className="px-4 py-6 text-center text-text-muted">{empty}</td></tr>}
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-surface-muted/50 align-top">
                {r.map((c, j) => <td key={j} className={`px-4 py-2 ${j === 0 ? 'text-text-primary' : 'text-text-secondary'} ${right.includes(j) ? 'text-right' : ''}`}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Lista de barras horizontales (conteos o montos). */
export function BarsCard({ title, items, format = n => String(n), tone = 'bg-primary-accent', limit = 8, empty = 'Sin datos.' }: {
  title: string; items: { name: string; value: number }[]; format?: (n: number) => string; tone?: string; limit?: number; empty?: string;
}) {
  const shown = items.slice(0, limit);
  const max = Math.max(1, ...shown.map(i => i.value));
  return (
    <Card>
      <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-4">{title}</h4>
      {shown.length === 0 ? <p className="text-sm text-text-muted">{empty}</p> : (
        <div className="space-y-2.5">
          {shown.map(i => (
            <div key={i.name} className="grid grid-cols-[minmax(110px,220px)_1fr_90px] items-center gap-3 text-sm">
              <span className="text-text-secondary truncate" title={i.name}>{i.name}</span>
              <div className="h-2.5 bg-surface-muted rounded-full overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${(i.value / max) * 100}%` }} /></div>
              <span className="text-right text-text-primary font-medium">{format(i.value)}</span>
            </div>
          ))}
          {items.length > limit && <p className="text-xs text-text-muted">y {items.length - limit} más…</p>}
        </div>
      )}
    </Card>
  );
}

export const countItems = (c: Count[]) => c.map(x => ({ name: x.name, value: x.count }));

export function NoAccess() {
  return <div className="flex items-center justify-center h-full text-text-muted"><p>Su rol no tiene permiso para ver los reportes.</p></div>;
}
