export type TaskType = '人效分析' | '618 大促复盘' | '双11 活动复盘' | '会员日活动复盘' | '新品上线复盘' | '渠道效果分析' | '自定义分析';
export type Step = 1|2|3|4|5|6|7|8;
export type Severity = 'high' | 'medium' | 'low';

export interface OperationRow {
  日期: string;
  渠道: string;
  曝光量: number;
  点击量: number;
  点击率: number;
  下单量: number;
  转化率: number;
  GMV: number;
  客单价: number;
  退款率: number;
  用户反馈关键词: string;
}

export interface FeedbackRow {
  日期?: string;
  渠道?: string;
  反馈类别?: string;
  用户反馈?: string;
  情绪?: string;
  关键词?: string;
  [key: string]: string | undefined;
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  triggerCondition: string;
  evidence: string[];
  conclusion: string;
  suggestion: string;
}

export interface Diagnosis {
  title: string;
  impactMetric: string;
  businessJudgment: string;
  dataSupportedReasons: string[];
  needsVerificationReasons: string[];
  confidence: number;
  rules: RuleResult[];
}

export interface FollowUpMessage {
  question: string;
  answer: string;
}

// ── UR (User Researcher) types ──
export type URTaskType = '用户反馈分析' | '客服记录分析' | '评价情感分析' | '产品体验分析' | 'NPS调研分析' | '自定义分析';
export type URStep = 1 | 2 | 3 | 4;

export interface URFeedbackRow {
  反馈内容: string;
  情绪?: string;
  类别?: string;
  来源?: string;
  [key: string]: string | undefined;
}

export interface SentimentResult {
  positive: number;
  neutral: number;
  negative: number;
  disputed: number;
  total: number;
}

export interface URKeyword {
  word: string;
  count: number;
  sentiment: '正面' | '中性' | '负面';
}

export interface URTheme {
  name: string;
  count: number;
  severity: '高' | '中' | '低';
  keywords: string[];
  quotes: string[];
  suggestion: string;
  needsManualReview?: boolean;
}

export interface InsightResult {
  sentiment: SentimentResult;
  keywords: URKeyword[];
  themes: URTheme[];
  summary: string;
}

// ── People Efficiency (人效分析) types ──

/** 字段理解层的规范字段：不管原始表头叫什么，最终都归到这 11 类之一 */
export type CanonicalField =
  | 'employee'
  | 'department'
  | 'category'
  | 'taskDescription'
  | 'date'
  | 'hours'
  | 'standardHours'
  | 'overtimeFlag'
  | 'outputQuantity'
  | 'outputAmount'
  | 'compensation';

export type MatchStrategy = 'exact' | 'alias-substring';

export interface FieldMatch {
  column: string;
  strategy: MatchStrategy;
  confidence: number;
}

export interface FieldMapping {
  /** 规范字段 → 原始列名；null 表示这张表里没有这类数据 */
  mapping: Record<CanonicalField, string | null>;
  matchedBy: Partial<Record<CanonicalField, FieldMatch>>;
  /** 没识别出来的规范字段 */
  unresolved: CanonicalField[];
  /** 原始表里没被用上的列，透明列出 */
  unusedColumns: string[];
  /** 多列竞争同一个规范字段的情况，暴露给用户看，不偷偷选一个 */
  ambiguous: { field: CanonicalField; candidates: string[] }[];
}

/** 一行原始数据归一化后的样子 */
export interface PeopleRecord {
  employee: string;
  department: string | null;
  category: string | null;
  date: string | null;
  hours: number | null;
  stdLow: number | null;
  stdHigh: number | null;
  overtime: boolean | null;
  outputQty: number | null;
  outputAmount: number | null;
  compensation: number | null;
  raw: Record<string, string>;
}

export interface PeopleMetric {
  key: string;
  label: string;
  value: number;
  unit: string;
  formatted: string;
  note?: string;
}

/** 分布条形：用 div 宽度画，不引图表库 */
export interface PeopleBar {
  label: string;
  value: number;
  formatted: string;
  ratio: number;
}

export type PeopleModuleId = 'compensation' | 'productivity' | 'efficiency' | 'risk';

export interface PeopleModuleResult {
  moduleId: PeopleModuleId;
  moduleName: string;
  active: boolean;
  metrics: PeopleMetric[];
  bars: PeopleBar[];
  barsTitle?: string;
  skippedReason?: string;
}

export interface EfficiencyDefinition {
  name: string;
  formula: string;
  unit: string;
  /** 为什么选了这个口径，以及它的局限 */
  reason: string;
}

export interface SkippedDimension {
  dimension: string;
  reason: string;
}

export interface PeopleAnalysis {
  task: '人效分析';
  rowCount: number;
  validRecordCount: number;
  employeeCount: number;
  /** true = 表里没有人员列，分析主体退化为分组维度（如部门），此时 employeeCount 是分组数 */
  entityIsFallback: boolean;
  groupField: string | null;
  groupFieldSource: 'department' | 'category' | 'fallback' | 'none';
  mapping: FieldMapping;
  efficiency: EfficiencyDefinition;
  modules: PeopleModuleResult[];
  /** 复用现有 RuleResult，诊断卡不用改 */
  rules: RuleResult[];
  diagnoses: Diagnosis[];
  summary: string;
  skippedDimensions: SkippedDimension[];
}
