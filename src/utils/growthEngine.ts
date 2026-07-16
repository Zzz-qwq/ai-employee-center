// ═══════════════════════════════════════════════════════
// Growth Engine — 动态生成实验方案、AI决策、行动计划
// 所有输出基于上下文动态变化，禁止固定模板
// ═══════════════════════════════════════════════════════

import { FunnelStageMetrics } from './mockDataGenerator';

// ── Types ──

export interface ExperimentPlan {
  name: string;
  hypothesis: string;
  targetUsers: string;
  experimentGroup: string;
  controlGroup: string;
  coreMetrics: string[];
  guardrailMetrics: string[];
  period: number;
  sampleScope: string;
  successCriteria: string;
  risks: RiskItem[];
  dependencies: string[];
  sourceOpportunity: string;
  sourceBottleneck: string;
  scene: string;
  goal: string;
}

export interface RiskItem {
  description: string;
  severity: '高' | '中' | '低';
}

export interface AIDecision {
  coreJudgment: string;
  confidence: { level: '高' | '中' | '低'; stars: number; reason: string };
  topAction: { priority: string; name: string; why: string; impact: string; cost: string; period: string };
  notRecommended: { action: string; reason: string }[];
  executionSteps: { step: number; description: string }[];
  borderlineResults: { stage: string; result: '确认异常' | '正常波动' | '继续观察'; reason: string }[];
  basis: {
    data: string;
    rules: string;
    feedback: string;
    resources: string;
    missing: string[];
    confidence: string;
  };
}

export interface ActionItem {
  id: string;
  priority: string;
  action: string;
  sourceExperiment: string;
  owner: string;
  period: string;
  coreMetric: string;
  guardrailMetric: string;
  status: '待启动' | '进行中' | '已完成' | '已取消' | '已暂停';
  startedAt?: string;
  completedAt?: string;
  pausedReason?: string;
  executionResult?: {
    actualCoreMetric: string;
    guardrailChanges: string;
    metSuccessCriteria: '达标' | '部分达标' | '未达标' | '数据不足';
    notes: string;
  };
}

export interface ExperimentContext {
  selectedOpportunity: { name: string; bottleneck: string; currentData: string };
  scene: string;
  goal: string;
  currentRate: string;
  targetRate: string;
  resources: string[];
  resourceConstraints: string;
  feedbackKeywords: Record<string, { count: number; ratio: number }>;
  funnelMetrics: FunnelStageMetrics[];
  hasData: boolean;
  dataLabel: string;
  knownIssue: string;
}

// ── Helpers ──

function avgConfidence(metrics: FunnelStageMetrics[]): number {
  if (metrics.length === 0) return 50;
  return Math.round(metrics.reduce((s, m) => s + m.confidence, 0) / metrics.length);
}

function worstStage(metrics: FunnelStageMetrics[]): FunnelStageMetrics | null {
  if (metrics.length === 0) return null;
  const rank: Record<string, number> = { '严重流失': 4, '中度流失': 3, '轻度流失': 2, '临界/需进一步验证': 1, '正常': 0 };
  return [...metrics].sort((a, b) => (rank[b.status] || 0) - (rank[a.status] || 0))[0];
}

function hasBorderline(metrics: FunnelStageMetrics[]): FunnelStageMetrics[] {
  return metrics.filter((m) => m.status === '临界/需进一步验证');
}

// ═══════════════════════════════════════════════════════
// Experiment Plan Generator
// ═══════════════════════════════════════════════════════

export function generateExperimentPlan(ctx: ExperimentContext): ExperimentPlan {
  const { selectedOpportunity, scene, goal, currentRate, targetRate, resources, resourceConstraints, funnelMetrics } = ctx;
  const worst = worstStage(funnelMetrics);
  const bottleneck = worst?.stage || selectedOpportunity.bottleneck;
  const oppName = selectedOpportunity.name;

  // ── Determine experiment type from opportunity name ──
  const isCoupon = oppName.includes('优惠券') || oppName.includes('优惠');
  const isRule = oppName.includes('规则') || oppName.includes('表达');
  const isLogistics = oppName.includes('物流') || oppName.includes('承诺') || oppName.includes('支付');
  const isPayment = oppName.includes('支付完成') || oppName.includes('支付方式');
  const isRecall = oppName.includes('召回');
  const isConversion = oppName.includes('转化') || !isCoupon && !isRule && !isLogistics && !isPayment && !isRecall;

  // ── 1. Experiment name ──
  let name = oppName + '实验';
  if (scene !== '自定义场景') name = `「${scene}」${name}`;

  // ── 2. Hypothesis ──
  let hypothesis = '';
  if (isCoupon) {
    hypothesis = `如果在${bottleneck.includes('加购') ? '购物车和结算页' : bottleneck.includes('支付') ? '支付确认页' : '关键转化页面'}明确展示优惠券的可用范围、使用门槛、有效期和预计优惠金额，用户对最终价格的不确定感将降低，${bottleneck.includes('加购') ? '下单转化率' : '支付完成率'}将得到提升。`;
  } else if (isRule) {
    hypothesis = `如果精简活动规则表达，突出核心利益点并降低理解成本，用户在详情页到加购的决策效率将提升，加购率可预期提高。`;
  } else if (isLogistics) {
    hypothesis = `如果在支付前明确展示物流时效承诺和售后保障，用户在支付环节的犹豫将减少，支付完成率将得到提升。`;
  } else if (isPayment) {
    hypothesis = `如果增加用户偏好的支付方式并对未支付订单进行智能召回，支付完成率将显著提升。`;
  } else if (isRecall) {
    hypothesis = `如果针对${bottleneck.includes('曝光') ? '不同渠道特性' : '流失用户'}进行定向召回和个性化触达，${bottleneck.includes('曝光') ? '点击率' : '回流转化率'}将得到提升。`;
  } else {
    hypothesis = `如果针对「${bottleneck}」环节进行${oppName.includes('优化') ? '体验优化' : '策略调整'}，该环节转化率将得到提升，从而带动整体${goal}指标改善。`;
  }

  // ── 3. Target users ──
  let targetUsers = '';
  const sceneLabel = scene === '电商活动' ? '活动' : scene === '新品上线' ? '新品' : scene === '会员运营' ? '会员' : scene === '渠道投放' ? '渠道' : scene === '内容增长' ? '内容' : scene === '用户召回' ? '待召回' : '目标';
  if (isCoupon) {
    targetUsers = `已领取优惠券、进入${bottleneck.includes('加购') ? '购物车但未提交订单' : bottleneck.includes('支付') ? '支付页面但未完成支付' : '转化路径但未完成'}的${sceneLabel}访问用户。`;
  } else if (isRule) {
    targetUsers = `访问活动详情页、停留超过5秒但未加购的${sceneLabel}用户。`;
  } else if (isLogistics) {
    targetUsers = `已提交订单但在支付页面停留超过30秒或离开支付页的${sceneLabel}用户。`;
  } else if (isPayment) {
    targetUsers = `已提交订单但未在30分钟内完成支付，以及支付失败后未重试的${sceneLabel}用户。`;
  } else {
    targetUsers = `处于「${bottleneck}」环节、未完成下一步转化的${sceneLabel}用户。`;
  }

  // ── 4. Experiment group ──
  let experimentGroup = '';
  if (isCoupon) {
    experimentGroup = `在购物车、结算页和支付确认页展示优惠券状态标签（可用/即将过期/已使用）、使用门槛进度条（如"再购¥30可用"）、预计优惠金额及不可用原因说明。`;
  } else if (isRule) {
    experimentGroup = `展示精简后的活动规则卡片：3条核心利益点 + 1个折叠「详细规则」入口，去掉冗余条款和重复说明。`;
  } else if (isLogistics) {
    experimentGroup = `在支付按钮上方展示物流承诺模块：「预计X月X日前送达」「7天无理由退换」「运费险已覆盖」，并附简短信任标签。`;
  } else if (isPayment) {
    experimentGroup = `支付页新增用户偏好支付方式（基于历史）置顶，同时未支付订单在15分钟后触发Push/短信召回提醒。`;
  } else if (isRecall) {
    experimentGroup = `根据用户上次活跃行为和偏好，推送个性化召回内容（专属优惠/新品推荐/活动提醒），并附一键回流入口。`;
  } else {
    experimentGroup = `针对「${bottleneck}」环节实施${oppName}对应的优化策略，具体包括页面体验、信息展示和交互流程的调整。`;
  }

  // ── 5. Control group ──
  let controlGroup = '';
  if (isCoupon) {
    controlGroup = '保持当前优惠券展示方式不变（仅结算页显示可用优惠券列表，无状态标签和门槛进度）。';
  } else if (isRule) {
    controlGroup = '保持当前活动规则完整展示方式不变。';
  } else if (isLogistics) {
    controlGroup = '保持当前支付页布局不变，物流信息在订单详情页展示。';
  } else if (isPayment) {
    controlGroup = '保持当前支付方式和流程不变，无主动召回。';
  } else {
    controlGroup = '保持当前页面和流程不变。';
  }

  // ── 6. Core metrics (dynamic based on experiment type + bottleneck) ──
  let coreMetrics: string[] = [];
  if (isCoupon) {
    coreMetrics = ['下单转化率', '优惠券使用率'];
    if (bottleneck.includes('支付')) coreMetrics = ['支付完成率', '优惠券核销率'];
  } else if (isRule) {
    coreMetrics = ['加购率', '详情页停留时长', '下单转化率'];
  } else if (isLogistics) {
    coreMetrics = ['支付完成率', '支付页停留时长', '下单到支付时长'];
  } else if (isPayment) {
    coreMetrics = ['支付完成率', '未支付召回转化率', '支付失败重试率'];
  } else if (isRecall) {
    coreMetrics = ['召回转化率', '回流用户7日留存率'];
  } else {
    coreMetrics = ['转化率（' + bottleneck + '）', '整体' + goal + '达成率'];
  }

  // ── 7. Guardrail metrics ──
  let guardrailMetrics: string[] = [];
  if (isCoupon) {
    guardrailMetrics = ['退款率不得明显上升', '客单价不得下降超过5%', '用户投诉率不得上升'];
  } else if (isRule) {
    guardrailMetrics = ['退款率不得明显上升', '用户投诉率不得上升', '页面加载时间不得明显增加'];
  } else if (isLogistics) {
    guardrailMetrics = ['退款率不得明显上升', '物流相关投诉率不得上升', '客单价不得明显下降'];
  } else if (isPayment) {
    guardrailMetrics = ['退款率不得明显上升', '支付欺诈率不得上升', '用户投诉率不得上升'];
  } else {
    guardrailMetrics = ['退款率不得明显上升', '客单价不得下降超过5%', '用户投诉率不得上升'];
  }

  // ── 8. Period ──
  const period = 7;

  // ── 9. Sample scope ──
  const hasTraffic = resources.includes('社媒投放') || resources.includes('Push 推送');
  const samplePct = hasTraffic ? '30%' : '20%';
  const sampleScope = `活动页访问用户的${samplePct}，随机均分为实验组和对照组。`;

  // ── 10. Success criteria ──
  let successCriteria = '';
  const currentNum = parseFloat(currentRate) || 3.8;
  const targetNum = parseFloat(targetRate) || 4.5;
  const improvementNeeded = Math.round(((targetNum - currentNum) / currentNum) * 100);
  if (isCoupon) {
    successCriteria = `实验组下单转化率较对照组提升不少于${Math.max(improvementNeeded, 6)}%，且退款率没有明显上升，客单价下降不超过3%。`;
  } else if (isRule) {
    successCriteria = `实验组加购率较对照组提升不少于${Math.max(improvementNeeded, 5)}%，且页面停留时长没有明显缩短，说明用户不是在困惑中离开。`;
  } else if (isLogistics) {
    successCriteria = `实验组支付完成率较对照组提升不少于${Math.max(improvementNeeded, 5)}%，支付页停留时长显著缩短。`;
  } else if (isPayment) {
    successCriteria = `实验组支付完成率较对照组提升不少于${Math.max(improvementNeeded, 8)}%，未支付召回转化率达到15%以上。`;
  } else {
    successCriteria = `实验组核心指标较对照组提升不少于${Math.max(improvementNeeded, 5)}%，且护栏指标均未出现显著恶化。`;
  }

  // ── 11. Risks ──
  let risks: RiskItem[] = [];
  if (isCoupon) {
    risks = [
      { description: '用户只关注优惠金额，可能压低客单价', severity: '中' },
      { description: '优惠说明过多增加页面信息密度，可能影响加载速度和视觉体验', severity: '低' },
      { description: '短期活动效应可能无法长期维持，活动结束后转化可能回落', severity: '中' },
      { description: '如果优惠券实际可用率低，展示反而可能引发用户不满', severity: '高' },
    ];
  } else if (isRule) {
    risks = [
      { description: '过度简化规则可能导致用户对权益理解不完整，产生售后纠纷', severity: '高' },
      { description: '规则变更可能涉及法务合规风险', severity: '中' },
      { description: '折叠详细规则后部分用户可能忽略重要限制', severity: '中' },
    ];
  } else if (isLogistics) {
    risks = [
      { description: '物流承诺无法兑现时可能引发集中投诉和退款潮', severity: '高' },
      { description: '特殊时期（大促、恶劣天气）物流时效不可控', severity: '中' },
      { description: '承诺模块可能增加支付页信息负担', severity: '低' },
    ];
  } else if (isPayment) {
    risks = [
      { description: '新增支付方式可能增加接入成本和维护复杂度', severity: '中' },
      { description: '召回推送过于频繁可能导致用户反感或卸载', severity: '中' },
      { description: '支付流程变更可能引入新的技术风险', severity: '高' },
    ];
  } else {
    risks = [
      { description: '实验效果可能受外部因素（竞品活动、季节性）干扰', severity: '中' },
      { description: '样本量不足可能导致统计显著性不达标', severity: '中' },
      { description: '实验期间的其他产品改动可能交叉影响结果', severity: '低' },
    ];
  }

  // ── 12. Dependencies (from available resources, filtered) ──
  const dependencies: string[] = [];
  const resMap: Record<string, string> = {
    '优惠券': '优惠券系统和发放能力',
    '活动页': '活动落地页的可配置性',
    '站内消息': '站内消息推送系统',
    '用户分群': '用户分群和标签能力',
    'Push 推送': 'App Push 推送通道',
    '短信': '短信触达通道',
    '社媒投放': '社交媒体投放预算和素材',
  };
  for (const r of resources) {
    if (resMap[r]) dependencies.push(resMap[r]);
  }
  if (dependencies.length === 0) {
    dependencies.push('页面内容可修改权限');
    dependencies.push('基础数据埋点和分析能力');
  }
  // Don't recommend resources user doesn't have
  if (isCoupon && !resources.includes('优惠券')) {
    dependencies.push('提示优化不需要新增优惠券补贴，仅利用现有优惠券展示逻辑调整');
  }

  return {
    name,
    hypothesis,
    targetUsers,
    experimentGroup,
    controlGroup,
    coreMetrics,
    guardrailMetrics,
    period,
    sampleScope,
    successCriteria,
    risks,
    dependencies,
    sourceOpportunity: oppName,
    sourceBottleneck: bottleneck,
    scene,
    goal,
  };
}

// ═══════════════════════════════════════════════════════
// AI Decision Generator
// ═══════════════════════════════════════════════════════

export function generateAIDecision(
  experiment: ExperimentPlan,
  ctx: ExperimentContext,
  verificationResults?: Record<number, { conclusion: string }>,
): AIDecision {
  const { funnelMetrics, feedbackKeywords, hasData, dataLabel, resources, resourceConstraints } = ctx;
  const worst = worstStage(funnelMetrics);
  const borderlineItems = hasBorderline(funnelMetrics);
  const avgConf = avgConfidence(funnelMetrics);
  const fbKeys = Object.keys(feedbackKeywords);

  // ── 1. Core judgment ──
  let coreJudgment = '';
  const bottleneck = worst?.stage || experiment.sourceBottleneck;
  const statusLabel = worst?.status || '未知';

  if (bottleneck.includes('加购→提交订单')) {
    coreJudgment = `当前主要瓶颈位于「${bottleneck}」环节（${statusLabel}），优惠理解和最终价格不确定性可能是主要阻力，因此建议优先验证${experiment.name.includes('优惠券') ? '优惠券提示优化实验' : experiment.name}。`;
  } else if (bottleneck.includes('提交订单→支付')) {
    coreJudgment = `当前主要瓶颈位于「${bottleneck}」环节（${statusLabel}），用户在支付前存在明显犹豫，物流不确定性和支付便捷度可能是关键因素，建议优先执行${experiment.name}。`;
  } else if (bottleneck.includes('详情页→加购')) {
    coreJudgment = `当前主要瓶颈位于「${bottleneck}」环节（${statusLabel}），用户对商品信息的评估效率偏低，规则和卖点表达可能是优化杠杆，建议优先验证${experiment.name}。`;
  } else if (bottleneck.includes('曝光→点击')) {
    coreJudgment = `当前主要瓶颈位于「${bottleneck}」环节（${statusLabel}），流量到点击的转化效率偏低，渠道质量和入口素材可能是根本原因，建议优先执行${experiment.name}。`;
  } else {
    coreJudgment = `当前主要瓶颈位于「${bottleneck}」环节（${statusLabel}），建议优先执行${experiment.name}，以验证该环节的优化杠杆效应。`;
  }

  // ── 2. Confidence ──
  let stars = 3;
  let level: '高' | '中' | '低' = '中';
  let confidenceReason = '';

  const dataCompleteness = hasData ? (fbKeys.length > 0 ? 'high' : 'medium') : 'low';
  const hasClearBottleneck = worst && worst.status !== '正常' && worst.status !== '临界/需进一步验证';
  const hasFeedback = fbKeys.length > 0;
  const hasResources = resources.length >= 3;
  const hasBaseline = hasData; // proxy
  const borderlineCount = borderlineItems.length;

  if (dataCompleteness === 'high' && hasClearBottleneck && hasFeedback && hasResources) {
    stars = 5; level = '高';
    confidenceReason = '数据字段完整，瓶颈明确，用户反馈与数据方向一致，用户具备对应执行资源。';
  } else if (dataCompleteness === 'high' && hasClearBottleneck && hasResources) {
    stars = 4; level = '高';
    confidenceReason = '数据基本完整，瓶颈明确，资源匹配程度高。';
  } else if (dataCompleteness === 'medium' && hasClearBottleneck) {
    stars = 3; level = '中';
    confidenceReason = `数据基本完整（${dataLabel}），存在明确瓶颈，${hasFeedback ? '用户反馈支持判断方向' : '但用户反馈数据有限'}。`;
  } else if (dataCompleteness === 'medium' && borderlineCount > 0) {
    stars = 2; level = '中';
    confidenceReason = `存在${borderlineCount}个临界指标，数据方向不够明确，${hasFeedback ? '反馈与诊断部分一致' : '缺少关联反馈'}。`;
  } else {
    stars = 2; level = '低';
    confidenceReason = `数据不足（${dataLabel}）${borderlineCount > 0 ? `，${borderlineCount}个指标存在争议` : ''}，缺少历史基线和关联反馈，建议补充数据后重新评估。`;
  }

  // ── 3. Top action ──
  const topAction = {
    priority: 'P0',
    name: experiment.name,
    why: `预期影响${stars >= 4 ? '高' : '中'}、实施成本${experiment.dependencies.length <= 3 ? '低' : '中'}、与当前瓶颈「${bottleneck}」直接相关。`,
    impact: stars >= 4 ? '高' : '中',
    cost: experiment.dependencies.length <= 3 ? '低' : '中',
    period: `${experiment.period}天`,
  };

  // ── 4. Not recommended ──
  const notRecommended: { action: string; reason: string }[] = [];

  if (bottleneck.includes('加购→提交订单') || bottleneck.includes('提交订单→支付')) {
    notRecommended.push({
      action: '暂不建议继续增加流量投放',
      reason: '当前曝光和点击并不是主要瓶颈，继续增加流量可能只会扩大后续转化损失。',
    });
  }
  if (bottleneck.includes('详情页→加购')) {
    notRecommended.push({
      action: '暂不建议在商品详情页之前做大规模改动',
      reason: '当前瓶颈在评估阶段而非流量获取阶段，优化上游无法解决加购转化问题。',
    });
  }
  if (!resources.includes('优惠券') && experiment.name.includes('优惠券')) {
    notRecommended.push({
      action: '暂不建议新增优惠券补贴预算',
      reason: '当前实验聚焦提示优化而非增加补贴，可以在不增加优惠券成本的前提下验证效果。',
    });
  }
  if (resourceConstraints) {
    notRecommended.push({
      action: '注意资源约束',
      reason: `用户已标注资源限制：「${resourceConstraints.slice(0, 60)}${resourceConstraints.length > 60 ? '...' : ''}」，实验设计应在该约束内进行。`,
    });
  }
  // Add one more generic if we only have 1-2
  if (notRecommended.length < 2) {
    notRecommended.push({
      action: '不建议在实验期间同时进行其他产品改动',
      reason: '交叉改动会影响实验结果的归因准确性，建议保持其他变量不变。',
    });
  }

  // ── 5. Execution steps ──
  const executionSteps = [
    { step: 1, description: `完成${experiment.name}的详细方案设计与开发` },
    { step: 2, description: `上线${experiment.sampleScope.includes('20%') ? '20%' : '30%'}流量实验，设置对照组和实验组` },
    { step: 3, description: `观察${experiment.period}天核心指标（${experiment.coreMetrics.slice(0, 2).join('、')}）与护栏指标变化` },
    { step: 4, description: '根据实验结果决定全量上线、继续迭代或放弃该方向' },
  ];

  // ── 6. Borderline results ──
  const borderlineResults: AIDecision['borderlineResults'] = [];
  for (const b of borderlineItems) {
    const vr = verificationResults ? Object.values(verificationResults).find(() => true) : null;
    if (b.stage.includes('曝光→点击')) {
      borderlineResults.push({
        stage: b.stage,
        result: '继续观察',
        reason: '当前点击率接近阈值，但缺少历史基线和渠道拆分数据，暂不建议直接调整整体流量策略。建议补充渠道级数据后再判断。',
      });
    } else if (b.stage.includes('点击→详情页')) {
      borderlineResults.push({
        stage: b.stage,
        result: '正常波动',
        reason: '点击到详情页转化率在正常波动范围内，各渠道数据未见异常分化，暂无证据支持存在系统性问题。',
      });
    } else {
      borderlineResults.push({
        stage: b.stage,
        result: '继续观察',
        reason: `「${b.stage}」转化率 ${b.conversionRate}% 处于临界区间，当前证据不足以确认异常。建议补充下一周期数据后重新判断。`,
      });
    }
  }

  // ── 7. Basis ──
  const dataBasis = funnelMetrics.map((m) => `${m.stage}: ${m.conversionRate}%（${m.fromCount.toLocaleString()}→${m.toCount.toLocaleString()}，${m.status}）`).join('；');
  const ruleBasis = '各环节使用预设阈值进行判定，当前阈值为演示规则。';
  const feedbackBasis = fbKeys.length > 0
    ? `${fbKeys.length} 类关键词关联：${fbKeys.slice(0, 5).join('、')}`
    : '无用户反馈数据';
  const resourceBasis = resources.length > 0
    ? `可用资源：${resources.join('、')}${resourceConstraints ? '。约束：' + resourceConstraints : ''}`
    : '未指定可投入资源';
  const missing: string[] = [];
  if (!hasData) missing.push('运营数据');
  if (!hasData) missing.push('漏斗数据');
  if (!fbKeys.length) missing.push('用户反馈数据');
  if (!hasData) missing.push('历史基线数据');

  const confidenceNote = avgConf >= 80
    ? `基于${dataLabel}与预设规则综合判断，各环节诊断置信度平均 ${avgConf}%，方向明确。`
    : avgConf >= 65
    ? `基于${dataLabel}与预设规则综合判断，诊断置信度平均 ${avgConf}%，存在一定不确定性。`
    : `基于${dataLabel}与预设规则综合判断，诊断置信度偏低（${avgConf}%），建议补充数据提升判断可靠性。`;

  return {
    coreJudgment,
    confidence: { level, stars, reason: confidenceReason },
    topAction,
    notRecommended,
    executionSteps,
    borderlineResults,
    basis: {
      data: dataBasis,
      rules: ruleBasis,
      feedback: feedbackBasis,
      resources: resourceBasis,
      missing,
      confidence: confidenceNote,
    },
  };
}

// ═══════════════════════════════════════════════════════
// Action Items Generator
// ═══════════════════════════════════════════════════════

export function generateActionItems(experiment: ExperimentPlan, decision: AIDecision): ActionItem[] {
  const id = () => `act-${Math.random().toString(36).slice(2, 8)}`;

  const items: ActionItem[] = [
    {
      id: id(),
      priority: 'P0',
      action: experiment.name,
      sourceExperiment: experiment.sourceOpportunity,
      owner: '产品运营',
      period: `${experiment.period}天`,
      coreMetric: experiment.coreMetrics[0] || '转化率',
      guardrailMetric: experiment.guardrailMetrics.slice(0, 2).join('、'),
      status: '待启动',
    },
  ];

  // Add supporting items based on experiment type
  if (experiment.name.includes('优惠券')) {
    items.push(
      {
        id: id(),
        priority: 'P1',
        action: '梳理当前优惠券状态与可用性数据',
        sourceExperiment: experiment.sourceOpportunity,
        owner: '数据运营',
        period: '2天',
        coreMetric: '优惠券可用率',
        guardrailMetric: '—',
        status: '待启动',
      },
      {
        id: id(),
        priority: 'P1',
        action: '设计优惠券状态标签UI方案',
        sourceExperiment: experiment.sourceOpportunity,
        owner: '产品设计',
        period: '3天',
        coreMetric: '设计方案完成度',
        guardrailMetric: '—',
        status: '待启动',
      },
    );
  }

  if (experiment.name.includes('规则')) {
    items.push(
      {
        id: id(),
        priority: 'P1',
        action: '梳理当前活动规则文本并标注冗余内容',
        sourceExperiment: experiment.sourceOpportunity,
        owner: '内容运营',
        period: '2天',
        coreMetric: '规则精简率',
        guardrailMetric: '法务合规审查',
        status: '待启动',
      },
    );
  }

  if (experiment.name.includes('物流')) {
    items.push(
      {
        id: id(),
        priority: 'P1',
        action: '确认物流时效承诺的可兑现性（与仓储/物流团队对齐）',
        sourceExperiment: experiment.sourceOpportunity,
        owner: '供应链运营',
        period: '2天',
        coreMetric: '承诺兑现率预估',
        guardrailMetric: '—',
        status: '待启动',
      },
    );
  }

  // Add success criteria tracking item
  items.push({
    id: id(),
    priority: 'P2',
    action: '建立实验数据看板，监控核心指标与护栏指标',
    sourceExperiment: experiment.sourceOpportunity,
    owner: '数据运营',
    period: '持续',
    coreMetric: '指标覆盖率',
    guardrailMetric: '—',
    status: '待启动',
  });

  return items;
}

// ── Markdown export ──
export function exportActionPlanMarkdown(items: ActionItem[], experiment: ExperimentPlan): string {
  const lines: string[] = [
    `# 行动计划`,
    ``,
    `> 来源实验：${experiment.name}`,
    `> 业务场景：${experiment.scene}`,
    `> 增长目标：${experiment.goal}`,
    `> 导出时间：${new Date().toLocaleString('zh-CN')}`,
    ``,
    `| 优先级 | 行动项 | 来源实验 | 负责人 | 预计周期 | 核心指标 | 护栏指标 | 状态 |`,
    `|--------|--------|----------|--------|----------|----------|----------|------|`,
  ];

  for (const item of items) {
    lines.push(`| ${item.priority} | ${item.action} | ${item.sourceExperiment} | ${item.owner} | ${item.period} | ${item.coreMetric} | ${item.guardrailMetric} | ${item.status} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('*此行动计划由 AI Growth Manager 生成，仅用于概念验证。*');

  return lines.join('\n');
}
