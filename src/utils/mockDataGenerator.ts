// ── Types ──
export interface MockConfig {
  scene: string;
  goal: string;
  currentRate: string;
  targetRate: string;
  problem: string;
  severity: '轻度' | '中度' | '严重' | '临界/有争议';
  period: number; // days
  trend: '上升' | '下降' | '波动' | '稳定';
  includeFeedback: boolean;
  isCompound: boolean;
  description: string;
}

interface FunnelRow {
  日期: string;
  曝光: number;
  点击: number;
  详情页: number;
  加购: number;
  提交订单: number;
  支付: number;
}

interface OpsRow {
  日期: string;
  渠道: string;
  曝光量: number;
  点击量: number;
  点击率: string;
  下单量: number;
  转化率: string;
  GMV: number;
  客单价: number;
  退款率: string;
}

interface FeedbackRow {
  日期: string;
  渠道: string;
  反馈类别: string;
  用户反馈: string;
  情绪: string;
  关键词: string;
}

// ── Helpers ──
function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randF(min: number, max: number, decimals = 1) {
  return (Math.random() * (max - min) + min).toFixed(decimals);
}

function d(day: number, month = 6): string {
  return `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Severity multipliers ──
const severityMultiplier: Record<string, { lo: number; hi: number }> = {
  '轻度': { lo: 0.85, hi: 0.95 },
  '中度': { lo: 0.60, hi: 0.80 },
  '严重': { lo: 0.30, hi: 0.55 },
  '临界/有争议': { lo: 0.57, hi: 0.63 },
};

// ── Problem → affected funnel stage ──
function getAffectedStages(problem: string, isCompound?: boolean): string[] {
  if (isCompound) return ['详情页→加购', '加购→提交订单', '提交订单→支付'];

  switch (problem) {
    case '曝光到点击异常': return ['曝光→点击'];
    case '详情页到加购异常': return ['详情页→加购'];
    case '加购到提交订单异常': return ['加购→提交订单'];
    case '提交订单到支付异常': return ['提交订单→支付'];
    case '多环节复合问题': return ['详情页→加购', '加购→提交订单', '提交订单→支付'];
    default: return inferStagesFromDescription(problem);
  }
}

// ── Keyword-based stage inference for custom problems ──
function inferStagesFromDescription(desc: string): string[] {
  const s = desc.toLowerCase();
  const stages: string[] = [];

  // Exposure → Click
  if (/曝光|流量|点击率|渠道.*质量|素材.*老|入口.*误导|广告.*不符/.test(s)) {
    stages.push('曝光→点击');
  }
  // Detail → Cart
  if (/详情页.*加购|加购.*详情|商品.*描述|卖点|尺码|详情.*加载/.test(s)) {
    stages.push('详情页→加购');
  }
  // Cart → Order
  if (/加购.*下单|加购.*提交|下单.*流失|优惠券.*不可用|优惠券.*过期|满减.*门槛|结算.*卡|地址.*修改|规则.*复杂/.test(s)) {
    stages.push('加购→提交订单');
  }
  // Order → Pay
  if (/支付.*失败|支付.*流失|支付.*打不开|微信.*支付|支付宝|银行卡.*限|物流.*担心|物流.*慢|运费|包邮|不包邮/.test(s)) {
    stages.push('提交订单→支付');
  }
  // Coupon-related affects both cart→order and order→pay
  if (/优惠券.*核销|领券.*用|优惠.*不清楚|优惠.*不可用/.test(s)) {
    if (!stages.includes('加购→提交订单')) stages.push('加购→提交订单');
    if (!stages.includes('提交订单→支付')) stages.push('提交订单→支付');
  }
  // Multi-stage
  if (/多个.*环节|多.*环节|复合|整体.*下降|系统.*排查/.test(s)) {
    return ['详情页→加购', '加购→提交订单', '提交订单→支付'];
  }

  // Fallback: if nothing matched, default to cart→order
  if (stages.length === 0) {
    stages.push('加购→提交订单');
  }

  return stages;
}

// ── Generate funnel data ──
export function generateFunnelCSV(config: MockConfig): string {
  const rows: FunnelRow[] = [];
  const multi = severityMultiplier[config.severity];
  const affected = getAffectedStages(config.problem, config.isCompound);

  // Trend factor: slightly adjust rates day-over-day
  function trendFactor(day: number, total: number): number {
    switch (config.trend) {
      case '上升': return 1 + (day / total) * 0.12;
      case '下降': return 1 - (day / total) * 0.12;
      case '波动': return 1 + Math.sin((day / total) * Math.PI * 3) * 0.08;
      default: return 1;
    }
  }

  for (let day = 1; day <= config.period; day++) {
    const baseExposure = rand(85000, 140000);
    const tf = trendFactor(day, config.period);

    // Normal rates (with noise)
    let clickRate = randF(0.07, 0.09, 3);
    let detailRate = randF(0.65, 0.75, 3);
    let cartRate = randF(0.58, 0.68, 3);
    let orderRate = randF(0.55, 0.70, 3);
    let payRate = randF(0.80, 0.90, 3);

    // Apply severity to affected stages
    if (affected.includes('详情页→加购')) {
      cartRate = randF(multi.lo, multi.hi, 3);
    }
    if (affected.includes('加购→提交订单')) {
      orderRate = randF(multi.lo, multi.hi, 3);
    }
    if (affected.includes('提交订单→支付')) {
      payRate = randF(multi.lo, multi.hi, 3);
    }
    if (affected.includes('曝光→点击')) {
      clickRate = randF(0.03, 0.06, 3);
    }

    // Apply trend to affected stages
    if (config.trend !== '稳定') {
      if (affected.includes('详情页→加购')) cartRate = (parseFloat(cartRate) * tf).toFixed(3);
      if (affected.includes('加购→提交订单')) orderRate = (parseFloat(orderRate) * tf).toFixed(3);
      if (affected.includes('提交订单→支付')) payRate = (parseFloat(payRate) * tf).toFixed(3);
      if (affected.includes('曝光→点击')) clickRate = (parseFloat(clickRate) * tf).toFixed(3);
    }

    const click = Math.round(baseExposure * parseFloat(clickRate));
    const detail = Math.round(click * parseFloat(detailRate));
    const cart = Math.round(detail * parseFloat(cartRate));
    const order = Math.round(cart * parseFloat(orderRate));
    const pay = Math.round(order * parseFloat(payRate));

    rows.push({ 日期: d(day), 曝光: baseExposure, 点击: click, 详情页: detail, 加购: cart, 提交订单: order, 支付: pay });
  }

  return '日期,曝光,点击,详情页,加购,提交订单,支付\n' + rows.map((r) =>
    `${r.日期},${r.曝光},${r.点击},${r.详情页},${r.加购},${r.提交订单},${r.支付}`
  ).join('\n');
}

// ── Generate ops data ──
export function generateOpsCSV(config: MockConfig): string {
  const channels = ['抖音', '微信', '小红书', '百度', '直投'];
  const multi = severityMultiplier[config.severity];
  const affected = getAffectedStages(config.problem, config.isCompound);
  const rows: OpsRow[] = [];

  for (let day = 1; day <= config.period; day++) {
    for (const ch of channels) {
      const exposure = rand(12000, 35000);
      const clickRateRaw = affected.includes('曝光→点击')
        ? randF(0.025, 0.055, 3)
        : randF(0.06, 0.10, 3);
      const clicks = Math.round(exposure * parseFloat(clickRateRaw));

      let cvRate: string;
      if (affected.includes('详情页→加购') || affected.includes('加购→提交订单') || affected.includes('提交订单→支付')) {
        cvRate = randF(multi.lo * 0.05, multi.hi * 0.08, 3);
      } else {
        cvRate = randF(0.04, 0.08, 3);
      }
      const orders = Math.round(clicks * parseFloat(cvRate));
      const gmv = Math.round(orders * rand(120, 350));
      const refundRate = config.includeFeedback && config.severity === '严重'
        ? randF(0.08, 0.18, 2)
        : randF(0.02, 0.06, 2);

      rows.push({
        日期: d(day),
        渠道: ch,
        曝光量: exposure,
        点击量: clicks,
        点击率: clickRateRaw,
        下单量: orders,
        转化率: cvRate,
        GMV: gmv,
        客单价: orders > 0 ? Math.round(gmv / orders) : 0,
        退款率: refundRate,
      });
    }
  }

  return '日期,渠道,曝光量,点击量,点击率,下单量,转化率,GMV,客单价,退款率\n' + rows.map((r) =>
    `${r.日期},${r.渠道},${r.曝光量},${r.点击量},${r.点击率},${r.下单量},${r.转化率},${r.GMV},${r.客单价},${r.退款率}`
  ).join('\n');
}

// ── Generate feedback CSV ──
export function generateFeedbackCSV(config: MockConfig): string {
  const channels = ['抖音', '微信', '小红书', 'APP'];
  const sentiments = ['正面', '中性', '负面'];
  const rows: FeedbackRow[] = [];

  const feedbackByProblem: Record<string, { category: string; templates: string[]; keywords: string }[]> = {
    '曝光到点击异常': [
      { category: '渠道', templates: ['广告和实际商品不符', '入口误导', '点进来发现不是想要的', '素材太老不好看'], keywords: '广告,入口,误导,素材' },
    ],
    '详情页到加购异常': [
      { category: '商品详情', templates: ['详情页加载太慢', '商品描述不清晰', '没看到尺码表', '图片不够多'], keywords: '详情页,加载,描述,尺码,图片' },
      { category: '价格', templates: ['价格比其他平台贵', '没有优惠提示'], keywords: '价格,优惠,贵' },
    ],
    '加购到提交订单异常': [
      { category: '优惠券', templates: ['优惠券无法使用', '优惠券过期了', '满减门槛太高', '领了券但结算时用不了'], keywords: '优惠券,无法使用,过期,门槛,满减' },
      { category: '结算', templates: ['结算页卡顿', '地址无法修改', '支付方式不够'], keywords: '结算,卡顿,地址,支付方式' },
    ],
    '提交订单到支付异常': [
      { category: '支付', templates: ['支付失败', '微信支付打不开', '支付宝跳转失败', '银行卡限额'], keywords: '支付失败,微信,支付宝,银行卡' },
      { category: '物流', templates: ['担心物流太慢', '不包邮', '运费太贵'], keywords: '物流,包邮,运费' },
    ],
    '多环节复合问题': [
      { category: '优惠券', templates: ['优惠券无法使用', '满减门槛太高', '领了券用不了'], keywords: '优惠券,门槛,无法使用' },
      { category: '支付', templates: ['支付失败', '支付页面打不开'], keywords: '支付失败,打不开' },
      { category: '物流', templates: ['物流太慢', '担心收不到'], keywords: '物流,担心' },
    ],
  };

  // For custom problems, pick templates based on inferred stages
  let templates = feedbackByProblem[config.problem];
  if (!templates) {
    const affected = getAffectedStages(config.problem, config.isCompound);
    templates = [];
    if (affected.includes('详情页→加购')) templates.push(...feedbackByProblem['详情页到加购异常']);
    if (affected.includes('加购→提交订单')) templates.push(...feedbackByProblem['加购到提交订单异常']);
    if (affected.includes('提交订单→支付')) templates.push(...feedbackByProblem['提交订单到支付异常']);
    if (affected.includes('曝光→点击')) templates.push(...feedbackByProblem['曝光到点击异常']);
    if (templates.length === 0) templates = feedbackByProblem['加购到提交订单异常'];
  }

  // Skip feedback generation if disabled
  if (!config.includeFeedback) {
    for (let day = 1; day <= config.period; day++) {
      rows.push({
        日期: d(day), 渠道: pick(channels), 反馈类别: '—', 用户反馈: '（未启用反馈收集）', 情绪: '中性', 关键词: '',
      });
    }
  } else {

    for (let day = 1; day <= config.period; day++) {
      const count = config.severity === '严重' ? rand(8, 15) : config.severity === '中度' ? rand(4, 10) : rand(2, 6);
      for (let i = 0; i < count; i++) {
        const t = pick(templates);
        const sentiment = config.severity === '严重' ? pick(['负面', '负面', '中性']) : pick(sentiments);
        rows.push({
          日期: d(day),
          渠道: pick(channels),
          反馈类别: t.category,
          用户反馈: pick(t.templates),
          情绪: sentiment,
          关键词: t.keywords,
        });
      }
    }
  }

  return '日期,渠道,反馈类别,用户反馈,情绪,关键词\n' + rows.map((r) =>
    `${r.日期},${r.渠道},${r.反馈类别},${r.用户反馈},${r.情绪},${r.关键词}`
  ).join('\n');
}

// ── Parse CSV to rows ──
export function parseCsvToRows(csv: string): string[][] {
  return csv.trim().split('\n').map((line) => line.split(','));
}

// ── Compute funnel stage metrics ──
export interface FunnelStageMetrics {
  stage: string;
  from: string;
  to: string;
  fromCount: number;
  toCount: number;
  conversionRate: number;
  churnRate: number;
  status: '正常' | '轻度流失' | '中度流失' | '严重流失' | '临界/需进一步验证';
  statusColor: string;
  confidence: number;
  thresholds: { label: string; range: string }[];
  affectedByProblem: boolean;
}

const FUNNEL_THRESHOLDS: Record<string, { normal: number; mild: number; severe: number }> = {
  '曝光→点击': { normal: 8, mild: 5, severe: 3 },
  '点击→详情页': { normal: 65, mild: 50, severe: 35 },
  '详情页→加购': { normal: 60, mild: 40, severe: 25 },
  '加购→提交订单': { normal: 60, mild: 40, severe: 25 },
  '提交订单→支付': { normal: 80, mild: 65, severe: 50 },
};

function classifyWithBuffer(rate: number, t: { normal: number; mild: number; severe: number }): {
  status: FunnelStageMetrics['status'];
  confidence: number;
} {
  const buf = 3; // ±3pp buffer for borderline

  if (rate >= t.normal + buf) return { status: '正常', confidence: 92 };
  if (rate >= t.normal - buf && rate < t.normal + buf) return { status: '临界/需进一步验证', confidence: 68 };
  if (rate >= t.mild + buf && rate < t.normal - buf) return { status: '轻度流失', confidence: 78 };
  if (rate >= t.mild - buf && rate < t.mild + buf) return { status: '临界/需进一步验证', confidence: 65 };
  if (rate >= t.severe + buf && rate < t.mild - buf) return { status: '中度流失', confidence: 82 };
  if (rate >= t.severe - buf && rate < t.severe + buf) return { status: '临界/需进一步验证', confidence: 63 };
  return { status: '严重流失', confidence: 90 };
}

function statusColor(s: FunnelStageMetrics['status']): string {
  switch (s) {
    case '正常': return 'emerald';
    case '轻度流失': return 'orange';
    case '中度流失': return 'amber';
    case '严重流失': return 'red';
    case '临界/需进一步验证': return 'zinc';
  }
}

export function computeFunnelMetrics(funnelCSV: string, problem: string, isCompound?: boolean): FunnelStageMetrics[] {
  const rows = parseCsvToRows(funnelCSV);
  if (rows.length < 2) return [];

  const header = rows[0];
  const data = rows.slice(1);

  // Aggregate totals
  const totals: Record<string, number> = {};
  for (const row of data) {
    for (let i = 1; i < row.length; i++) {
      const key = header[i];
      totals[key] = (totals[key] || 0) + parseInt(row[i], 10) || 0;
    }
  }

  const stages: { stage: string; from: string; to: string }[] = [
    { stage: '曝光→点击', from: '曝光', to: '点击' },
    { stage: '点击→详情页', from: '点击', to: '详情页' },
    { stage: '详情页→加购', from: '详情页', to: '加购' },
    { stage: '加购→提交订单', from: '加购', to: '提交订单' },
    { stage: '提交订单→支付', from: '提交订单', to: '支付' },
  ];

  const affected = getAffectedStages(problem, isCompound);

  return stages.map((s) => {
    const fromCount = totals[s.from] || 0;
    const toCount = totals[s.to] || 0;
    const rate = fromCount > 0 ? (toCount / fromCount) * 100 : 0;
    const t = FUNNEL_THRESHOLDS[s.stage];
    const { status, confidence } = classifyWithBuffer(rate, t);

    const thresholds = [
      { label: '正常', range: `≥${t.normal}%` },
      { label: '轻度流失', range: `${t.mild}%-${t.normal}%` },
      { label: '中度流失', range: `${t.severe}%-${t.mild}%` },
      { label: '严重流失', range: `<${t.severe}%` },
    ];

    return {
      stage: s.stage,
      from: s.from,
      to: s.to,
      fromCount,
      toCount,
      conversionRate: Math.round(rate * 10) / 10,
      churnRate: Math.round((100 - rate) * 10) / 10,
      status,
      statusColor: statusColor(status),
      confidence,
      thresholds,
      affectedByProblem: affected.includes(s.stage),
    };
  });
}

// ── Feedback keyword analysis ──
export function analyzeFeedbackKeywords(feedbackCSV: string): Record<string, { count: number; ratio: number }> {
  const rows = parseCsvToRows(feedbackCSV);
  if (rows.length < 2) return {};

  const data = rows.slice(1);
  const total = data.length;
  const keywordCol = rows[0].indexOf('关键词');
  if (keywordCol < 0) return {};

  const counts: Record<string, number> = {};
  for (const row of data) {
    const keywords = (row[keywordCol] || '').split(',');
    for (const kw of keywords) {
      const k = kw.trim();
      if (k) counts[k] = (counts[k] || 0) + 1;
    }
  }

  const result: Record<string, { count: number; ratio: number }> = {};
  for (const [k, v] of Object.entries(counts)) {
    result[k] = { count: v, ratio: Math.round((v / total) * 100) };
  }
  return result;
}

// ── Download helper ──
export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
