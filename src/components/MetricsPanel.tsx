import { AlertTriangle, Info } from 'lucide-react';
import { PeopleAnalysis, PeopleModuleId, PeopleModuleResult } from '../types';

const ORDER: PeopleModuleId[] = ['productivity', 'efficiency', 'risk', 'compensation'];

function MetricTile({ label, formatted, unit, note }: { label: string; formatted: string; unit: string; note?: string }) {
  return (
    <div className="rounded-xl border border-[#E5E5E5] bg-white px-4 py-3">
      <p className="text-xs text-[#666666]">{label}</p>
      <p className="mt-1 text-xl font-bold text-[#111111] tabular-nums">
        {formatted}
        {unit && unit !== '%' && <span className="ml-1 text-xs font-normal text-[#999999]">{unit}</span>}
      </p>
      {note && <p className="mt-1 text-[11px] leading-snug text-[#999999]">{note}</p>}
    </div>
  );
}

function ModuleCard({ m }: { m: PeopleModuleResult }) {
  return (
    <section className="rounded-2xl border border-[#E5E5E5] bg-white p-5">
      <h3 className="text-sm font-bold text-[#111111]">{m.moduleName}</h3>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {m.metrics.map(x => (
          <MetricTile key={x.key} label={x.label} formatted={x.formatted} unit={x.unit} note={x.note} />
        ))}
      </div>

      {m.bars.length > 0 && (
        <div className="mt-4 border-t border-[#E5E5E5] pt-3.5">
          {m.barsTitle && <p className="mb-2.5 text-xs font-semibold text-[#666666]">{m.barsTitle}</p>}
          <ul className="space-y-2">
            {m.bars.map((b, i) => (
              <li key={`${b.label}-${i}`}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate text-[#111111]" title={b.label}>{b.label}</span>
                  <span className="shrink-0 font-mono text-[#666666]">{b.formatted}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#F5F5F5]">
                  <div
                    className="h-full rounded-full bg-[#111111]"
                    style={{ width: `${Math.max(2, Math.round(b.ratio * 100))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function MetricsPanel({ analysis }: { analysis: PeopleAnalysis }) {
  const mods = ORDER
    .map(id => analysis.modules.find(m => m.moduleId === id))
    .filter((m): m is PeopleModuleResult => Boolean(m));
  const active = mods.filter(m => m.active);
  const skipped = mods.filter(m => !m.active);

  return (
    <div className="space-y-4">
      {/* 数据概览 + 口径声明 */}
      <section className="rounded-2xl border border-[#E5E5E5] bg-white p-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#666666]">
          <span>记录 <b className="text-[#111111]">{analysis.rowCount.toLocaleString()}</b> 条</span>
          <span>
            覆盖 <b className="text-[#111111]">{analysis.employeeCount}</b>
            {analysis.entityIsFallback ? ' 个分组' : ' 人'}
            {analysis.entityIsFallback && <span className="text-[#999999]">（表中无人员列）</span>}
          </span>
          <span>
            分组维度 <b className="text-[#111111]">{analysis.groupField ?? '—'}</b>
            {analysis.groupFieldSource === 'category' && <span className="text-[#999999]">（工作类别兜底，非真实组织架构）</span>}
            {analysis.groupFieldSource === 'fallback' && <span className="text-[#999999]">（自动推断的兜底维度）</span>}
          </span>
        </div>

        {analysis.summary && (
          <p className="mt-3 text-sm leading-relaxed text-[#111111]">{analysis.summary}</p>
        )}

        <div className="mt-4 rounded-xl border border-[#E5E5E5] bg-[#F5F5F5] p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#111111]">
            <Info size={13} /> 本次人效比口径：{analysis.efficiency.name}（{analysis.efficiency.unit}）
          </p>
          <p className="mt-1 font-mono text-xs text-[#666666]">{analysis.efficiency.formula}</p>
          <p className="mt-2 text-xs leading-relaxed text-[#666666]">{analysis.efficiency.reason}</p>
        </div>
      </section>

      {/* 四个分析模块 */}
      <div className="grid gap-4 lg:grid-cols-2">
        {active.map(m => <ModuleCard key={m.moduleId} m={m} />)}
      </div>

      {/* 被跳过的维度：明说没做什么，而不是悄悄省略 */}
      {skipped.length > 0 && (
        <section className="rounded-2xl border border-dashed border-[#E5E5E5] bg-[#FAFAFA] p-5">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-[#666666]">
            <AlertTriangle size={14} /> 因数据缺失已跳过的维度
          </h3>
          <ul className="mt-2.5 space-y-1.5">
            {skipped.map(m => (
              <li key={m.moduleId} className="text-xs leading-relaxed text-[#666666]">
                <b className="text-[#111111]">{m.moduleName}</b>：{m.skippedReason}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-[#999999]">
            这不是分析能力的上限，而是数据边界的限制。补齐对应字段后重新上传，同一套引擎会自动启用这些模块。
          </p>
        </section>
      )}
    </div>
  );
}
