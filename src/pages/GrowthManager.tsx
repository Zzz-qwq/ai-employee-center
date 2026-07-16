import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, ArrowRight, Check, Star, X, Plus, Loader2, ChevronDown, ChevronUp,
  TrendingUp, UserPlus, Zap, Heart, Repeat, Undo2, GitBranch, Edit3,
  Copy, Download, RotateCcw, FileText,
} from 'lucide-react';
import FileUpload from '../components/FileUpload';
import MockDataModal from '../components/MockDataModal';
import {
  MockConfig,
  generateFunnelCSV,
  generateOpsCSV,
  generateFeedbackCSV,
  computeFunnelMetrics,
  analyzeFeedbackKeywords,
  FunnelStageMetrics,
} from '../utils/mockDataGenerator';
import {
  ExperimentPlan,
  AIDecision,
  ActionItem,
  ExperimentContext,
  generateExperimentPlan,
  generateAIDecision,
  generateActionItems,
  exportActionPlanMarkdown,
} from '../utils/growthEngine';
import {
  GrowthVersion,
  VersionDiff,
  PriorityScore,
  DynamicOpportunity,
  saveVersion,
  getVersions,
  deleteVersion,
  getNextVersionNumber,
  compareVersions,
  calculatePriorityScore,
  assignPriorities,
} from '../utils/versionManager';

// ═══════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════

type GrowthGoal = '转化提升' | '拉新增长' | '用户激活' | '留存提升' | '复购增长' | '流失召回' | '渠道优化' | '自定义目标';

const goals: { label: GrowthGoal; icon: typeof TrendingUp; desc: string }[] = [
  { label: '转化提升', icon: TrendingUp, desc: '优化现有流量到付费/下单的转化链路，提升每一步的转化效率' },
  { label: '拉新增长', icon: UserPlus, desc: '拓展新用户获取渠道，降低获客成本，提升新用户数量与质量' },
  { label: '用户激活', icon: Zap, desc: '引导新用户完成关键行为，快速体验到产品的核心价值' },
  { label: '留存提升', icon: Heart, desc: '提升用户回访频次与使用深度，减少用户流失' },
  { label: '复购增长', icon: Repeat, desc: '提升已购用户的重复购买率与客单价，延长用户生命周期价值' },
  { label: '流失召回', icon: Undo2, desc: '识别流失用户并制定召回策略，提升回流率' },
  { label: '渠道优化', icon: GitBranch, desc: '评估各渠道效率与 ROI，优化渠道组合与资源分配' },
  { label: '自定义目标', icon: Edit3, desc: '输入你关注的增长指标，AI 将为你定制增长策略' },
];

const sceneOptions = ['电商活动', '新品上线', '会员运营', '渠道投放', '内容增长', '用户召回', '自定义场景'];
const resourceOptions = ['优惠券', '活动页', '站内消息', '用户分群', 'Push 推送', '短信', '社媒投放'];
const stepLabels = [
  { label: '选择增长目标' }, { label: '业务现状' }, { label: '智能诊断' }, { label: '增长机会' },
  { label: '实验方案' }, { label: '增长决策' }, { label: '行动计划' },
];
const defaultSpecificGoal: Record<GrowthGoal, string> = {
  '转化提升': '提升活动页下单转化率', '拉新增长': '提升新增用户数或降低获客成本',
  '用户激活': '提升关键行为完成率', '留存提升': '提升次日或7日留存率',
  '复购增长': '提升用户复购率', '流失召回': '提升流失用户召回率',
  '渠道优化': '提升渠道 ROI', '自定义目标': '',
};
const DIAG_DELAYS = [800, 1200, 1500, 1000, 900];
const workflowItems = ['读取业务目标', '分析转化路径', '识别增长瓶颈', '匹配增长机会', '整理增长机会'];

interface FileEntry { name: string; status: 'uploaded' }

// ── Secondary verification types ──
type VerificationConclusion = '确认异常' | '正常波动' | '继续观察';

interface VerificationResult {
  conclusion: VerificationConclusion;
  confidence: number;
  historicalBaseline: { period: string; rate: number }[];
  channelBreakdown: { channel: string; rate: number; trend: '↑' | '↓' | '→'; delta: string }[];
  trend: { direction: 'up' | 'down' | 'flat'; description: string };
  feedbackCorrelation: { keyword: string; count: number; impact: string }[];
  summary: string;
}

const verifiedStatusStyles: Record<VerificationConclusion, { dot: string; bg: string; border: string; text: string; label: string }> = {
  '确认异常':   { dot: 'bg-red-500',    bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    label: '确认异常' },
  '正常波动':   { dot: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: '正常波动' },
  '继续观察':   { dot: 'bg-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  label: '继续观察' },
};

// ── Status badge colors ──
const statusStyles: Record<string, { dot: string; bg: string; border: string; text: string }> = {
  '正常':       { dot: 'bg-emerald-500', bg: 'bg-emerald-50',  border: 'border-emerald-200', text: 'text-emerald-700' },
  '轻度流失':   { dot: 'bg-orange-500',  bg: 'bg-orange-50',   border: 'border-orange-200',  text: 'text-orange-700' },
  '中度流失':   { dot: 'bg-amber-500',   bg: 'bg-amber-50',    border: 'border-amber-200',   text: 'text-amber-700' },
  '严重流失':   { dot: 'bg-red-500',     bg: 'bg-red-50',      border: 'border-red-200',     text: 'text-red-700' },
  '临界/需进一步验证': { dot: 'bg-zinc-500', bg: 'bg-zinc-50', border: 'border-zinc-200', text: 'text-zinc-700' },
};

// ═══════════════════════════════════════════
// Component
// ═══════════════════════════════════════════

export default function GrowthManager({ onHome }: { onHome: () => void }) {
  // ── Flow ──
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<GrowthGoal>('转化提升');

  // ── Form ──
  const [scene, setScene] = useState('电商活动');
  const [specificGoal, setSpecificGoal] = useState(defaultSpecificGoal['转化提升']);
  const [currentRate, setCurrentRate] = useState('3.8');
  const [targetRate, setTargetRate] = useState('4.5');
  const [knownIssue, setKnownIssue] = useState('曝光上涨但转化下降');
  const [resources, setResources] = useState<string[]>(['优惠券', '活动页', '站内消息', '用户分群']);
  const [customResources, setCustomResources] = useState<string[]>([]);
  const [customResourceInput, setCustomResourceInput] = useState('');
  const [resourceConstraints, setResourceConstraints] = useState('');

  // ── Custom scene fields ──
  const [customSceneName, setCustomSceneName] = useState('');
  const [customSceneDesc, setCustomSceneDesc] = useState('');
  const [targetUsers, setTargetUsers] = useState('活动页访问用户');
  const [customSceneChain, setCustomSceneChain] = useState('');
  const targetUsersManuallySet = useRef(false);

  // ── Diagnosis snapshot: compare on back/forward to avoid unnecessary recalculation ──
  const stepSnapshot = useRef<{
    scene: string; goal: string; targetUsers: string; currentRate: string; targetRate: string;
    resources: string[]; customResources: string[]; resourceConstraints: string;
    knownIssue: string; useMockData: boolean; specificGoal: string;
    customGoalName: string; customGoalMetric: string; customGoalCurrent: string; customGoalTarget: string; customGoalPeriod: string;
    customSceneName: string; customSceneDesc: string; customSceneChain: string;
  } | null>(null);
  const hasEverCompletedDiagnosis = useRef(false);

  const saveStepSnapshot = () => {
    stepSnapshot.current = {
      scene, goal, targetUsers, currentRate, targetRate,
      resources: [...resources], customResources: [...customResources],
      resourceConstraints, knownIssue, useMockData, specificGoal,
      customGoalName, customGoalMetric, customGoalCurrent, customGoalTarget, customGoalPeriod,
      customSceneName, customSceneDesc, customSceneChain,
    };
  };

  const hasFieldsChanged = () => {
    const s = stepSnapshot.current;
    if (!s) return false; // No snapshot → nothing to compare
    return (
      s.scene !== scene || s.goal !== goal || s.targetUsers !== targetUsers ||
      s.currentRate !== currentRate || s.targetRate !== targetRate ||
      JSON.stringify(s.resources) !== JSON.stringify(resources) ||
      JSON.stringify(s.customResources) !== JSON.stringify(customResources) ||
      s.resourceConstraints !== resourceConstraints ||
      s.knownIssue !== knownIssue || s.useMockData !== useMockData ||
      s.specificGoal !== specificGoal ||
      s.customGoalName !== customGoalName || s.customGoalMetric !== customGoalMetric ||
      s.customGoalCurrent !== customGoalCurrent || s.customGoalTarget !== customGoalTarget ||
      s.customGoalPeriod !== customGoalPeriod ||
      s.customSceneName !== customSceneName || s.customSceneDesc !== customSceneDesc ||
      s.customSceneChain !== customSceneChain
    );
  };

  const restoreStepSnapshot = () => {
    const s = stepSnapshot.current;
    if (!s) return;
    setScene(s.scene as typeof scene);
    setTargetUsers(s.targetUsers);
    setCurrentRate(s.currentRate);
    setTargetRate(s.targetRate);
    setResources(s.resources);
    setCustomResources(s.customResources);
    setResourceConstraints(s.resourceConstraints);
    setKnownIssue(s.knownIssue);
    setSpecificGoal(s.specificGoal);
    setCustomGoalName(s.customGoalName);
    setCustomGoalMetric(s.customGoalMetric);
    setCustomGoalCurrent(s.customGoalCurrent);
    setCustomGoalTarget(s.customGoalTarget);
    setCustomGoalPeriod(s.customGoalPeriod);
    setCustomSceneName(s.customSceneName);
    setCustomSceneDesc(s.customSceneDesc);
    setCustomSceneChain(s.customSceneChain);
  };

  const [workflowNeedsRecompute, setWorkflowNeedsRecompute] = useState(false);

  // ── Previous AI decision version (for rollback) ──
  const [previousAiDecision, setPreviousAiDecision] = useState<AIDecision | null>(null);

  // ── Version history ──
  const [versions, setVersions] = useState<GrowthVersion[]>(() => getVersions());
  const [showVersionDrawer, setShowVersionDrawer] = useState(false);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<VersionDiff | null>(null);
  const [currentVersionNumber, setCurrentVersionNumber] = useState<number>(0);
  const [showVersionBanner, setShowVersionBanner] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

  // ── Compute priority scores (called in Step 4) ──
  const computePriorities = () => {
    const avgConf = funnelMetrics.length > 0
      ? Math.round(funnelMetrics.reduce((s, m) => s + m.confidence, 0) / funnelMetrics.length)
      : 60;
    const allResources = [...resources, ...customResources];
    const bottlenecks = [
      { name: '优惠券可用性提示优化', bottleneck: funnelMetrics[3]?.stage || '加购→提交订单' },
      { name: '活动规则表达优化', bottleneck: funnelMetrics[2]?.stage || '详情页→加购' },
      { name: '物流承诺强化', bottleneck: funnelMetrics[4]?.stage || '提交订单→支付' },
    ];
    const scores = bottlenecks.map((o) => ({
      name: o.name,
      score: calculatePriorityScore(o.name, o.bottleneck, funnelMetrics, allResources, avgConf),
    }));
    return assignPriorities(scores);
  };

  // ── Save version snapshot ──
  const handleSaveVersion = (changes: string[]) => {
    const vn = currentVersionNumber > 0 ? getNextVersionNumber() : 1;
    const v: GrowthVersion = {
      versionId: `v-${Date.now()}`,
      versionNumber: vn,
      createdAt: new Date().toLocaleString('zh-CN'),
      scene: scene === '自定义场景' ? customSceneName || '自定义场景' : scene,
      goal,
      targetUsers: targetUsers || '未指定',
      currentRate,
      targetRate,
      dataSummary: useMockData ? `模拟数据（${mockConfig?.period || '?'}天）` : (opsFile || funnelFile ? '上传数据' : '仅业务信息'),
      changes,
      funnelMetrics: [...funnelMetrics],
      feedbackKeywords: { ...feedbackKeywords },
      opportunities: computePriorities().map((o) => ({
        name: o.name,
        bottleneck: '',
        currentData: '—',
        priorityLabel: o.priorityLabel,
        priorityScore: o.score,
      })),
      experimentPlan: experimentPlan ? { ...experimentPlan } : null,
      aiDecision: aiDecision ? { ...aiDecision } : null,
      actionItems: actionItems.map((a) => ({ ...a })),
    };
    saveVersion(v);
    setVersions(getVersions());
    setCurrentVersionNumber(vn);
    setShowVersionBanner(true);
  };

  const [showBasisFor, setShowBasisFor] = useState<Record<string, boolean>>({});
  const opps = [
    { name: '优惠券可用性提示优化', idx: 3 },
    { name: '活动规则表达优化', idx: 2 },
    { name: '物流承诺强化', idx: 4 },
  ];

  // ── Custom goal ──
  const [customGoalName, setCustomGoalName] = useState('');
  const [customGoalMetric, setCustomGoalMetric] = useState('');
  const [customGoalCurrent, setCustomGoalCurrent] = useState('');
  const [customGoalTarget, setCustomGoalTarget] = useState('');
  const [customGoalPeriod, setCustomGoalPeriod] = useState('');

  // ── File uploads ──
  const [opsFile, setOpsFile] = useState<FileEntry | null>(null);
  const [funnelFile, setFunnelFile] = useState<FileEntry | null>(null);
  const [fbFile, setFbFile] = useState<FileEntry | null>(null);
  const [useMockData, setUseMockData] = useState(false);

  // ── Mock data ──
  const [mockModalOpen, setMockModalOpen] = useState(false);
  const [mockOpsCSV, setMockOpsCSV] = useState('');
  const [mockFunnelCSV, setMockFunnelCSV] = useState('');
  const [mockFbCSV, setMockFbCSV] = useState('');
  const [mockConfig, setMockConfig] = useState<MockConfig | null>(null);

  // ── Diagnosis ──
  const [checklistProgress, setChecklistProgress] = useState(0);
  const [diagnosisComplete, setDiagnosisComplete] = useState(false);
  const [funnelMetrics, setFunnelMetrics] = useState<FunnelStageMetrics[]>([]);
  const [feedbackKeywords, setFeedbackKeywords] = useState<Record<string, { count: number; ratio: number }>>({});
  const [expandedStage, setExpandedStage] = useState<number | null>(null);

  // ── Secondary verification ──
  const [showJudgmentBasis, setShowJudgmentBasis] = useState(false);
  const [verifyingStage, setVerifyingStage] = useState<number | null>(null);
  const [verificationResults, setVerificationResults] = useState<Record<number, VerificationResult>>({});

  // ── Step 5–7: Experiment → Decision → Action ──
  const [selectedOpportunity, setSelectedOpportunity] = useState<{ name: string; bottleneck: string; currentData: string } | null>(null);
  const [experimentPlan, setExperimentPlan] = useState<ExperimentPlan | null>(null);
  const [aiDecision, setAiDecision] = useState<AIDecision | null>(null);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [showFullFunnel, setShowFullFunnel] = useState(false);
  const diagnosisRef = useRef<HTMLDivElement>(null);
  const [supplementOptions, setSupplementOptions] = useState<Record<string, boolean>>({
    '历史周期': false, '渠道拆分': false, '用户反馈': false, 'AB实验对照': false, '竞品数据': false, '热图数据': false,
  });
  // ── Supplement data tracking ──
  const [supplementFiles, setSupplementFiles] = useState<Record<string, { name: string; status: string; preview?: string }>>({});
  const [showSupplementPanel, setShowSupplementPanel] = useState(false);
  const hasAnySupplement = Object.keys(supplementFiles).length > 0 || Object.values(supplementOptions).some(Boolean);
  const [showDecisionBasis, setShowDecisionBasis] = useState(false);
  const [showDecisionDetails, setShowDecisionDetails] = useState(false);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editOwner, setEditOwner] = useState('');
  const [editPeriod, setEditPeriod] = useState('');
  const [expandedActionResult, setExpandedActionResult] = useState<string | null>(null);
  const [newActionText, setNewActionText] = useState('');

  // ── Build experiment context from current state ──
  const buildExperimentContext = (opp: { name: string; bottleneck: string; currentData: string }): ExperimentContext => ({
    selectedOpportunity: opp,
    scene: scene === '自定义场景' ? customSceneName || '自定义场景' : scene,
    goal,
    currentRate,
    targetRate,
    resources: [...resources, ...customResources],
    resourceConstraints,
    feedbackKeywords,
    funnelMetrics,
    hasData: !!(useMockData || opsFile || funnelFile),
    dataLabel: useMockData ? '模拟数据' : (opsFile || funnelFile ? '上传数据' : '仅业务信息'),
    knownIssue,
  });

  // ── Select opportunity (no navigation) ──
  const handleSelectOpportunity = (opp: { name: string; bottleneck: string; currentData: string }) => {
    setSelectedOpportunity(opp);
  };

  // ── Generate experiment from opportunity ──
  const handleGenerateExperiment = (opp: { name: string; bottleneck: string; currentData: string }) => {
    setSelectedOpportunity(opp);
    setAiDecision(null);
    setActionItems([]);
    const ctx = buildExperimentContext(opp);
    const plan = generateExperimentPlan(ctx);
    setExperimentPlan(plan);
    setStep(5);
  };

  // ── Regenerate current experiment ──
  const handleRegenerateExperiment = () => {
    if (!selectedOpportunity) return;
    const ctx = buildExperimentContext(selectedOpportunity);
    const plan = generateExperimentPlan(ctx);
    setExperimentPlan(plan);
    setAiDecision(null);
    setActionItems([]);
  };

  // ── Enter AI decision ──
  const handleEnterDecision = () => {
    if (!experimentPlan || !selectedOpportunity) return;
    const ctx = buildExperimentContext(selectedOpportunity);
    const decision = generateAIDecision(experimentPlan, ctx, verificationResults as Record<number, { conclusion: string }>);
    setAiDecision(decision);
    setActionItems([]);
    setShowDecisionBasis(false);
    setStep(6);
  };

  // ── Update execution result helper ──
  const updateExecutionResult = (itemId: string, field: string, value: string) => {
    setActionItems((prev) => prev.map((a) => {
      if (a.id !== itemId) return a;
      const er = a.executionResult || { actualCoreMetric: '', guardrailChanges: '', metSuccessCriteria: '数据充足' as const, notes: '' };
      return { ...a, executionResult: { ...er, [field]: value } };
    }));
  };

  // ── Low-risk verification experiment ──
  const [showLowRiskBanner, setShowLowRiskBanner] = useState(false);
  const [lowRiskExperiment, setLowRiskExperiment] = useState<ExperimentPlan | null>(null);
  const [originalExperimentForRollback, setOriginalExperimentForRollback] = useState<ExperimentPlan | null>(null);

  const handleGenerateLowRiskExperiment = () => {
    if (!experimentPlan || !selectedOpportunity) return;
    setOriginalExperimentForRollback(experimentPlan);
    const lowRisk: ExperimentPlan = {
      ...experimentPlan,
      name: experimentPlan.name + '（低风险验证版）',
      hypothesis: `[方向性验证] ${experimentPlan.hypothesis.slice(0, 80)}...在极小流量下先验证方向是否正确，再决定是否扩大实验规模。`,
      period: 3,
      sampleScope: '活动页访问用户的5%，随机均分为实验组和对照组（小流量方向验证）。',
      successCriteria: '指标方向改善且护栏指标无明显恶化（不要求统计显著性，关注方向一致性）。',
      risks: [
        { description: '样本量小，可能不具备统计显著性', severity: '低' },
        { description: '短期观测可能遗漏周期性波动', severity: '低' },
      ],
      guardrailMetrics: [...experimentPlan.guardrailMetrics, '页面加载时间', '用户投诉率', '客服咨询量'],
      coreMetrics: [...experimentPlan.coreMetrics.slice(0, 1), '方向性趋势（连续3天改善）'],
    };
    setLowRiskExperiment(lowRisk);
    setExperimentPlan(lowRisk);
    setShowLowRiskBanner(true);
    setStep(5);
  };

  const handleRollbackToOriginalExperiment = () => {
    if (originalExperimentForRollback) {
      setExperimentPlan(originalExperimentForRollback);
      setLowRiskExperiment(null);
      setShowLowRiskBanner(false);
    }
  };

  // ── Extend mock data for remediation ──
  const handleExtendMockData = () => {
    if (!mockConfig) return;
    const extendedConfig: MockConfig = {
      ...mockConfig,
      period: Math.min(mockConfig.period * 2, 90),
      includeFeedback: true,
    };
    const ops = generateOpsCSV(extendedConfig);
    const funnel = generateFunnelCSV(extendedConfig);
    const fb = generateFeedbackCSV(extendedConfig);
    setMockOpsCSV(ops); setMockFunnelCSV(funnel); setMockFbCSV(fb); setMockConfig(extendedConfig);
    // Re-run funnel
    setFunnelMetrics(computeFunnelMetrics(funnel, extendedConfig.problem, extendedConfig.isCompound));
    if (fb) setFeedbackKeywords(analyzeFeedbackKeywords(fb));
    setDiagnosisComplete(true);
    // Re-run AI decision
    if (experimentPlan && selectedOpportunity) {
      setPreviousAiDecision(aiDecision); // Save current version
      const ctx = buildExperimentContext(selectedOpportunity);
      const decision = generateAIDecision(experimentPlan, ctx, verificationResults as Record<number, { conclusion: string }>);
      setAiDecision(decision);
    }
    setShowDecisionDetails(false);
    setShowDecisionBasis(false);
    setWorkflowNeedsRecompute(true);
  };

  // ── Enter action plan ──
  const handleEnterActionPlan = () => {
    if (!experimentPlan || !aiDecision) return;
    const items = generateActionItems(experimentPlan, aiDecision);
    setActionItems(items);
    // Version: only save on action plan completion
    const changes = workflowNeedsRecompute ? ['重新完成完整流程'] : (currentVersionNumber === 0 ? ['首次生成行动计划'] : []);
    if (changes.length > 0) {
      setTimeout(() => handleSaveVersion(changes), 200);
      setWorkflowNeedsRecompute(false);
    }
    setStep(7);
  };

  // ── Simulated historical baselines per stage ──
  const HISTORICAL_BASELINES: Record<string, { period: string; rate: number }[]> = {
    '曝光→点击': [
      { period: '上月同期', rate: 8.8 }, { period: '上季度均值', rate: 8.5 },
      { period: '去年同期', rate: 9.1 }, { period: '本年均值', rate: 8.3 },
    ],
    '点击→详情页': [
      { period: '上月同期', rate: 72.3 }, { period: '上季度均值', rate: 70.8 },
      { period: '去年同期', rate: 68.5 }, { period: '本年均值', rate: 71.2 },
    ],
    '详情页→加购': [
      { period: '上月同期', rate: 63.2 }, { period: '上季度均值', rate: 61.5 },
      { period: '去年同期', rate: 59.8 }, { period: '本年均值', rate: 62.1 },
    ],
    '加购→提交订单': [
      { period: '上月同期', rate: 58.7 }, { period: '上季度均值', rate: 56.2 },
      { period: '去年同期', rate: 55.4 }, { period: '本年均值', rate: 57.8 },
    ],
    '提交订单→支付': [
      { period: '上月同期', rate: 84.5 }, { period: '上季度均值', rate: 83.1 },
      { period: '去年同期', rate: 81.7 }, { period: '本年均值', rate: 83.8 },
    ],
  };

  const CHANNELS_PER_STAGE: Record<string, { channel: string; rate: number; trend: '↑' | '↓' | '→'; delta: string }[]> = {
    '曝光→点击': [
      { channel: '抖音', rate: 9.2, trend: '↑', delta: '+0.8pp' }, { channel: '微信', rate: 7.5, trend: '↓', delta: '-1.2pp' },
      { channel: '小红书', rate: 8.8, trend: '→', delta: '+0.1pp' }, { channel: '百度', rate: 6.9, trend: '↓', delta: '-0.9pp' },
    ],
    '点击→详情页': [
      { channel: '抖音', rate: 74.1, trend: '↑', delta: '+2.3pp' }, { channel: '微信', rate: 68.2, trend: '→', delta: '-0.3pp' },
      { channel: '小红书', rate: 71.5, trend: '↑', delta: '+1.8pp' }, { channel: '百度', rate: 65.8, trend: '↓', delta: '-2.1pp' },
    ],
    '详情页→加购': [
      { channel: '抖音', rate: 61.3, trend: '→', delta: '+0.5pp' }, { channel: '微信', rate: 58.9, trend: '↓', delta: '-1.7pp' },
      { channel: '小红书', rate: 64.2, trend: '↑', delta: '+2.4pp' }, { channel: '百度', rate: 55.1, trend: '↓', delta: '-3.2pp' },
    ],
    '加购→提交订单': [
      { channel: '抖音', rate: 59.8, trend: '↑', delta: '+1.5pp' }, { channel: '微信', rate: 55.2, trend: '↓', delta: '-2.8pp' },
      { channel: '小红书', rate: 62.1, trend: '→', delta: '+0.2pp' }, { channel: '百度', rate: 51.3, trend: '↓', delta: '-4.1pp' },
    ],
    '提交订单→支付': [
      { channel: '抖音', rate: 86.2, trend: '↑', delta: '+1.1pp' }, { channel: '微信', rate: 82.5, trend: '→', delta: '-0.4pp' },
      { channel: '小红书', rate: 84.8, trend: '↑', delta: '+0.9pp' }, { channel: '百度', rate: 79.3, trend: '↓', delta: '-2.2pp' },
    ],
  };

  // ── Diagnosis animation ──
  useEffect(() => {
    if (step !== 3) return;
    // Save snapshot on first entry to diagnosis
    if (checklistProgress === 0) { saveStepSnapshot(); setWorkflowNeedsRecompute(false); }
    if (checklistProgress >= workflowItems.length) {
      // Compute metrics when done
      const funnelCSV = mockFunnelCSV || generateFunnelCSV({
        scene, goal, currentRate, targetRate,
        problem: '加购到提交订单异常', severity: '中度', period: 7,
        trend: '稳定', includeFeedback: true, isCompound: false, description: knownIssue,
      });
      const fbCSV = mockFbCSV || '';
      setFunnelMetrics(computeFunnelMetrics(funnelCSV, mockConfig?.problem || '加购到提交订单异常', mockConfig?.isCompound));
      if (fbCSV) setFeedbackKeywords(analyzeFeedbackKeywords(fbCSV));
      setDiagnosisComplete(true);
      hasEverCompletedDiagnosis.current = true;
      if (workflowNeedsRecompute) {
        setTimeout(() => handleSaveVersion(['重新计算诊断']), 200);
        setWorkflowNeedsRecompute(false);
      }
      return;
    }
    const delay = DIAG_DELAYS[checklistProgress] ?? 1000;
    const timer = setTimeout(() => setChecklistProgress((prev) => prev + 1), delay);
    return () => clearTimeout(timer);
  }, [step, checklistProgress]);

  useEffect(() => {
    if (step !== 3) { setChecklistProgress(0); setDiagnosisComplete(false); setExpandedStage(null); }
  }, [step]);

  // ── Auto-fill target users based on scene ──
  useEffect(() => {
    if (targetUsersManuallySet.current) return;
    const defaults: Record<string, string> = {
      '电商活动': '活动页访问用户',
      '新品上线': '新品详情页访问用户',
      '会员运营': '会员用户',
      '渠道投放': '对应渠道访问用户',
      '内容增长': '内容浏览或互动用户',
      '用户召回': '近30天未活跃用户',
      '自定义场景': '',
    };
    const v = defaults[scene];
    if (v !== undefined) setTargetUsers(v);
    targetUsersManuallySet.current = false;
  }, [scene]);

  // ── Scroll to diagnosis results when complete ──
  useEffect(() => {
    if (diagnosisComplete && diagnosisRef.current) {
      setTimeout(() => {
        diagnosisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [diagnosisComplete]);

  // ── Scroll to top on step change ──
  useEffect(() => {
    if (step !== 3) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  // ═══════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════
  // ── Secondary verification logic ──
  const runVerification = (stageIndex: number) => {
    setVerifyingStage(stageIndex);
    // Simulate multi-source analysis (2.5s)
    setTimeout(() => {
      const m = funnelMetrics[stageIndex];
      if (!m) return;
      const baseline = HISTORICAL_BASELINES[m.stage] || [];
      const channels = CHANNELS_PER_STAGE[m.stage] || [];
      const baselineAvg = baseline.length > 0 ? baseline.reduce((s, b) => s + b.rate, 0) / baseline.length : m.conversionRate;
      const deltaFromBaseline = m.conversionRate - baselineAvg;
      const channelDispersion = channels.length > 0
        ? Math.max(...channels.map((c) => c.rate)) - Math.min(...channels.map((c) => c.rate))
        : 0;

      // ── Decision logic ──
      let conclusion: VerificationConclusion;
      let confidence: number;
      let trendDirection: 'up' | 'down' | 'flat';
      let trendDesc: string;

      if (Math.abs(deltaFromBaseline) <= 1.5 && channelDispersion <= 8) {
        conclusion = '正常波动';
        confidence = 78;
        trendDirection = 'flat';
        trendDesc = `当前转化率 ${m.conversionRate}% 与历史均值 ${baselineAvg.toFixed(1)}% 偏差 ${deltaFromBaseline.toFixed(1)}pp，在各渠道正常波动范围内`;
      } else if (deltaFromBaseline < -1.5 && channelDispersion > 5) {
        conclusion = '确认异常';
        confidence = 85;
        trendDirection = 'down';
        trendDesc = `当前转化率 ${m.conversionRate}% 显著低于历史均值 ${baselineAvg.toFixed(1)}%（偏差 ${Math.abs(deltaFromBaseline).toFixed(1)}pp），且渠道间差异达 ${channelDispersion.toFixed(1)}pp，存在结构性异常`;
      } else if (deltaFromBaseline < -1.5) {
        conclusion = '确认异常';
        confidence = 80;
        trendDirection = 'down';
        trendDesc = `当前转化率 ${m.conversionRate}% 低于历史均值 ${baselineAvg.toFixed(1)}%（偏差 ${Math.abs(deltaFromBaseline).toFixed(1)}pp），趋势向下，建议排查具体原因`;
      } else {
        conclusion = '继续观察';
        confidence = 72;
        trendDirection = deltaFromBaseline < 0 ? 'down' : 'up';
        trendDesc = `当前转化率 ${m.conversionRate}% 与历史均值偏差 ${Math.abs(deltaFromBaseline).toFixed(1)}pp，渠道差异 ${channelDispersion.toFixed(1)}pp，尚在可接受范围但需持续关注`;
      }

      // ── Feedback correlation ──
      const stageFeedbackMap: Record<string, { keyword: string; impact: string }[]> = {
        '曝光→点击': [{ keyword: '广告', impact: '渠道入口点击意愿正常，无负面关联' }],
        '点击→详情页': [{ keyword: '加载', impact: '部分用户反馈详情页加载慢，与转化波动弱相关' }],
        '详情页→加购': [{ keyword: '描述', impact: '商品描述和尺码相关反馈对加购决策有中等影响' }],
        '加购→提交订单': [
          { keyword: '优惠券', impact: '优惠券不可用反馈与下单流失强相关' },
          { keyword: '门槛', impact: '满减门槛过高反馈与下单犹豫中度相关' },
        ],
        '提交订单→支付': [
          { keyword: '支付', impact: '支付失败反馈与支付流失强相关' },
          { keyword: '物流', impact: '物流担忧与支付前犹豫中度相关' },
        ],
      };

      const fbCorrelation = (stageFeedbackMap[m.stage] || []).map((f) => ({
        ...f,
        count: Math.floor(Math.random() * 20) + 3,
      }));

      setVerificationResults((prev) => ({
        ...prev,
        [stageIndex]: {
          conclusion,
          confidence,
          historicalBaseline: baseline,
          channelBreakdown: channels,
          trend: { direction: trendDirection, description: trendDesc },
          feedbackCorrelation: fbCorrelation,
          summary: `综合历史基线、渠道分布、趋势和反馈依据：${conclusion === '确认异常' ? `该环节存在可确认的异常流失，${trendDesc}` : conclusion === '正常波动' ? `该环节波动在正常范围内，${trendDesc}` : `该环节数据矛盾，${trendDesc}。建议继续观察下一个周期的数据变化。`}`,
        },
      }));
      setVerifyingStage(null);
    }, 2500);
  };

  const toggleResource = (r: string) => setResources((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  const addCustomResource = () => {
    const v = customResourceInput.trim();
    if (v && !resources.includes(v) && !customResources.includes(v)) setCustomResources((prev) => [...prev, v]);
    setCustomResourceInput('');
  };
  const removeCustomResource = (r: string) => setCustomResources((prev) => prev.filter((x) => x !== r));
  const handleFileUpload = (setter: (f: FileEntry) => void) => (file: File) => { setter({ name: file.name, status: 'uploaded' }); setUseMockData(false); };
  const removeFile = (setter: (f: FileEntry | null) => void) => () => setter(null);

  const handleGoalChange = (g: GrowthGoal) => {
    setGoal(g); setSpecificGoal(defaultSpecificGoal[g]);
    if (g !== '自定义目标') { setCustomGoalName(''); setCustomGoalMetric(''); setCustomGoalCurrent(''); setCustomGoalTarget(''); setCustomGoalPeriod(''); }
  };

  const handleMockApply = (opsCSV: string, funnelCSV: string, fbCSV: string, config: MockConfig) => {
    setMockOpsCSV(opsCSV); setMockFunnelCSV(funnelCSV); setMockFbCSV(fbCSV); setMockConfig(config);
    setUseMockData(true);
    setOpsFile({ name: '模拟运营数据.csv', status: 'uploaded' });
    setFunnelFile({ name: '模拟漏斗数据.csv', status: 'uploaded' });
    setFbFile({ name: '模拟用户反馈.csv', status: 'uploaded' });
    // Clear downstream results since data changed
    setDiagnosisComplete(false); setChecklistProgress(0);
    setFunnelMetrics([]); setFeedbackKeywords({});
    setSelectedOpportunity(null);
    setExperimentPlan(null);
    setAiDecision(null);
    setActionItems([]);
    if (step > 2) setStep(2);
  };

  const canGoNextStep1 = () => {
    if (goal === '自定义目标') {
      return customGoalName.trim() && customGoalMetric.trim() && customGoalCurrent.trim() && customGoalTarget.trim() && customGoalPeriod.trim();
    }
    return true;
  };
  const canGoNextStep2 = () => {
    if (scene === '自定义场景' && (!customSceneName.trim() || !customSceneDesc.trim())) return false;
    return true;
  };

  const goNext = () => {
    if (step === 1 && canGoNextStep1()) { saveStepSnapshot(); setStep(2); }
    else if (step === 2 && canGoNextStep2()) {
      // Compare with snapshot — if user changed data after completing diagnosis at least once, ask
      if (hasEverCompletedDiagnosis.current && hasFieldsChanged()) {
        if (window.confirm('检测到业务信息发生变化，后续诊断需要重新计算，是否继续？')) {
          setWorkflowNeedsRecompute(true);
          setDiagnosisComplete(false); setChecklistProgress(0);
          setFunnelMetrics([]); setFeedbackKeywords({});
          setVerificationResults({}); setVerifyingStage(null);
          setExpandedStage(null);
          setShowDecisionBasis(false); setShowDecisionDetails(false); setShowFullFunnel(false);
        } else {
          restoreStepSnapshot(); // Restore original values, keep old results
          return;
        }
      }
      setStep(3);
    }
    else if (step === 3) {
      // Before leaving diagnosis, check if step 2 fields changed
      if (hasEverCompletedDiagnosis.current && hasFieldsChanged()) {
        if (window.confirm('检测到业务信息在上一步被修改，诊断结果可能已过时，建议返回重新诊断。是否继续使用当前诊断？')) {
          // User chose to keep current diagnosis — save as-is
          setWorkflowNeedsRecompute(false);
        } else {
          return;
        }
      }
      setStep(4);
    }
    else if (step === 4) {
      if (hasEverCompletedDiagnosis.current && hasFieldsChanged()) {
        if (window.confirm('检测到业务信息发生变化，后续增长机会可能需要重新评估。是否继续？')) {
          setWorkflowNeedsRecompute(true);
        } else {
          restoreStepSnapshot();
          return;
        }
      }
      setStep(5);
    }
    else if (step === 5) {
      if (hasEverCompletedDiagnosis.current && hasFieldsChanged()) {
        if (window.confirm('检测到业务信息发生变化，当前实验方案可能不再适用。是否继续？')) {
          setWorkflowNeedsRecompute(true);
        } else {
          restoreStepSnapshot();
          return;
        }
      }
      setStep(6);
    }
    else if (step === 6) {
      if (hasEverCompletedDiagnosis.current && hasFieldsChanged()) {
        if (window.confirm('检测到业务信息发生变化，当前决策可能不再适用。是否继续？')) {
          setWorkflowNeedsRecompute(true);
        } else {
          restoreStepSnapshot();
          return;
        }
      }
      setStep(7);
    }
  };
  const goBack = () => {
    // Save current progress snapshot before going back
    saveStepSnapshot();
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else if (step === 4) setStep(3);
    else if (step === 5) setStep(4);
    else if (step === 6) setStep(5);
    else if (step === 7) setStep(6);
  };
  const handleBackToScene = () => { setStep(2); setMockModalOpen(false); };

  const isStepDone = (i: number) => i < step - 1;
  const isStepCurrent = (i: number) => i === step - 1;

  const handleStepClick = (i: number) => {
    const targetStep = i + 1;
    if (isStepCurrent(i)) return;
    if (isStepDone(i)) {
      // Going back — just navigate, don't clear
      // Fields-changed check happens when user tries to go forward again
      setStep(targetStep);
    } else {
      alert('请先完成前置步骤。');
    }
  };

  // ═══════════════════════════════════════════
  // Dynamic AI Judgment
  // ═══════════════════════════════════════════
  const hasData = !!(useMockData || opsFile || funnelFile);
  const dataLabel = hasData ? (useMockData ? '模拟数据' : '上传数据') : '仅业务信息';

  const computeAIJudgment = () => {
    const metrics = funnelMetrics;
    if (metrics.length === 0) return null;

    // Sort: most severe first
    const severityRank: Record<string, number> = { '严重流失': 4, '中度流失': 3, '轻度流失': 2, '临界/需进一步验证': 1, '正常': 0 };
    const sorted = [...metrics].sort((a, b) => (severityRank[b.status] || 0) - (severityRank[a.status] || 0));
    const worst = sorted[0];
    const borderlineItems = metrics.filter((m) => m.status === '临界/需进一步验证');
    const abnormalItems = metrics.filter((m) => m.status !== '正常' && m.status !== '临界/需进一步验证');
    const allNormal = metrics.every((m) => m.status === '正常');
    const hasMultiBorderline = borderlineItems.length >= 2;

    // ── Core conclusion (branch by worst stage) ──
    let coreConclusion = '';
    let secondaryIssues: string[] = [];
    let suggestedActions: string[] = [];
    let notRecommended: string[] = [];

    if (allNormal) {
      coreConclusion = '未发现明显结构性瓶颈，当前各环节转化率均在正常范围内。';
      suggestedActions = ['按渠道拆分转化率，观察是否存在渠道级差异', '按用户分群分析，排查特定人群的转化偏弱', '按商品/品类维度下钻，寻找结构优化空间'];
      notRecommended = ['不建议针对单一漏斗环节做大幅改动', '不建议仅凭当前数据做激进策略调整'];
    } else if (hasMultiBorderline && abnormalItems.length === 0) {
      coreConclusion = '当前存在多个接近阈值的环节，但均未达到确定性异常标准。';
      secondaryIssues = borderlineItems.map((b) => `${b.stage}转化率 ${b.conversionRate}%，处于临界区间`);
      suggestedActions = ['补充历史基线数据，确认当前波动是否为趋势性下滑', '按渠道拆分各环节数据，排查特定渠道的异常', '建议先执行小规模A/B实验，验证假设后再做全量调整'];
      notRecommended = ['不建议基于不确定信号做大范围改动', '不建议忽略临界信号直接放行'];
    } else if (worst.status === '正常') {
      coreConclusion = `当前主要瓶颈不明确，${worst.stage}转化率 ${worst.conversionRate}% 处于正常范围。建议进一步分析渠道、用户分群和商品结构。`;
      suggestedActions = ['下钻分析渠道差异和用户分群数据', '检查是否存在特定商品或类目的转化偏低'];
      notRecommended = ['暂不建议针对转化漏斗做大范围调整'];
    } else {
      // Has clear bottleneck
      const s = worst.stage;
      if (s === '曝光→点击') {
        coreConclusion = `当前主要增长瓶颈位于「${s}」环节，转化率 ${worst.conversionRate}%（${worst.status}），而非后续转化环节。`;
        secondaryIssues.push('流量质量、入口素材或渠道定向可能存在系统性问题');
        suggestedActions = ['复核各渠道素材与人群定向的匹配度', '排查入口文案是否存在过度承诺或误导', '对比渠道级点击率，定位低效渠道优先优化'];
        notRecommended = ['暂不建议继续增加曝光投放，当前流量转化效率应先修复', '不建议在未定位渠道问题前调整落地页'];
      } else if (s === '点击→详情页') {
        coreConclusion = `当前主要增长瓶颈位于「${s}」环节，转化率 ${worst.conversionRate}%（${worst.status}）。用户在进入路径上流失严重。`;
        secondaryIssues.push('落地页加载速度、首屏信息传达或入口与内容一致性可能存在问题');
        suggestedActions = ['检查落地页首屏是否在 2 秒内展示核心利益点', '复核入口素材与落地页内容的一致性', 'A/B 测试不同落地页布局和利益点表达'];
        notRecommended = ['暂不建议优化详情页之后的环节', '不建议在落地页问题解决前调整优惠策略'];
      } else if (s === '详情页→加购') {
        coreConclusion = `当前主要增长瓶颈位于「${s}」环节，转化率 ${worst.conversionRate}%（${worst.status}）。用户在商品评估阶段流失，而非流量获取环节。`;
        secondaryIssues.push('商品卖点表达、优惠信息可见性、信任元素（评价/保障）可能不足');
        suggestedActions = ['测试核心卖点在首屏的可见性', '前置展示优惠信息（到手价/满减提示）', '强化信任元素：评价标签、售后保障、销量展示'];
        notRecommended = ['暂不建议继续增加曝光或投放预算', '不建议在卖点表达优化前调整深层漏斗'];
      } else if (s === '加购→提交订单') {
        coreConclusion = `当前主要增长瓶颈位于「${s}」环节，转化率 ${worst.conversionRate}%（${worst.status}）。用户在决策下单阶段流失。`;
        secondaryIssues.push('优惠券可用性、价格透明度、结算流程复杂度可能是关键因素');
        suggestedActions = ['检查优惠券是否大面积失效或门槛过高', '优化结算页：到手价清晰展示、优惠自动匹配', '减少结算步骤，支持地址自动填充和默认支付方式'];
        notRecommended = ['暂不建议增加流量投放', '不建议在结算体验修复前调整商品策略'];
      } else if (s === '提交订单→支付') {
        coreConclusion = `当前主要增长瓶颈位于「${s}」环节，转化率 ${worst.conversionRate}%（${worst.status}）。用户在最后一步支付环节流失。`;
        secondaryIssues.push('支付方式可用性、物流承诺清晰度、最终价格变化可能是流失原因');
        suggestedActions = ['检查主流支付方式（微信/支付宝）的可用性和跳转体验', '在支付页强化物流时效承诺和售后保障', '分析未支付订单，考虑未支付召回（Push/短信）机制'];
        notRecommended = ['暂不建议调整商品详情页或上游漏斗', '不建议在支付体验修复前增加活动复杂度'];
      } else {
        coreConclusion = `当前主要增长瓶颈位于「${s}」环节，转化率 ${worst.conversionRate}%（${worst.status}）。`;
        suggestedActions = ['针对该环节进行深度分析', '结合用户反馈数据交叉验证'];
        notRecommended = ['不建议在问题定位前做大规模改动'];
      }
    }

    // ── Add borderline notes ──
    if (borderlineItems.length > 0 && !hasMultiBorderline) {
      const bStages = borderlineItems.map((b) => b.stage).join('、');
      secondaryIssues.push(`${bStages} 处于临界状态，距离阈值在 ±3pp 以内，建议补充数据后再下结论。`);
    }

    // ── Feedback integration ──
    const fbKeys = Object.keys(feedbackKeywords);
    if (fbKeys.length > 0) {
      const topKW = fbKeys.slice(0, 3).join('、');
      secondaryIssues.push(`用户反馈中「${topKW}」等关键词出现频率较高，与诊断结果交叉验证。`);
    }

    // ── Data completeness note ──
    if (!hasData) {
      secondaryIssues.push('当前未上传数据，判断主要基于预设规则与用户输入信息，建议补充数据提升准确度。');
    }

    // ── Basis summary ──
    const dataBasis = metrics.map((m) => `${m.stage}: ${m.conversionRate}%（${m.fromCount.toLocaleString()}→${m.toCount.toLocaleString()}）`).join('；');
    const ruleBasis = `各环节使用预设阈值进行判定，当前阈值为演示规则。`;
    const feedbackBasis = fbKeys.length > 0
      ? `${fbKeys.length} 类关键词：${fbKeys.slice(0, 5).map((k) => `${k}(${feedbackKeywords[k]?.count || 0}次)`).join('、')}`
      : '无用户反馈数据';
    const missingData: string[] = [];
    if (!hasData) missingData.push('运营数据');
    if (!funnelFile && !useMockData) missingData.push('漏斗数据');
    if (!fbFile && !useMockData) missingData.push('用户反馈数据');
    if (!hasData) missingData.push('历史基线数据');
    const confidenceNote = hasData
      ? `基于${dataLabel}与预设规则，诊断置信度参考各环节标注值。`
      : `基于业务信息与预设规则，缺少实际数据支撑，置信度有限。建议上传数据或使用模拟数据获得更可靠判断。`;

    const borderlineDetail = borderlineItems.map((b) => ({
      stage: b.stage,
      reason: `转化率 ${b.conversionRate}% 接近阈值边界（±3pp）`,
      needed: '历史基线、渠道拆分、用户反馈',
      suggestion: b.conversionRate < 60 ? '建议执行小规模A/B实验验证' : '建议继续观察下一个周期数据',
    }));

    return {
      coreConclusion,
      secondaryIssues,
      suggestedActions,
      notRecommended,
      borderlineDetail,
      basis: { dataBasis, ruleBasis, feedbackBasis, missingData, confidenceNote },
      dataLabel,
    };
  };

  const judgment = diagnosisComplete ? computeAIJudgment() : null;

  // ── File row renderer ──
  const renderFileRow = (label: string, file: FileEntry | null, setter: (f: FileEntry) => void, clearer: () => void) => (
    <div className="flex items-center justify-between rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        {file ? (
          <><span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" /><span className="text-sm text-[#111111] truncate">{file.name}</span><span className="text-[11px] text-[#999999] shrink-0">已上传</span></>
        ) : (
          <><span className="h-2 w-2 rounded-full bg-[#E5E5E5] shrink-0" /><span className="text-sm text-[#999999]">未上传</span></>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        <FileUpload label="" onFile={handleFileUpload(setter)} fileName={file?.name} />
        {file && <button onClick={clearer} className="p-1 rounded hover:bg-[#E5E5E5]"><X size={14} className="text-[#999999]" /></button>}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════
  return (
    <main className="min-h-screen bg-[#FAFAFA] px-4 py-5 md:px-6 md:py-6">
      <MockDataModal open={mockModalOpen} onClose={() => setMockModalOpen(false)} onApply={handleMockApply} scene={scene === '自定义场景' ? customSceneName || '自定义场景' : scene} goal={goal} onBackToScene={handleBackToScene} />
      <div className="mx-auto max-w-7xl">
        {/* ── Header ── */}
        <div className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 border border-[#E5E5E5]">
          <div>
            <button onClick={onHome} className="inline-flex items-center gap-1 text-sm font-semibold text-[#111111] hover:text-[#666666] transition-colors">
              <ArrowLeft size={16} /> 返回员工中心
            </button>
            <h1 className="mt-1.5 text-xl font-bold text-[#111111]">AI Growth Manager 工作台</h1>
            <p className="text-xs text-[#666666] mt-0.5">增长机会识别 · 策略制定 · 实验方案生成</p>
          </div>
          <div className="flex items-center gap-2">
            {versions.length > 0 && (
              <button onClick={() => setShowVersionDrawer(true)} className="rounded-full border border-[#E5E5E5] px-4 py-2 text-sm font-semibold text-[#666666] hover:border-[#111111] hover:text-[#111111] transition-colors">
                历史版本 ({versions.length})
              </button>
            )}
            <span className="rounded-full bg-[#F5F5F5] px-4 py-2 text-sm font-semibold text-[#111111] border border-[#E5E5E5]">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-1.5" />已开放
            </span>
          </div>
        </div>

        {/* ── Step indicator ── */}
        <div className="mt-5 rounded-2xl bg-white px-5 py-4 border border-[#E5E5E5] overflow-x-auto">
          <div className="flex items-center gap-0 text-sm">
            {stepLabels.map((s, i) => (
              <div key={s.label} className="flex items-center shrink-0">
                <button
                  onClick={() => handleStepClick(i)}
                  className={`inline-flex items-center gap-1.5 shrink-0 transition-colors ${
                    isStepCurrent(i) ? 'font-semibold text-[#111111]' :
                    isStepDone(i) ? 'text-[#666666] hover:text-[#111111] cursor-pointer' :
                    'text-[#999999] cursor-not-allowed'
                  }`}
                  title={isStepDone(i) ? `返回「${s.label}」` : isStepCurrent(i) ? '当前步骤' : '请先完成前置步骤'}
                >
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${isStepCurrent(i) ? 'bg-[#111111] text-white' : isStepDone(i) ? 'bg-[#666666] text-white' : 'bg-[#F5F5F5] text-[#999999]'}`}>
                    {isStepDone(i) ? '✓' : i + 1}
                  </span>
                  {s.label}
                </button>
                {i < stepLabels.length - 1 && <span className="mx-2 text-[#E5E5E5]">—</span>}
              </div>
            ))}
          </div>
        </div>

        {/* ════════════════ Step 1 ════════════════ */}
        {step === 1 && (
          <section className="mt-5 rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
            <h2 className="text-lg font-bold text-[#111111]">你希望优先提升哪个增长目标？</h2>
            <p className="mt-1 text-sm text-[#666666]">选择一个增长方向，AI Growth Manager 将为你识别瓶颈、制定策略并生成可执行的实验方案</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {goals.map((g) => {
                const Icon = g.icon;
                const sel = goal === g.label;
                return (
                  <button key={g.label} onClick={() => handleGoalChange(g.label)} className={`rounded-2xl border-2 p-4 text-left transition-all ${sel ? 'border-[#111111] bg-[#F5F5F5]' : 'border-[#E5E5E5] bg-white hover:border-[#D4D4D4]'}`}>
                    <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${sel ? 'border-[#111111] bg-[#111111] text-white' : 'border-[#E5E5E5] text-[#666666]'} transition-colors`}><Icon size={18} /></div>
                    <div className="mt-3 font-semibold text-sm text-[#111111]">{g.label}</div>
                    <div className="mt-1 text-xs text-[#999999] leading-relaxed">{g.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* Custom goal form — appears immediately in Step 1 */}
            {goal === '自定义目标' && (
              <div className="mt-5 rounded-xl border-2 border-[#111111] bg-[#F9F9F9] p-5">
                <p className="text-sm font-bold text-[#111111] mb-4">请填写自定义目标详情</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#666666] mb-1">自定义目标名称 *</label>
                    <input type="text" value={customGoalName} onChange={(e) => setCustomGoalName(e.target.value)} placeholder="例如：提升社群活跃度" className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#111111] outline-none focus:border-[#111111] placeholder:text-[#999999]" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#666666] mb-1">目标指标 *</label>
                    <input type="text" value={customGoalMetric} onChange={(e) => setCustomGoalMetric(e.target.value)} placeholder="例如：日活跃用户数" className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#111111] outline-none focus:border-[#111111] placeholder:text-[#999999]" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#666666] mb-1">当前值 *</label>
                    <input type="text" value={customGoalCurrent} onChange={(e) => setCustomGoalCurrent(e.target.value)} placeholder="例如：1200" className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#111111] outline-none focus:border-[#111111] placeholder:text-[#999999]" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#666666] mb-1">目标值 *</label>
                    <input type="text" value={customGoalTarget} onChange={(e) => setCustomGoalTarget(e.target.value)} placeholder="例如：2000" className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#111111] outline-none focus:border-[#111111] placeholder:text-[#999999]" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#666666] mb-1">期望完成周期 *</label>
                    <input type="text" value={customGoalPeriod} onChange={(e) => setCustomGoalPeriod(e.target.value)} placeholder="例如：2周内" className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#111111] outline-none focus:border-[#111111] placeholder:text-[#999999]" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#666666] mb-1">补充说明（可选）</label>
                    <input type="text" value={specificGoal} onChange={(e) => setSpecificGoal(e.target.value)} placeholder="补充说明，如增长背景、约束条件等" className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#111111] outline-none focus:border-[#111111] placeholder:text-[#999999]" />
                  </div>
                </div>
                {/* Validation errors */}
                {(() => {
                  const missing: string[] = [];
                  if (!customGoalName.trim()) missing.push('自定义目标名称');
                  if (!customGoalMetric.trim()) missing.push('目标指标');
                  if (!customGoalCurrent.trim()) missing.push('当前值');
                  if (!customGoalTarget.trim()) missing.push('目标值');
                  if (!customGoalPeriod.trim()) missing.push('期望完成周期');
                  if (missing.length > 0) return (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-xs font-semibold text-red-700">以下必填项未完成：</p>
                      <ul className="text-xs text-red-600 mt-1 space-y-0.5">
                        {missing.map((m) => <li key={m}>· 请填写「{m}」</li>)}
                      </ul>
                    </div>
                  );
                  return null;
                })()}
              </div>
            )}

            <div className="mt-8">
              {goal === '自定义目标' && !canGoNextStep1() && (
                <p className="text-xs text-amber-600 mb-2">请填写自定义目标的所有必填字段后继续。</p>
              )}
              <button onClick={goNext} disabled={!canGoNextStep1()} className="inline-flex items-center gap-2 rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#333333] disabled:bg-[#E5E5E5] disabled:text-[#999999]">
                下一步<ArrowRight size={15} />
              </button>
            </div>
          </section>
        )}

        {/* ════════════════ Step 2 ════════════════ */}
        {step === 2 && (
          <section className="mt-5 space-y-5">
            {/* Basic info */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <h2 className="text-lg font-bold text-[#111111]">业务现状</h2>
              <p className="mt-1 text-sm text-[#666666]">告诉 AI 目前的业务情况，越详细诊断越精准</p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-[#111111] mb-1.5">场景类型</label>
                  <select value={scene} onChange={(e) => setScene(e.target.value)} className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm text-[#111111] outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#E5E5E5] appearance-none cursor-pointer">
                    {sceneOptions.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#111111] mb-1.5">目标用户</label>
                  <input type="text" value={targetUsers} onChange={(e) => { setTargetUsers(e.target.value); targetUsersManuallySet.current = true; }} placeholder="例如：活动页访问用户" className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm text-[#111111] outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#E5E5E5] placeholder:text-[#999999]" />
                </div>

                {/* Custom scene fields */}
                {scene === '自定义场景' && (
                  <div className="sm:col-span-2 rounded-xl border border-[#111111] bg-[#F9F9F9] p-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-[#666666] mb-1">场景名称 *</label>
                      <input type="text" value={customSceneName} onChange={(e) => setCustomSceneName(e.target.value)} placeholder="例如：新用户首单活动" className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#111111] outline-none focus:border-[#111111] placeholder:text-[#999999]" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#666666] mb-1">核心业务链路</label>
                      <input type="text" value={customSceneChain} onChange={(e) => setCustomSceneChain(e.target.value)} placeholder="例如：曝光—点击—详情页—领券—加购—支付" className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#111111] outline-none focus:border-[#111111] placeholder:text-[#999999]" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-[#666666] mb-1">场景描述 *</label>
                      <textarea value={customSceneDesc} onChange={(e) => setCustomSceneDesc(e.target.value)} rows={2} placeholder="例如：新用户进入活动页后领取优惠券，但支付转化较低" className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#111111] outline-none focus:border-[#111111] resize-none placeholder:text-[#999999]" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-[#111111] mb-1.5">增长方向</label>
                  <input type="text" value={goal} readOnly className="w-full rounded-xl border border-[#E5E5E5] bg-[#F5F5F5] px-4 py-2.5 text-sm text-[#666666] outline-none cursor-default" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-[#111111] mb-1.5">具体目标</label>
                  <input type="text" value={specificGoal} onChange={(e) => setSpecificGoal(e.target.value)} placeholder="描述你想达成的具体增长目标" className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm text-[#111111] outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#E5E5E5] placeholder:text-[#999999]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#111111] mb-1.5">当前转化率</label>
                  <div className="relative">
                    <input type="text" value={currentRate} onChange={(e) => setCurrentRate(e.target.value)} className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 pr-10 text-sm text-[#111111] outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#E5E5E5]" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#999999]">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#111111] mb-1.5">目标转化率</label>
                  <div className="relative">
                    <input type="text" value={targetRate} onChange={(e) => setTargetRate(e.target.value)} className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 pr-10 text-sm text-[#111111] outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#E5E5E5]" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#999999]">%</span>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-[#111111] mb-1.5">已知问题</label>
                  <input type="text" value={knownIssue} onChange={(e) => setKnownIssue(e.target.value)} placeholder="例如：曝光上涨但转化下降" className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm text-[#111111] outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#E5E5E5] placeholder:text-[#999999]" />
                </div>
              </div>

              {/* Resources */}
              <div className="mt-5">
                <label className="block text-sm font-semibold text-[#111111] mb-1.5">可投入资源</label>
                <div className="flex flex-wrap gap-2">
                  {resourceOptions.map((r) => {
                    const active = resources.includes(r);
                    return <button key={r} onClick={() => toggleResource(r)} className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${active ? 'border-[#111111] bg-[#111111] text-white' : 'border-[#E5E5E5] bg-white text-[#666666] hover:border-[#D4D4D4]'}`}>{r}</button>;
                  })}
                  {customResources.map((r) => (
                    <span key={r} className="inline-flex items-center gap-1 rounded-lg border border-[#111111] bg-[#111111] px-3 py-1.5 text-xs font-medium text-white">{r}<button onClick={() => removeCustomResource(r)}><X size={12} className="text-white/70 hover:text-white" /></button></span>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input type="text" value={customResourceInput} onChange={(e) => setCustomResourceInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustomResource()} placeholder="+ 添加自定义资源" className="flex-1 rounded-lg border border-[#E5E5E5] bg-white px-3 py-1.5 text-xs text-[#111111] outline-none focus:border-[#111111] placeholder:text-[#999999]" />
                  <button onClick={addCustomResource} disabled={!customResourceInput.trim()} className="rounded-lg border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-xs text-[#666666] hover:border-[#111111] disabled:opacity-40 transition-colors"><Plus size={14} /></button>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-semibold text-[#111111] mb-1.5">资源限制或约束</label>
                  <textarea value={resourceConstraints} onChange={(e) => setResourceConstraints(e.target.value)} rows={2} placeholder="如：预算不超过5万元、实验周期不超过7天、暂时无法修改支付流程" className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm text-[#111111] outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#E5E5E5] resize-none placeholder:text-[#999999]" />
                </div>
              </div>
            </div>

            {/* Data upload */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <h2 className="text-lg font-bold text-[#111111]">上传数据（可选）</h2>
              <p className="mt-1 text-sm text-[#666666]">上传运营指标、用户行为或反馈数据，可提升增长诊断准确度；如暂时没有数据，也可基于当前业务信息继续。</p>
              <div className="mt-5 space-y-3">
                {renderFileRow('运营数据 CSV', opsFile, setOpsFile, removeFile(setOpsFile))}
                {renderFileRow('用户行为 / 漏斗数据 CSV', funnelFile, setFunnelFile, removeFile(setFunnelFile))}
                {renderFileRow('用户反馈 CSV', fbFile, setFbFile, removeFile(setFbFile))}
              </div>
              <div className="mt-3">
                <button onClick={() => setMockModalOpen(true)} className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${mockConfig ? 'border-[#111111] bg-[#111111] text-white' : 'border-[#E5E5E5] bg-white text-[#666666] hover:border-[#D4D4D4]'}`}>
                  自定义生成模拟数据
                </button>
              </div>
            </div>

            {/* Bottom actions */}
            <div>
              {!canGoNextStep2() && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 mb-3">
                  <p className="text-xs font-semibold text-red-700 mb-1">以下必填项未完成：</p>
                  <ul className="text-xs text-red-600 space-y-0.5">
                    {scene === '自定义场景' && !customSceneName.trim() && <li>· 请填写「场景名称」</li>}
                    {scene === '自定义场景' && !customSceneDesc.trim() && <li>· 请填写「场景描述」</li>}
                    {goal === '自定义目标' && !customGoalName.trim() && <li>· 请填写「目标名称」</li>}
                    {goal === '自定义目标' && !customGoalMetric.trim() && <li>· 请填写「目标指标」</li>}
                    {goal === '自定义目标' && !customGoalCurrent.trim() && <li>· 请填写「当前值」</li>}
                    {goal === '自定义目标' && !customGoalTarget.trim() && <li>· 请填写「目标值」</li>}
                    {goal === '自定义目标' && !customGoalPeriod.trim() && <li>· 请填写「期望完成周期」</li>}
                  </ul>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={goBack} className="rounded-xl border border-[#E5E5E5] px-5 py-3 text-sm font-semibold text-[#666666] hover:bg-[#F5F5F5] transition-colors">返回上一步</button>
                <button onClick={goNext} disabled={!canGoNextStep2()} className="inline-flex items-center gap-2 rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#333333] disabled:bg-[#E5E5E5] disabled:text-[#999999]">开始增长诊断<ArrowRight size={15} /></button>
              </div>
            </div>
          </section>
        )}

        {/* ════════════════ Step 3 — Growth Diagnosis ════════════════ */}
        {step === 3 && (
          <section className="mt-5 space-y-5">
            {/* Workflow checklist */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <h2 className="text-lg font-bold text-[#111111]">{diagnosisComplete ? '增长诊断完成' : 'AI 正在分析……'}</h2>
              <div className="mt-5 space-y-3">
                {workflowItems.map((item, i) => {
                  const done = i < checklistProgress;
                  const current = i === checklistProgress;
                  return (
                    <div key={item} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all duration-300 ${done ? 'border-[#E5E5E5] bg-[#F9F9F9] text-[#111111]' : current ? 'border-[#111111] bg-white text-[#111111]' : 'border-[#F0F0F0] bg-white text-[#CCCCCC]'}`}>
                      <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${done ? 'bg-emerald-500 text-white' : current ? 'bg-[#111111] text-white' : 'bg-[#F5F5F5] text-[#CCCCCC]'}`}>
                        {done ? <Check size={12} /> : current ? <Loader2 size={12} className="animate-spin" /> : i + 1}
                      </span>
                      <span className={current ? 'font-semibold' : done ? 'font-medium' : ''}>{item}</span>
                      {current && !done && <span className="text-[11px] text-[#999999] ml-auto">分析中…</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detailed funnel diagnosis — only after complete */}
            {diagnosisComplete && (
              <>
                <div ref={diagnosisRef}>
                {/* Diagnosis summary card */}
                <div className="rounded-2xl bg-white p-6 md:p-8 border-2 border-[#111111]">
                  <h3 className="text-sm font-semibold text-[#111111] mb-3">诊断结果摘要</h3>
                  {/* One-sentence recommendation */}
                  {(() => {
                    const worst = [...funnelMetrics].sort((a, b) => {
                      const r: Record<string, number> = { '严重流失': 4, '中度流失': 3, '轻度流失': 2, '临界/需进一步验证': 1, '正常': 0 };
                      return (r[b.status] || 0) - (r[a.status] || 0);
                    })[0];
                    const rec = worst?.stage === '加购→提交订单' ? { name: '优惠券可用性提示优化', reason: '下单环节流失明显，优惠理解障碍是主要阻力，实施成本低、预期影响高。' } :
                      worst?.stage === '提交订单→支付' ? { name: '物流承诺强化', reason: '支付阶段流失明显，影响收益最高，物流承诺前置实施成本低。' } :
                      worst?.stage === '详情页→加购' ? { name: '活动规则表达优化', reason: '用户在评估阶段流失，规则简化可降低决策摩擦，预期影响中等。' } :
                      worst?.stage === '曝光→点击' ? { name: '渠道素材优化', reason: '流量到点击转化偏低，优化入口素材可快速见效。' } :
                      { name: '优惠券可用性提示优化', reason: '该方案覆盖范围广、实施成本可控，是当前最值得优先验证的增长杠杆。' };
                    return (
                      <div className="rounded-xl bg-[#F9F9F9] border border-[#E5E5E5] p-3 mb-4">
                        <p className="text-xs text-[#999999] mb-0.5">推荐优先优化</p>
                        <p className="text-sm font-bold text-[#111111]">{rec.name}</p>
                        <p className="text-xs text-[#666666] mt-1 leading-relaxed">{rec.reason}</p>
                      </div>
                    );
                  })()}
                  <div className="grid gap-3 sm:grid-cols-4 mb-5">
                    {(() => {
                      const normalCount = funnelMetrics.filter((m) => m.status === '正常').length;
                      const borderlineCount = funnelMetrics.filter((m) => m.status === '临界/需进一步验证').length;
                      const abnormalCount = funnelMetrics.filter((m) => m.status !== '正常' && m.status !== '临界/需进一步验证').length;
                      const worst = [...funnelMetrics].sort((a, b) => {
                        const r: Record<string, number> = { '严重流失': 4, '中度流失': 3, '轻度流失': 2, '临界/需进一步验证': 1, '正常': 0 };
                        return (r[b.status] || 0) - (r[a.status] || 0);
                      })[0];
                      return (
                        <>
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                            <p className="text-2xl font-bold text-emerald-700">{normalCount}</p>
                            <p className="text-[11px] text-emerald-600 font-medium">正常环节</p>
                          </div>
                          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-center">
                            <p className="text-2xl font-bold text-zinc-700">{borderlineCount}</p>
                            <p className="text-[11px] text-zinc-600 font-medium">临界环节</p>
                          </div>
                          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
                            <p className="text-2xl font-bold text-red-700">{abnormalCount}</p>
                            <p className="text-[11px] text-red-600 font-medium">异常环节</p>
                          </div>
                          <div className="rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] p-3 text-center">
                            <p className="text-xs font-bold text-[#111111] leading-tight">{worst?.stage || '—'}</p>
                            <p className="text-[11px] text-[#999999]">最主要瓶颈</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setShowFullFunnel(!showFullFunnel)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] px-4 py-2.5 text-sm font-semibold text-[#666666] hover:border-[#111111] hover:text-[#111111] transition-colors"
                    >
                      {showFullFunnel ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      {showFullFunnel ? '收起完整漏斗' : '查看完整漏斗'}
                    </button>
                    <button
                      onClick={() => {
                        const el = document.getElementById('ai-judgment-section');
                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#333333] transition-colors"
                    >
                      查看AI诊断总结 <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
                </div>

                {/* Funnel stages — collapsed by default */}
                {showFullFunnel && (
                <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
                  <h3 className="text-sm font-semibold text-[#111111] mb-4">增长漏斗诊断</h3>
                  <div className="space-y-3">
                    {funnelMetrics.map((m, i) => {
                      const st = statusStyles[m.status];
                      const vr = verificationResults[i];
                      const displayStatus = vr ? vr.conclusion : m.status;
                      const displaySt = vr ? verifiedStatusStyles[vr.conclusion] : st;
                      const isExpanded = expandedStage === i;
                      const hasFeedback = m.status !== '正常' && Object.keys(feedbackKeywords).length > 0;
                      const isBorderline = m.status === '临界/需进一步验证';
                      const isVerifying = verifyingStage === i;

                      // Find relevant feedback keywords for this stage
                      const relevantKeywords: Record<string, string[]> = {
                        '曝光→点击': ['广告', '入口', '误导'],
                        '点击→详情页': ['详情页', '加载', '描述'],
                        '详情页→加购': ['详情页', '描述', '尺码', '价格'],
                        '加购→提交订单': ['优惠券', '门槛', '结算', '地址', '支付方式'],
                        '提交订单→支付': ['支付', '失败', '银行卡', '物流', '包邮', '运费'],
                      };
                      const stageKeywords = relevantKeywords[m.stage] || [];
                      const matchedFeedback = Object.entries(feedbackKeywords).filter(([kw]) =>
                        stageKeywords.some((sk) => kw.includes(sk))
                      );

                      return (
                        <div key={m.stage} className={`rounded-xl border ${m.affectedByProblem ? 'border-[#111111]' : 'border-[#E5E5E5]'} overflow-hidden`}>
                          {/* Stage header */}
                          <div className="flex items-center gap-4 px-4 py-3">
                            <div className={`shrink-0 rounded-lg border ${st.border} ${st.bg} px-2.5 py-1 text-xs font-semibold ${st.text}`}>
                              {m.from} → {m.to}
                            </div>

                            <div className="flex-1 grid grid-cols-3 gap-3 text-xs min-w-0">
                              <div><span className="text-[#999999]">转换</span><div className="font-semibold text-[#111111]">{m.conversionRate}%</div></div>
                              <div><span className="text-[#999999]">流失</span><div className="font-semibold text-[#111111]">{m.churnRate}%</div></div>
                              <div><span className="text-[#999999]">置信度</span><div className="font-semibold text-[#111111]">{m.confidence}%</div></div>
                            </div>

                            <span className={`inline-flex items-center gap-1 rounded-full border ${displaySt.border} ${displaySt.bg} px-2 py-0.5 text-[11px] font-medium ${displaySt.text} shrink-0`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${displaySt.dot}`} />
                              {displayStatus}
                              {vr && <span className="text-[9px] ml-0.5 opacity-70">已验证</span>}
                            </span>

                            {/* Verify trigger for borderline stages */}
                            {isBorderline && !vr && (
                              <button
                                onClick={() => runVerification(i)}
                                disabled={isVerifying}
                                className="shrink-0 rounded-lg border border-[#E5E5E5] bg-white px-2.5 py-1 text-[11px] font-medium text-[#666666] hover:border-[#111111] hover:text-[#111111] disabled:opacity-50 transition-colors"
                              >
                                {isVerifying ? (
                                  <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" />验证中</span>
                                ) : (
                                  '启动二次验证'
                                )}
                              </button>
                            )}

                            <button
                              onClick={() => setExpandedStage(isExpanded ? null : i)}
                              className="shrink-0 p-1 rounded hover:bg-[#F5F5F5] transition-colors"
                            >
                              {isExpanded ? <ChevronUp size={16} className="text-[#666666]" /> : <ChevronDown size={16} className="text-[#999999]" />}
                            </button>
                          </div>

                          {/* Expandable basis */}
                          {isExpanded && (
                            <div className="border-t border-[#E5E5E5] bg-[#F9F9F9] px-4 py-4 space-y-4">
                              {/* 1. Data basis */}
                              <div>
                                <p className="text-xs font-semibold text-[#111111] mb-1.5">数据依据</p>
                                <div className="rounded-lg bg-white border border-[#E5E5E5] px-3 py-2 text-xs text-[#666666]">
                                  从 {m.from}（{m.fromCount.toLocaleString()} 人）到 {m.to}（{m.toCount.toLocaleString()} 人），转化率 {m.conversionRate}%，流失率 {m.churnRate}%。
                                  {m.status === '临界/需进一步验证' && <span className="block mt-1 text-zinc-600 font-medium">该指标距离判定阈值在 ±3 个百分点以内，建议结合历史基线、渠道分布与用户反馈继续判断。</span>}
                                </div>
                              </div>

                              {/* 2. Rule basis */}
                              <div>
                                <p className="text-xs font-semibold text-[#111111] mb-1.5">规则依据（演示阈值）</p>
                                <div className="rounded-lg bg-white border border-[#E5E5E5] divide-y divide-[#F0F0F0]">
                                  {m.thresholds.map((t) => (
                                    <div key={t.label} className="flex items-center justify-between px-3 py-1.5 text-xs">
                                      <span className="text-[#666666]">{t.label}</span>
                                      <span className="font-medium text-[#111111]">{t.range}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* 3. Feedback basis */}
                              <div>
                                <p className="text-xs font-semibold text-[#111111] mb-1.5">反馈依据</p>
                                {matchedFeedback.length > 0 ? (
                                  <div className="rounded-lg bg-white border border-[#E5E5E5] px-3 py-2">
                                    {matchedFeedback.map(([kw, v]) => (
                                      <div key={kw} className="flex items-center justify-between text-xs py-0.5">
                                        <span className="text-[#666666]">{kw}</span>
                                        <span className="font-medium text-[#111111]">{v.count} 次提及（{v.ratio}%）</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="rounded-lg bg-white border border-[#E5E5E5] px-3 py-2 text-xs text-[#999999]">该环节无强关联反馈关键词。</p>
                                )}
                              </div>

                              {/* 4. Judgment */}
                              <div>
                                <p className="text-xs font-semibold text-[#111111] mb-1.5">判断说明</p>
                                <div className="rounded-lg bg-white border border-[#E5E5E5] px-3 py-2 text-xs text-[#666666] leading-relaxed">
                                  {m.status === '正常' && (
                                    <>当前 {m.stage} 转化率 {m.conversionRate}% 处于正常区间（≥{m.thresholds[0].range.replace('≥', '')}），数据与规则一致，置信度 {m.confidence}%。</>
                                  )}
                                  {m.status !== '正常' && m.status !== '临界/需进一步验证' && (
                                    <>{m.stage} 转化率 {m.conversionRate}% 处于{m.status}区间。{hasFeedback ? `用户反馈中匹配到 ${matchedFeedback.length} 类相关关键词，数据、规则与反馈三方一致。` : '当前无强关联用户反馈，建议补充反馈数据交叉验证。'} 置信度 {m.confidence}%。</>
                                  )}
                                  {m.status === '临界/需进一步验证' && !vr && (
                                    <>{m.stage} 转化率 {m.conversionRate}% 处于临界区间（接近阈值边界 ±3pp）。当前数据不足以给出确定性结论，建议启动二次验证进行多维度分析。置信度 {m.confidence}%。</>
                                  )}
                                  {m.status === '临界/需进一步验证' && vr && (
                                    <>二次验证结论：<strong className={verifiedStatusStyles[vr.conclusion].text}>{vr.conclusion}</strong>。{vr.summary} 置信度 {vr.confidence}%。</>
                                  )}
                                  <span className="block mt-1 text-[#999999]">当前阈值为演示规则，可根据实际业务基线调整。</span>
                                </div>
                              </div>

                              {/* ── Secondary Verification Results ── */}
                              {isBorderline && vr && (
                                <>
                                  {/* 5. Conclusion badge */}
                                  <div className={`rounded-lg border ${verifiedStatusStyles[vr.conclusion].border} ${verifiedStatusStyles[vr.conclusion].bg} p-3`}>
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${verifiedStatusStyles[vr.conclusion].dot}`}>
                                        <Check size={13} className="text-white" />
                                      </span>
                                      <div>
                                        <span className={`text-sm font-bold ${verifiedStatusStyles[vr.conclusion].text}`}>二次验证：{vr.conclusion}</span>
                                        <span className="text-xs text-[#999999] ml-2">置信度 {vr.confidence}%</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* 5a. Historical baseline */}
                                  <div>
                                    <p className="text-xs font-semibold text-[#111111] mb-1.5">历史基线对比</p>
                                    <div className="rounded-lg bg-white border border-[#E5E5E5] overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="bg-[#F5F5F5]">
                                            <th className="px-3 py-1.5 text-left font-medium text-[#666666]">参考周期</th>
                                            <th className="px-3 py-1.5 text-right font-medium text-[#666666]">转化率</th>
                                            <th className="px-3 py-1.5 text-right font-medium text-[#666666]">vs 当前</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#F0F0F0]">
                                          {vr.historicalBaseline.map((h) => {
                                            const delta = m.conversionRate - h.rate;
                                            const deltaStr = delta >= 0 ? `+${delta.toFixed(1)}pp` : `${delta.toFixed(1)}pp`;
                                            const deltaColor = delta >= 0 ? 'text-emerald-600' : 'text-red-600';
                                            return (
                                              <tr key={h.period}>
                                                <td className="px-3 py-1.5 text-[#666666]">{h.period}</td>
                                                <td className="px-3 py-1.5 text-right font-medium text-[#111111]">{h.rate}%</td>
                                                <td className={`px-3 py-1.5 text-right font-medium ${deltaColor}`}>{deltaStr}</td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>

                                  {/* 5b. Channel breakdown */}
                                  <div>
                                    <p className="text-xs font-semibold text-[#111111] mb-1.5">渠道差异分析</p>
                                    <div className="rounded-lg bg-white border border-[#E5E5E5] overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="bg-[#F5F5F5]">
                                            <th className="px-3 py-1.5 text-left font-medium text-[#666666]">渠道</th>
                                            <th className="px-3 py-1.5 text-right font-medium text-[#666666]">转化率</th>
                                            <th className="px-3 py-1.5 text-center font-medium text-[#666666]">趋势</th>
                                            <th className="px-3 py-1.5 text-right font-medium text-[#666666]">变化</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#F0F0F0]">
                                          {vr.channelBreakdown.map((ch) => {
                                            const trendColor = ch.trend === '↑' ? 'text-emerald-600' : ch.trend === '↓' ? 'text-red-600' : 'text-[#999999]';
                                            return (
                                              <tr key={ch.channel}>
                                                <td className="px-3 py-1.5 text-[#666666]">{ch.channel}</td>
                                                <td className="px-3 py-1.5 text-right font-medium text-[#111111]">{ch.rate}%</td>
                                                <td className={`px-3 py-1.5 text-center font-bold ${trendColor}`}>{ch.trend}</td>
                                                <td className={`px-3 py-1.5 text-right font-medium ${ch.trend === '↓' ? 'text-red-600' : 'text-[#666666]'}`}>{ch.delta}</td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>

                                  {/* 5c. Trend */}
                                  <div>
                                    <p className="text-xs font-semibold text-[#111111] mb-1.5">趋势判断</p>
                                    <div className="rounded-lg bg-white border border-[#E5E5E5] px-3 py-2 text-xs text-[#666666] leading-relaxed">
                                      {vr.trend.description}
                                    </div>
                                  </div>

                                  {/* 5d. Feedback correlation */}
                                  <div>
                                    <p className="text-xs font-semibold text-[#111111] mb-1.5">反馈交叉验证</p>
                                    <div className="rounded-lg bg-white border border-[#E5E5E5] overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="bg-[#F5F5F5]">
                                            <th className="px-3 py-1.5 text-left font-medium text-[#666666]">关键词</th>
                                            <th className="px-3 py-1.5 text-right font-medium text-[#666666]">提及次数</th>
                                            <th className="px-3 py-1.5 text-left font-medium text-[#666666]">影响评估</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#F0F0F0]">
                                          {vr.feedbackCorrelation.map((f) => (
                                            <tr key={f.keyword}>
                                              <td className="px-3 py-1.5 font-medium text-[#111111]">{f.keyword}</td>
                                              <td className="px-3 py-1.5 text-right text-[#666666]">{f.count} 次</td>
                                              <td className="px-3 py-1.5 text-[#666666]">{f.impact}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}

                {/* AI Judgment summary — dynamic */}
                {judgment && (
                  <div id="ai-judgment-section" className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
                    <h3 className="text-sm font-semibold text-[#111111] mb-3">
                      AI诊断总结
                      <span className="ml-2 text-[11px] font-normal text-[#999999]">基于当前数据、增长机会、资源约束与实验风险形成的执行建议。</span>
                    </h3>

                    {/* Core conclusion */}
                    <div className="rounded-xl bg-[#F9F9F9] border border-[#E5E5E5] p-4 space-y-3">
                      <div>
                        <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-1">核心结论</p>
                        <p className="text-sm text-[#111111] leading-relaxed">{judgment.coreConclusion}</p>
                      </div>

                      {/* Secondary issues */}
                      {judgment.secondaryIssues.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-1">次要问题</p>
                          <ul className="space-y-1">
                            {judgment.secondaryIssues.map((s, i) => (
                              <li key={i} className="text-sm text-[#666666] leading-relaxed flex gap-2">
                                <span className="text-[#999999] shrink-0 mt-0.5">·</span>{s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Borderline items */}
                      {judgment.borderlineDetail.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-1">临界项说明</p>
                          {judgment.borderlineDetail.map((b) => (
                            <div key={b.stage} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 mb-1.5 text-xs">
                              <p className="font-medium text-[#111111]">{b.stage}：{b.reason}</p>
                              <p className="text-[#999999] mt-0.5">需要：{b.needed}</p>
                              <p className="text-[#999999]">建议：{b.suggestion}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Suggested actions */}
                      <div>
                        <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-1">建议动作</p>
                        <ul className="space-y-1">
                          {judgment.suggestedActions.map((a, i) => (
                            <li key={i} className="text-sm text-[#111111] leading-relaxed flex gap-2">
                              <span className="text-emerald-600 font-bold shrink-0">{i + 1}.</span>{a}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Not recommended */}
                      <div>
                        <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-1">暂不建议</p>
                        <ul className="space-y-1">
                          {judgment.notRecommended.map((n, i) => (
                            <li key={i} className="text-sm text-[#999999] leading-relaxed flex gap-2">
                              <span className="text-red-400 shrink-0">✕</span>{n}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Collapsible judgment basis */}
                    <div className="mt-4">
                      <button
                        onClick={() => setShowJudgmentBasis(!showJudgmentBasis)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#666666] hover:text-[#111111] transition-colors"
                      >
                        {showJudgmentBasis ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        查看判断依据
                      </button>
                      {showJudgmentBasis && (
                        <div className="mt-3 rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] p-4 space-y-4">
                          <div>
                            <p className="text-xs font-semibold text-[#111111] mb-1">数据依据</p>
                            <p className="text-xs text-[#666666] leading-relaxed">{judgment.basis.dataBasis}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-[#111111] mb-1">规则依据</p>
                            <p className="text-xs text-[#666666] leading-relaxed">{judgment.basis.ruleBasis}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-[#111111] mb-1">用户反馈依据</p>
                            <p className="text-xs text-[#666666] leading-relaxed">{judgment.basis.feedbackBasis}</p>
                          </div>
                          {judgment.basis.missingData.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-[#111111] mb-1">缺失数据</p>
                              <div className="flex flex-wrap gap-1.5">
                                {judgment.basis.missingData.map((d) => (
                                  <span key={d} className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">{d}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-semibold text-[#111111] mb-1">置信度说明</p>
                            <p className="text-xs text-[#666666] leading-relaxed">{judgment.basis.confidenceNote}</p>
                            <p className="text-xs text-[#999999] mt-1">当前阈值为演示规则，可根据实际业务基线调整。</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Continue */}
                <div className="rounded-2xl bg-white p-6 border border-[#E5E5E5] flex gap-3">
                  <button onClick={goBack} className="rounded-xl border border-[#E5E5E5] px-5 py-3 text-sm font-semibold text-[#666666] hover:bg-[#F5F5F5] transition-colors">返回上一步</button>
                  <button onClick={goNext} className="inline-flex items-center gap-2 rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#333333]">查看增长机会<ArrowRight size={15} /></button>
                </div>
              </>
            )}
          </section>
        )}

        {/* ════════════════ Step 4 — Growth Opportunities ════════════════ */}
        {step === 4 && (
          <section className="mt-5 rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
            <h2 className="text-lg font-bold text-[#111111]">发现 3 个高优先级增长机会</h2>
            <p className="mt-1 text-sm text-[#666666]">AI Growth Manager 已识别出以下增长杠杆点，按优先级排序</p>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {computePriorities().map((po, cardIdx) => {
                const opIdx = opps.find((o) => o.name === po.name)?.idx ?? 3;
                const fm = funnelMetrics.length > 0 ? funnelMetrics[opIdx] : null;
                const bottleneck = fm ? `${fm.stage}（${fm.status}）` : opIdx === 3 ? '加购→提交订单（中度流失）' : opIdx === 2 ? '详情页→加购（正常）' : '提交订单→支付（正常）';
                const currentData = fm ? `转化率 ${fm.conversionRate}%，流失 ${fm.churnRate}%` : '—';
                const isSelected = selectedOpportunity?.name === po.name;
                const impactStars = Math.round(po.score.impact / 2); // 0-10 → 0-5 stars
                const costStars = Math.round(po.score.cost / 2);
                return (
                  <div key={po.name}
                    onClick={() => handleSelectOpportunity({ name: po.name, bottleneck, currentData })}
                    className={`rounded-2xl border-2 bg-white p-5 flex flex-col text-left transition-all cursor-pointer ${isSelected ? 'border-[#111111]' : 'border-[#E5E5E5] hover:border-[#D4D4D4]'}`}
                  >
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold w-fit ${isSelected ? 'bg-[#111111] text-white' : po.priorityLabel === 'P0' ? 'bg-[#111111] text-white' : po.priorityLabel === 'P1' ? 'bg-[#666666] text-white' : 'bg-[#E5E5E5] text-[#666666]'}`}>{po.priorityLabel}</span>
                    <h3 className="mt-3 text-base font-bold text-[#111111] leading-snug">{po.name}</h3>
                    <div className="mt-4 space-y-2.5 flex-1 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[#999999] shrink-0">来源瓶颈</span>
                        <span className="font-semibold text-[#111111] text-right">{bottleneck}</span>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[#999999] shrink-0">当前数据</span>
                        <span className="font-semibold text-[#111111] text-right">{currentData}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#999999]">预期影响</span>
                        <span className="inline-flex gap-0.5">{Array.from({ length: 5 }, (_, i) => (<Star key={i} size={12} className={i < impactStars ? 'fill-[#111111] text-[#111111]' : 'text-[#E5E5E5]'} />))}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#999999]">实施成本</span>
                        <span className="inline-flex gap-0.5">{Array.from({ length: 5 }, (_, i) => (<Star key={i} size={12} className={i < costStars ? 'fill-[#111111] text-[#111111]' : 'text-[#E5E5E5]'} />))}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowBasisFor((prev) => ({ ...prev, [po.name]: !prev[po.name] })); }}
                        className="text-[11px] text-[#999999] hover:text-[#111111] text-left"
                      >
                        {showBasisFor[po.name] ? '收起依据 ▾' : '优先级依据 ▸'}
                      </button>
                      {showBasisFor[po.name] && (
                        <div className="rounded-lg border border-[#E5E5E5] bg-[#F9F9F9] p-2.5 text-[11px] space-y-1">
                          {[
                            { label: '影响评分', value: po.score.impact },
                            { label: '成本评分', value: po.score.cost },
                            { label: '相关度', value: po.score.relevance },
                            { label: '资源匹配度', value: po.score.resourceMatch },
                            { label: '置信度', value: po.score.confidence },
                          ].map((d) => (
                            <div key={d.label} className="flex justify-between">
                              <span className="text-[#999999]">{d.label}</span>
                              <span className="font-semibold text-[#111111]">{d.value}/10</span>
                            </div>
                          ))}
                          <div className="flex justify-between border-t border-[#E5E5E5] pt-1 mt-1">
                            <span className="text-[#999999]">最终得分</span>
                            <span className="font-bold text-[#111111]">{po.score.total}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleGenerateExperiment({ name: po.name, bottleneck, currentData }); }}
                      className={`mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${isSelected ? 'bg-[#111111] text-white hover:bg-[#333333]' : 'bg-white border border-[#E5E5E5] text-[#666666] hover:bg-[#F5F5F5]'}`}
                    >
                      生成实验方案
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-8">
              <button onClick={goBack} className="rounded-xl border border-[#E5E5E5] px-5 py-3 text-sm font-semibold text-[#666666] hover:bg-[#F5F5F5] transition-colors">返回上一步</button>
            </div>
          </section>
        )}

        {/* ════════════════ Step 5 — Experiment Plan ════════════════ */}
        {step === 5 && experimentPlan && (
          <section className="mt-5 space-y-5">
            {/* Low-risk banner */}
            {showLowRiskBanner && lowRiskExperiment && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-amber-800">已根据低决策信心生成低风险验证方案</p>
                  <p className="text-xs text-amber-600 mt-0.5">流量比例5%、周期3天、关注方向性趋势。</p>
                </div>
                <button onClick={handleRollbackToOriginalExperiment} className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors">返回原方案</button>
              </div>
            )}

            {/* Header */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <h2 className="text-lg font-bold text-[#111111]">增长实验方案</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-[#999999] shrink-0">来源机会：</span>
                  <span className="font-semibold text-[#111111]">{experimentPlan.sourceOpportunity}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-[#999999] shrink-0">来源瓶颈：</span>
                  <span className="font-semibold text-[#111111]">{experimentPlan.sourceBottleneck}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-[#999999] shrink-0">业务场景：</span>
                  <span className="font-semibold text-[#111111]">{experimentPlan.scene}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-[#999999] shrink-0">增长目标：</span>
                  <span className="font-semibold text-[#111111]">{experimentPlan.goal}</span>
                </div>
              </div>
            </div>

            {/* 1. Experiment name */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-1">实验名称</p>
              <p className="text-base font-bold text-[#111111]">{experimentPlan.name}</p>
            </div>

            {/* 2. Hypothesis */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-1">实验假设</p>
              <p className="text-sm text-[#111111] leading-relaxed">{experimentPlan.hypothesis}</p>
            </div>

            {/* 3. Target users */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-1">目标用户</p>
              <p className="text-sm text-[#111111] leading-relaxed">{experimentPlan.targetUsers}</p>
            </div>

            {/* 4 & 5. Experiment vs Control */}
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 border border-[#111111]">
                <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-1">实验组</p>
                <p className="text-sm text-[#111111] leading-relaxed">{experimentPlan.experimentGroup}</p>
              </div>
              <div className="rounded-2xl bg-white p-6 border border-[#E5E5E5]">
                <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-1">对照组</p>
                <p className="text-sm text-[#666666] leading-relaxed">{experimentPlan.controlGroup}</p>
              </div>
            </div>

            {/* 6. Core metrics */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-2">核心指标</p>
              <div className="flex flex-wrap gap-2">
                {experimentPlan.coreMetrics.map((m) => (
                  <span key={m} className="rounded-full border border-[#111111] bg-[#F5F5F5] px-3 py-1 text-xs font-medium text-[#111111]">{m}</span>
                ))}
              </div>
            </div>

            {/* 7. Guardrails */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-2">护栏指标</p>
              <div className="space-y-1.5">
                {experimentPlan.guardrailMetrics.map((g, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-[#666666]">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />{g}
                  </div>
                ))}
              </div>
            </div>

            {/* 8 & 9. Period & Sample */}
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 border border-[#E5E5E5]">
                <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-1">实验周期</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number" value={experimentPlan.period} min={1} max={30}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 7;
                      setExperimentPlan((prev) => prev ? { ...prev, period: v } : prev);
                    }}
                    className="w-16 rounded-lg border border-[#E5E5E5] px-3 py-1.5 text-sm font-semibold text-[#111111] outline-none focus:border-[#111111]"
                  />
                  <span className="text-sm text-[#999999]">天</span>
                </div>
              </div>
              <div className="rounded-2xl bg-white p-6 border border-[#E5E5E5]">
                <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-1">样本范围</p>
                <input
                  type="text" value={experimentPlan.sampleScope}
                  onChange={(e) => {
                    setExperimentPlan((prev) => prev ? { ...prev, sampleScope: e.target.value } : prev);
                  }}
                  className="w-full rounded-lg border border-[#E5E5E5] px-3 py-1.5 text-sm text-[#111111] outline-none focus:border-[#111111]"
                />
              </div>
            </div>

            {/* 10. Success criteria */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-1">成功标准</p>
              <p className="text-sm text-[#111111] leading-relaxed">{experimentPlan.successCriteria}</p>
            </div>

            {/* 11. Risks */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-2">风险</p>
              <div className="space-y-2">
                {experimentPlan.risks.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${r.severity === '高' ? 'bg-red-500' : r.severity === '中' ? 'bg-amber-400' : 'bg-zinc-300'}`} />
                    <span className="text-[#666666] leading-relaxed">{r.description}</span>
                    <span className={`text-[10px] font-medium shrink-0 ${r.severity === '高' ? 'text-red-600' : r.severity === '中' ? 'text-amber-600' : 'text-zinc-500'}`}>{r.severity}风险</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 12. Dependencies */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-2">依赖资源</p>
              <div className="space-y-1.5">
                {experimentPlan.dependencies.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-[#666666]">
                    <span className="text-[#999999]">{i + 1}.</span>{d}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="rounded-2xl bg-white p-6 border border-[#E5E5E5] flex gap-3 flex-wrap">
              <button onClick={goBack} className="rounded-xl border border-[#E5E5E5] px-5 py-3 text-sm font-semibold text-[#666666] hover:bg-[#F5F5F5] transition-colors">返回增长机会</button>
              <button onClick={handleRegenerateExperiment} className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] px-5 py-3 text-sm font-semibold text-[#666666] hover:border-[#111111] hover:text-[#111111] transition-colors">
                <RotateCcw size={14} /> 换一个方案
              </button>
              <button onClick={handleEnterDecision} className="inline-flex items-center gap-2 rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#333333] ml-auto">
                进入AI增长决策 <ArrowRight size={15} />
              </button>
            </div>
          </section>
        )}

        {/* ════════════════ Step 6 — AI Growth Decision ════════════════ */}
        {step === 6 && experimentPlan && aiDecision && (
          <section className="mt-5 space-y-5">
            {/* Header */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <h2 className="text-lg font-bold text-[#111111]">AI增长决策</h2>
              <p className="mt-1 text-sm text-[#666666]">基于当前业务数据、增长机会、可投入资源与实验风险形成的执行建议。</p>
            </div>

            {/* 1. Core judgment */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-2">当前核心判断</p>
              <p className="text-sm text-[#111111] leading-relaxed">{aiDecision.coreJudgment}</p>
            </div>

            {/* 2. Confidence */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-2">决策信心</p>
              <div className="flex items-center gap-3">
                <span className={`text-lg font-bold ${aiDecision.confidence.level === '高' ? 'text-emerald-700' : aiDecision.confidence.level === '中' ? 'text-amber-700' : 'text-red-700'}`}>
                  {aiDecision.confidence.level}
                </span>
                <span className="inline-flex gap-0.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} size={16} className={i < aiDecision.confidence.stars ? 'fill-[#111111] text-[#111111]' : 'text-[#E5E5E5]'} />
                  ))}
                </span>
              </div>
              <p className="mt-2 text-xs text-[#666666] leading-relaxed">{aiDecision.confidence.reason}</p>
            </div>

            {/* 2b. Remediation / Supplement data module */}
            {aiDecision.confidence.level === '低' && (
              <div className="rounded-2xl bg-white p-6 md:p-8 border border-amber-200 bg-amber-50/30">
                <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-3">补充验证数据</p>
                <p className="text-xs text-amber-600 mb-3">补充以下任一数据，可提升当前增长决策的置信度。</p>

                {useMockData && mockConfig && (
                  <p className="text-xs text-amber-500 mb-3">当前使用模拟数据，可通过增加周期、样本量、历史基线、渠道拆分或用户反馈提升验证强度。</p>
                )}

                {/* Supplement upload rows */}
                <div className="space-y-2 mb-4">
                  {[
                    { key: 'historical', label: '历史基线数据', hint: '上传近4周历史转化率基线' },
                    { key: 'channel', label: '渠道拆分数据', hint: '上传各渠道的转化率数据' },
                    { key: 'feedback', label: '用户反馈数据', hint: '上传客服记录或用户反馈' },
                    { key: 'control', label: '对照期数据', hint: '上传未做干预时的对照数据' },
                  ].map(({ key, label, hint }) => {
                    const file = supplementFiles[key];
                    return (
                      <div key={key} className="flex items-center justify-between rounded-lg bg-white border border-[#E5E5E5] px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-sm text-[#111111] font-medium">{label}</span>
                          <span className="text-[11px] text-[#999999] ml-2">{hint}</span>
                          {file && (
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              <span className="text-xs text-emerald-700">{file.name}</span>
                              <span className="text-[10px] text-[#999999]">{file.status}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <label className="cursor-pointer rounded border border-[#E5E5E5] px-2 py-1 text-[11px] font-medium text-[#666666] hover:border-[#111111] transition-colors">
                            上传
                            <input type="file" accept=".csv,.xlsx,.json" className="hidden" onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) setSupplementFiles((prev) => ({ ...prev, [key]: { name: f.name, status: '已上传' } }));
                            }} />
                          </label>
                          {file && (
                            <button onClick={() => { setSupplementFiles((prev) => { const n = { ...prev }; delete n[key]; return n; }); }} className="p-1 rounded hover:bg-[#E5E5E5]">
                              <X size={12} className="text-[#999999]" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Mock data extension row */}
                  <div className="flex items-center justify-between rounded-lg bg-white border border-[#E5E5E5] px-3 py-2">
                    <div>
                      <span className="text-sm text-[#111111] font-medium">扩展模拟数据</span>
                      <span className="text-[11px] text-[#999999] ml-2">
                        {Object.values(supplementOptions).filter(Boolean).length > 0
                          ? `已勾选 ${Object.values(supplementOptions).filter(Boolean).length} 项`
                          : '勾选补充维度后扩展'}
                      </span>
                    </div>
                    <button
                      onClick={() => setShowSupplementPanel(!showSupplementPanel)}
                      className="shrink-0 rounded-lg border border-[#E5E5E5] px-2.5 py-1.5 text-[11px] font-medium text-[#666666] hover:border-[#111111] transition-colors"
                    >
                      {showSupplementPanel ? '收起' : '配置'}
                    </button>
                  </div>
                  {showSupplementPanel && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <div className="grid grid-cols-3 gap-1.5">
                        {Object.keys(supplementOptions).map((key) => (
                          <button key={key} onClick={() => setSupplementOptions((prev) => ({ ...prev, [key]: !prev[key] }))}
                            className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-all ${supplementOptions[key] ? 'border-amber-400 bg-amber-100 text-amber-800' : 'border-[#E5E5E5] bg-white text-[#666666] hover:border-amber-300'}`}>
                            {supplementOptions[key] ? '✓ ' : ''}{key}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-amber-500">本次补充将在模拟数据基础上扩展所选依据，不会重新随机生成整个数据集。</p>
                    </div>
                  )}

                  {/* Low-risk experiment row */}
                  {funnelMetrics.filter((m) => m.status === '临界/需进一步验证').length > 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-white border border-[#E5E5E5] px-3 py-2">
                      <span className="text-sm text-[#666666]">多个指标处于临界状态 — 建议运行小流量验证实验</span>
                      <button onClick={handleGenerateLowRiskExperiment} className="shrink-0 rounded-lg border border-[#E5E5E5] px-3 py-2 text-xs font-medium text-[#666666] hover:border-[#111111] transition-colors">生成低风险验证方案</button>
                    </div>
                  )}

                  {/* Resource insufficient */}
                  {resources.length < 3 && (
                    <div className="flex items-center justify-between rounded-lg bg-white border border-[#E5E5E5] px-3 py-2">
                      <span className="text-sm text-[#666666]">可投入资源较少 — 建议补充资源配置</span>
                      <button onClick={() => setStep(2)} className="shrink-0 rounded-lg border border-[#E5E5E5] px-3 py-2 text-xs font-medium text-[#666666] hover:border-[#111111] transition-colors">返回修改资源</button>
                    </div>
                  )}
                </div>

                {/* Regenerate button — gray when no supplement */}
                <div className="space-y-2">
                  {!hasAnySupplement && (
                    <p className="text-[11px] text-amber-600">请先补充至少一项验证依据。</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (!hasAnySupplement) return;
                        if (!experimentPlan || !selectedOpportunity) return;
                        setPreviousAiDecision(aiDecision);
                        handleExtendMockData();
                      }}
                      disabled={!hasAnySupplement}
                      className={`flex-1 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                        hasAnySupplement ? 'bg-[#111111] text-white hover:bg-[#333333]' : 'bg-[#E5E5E5] text-[#999999] cursor-not-allowed'
                      }`}
                    >
                      补充依据后重新生成决策
                    </button>
                    {previousAiDecision && (
                      <button onClick={() => { setAiDecision(previousAiDecision); setPreviousAiDecision(null); }}
                        className="rounded-xl border border-[#E5E5E5] px-4 py-3 text-sm font-medium text-[#666666] hover:border-[#111111] transition-colors">
                        返回上一版本
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 3. Top action */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border-2 border-[#111111]">
              <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-3">最优先动作</p>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-[#111111] px-2 py-0.5 text-[11px] font-bold text-white">{aiDecision.topAction.priority}</span>
                  <span className="font-bold text-[#111111]">{aiDecision.topAction.name}</span>
                </div>
                <p className="text-[#666666]"><span className="font-semibold text-[#111111]">为什么优先：</span>{aiDecision.topAction.why}</p>
                <div className="flex gap-4 text-xs">
                  <span className="text-[#999999]">预期影响：<span className="font-semibold text-[#111111]">{aiDecision.topAction.impact}</span></span>
                  <span className="text-[#999999]">实施成本：<span className="font-semibold text-[#111111]">{aiDecision.topAction.cost}</span></span>
                  <span className="text-[#999999]">预计周期：<span className="font-semibold text-[#111111]">{aiDecision.topAction.period}</span></span>
                </div>
              </div>
            </div>

            {/* ── Collapsible detail sections ── */}
            <button
              onClick={() => setShowDecisionDetails(!showDecisionDetails)}
              className="w-full rounded-2xl bg-white p-4 border border-[#E5E5E5] flex items-center justify-between hover:border-[#D4D4D4] transition-colors"
            >
              <span className="text-sm font-semibold text-[#111111]">
                {showDecisionDetails ? '收起详细分析' : '查看详细分析（暂不建议、执行顺序、临界项、判断依据）'}
              </span>
              {showDecisionDetails ? <ChevronUp size={16} className="text-[#666666]" /> : <ChevronDown size={16} className="text-[#666666]" />}
            </button>

            {showDecisionDetails && (
              <div className="space-y-5">
                {/* Not recommended */}
                <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
                  <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-2">暂不建议</p>
                  <div className="space-y-3">
                    {aiDecision.notRecommended.map((n, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-red-400 font-bold shrink-0">✕</span>
                        <div>
                          <p className="text-sm font-semibold text-[#111111]">{n.action}</p>
                          <p className="text-xs text-[#666666] mt-0.5 leading-relaxed">{n.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Execution steps */}
                <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
                  <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-3">建议执行顺序</p>
                  <div className="space-y-3">
                    {aiDecision.executionSteps.map((s) => (
                      <div key={s.step} className="flex items-start gap-3">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#111111] text-xs font-bold text-white">{s.step}</span>
                        <p className="text-sm text-[#111111] leading-relaxed pt-0.5">{s.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Borderline results */}
                {aiDecision.borderlineResults.length > 0 && (
                  <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
                    <p className="text-[11px] font-semibold text-[#999999] uppercase tracking-wide mb-2">临界项处理结果</p>
                    <div className="space-y-3">
                      {aiDecision.borderlineResults.map((b, i) => {
                        const resultColors: Record<string, string> = {
                          '确认异常': 'border-red-200 bg-red-50 text-red-700',
                          '正常波动': 'border-emerald-200 bg-emerald-50 text-emerald-700',
                          '继续观察': 'border-amber-200 bg-amber-50 text-amber-700',
                        };
                        return (
                          <div key={i} className={`rounded-lg border p-3 ${resultColors[b.result] || 'border-zinc-200 bg-zinc-50 text-zinc-700'}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-[#111111]">{b.stage}</span>
                              <span className="text-xs font-medium">{b.result}</span>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed opacity-80">{b.reason}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Basis (collapsible within collapsed) */}
                <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
                  <button
                    onClick={() => setShowDecisionBasis(!showDecisionBasis)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#666666] hover:text-[#111111] transition-colors"
                  >
                    {showDecisionBasis ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    查看判断依据
                  </button>
                  {showDecisionBasis && (
                    <div className="mt-4 space-y-4">
                      <div>
                        <p className="text-xs font-semibold text-[#111111] mb-1">数据依据</p>
                        <p className="text-xs text-[#666666] leading-relaxed">{aiDecision.basis.data}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#111111] mb-1">规则依据</p>
                        <p className="text-xs text-[#666666] leading-relaxed">{aiDecision.basis.rules}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#111111] mb-1">用户反馈依据</p>
                        <p className="text-xs text-[#666666] leading-relaxed">{aiDecision.basis.feedback}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#111111] mb-1">资源匹配依据</p>
                        <p className="text-xs text-[#666666] leading-relaxed">{aiDecision.basis.resources}</p>
                      </div>
                      {aiDecision.basis.missing.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-[#111111] mb-1">缺失数据与风险</p>
                          <div className="flex flex-wrap gap-1.5">
                            {aiDecision.basis.missing.map((d) => (
                              <span key={d} className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">{d}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-[#111111] mb-1">置信度说明</p>
                        <p className="text-xs text-[#666666] leading-relaxed">{aiDecision.basis.confidence}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Footer + action */}
            <div className="rounded-2xl bg-white p-6 border border-[#E5E5E5] flex gap-3 flex-wrap items-center">
              <button onClick={goBack} className="rounded-xl border border-[#E5E5E5] px-5 py-3 text-sm font-semibold text-[#666666] hover:bg-[#F5F5F5] transition-colors">返回实验方案</button>
              <button onClick={handleEnterActionPlan} className="inline-flex items-center gap-2 rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#333333] ml-auto">
                <FileText size={15} /> 加入行动计划
              </button>
            </div>
            <p className="text-[11px] text-[#999999] text-center">当前判断基于本次数据、预设业务规则与用户反馈关联生成，仅用于概念验证。</p>
          </section>
        )}

        {/* ════════════════ Step 7 — Action Plan ════════════════ */}
        {step === 7 && experimentPlan && aiDecision && actionItems.length > 0 && (
          <section className="mt-5 space-y-5">
            {/* Completion header */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <div className="flex items-center gap-3 mb-4">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500">
                  <Check size={16} className="text-white" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-[#111111]">增长行动计划已生成</h2>
                  <p className="text-sm text-[#666666]">已将增长决策转化为可执行任务，你可以继续编辑、复制或导出。</p>
                </div>
              </div>

              {/* Progress summary */}
              <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-[#999999] mb-4">
                {stepLabels.map((s, i) => (
                  <span key={s.label} className={`inline-flex items-center gap-1 ${i < 6 ? 'text-[#666666]' : 'font-semibold text-[#111111]'}`}>
                    {i < 6 ? <Check size={12} className="text-emerald-500" /> : <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#111111]" />}
                    {s.label}
                    {i < stepLabels.length - 1 && <span className="text-[#E5E5E5] mx-0.5">→</span>}
                  </span>
                ))}
              </div>

              {/* Result summary */}
              <div className="rounded-xl bg-[#F9F9F9] border border-[#E5E5E5] p-4">
                <p className="text-sm text-[#666666] leading-relaxed">
                  本次共形成 <span className="font-bold text-[#111111]">{actionItems.filter((a) => a.priority === 'P0').length} 个 P0 实验</span>、<span className="font-bold text-[#111111]">{actionItems.filter((a) => a.priority !== 'P0').length} 个后续动作</span>，预计执行周期 <span className="font-bold text-[#111111]">{experimentPlan.period} 天</span>。
                  来源实验：<span className="font-medium text-[#111111]">{experimentPlan.name}</span>
                </p>
              </div>

              {/* Top action buttons */}
              <div className="flex gap-2 flex-wrap mt-4">
                <button
                  onClick={() => {
                    const md = exportActionPlanMarkdown(actionItems, experimentPlan);
                    navigator.clipboard.writeText(md);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E5E5] px-3 py-2 text-xs font-medium text-[#666666] hover:border-[#111111] transition-colors"
                >
                  <Copy size={13} /> 复制行动计划
                </button>
                <button
                  onClick={() => {
                    const md = exportActionPlanMarkdown(actionItems, experimentPlan);
                    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = '行动计划.md'; a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E5E5] px-3 py-2 text-xs font-medium text-[#666666] hover:border-[#111111] transition-colors"
                >
                  <Download size={13} /> 导出 Markdown
                </button>
              </div>
            </div>

            {/* Progress card */}
            <div className="rounded-2xl bg-white p-5 border border-[#E5E5E5]">
              {(() => {
                const completed = actionItems.filter((a) => a.status === '已完成').length;
                const inProgress = actionItems.filter((a) => a.status === '进行中').length;
                const paused = actionItems.filter((a) => a.status === '已暂停').length;
                const total = actionItems.length;
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                const allDone = completed === total && total > 0;
                const metCount = actionItems.filter((a) => a.executionResult?.metSuccessCriteria === '达标').length;
                const partialCount = actionItems.filter((a) => a.executionResult?.metSuccessCriteria === '部分达标').length;
                const unmetCount = actionItems.filter((a) => a.executionResult?.metSuccessCriteria === '未达标').length;
                return (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-[#111111]">
                        {allDone ? '🎉 本轮增长行动已执行完成，等待结果复盘。' : `已完成 ${completed}/${total} 项，整体进度 ${pct}%`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#F0F0F0] overflow-hidden mb-3">
                      <div className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-emerald-500' : 'bg-[#111111]'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-[#F9F9F9] py-1.5">
                        <p className="font-bold text-[#111111]">{completed}</p>
                        <p className="text-[10px] text-[#999999]">已完成</p>
                      </div>
                      <div className="rounded-lg bg-[#F9F9F9] py-1.5">
                        <p className="font-bold text-[#111111]">{inProgress}</p>
                        <p className="text-[10px] text-[#999999]">进行中</p>
                      </div>
                      <div className="rounded-lg bg-[#F9F9F9] py-1.5">
                        <p className="font-bold text-[#111111]">{paused}</p>
                        <p className="text-[10px] text-[#999999]">已暂停</p>
                      </div>
                      <div className="rounded-lg bg-[#F9F9F9] py-1.5">
                        <p className="font-bold text-[#111111]">{pct}%</p>
                        <p className="text-[10px] text-[#999999]">完成率</p>
                      </div>
                    </div>
                    {completed > 0 && (metCount + partialCount + unmetCount > 0) && (
                      <div className="mt-2 rounded-lg bg-[#F9F9F9] p-2 text-xs text-[#666666]">
                        本轮计划共完成 {completed} 项，其中 {metCount} 项达标、{partialCount} 项部分达标、{unmetCount} 项未达标。
                      </div>
                    )}
                    {allDone && (
                      <div className="mt-3 flex gap-2 flex-wrap">
                        <button className="rounded-lg border border-[#E5E5E5] px-3 py-1.5 text-xs font-medium text-[#666666] hover:border-[#111111] transition-colors">生成执行复盘</button>
                        <button
                          onClick={() => {
                            const md = exportActionPlanMarkdown(actionItems, experimentPlan);
                            const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
                            const url = URL.createObjectURL(blob); const a = document.createElement('a');
                            a.href = url; a.download = '行动计划.md'; a.click(); URL.revokeObjectURL(url);
                          }}
                          className="rounded-lg border border-[#E5E5E5] px-3 py-1.5 text-xs font-medium text-[#666666] hover:border-[#111111] transition-colors"
                        >
                          导出行动计划
                        </button>
                        <button onClick={onHome} className="rounded-lg border border-[#E5E5E5] px-3 py-1.5 text-xs font-medium text-[#666666] hover:border-[#111111] transition-colors ml-auto">返回员工中心</button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Action items table */}
            <div className="rounded-2xl bg-white border border-[#E5E5E5] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F5F5F5] text-left">
                      <th className="px-4 py-3 text-xs font-semibold text-[#666666]">优先级</th>
                      <th className="px-4 py-3 text-xs font-semibold text-[#666666]">行动项</th>
                      <th className="px-4 py-3 text-xs font-semibold text-[#666666] hidden md:table-cell">来源实验</th>
                      <th className="px-4 py-3 text-xs font-semibold text-[#666666]">负责人</th>
                      <th className="px-4 py-3 text-xs font-semibold text-[#666666]">周期</th>
                      <th className="px-4 py-3 text-xs font-semibold text-[#666666] hidden md:table-cell">核心指标</th>
                      <th className="px-4 py-3 text-xs font-semibold text-[#666666] hidden md:table-cell">护栏指标</th>
                      <th className="px-4 py-3 text-xs font-semibold text-[#666666]">状态</th>
                      <th className="px-4 py-3 text-xs font-semibold text-[#666666] w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F0F0]">
                    {actionItems.map((item) => (
                      <React.Fragment key={item.id}>
                      <tr className="hover:bg-[#F9F9F9] transition-colors">
                        <td className="px-4 py-3">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${item.priority === 'P0' ? 'bg-[#111111] text-white' : item.priority === 'P1' ? 'bg-[#666666] text-white' : 'bg-[#E5E5E5] text-[#666666]'}`}>
                            {item.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-[#111111]">{item.action}</td>
                        <td className="px-4 py-3 text-[#666666] hidden md:table-cell">{item.sourceExperiment}</td>
                        <td className="px-4 py-3">
                          {editingActionId === item.id ? (
                            <input
                              type="text" value={editOwner} onChange={(e) => setEditOwner(e.target.value)}
                              onBlur={() => {
                                setActionItems((prev) => prev.map((a) => a.id === item.id ? { ...a, owner: editOwner || a.owner } : a));
                                setEditingActionId(null);
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                              className="w-20 rounded border border-[#111111] px-2 py-1 text-xs outline-none"
                              autoFocus
                            />
                          ) : (
                            <button
                              onClick={() => { setEditingActionId(item.id); setEditOwner(item.owner); setEditPeriod(item.period); }}
                              className="text-[#666666] hover:text-[#111111] cursor-pointer transition-colors"
                            >
                              {item.owner}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#666666]">
                          {editingActionId === item.id ? (
                            <input
                              type="text" value={editPeriod} onChange={(e) => setEditPeriod(e.target.value)}
                              onBlur={() => {
                                setActionItems((prev) => prev.map((a) => a.id === item.id ? { ...a, period: editPeriod || a.period } : a));
                                setEditingActionId(null);
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                              className="w-16 rounded border border-[#111111] px-2 py-1 text-xs outline-none"
                            />
                          ) : (
                            <span>{item.period}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#666666] hidden md:table-cell">{item.coreMetric}</td>
                        <td className="px-4 py-3 text-[#666666] hidden md:table-cell">{item.guardrailMetric}</td>
                        <td className="px-4 py-3">
                          <select
                            value={item.status}
                            onChange={(e) => {
                              const newStatus = e.target.value as ActionItem['status'];
                              const now = new Date().toLocaleString('zh-CN');
                              const updates: Partial<ActionItem> = { status: newStatus };
                              if (newStatus === '进行中' && !item.startedAt) updates.startedAt = now;
                              if (newStatus === '已完成') { updates.completedAt = now; if (!item.startedAt) updates.startedAt = now; }
                              if (newStatus === '已暂停' && !item.pausedReason) {
                                const reason = window.prompt('请输入暂停原因：');
                                if (reason === null) return; // Cancelled
                                updates.pausedReason = reason;
                              }
                              if (newStatus !== '已暂停') updates.pausedReason = undefined;
                              setActionItems((prev) => prev.map((a) => a.id === item.id ? { ...a, ...updates } : a));
                            }}
                            className="rounded border border-[#E5E5E5] px-2 py-1 text-xs outline-none focus:border-[#111111] cursor-pointer"
                          >
                            {(['待启动', '进行中', '已完成', '已暂停', '已取消'] as const).map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {item.status === '已完成' && (
                              <button
                                onClick={() => setExpandedActionResult(expandedActionResult === item.id ? null : item.id)}
                                className="p-1 rounded hover:bg-[#E5E5E5] transition-colors"
                                title="记录执行结果"
                              >
                                <FileText size={14} className={item.executionResult ? 'text-emerald-600' : 'text-[#999999]'} />
                              </button>
                            )}
                            <button
                              onClick={() => setActionItems((prev) => prev.filter((a) => a.id !== item.id))}
                              className="p-1 rounded hover:bg-[#E5E5E5] transition-colors"
                            >
                              <X size={14} className="text-[#999999]" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* Execution result row */}
                      {item.status === '已完成' && expandedActionResult === item.id && (
                        <tr key={`${item.id}-result`}>
                          <td colSpan={9} className="px-4 py-3 bg-[#F9F9F9] border-t border-[#F0F0F0]">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className="block text-[11px] font-semibold text-[#666666] mb-1">实际核心指标</label>
                                <input type="text" value={item.executionResult?.actualCoreMetric || ''}
                                  onChange={(e) => updateExecutionResult(item.id, 'actualCoreMetric', e.target.value)}
                                  placeholder={`例如：${item.coreMetric} 提升至 X%`}
                                  className="w-full rounded-lg border border-[#E5E5E5] px-3 py-1.5 text-xs outline-none focus:border-[#111111]" />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-[#666666] mb-1">护栏指标变化</label>
                                <input type="text" value={item.executionResult?.guardrailChanges || ''}
                                  onChange={(e) => updateExecutionResult(item.id, 'guardrailChanges', e.target.value)}
                                  placeholder={`例如：${item.guardrailMetric}`}
                                  className="w-full rounded-lg border border-[#E5E5E5] px-3 py-1.5 text-xs outline-none focus:border-[#111111]" />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-[#666666] mb-1">是否达标</label>
                                <select value={item.executionResult?.metSuccessCriteria || '数据不足'}
                                  onChange={(e) => updateExecutionResult(item.id, 'metSuccessCriteria', e.target.value)}
                                  className="w-full rounded-lg border border-[#E5E5E5] px-3 py-1.5 text-xs outline-none focus:border-[#111111] cursor-pointer">
                                  {(['达标', '部分达标', '未达标', '数据不足'] as const).map((s) => (<option key={s} value={s}>{s}</option>))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-[#666666] mb-1">执行备注</label>
                                <input type="text" value={item.executionResult?.notes || ''}
                                  onChange={(e) => updateExecutionResult(item.id, 'notes', e.target.value)}
                                  placeholder="执行过程中的观察和备注"
                                  className="w-full rounded-lg border border-[#E5E5E5] px-3 py-1.5 text-xs outline-none focus:border-[#111111]" />
                              </div>
                            </div>
                            <button onClick={() => setExpandedActionResult(null)} className="mt-2 text-[11px] text-[#666666] hover:text-[#111111]">收起执行结果</button>
                          </td>
                        </tr>
                      )}
                      {/* Paused reason */}
                      {item.status === '已暂停' && item.pausedReason && (
                        <tr key={`${item.id}-pause`}>
                          <td colSpan={9} className="px-4 py-2 bg-amber-50 border-t border-amber-100">
                            <span className="text-[11px] text-amber-700">暂停原因：{item.pausedReason}</span>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Add custom item */}
            <div className="rounded-2xl bg-white p-6 border border-[#E5E5E5]">
              <div className="flex items-center gap-2">
                <input
                  type="text" value={newActionText}
                  onChange={(e) => setNewActionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newActionText.trim()) {
                      setActionItems((prev) => [...prev, {
                        id: `act-${Math.random().toString(36).slice(2, 8)}`,
                        priority: 'P2',
                        action: newActionText.trim(),
                        sourceExperiment: experimentPlan.sourceOpportunity,
                        owner: '待分配',
                        period: '—',
                        coreMetric: '—',
                        guardrailMetric: '—',
                        status: '待启动',
                      }]);
                      setNewActionText('');
                    }
                  }}
                  placeholder="+ 添加自定义行动项"
                  className="flex-1 rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#111111] outline-none focus:border-[#111111] placeholder:text-[#999999]"
                />
                <button
                  onClick={() => {
                    if (newActionText.trim()) {
                      setActionItems((prev) => [...prev, {
                        id: `act-${Math.random().toString(36).slice(2, 8)}`,
                        priority: 'P2',
                        action: newActionText.trim(),
                        sourceExperiment: experimentPlan.sourceOpportunity,
                        owner: '待分配',
                        period: '—',
                        coreMetric: '—',
                        guardrailMetric: '—',
                        status: '待启动',
                      }]);
                      setNewActionText('');
                    }
                  }}
                  disabled={!newActionText.trim()}
                  className="rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#666666] hover:border-[#111111] disabled:opacity-40 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Bottom actions */}
            <div className="rounded-2xl bg-white p-6 border border-[#E5E5E5] flex gap-3 flex-wrap">
              <button onClick={goBack} className="rounded-xl border border-[#E5E5E5] px-5 py-3 text-sm font-semibold text-[#666666] hover:bg-[#F5F5F5] transition-colors">返回修改决策</button>
              <button onClick={onHome} className="rounded-xl border border-[#E5E5E5] px-5 py-3 text-sm font-semibold text-[#666666] hover:bg-[#F5F5F5] transition-colors ml-auto">返回员工中心</button>
            </div>
          </section>
        )}
      </div>

      {/* ════════════ Version banner (only on result pages) ════════════ */}
      {showVersionBanner && currentVersionNumber > 0 && step >= 6 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 rounded-2xl border-2 border-[#111111] bg-white px-5 py-3 shadow-lg flex items-center gap-3">
          <span className="text-sm font-bold text-[#111111]">已生成 V{currentVersionNumber}</span>
          <button onClick={() => setShowVersionDrawer(true)} className="text-xs text-[#666666] hover:text-[#111111] underline">查看上一版本</button>
          <button onClick={() => { setCompareVersionId(versions[versions.length - 2]?.versionId || null); if (versions.length >= 2) { const r = compareVersions(versions[versions.length - 2], versions[versions.length - 1]); setCompareResult(r); } }} className="text-xs text-[#666666] hover:text-[#111111] underline">对比变化</button>
          <button onClick={() => setShowVersionBanner(false)} className="p-1"><X size={14} className="text-[#999999]" /></button>
        </div>
      )}

      {/* ════════════ Supplement complete banner (Step 6) ════════════ */}
      {workflowNeedsRecompute && step === 6 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-5 py-3 shadow-lg flex items-center gap-3">
          <Check size={16} className="text-emerald-600" />
          <span className="text-sm font-bold text-emerald-800">补充依据后已重新生成</span>
          <button onClick={() => setWorkflowNeedsRecompute(false)} className="p-1"><X size={14} className="text-emerald-500" /></button>
        </div>
      )}

      {/* ════════════ Version history drawer ════════════ */}
      {showVersionDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => { setShowVersionDrawer(false); setCompareVersionId(null); setCompareResult(null); }} />
          <div className="relative w-full max-w-lg bg-white h-full overflow-y-auto border-l border-[#E5E5E5] shadow-lg">
            <div className="sticky top-0 bg-white border-b border-[#E5E5E5] px-5 py-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-[#111111]">历史版本</h2>
              <div className="flex items-center gap-2">
                {versions.length > 0 && (
                  showDeleteAllConfirm ? (
                    <>
                      <span className="text-xs text-red-500 font-medium">确认清空全部？</span>
                      <button
                        onClick={() => {
                          localStorage.removeItem('ai-growth-manager-versions');
                          setVersions([]);
                          setShowDeleteAllConfirm(false);
                          setCompareVersionId(null);
                          setCompareResult(null);
                        }}
                        className="rounded-lg border border-red-300 bg-red-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-600 transition-colors"
                      >
                        确认
                      </button>
                      <button
                        onClick={() => setShowDeleteAllConfirm(false)}
                        className="rounded-lg border border-[#E5E5E5] px-2.5 py-1 text-[11px] font-medium text-[#666666] hover:border-[#111111] transition-colors"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setShowDeleteAllConfirm(true)}
                      className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-400 hover:border-red-300 hover:text-red-500 transition-colors"
                    >
                      全部删除
                    </button>
                  )
                )}
                <button onClick={() => { setShowVersionDrawer(false); setCompareVersionId(null); setCompareResult(null); setShowDeleteAllConfirm(false); }} className="p-1 rounded hover:bg-[#F5F5F5]"><X size={18} className="text-[#999999]" /></button>
              </div>
            </div>
            <div className="p-5 space-y-3">
              {versions.length === 0 ? (
                <p className="text-sm text-[#999999]">暂无历史版本。</p>
              ) : (
                [...versions].reverse().map((v) => (
                  <div key={v.versionId} className={`rounded-xl border p-4 ${compareVersionId === v.versionId ? 'border-[#111111] bg-[#F9F9F9]' : 'border-[#E5E5E5]'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-[#111111]">V{v.versionNumber}</span>
                      <span className="text-[11px] text-[#999999]">{v.createdAt}</span>
                    </div>
                    <div className="text-xs text-[#666666] space-y-0.5 mb-3">
                      <p>场景：{v.scene} · 目标：{v.goal} · 用户：{v.targetUsers}</p>
                      <p>数据：{v.dataSummary}</p>
                      {v.changes.length > 0 && <p className="text-[#999999]">修改：{v.changes.join('、')}</p>}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        onClick={() => {
                          setCompareVersionId(compareVersionId === v.versionId ? null : v.versionId);
                          if (compareVersionId && compareVersionId !== v.versionId) {
                            const v1 = versions.find((x) => x.versionId === compareVersionId);
                            const v2 = v;
                            if (v1 && v2) setCompareResult(compareVersions(v1, v2));
                          }
                        }}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${compareVersionId === v.versionId ? 'border-[#111111] bg-[#111111] text-white' : 'border-[#E5E5E5] text-[#666666] hover:border-[#111111]'}`}
                      >
                        {compareVersionId === v.versionId ? '已选中' : '对比'}
                      </button>
                      <button
                        onClick={() => {
                          if (!window.confirm(`恢复 V${v.versionNumber}？当前进度将自动保存为一个新版本。`)) return;
                          // Auto-save current progress before restoring
                          if (diagnosisComplete || experimentPlan || aiDecision || actionItems.length > 0) {
                            const autoSaveV: GrowthVersion = {
                              versionId: `v-${Date.now()}`,
                              versionNumber: getNextVersionNumber(),
                              createdAt: new Date().toLocaleString('zh-CN'),
                              scene: scene === '自定义场景' ? customSceneName || '自定义场景' : scene,
                              goal,
                              targetUsers: targetUsers || '未指定',
                              currentRate,
                              targetRate,
                              dataSummary: useMockData ? `模拟数据（${mockConfig?.period || '?'}天）` : (opsFile || funnelFile ? '上传数据' : '仅业务信息'),
                              changes: [`恢复 V${v.versionNumber} 前的自动保存`],
                              funnelMetrics: [...funnelMetrics],
                              feedbackKeywords: { ...feedbackKeywords },
                              opportunities: computePriorities().map((o) => ({
                                name: o.name,
                                bottleneck: '',
                                currentData: '—',
                                priorityLabel: o.priorityLabel,
                                priorityScore: o.score,
                              })),
                              experimentPlan: experimentPlan ? { ...experimentPlan } : null,
                              aiDecision: aiDecision ? { ...aiDecision } : null,
                              actionItems: actionItems.map((a) => ({ ...a })),
                            };
                            saveVersion(autoSaveV);
                          }
                          // Restore
                          setFunnelMetrics(v.funnelMetrics);
                          setFeedbackKeywords(v.feedbackKeywords);
                          if (v.experimentPlan) setExperimentPlan(v.experimentPlan);
                          if (v.aiDecision) setAiDecision(v.aiDecision);
                          if (v.actionItems) setActionItems(v.actionItems);
                          setDiagnosisComplete(true);
                          hasEverCompletedDiagnosis.current = true;
                          setStep(3);
                          setShowVersionBanner(false);
                          setVersions(getVersions());
                        }}
                        className="rounded-lg border border-[#E5E5E5] px-2.5 py-1 text-[11px] font-medium text-[#666666] hover:border-[#111111] transition-colors"
                      >
                        恢复
                      </button>
                      <button
                        onClick={() => {
                          if (!window.confirm('确认删除此版本？')) return;
                          deleteVersion(v.versionId);
                          setVersions(getVersions());
                        }}
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-500 hover:bg-red-50 transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))
              )}
              {/* Comparison result */}
              {compareResult && compareVersionId && (
                <div className="rounded-xl border-2 border-[#111111] bg-[#F9F9F9] p-4 mt-4">
                  <h3 className="text-sm font-bold text-[#111111] mb-3">版本对比</h3>
                  {compareResult.inputChanges.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[11px] font-semibold text-[#999999] mb-1">输入变化</p>
                      {compareResult.inputChanges.map((c, i) => <p key={i} className="text-xs text-[#666666]">{c}</p>)}
                    </div>
                  )}
                  {compareResult.funnelChanges.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[11px] font-semibold text-[#999999] mb-1">漏斗变化</p>
                      {compareResult.funnelChanges.map((c, i) => (
                        <p key={i} className="text-xs text-[#666666]">{c.stage}：{c.old} → {c.new}</p>
                      ))}
                    </div>
                  )}
                  {compareResult.priorityChanges.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[11px] font-semibold text-[#999999] mb-1">优先级变化</p>
                      {compareResult.priorityChanges.map((c, i) => (
                        <p key={i} className="text-xs text-[#666666]">{c.name}：{c.oldPriority} → {c.newPriority}</p>
                      ))}
                    </div>
                  )}
                  <div className="mb-2">
                    <p className="text-[11px] font-semibold text-[#999999] mb-1">决策信心变化</p>
                    <p className="text-xs text-[#666666]">{compareResult.confidenceChanges.old} → {compareResult.confidenceChanges.new}</p>
                  </div>
                  {compareResult.actionChanges.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[11px] font-semibold text-[#999999] mb-1">推荐动作变化</p>
                      {compareResult.actionChanges.map((c, i) => (
                        <p key={i} className="text-xs text-[#666666]">{c.old} → {c.new}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
