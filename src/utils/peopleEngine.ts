import {
  CanonicalField,
  Diagnosis,
  EfficiencyDefinition,
  FieldMapping,
  PeopleAnalysis,
  PeopleBar,
  PeopleMetric,
  PeopleModuleId,
  PeopleModuleResult,
  PeopleRecord,
  RuleResult,
} from '../types';
import { detectFields, headersOf, isOvertimeDerived, toPeopleRecords } from './fieldMapper';
import { routeSkills } from './skillRouter';

// ── 数值工具（沿用 businessRules.ts 的写法）──
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);
const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const stdev = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = avg(a);
  return Math.sqrt(sum(a.map(v => (v - m) ** 2)) / (a.length - 1));
};
const cv = (a: number[]) => {
  const m = avg(a);
  return m > 0 ? stdev(a) / m : 0;
};
/** 基尼系数：0 = 完全平均，1 = 全部集中在一个人身上 */
const gini = (a: number[]) => {
  const v = a.filter(x => x > 0).sort((x, y) => x - y);
  const n = v.length;
  const total = sum(v);
  if (!n || total === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * v[i];
  return (2 * cum) / (n * total) - (n + 1) / n;
};

const fmt = (n: number) => Math.round(n).toLocaleString();
const f1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString();
const f2 = (n: number) => (Math.round(n * 100) / 100).toLocaleString();
const f3 = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString();
const pctS = (n: number) => `${(n * 100).toFixed(1)}%`;

const mean = avg;

// ── 聚合结构 ──
interface EmpAgg {
  employee: string;
  records: number;
  hours: number;
  items: number;
  amount: number;
  compensation: number;
  overtimeYes: number;
  overtimeKnown: number;
  rate: number;             // 工作项 / 工时
  avgHoursPerItem: number;
  overtimeRate: number;
}

interface GroupAgg {
  label: string;
  records: number;
  hours: number;
  items: number;
  amount: number;
  compensation: number;
  rate: number;
}

/** 工作项的定义：有产出数量列就用它，否则**一条记录 = 一个已完成工作项** */
const itemsOf = (rec: PeopleRecord) => rec.outputQty ?? 1;

/**
 * 薪酬列有两种常见形态，混在一起会算错：
 *  - 逐行成本（月度人工成本）：每行一个数 → 累加
 *  - 人员属性（月薪，在每一条任务记录里重复填写）→ 只计一次，
 *    否则一份工作日志会把薪资按任务条数翻几十倍
 *
 * 判断依据是**表的形态**而不是数值本身：有独立产出数量列的表通常是
 * 「人 × 周期」汇总表，每一行的薪酬是当期成本，必须累加；没有产出列的
 * 明细表通常是任务流水，重复出现的同一个数更像是人员属性。
 * 用了哪种解释会写在指标备注里，不偷偷决定。
 */
const effectiveCompensation = (vals: number[], treatAsAttribute: boolean): number => {
  if (vals.length === 0) return 0;
  if (treatAsAttribute && new Set(vals).size === 1) return vals[0];
  return sum(vals);
};

function aggregateByEmployee(recs: PeopleRecord[], compIsAttribute: boolean): EmpAgg[] {
  const map = new Map<string, EmpAgg>();
  const compVals = new Map<string, number[]>();
  for (const r of recs) {
    const key = r.employee || '（未填写）';
    let e = map.get(key);
    if (!e) {
      e = {
        employee: key, records: 0, hours: 0, items: 0, amount: 0, compensation: 0,
        overtimeYes: 0, overtimeKnown: 0, rate: 0, avgHoursPerItem: 0, overtimeRate: 0,
      };
      map.set(key, e);
      compVals.set(key, []);
    }
    e.records += 1;
    e.hours += r.hours ?? 0;
    e.items += itemsOf(r);
    e.amount += r.outputAmount ?? 0;
    if (r.compensation !== null) compVals.get(key)!.push(r.compensation);
    if (r.overtime === true) e.overtimeYes += 1;
    if (r.overtime !== null) e.overtimeKnown += 1;
  }
  for (const e of map.values()) {
    e.compensation = effectiveCompensation(compVals.get(e.employee) ?? [], compIsAttribute);
    e.rate = safeDiv(e.items, e.hours);
    e.avgHoursPerItem = safeDiv(e.hours, e.items);
    e.overtimeRate = safeDiv(e.overtimeYes, e.overtimeKnown);
  }
  return [...map.values()].sort((a, b) => b.hours - a.hours);
}

function aggregateByGroup(recs: PeopleRecord[], field: string | null): GroupAgg[] {
  if (!field) return [];
  const map = new Map<string, GroupAgg>();
  for (const r of recs) {
    const label = (r.raw[field] ?? '').trim() || '（空）';
    let g = map.get(label);
    if (!g) {
      g = { label, records: 0, hours: 0, items: 0, amount: 0, compensation: 0, rate: 0 };
      map.set(label, g);
    }
    g.records += 1;
    g.hours += r.hours ?? 0;
    g.items += itemsOf(r);
    g.amount += r.outputAmount ?? 0;
    g.compensation += r.compensation ?? 0;
  }
  for (const g of map.values()) g.rate = safeDiv(g.items, g.hours);
  return [...map.values()].sort((a, b) => b.hours - a.hours);
}

const toBars = (rows: { label: string; value: number; formatted: string }[], limit = 8): PeopleBar[] => {
  const top = rows.sort((a, b) => b.value - a.value).slice(0, limit);
  const max = top.length ? Math.max(...top.map(t => t.value)) : 0;
  return top.map(t => ({ ...t, ratio: max > 0 ? t.value / max : 0 }));
};

// ═══════════════════════════════════════════
// 规则引擎 PE01–PE11
// 阈值全部锚定在真实数据分布上：真实日报团队超时率只有 8.5%，
// 所以个体超时用「团队超时率的 2 倍」这类相对阈值，绝对阈值只兜底。
// ═══════════════════════════════════════════
interface PeopleRule extends RuleResult {
  verify: string[];
}

const MEETING_RE = /会议|沟通|协调|对齐|汇报|例会/;

function runPeopleRules(recs: PeopleRecord[], perEmp: EmpAgg[], groups: GroupAgg[], fm: FieldMapping): PeopleRule[] {
  const out: PeopleRule[] = [];
  const compIsAttribute = !fm.mapping.outputQuantity;
  const withHours = perEmp.filter(e => e.hours > 0);
  const rates = withHours.map(e => e.rate).filter(r => r > 0);
  const medRate = median(rates);
  const totalHours = sum(perEmp.map(e => e.hours));
  const totalItems = sum(perEmp.map(e => e.items));

  // ── PE01 高工时低产出（个体）──
  const lowRate = withHours
    .filter(e => e.records >= 8 && e.rate > 0 && e.rate < medRate * 0.7)
    .sort((a, b) => a.rate - b.rate);
  if (lowRate.length && medRate > 0) {
    const worst = lowRate[0];
    const ratio = worst.rate / medRate;
    out.push({
      ruleId: 'PE01',
      ruleName: '高工时低产出：单位工时完成的工作项明显低于团队',
      severity: ratio < 0.5 ? 'high' : 'medium',
      triggerCondition: `个人产出率 < 团队中位数产出率 × 0.7（团队中位数 ${f3(medRate)} 项/小时）`,
      evidence: [
        `${worst.employee} 产出率 ${f3(worst.rate)} 项/小时，为团队中位数的 ${(ratio * 100).toFixed(0)}%`,
        `该成员累计工时 ${f1(worst.hours)} 小时 / ${worst.records} 条记录，单条平均 ${f2(worst.avgHoursPerItem)} 小时`,
        `团队单条平均工时中位数 ${f2(median(withHours.map(e => e.avgHoursPerItem)))} 小时`,
        ...(lowRate.length > 1 ? [`另有 ${lowRate.length - 1} 人低于该阈值：${lowRate.slice(1, 4).map(e => e.employee).join('、')}`] : []),
      ],
      conclusion: `${worst.employee} 的单位工时产出只有团队中位数的一半左右，属于产出效率洼地。但产出率低不等于人不行——任务复杂度和任务类型差异会直接影响这个数字，需要先排除这两项再谈效率。`,
      suggestion: `1）先核对 ${worst.employee} 承担的任务类型，看是否集中在高复杂度、长周期事项上；2）把其单条耗时最长的几条任务拉出来逐条复盘，区分「任务本身难」与「流程/工具卡住」；3）如果确认同类任务耗时显著高于他人，再考虑排期与协作方式调整。`,
      verify: [
        '该成员承担的任务是否系统性偏向高复杂度类别（可交叉对比工作类别分布）',
        '是否存在流程审批、等待他人回复等非个人可控的耗时',
        '产出率低是否与其同时承担沟通协调类隐性工作有关',
      ],
    });
  }

  // ── PE02 工时集中度偏高 ──
  if (totalHours > 0 && perEmp.length >= 3) {
    const top3 = sum(perEmp.slice(0, 3).map(e => e.hours));
    const share = safeDiv(top3, totalHours);
    if (share >= 0.5) {
      out.push({
        ruleId: 'PE02',
        ruleName: '工时集中度偏高：少数人承担了大部分工作量',
        severity: share >= 0.65 ? 'high' : 'medium',
        triggerCondition: '工时最高的 3 人合计占比 ≥ 50%',
        evidence: [
          `前 3 名工时合计 ${f1(top3)} 小时，占全部 ${f1(totalHours)} 小时的 ${pctS(share)}`,
          `前 3 名：${perEmp.slice(0, 3).map(e => `${e.employee} ${f1(e.hours)}h`).join('、')}`,
          `团队共 ${perEmp.length} 人，人均工时 ${f1(safeDiv(totalHours, perEmp.length))} 小时`,
        ],
        conclusion: `工时高度集中在前 3 人身上（${pctS(share)}），团队存在关键人依赖：这几个人一旦请假或离职，工作交接风险很高。同时也说明任务分配不够均衡。`,
        suggestion: `1）把这 3 人的工作类别拆开看，找出可以转移给其他人的低门槛事务；2）对可标准化的任务建立模板与交接文档，降低单人依赖；3）在排期时给这几个人设置工时上限预警。`,
        verify: [
          '集中在前 3 人是否因为是管理岗/资深岗的正常职责划分',
          '这些人的任务中哪些属于必须由其本人完成（如审批、对外对接）',
        ],
      });
    }
  }

  // ── PE03 超时率异常（个体）──
  const teamKnown = sum(perEmp.map(e => e.overtimeKnown));
  const teamYes = sum(perEmp.map(e => e.overtimeYes));
  const teamOvertimeRate = safeDiv(teamYes, teamKnown);
  if (teamKnown >= 20) {
    const hits = perEmp
      .filter(e => e.overtimeKnown >= 5 && (e.overtimeRate >= 0.3 || (teamOvertimeRate > 0 && e.overtimeRate >= teamOvertimeRate * 2)))
      .sort((a, b) => b.overtimeRate - a.overtimeRate);
    if (hits.length) {
      const worst = hits[0];
      out.push({
        ruleId: 'PE03',
        ruleName: '超时率异常：个人任务耗时系统性超出标准工时',
        severity: worst.overtimeRate >= 0.4 ? 'high' : 'medium',
        triggerCondition: `个人超时率 ≥ 团队超时率 × 2（团队 ${pctS(teamOvertimeRate)}）或 ≥ 30%，且至少有 5 条超时标注`,
        evidence: [
          `${worst.employee} 超时 ${worst.overtimeYes}/${worst.overtimeKnown} 条，超时率 ${pctS(worst.overtimeRate)}，为团队的 ${teamOvertimeRate > 0 ? (worst.overtimeRate / teamOvertimeRate).toFixed(1) : '—'} 倍`,
          `团队整体超时率 ${pctS(teamOvertimeRate)}（${teamYes}/${teamKnown}）`,
          ...(hits.length > 1 ? [`同类异常：${hits.slice(1, 4).map(e => `${e.employee} ${pctS(e.overtimeRate)}`).join('、')}`] : []),
        ],
        conclusion: `${worst.employee} 的任务系统性超出标准工时区间，超时率是团队平均水平的数倍。可能是任务难度被低估（标准工时定得不合理），也可能是执行环节有阻塞。`,
        suggestion: `1）复核这位成员实际承担的「工作子活动」对应的标准工时区间是否定得偏低；2）优先排查占比最高的超时工作类别，而不是逐条追问；3）如果超时集中在某几个子活动上，考虑调整标准工时或增加资源。`,
        verify: [
          '该成员超时的记录集中在哪些工作类别/子活动',
          '标称的标准工时区间是否与实际任务复杂度匹配',
          '超时记录中「超时原因」字段是否有填写，能否直接定位原因',
        ],
      });
    }
  }

  // ── PE04 超时集中度 ──
  if (teamYes >= 10) {
    const byOvertime = [...perEmp].sort((a, b) => b.overtimeYes - a.overtimeYes);
    const top2 = sum(byOvertime.slice(0, 2).map(e => e.overtimeYes));
    if (top2 / teamYes >= 0.5) {
      out.push({
        ruleId: 'PE04',
        ruleName: '超时集中度高：少数人贡献了大部分超时记录',
        severity: 'medium',
        triggerCondition: '超时记录数最多的 2 人合计占团队超时记录 ≥ 50%，且团队超时 ≥ 10 条',
        evidence: [
          `前 2 名超时记录合计 ${top2} 条，占团队 ${teamYes} 条的 ${pctS(top2 / teamYes)}`,
          `前 2 名：${byOvertime.slice(0, 2).map(e => `${e.employee} ${e.overtimeYes} 条`).join('、')}`,
        ],
        conclusion: '超时不是全员普遍现象，而是集中在少数人身上。这更可能是任务分配或个别流程问题，而不是整体排期制度问题——优先做定点排查，不必全员动员。',
        suggestion: '1）只针对超时集中的成员做任务复盘，避免全员返工；2）检查这几个人是否被分配了过多跨部门协调类任务；3）观察下个周期超时是否随任务调整而下降。',
        verify: ['这几个人是否集中承担了对外沟通、跨部门协调类工作', '其超时是否与特定项目周期重合'],
      });
    }
  }

  // ── PE05 单人工时异常（z 检验）──
  const forZ = perEmp.filter(e => e.records >= 5 && e.hours > 0);
  if (forZ.length >= 4) {
    const perItem = forZ.map(e => e.avgHoursPerItem);
    const m = mean(perItem);
    const sd = stdev(perItem);
    if (sd > 0) {
      const hits = forZ
        .map(e => ({ e, z: (e.avgHoursPerItem - m) / sd }))
        .filter(x => Math.abs(x.z) >= 2)
        .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
      if (hits.length) {
        const top = hits[0];
        out.push({
          ruleId: 'PE05',
          ruleName: '单人工时异常：完成单位产出的耗时显著偏离团队',
          severity: Math.abs(top.z) >= 2.5 ? 'high' : 'medium',
          triggerCondition: '|个人单位产出耗时 z 值| ≥ 2.0，且有效记录 ≥ 5 条',
          evidence: [
            `${top.e.employee} 每完成 1 项平均耗时 ${f2(top.e.avgHoursPerItem)} 小时，团队均值 ${f2(m)} 小时，标准差 ${f2(sd)}，z = ${top.z.toFixed(2)}`,
            `该成员累计 ${f1(top.e.hours)} 小时 / ${top.e.records} 条记录`,
            `团队单位产出耗时中位数 ${f2(median(perItem))} 小时`,
          ],
          conclusion: `${top.e.employee} 完成单位产出的耗时约为团队均值的 ${(top.e.avgHoursPerItem / (m || 1)).toFixed(1)} 倍，是统计意义上的工时离群点。**这本身不是问题**，任务复杂度差异会直接造成这个结果；它只是一个「值得看一眼」的信号。`,
          suggestion: `1）先确认这位成员的任务构成，是否为团队里少见的复杂/长周期事项；2）若是，则属于正常的任务分工差异，无需干预，反而应考虑在工时统计中单独归类；3）若不是，再排查流程与工具层面的阻塞。`,
          verify: [
            '该成员的任务是否集中在高复杂度工作类别',
            '是否存在单条任务被反复返工导致累计工时偏高',
            '工时填报是否包含等待、开会等非直接产出时间',
          ],
        });
      }
    }
  }

  // ── PE06 个体产出差异异常 ──
  const eligible = perEmp.filter(e => e.records >= 5 && e.hours > 0 && e.rate > 0);
  if (eligible.length >= 4) {
    const c = cv(eligible.map(e => e.rate));
    if (c >= 0.3) {
      const sorted = [...eligible].sort((a, b) => a.rate - b.rate);
      out.push({
        ruleId: 'PE06',
        ruleName: '个体产出差异异常：团队内部效率离散度偏高',
        severity: c >= 0.45 ? 'high' : 'medium',
        triggerCondition: '个人产出率的变异系数 CV = σ/μ ≥ 0.30',
        evidence: [
          `CV = ${f2(stdev(eligible.map(e => e.rate)))} / ${f2(mean(eligible.map(e => e.rate)))} = ${c.toFixed(2)}（阈值 0.30）`,
          `最低：${sorted[0].employee} ${f3(sorted[0].rate)} 项/小时；最高：${sorted[sorted.length - 1].employee} ${f3(sorted[sorted.length - 1].rate)} 项/小时`,
          `样本为 ${eligible.length} 位有 5 条以上记录且工时大于 0 的成员`,
        ],
        conclusion: `团队内部产出率差异很大（最高与最低相差 ${(sorted[sorted.length - 1].rate / (sorted[0].rate || 1)).toFixed(1)} 倍）。差异本身可能来自任务构成，而不是能力差异——**在下结论前必须先按工作类别分层对比。**`,
        suggestion: '1）按工作类别分别对比各成员的产出率，只在同类任务内比较；2）找出高产出率成员使用的工具或方法，看是否可复制；3）对低产出率成员做定点辅导而非普遍施压。',
        verify: ['差异是否在按工作类别分层后消失（若消失，说明是任务构成问题而非效率问题）', '高产出率成员是否只是承担了更多短平快任务'],
      });
    }
  }

  // ── PE07 产出分布不均 ──
  if (perEmp.length >= 4 && totalItems > 0) {
    const g = gini(perEmp.map(e => e.items));
    const top3Items = sum(perEmp.slice(0, 3).map(e => e.items));
    const share = safeDiv(top3Items, totalItems);
    if (g >= 0.35 || share >= 0.5) {
      out.push({
        ruleId: 'PE07',
        ruleName: '产出分布不均：工作量向少数人集中',
        severity: share >= 0.65 || g >= 0.5 ? 'high' : 'medium',
        triggerCondition: '工作项分布的基尼系数 ≥ 0.35，或产出最高的 3 人占比 ≥ 50%',
        evidence: [
          `工作项分布基尼系数 ${g.toFixed(2)}（0 为完全平均，1 为全部集中在一人）`,
          `前 3 名产出合计 ${fmt(top3Items)} 项，占全部 ${fmt(totalItems)} 项的 ${pctS(share)}`,
          `人均工作项 ${f1(safeDiv(totalItems, perEmp.length))} 项，中位数 ${f1(median(perEmp.map(e => e.items)))} 项`,
        ],
        conclusion: `工作量的分布是不均衡的（基尼 ${g.toFixed(2)}）。结合工时集中度一起看，团队对少数成员的依赖较高，任务分配有再平衡的空间。`,
        suggestion: '1）把产出最高者的任务清单按「可转移 / 必须本人」分类，优先转移可标准化部分；2）对新成员或低负载成员设置阶梯式的任务承接计划；3）按月跟踪基尼系数变化趋势，作为组织健康度指标。',
        verify: ['分布不均是岗位职责差异还是分配问题', '低产出成员是否同时承担了大量非记录类工作'],
      });
    }
  }

  // ── PE08 事务性工作占比过高 ──
  if (totalHours > 0) {
    const meetHours = sum(recs.filter(r => r.category && MEETING_RE.test(r.category)).map(r => r.hours ?? 0));
    const meetShare = safeDiv(meetHours, totalHours);
    const byCat = aggregateByGroup(recs, fm.mapping.category);
    const topCat = byCat[0];
    const topShare = topCat ? safeDiv(topCat.hours, totalHours) : 0;

    if (meetShare >= 0.25 || topShare >= 0.4) {
      const byMeeting = meetShare >= 0.25;
      out.push({
        ruleId: 'PE08',
        ruleName: byMeeting ? '事务性工作占比过高：会议与沟通消耗了过多工时' : '工作类别过度集中：工时压在单一类别上',
        severity: meetShare >= 0.35 || topShare >= 0.5 ? 'high' : 'medium',
        triggerCondition: byMeeting
          ? '会议/沟通/协调/对齐类记录的工时占比 ≥ 25%'
          : '单一工作类别的工时占比 ≥ 40%',
        evidence: byMeeting
          ? [
              `会议与沟通类合计 ${f1(meetHours)} 小时，占全部 ${f1(totalHours)} 小时的 ${pctS(meetShare)}`,
              `按工时排序的工作类别：${byCat.slice(0, 3).map(c => `${c.label} ${f1(c.hours)}h`).join('、')}`,
            ]
          : [
              `「${topCat.label}」占 ${f1(topCat.hours)} 小时，为全部的 ${pctS(topShare)}`,
              `其余类别：${byCat.slice(1, 4).map(c => `${c.label} ${f1(c.hours)}h`).join('、')}`,
            ],
        conclusion: byMeeting
          ? '相当一部分工时被会议与内部沟通占据。这不一定是浪费，但它是**最容易被压缩而不影响产出的部分**，也是新人和管理者尤其容易被吞噬的时间。'
          : `工时高度集中在「${topCat.label}」上。如果这与岗位职责相符则正常；如果不是，说明团队缺少工作类型的多样性或被单一事务淹没。`,
        suggestion: byMeeting
          ? '1）统计高频会议的参与人数与时长，合并同类会议；2）把可以异步进行的同步会改成文档+评论；3）给每个会议设明确的产出物要求，无产出物的会议不排。'
          : `1）确认「${topCat.label}」的工作量是否属于岗位应有职责；2）若不属于，排查是否有本该自动化或外包的环节；3）观察下个周期该类别占比是否回落。`,
        verify: byMeeting
          ? ['高频会议中哪些参与人数多、时长长但无明确决策产出', '沟通类工时是否集中在少数几个人身上']
          : ['该类别的工作是否有可自动化/模板化的部分', '是否因临时性任务挤占了计划内工作'],
      });
    }
  }

  // ── PE10 / PE11 需要薪资字段 ──
  const compRecs = perEmp.filter(e => e.compensation > 0);
  if (fm.mapping.compensation && compRecs.length >= 3) {
    const compMean = mean(compRecs.map(e => e.compensation));
    const rateMed = median(compRecs.map(e => e.rate).filter(r => r > 0));
    const hits = compRecs
      .filter(e => e.compensation >= compMean * 1.3 && rateMed > 0 && e.rate > 0 && e.rate < rateMed * 0.8)
      .sort((a, b) => b.compensation - a.compensation);
    if (hits.length) {
      const h = hits[0];
      out.push({
        ruleId: 'PE10',
        ruleName: '高薪低产出：人工成本与产出效率不匹配',
        severity: 'high',
        triggerCondition: '个人薪酬 ≥ 团队均值 × 1.3，且个人产出率 < 团队中位数 × 0.8',
        evidence: [
          `${h.employee} 薪酬 ${fmt(h.compensation)}，为团队均值 ${fmt(compMean)} 的 ${(h.compensation / (compMean || 1)).toFixed(1)} 倍`,
          `其产出率 ${f3(h.rate)} 项/小时，团队中位数 ${f3(rateMed)} 项/小时`,
          `人力成本投入与产出效率出现结构性错配`,
        ],
        conclusion: `${h.employee} 的人力成本显著高于团队均值，但单位工时产出低于团队中位数。这在经营上是需要解释的：可能是岗位级别与产出结构不匹配，也可能是其承担了难以量化的工作。`,
        suggestion: '1）核对岗位级别与薪资构成的合理性；2）确认其是否有大量未被记录的工作（管理、对外、救火）；3）若确属成本错配，考虑调整职责范围而非直接处理人。',
        verify: ['该成员是否承担管理或对外职责，这些工作难以用工时产出率衡量', '薪资差异是否来自岗位级别/司龄的合理差异'],
      });
    }

    if (fm.mapping.department && recs.length) {
      // 先按「部门 + 人」收齐薪酬取值，再对每个人做一次 有效薪酬 判定，
      // 最后按部门汇总——避免月薪被按月数重复累加。
      const byDept = new Map<string, { items: number; hours: number }>();
      const deptComp = new Map<string, Map<string, number[]>>();
      for (const r of recs) {
        const d = (r.department ?? '').trim() || '（未填写）';
        const emp = r.employee || '（未填写）';
        const cur = byDept.get(d) ?? { items: 0, hours: 0 };
        cur.items += itemsOf(r);
        cur.hours += r.hours ?? 0;
        byDept.set(d, cur);

        let perEmp = deptComp.get(d);
        if (!perEmp) { perEmp = new Map(); deptComp.set(d, perEmp); }
        const arr = perEmp.get(emp) ?? [];
        if (r.compensation !== null) arr.push(r.compensation);
        perEmp.set(emp, arr);
      }
      const deptCompTotal = new Map<string, number>();
      for (const [d, perEmp] of deptComp) {
        deptCompTotal.set(d, sum([...perEmp.values()].map(v => effectiveCompensation(v, compIsAttribute))));
      }
      const totalComp = sum([...deptCompTotal.values()]);
      const teamRateMed = median([...byDept.values()].map(v => safeDiv(v.items, v.hours)).filter(r => r > 0));
      if (totalComp > 0) {
        const worstDept = [...byDept.entries()]
          .map(([label, v]) => ({ label, share: safeDiv(deptCompTotal.get(label) ?? 0, totalComp), rate: safeDiv(v.items, v.hours) }))
          .sort((a, b) => b.share - a.share)[0];
        if (worstDept && worstDept.share >= 0.5 && teamRateMed > 0 && worstDept.rate < teamRateMed) {
          out.push({
            ruleId: 'PE11',
            ruleName: '部门成本占比异常：高成本部门的人效低于团队中位数',
            severity: 'medium',
            triggerCondition: '某部门人工成本占比 ≥ 50%，且该部门人均产出率 < 团队中位数',
            evidence: [
              `「${worstDept.label}」占人工成本 ${pctS(worstDept.share)}`,
              `该部门产出率 ${f3(worstDept.rate)} 项/小时，团队中位数 ${f3(teamRateMed)} 项/小时`,
            ],
            conclusion: `「${worstDept.label}」承担了过半的人力成本，但单位工时产出低于团队中位数。需要区分这是「成本结构问题」还是「该部门的工作性质不同」。`,
            suggestion: '1）核对部门编制与人均成本的合理性；2）按部门内的岗位构成再拆一层，避免用同一个产出率口径衡量不同职能；3）若属成本结构问题，优先从招聘与编制规划入手。',
            verify: ['该部门的工作性质是否与其他部门可比', '产出率的分子（工作项定义）在部门间是否一致'],
          });
        }
      }
    }
  }

  // ── PE09 维度缺失与口径声明（始终触发）──
  const missing: string[] = [];
  if (!fm.mapping.compensation) missing.push('薪资/人工成本');
  if (!fm.mapping.outputQuantity) missing.push('产出数量');
  if (!fm.mapping.outputAmount) missing.push('产出金额');
  if (!fm.mapping.department) missing.push('部门');
  out.push({
    ruleId: 'PE09',
    ruleName: '分析口径声明：本次分析能做什么、不能做什么',
    severity: 'low',
    triggerCondition: '始终输出，用于声明本次分析的数据边界',
    evidence: [
      `本次共解析 ${fmt(recs.length)} 条记录，覆盖 ${perEmp.length} 人`,
      missing.length ? `未检测到的数据维度：${missing.join('、')}` : '所有关键维度均已检测到',
      fm.mapping.outputQuantity
        ? '产出量取自「产出数量」字段'
        : '未检测到产出数量字段，本次以「一条记录 = 一个已完成工作项」近似',
    ],
    conclusion: missing.length
      ? `缺少 ${missing.join('、')} 数据，因此本报告无法回答成本与人效的金额口径问题。这不是分析能力的上限，而是数据边界的限制——补齐字段后同一套引擎会自动启用对应模块。`
      : '本次分析覆盖了投入、产出、成本三个维度，人效比可采用经营口径。',
    suggestion: missing.length
      ? `如需更完整的人效分析，建议补充：${missing.map(m => `${m}字段`).join('、')}。补齐后无需改代码，重新上传即可。`
      : '建议按月持续上传同一口径的数据，以观察人效指标的趋势而非单点快照。',
    verify: missing.length ? [`补充 ${missing.join('、')} 字段后可启用的分析维度`] : ['单点数据无法体现趋势，建议按周期对比'],
  });

  return out;
}

// ═══════════════════════════════════════════
// 指标模块
// ═══════════════════════════════════════════

/**
 * 每个指标都要能追溯到原始列——报告里的数字必须敢拿给老板看。
 * 这两个小工具负责把「来源字段」和「Σ[列名]」写进指标里。
 */
const srcLabel = (fm: FieldMapping, f: CanonicalField, fallback = '—') => fm.mapping[f] ?? fallback;
const col = (fm: FieldMapping, f: CanonicalField) => fm.mapping[f];
const sumOf = (fm: FieldMapping, f: CanonicalField) => (col(fm, f) ? `Σ[${col(fm, f)}]` : '—');
const rowsOf = (fm: FieldMapping, f: CanonicalField) => (col(fm, f) ? `[${col(fm, f)}]` : '—');

interface HeadlineTotals {
  totalItems: number;
  totalHours: number;
  totalAmount: number;
  totalComp: number;
  passRate: number | null;
}

/**
 * 顶部主指标「人效比」。口径由 Skill 路由根据可用字段选定，
 * 这里负责算数值、写明公式与来源字段，并把**含义代入实际数值**——
 * 光给一个 3.2 没人知道意味着什么，「每投入 1 元人工成本产生 3.2 元收入」才有人看得懂。
 */
function buildHeadline(fm: FieldMapping, eff: EfficiencyDefinition, t: HeadlineTotals): PeopleMetric | null {
  const base = { key: 'headline', label: `人效比 · ${eff.name}` };

  const mk = (value: number, unit: string, formatted: string, formula: string, sourceField: string, note: string) =>
    ({ ...base, value, unit, formatted, formula, sourceField, note });

  switch (eff.name) {
    case '金额型人效比':
      if (!(t.totalComp > 0 && t.totalAmount > 0)) return null;
      return mk(
        safeDiv(t.totalAmount, t.totalComp), '元/元', f2(safeDiv(t.totalAmount, t.totalComp)),
        `${sumOf(fm, 'outputAmount')} ÷ ${sumOf(fm, 'compensation')}`,
        `${srcLabel(fm, 'outputAmount')} ÷ ${srcLabel(fm, 'compensation')}`,
        `每投入 1 元人工成本，产生 ${f2(safeDiv(t.totalAmount, t.totalComp))} 元收入`,
      );
    case '时均产出':
      if (!(t.totalHours > 0 && t.totalAmount > 0)) return null;
      return mk(
        safeDiv(t.totalAmount, t.totalHours), '元/小时', f1(safeDiv(t.totalAmount, t.totalHours)),
        `${sumOf(fm, 'outputAmount')} ÷ ${sumOf(fm, 'hours')}`,
        `${srcLabel(fm, 'outputAmount')} ÷ ${srcLabel(fm, 'hours')}`,
        `每投入 1 小时，产出 ${f1(safeDiv(t.totalAmount, t.totalHours))} 元`,
      );
    case '工作项产出率':
      if (!(t.totalHours > 0 && t.totalItems > 0)) return null;
      return mk(
        safeDiv(t.totalItems, t.totalHours), '项/小时', f3(safeDiv(t.totalItems, t.totalHours)),
        `工作项总数 ÷ ${sumOf(fm, 'hours')}`,
        `${col(fm, 'outputQuantity') ?? '记录条数'} ÷ ${srcLabel(fm, 'hours')}`,
        `每投入 1 小时，完成 ${f3(safeDiv(t.totalItems, t.totalHours))} 个工作项`,
      );
    case '单位人工成本产出':
      if (!(t.totalComp > 0 && t.totalItems > 0)) return null;
      return mk(
        safeDiv(t.totalItems, t.totalComp), '项/元', f3(safeDiv(t.totalItems, t.totalComp)),
        `工作项总数 ÷ ${sumOf(fm, 'compensation')}`,
        `${col(fm, 'outputQuantity') ?? '记录条数'} ÷ ${srcLabel(fm, 'compensation')}`,
        `每投入 1 元人工成本，完成 ${f3(safeDiv(t.totalItems, t.totalComp))} 个工作项`,
      );
    case '标准工时达标率':
      if (t.passRate === null) return null;
      return mk(
        t.passRate, '%', pctS(t.passRate),
        '未超出标准时长的记录数 ÷ 有超时标注的记录数',
        `${srcLabel(fm, 'overtimeFlag', srcLabel(fm, 'standardHours'))} + ${srcLabel(fm, 'hours')}`,
        `每 100 条记录中有 ${(t.passRate * 100).toFixed(1)} 条落在标准工时区间内。该口径评价的是排期与工时估算的准确性，不代表业务贡献。`,
      );
    default:
      // 「工时结构分析」没有单一比率，不硬凑一个数出来
      return null;
  }
}

/** 分布型条形图：宽度按占总量比例，而不是相对最大值 */
const toShareBars = (
  rows: { label: string; value: number }[],
  total: number,
  limit = 8,
): PeopleBar[] =>
  rows
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map(r => ({
      label: r.label,
      value: r.value,
      formatted: total > 0 ? pctS(r.value / total) : '—',
      ratio: total > 0 ? r.value / total : 0,
    }));

function buildModules(
  recs: PeopleRecord[],
  perEmp: EmpAgg[],
  groups: GroupAgg[],
  fm: FieldMapping,
  eff: EfficiencyDefinition,
  groupField: string | null,
  groupSource: string,
  activeIds: Set<PeopleModuleId>,
  entityIsFallback: boolean,
): PeopleModuleResult[] {
  const totalHours = sum(perEmp.map(e => e.hours));
  const totalItems = sum(perEmp.map(e => e.items));
  const totalAmount = sum(perEmp.map(e => e.amount));
  const totalComp = sum(perEmp.map(e => e.compensation));
  const teamYes = sum(perEmp.map(e => e.overtimeYes));
  const teamKnown = sum(perEmp.map(e => e.overtimeKnown));
  const passRate = teamKnown > 0 ? (teamKnown - teamYes) / teamKnown : null;
  const overtimeRate = teamKnown > 0 ? teamYes / teamKnown : null;
  const derived = isOvertimeDerived(fm);
  const groupLabel = groupField ?? '';
  const groupNote = groupSource === 'category'
    ? `按「${groupLabel}」分组（该表没有部门字段，用工作类别作为兜底维度，不代表真实组织架构）`
    : groupSource === 'fallback'
      ? `按「${groupLabel}」分组（兜底维度，非真实组织架构）`
      : groupSource === 'department' ? `按「${groupLabel}」分组` : '';

  const mods: PeopleModuleResult[] = [];

  // ── 1. 人力投入与产出概览 ──
  const empUnit = entityIsFallback ? '组' : '人';
  const hasHours = !!col(fm, 'hours');
  /**
   * 「工作项」这个概念只有在两种情况下成立：
   *   ① 表里有独立的产出数量列；或
   *   ② 是一张任务流水表（每行一条任务，因此每行都有工时）。
   * 部门成本/收入这类「人 × 周期」汇总表两个都没有——那里一行是一个部门，
   * 把它当成一个"工作项"会算出「每个部门占 20%」这种毫无意义的结论，所以直接不算。
   */
  const hasItems = !!col(fm, 'outputQuantity') || hasHours;
  const topGroup = groups[0];

  // 没有工时列时，投入分布退回按工作项看——绝不输出一列 0 或者一堆「—」
  const valueOf = (x: { hours: number; items: number }) => (hasHours ? x.hours : x.items);
  const valueTotal = hasHours ? totalHours : totalItems;
  const valueWord = hasHours ? '工时' : '工作项';
  const canShowDistribution = hasHours || hasItems;
  const topGroupShare = topGroup && valueTotal > 0 ? safeDiv(valueOf(topGroup), valueTotal) : null;
  const itemSource = col(fm, 'outputQuantity') ? sumOf(fm, 'outputQuantity') : '记录条数';
  const itemNote = col(fm, 'outputQuantity') ? undefined : '一条记录 = 一个已完成工作项';

  const prodMetrics: PeopleMetric[] = [
    {
      key: 'employees', label: entityIsFallback ? '分组数' : '员工数量', value: perEmp.length,
      unit: empUnit, formatted: `${perEmp.length}`,
      formula: `按「${srcLabel(fm, 'employee', '分组维度')}」去重计数`,
      sourceField: srcLabel(fm, 'employee', srcLabel(fm, 'department', '—')),
      note: entityIsFallback ? '表中无人员列，按分组维度统计' : undefined,
    },
    {
      key: 'records', label: '记录条数', value: recs.length, unit: '条', formatted: fmt(recs.length),
      formula: '数据表中的有效数据行数', sourceField: '整表',
    },
  ];
  if (hasHours) {
    prodMetrics.push(
      {
        key: 'hours', label: '总工时', value: totalHours, unit: '小时', formatted: f1(totalHours),
        formula: sumOf(fm, 'hours'), sourceField: srcLabel(fm, 'hours'),
      },
      {
        key: 'hoursPerEmp', label: entityIsFallback ? '组均工时' : '人均工时',
        value: safeDiv(totalHours, perEmp.length), unit: `小时/${empUnit}`,
        formatted: f1(safeDiv(totalHours, perEmp.length)),
        formula: `总工时 ÷ ${entityIsFallback ? '分组数' : '员工数量'}`,
        sourceField: srcLabel(fm, 'hours'),
        note: col(fm, 'outputQuantity') ? '含表内全部周期的累计值' : undefined,
      },
    );
  }
  if (hasItems) {
    prodMetrics.push(
      {
        key: 'items', label: '工作项总数', value: totalItems, unit: '项', formatted: fmt(totalItems),
        formula: itemSource, sourceField: col(fm, 'outputQuantity') ?? '记录条数', note: itemNote,
      },
      {
        key: 'itemsPerEmp', label: '人均工作项', value: safeDiv(totalItems, perEmp.length), unit: `项/${empUnit}`,
        formatted: f1(safeDiv(totalItems, perEmp.length)),
        formula: `工作项总数 ÷ ${entityIsFallback ? '分组数' : '员工数量'}`,
        sourceField: col(fm, 'outputQuantity') ?? '记录条数',
      },
    );
  }
  if (topGroup && topGroupShare !== null && groups.length >= 2 && canShowDistribution) {
    prodMetrics.push({
      key: 'topGroupShare', label: `${valueWord}投入最高${entityIsFallback ? '分组' : '部门'}占比`,
      value: topGroupShare, unit: '%', formatted: pctS(topGroupShare),
      formula: `${topGroup.label} 的${valueWord} ÷ 总${valueWord}`,
      sourceField: srcLabel(fm, groupSource === 'department' ? 'department' : 'category'),
    });
  }

  mods.push({
    moduleId: 'productivity',
    moduleName: '人力投入与产出概览',
    active: activeIds.has('productivity'),
    metrics: activeIds.has('productivity') ? prodMetrics : [],
    bars: !canShowDistribution || valueTotal <= 0 ? []
      : groups.length
        ? toShareBars(groups.map(g => ({ label: g.label, value: valueOf(g) })), valueTotal)
        : toShareBars(perEmp.map(e => ({ label: e.employee, value: hasHours ? e.hours : e.items })), valueTotal),
    barsTitle: groups.length ? `${valueWord}投入分布 · ${groupNote}` : `${valueWord}投入分布 · 按人`,
    skippedReason: activeIds.has('productivity') ? undefined : '需要「人员」字段，且至少有工时或产出之一',
  });

  // ── 按分组汇总薪酬/金额/产出 ──
  // 先按「人」拿到有效薪酬再归组，保证与个人口径一致（月薪不会被按行数重复累加）
  const groupKeyOf = new Map<string, string>();
  if (groupField) {
    for (const r of recs) {
      const key = r.employee || '（未填写）';
      const g = (r.raw[groupField] ?? '').trim();
      if (!groupKeyOf.has(key) && g) groupKeyOf.set(key, g);
    }
  }
  const groupAgg = new Map<string, { comp: number; amount: number; items: number; hours: number }>();
  if (groupField) {
    for (const e of perEmp) {
      const g = groupKeyOf.get(e.employee) ?? e.employee;
      const cur = groupAgg.get(g) ?? { comp: 0, amount: 0, items: 0, hours: 0 };
      cur.comp += e.compensation;
      cur.amount += e.amount;
      cur.items += e.items;
      cur.hours += e.hours;
      groupAgg.set(g, cur);
    }
  }

  // ── 2. 人效比 ──
  const effMetrics: PeopleMetric[] = [];

  // 顶部主指标：口径由 Skill 路由定，数值在这里算，**含义代入实际数值**
  const headline = buildHeadline(fm, eff, { totalItems, totalHours, totalAmount, totalComp, passRate });
  if (headline) effMetrics.push(headline);

  if (passRate !== null) {
    effMetrics.push({
      key: 'passRate', label: '标准工时达标率', value: passRate, unit: '%', formatted: pctS(passRate),
      formula: `（有超时标注的记录数 − 超时记录数）÷ 有超时标注的记录数`,
      sourceField: `${srcLabel(fm, 'overtimeFlag', srcLabel(fm, 'standardHours'))} + ${srcLabel(fm, 'hours')}`,
      note: derived
        ? '由「工作时长 > 标准工时上限」推导（本表无超时标注列）'
        : `${teamKnown - teamYes}/${teamKnown} 条未超时；另有 ${recs.length - teamKnown} 条未标注超时，未计入分母`,
    });
  }
  if (hasHours) {
    effMetrics.push({
      key: 'rate', label: '工作项产出率', value: safeDiv(totalItems, totalHours), unit: '项/小时',
      formatted: f3(safeDiv(totalItems, totalHours)),
      formula: `工作项总数 ÷ 总工时`,
      sourceField: `${col(fm, 'outputQuantity') ?? '记录条数'} ÷ ${srcLabel(fm, 'hours')}`,
      note: col(fm, 'outputQuantity') ? '工作项数取自产出数量字段' : '以「一条记录 = 一个工作项」近似',
    });
  }
  if (overtimeRate !== null) {
    effMetrics.push({
      key: 'overtimeRate', label: '整体超时率', value: overtimeRate, unit: '%', formatted: pctS(overtimeRate),
      formula: '超时记录数 ÷ 有超时标注的记录数',
      sourceField: srcLabel(fm, 'overtimeFlag', srcLabel(fm, 'standardHours')),
    });
  }
  // 「单条工时」只在「一行 ≈ 一个工作项」时成立。有独立产出数量列时，
  // 一行往往是一个统计周期（人月/人周），这时这两个指标没有意义，直接不输出。
  if (hasHours && !col(fm, 'outputQuantity')) {
    const perItem = recs.map(r => r.hours ?? 0).filter(h => h > 0);
    effMetrics.push(
      {
        key: 'avgPerItem', label: '单条平均工时', value: safeDiv(totalHours, totalItems), unit: '小时/项',
        formatted: f2(safeDiv(totalHours, totalItems)),
        formula: '总工时 ÷ 工作项总数', sourceField: `${srcLabel(fm, 'hours')} ÷ 记录条数`,
      },
      {
        key: 'medianPerItem', label: '单条工时中位数', value: median(perItem), unit: '小时/项',
        formatted: f2(median(perItem)),
        formula: '所有记录工时排序后的中位数', sourceField: srcLabel(fm, 'hours'),
      },
    );
  }
  if (totalAmount > 0 && totalHours > 0) {
    effMetrics.push({
      key: 'amountPerHour', label: '时均产出金额', value: safeDiv(totalAmount, totalHours), unit: '元/小时',
      formatted: f1(safeDiv(totalAmount, totalHours)),
      formula: `${sumOf(fm, 'outputAmount')} ÷ ${sumOf(fm, 'hours')}`,
      sourceField: `${srcLabel(fm, 'outputAmount')} ÷ ${srcLabel(fm, 'hours')}`,
      note: `每投入 1 小时，产出 ${f1(safeDiv(totalAmount, totalHours))} 元`,
    });
  }

  // 分组人效排名：有「产出金额 + 人工成本 + 分组维度」时最有信息量（部门表场景）
  const groupEffBars = groupAgg.size >= 2 && totalAmount > 0 && totalComp > 0
    ? toBars([...groupAgg.entries()]
        .filter(([, v]) => v.comp > 0 && v.amount > 0)
        .map(([label, v]) => ({
          label, value: safeDiv(v.amount, v.comp),
          formatted: `${f2(safeDiv(v.amount, v.comp))} 元/元`,
        })))
    : [];
  const personRateBars = hasHours
    ? toBars(perEmp.filter(e => e.hours > 0).map(e => ({ label: e.employee, value: e.rate, formatted: `${f3(e.rate)} 项/小时` })))
    : [];

  mods.push({
    moduleId: 'efficiency',
    moduleName: '人效比',
    active: activeIds.has('efficiency'),
    metrics: activeIds.has('efficiency') ? effMetrics : [],
    bars: groupEffBars.length ? groupEffBars : personRateBars,
    barsTitle: groupEffBars.length
      ? `分组人效排名 · 收入 ÷ 人工成本`
      : personRateBars.length ? '个人产出率 · 项/小时' : '',
    skippedReason: activeIds.has('efficiency') ? undefined : '当前字段组合无法构成任何一种人效比口径',
  });

  // ── 3. 分配与结构 ──
  // 这里的每个指标都只在它依赖的字段真实存在时才输出，
  // 缺字段时宁可不显示，也不给一个 0 —— 0 和「没数据」是两回事。
  const riskMetrics: PeopleMetric[] = [];
  if (perEmp.length >= 3) {
    if (hasHours) {
      const top3Hours = sum(perEmp.slice(0, 3).map(e => e.hours));
      riskMetrics.push({
        key: 'hoursTop3', label: '前 3 名工时占比', value: safeDiv(top3Hours, totalHours), unit: '%',
        formatted: pctS(safeDiv(top3Hours, totalHours)),
        formula: '工时最高的 3 人合计 ÷ 总工时', sourceField: srcLabel(fm, 'hours'),
      });
    }
    if (hasItems) {
      const top3Items = sum(perEmp.slice(0, 3).map(e => e.items));
      riskMetrics.push({
        key: 'itemsTop3', label: '前 3 名产出占比', value: safeDiv(top3Items, totalItems), unit: '%',
        formatted: pctS(safeDiv(top3Items, totalItems)),
        formula: '产出最高的 3 人合计 ÷ 工作项总数', sourceField: col(fm, 'outputQuantity') ?? '记录条数',
      });
    }
  }
  if (hasHours) {
    riskMetrics.push({
      key: 'hoursGini', label: '工时基尼系数', value: gini(perEmp.map(e => e.hours)), unit: '',
      formatted: gini(perEmp.map(e => e.hours)).toFixed(2),
      formula: '各人总工时的基尼系数', sourceField: srcLabel(fm, 'hours'),
      note: '0 为完全平均，1 为全部集中在一个人身上',
    });
    riskMetrics.push({
      key: 'rateCV', label: '产出率差异 CV', value: cv(perEmp.filter(e => e.rate > 0).map(e => e.rate)), unit: '',
      formatted: cv(perEmp.filter(e => e.rate > 0).map(e => e.rate)).toFixed(2),
      formula: '各人产出率的标准差 ÷ 均值',
      sourceField: `${col(fm, 'outputQuantity') ?? '记录条数'} ÷ ${srcLabel(fm, 'hours')}`,
      note: '变异系数，越大说明团队内部越不均衡',
    });
    const meetHours = sum(recs.filter(r => r.category && MEETING_RE.test(r.category)).map(r => r.hours ?? 0));
    if (meetHours > 0) {
      riskMetrics.push({
        key: 'meetingShare', label: '会议沟通工时占比', value: safeDiv(meetHours, totalHours), unit: '%',
        formatted: pctS(safeDiv(meetHours, totalHours)),
        formula: '会议/沟通/协调/对齐类记录的工时 ÷ 总工时',
        sourceField: `${srcLabel(fm, 'category')} + ${srcLabel(fm, 'hours')}`,
      });
    }
  }

  const riskActive = activeIds.has('risk') && riskMetrics.length > 0;
  const catGroups = col(fm, 'category') ? aggregateByGroup(recs, fm.mapping.category) : [];
  mods.push({
    moduleId: 'risk',
    moduleName: '分配与结构',
    active: riskActive,
    metrics: riskActive ? riskMetrics : [],
    bars: riskActive && catGroups.length
      ? toShareBars(catGroups.map(g => ({ label: g.label, value: valueOf(g) })), valueTotal)
      : [],
    barsTitle: catGroups.length ? `工作类别${valueWord}分布` : '',
    skippedReason: activeIds.has('risk')
      ? (riskMetrics.length ? undefined : '当前字段不足以计算分配结构指标（需要工时或产出数量）')
      : '需要人员字段，且至少有工时或超时标注',
  });

  // ── 4. 薪资分配 ──
  const compIsAttribute = !col(fm, 'outputQuantity');
  const compMetrics: PeopleMetric[] = [];

  // 薪资的分组占比：只在分组维度真的是「部门」时才出——工作类别跟薪资没有对应关系
  const deptCompRows = col(fm, 'department') && groupField === col(fm, 'department')
    ? [...groupAgg.entries()].filter(([, v]) => v.comp > 0).map(([label, v]) => ({ label, value: v.comp }))
    : [];
  const topDept = deptCompRows.slice().sort((a, b) => b.value - a.value)[0];

  if (activeIds.has('compensation')) {
    compMetrics.push(
      {
        key: 'totalComp', label: '总人工成本', value: totalComp, unit: '元', formatted: fmt(totalComp),
        formula: compIsAttribute
          ? `Σ（每个人的 ${col(fm, 'compensation')}，同一人多行取值相同时只计一次）`
          : `Σ[${col(fm, 'compensation')}]（逐行成本累加）`,
        sourceField: srcLabel(fm, 'compensation'),
      },
      {
        key: 'avgComp', label: entityIsFallback ? '平均人工成本' : compIsAttribute ? '平均薪资' : '人均人工成本',
        value: safeDiv(totalComp, perEmp.length), unit: `元/${empUnit}`,
        formatted: fmt(safeDiv(totalComp, perEmp.length)),
        formula: `总人工成本 ÷ ${entityIsFallback ? '分组数' : '员工数量'}`,
        sourceField: srcLabel(fm, 'compensation'),
        note: compIsAttribute
          ? '按「人员属性」计一次：同一人的薪酬在多行重复出现，判定为月薪而非逐行成本'
          : '按「逐行成本」累加：每行视为当期人工成本，此处为表内全周期人均值',
      },
      {
        key: 'compGini', label: '薪资集中度（基尼）', value: gini(perEmp.map(e => e.compensation)), unit: '',
        formatted: gini(perEmp.map(e => e.compensation)).toFixed(2),
        formula: '各人薪酬的基尼系数', sourceField: srcLabel(fm, 'compensation'),
        note: '0 为完全平均，1 为全部集中在一个人身上',
      },
      ...(topDept ? [{
        key: 'topDeptCompShare', label: '薪资最高部门占比',
        value: safeDiv(topDept.value, totalComp), unit: '%',
        formatted: pctS(safeDiv(topDept.value, totalComp)),
        formula: `${topDept.label} 的人工成本 ÷ 总人工成本`,
        sourceField: `${srcLabel(fm, 'department')} + ${srcLabel(fm, 'compensation')}`,
      }] : []),
    );
  }

  mods.push({
    moduleId: 'compensation',
    moduleName: '薪资分配',
    active: activeIds.has('compensation'),
    metrics: compMetrics,
    bars: !activeIds.has('compensation') ? []
      : deptCompRows.length
        ? toShareBars(deptCompRows, totalComp)
        : toBars(perEmp.filter(e => e.compensation > 0).map(e => ({ label: e.employee, value: e.compensation, formatted: `${fmt(e.compensation)} 元` }))),
    barsTitle: deptCompRows.length ? '部门薪资占比' : '个人薪资分布',
    skippedReason: activeIds.has('compensation') ? undefined : '未检测到薪资/人工成本字段（工资、薪资、人工成本、月度成本）',
  });

  return mods;
}

// ═══════════════════════════════════════════
// 诊断与总结
// ═══════════════════════════════════════════
const IMPACT: Record<string, string> = {
  PE01: '工时投入、产出效率',
  PE02: '工时分布、关键人风险',
  PE03: '标准工时达成、排期合理性',
  PE04: '超时分布、任务分配',
  PE05: '单条任务耗时结构',
  PE06: '团队效率离散度',
  PE07: '工作量分配均衡度',
  PE08: '工时结构、会议成本',
  PE09: '分析口径与数据完整性',
  PE10: '人工成本产出比',
  PE11: '部门成本结构',
};

function buildPeopleDiagnoses(rules: PeopleRule[]): Diagnosis[] {
  return rules.map((r, i) => ({
    title: r.ruleName,
    impactMetric: IMPACT[r.ruleId] ?? '人效综合指标',
    businessJudgment: r.conclusion,
    dataSupportedReasons: r.evidence,
    needsVerificationReasons: r.verify,
    confidence: Math.max(60, 93 - i * 3),
    rules: [r],
  }));
}

function buildSummary(a: Omit<PeopleAnalysis, 'summary'>, totalHours: number): string {
  const eff = a.modules.find(m => m.moduleId === 'efficiency');
  const rate = eff?.metrics.find(m => m.key === 'rate');
  const pass = eff?.metrics.find(m => m.key === 'passRate');
  const bits = [
    `本次共解析 ${fmt(a.rowCount)} 条记录，覆盖 ${a.employeeCount} ${a.entityIsFallback ? '个分组' : '人'}，总工时 ${f1(totalHours)} 小时。`,
    `人效比口径为「${a.efficiency.name} = ${a.efficiency.formula}」`,
    rate ? `，当前值 ${rate.formatted} ${rate.unit}` : '',
    pass ? `；标准工时达标率 ${pass.formatted}` : '',
    '。',
    a.rules.length > 1 ? `共命中 ${a.rules.length - 1} 条诊断规则。` : '',
    a.skippedDimensions.length ? `因缺少数据，以下维度已跳过：${a.skippedDimensions.map(s => s.dimension).join('、')}。` : '',
  ];
  return bits.join('');
}

// ═══════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════
export interface PeopleAnalysisInput {
  rows: Record<string, string>[];
  headers?: string[];
  customQuestion?: string;
}

export function runPeopleAnalysis(input: PeopleAnalysisInput): PeopleAnalysis | null {
  const { rows } = input;
  if (!rows.length) return null;

  const headers = input.headers?.length ? input.headers : headersOf(rows);
  const mapping = detectFields(headers, rows.slice(0, 60));
  const router = routeSkills(mapping, headers, rows);

  // 没有人员列时（「部门成本 + 产出」这类表），把分组维度当作分析主体。
  // 只用于取记录，展示用的 mapping 保持原样，不假装表里有人名列。
  const entityIsFallback = !mapping.mapping.employee && Boolean(router.groupField);
  const recs = entityIsFallback
    ? toPeopleRecords(rows, { ...mapping, mapping: { ...mapping.mapping, employee: router.groupField } })
    : toPeopleRecords(rows, mapping);

  const activeIds = new Set(router.modules.filter(m => m.active).map(m => m.moduleId));
  const perEmp = aggregateByEmployee(recs, !mapping.mapping.outputQuantity);
  const groups = aggregateByGroup(recs, router.groupField);
  const rules = runPeopleRules(recs, perEmp, groups, mapping);
  const modules = buildModules(recs, perEmp, groups, mapping, router.efficiency, router.groupField, router.groupFieldSource, activeIds, entityIsFallback);

  const skippedDimensions = router.modules
    .filter(m => !m.active)
    .map(m => ({ dimension: m.moduleId === 'compensation' ? '薪资成本分析' : m.moduleId, reason: m.reason }));

  const base: Omit<PeopleAnalysis, 'summary'> = {
    task: '人效分析',
    rowCount: recs.length,
    validRecordCount: recs.filter(r => r.hours !== null).length,
    employeeCount: perEmp.filter(e => e.employee !== '（未填写）').length,
    entityIsFallback,
    groupField: router.groupField,
    groupFieldSource: router.groupFieldSource,
    mapping,
    efficiency: router.efficiency,
    modules,
    rules,
    diagnoses: buildPeopleDiagnoses(rules),
    skippedDimensions,
  };

  const totalHours = sum(recs.map(r => r.hours ?? 0));
  return { ...base, summary: buildSummary(base, totalHours) };
}

export function generatePeopleReport(a: PeopleAnalysis): string {
  // 每个指标都带上算式与来源字段——报告里的数字必须能追溯回原始列
  const line = (m: PeopleMetric) => {
    const unit = m.unit && m.unit !== '%' ? ` ${m.unit}` : '';
    const sub = [
      m.formula ? `算式：${m.formula}` : '',
      m.sourceField ? `来源字段：${m.sourceField}` : '',
      m.note ?? '',
    ].filter(Boolean).map(s => `    - ${s}`).join('\n');
    return `- **${m.label}**：${m.formatted}${unit}${sub ? `\n${sub}` : ''}`;
  };

  const activeMods = a.modules.filter(m => m.active);
  const skipped = a.modules.filter(m => !m.active);
  const headline = a.modules.flatMap(m => m.metrics).find(m => m.key === 'headline');
  const empWord = a.entityIsFallback ? '分组数' : '员工数量';

  return `# 人效分析报告

## 1. 数据概览
- 记录条数：${fmt(a.rowCount)} 条
- ${empWord}：${a.employeeCount} ${a.entityIsFallback ? '组' : '人'}${a.entityIsFallback ? '（表中无人员列，按分组维度统计）' : ''}
- 分组维度：${a.groupField ?? '无'}（来源：${a.groupFieldSource === 'department' ? '部门字段' : a.groupFieldSource === 'category' ? '工作类别（兜底，非真实组织架构）' : a.groupFieldSource === 'fallback' ? '自动推断的分类列（兜底）' : '未识别到可用维度'}）
- 已识别字段：${Object.entries(a.mapping.mapping).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('、')}
- 未使用列：${a.mapping.unusedColumns.length ? a.mapping.unusedColumns.join('、') : '无'}

## 2. 人效比口径
**${a.efficiency.name}** = ${a.efficiency.formula}（单位：${a.efficiency.unit}）

${headline ? `**本次结果：${headline.formatted}${headline.unit && headline.unit !== '%' ? ` ${headline.unit}` : ''}** —— ${headline.note ?? ''}\n` : ''}
> ${a.efficiency.reason}

## 3. 分析指标
${activeMods.map(m => {
    const bars = m.bars.length
      ? `\n分布（${m.barsTitle}）：\n${m.bars.map(b => `  - ${b.label}：${b.formatted}`).join('\n')}`
      : '';
    return `### ${m.moduleName}\n${m.metrics.map(line).join('\n')}${bars}`;
  }).join('\n\n')}

${skipped.length ? `## 4. 已跳过的维度（数据不足）\n${skipped.map(m => `- **${m.moduleName}**：${m.skippedReason}`).join('\n')}\n\n补充对应字段后重新上传即可自动启用，无需改代码。\n\n` : ''}## ${skipped.length ? 5 : 4}. 人效异常诊断
${a.rules.map(r => `### 【${r.severity === 'high' ? '高' : r.severity === 'medium' ? '中' : '低'}】${r.ruleName}（${r.ruleId}）\n- 触发条件：${r.triggerCondition}\n- 数据证据：\n${r.evidence.map(e => `  - ${e}`).join('\n')}\n- 业务判断：${r.conclusion}\n- 建议动作：${r.suggestion}`).join('\n\n')}

## ${skipped.length ? 6 : 5}. 使用说明与边界
1. 本报告由**本地规则引擎**生成，未接入任何大模型，全部结论可追溯到上方列出的原始数字与来源字段。
2. 产出率类指标反映的是**工作量密度**，不是业务价值。同样的数字在不同任务构成下含义完全不同，不能直接用于人员评价。
3. 涉及个人的结论（PE01/PE03/PE05/PE10）都应先排除任务复杂度与岗位差异，再作判断。
4. 单点数据分析不出趋势。建议按月上传同一口径的数据，观察指标变化而非绝对值。

---
本报告由本地规则引擎与模拟 AI 总结生成，后续可替换为真实 LLM API 生成更自然的业务复盘。`;
}
