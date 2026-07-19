import { FeedbackRow, OperationRow, RuleResult } from '../types';

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
const avg = (arr: number[]) => arr.length ? sum(arr) / arr.length : 0;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmt = (n: number) => Math.round(n).toLocaleString();
const fmtMoney = (n: number) => n >= 10000 ? `${(n / 10000).toFixed(1)}万` : fmt(n);

const beforeAfter = (rows: OperationRow[]) => {
  const dates = [...new Set(rows.map(r => r.日期))].sort();
  const mid = dates[Math.floor(dates.length / 2)];
  return [rows.filter(r => r.日期 <= mid), rows.filter(r => r.日期 > mid)];
};

const textOf = (f: FeedbackRow) => Object.values(f).join(' ');
const countFeedback = (rows: FeedbackRow[], words: string[]) =>
  rows.filter(r => words.some(w => textOf(r).includes(w))).length;

export interface FeedbackAnalysis {
  couponCount: number;
  couponRatio: number;
  logisticsCount: number;
  logisticsRatio: number;
  rulesCount: number;
  rulesRatio: number;
  totalFb: number;
}

export function analyzeFeedback(feedbacks: FeedbackRow[]): FeedbackAnalysis {
  const totalFb = Math.max(feedbacks.length, 1);
  return {
    couponCount: countFeedback(feedbacks, ['优惠券', '券', '满减', '失效', '门槛', '领券', '用不了', '过期', '不叠加']),
    couponRatio: countFeedback(feedbacks, ['优惠券', '券', '满减', '失效', '门槛', '领券', '用不了', '过期', '不叠加']) / totalFb,
    logisticsCount: countFeedback(feedbacks, ['物流', '快递', '发货', '配送', '到货', '延迟', '慢', '还没到', '查不到']),
    logisticsRatio: countFeedback(feedbacks, ['物流', '快递', '发货', '配送', '到货', '延迟', '慢', '还没到', '查不到']) / totalFb,
    rulesCount: countFeedback(feedbacks, ['规则', '复杂', '看不懂', '门槛', '玩法', '凑单', '计算', '怎么用', '搞不懂', '套路']),
    rulesRatio: countFeedback(feedbacks, ['规则', '复杂', '看不懂', '门槛', '玩法', '凑单', '计算', '怎么用', '搞不懂', '套路']) / totalFb,
    totalFb,
  };
}

export function runBusinessRules(
  ops: OperationRow[],
  feedbacks: FeedbackRow[],
  customQuestion?: string,
): RuleResult[] {
  const [before, after] = beforeAfter(ops);
  const results: RuleResult[] = [];
  const fb = analyzeFeedback(feedbacks);

  // ── 基础指标 ──
  const exposureBefore = sum(before.map(r => r.曝光量));
  const exposureAfter = sum(after.map(r => r.曝光量));
  const clicksBefore = sum(before.map(r => r.点击量));
  const clicksAfter = sum(after.map(r => r.点击量));
  const ctrBefore = clicksBefore / Math.max(exposureBefore, 1);
  const ctrAfter = clicksAfter / Math.max(exposureAfter, 1);
  const convBefore = avg(before.map(r => r.转化率));
  const convAfter = avg(after.map(r => r.转化率));
  const orderBefore = sum(before.map(r => r.下单量));
  const orderAfter = sum(after.map(r => r.下单量));
  const gmvBefore = sum(before.map(r => r.GMV));
  const gmvAfter = sum(after.map(r => r.GMV));
  const aovBefore = gmvBefore / Math.max(orderBefore, 1);
  const aovAfter = gmvAfter / Math.max(orderAfter, 1);
  const refundBefore = avg(before.map(r => r.退款率));
  const refundAfter = avg(after.map(r => r.退款率));

  const expChg = exposureBefore > 0 ? (exposureAfter - exposureBefore) / exposureBefore : 0;
  const clickChg = clicksBefore > 0 ? (clicksAfter - clicksBefore) / clicksBefore : 0;
  const ctrChg = ctrBefore > 0 ? (ctrAfter - ctrBefore) / ctrBefore : 0;
  const convChg = convBefore > 0 ? (convAfter - convBefore) / convBefore : 0;
  const gmvChg = gmvBefore > 0 ? (gmvAfter - gmvBefore) / gmvBefore : 0;
  const aovChg = aovBefore > 0 ? (aovAfter - aovBefore) / aovBefore : 0;
  const refundChg = refundBefore > 0 ? (refundAfter - refundBefore) / refundBefore : 0;
  const orderChg = orderBefore > 0 ? (orderAfter - orderBefore) / orderBefore : 0;

  const channels = [...new Set(ops.map(r => r.渠道))];

  // ═══════════════════════════════════════════
  // R01: 曝光下降且点击下降 → 流量获取不足
  // ═══════════════════════════════════════════
  if (expChg < -0.08 && clickChg < -0.08) {
    const worstChannel = channels
      .map(ch => {
        const bef = before.filter(r => r.渠道 === ch);
        const aft = after.filter(r => r.渠道 === ch);
        const chExpBef = sum(bef.map(r => r.曝光量));
        const chExpAft = sum(aft.map(r => r.曝光量));
        const chDiff = chExpBef > 0 ? (chExpAft - chExpBef) / chExpBef : 0;
        return { channel: ch, expDiff: chDiff, expBef: chExpBef, expAft: chExpAft };
      })
      .sort((a, b) => a.expDiff - b.expDiff)[0];
    results.push({
      ruleId: 'R01',
      ruleName: '曝光下降且点击下降：流量获取不足',
      severity: 'high',
      triggerCondition: `活动后期曝光量环比${pct(Math.abs(expChg))}下降，点击量同步${pct(Math.abs(clickChg))}下降`,
      evidence: [
        `曝光量：前期合计 ${fmt(exposureBefore)} → 后期 ${fmt(exposureAfter)}（${pct(expChg)}）`,
        `点击量：前期合计 ${fmt(clicksBefore)} → 后期 ${fmt(clicksAfter)}（${pct(clickChg)}）`,
        worstChannel ? `${worstChannel.channel}渠道曝光：${fmt(worstChannel.expBef)} → ${fmt(worstChannel.expAft)}（${pct(worstChannel.expDiff)}），为各渠道降幅最大` : '',
      ].filter(Boolean),
      conclusion: `曝光量与点击量同步下降，活动后期流量获取能力明显减弱。${worstChannel ? `${worstChannel.channel}渠道流量衰减最为突出。` : ''}需优先排查投放端变化。`,
      suggestion: `1）复核${worstChannel?.channel || '主力渠道'}活动后期投放计划与预算消耗情况；2）检查是否有素材被平台降权或出价被竞争压制；3）补充新鲜素材测试，拓宽搜索词覆盖与社群触达频次。`,
    });
  }

  // ═══════════════════════════════════════════
  // R02: 曝光上升但点击率下降 → 流量质量或素材吸引力不足
  // ═══════════════════════════════════════════
  if (expChg > 0.05 && ctrChg < -0.05) {
    const lowCtrChannels = channels
      .map(ch => {
        const rows = after.filter(r => r.渠道 === ch);
        const ctr = sum(rows.map(r => r.点击量)) / Math.max(sum(rows.map(r => r.曝光量)), 1);
        return { channel: ch, ctr };
      })
      .sort((a, b) => a.ctr - b.ctr)
      .slice(0, 2);
    results.push({
      ruleId: 'R02',
      ruleName: '曝光上升但点击率下降：流量质量或素材吸引力不足',
      severity: 'high',
      triggerCondition: `曝光量环比上升${pct(expChg)}，但点击率从${pct(ctrBefore)}下降至${pct(ctrAfter)}（${pct(ctrChg)}）`,
      evidence: [
        `曝光量：前期 ${fmt(exposureBefore)} → 后期 ${fmt(exposureAfter)}（+${pct(expChg)}）`,
        `整体点击率：前期 ${pct(ctrBefore)} → 后期 ${pct(ctrAfter)}（${pct(ctrChg)}）`,
        `新增曝光未带来等比例点击增长`,
        lowCtrChannels.length ? `点击率最低渠道：${lowCtrChannels.map(c => `${c.channel} ${pct(c.ctr)}`).join('、')}` : '',
      ].filter(Boolean),
      conclusion: `曝光上升但点击率反降，新增曝光触达的人群点击意愿低于前期水平。${lowCtrChannels.length ? `${lowCtrChannels.map(c => c.channel).join('、')}点击率偏低。` : ''}优先排查渠道人群定向与入口素材质量。`,
      suggestion: `1）对点击率最低的渠道暂停扩量，复核投放人群包是否精准；2）更换活动入口素材，测试不同文案方向（利益点前置 vs 好奇心标题）的点击效果；3）检查活动入口在不同端（App/小程序/H5）的可见性与加载体验。`,
    });
  }

  // ═══════════════════════════════════════════
  // R03: 点击率稳定但转化率下降 → 购买决策环节存在问题
  // ═══════════════════════════════════════════
  if (Math.abs(ctrChg) < 0.03 && convChg < -0.08) {
    const lowConvChannels = channels
      .map(ch => {
        const rows = after.filter(r => r.渠道 === ch);
        return { channel: ch, conv: avg(rows.map(r => r.转化率)) };
      })
      .sort((a, b) => a.conv - b.conv)
      .slice(0, 2);
    results.push({
      ruleId: 'R03',
      ruleName: '点击率稳定但转化率下降：购买决策环节存在问题',
      severity: 'high',
      triggerCondition: `点击率变化仅${pct(Math.abs(ctrChg))}（基本持平），但转化率从${pct(convBefore)}下降至${pct(convAfter)}（${pct(convChg)}）`,
      evidence: [
        `点击率：前期 ${pct(ctrBefore)} → 后期 ${pct(ctrAfter)}（变化 ${pct(Math.abs(ctrChg))}，基本稳定）`,
        `转化率：前期 ${pct(convBefore)} → 后期 ${pct(convAfter)}（${pct(convChg)}）`,
        `下单量：前期 ${fmt(orderBefore)} → 后期 ${fmt(orderAfter)}（${pct(orderChg)}）`,
        `用户点击进入活动页的意愿未变，但在页面内完成下单的比例下降`,
        lowConvChannels.length ? `转化率最低渠道：${lowConvChannels.map(c => `${c.channel} ${pct(c.conv)}`).join('、')}` : '',
      ].filter(Boolean),
      conclusion: `用户点击意愿稳定（点击率持平），但从浏览到下单的转化环节出现明显下滑。问题集中在活动落地页→下单的关键路径上。${fb.couponRatio > 0.16 ? '用户反馈中优惠券问题占比偏高，可能与此直接相关。' : ''}${fb.rulesRatio > 0.12 ? '活动规则复杂度反馈偏高，理解成本可能抑制了购买意愿。' : '优先排查落地页转化漏斗各环节。'}`,
      suggestion: `1）用漏斗分析定位流失最大的环节（浏览→加购→下单→支付）；2）检查活动落地页首屏核心信息（到手价/优惠标签/库存状态）是否清晰可见；3）对比高转化与低转化商品的详情页差异，提炼可复用的高转化模式。`,
    });
  }

  // ═══════════════════════════════════════════
  // R04: 曝光上升但转化率下降 → 流量充足但转化承接不足
  // ═══════════════════════════════════════════
  if (expChg > 0.05 && convChg < -0.08) {
    results.push({
      ruleId: 'R04',
      ruleName: '曝光上升但转化率下降：流量充足但转化承接不足',
      severity: 'high',
      triggerCondition: `曝光量环比上升${pct(expChg)}，但转化率从${pct(convBefore)}下降至${pct(convAfter)}（${pct(convChg)}）`,
      evidence: [
        `曝光量：前期 ${fmt(exposureBefore)} → 后期 ${fmt(exposureAfter)}（+${pct(expChg)}）`,
        `转化率：前期 ${pct(convBefore)} → 后期 ${pct(convAfter)}（${pct(convChg)}）`,
        `GMV：前期 ${fmtMoney(gmvBefore)} → 后期 ${fmtMoney(gmvAfter)}（${pct(gmvChg)}）`,
        `每100个进入活动页的用户中，实际下单人数从 ${(convBefore * 100).toFixed(1)} 人降至 ${(convAfter * 100).toFixed(1)} 人`,
        `流量获取端表现正常，但转化端未能承接`,
      ],
      conclusion: `流量充足（曝光上升）但转化率下滑，属于典型的"流量-转化"错配。${fb.couponRatio > 0.16 ? '用户反馈中优惠券问题占比较高（' + pct(fb.couponRatio) + '），可能是转化下降的重要原因。' : ''}${fb.rulesRatio > 0.12 ? '活动规则理解成本偏高，可能是用户在浏览后放弃的原因之一。' : '优先排查落地页到下单的完整转化路径。'}`,
      suggestion: `1）对活动落地页进行漏斗分析，定位转化率下降的具体环节；2）检查活动页核心利益点（优惠力度/爆款商品/限时标签）在首屏的展示效果；3）对比不同渠道的落地页转化数据，识别是全局问题还是特定渠道问题。`,
    });
  }

  // ═══════════════════════════════════════════
  // R05: GMV下降但客单价稳定 → 订单量下降是主因
  // ═══════════════════════════════════════════
  if (gmvChg < -0.08 && Math.abs(aovChg) < 0.06) {
    results.push({
      ruleId: 'R05',
      ruleName: 'GMV下降但客单价稳定：订单量下降是主因',
      severity: 'high',
      triggerCondition: `GMV环比${pct(Math.abs(gmvChg))}下降，但客单价仅变化${pct(Math.abs(aovChg))}（基本持平）`,
      evidence: [
        `GMV：前期 ${fmtMoney(gmvBefore)} → 后期 ${fmtMoney(gmvAfter)}（${pct(gmvChg)}）`,
        `客单价：前期 ${fmtMoney(aovBefore)} → 后期 ${fmtMoney(aovAfter)}（变化 ${pct(Math.abs(aovChg))}，基本持平）`,
        `下单量：前期 ${fmt(orderBefore)} → 后期 ${fmt(orderAfter)}（${pct(orderChg)}）`,
        `用户一旦决定购买，消费金额和意愿并未降低，问题在于下单的人变少了`,
      ],
      conclusion: `GMV下降的直接原因是订单量减少，而非用户消费能力下降（客单价稳定可证）。${fb.couponRatio > 0.16 ? '优惠券相关反馈占比偏高（' + pct(fb.couponRatio) + '），可能是抑制下单的关键因素。' : ''}需定位哪些渠道或商品类型的订单量下降最明显。`,
      suggestion: `1）按渠道拆分订单量变化，定位订单流失最严重的渠道；2）针对已加购未下单用户推送限时提醒或专属优惠；3）检查竞品同期是否有大型促销活动分流。`,
    });
  }

  // ═══════════════════════════════════════════
  // R06: GMV下降且客单价下降 → 高价值商品转化不足
  // ═══════════════════════════════════════════
  if (gmvChg < -0.08 && aovChg < -0.06) {
    results.push({
      ruleId: 'R06',
      ruleName: 'GMV下降且客单价下降：高价值商品转化不足',
      severity: 'high',
      triggerCondition: `GMV环比${pct(Math.abs(gmvChg))}下降，且客单价同步${pct(Math.abs(aovChg))}下降`,
      evidence: [
        `GMV：前期 ${fmtMoney(gmvBefore)} → 后期 ${fmtMoney(gmvAfter)}（${pct(gmvChg)}）`,
        `客单价：前期 ${fmtMoney(aovBefore)} → 后期 ${fmtMoney(aovAfter)}（${pct(aovChg)}）`,
        `下单量：前期 ${fmt(orderBefore)} → 后期 ${fmt(orderAfter)}（${pct(orderChg)}）`,
        `用户不仅买得更少，而且买得更便宜——高客单价商品的转化出现塌陷`,
      ],
      conclusion: `GMV和客单价双降，说明用户倾向于只买低价商品，高客单价商品的吸引力或转化力不足。${fb.couponRatio > 0.16 ? '优惠券问题反馈偏高，高价值商品可能因优惠门槛或力度不足而流失用户。' : ''}需优先分析高客单价商品的转化链路。`,
      suggestion: `1）筛选客单价 Top 20% 商品，逐一检查其详情页、优惠标签、用户评价和库存状态；2）对高价商品设置专属权益（大额满减/赠品/分期免息），降低决策门槛；3）在落地页增加高价值商品的用户证言和销量背书。`,
    });
  }

  // ═══════════════════════════════════════════
  // R07: 退款率上升 → 履约体验或商品预期存在问题
  // ═══════════════════════════════════════════
  if (refundChg > 0.12) {
    const highRefundChannels = channels
      .map(ch => {
        const rows = after.filter(r => r.渠道 === ch);
        return { channel: ch, refund: avg(rows.map(r => r.退款率)) };
      })
      .sort((a, b) => b.refund - a.refund)
      .slice(0, 2);
    results.push({
      ruleId: 'R07',
      ruleName: '退款率上升：履约体验或商品预期存在问题',
      severity: 'medium',
      triggerCondition: `退款率从${pct(refundBefore)}上升至${pct(refundAfter)}（+${pct(refundChg)}）`,
      evidence: [
        `平均退款率：前期 ${pct(refundBefore)} → 后期 ${pct(refundAfter)}（+${pct(refundChg)}）`,
        highRefundChannels.length ? `退款率最高渠道：${highRefundChannels.map(c => `${c.channel} ${pct(c.refund)}`).join('、')}` : '',
        `${fb.logisticsRatio > 0.14 ? '用户反馈中物流相关占比 ' + pct(fb.logisticsRatio) + '，超过预警线，物流体验可能是退款率上升的重要原因' : '退款率上升意味着用户收到商品后的体验与购买预期存在差距'}`,
      ].filter(Boolean),
      conclusion: `退款率上升${pct(refundChg)}。${fb.logisticsRatio > 0.14 ? `物流反馈占比偏高（${pct(fb.logisticsRatio)}），物流延迟或体验差可能是退款增加的重要推手。` : '优先排查退款订单的共性问题（物流延迟/描述不符/质量问题等）。'}${highRefundChannels.length ? `${highRefundChannels.map(c => c.channel).join('、')}渠道退款率偏高，建议优先排查其订单履约链路。` : ''}`,
      suggestion: `1）导出退款订单明细，按退款原因分类统计，定位Top 3退款原因；2）对延迟发货订单主动推送物流状态更新与预计到达时间；3）在高退款率商品页面补充实物图、尺寸参照和真实用户评价，缩小预期偏差。`,
    });
  }

  // ═══════════════════════════════════════════
  // R08: 优惠券反馈占比高 → 优惠机制影响购买决策
  // ═══════════════════════════════════════════
  if (fb.couponRatio > 0.16) {
    const keywords = ['优惠券', '券', '满减', '失效', '门槛', '领券', '用不了', '过期', '不叠加'];
    const topWords = keywords
      .map(w => ({ word: w, count: feedbacks.filter(r => textOf(r).includes(w)).length }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
    const hasExpired = topWords.some(w => w.word === '失效' || w.word === '过期');
    const hasThreshold = topWords.some(w => w.word === '门槛' || w.word === '不叠加');
    results.push({
      ruleId: 'R08',
      ruleName: '优惠券反馈占比高：优惠机制影响购买决策',
      severity: 'high',
      triggerCondition: `优惠券相关反馈${fb.couponCount}条，占比${pct(fb.couponRatio)}（阈值16%）`,
      evidence: [
        `优惠券相关反馈：${fb.couponCount} / ${fb.totalFb} 条 = ${pct(fb.couponRatio)}`,
        `高频关键词：${topWords.map(w => `"${w.word}"（${w.count}次）`).join('、')}`,
        hasExpired ? '存在优惠券失效/过期相关反馈' : '',
        hasThreshold ? '存在优惠券使用门槛/叠加规则相关反馈' : '',
      ].filter(Boolean),
      conclusion: `优惠券相关反馈占比达到${pct(fb.couponRatio)}，超过16%预警线，优惠机制已成为用户购买决策中的显著障碍。${hasExpired ? '失效/过期问题让用户到了结算页发现券用不了，直接导致弃单。' : ''}${hasThreshold ? '门槛或叠加规则不清晰，增加了用户的决策摩擦。' : ''}`,
      suggestion: `1）立即排查并下架/延期已失效优惠券，活动页只展示当前可用优惠；2）在商品详情页和购物车明确展示"到手价XX元（已优惠XX元）"，消除用户计算负担；3）降低优惠券使用门槛，增设无门槛小额券作为兜底。`,
    });
  }

  // ═══════════════════════════════════════════
  // R09: 物流反馈占比高 → 物流体验影响用户信任
  // ═══════════════════════════════════════════
  if (fb.logisticsRatio > 0.14) {
    const keywords = ['物流', '快递', '发货', '配送', '到货', '延迟', '慢', '还没到', '查不到'];
    const topWords = keywords
      .map(w => ({ word: w, count: feedbacks.filter(r => textOf(r).includes(w)).length }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
    const hasDelay = topWords.some(w => w.word === '延迟' || w.word === '慢' || w.word === '还没到');
    results.push({
      ruleId: 'R09',
      ruleName: '物流反馈占比高：物流体验影响用户信任',
      severity: 'medium',
      triggerCondition: `物流相关反馈${fb.logisticsCount}条，占比${pct(fb.logisticsRatio)}（阈值14%）`,
      evidence: [
        `物流相关反馈：${fb.logisticsCount} / ${fb.totalFb} 条 = ${pct(fb.logisticsRatio)}`,
        `高频关键词：${topWords.map(w => `"${w.word}"（${w.count}次）`).join('、')}`,
        hasDelay ? '用户集中反映物流时效慢或延迟到货' : '',
      ].filter(Boolean),
      conclusion: `物流相关反馈占比${pct(fb.logisticsRatio)}，超过14%预警线。${hasDelay ? '延迟/慢是当前最突出的物流痛点，直接影响用户对活动的信任和复购意愿。' : '物流体验是用户信任的重要组成部分，负面反馈会降低复购意愿。'}`,
      suggestion: `1）在订单确认页和后续通知中明确标注预计送达时间，管理用户预期；2）对已延迟订单主动触发通知并给予小额补偿（优惠券/积分）；3）与物流合作方确认运力保障，必要时在大促期间切换备用物流商。`,
    });
  }

  // ═══════════════════════════════════════════
  // R10: 活动规则反馈占比高 → 活动理解成本过高
  // ═══════════════════════════════════════════
  if (fb.rulesRatio > 0.12) {
    const keywords = ['规则', '复杂', '看不懂', '门槛', '玩法', '凑单', '计算', '怎么用', '搞不懂', '套路'];
    const topWords = keywords
      .map(w => ({ word: w, count: feedbacks.filter(r => textOf(r).includes(w)).length }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
    const hasComplex = topWords.some(w => w.word === '凑单' || w.word === '计算' || w.word === '复杂');
    results.push({
      ruleId: 'R10',
      ruleName: '活动规则反馈占比高：活动理解成本过高',
      severity: 'medium',
      triggerCondition: `活动规则相关反馈${fb.rulesCount}条，占比${pct(fb.rulesRatio)}（阈值12%）`,
      evidence: [
        `活动规则相关反馈：${fb.rulesCount} / ${fb.totalFb} 条 = ${pct(fb.rulesRatio)}`,
        `高频关键词：${topWords.map(w => `"${w.word}"（${w.count}次）`).join('、')}`,
        hasComplex ? '用户反映需要凑单/计算，决策负担较重' : '',
      ].filter(Boolean),
      conclusion: `活动规则相关反馈占比${pct(fb.rulesRatio)}，超过12%预警线。${hasComplex ? '用户需要自行凑单和计算，增加了不必要的决策成本，部分用户可能因此放弃购买。' : '规则复杂度在用户转化链路中形成了隐性摩擦。'}`,
      suggestion: `1）将活动规则简化为三步式说明（领券→加购→结算自动减），每步配图标+一句话；2）在商品详情页和购物车实时展示"到手价"，消除用户计算负担；3）对复杂玩法提供"一键最优"推荐，降低用户决策成本。`,
    });
  }

  // ═══════════════════════════════════════════
  // R11: 自定义分析
  // ═══════════════════════════════════════════
  if (customQuestion) {
    const q = customQuestion;
    const mentionsChannel = /渠道/.test(q);
    const mentionsConv = /转化|下单|为什么.*低|为什么.*下降/.test(q);
    const mentionsFeedback = /反馈|用户|不满意|吐槽/.test(q);
    const mentionsRefund = /退款|退货/.test(q);
    const mentionsCoupon = /优惠券|券|满减|优惠/.test(q);
    const mentionsLogistics = /物流|快递|发货/.test(q);
    const mentionsRule = /规则|复杂|玩法/.test(q);

    let evidence: string[] = [];
    let conclusion = '';
    let suggestion = '';

    if (mentionsConv && convChg < 0) {
      evidence = [
        `针对"${q}"的数据分析：`,
        `活动后期平均转化率 ${pct(convAfter)}，较前期 ${pct(convBefore)} ${pct(convChg)}`,
        `下单量：前期 ${fmt(orderBefore)} → 后期 ${fmt(orderAfter)}（${pct(orderChg)}）`,
        `点击率变化：${pct(ctrChg)}`,
      ];
      conclusion = `转化率下降${pct(Math.abs(convChg))}。${Math.abs(ctrChg) < 0.03 ? `点击率基本稳定（变化仅${pct(Math.abs(ctrChg))}），问题更可能出在点击→下单的转化路径上。${fb.couponRatio > 0.16 ? '结合优惠券反馈占比偏高（' + pct(fb.couponRatio) + '），优惠机制可能是主要影响因素。' : '建议优先排查落地页转化漏斗。'}` : ctrChg < -0.05 ? `点击率同步下降${pct(Math.abs(ctrChg))}，问题可能从入口素材层面就已开始，建议先优化素材再排查转化链路。` : '建议从渠道维度拆分数据，定位是全局问题还是特定渠道问题。'}`;
      suggestion = `将分析维度从活动整体下钻到"渠道×日期"，定位转化率下降的具体时间点和渠道，针对性修复。${fb.couponRatio > 0.16 ? '同时优先处理优惠券相关问题。' : ''}`;
    } else if (mentionsChannel) {
      const channelStats = channels
        .map(ch => {
          const rows = ops.filter(r => r.渠道 === ch);
          return {
            channel: ch,
            exposure: sum(rows.map(r => r.曝光量)),
            conv: avg(rows.map(r => r.转化率)),
            ctr: sum(rows.map(r => r.点击量)) / Math.max(sum(rows.map(r => r.曝光量)), 1),
          };
        })
        .sort((a, b) => b.exposure - a.exposure);
      evidence = [
        `针对"${q}"的渠道数据：`,
        ...channelStats.map(c => `${c.channel}：曝光 ${fmt(c.exposure)}，点击率 ${pct(c.ctr)}，转化率 ${pct(c.conv)}`),
      ];
      const worst = [...channelStats].sort((a, b) => a.conv - b.conv)[0];
      const avgExp = sum(channelStats.map(c => c.exposure)) / Math.max(channelStats.length, 1);
      conclusion = `各渠道表现差异明显。${worst ? `${worst.channel}转化率最低（${pct(worst.conv)}），${worst.exposure > avgExp ? '且曝光量较大，属于"高曝光低转化"问题渠道，建议优先复核人群定向与落地页匹配度。' : '曝光量也偏低，属于"量质双低"渠道，建议评估是否继续投入。'}` : ''}`;
      suggestion = worst ? `优先对${worst.channel}进行人群定向复核和素材优化，如持续低效则削减预算转投高效渠道。` : '建议补充渠道成本数据以计算ROI，辅助资源分配决策。';
    } else if (mentionsFeedback) {
      evidence = [
        `针对"${q}"的反馈分析：`,
        `总反馈量：${fb.totalFb} 条`,
        `优惠券相关：${fb.couponCount} 条（${pct(fb.couponRatio)}）${fb.couponRatio > 0.16 ? ' ⚠️ 超过预警线' : ''}`,
        `物流相关：${fb.logisticsCount} 条（${pct(fb.logisticsRatio)}）${fb.logisticsRatio > 0.14 ? ' ⚠️ 超过预警线' : ''}`,
        `活动规则相关：${fb.rulesCount} 条（${pct(fb.rulesRatio)}）${fb.rulesRatio > 0.12 ? ' ⚠️ 超过预警线' : ''}`,
      ];
      const maxCat = [{ n: '优惠券', c: fb.couponCount, r: fb.couponRatio }, { n: '物流', c: fb.logisticsCount, r: fb.logisticsRatio }, { n: '活动规则', c: fb.rulesCount, r: fb.rulesRatio }].sort((a, b) => b.c - a.c)[0];
      conclusion = `用户反馈中最突出的问题是${maxCat.n}相关，共${maxCat.c}条（${pct(maxCat.r)}）。这类反馈直接影响用户的购买信心和复购意愿。`;
      suggestion = `将${maxCat.n}相关反馈按子类别分类，逐类制定改进方案。在下一次活动前做小范围用户测试验证改进效果。`;
    } else {
      const allRules = results.filter(r => r.severity === 'high');
      evidence = [
        `针对"${q}"的综合分析：`,
        `共触发 ${results.length} 条业务规则，其中高风险 ${results.filter(r => r.severity === 'high').length} 条`,
        allRules.length ? `关键风险项：${allRules.slice(0, 3).map(r => r.ruleName).join('；')}` : '',
      ].filter(Boolean);
      conclusion = allRules.length
        ? `当前最需关注：${allRules[0]?.ruleName}。建议围绕此方向，关联渠道、商品和用户反馈维度交叉验证。`
        : `当前数据未触发明显的高风险规则。如需更精准的分析，建议在问题中明确分析维度（如"哪个渠道质量最低""物流投诉集中在哪个环节"）。`;
      suggestion = '如需更精准的分析，建议补充问题中的分析维度（渠道/商品/时间段/用户群体）。';
    }

    results.push({
      ruleId: 'R11',
      ruleName: `自定义分析：${customQuestion.length > 30 ? customQuestion.slice(0, 30) + '…' : customQuestion}`,
      severity: 'medium',
      triggerCondition: '用户发起自定义分析',
      evidence,
      conclusion,
      suggestion,
    });
  }

  return results;
}
