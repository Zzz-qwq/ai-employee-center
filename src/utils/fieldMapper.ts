import { CanonicalField, FieldMapping, MatchStrategy, PeopleRecord } from '../types';

/**
 * 字段理解层。
 *
 * 目标：用户上传的表叫什么列名都行，只要数据语义对得上，就能分析。
 *
 * 难点不是"认识工资/薪资"，而是**排除**——真实的工作日报里有
 *   工作时长 / 标准工时范围 / 是否超出标准时长 / 超时原因
 * 四列都含"工时"或"超时"，靠"列名含哪个词"必然错分。
 * 所以每组同义词都带 exclude 词表：命中排除词直接出局。
 */

interface SynonymGroup {
  field: CanonicalField;
  synonyms: string[];
  exclude?: string[];
}

const GROUPS: SynonymGroup[] = [
  {
    field: 'employee',
    synonyms: ['日报提交人', '提交人', '填报人', '员工姓名', '姓名', '员工编号', '工号', '员工', '人员', '负责人', '成员', '用户名', 'owner', 'name', 'employee', 'staff'],
  },
  {
    field: 'department',
    synonyms: ['所属部门', '一级部门', '二级部门', '部门', '组织', '团队', '小组', '事业部', 'dept', 'department', 'team'],
  },
  {
    field: 'category',
    synonyms: ['工作类别', '工作类型', '类别', '分类', '类型', '工种', '项目类别', '业务类型', '分类名称', 'category', 'type'],
  },
  {
    field: 'taskDescription',
    synonyms: ['工作内容描述', '工作内容', '内容描述', '任务描述', '事项', '摘要', '描述', '内容', '任务', 'description', 'content', 'task', 'summary'],
  },
  {
    field: 'hours',
    synonyms: ['工作时长', '实际工时', '投入工时', '工时数', '耗时', '小时数', '累计工时', '工时合计', '总工时', '工时', 'hours', 'worktime', 'manhours'],
    exclude: ['标准', '范围', '基准', '区间', '上限', '下限'],   // ← 挡住「标准工时范围」
  },
  {
    field: 'standardHours',
    synonyms: ['标准工时范围', '标准工时', '标准时长', '基准工时', 'standardhoursrange', 'standardhours'],
    exclude: ['实际', '是否', '超出', '超标'],                    // ← 挡住「是否超出标准时长」
  },
  {
    field: 'overtimeFlag',
    synonyms: ['是否超出标准时长', '是否超时', '是否超标', '超时', '超额', 'overtime', 'overrun'],
    exclude: ['原因', '说明', '备注'],                            // ← 挡住「超时原因」
  },
  {
    field: 'outputQuantity',
    synonyms: ['项目交付数', '完成数量', '产出数量', '交付数量', '完成数', '产出数', '交付数', '交付量', '产出量', '任务数量', '任务数', '订单数', '项目数', '件数', '单量', '数量', '产出', '工作量', 'qty', 'quantity', 'count'],
    exclude: ['成果', '关联', '备注', '金额', '销售额', '率'],      // ← 挡住「产出成果关联」
  },
  {
    field: 'outputAmount',
    synonyms: ['销售额', '营收额', '营收', '收入', '成交额', '合同额', '回款', 'gmv', 'amount', 'revenue', 'sales', 'turnover'],
  },
  {
    field: 'compensation',
    synonyms: ['月度人工成本', '人工成本', '人工费用', '人力成本', '月度成本', '月工资', '月薪', '工资', '薪资', '薪酬', 'salary', 'wage', 'payroll', 'cost'],
  },
  {
    field: 'date',
    synonyms: ['提交日期', '统计日期', '发生日期', '日期', '月份', '月', '周期', 'date', 'month', 'period'],
    exclude: ['开始', '结束', '更新', '最后'],                    // ← 挡住「开始/结束/最后更新时间」
  },
];

const ALL_FIELDS: CanonicalField[] = GROUPS.map(g => g.field);

/** 全角转半角、去空白与标点、转小写。`日期 3` → `日期3`，`Parent items 2` → `parentitems2` */
export function normalizeHeader(h: string): string {
  return String(h ?? '')
    .replace(/^﻿/, '')
    .replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[　\s]/g, '')
    .replace(/[_\-()（）【】\[\]:：/\\|.·*]/g, '')
    .toLowerCase();
}

function scoreHeader(header: string, g: SynonymGroup): { score: number; strategy: MatchStrategy } | null {
  const h = normalizeHeader(header);
  if (!h) return null;

  // 第一关：排除词命中直接出局
  if (g.exclude?.some(x => h.includes(normalizeHeader(x)))) return null;

  // 第二关：精确匹配
  for (const syn of g.synonyms) {
    if (h === normalizeHeader(syn)) return { score: 100, strategy: 'exact' };
  }

  // 第三关：包含匹配，同义词越长越具体，得分越高
  let best = 0;
  for (const syn of g.synonyms) {
    const s = normalizeHeader(syn);
    if (s && h.includes(s)) best = Math.max(best, 40 + Math.min(s.length, 8));
  }
  return best ? { score: best, strategy: 'alias-substring' } : null;
}

/**
 * 识别表头。每列最多被一个规范字段占用；同分时用「该列在样本里的填充率」
 * 打破平局——更实的一列更可能是真字段。
 */
export function detectFields(headers: string[], sampleRows: Record<string, string>[] = []): FieldMapping {
  type Cand = { header: string; field: CanonicalField; score: number; strategy: MatchStrategy; fill: number };
  const cands: Cand[] = [];

  for (const header of headers) {
    const fill = sampleRows.length
      ? sampleRows.filter(r => String(r[header] ?? '').trim() !== '').length / sampleRows.length
      : 0;
    for (const g of GROUPS) {
      const m = scoreHeader(header, g);
      if (m) cands.push({ header, field: g.field, score: m.score, strategy: m.strategy, fill });
    }
  }

  cands.sort((a, b) => b.score - a.score || b.fill - a.fill || a.header.length - b.header.length);

  const mapping = {} as Record<CanonicalField, string | null>;
  const matchedBy: FieldMapping['matchedBy'] = {};
  const usedHeaders = new Set<string>();
  const ambiguous: FieldMapping['ambiguous'] = [];

  for (const c of cands) {
    if (mapping[c.field] != null) {
      if (!usedHeaders.has(c.header)) {
        const existing = ambiguous.find(a => a.field === c.field);
        if (existing) existing.candidates.push(c.header);
        else ambiguous.push({ field: c.field, candidates: [mapping[c.field]!, c.header] });
      }
      continue;
    }
    if (usedHeaders.has(c.header)) continue;   // 一列只能归一个规范字段
    mapping[c.field] = c.header;
    matchedBy[c.field] = { column: c.header, strategy: c.strategy, confidence: c.score >= 100 ? 1 : 0.75 };
    usedHeaders.add(c.header);
  }

  for (const f of ALL_FIELDS) if (mapping[f] === undefined) mapping[f] = null;

  return {
    mapping,
    matchedBy,
    ambiguous,
    unresolved: ALL_FIELDS.filter(f => mapping[f] == null),
    unusedColumns: headers.filter(h => !usedHeaders.has(h)),
  };
}

/** 去 ¥ / % / 千分位 / 全角；解析不了返回 null（区别于 0） */
export function parseNumber(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v)
    .replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,¥￥$%\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** `0.5 ~ 2.0` / `0.1~5.0` / `1.0-4.0` / `0.3至1.0` 都吃 */
export function parseBand(v: unknown): [number, number] | null {
  const m = String(v ?? '').match(/([\d.]+)\s*[~～\-—至到]\s*([\d.]+)/);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return lo <= hi ? [lo, hi] : [hi, lo];
}

function parseFlag(v: unknown): boolean | null {
  const s = normalizeHeader(String(v ?? ''));
  if (!s) return null;
  if (['是', 'y', 'yes', 'true', '1', '超时', '超出'].includes(s)) return true;
  if (['否', 'n', 'no', 'false', '0', '未超时', '正常'].includes(s)) return false;
  return null;
}

/** 原始行 → 归一化记录。缺失字段一律 null，不填 0 */
export function toPeopleRecords(rows: Record<string, string>[], fm: FieldMapping): PeopleRecord[] {
  const col = (f: CanonicalField) => fm.mapping[f];

  return rows.map(raw => {
    const str = (f: CanonicalField): string | null => {
      const c = col(f);
      if (!c) return null;
      const v = String(raw[c] ?? '').trim();
      return v === '' ? null : v;
    };
    const num = (f: CanonicalField): number | null => {
      const c = col(f);
      return c ? parseNumber(raw[c]) : null;
    };

    const hours = num('hours');
    const band = col('standardHours') ? parseBand(raw[col('standardHours')!]) : null;
    const flagCol = col('overtimeFlag');

    // 有「是否超出标准时长」这一列，就**只**认它——空值保持 null，不许拿标准工时去补，
    // 否则会把没标注的记录算成"未超时"，悄悄美化达标率。
    // 只有在整张表完全没有超时标注列时，才退而用 工作时长 > 标准上限 推导。
    let overtime = flagCol ? parseFlag(raw[flagCol]) : null;
    if (!flagCol && hours !== null && band && hours > 0) overtime = hours > band[1];

    return {
      employee: (str('employee') ?? '').trim(),
      department: str('department'),
      category: str('category'),
      date: str('date'),
      hours,
      stdLow: band ? band[0] : null,
      stdHigh: band ? band[1] : null,
      overtime,
      outputQty: num('outputQuantity'),
      outputAmount: num('outputAmount'),
      compensation: num('compensation'),
      raw,
    };
  });
}

/** 超时是否由「工作时长 > 标准上限」推导而来（用于在界面上自曝口径） */
export function isOvertimeDerived(fm: FieldMapping): boolean {
  return !fm.mapping.overtimeFlag && !!fm.mapping.standardHours && !!fm.mapping.hours;
}

/**
 * 分组维度降级：department → category → 未使用列里的低基数分类列 → null。
 * 真实日报没有部门列，会落到「工作类别」——界面上必须标注这是兜底维度。
 */
export function resolveGroupField(
  fm: FieldMapping,
  headers: string[],
  rows: Record<string, string>[],
): { field: string | null; source: PeopleAnalysisGroupSource } {
  if (fm.mapping.department) return { field: fm.mapping.department, source: 'department' };
  if (fm.mapping.category) return { field: fm.mapping.category, source: 'category' };

  const sample = rows.slice(0, 200);
  for (const h of fm.unusedColumns) {
    const vals = sample.map(r => String(r[h] ?? '').trim()).filter(Boolean);
    if (!vals.length) continue;
    const distinct = new Set(vals);
    const avgLen = vals.reduce((a, v) => a + v.length, 0) / vals.length;
    if (distinct.size >= 2 && distinct.size <= 20 && avgLen <= 12) {
      return { field: h, source: 'fallback' };
    }
  }
  return { field: null, source: 'none' };
}

export type PeopleAnalysisGroupSource = 'department' | 'category' | 'fallback' | 'none';

/** headers 从样本行里推断（解析器返回的是对象数组） */
export function headersOf(rows: Record<string, string>[]): string[] {
  return rows.length ? Object.keys(rows[0]) : [];
}
