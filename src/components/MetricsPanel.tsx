import { AlertTriangle, Info } from 'lucide-react';
import { PeopleAnalysis, PeopleMetric, PeopleModuleId, PeopleModuleResult } from '../types';

const ORDER: PeopleModuleId[] = ['productivity', 'efficiency', 'risk', 'compensation'];

function MetricTile({ m, highlight }: { m: PeopleMetric; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${highlight ? 'border-[#111111] border-2 bg-white' : 'border-[#E5E5E5] bg-white'}`}>
      <p className="text-xs text-[#666666]">{m.label}</p>
      <p className="mt-1 text-xl font-bold text-[#111111] tabular-nums">
        {m.formatted}
        {m.unit && m.unit !== '%' && <span className="ml-1 text-xs font-normal text-[#999999]">{m.unit}</span>}
      </p>
      {/* 算式与来源字段：让每个数字都能追溯到原始列 */}
      {m.formula && (
        <p className="mt-1.5 font-mono text-[11px] leading-snug text-[#666666] break-all">{m.formula}</p>
      )}
      {m.sourceField && (
        <p className="mt-0.5 text-[11px] leading-snug text-[#999999] break-all">来源：{m.sourceField}</p>
      )}
      {m.note && <p className="mt-1 text-[11px] leading-snug text-[#999999]">{m.note}</p>}
    </div>
  );
}

function ModuleCard({ m }: { m: PeopleModuleResult }) {
  return (
    <section className="rounded-2xl border border-[#E5E5E5] bg-white p-5">
      <h3 className="text-sm font-bold text-[#111111]">{m.moduleName}</h3>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {m.metrics.map(x => (
          <MetricTile key={x.key} m={x} highlight={x.key === 'headline'} />
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

function ExecBlock({ title, items, tone = 'normal' }: { title: string; items: string[]; tone?: 'normal' | 'warn' | 'muted' }) {
  const color = tone === 'warn' ? 'text-[#111111]' : tone === 'muted' ? 'text-[#999999]' : 'text-[#666666]';
  const dot = tone === 'warn' ? 'bg-[#111111]' : 'bg-[#999999]';
  return (
    <div>
      <p className="text-xs font-semibold text-[#111111]">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.length === 0 && <li className="text-xs text-[#999999]">（无）</li>}
        {items.map((x, i) => (
          <li key={i} className={`flex gap-1.5 text-xs leading-relaxed ${color}`}>
            <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${dot}`} />
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
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
      {/* 管理摘要：报告最上面那一屏 */}
      <section className="rounded-2xl border-2 border-[#111111] bg-white p-5">
        <h2 className="text-base font-bold text-[#111111]">管理摘要</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#111111]">{analysis.executive.summary}</p>
        <div className="mt-4 grid gap-4 border-t border-[#E5E5E5] pt-4 md:grid-cols-3">
          <ExecBlock title="核心发现" items={analysis.executive.findings} />
          <ExecBlock title="风险提示" items={analysis.executive.risks} tone="warn" />
          <ExecBlock title="数据缺口" items={analysis.executive.missingData} tone="muted" />
        </div>
      </section>

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

        <div className="mt-4 rounded-xl border border-[#E5E5E5] bg-[#F5F5F5] p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#111111]">
            <Info size={13} /> 本次效率口径：{analysis.efficiency.name}（{analysis.efficiency.unit}）
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

      {/* 能力边界：先讲清楚不能回答什么，比一份"看起来很全面"的报告更可信 */}
      <section className="rounded-2xl border border-[#E5E5E5] bg-white p-5">
        <h3 className="text-sm font-bold text-[#111111]">能力边界</h3>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-[#666666]">当前可以回答</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[#666666]">
              {['工作投入：总工时、人均工时、工作类型分布、投入结构',
                '工作结构：工作类别分布、事务性工作占比、投入集中度',
                '效率信号：单位投入的任务密度、超时情况、团队离散度',
                '异常提示：偏离团队分布的投入或产出信号'].map(x => (
                <li key={x} className="flex gap-1.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#111111]" />{x}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#666666]">当前不能判断</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[#999999]">
              {['个人绩效好坏——同样的效率数字在不同任务构成下含义完全不同',
                '薪酬是否合理——需要岗位级别、职责范围等本表没有的信息',
                '业务价值贡献——缺少收入/产出价值字段时，工作量密度不等于价值',
                '该给谁加薪或调整——本报告不产出此类建议'].map(x => (
                <li key={x} className="flex gap-1.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#E5E5E5]" />{x}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
