export type TaskType = '618 大促复盘' | '双11 活动复盘' | '会员日活动复盘' | '新品上线复盘' | '渠道效果分析' | '自定义分析';
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
