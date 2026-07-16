// ═══════════════════════════════════════════════════════
// Version Manager — 历史版本保存/恢复/对比
// 使用 localStorage 持久化
// ═══════════════════════════════════════════════════════

import { FunnelStageMetrics } from './mockDataGenerator';
import { ExperimentPlan, AIDecision, ActionItem } from './growthEngine';

// ── Types ──

export interface PriorityScore {
  total: number;
  impact: number;
  relevance: number;
  cost: number;
  resourceMatch: number;
  confidence: number;
  period: number;
}

export interface DynamicOpportunity {
  name: string;
  bottleneck: string;
  currentData: string;
  priorityLabel: string;
  priorityScore: PriorityScore;
}

export interface GrowthVersion {
  versionId: string;
  versionNumber: number;
  createdAt: string;
  scene: string;
  goal: string;
  targetUsers: string;
  currentRate: string;
  targetRate: string;
  dataSummary: string;
  changes: string[];
  funnelMetrics: FunnelStageMetrics[];
  feedbackKeywords: Record<string, { count: number; ratio: number }>;
  opportunities: DynamicOpportunity[];
  experimentPlan: ExperimentPlan | null;
  aiDecision: AIDecision | null;
  actionItems: ActionItem[];
}

export interface VersionDiff {
  inputChanges: string[];
  funnelChanges: { stage: string; old: string; new: string }[];
  priorityChanges: { name: string; oldPriority: string; newPriority: string }[];
  confidenceChanges: { old: string; new: string };
  actionChanges: { old: string; new: string }[];
}

const STORAGE_KEY = 'ai-growth-manager-versions';

// ── Storage helpers ──

export function saveVersion(v: GrowthVersion): void {
  try {
    const versions = getVersions();
    const idx = versions.findIndex((x) => x.versionId === v.versionId);
    if (idx >= 0) versions[idx] = v;
    else versions.push(v);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(versions));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

export function getVersions(): GrowthVersion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function deleteVersion(versionId: string): void {
  const versions = getVersions().filter((v) => v.versionId !== versionId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(versions));
}

export function getNextVersionNumber(): number {
  const versions = getVersions();
  return versions.length > 0 ? Math.max(...versions.map((v) => v.versionNumber)) + 1 : 1;
}

// ── Version diff ──

export function compareVersions(v1: GrowthVersion, v2: GrowthVersion): VersionDiff {
  // Input changes
  const inputChanges: string[] = [];
  if (v1.scene !== v2.scene) inputChanges.push(`场景：${v1.scene} → ${v2.scene}`);
  if (v1.goal !== v2.goal) inputChanges.push(`目标：${v1.goal} → ${v2.goal}`);
  if (v1.targetUsers !== v2.targetUsers) inputChanges.push(`目标用户：${v1.targetUsers} → ${v2.targetUsers}`);
  if (v1.dataSummary !== v2.dataSummary) inputChanges.push(`数据：${v1.dataSummary} → ${v2.dataSummary}`);

  // Funnel changes
  const funnelChanges: VersionDiff['funnelChanges'] = [];
  const allStages = new Set([...v1.funnelMetrics.map((m) => m.stage), ...v2.funnelMetrics.map((m) => m.stage)]);
  for (const stage of allStages) {
    const old = v1.funnelMetrics.find((m) => m.stage === stage);
    const n = v2.funnelMetrics.find((m) => m.stage === stage);
    const oldStr = old ? `${old.conversionRate}%，${old.status}` : '—';
    const newStr = n ? `${n.conversionRate}%，${n.status}` : '—';
    if (oldStr !== newStr) funnelChanges.push({ stage, old: oldStr, new: newStr });
  }

  // Priority changes
  const priorityChanges: VersionDiff['priorityChanges'] = [];
  for (let i = 0; i < Math.max(v1.opportunities.length, v2.opportunities.length); i++) {
    const o1 = v1.opportunities[i];
    const o2 = v2.opportunities[i];
    if (o1 && o2 && o1.priorityLabel !== o2.priorityLabel) {
      priorityChanges.push({ name: o1.name, oldPriority: o1.priorityLabel, newPriority: o2.priorityLabel });
    }
  }

  // Confidence changes
  const oldConf = v1.aiDecision ? `${v1.aiDecision.confidence.level} (${v1.aiDecision.confidence.stars}★)` : '—';
  const newConf = v2.aiDecision ? `${v2.aiDecision.confidence.level} (${v2.aiDecision.confidence.stars}★)` : '—';
  const confidenceChanges = { old: oldConf, new: newConf };

  // Action changes
  const actionChanges: { old: string; new: string }[] = [];
  if (v1.aiDecision?.topAction?.name !== v2.aiDecision?.topAction?.name) {
    actionChanges.push({
      old: v1.aiDecision?.topAction?.name || '—',
      new: v2.aiDecision?.topAction?.name || '—',
    });
  }

  return { inputChanges, funnelChanges, priorityChanges, confidenceChanges, actionChanges };
}

// ═══════════════════════════════════════════════════════
// Priority scoring engine
// ═══════════════════════════════════════════════════════

export function calculatePriorityScore(
  opportunityName: string,
  bottleneck: string,
  funnelMetrics: FunnelStageMetrics[],
  resources: string[],
  avgConfidence: number,
): PriorityScore {
  // Impact: higher if the bottleneck is severe
  const severityRank: Record<string, number> = { '严重流失': 10, '中度流失': 7, '轻度流失': 4, '临界/需进一步验证': 2, '正常': 0 };
  const worst = [...funnelMetrics].sort((a, b) => (severityRank[b.status] || 0) - (severityRank[a.status] || 0))[0];
  const impact = Math.min(10, (severityRank[worst?.status || '正常'] || 3) + 2);

  // Relevance: how well the opportunity matches the bottleneck
  let relevance = 5;
  if (opportunityName.includes('优惠券') && bottleneck.includes('加购→提交订单')) relevance = 10;
  else if (opportunityName.includes('优惠券') && bottleneck.includes('提交订单→支付')) relevance = 8;
  else if (opportunityName.includes('物流') && bottleneck.includes('提交订单→支付')) relevance = 10;
  else if (opportunityName.includes('物流') && bottleneck.includes('加购→提交订单')) relevance = 6;
  else if (opportunityName.includes('规则') && bottleneck.includes('详情页→加购')) relevance = 10;
  else if (opportunityName.includes('规则') && bottleneck.includes('加购→提交订单')) relevance = 7;
  else if (opportunityName.includes('优惠券')) relevance = 7;
  else if (opportunityName.includes('物流')) relevance = 7;
  else if (opportunityName.includes('规则')) relevance = 6;

  // Cost: lower cost = higher score
  let cost = 6;
  if (opportunityName.includes('优惠券')) cost = 8; // Low cost - just UI changes
  else if (opportunityName.includes('规则')) cost = 9; // Very low cost - text changes
  else if (opportunityName.includes('物流')) cost = 6; // Medium - needs ops alignment

  // Resource match
  const hasCoupon = resources.includes('优惠券');
  const hasPage = resources.includes('活动页');
  const hasMsg = resources.includes('站内消息') || resources.includes('Push 推送');
  let resourceMatch = 5;
  if (opportunityName.includes('优惠券') && (hasCoupon || hasPage)) resourceMatch = 8;
  else if (opportunityName.includes('规则') && hasPage) resourceMatch = 8;
  else if (opportunityName.includes('物流') && hasMsg) resourceMatch = 7;
  else if (opportunityName.includes('优惠券')) resourceMatch = 6;
  else if (opportunityName.includes('规则')) resourceMatch = 7;

  // Confidence: higher confidence = higher score
  const confidence = Math.round(avgConfidence / 10); // 0-100 → 0-10

  // Period: shorter = higher score
  let period = 6;
  if (opportunityName.includes('优惠券')) period = 8; // Quick to implement
  else if (opportunityName.includes('规则')) period = 9; // Fastest
  else if (opportunityName.includes('物流')) period = 5; // Needs coordination

  // Weighted total (max ~60)
  const total = Math.round(
    impact * 1.5 + relevance * 1.5 + cost * 1.0 + resourceMatch * 0.8 + confidence * 0.7 + period * 0.5
  );

  return { total, impact, relevance, cost, resourceMatch, confidence, period };
}

export function assignPriorities(scores: { name: string; score: PriorityScore }[]): { name: string; priorityLabel: string; score: PriorityScore }[] {
  const sorted = [...scores].sort((a, b) => b.score.total - a.score.total);

  const result: { name: string; priorityLabel: string; score: PriorityScore }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let label: string;
    const prevLabel = i > 0 ? result[i - 1].priorityLabel : null;
    const prevScore = i > 0 ? sorted[i - 1].score.total : Infinity;

    if (i === 0) {
      label = 'P0';
    } else if (prevScore - sorted[i].score.total <= 3) {
      // Close to previous → same priority
      label = prevLabel || 'P1';
    } else if (i === 1) {
      label = 'P1';
    } else {
      label = 'P2';
    }

    result.push({ name: sorted[i].name, priorityLabel: label, score: sorted[i].score });
  }
  return result;
}
