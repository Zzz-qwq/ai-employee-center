import { URFeedbackRow, InsightResult, URKeyword, URTheme, SentimentResult } from '../types';

// ═══════════════════════════════════════
// Sentiment dictionaries
// ═══════════════════════════════════════

const STRONG_POSITIVE = ['太棒了', '超级好', '完美', '非常满意', '强烈推荐', '惊喜', '爱了', '绝了', '好评如潮'];
const POSITIVE = ['好', '棒', '满意', '喜欢', '方便', '快', '流畅', '便宜', '划算', '推荐', '赞', '不错', '优秀', '清晰', '好用', '舒服', '省心', '贴心', '人性化', '良心', '给力', '到位', '细心', '热情', '专业', '靠谱', '稳定', '简洁', '干净', '实惠', '惊喜', '好评', '细心', '高效'];
const SLIGHT_POSITIVE = ['还行', '凑合', '差不多', '勉强可以', '一般般吧'];

const NEGATION = ['不', '没', '别', '非', '无', '未必', '算不上', '哪', '怎么'];

const STRONG_NEGATIVE = ['太差了', '垃圾', '骗人', '恶心', '气死', '崩溃', '投诉', '退款', '再也不用', '劝退'];
const NEGATIVE = ['差', '烂', '失望', '难用', '慢', '卡', '贵', '坑', '糟糕', '烦', '问题', 'bug', '错误', '失败', '找不到', '看不懂', '打不开', '闪退', '误导', '忽悠', '混乱', '复杂', '麻烦', '无语', '浪费时间', '后悔', '不值', '糊弄', '敷衍', '态度差', '排队', '等好久', '没人管', '不理', '机器人'];
const SLIGHT_NEGATIVE = ['稍微', '有点慢', '不太方便', '略显', '可以更好'];

// Ambiguous / sarcasm indicators — when these appear without clear sentiment, flag as disputed
const AMBIGUOUS_MARKERS = ['呵呵', '好吧', '是真的吗', '你确定', '认真的吗', '就这样吧', '随便', '无所谓', '有意思', '真有你的', '绝绝子', '啊对对对', '你说得对'];

function hasNegation(text: string, wordIndex: number): boolean {
  // Check if a negation word appears within 2 characters before the target word
  const before = text.substring(Math.max(0, wordIndex - 3), wordIndex);
  return NEGATION.some(n => before.includes(n));
}

type SentimentLabel = '正面' | '中性' | '负面' | '争议';

function detectSentiment(text: string): { label: SentimentLabel; score: number } {
  let posScore = 0, negScore = 0;
  let ambiguous = false;

  // Check ambiguous markers
  for (const m of AMBIGUOUS_MARKERS) {
    if (text.includes(m)) { ambiguous = true; break; }
  }

  // Score positive
  for (const w of STRONG_POSITIVE) { if (text.includes(w)) posScore += 3; }
  for (const w of POSITIVE) {
    const idx = text.indexOf(w);
    if (idx >= 0) {
      if (hasNegation(text, idx)) { negScore += 1; }
      else { posScore += 1; }
    }
  }
  for (const w of SLIGHT_POSITIVE) { if (text.includes(w)) posScore += 0.5; }

  // Score negative
  for (const w of STRONG_NEGATIVE) { if (text.includes(w)) negScore += 3; }
  for (const w of NEGATIVE) {
    const idx = text.indexOf(w);
    if (idx >= 0) {
      if (hasNegation(text, idx)) { posScore += 1; }
      else { negScore += 1; }
    }
  }
  for (const w of SLIGHT_NEGATIVE) { if (text.includes(w)) negScore += 0.5; }

  const diff = posScore - negScore;

  if (ambiguous && Math.abs(diff) < 2) return { label: '争议', score: 0 };
  if (diff > 1.5) return { label: '正面', score: diff };
  if (diff < -1.5) return { label: '负面', score: Math.abs(diff) };
  if (Math.abs(diff) <= 1.5 && (posScore + negScore) > 0) return { label: '争议', score: Math.abs(diff) };
  return { label: '中性', score: 0 };
}

// ═══════════════════════════════════════
// Mock data generator — truly random
// ═══════════════════════════════════════

interface FeedbackTemplate {
  text: string;
  categories: string[];
  defaultSentiment: 'pos' | 'neg' | 'mix';
}

const TEMPLATES: FeedbackTemplate[] = [
  // 优惠券/促销 (pos + neg)
  { text: '优惠券领了但结算时用不了', categories: ['优惠券/促销'], defaultSentiment: 'neg' },
  { text: '满减规则太复杂，根本看不懂', categories: ['优惠券/促销', '活动/规则'], defaultSentiment: 'neg' },
  { text: '说好的全场满减，有些商品不参与', categories: ['优惠券/促销', '活动/规则'], defaultSentiment: 'neg' },
  { text: '这个价格确实比实体店划算多了', categories: ['优惠券/促销'], defaultSentiment: 'pos' },
  { text: '折扣力度很大，囤货了', categories: ['优惠券/促销'], defaultSentiment: 'pos' },
  { text: '优惠券门槛太高了，根本凑不够', categories: ['优惠券/促销'], defaultSentiment: 'neg' },
  { text: '领券的时候说全场可用，付款时又不支持', categories: ['优惠券/促销', '活动/规则'], defaultSentiment: 'neg' },
  { text: '红包自动到账，很方便', categories: ['优惠券/促销'], defaultSentiment: 'pos' },
  { text: '比了三个平台，这的最便宜', categories: ['优惠券/促销'], defaultSentiment: 'pos' },

  // 支付/结算 (neg heavy)
  { text: '付款页面卡了三次才成功', categories: ['支付/结算', '体验/性能'], defaultSentiment: 'neg' },
  { text: '支付方式太少了，想用花呗不行', categories: ['支付/结算'], defaultSentiment: 'neg' },
  { text: '运费居然要15块，抢钱吗', categories: ['支付/结算', '物流/配送'], defaultSentiment: 'neg' },
  { text: '结算流程很顺畅，一次搞定', categories: ['支付/结算'], defaultSentiment: 'pos' },
  { text: '下单后不能改地址，这设计反人类', categories: ['支付/结算'], defaultSentiment: 'neg' },
  { text: '支付成功但订单显示未付款，吓我一跳', categories: ['支付/结算', '体验/性能'], defaultSentiment: 'neg' },
  { text: '微信支付很快，比银行卡方便', categories: ['支付/结算'], defaultSentiment: 'pos' },

  // 物流/配送 (mixed)
  { text: '快递太慢了，五天了还没发', categories: ['物流/配送'], defaultSentiment: 'neg' },
  { text: '包装很好，物流也快', categories: ['物流/配送'], defaultSentiment: 'pos' },
  { text: '物流信息一直不更新，以为丢件了', categories: ['物流/配送'], defaultSentiment: 'neg' },
  { text: '顺丰次日达，好评', categories: ['物流/配送'], defaultSentiment: 'pos' },
  { text: '收到的时候盒子已经压扁了', categories: ['物流/配送'], defaultSentiment: 'neg' },
  { text: '隐私包装不错，看不出来是什么', categories: ['物流/配送'], defaultSentiment: 'pos' },
  { text: '快递员态度很好，送上门的', categories: ['物流/配送'], defaultSentiment: 'pos' },

  // 商品/详情 (mixed)
  { text: '实物和详情页描述完全不一样，色差巨大', categories: ['商品/详情'], defaultSentiment: 'neg' },
  { text: '详情页图片半天加载不出来', categories: ['商品/详情', '体验/性能'], defaultSentiment: 'neg' },
  { text: '商品质量不错，和描述一致', categories: ['商品/详情'], defaultSentiment: 'pos' },
  { text: '尺码表不准，按推荐买的还是小了', categories: ['商品/详情'], defaultSentiment: 'neg' },
  { text: '材质比想象的好，性价比高', categories: ['商品/详情'], defaultSentiment: 'pos' },
  { text: '细节图拍得很清楚，买得放心', categories: ['商品/详情'], defaultSentiment: 'pos' },
  { text: '写了包邮但结算又加运费，虚假宣传', categories: ['商品/详情', '活动/规则'], defaultSentiment: 'neg' },

  // 客服/售后 (neg heavy)
  { text: '客服永远是机器人，想找真人', categories: ['客服/售后'], defaultSentiment: 'neg' },
  { text: '退款申请提交一周了没动静', categories: ['客服/售后'], defaultSentiment: 'neg' },
  { text: '售后态度不错，问题最终解决了', categories: ['客服/售后'], defaultSentiment: 'pos' },
  { text: '排队50+，等了半小时才接上', categories: ['客服/售后'], defaultSentiment: 'neg' },
  { text: '电话客服打了三次都没人接', categories: ['客服/售后'], defaultSentiment: 'neg' },
  { text: '退货流程很顺畅，快递上门取件', categories: ['客服/售后', '物流/配送'], defaultSentiment: 'pos' },
  { text: '客服把问题推来推去，就是不给解决', categories: ['客服/售后'], defaultSentiment: 'neg' },

  // 活动/规则 (neg heavy)
  { text: '活动规则写得太绕了，看三遍没看懂', categories: ['活动/规则'], defaultSentiment: 'neg' },
  { text: '活动时间太短了，看到的时候已经结束', categories: ['活动/规则'], defaultSentiment: 'neg' },
  { text: '活动力度很大，希望多搞', categories: ['活动/规则', '优惠券/促销'], defaultSentiment: 'pos' },
  { text: '限购一件太不合理了', categories: ['活动/规则'], defaultSentiment: 'neg' },
  { text: '邀请好友才能参与，太麻烦', categories: ['活动/规则'], defaultSentiment: 'neg' },

  // 体验/性能 (mixed)
  { text: 'App在支付页面直接闪退了', categories: ['体验/性能', '支付/结算'], defaultSentiment: 'neg' },
  { text: '首页加载要五秒，太慢了', categories: ['体验/性能'], defaultSentiment: 'neg' },
  { text: '新版本界面改得不错，比之前清爽', categories: ['体验/性能'], defaultSentiment: 'pos' },
  { text: '搜索联想词一点都不准', categories: ['体验/性能'], defaultSentiment: 'neg' },
  { text: '夜间模式终于有了，好评', categories: ['体验/性能'], defaultSentiment: 'pos' },
  { text: '浏览到一半自动退出登录了', categories: ['体验/性能'], defaultSentiment: 'neg' },

  // Edge cases — sarcasm / ambiguous
  { text: '呵呵，这就是你们的"极速退款"', categories: ['客服/售后'], defaultSentiment: 'mix' },
  { text: '好吧，反正也不是第一次被坑了', categories: ['客服/售后', '优惠券/促销'], defaultSentiment: 'mix' },
  { text: '绝了，下单三天还没发货，真有效率', categories: ['物流/配送'], defaultSentiment: 'mix' },
  { text: '这就叫"精品"啊，长见识了', categories: ['商品/详情'], defaultSentiment: 'mix' },
  { text: '随便吧，懒得退了', categories: ['支付/结算'], defaultSentiment: 'mix' },
  { text: '有意思，优惠券写着全场通用，但就是不能用', categories: ['优惠券/促销', '活动/规则'], defaultSentiment: 'mix' },
];

const PREFIXES = ['', '', '', '说实话，', '讲真，', '真的，', '这次', '每次都是', '又', '我就想问，', '有人跟我一样吗，'];
const SUFFIXES = ['', '', '', '……', '。', '！', '！！', '？？', '???'];
const INTENSIFIERS = ['', '', '', '', '太', '非常', '超级', '极其'];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateMockFeedback(scene: string, count: number = 200): URFeedbackRow[] {
  // Filter templates based on scene
  let pool = [...TEMPLATES];
  const sceneLower = scene.toLowerCase();

  if (sceneLower.includes('电商') || sceneLower.includes('618') || sceneLower.includes('双11') || sceneLower.includes('大促') || sceneLower.includes('活动')) {
    // Add more 电商-related but keep full pool
    pool = shuffleArray([...pool, ...pool.filter(t => t.categories.some(c => ['优惠券/促销', '支付/结算', '物流/配送', '活动/规则'].includes(c)))]);
  } else if (sceneLower.includes('产品') || sceneLower.includes('体验') || sceneLower.includes('app') || sceneLower.includes('改版')) {
    pool = shuffleArray([...pool, ...pool.filter(t => t.categories.some(c => ['体验/性能', '商品/详情'].includes(c)))]);
  } else if (sceneLower.includes('客服') || sceneLower.includes('服务') || sceneLower.includes('售后') || sceneLower.includes('满意度')) {
    pool = shuffleArray([...pool, ...pool.filter(t => t.categories.some(c => ['客服/售后'].includes(c)))]);
  }

  const rows: URFeedbackRow[] = [];
  const sources = ['用户评价', '客服记录', '问卷调研', '社媒评论', 'App Store评论', '内部反馈'];
  const poolSize = pool.length;

  for (let i = 0; i < count; i++) {
    const tpl = pool[i % poolSize];

    // Randomly modify text for variation
    let text = tpl.text;
    const prefix = Math.random() < 0.35 ? pickRandom(PREFIXES) : '';
    const suffix = Math.random() < 0.4 ? pickRandom(SUFFIXES) : '';

    // Sometimes use intensifier
    if (Math.random() < 0.25) {
      const intensifier = pickRandom(INTENSIFIERS);
      // Find a common adjective to intensify
      text = text.replace(/太|非常|超级|很|有点/g, intensifier);
    }

    // Randomly flip sentiment for ~15% of entries to simulate real variation
    let finalText = prefix + text + suffix;
    const sentiment = detectSentiment(finalText);

    // If it's a "mix" template (sarcasm), keep it ambiguous
    const tplSentiment = tpl.defaultSentiment;
    let emotionLabel = '';
    if (tplSentiment === 'mix') {
      emotionLabel = pickRandom(['负面', '争议', '中性']);
    } else if (Math.random() < 0.12) {
      // Small chance to flip: pos→neg or neg→pos for realism
      emotionLabel = tplSentiment === 'pos' ? '负面' : '正面';
    } else {
      emotionLabel = sentiment.label;
    }

    rows.push({
      反馈内容: finalText,
      情绪: emotionLabel,
      类别: pickRandom(tpl.categories),
      来源: pickRandom(sources),
    });
  }

  return shuffleArray(rows);
}

// ═══════════════════════════════════════
// Analysis
// ═══════════════════════════════════════

export function analyzeFeedback(feedbacks: URFeedbackRow[]): InsightResult {
  // 1. Sentiment
  let positive = 0, neutral = 0, negative = 0, disputed = 0;
  const sentimentByFeedback: SentimentLabel[] = [];

  for (const fb of feedbacks) {
    // Use provided emotion if available, otherwise detect
    const s = fb.情绪 || detectSentiment(fb.反馈内容).label;
    sentimentByFeedback.push(s as SentimentLabel);
    if (s === '正面') positive++;
    else if (s === '负面') negative++;
    else if (s === '争议') disputed++;
    else neutral++;
  }
  const sentiment: SentimentResult = {
    positive, neutral, negative, disputed, total: feedbacks.length,
  };

  // 2. Keywords — all Chinese words >= 2 chars
  const keywordMap = new Map<string, { count: number; sentiments: SentimentLabel[] }>();
  const allKeywords = [...new Set([
    ...POSITIVE, ...NEGATIVE, ...STRONG_POSITIVE, ...STRONG_NEGATIVE,
    '优惠券', '运费', '客服', '退款', '支付', '物流', '快递', '加载',
    '闪退', '搜索', '界面', '规则', '满减', '折扣', '发货', '详情', '描述',
    '价格', '质量', '包装', '态度', '速度', '排队', '机器人', '尺码',
    '色差', '时效', '短信', '推送', '广告', '会员', '积分', '售后',
  ])];

  for (const fb of feedbacks) {
    for (const w of allKeywords) {
      if (fb.反馈内容.includes(w)) {
        const existing = keywordMap.get(w);
        const s = (fb.情绪 as SentimentLabel) || detectSentiment(fb.反馈内容).label;
        if (existing) { existing.count++; existing.sentiments.push(s); }
        else { keywordMap.set(w, { count: 1, sentiments: [s] }); }
      }
    }
  }

  const keywords: URKeyword[] = [...keywordMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([word, v]) => {
      const negN = v.sentiments.filter(s => s === '负面').length;
      const posN = v.sentiments.filter(s => s === '正面').length;
      return {
        word, count: v.count,
        sentiment: negN > posN * 1.5 ? '负面' : posN > negN * 1.5 ? '正面' : '中性',
      };
    });

  // 3. Themes
  const THEMES = [
    { name: '优惠券/促销', keywords: ['优惠券', '优惠', '折扣', '满减', '红包', '券', '促销', '降价', '价格', '划算', '便宜'], severity: '高' as const, suggestion: '优化优惠券展示位置与使用门槛，在主流程关键节点增加可用优惠提醒，降低凑单门槛' },
    { name: '支付/结算', keywords: ['支付', '付款', '银行卡', '微信支付', '支付宝', '结算', '下单', '订单', '运费', '包邮', '改地址'], severity: '高' as const, suggestion: '排查支付环节的技术问题，简化结算流程，增加运费说明前置展示，支持下单后修改地址' },
    { name: '物流/配送', keywords: ['物流', '快递', '配送', '发货', '运费', '包邮', '收货', '延迟', '包装', '速度', '时效'], severity: '中' as const, suggestion: '增加物流状态实时追踪，对延迟订单主动推送通知并给予补偿，优化包装标准' },
    { name: '商品/详情', keywords: ['商品', '详情页', '描述', '图片', '尺码', '颜色', '材质', '规格', '参数', '实物', '色差', '质量'], severity: '中' as const, suggestion: '优化商品详情页信息完整度与真实性，增加真实用户实拍图展示模块，尺码表增加多维参考' },
    { name: '客服/售后', keywords: ['客服', '售后', '退款', '退货', '投诉', '回复', '态度', '解决', '补偿', '排队', '机器人', '推来推去'], severity: '中' as const, suggestion: '增加售后问题智能分类+常见问题自助解决入口，复杂问题一键转人工，明确SLA时效承诺' },
    { name: '活动/规则', keywords: ['活动', '规则', '条件', '门槛', '限制', '参与', '资格', '时间', '过期', '有效期', '限购'], severity: '低' as const, suggestion: '活动规则用可视化方式展示，核心条件在首屏用通俗语言说明，倒计时和过期提醒前置' },
    { name: '体验/性能', keywords: ['加载', '卡顿', '闪退', '崩溃', '慢', '白屏', '网络', '搜索', '界面', '退出', '兼容'], severity: '低' as const, suggestion: '监控页面加载性能和崩溃率，对低端设备和弱网环境做降级适配，关键路径增加loading状态' },
  ];

  const themeCounts = new Map<typeof THEMES[0], { count: number; quotes: string[]; sentiments: SentimentLabel[] }>();
  for (const t of THEMES) {
    let count = 0;
    const quotes: string[] = [];
    const slist: SentimentLabel[] = [];
    for (const fb of feedbacks) {
      const match = t.keywords.some(kw => fb.反馈内容.includes(kw));
      if (match) {
        count++;
        const s = (fb.情绪 as SentimentLabel) || detectSentiment(fb.反馈内容).label;
        slist.push(s);
        if (quotes.length < 4) quotes.push(fb.反馈内容);
      }
    }
    if (count > 0) themeCounts.set(t, { count, quotes, sentiments: slist });
  }

  const themes = [...themeCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 7)
    .map(([t, v]) => {
      const negCount = v.sentiments.filter(s => s === '负面').length;
      const dispCount = v.sentiments.filter(s => s === '争议').length;
      // Adjust severity based on sentiment ratio
      let sev = t.severity;
      if (negCount > v.count * 0.6) sev = '高';
      else if (negCount < v.count * 0.3 && dispCount < v.count * 0.2) sev = '低';

      return {
        name: t.name, count: v.count, severity: sev,
        keywords: t.keywords.filter(kw => feedbacks.some(fb => fb.反馈内容.includes(kw))).slice(0, 5),
        quotes: v.quotes,
        suggestion: t.suggestion,
        needsManualReview: dispCount > 0 && dispCount / v.count > 0.15, // Flag for human review
      };
    });

  // 4. Summary
  const topTheme = themes[0];
  const negPct = feedbacks.length > 0 ? Math.round((negative / feedbacks.length) * 100) : 0;
  const dispPct = feedbacks.length > 0 ? Math.round((disputed / feedbacks.length) * 100) : 0;

  let summary = `本次共分析 ${feedbacks.length} 条用户反馈。`;
  summary += `整体情感倾向${negPct > 40 ? '偏负面' : negPct > 20 ? '中性偏负面' : '偏正面'}（正面 ${Math.round((positive/feedbacks.length)*100)}% / 中性 ${Math.round((neutral/feedbacks.length)*100)}% / 负面 ${negPct}%`;
  if (disputed > 0) summary += ` / 争议 ${dispPct}%（建议人工复核）`;
  summary += `）。`;
  if (topTheme) summary += `最突出的问题是「${topTheme.name}」（${topTheme.count} 条提及），建议优先关注。`;
  if (disputed > 0) summary += ` 检测到 ${disputed} 条争议/反话性质反馈，已标记供人工二次筛选。`;

  return { sentiment, keywords, themes, summary };
}

// ═══════════════════════════════════════
// CSV parsing
// ═══════════════════════════════════════

export function parseFeedbackCSV(csvText: string): URFeedbackRow[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const contentIdx = headers.findIndex(h => h === '反馈内容' || h === '内容' || h === 'text');
  const rows: URFeedbackRow[] = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: URFeedbackRow = {
      反馈内容: contentIdx >= 0 ? (values[contentIdx] || values[0] || '') : (values[0] || ''),
    };
    headers.forEach((h, i) => {
      if (i !== contentIdx && values[i]) row[h] = values[i];
    });
    return row;
  }).filter(r => r.反馈内容);
  return rows;
}

// ═══════════════════════════════════════
// Follow-up answer generator (dynamic)
// ═══════════════════════════════════════

export function generateInsightAnswer(question: string, insight: InsightResult): string {
  const topTheme = insight.themes[0];
  const allThemes = insight.themes;

  if (question.includes('不满意') || question.includes('痛点') || question.includes('最大的问题')) {
    return `用户最不满意的是「${topTheme?.name || '暂无显著主题'}」（${topTheme?.count || 0} 条提及）。\n\n核心问题：${topTheme?.suggestion || ''}\n\n代表性反馈：${topTheme?.quotes?.slice(0, 2).map(q => `"${q}"`).join('；') || '暂无'}`;
  }
  if (question.includes('紧急') || question.includes('优先')) {
    const high = allThemes.filter(t => t.severity === '高');
    return high.length > 0
      ? `⚠️ 高优先级问题共 ${high.length} 个：\n${high.map(t => `• ${t.name}（${t.count}条）—— ${t.suggestion}`).join('\n')}\n\n建议按顺序逐个击破。`
      : `当前无高严重度问题。提及量最多的是「${topTheme?.name}」（${topTheme?.count} 条），建议优先处理。`;
  }
  if (question.includes('正面') || question.includes('好评') || question.includes('满意的')) {
    const posCount = insight.sentiment.positive;
    return `正面反馈共 ${posCount} 条（${Math.round(posCount/insight.sentiment.total*100)}%）。用户最满意的方面：${insight.keywords.filter(k => k.sentiment === '正面').slice(0, 5).map(k => `${k.word}（${k.count}次）`).join('、')}。建议在后续优化中保留这些优势。`;
  }
  if (question.includes('情感') || question.includes('情绪') || question.includes('倾向')) {
    const { positive, neutral, negative, disputed, total } = insight.sentiment;
    let result = `📊 情感分析结果：\n• 正面 ${Math.round(positive/total*100)}%（${positive}条）\n• 中性 ${Math.round(neutral/total*100)}%（${neutral}条）\n• 负面 ${Math.round(negative/total*100)}%（${negative}条）`;
    if (disputed > 0) result += `\n• 争议 ${Math.round(disputed/total*100)}%（${disputed}条）⚠️ 建议人工复核`;
    result += `\n\n${negative > positive ? '负面反馈占比较高，建议重点关注用户不满的具体原因。' : '整体反馈偏正面，建议保持服务水平并关注争议反馈。'}`;
    return result;
  }
  if (question.includes('建议') || question.includes('怎么改') || question.includes('改进')) {
    return allThemes.slice(0, 4).map((t, i) => `${i + 1}. **${t.name}**（${t.severity}优先级）\n   ${t.suggestion}${t.needsManualReview ? '\n   ⚠️ 该分类存在争议反馈，建议人工抽查。' : ''}`).join('\n\n');
  }
  if (question.includes('汇报') || question.includes('老板') || question.includes('总结')) {
    return `## 用户洞察汇报\n\n**整体结论**：${insight.summary}\n\n**TOP 3 用户诉求**：\n${allThemes.slice(0, 3).map((t, i) => `${i + 1}. ${t.name}（${t.count}条）—— ${t.severity === '高' ? '⚠️ 需立即关注' : t.severity === '中' ? '📌 建议近期处理' : '✅ 可延后'}${t.needsManualReview ? ' · 含争议' : ''}`).join('\n')}\n\n**建议动作**：优先解决「${allThemes[0]?.name}」—— ${allThemes[0]?.suggestion}`;
  }
  if (question.includes('争议') || question.includes('反话') || question.includes('人工')) {
    const dispCount = insight.sentiment.disputed || 0;
    const dispThemes = allThemes.filter(t => t.needsManualReview);
    return dispCount > 0
      ? `检测到 ${dispCount} 条争议/反话性质反馈（${Math.round(dispCount/insight.sentiment.total*100)}%）。\n\n涉及主题：${dispThemes.map(t => `${t.name}（${t.count}条）`).join('、')}。\n\n这些反馈中可能包含讽刺、反语或模棱两可的表达，建议人工逐条复核后再纳入决策。`
      : `当前分析中未检测到明显的争议反馈。`;
  }

  // Dynamic fallback based on top themes
  return `基于 ${insight.sentiment.total} 条反馈的分析：\n\n${insight.summary}\n\n想深入了解哪个方面？你可以问：最不满意什么 / 哪些最紧急 / 情感倾向 / 改进建议 / 争议反馈。`;
}

// Generate dynamic follow-up suggestions based on insight
export function generateDynamicQuestions(insight: InsightResult): string[] {
  const questions: string[] = [];

  if (insight.sentiment.negative / insight.sentiment.total > 0.3) {
    questions.push('用户最不满意的是什么？');
  }
  if (insight.themes.filter(t => t.severity === '高').length > 0) {
    questions.push('哪些问题最紧急？');
  }
  if (insight.sentiment.disputed > 0) {
    questions.push('争议反馈有哪些？');
  }
  questions.push('有哪些改进建议？');
  questions.push('整体情感倾向如何？');
  questions.push('生成面向老板的汇报版');

  return questions.slice(0, 6);
}
