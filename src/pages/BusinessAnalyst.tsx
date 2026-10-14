import { useState } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import StepProgress from '../components/StepProgress';
import AnalysisTimeline from '../components/AnalysisTimeline';
import DiagnosisCard from '../components/DiagnosisCard';
import FollowUpChat from '../components/FollowUpChat';
import ReportPreview from '../components/ReportPreview';
import MetricsPanel from '../components/MetricsPanel';
import { normalizeFeedbackRows, normalizeOperationRows, parseCsv, parseCsvText } from '../utils/csvParser';
import { runBusinessRules, analyzeFeedback } from '../utils/businessRules';
import { generateReport } from '../utils/reportGenerator';
import { detectFields, headersOf } from '../utils/fieldMapper';
import { runPeopleAnalysis, generatePeopleReport } from '../utils/peopleEngine';
import { generatePeopleSample, PEOPLE_SAMPLES, PeopleSampleId } from '../utils/peopleMockData';
import { CanonicalField, Diagnosis, FeedbackRow, FieldMapping, FollowUpMessage, OperationRow, PeopleAnalysis, RuleResult, TaskType, Step } from '../types';

const tasks: { label: TaskType; desc: string }[] = [
  { label: '人效分析', desc: '从工时、产出与成本数据里，看人力投入产出效率与异常' },
  { label: '双11 活动复盘', desc: '分析大促期间的运营表现与异常指标' },
  { label: '会员日活动复盘', desc: '评估会员专属活动的转化与反馈' },
  { label: '新品上线复盘', desc: '诊断新品上线的曝光、点击与转化链路' },
  { label: '渠道效果分析', desc: '对比各渠道效率、质量与 ROI' },
  { label: '自定义分析', desc: '输入你想让 AI 分析的具体问题' },
];

// ── 人效分析（People Efficiency）专用文案，模块级常量保证引用稳定 ──
const PEOPLE_STEP_LABELS = ['选择任务', '分析问题', '上传工时数据', '确认目标', 'AI 扫描', '人效诊断', '继续追问', '分析报告'];
const PEOPLE_SCAN_STEPS = [
  '正在解析工时数据',
  '正在识别字段结构',
  '正在计算人效指标',
  '正在检测超时与异常',
  '正在运行风险规则',
  '正在生成人效诊断',
];
const PEOPLE_QUICK_QUESTIONS = [
  '团队整体人效如何？',
  '哪些人超时最严重？',
  '工作量是否过度集中？',
  '会议沟通占比是否偏高？',
  '谁的单位产出最慢？',
  '请帮我生成面向老板汇报的版本',
];

/** 字段识别结果的中文标签，按重要性排序 */
const FIELD_LABELS: { field: CanonicalField; label: string }[] = [
  { field: 'employee', label: '人员' },
  { field: 'department', label: '部门' },
  { field: 'category', label: '工作类别' },
  { field: 'date', label: '时间' },
  { field: 'hours', label: '工时' },
  { field: 'standardHours', label: '标准工时' },
  { field: 'overtimeFlag', label: '超时标注' },
  { field: 'outputQuantity', label: '产出数量' },
  { field: 'outputAmount', label: '产出金额' },
  { field: 'compensation', label: '薪资/成本' },
];

const customExamples = [
  '为什么本次活动转化率下降？',
  '哪个渠道质量最低？',
  '用户反馈中最大的问题是什么？',
];

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// ── 人效分析的追问回答：全部从已算出的指标/规则里取数，不凭空生成 ──
const metricOf = (a: PeopleAnalysis, moduleId: string, key: string) =>
  a.modules.find(m => m.moduleId === moduleId)?.metrics.find(x => x.key === key);

function answerPeople(q: string, a: PeopleAnalysis): string {
  const detail = (ids: string[]) => {
    const hit = a.rules.filter(r => ids.includes(r.ruleId));
    if (!hit.length) return '';
    return hit.map(r =>
      `**${r.ruleName}**\n${r.evidence.map(e => `· ${e}`).join('\n')}\n\n${r.conclusion}\n\n建议：${r.suggestion}`,
    ).join('\n\n');
  };
  const pass = metricOf(a, 'efficiency', 'passRate');
  const rate = metricOf(a, 'efficiency', 'rate');
  const meet = metricOf(a, 'risk', 'meetingShare');

  if (q.includes('超时')) {
    return detail(['PE03', 'PE04'])
      || `本次未发现个体超时率异常。整体超时率 ${metricOf(a, 'efficiency', 'overtimeRate')?.formatted ?? '—'}，处于合理水平。`;
  }
  if (q.includes('集中') || q.includes('均衡') || q.includes('分配') || q.includes('工作量')) {
    return detail(['PE02', 'PE07'])
      || `本次未触发工作量集中的告警：前 3 名工时占比 ${metricOf(a, 'risk', 'hoursTop3')?.formatted ?? '—'}，分配相对均衡。`;
  }
  if (q.includes('会议') || q.includes('沟通')) {
    return detail(['PE08'])
      || `本次未触发事务性工作占比告警：会议与沟通类工时占比 ${meet?.formatted ?? '—'}，属于正常范围。`;
  }
  if (q.includes('最慢') || q.includes('效率最低') || q.includes('产出')) {
    return detail(['PE01', 'PE05', 'PE06'])
      || `本次未触发产出效率告警。团队工作项产出率为 ${rate?.formatted ?? '—'} 项/小时。`;
  }
  if (q.includes('人效') || q.includes('整体') || q.includes('怎么样')) {
    return `${a.summary}\n\n当前口径为「${a.efficiency.name} = ${a.efficiency.formula}」。${a.efficiency.reason}`;
  }
  if (q.includes('老板') || q.includes('汇报')) {
    const top = a.rules.filter(r => r.ruleId !== 'PE09').slice(0, 3);
    return `## 人效分析摘要\n\n**数据规模**：${a.rowCount.toLocaleString()} 条记录 / ${a.employeeCount} 人\n**人效口径**：${a.efficiency.name}（${a.efficiency.formula}）\n**主指标**：标准工时达标率 ${pass?.formatted ?? '—'}\n**副指标**：工作项产出率 ${rate?.formatted ?? '—'} 项/小时\n\n**核心发现**：\n${top.map((r, i) => `${i + 1}. ${r.ruleName}——${r.evidence[0] ?? ''}`).join('\n')}\n\n**建议动作**：\n${top.map((r, i) => `${i + 1}. ${r.suggestion.split('\n')[0].replace(/^\d+）/, '')}`).join('\n')}\n\n> 以上结论来自本地规则引擎，每一条都能追溯到上方列出的原始数字。`;
  }
  const first = a.rules.find(r => r.ruleId !== 'PE09');
  return first
    ? `基于当前数据，最值得先看的是：${first.ruleName}。${first.conclusion}\n\n命中的规则有：${a.rules.map(r => r.ruleId).join('、')}。你可以追问「超时」「工作量集中」「会议占比」「谁产出最慢」等具体维度。`
    : `当前数据没有命中任何异常规则，团队各项人效指标都在合理区间。可以追问具体维度做进一步下钻。`;
}

// 根据业务规则 + 用户反馈数据，构建带证据分级的原因分析
function buildDiagnoses(rules: RuleResult[], feedbacks: FeedbackRow[]): Diagnosis[] {
  const fb = analyzeFeedback(feedbacks);
  const impactMap: Record<string, string> = {
    R01: '曝光量、点击量、渠道流量',
    R02: '曝光量、点击率、转化率',
    R03: '点击率、转化率、下单量',
    R04: '曝光量、转化率、GMV',
    R05: 'GMV、下单量、客单价',
    R06: 'GMV、客单价、下单量',
    R07: '退款率、用户信任、复购率',
    R08: '转化率、下单量、GMV',
    R09: '用户信任、复购意愿、NPS',
    R10: '转化率、用户满意度、下单意愿',
    R11: '综合指标（见自定义分析）',
  };

  const reasonMap: Record<string, { data: string[]; verify: string[] }> = {
    R01: {
      data: [],
      verify: [
        '投放预算是否在活动后期缩减或消耗完毕',
        '入口素材是否被平台降权或出现老化衰减',
        '竞品是否同期加大了同渠道投放力度',
      ],
    },
    R02: {
      data: [],
      verify: [
        '新增曝光的人群定向是否精准，是否触达了目标用户',
        '活动入口素材（banner/标题/封面）是否与渠道调性匹配',
        '落地页首屏是否在前2秒展示了核心利益点',
      ],
    },
    R03: {
      data: [
        ...(fb.couponRatio > 0.16 ? [`用户反馈中优惠券相关占比 ${pct(fb.couponRatio)}，优惠机制影响下单决策`] : []),
        ...(fb.rulesRatio > 0.12 ? [`用户反馈中活动规则相关占比 ${pct(fb.rulesRatio)}，理解成本抑制购买意愿`] : []),
      ],
      verify: [
        '商品详情页关键信息（到手价/库存/评价）是否完整可见',
        '优惠券是否大面积失效或使用门槛超出主力客单价',
        '竞品同期是否有更具吸引力的促销活动',
      ],
    },
    R04: {
      data: [
        ...(fb.couponRatio > 0.16 ? [`用户反馈中优惠券相关占比 ${pct(fb.couponRatio)}，优惠机制可能是转化下降的重要原因`] : []),
        ...(fb.rulesRatio > 0.12 ? [`用户反馈中活动规则相关占比 ${pct(fb.rulesRatio)}，理解成本高可能导致浏览后放弃`] : []),
      ],
      verify: [
        '活动落地页→加购→下单的转化漏斗中，具体流失环节在哪',
        '不同渠道的落地页转化是否存在显著差异',
        '活动页核心利益点（优惠/爆款/限时）在首屏的展示效果',
      ],
    },
    R05: {
      data: [
        ...(fb.couponRatio > 0.16 ? [`用户反馈中优惠券相关占比 ${pct(fb.couponRatio)}，优惠问题可能是抑制下单的关键因素`] : []),
      ],
      verify: [
        '按渠道拆分订单量变化，定位订单流失最严重的渠道',
        '已加购未下单用户是否存在共性特征（商品类型/价格区间/时段）',
        '竞品同期是否有大型促销分流',
      ],
    },
    R06: {
      data: [
        ...(fb.couponRatio > 0.16 ? [`用户反馈中优惠券相关占比 ${pct(fb.couponRatio)}，高价值商品可能因优惠门槛不足而流失用户`] : []),
      ],
      verify: [
        '客单价 Top 20% 商品的详情页、优惠标签和库存状态',
        '高价值商品的用户评价是否存在集中的负面反馈',
        '高价商品是否缺少分期免息/大额满减等降低决策门槛的权益',
      ],
    },
    R07: {
      data: [
        ...(fb.logisticsRatio > 0.14 ? [`用户反馈中物流相关占比 ${pct(fb.logisticsRatio)}，物流延迟或体验差可能是退款增加的重要推手`] : []),
      ],
      verify: [
        '导出退款订单明细，按原因分类统计 Top 3 退款原因',
        '退款率最高的商品是否存在描述与实际不符的问题',
        '高退款率渠道的订单履约链路是否存在系统性问题',
      ],
    },
    R08: {
      data: [
        `用户反馈中优惠券相关占比 ${pct(fb.couponRatio)}，超过16%预警线`,
        `高频关键词覆盖失效、门槛、不叠加等问题类型`,
      ],
      verify: [
        '失效优惠券是否已下架或延期',
        '优惠券使用门槛是否超出主力客单价区间',
        '结算页是否清晰展示了可用优惠和到手价',
      ],
    },
    R09: {
      data: [
        `用户反馈中物流相关占比 ${pct(fb.logisticsRatio)}，超过14%预警线`,
      ],
      verify: [
        '延迟订单是否已触发主动通知和补偿机制',
        '物流合作方在大促期间的运力是否充足',
        '预计送达时间是否在用户下单前明确展示',
      ],
    },
    R10: {
      data: [
        `用户反馈中活动规则相关占比 ${pct(fb.rulesRatio)}，超过12%预警线`,
      ],
      verify: [
        '活动规则是否可以简化为三步以内完成理解',
        '商品详情页和购物车是否实时展示了到手价',
        '复杂玩法（满减叠加/跨店）是否提供了最优推荐',
      ],
    },
    R11: {
      data: [],
      verify: [
        '自定义分析结果基于当前数据维度和规则引擎',
        '如需更深度的分析，建议补充更多维度的数据（商品粒度/用户分群/时间序列）',
      ],
    },
  };

  return rules.map((r, i) => {
    const reasons = reasonMap[r.ruleId] || { data: [], verify: ['建议围绕该指标下钻分析，定位具体原因'] };
    return {
      title: r.ruleName,
      impactMetric: impactMap[r.ruleId] || '综合运营指标',
      businessJudgment: r.conclusion,
      dataSupportedReasons: reasons.data,
      needsVerificationReasons: reasons.verify,
      confidence: Math.max(60, 93 - i * 3),
      rules: [r],
    };
  });
}

export default function BusinessAnalyst({ onHome }: { onHome: () => void }) {
  // ── Core flow state ──
  const [step, setStep] = useState<Step>(1);
  const [task, setTask] = useState<TaskType>('人效分析');
  const [customQuestion, setCustomQuestion] = useState('');
  const isPeople = task === '人效分析';

  // ── Data state ──
  const [ops, setOps] = useState<OperationRow[]>([]);
  const [fbs, setFbs] = useState<FeedbackRow[]>([]);
  const [opFile, setOpFile] = useState('');
  const [fbFile, setFbFile] = useState('');

  // ── Analysis state (仅由「开始智能诊断」触发) ──
  const [rules, setRules] = useState<RuleResult[]>([]);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  // ── Follow-up state (独立于主分析流程) ──
  const [followUpMessages, setFollowUpMessages] = useState<FollowUpMessage[]>([]);
  const [isFollowUpLoading, setIsFollowUpLoading] = useState(false);

  // ── Report state (仅由「生成报告」按钮触发) ──
  const [report, setReport] = useState('');

  // ── 人效分析（People Efficiency）状态 ──
  const [peopleRows, setPeopleRows] = useState<Record<string, string>[]>([]);
  const [peopleHeaders, setPeopleHeaders] = useState<string[]>([]);
  const [peopleFile, setPeopleFile] = useState('');
  const [peopleMapping, setPeopleMapping] = useState<FieldMapping | null>(null);
  const [peopleResult, setPeopleResult] = useState<PeopleAnalysis | null>(null);

  // ═══════════════════════════════════════════
  // 文件上传
  // ═══════════════════════════════════════════
  const uploadOps = async (file: File) => {
    setOpFile(file.name);
    setOps(normalizeOperationRows(await parseCsv<Record<string, unknown>>(file)));
  };
  const uploadFbs = async (file: File) => {
    setFbFile(file.name);
    setFbs(normalizeFeedbackRows(await parseCsv<Record<string, unknown>>(file)));
  };

  // 人效数据：解析 + 立即做一次字段识别，让用户在上传后就能看到"AI 认出了哪些列"
  const loadPeopleCsv = (text: string, name: string) => {
    const parsed = parseCsvText<Record<string, string>>(text);
    const hdrs = headersOf(parsed);
    setPeopleFile(name);
    setPeopleRows(parsed);
    setPeopleHeaders(hdrs);
    setPeopleMapping(hdrs.length ? detectFields(hdrs, parsed.slice(0, 60)) : null);
  };

  const uploadPeople = async (file: File) => loadPeopleCsv(await file.text(), file.name);

  // 一键试用示例数据：面试官/访客不需要先下载任何文件
  const usePeopleSample = (id: PeopleSampleId) =>
    loadPeopleCsv(generatePeopleSample(id), `示例_${PEOPLE_SAMPLES.find(s => s.id === id)?.label ?? id}.csv`);

  // ═══════════════════════════════════════════
  // 主分析流程 — 仅由「开始智能诊断」按钮触发
  // ═══════════════════════════════════════════
  const startScan = () => {
    setIsScanning(true);
    setStep(5);

    if (isPeople) {
      // 人效分析走独立的 Skill：字段识别 → 指标计算 → 规则诊断
      const pa = runPeopleAnalysis({ rows: peopleRows, headers: peopleHeaders });
      setPeopleResult(pa);
      setRules(pa?.rules ?? []);
      setDiagnoses(pa?.diagnoses ?? []);
    } else {
      const customQ = task === '自定义分析' ? customQuestion : undefined;
      const ruleResults = runBusinessRules(ops, fbs, customQ);
      setPeopleResult(null);
      setRules(ruleResults);
      setDiagnoses(buildDiagnoses(ruleResults, fbs));
    }

    setTimeout(() => {
      setIsScanning(false);
      setStep(6);
    }, 2800);
  };

  // ═══════════════════════════════════════════
  // 追问流程 — 独立于主分析，不改变 step，不重新扫描
  // ═══════════════════════════════════════════
  const handleFollowUpQuestion = (question: string) => {
    if (!question.trim()) return;
    setIsFollowUpLoading(true);

    // 模拟 AI 追问分析（1.5-2.5s 延迟）
    setTimeout(() => {
      // 人效分析走自己的回答分支，618 那套关键词逻辑原样保留
      if (isPeople && peopleResult) {
        setFollowUpMessages(prev => [...prev, { question, answer: answerPeople(question, peopleResult) }]);
        setIsFollowUpLoading(false);
        return;
      }
      const joined = rules.map((r) => r.ruleName).join('、');
      const topDiag = diagnoses[0];
      const topIssue = topDiag?.title || '数据异常';
      const topJudgment = topDiag?.businessJudgment || '需进一步分析';

      let answer = '';
      if (question.includes('渠道'))
        answer = `基于当前诊断结果，建议对各渠道进行分层分析。${topIssue}是当前最显著的问题。${topJudgment}建议对高曝光低转化渠道优先复核人群定向质量、素材匹配度和落地页一致性。`;
      else if (question.includes('哪天') || question.includes('什么时候'))
        answer = `从数据趋势来看，转化率下降在活动中后期开始集中出现。规则引擎识别到${topIssue}，该问题与活动后期的流量结构和用户行为变化高度相关。建议按日期维度拆分转化率曲线，精确定位拐点。`;
      else if (question.includes('不满意') || question.includes('反馈'))
        answer = `用户反馈集中在优惠券、物流和活动规则三个方向。当前命中的业务规则包括：${joined}。${topJudgment}建议优先处理反馈占比最高的类别。`;
      else if (question.includes('购买') || question.includes('影响'))
        answer = `最影响用户购买决策的因素与${topIssue}密切相关。${topJudgment}建议围绕该方向深入分析，关联用户反馈中的高频关键词做交叉验证。`;
      else if (question.includes('老板') || question.includes('汇报'))
        answer = `## 活动复盘摘要\n\n**核心发现**：${topIssue}\n**业务判断**：${topJudgment}\n**影响指标**：${topDiag?.impactMetric || '待确认'}\n**置信度**：${topDiag?.confidence || 85}%\n\n**建议动作**：\n${rules.slice(0, 3).map((r, i) => `${i + 1}. ${r.suggestion.split('\n')[0]}`).join('\n')}\n\n以上结论由 AI Business Analyst 基于业务规则引擎自动生成。`;
      else if (question.includes('优先') || question.includes('下周'))
        answer = `基于当前诊断结果，下周建议优先处理：${topIssue}。${topJudgment}具体优先级排序：1）先解决数据已有支撑的问题；2）对需验证项逐一排查确认；3）建立活动期间每日异常监控看板。`;
      else
        answer = `基于当前诊断结果，建议优先关注：${topIssue}。${topJudgment}命中的业务规则包括：${joined}。如需更深入的分析，可以追问具体维度（渠道/商品/用户群/时间）。`;

      setFollowUpMessages(prev => [...prev, { question, answer }]);
      setIsFollowUpLoading(false);
    }, 1500 + Math.random() * 1000);
  };

  // ═══════════════════════════════════════════
  // 报告生成 — 仅由「生成报告」按钮触发
  // ═══════════════════════════════════════════
  const handleGenerateReport = () => {
    setReport(isPeople && peopleResult ? generatePeopleReport(peopleResult) : generateReport(task, ops, rules));
    setStep(8);
  };

  // ═══════════════════════════════════════════
  // 返回操作 — 清空分析结果
  // ═══════════════════════════════════════════
  const goBackFromConfirm = () => {
    setRules([]);
    setDiagnoses([]);
    setPeopleResult(null);
    setReport('');
    setFollowUpMessages([]);
    setStep(3);
  };

  const goBackFromUpload = () => {
    setRules([]);
    setDiagnoses([]);
    setPeopleResult(null);
    setReport('');
    setFollowUpMessages([]);
    setStep(task === '自定义分析' ? 2 : 1);
  };

  const goNext = () => {
    if (step === 1) {
      if (task === '自定义分析') setStep(2);
      else setStep(3);
    } else if (step === 2) {
      if (customQuestion.trim()) setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  };

  const canNext = () => {
    if (step === 1) return true;
    if (step === 2) return customQuestion.trim().length > 0;
    // 人效分析只需要一份数据表，不再要求"运营数据 + 用户反馈"两份
    if (step === 3) return isPeople ? peopleRows.length > 0 : (ops.length > 0 && fbs.length > 0);
    return false;
  };

  // ═══════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════
  return (
    <main className="min-h-screen bg-[#FAFAFA] px-4 py-5 md:px-6 md:py-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 border border-[#E5E5E5]">
          <div>
            <button onClick={onHome} className="inline-flex items-center gap-1 text-sm font-semibold text-[#111111] hover:text-[#666666] transition-colors">
              <ArrowLeft size={16} /> 返回员工中心
            </button>
            <h1 className="mt-1.5 text-xl font-bold text-[#111111]">AI Business Analyst 工作台</h1>
            <p className="text-xs text-[#666666] mt-0.5">本地 CSV 解析 · 业务规则引擎 · 智能诊断</p>
          </div>
          <span className="rounded-full bg-[#F5F5F5] px-4 py-2 text-sm font-semibold text-[#111111] border border-[#E5E5E5]">
            <span className="inline-block h-2 w-2 rounded-full bg-[#F5F5F5]0 animate-pulse mr-1.5" />
            已开放
          </span>
        </div>

        {/* Step progress */}
        <div className="mt-5 rounded-2xl bg-white px-5 py-4 border border-[#E5E5E5] overflow-x-auto">
          <StepProgress current={step} labels={isPeople ? PEOPLE_STEP_LABELS : undefined} />
        </div>

        {/* ===== State 1: Select task ===== */}
        {step === 1 && (
          <section className="mt-5 rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
            <h2 className="text-lg font-bold text-[#111111]">选择分析任务</h2>
            <p className="mt-1 text-sm text-[#666666]">支持人效分析与多种活动复盘场景，请选择你需要的分析类型</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tasks.map((t) => (
                <button
                  key={t.label}
                  onClick={() => setTask(t.label)}
                  className={`rounded-2xl border-2 p-4 text-left transition-all ${
                    task === t.label
                      ? 'border-[#111111] bg-[#F5F5F5]'
                      : 'border-[#E5E5E5] bg-white hover:border-[#111111]'
                  }`}
                >
                  <div className="font-semibold text-[#111111]">{t.label}</div>
                  <div className="mt-1 text-xs text-[#666666]">{t.desc}</div>
                </button>
              ))}
            </div>
            <button
              onClick={goNext}
              className="mt-8 rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#333333]"
            >
              下一步：{task === '自定义分析' ? '填写分析问题' : '上传数据'}
            </button>
          </section>
        )}

        {/* ===== State 2: Custom question ===== */}
        {step === 2 && (
          <section className="mt-5 rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
            <h2 className="text-lg font-bold text-[#111111]">自定义分析问题</h2>
            <p className="mt-1 text-sm text-[#666666]">请输入你希望 AI 分析的具体问题，越具体诊断越精准</p>
            <div className="mt-5">
              <textarea
                value={customQuestion}
                onChange={(e) => setCustomQuestion(e.target.value)}
                placeholder="例如：为什么本次活动转化率下降？"
                rows={3}
                className="w-full rounded-xl border border-[#E5E5E5] px-4 py-3 text-sm outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#E5E5E5] resize-none"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {customExamples.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setCustomQuestion(ex)}
                    className="rounded-lg border border-[#E5E5E5] bg-[#F5F5F5] px-3 py-1.5 text-xs text-[#666666] hover:border-[#111111] hover:text-[#111111] transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-8 flex gap-3">
              <button onClick={() => setStep(1)} className="rounded-xl border border-[#E5E5E5] px-5 py-3 text-sm font-semibold text-[#666666] hover:bg-[#F5F5F5]">
                返回修改任务
              </button>
              <button
                onClick={goNext}
                disabled={!canNext()}
                className="rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white disabled:bg-[#E5E5E5] transition-all hover:bg-[#333333]"
              >
                下一步：上传数据
              </button>
            </div>
          </section>
        )}

        {/* ===== State 3: Upload data ===== */}
        {step === 3 && (
          <section className="mt-5 rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
            <h2 className="text-lg font-bold text-[#111111]">上传数据</h2>
            {isPeople ? (
              <>
                <p className="mt-1 text-sm text-[#666666]">
                  上传一份包含<b>人员、工时、产出或成本</b>的 CSV。列名不用改，AI 会自动识别字段语义。
                  <span className="text-[#999999]">文件在浏览器本地解析，不会上传到任何服务器。</span>
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <FileUpload label="上传人效数据 CSV" onFile={uploadPeople} fileName={peopleFile} />
                  <div className="rounded-2xl border border-dashed border-[#E5E5E5] bg-[#FAFAFA] p-5">
                    <p className="text-sm font-semibold text-[#111111]">没有现成数据？</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#666666]">
                      用一份虚构样例试跑全流程，不需要下载任何文件
                    </p>
                    <div className="mt-3 space-y-2">
                      {PEOPLE_SAMPLES.map(s => (
                        <button
                          key={s.id}
                          onClick={() => usePeopleSample(s.id)}
                          className="flex w-full items-start gap-2 rounded-lg border border-[#111111] bg-white px-3.5 py-2.5 text-left hover:bg-[#F5F5F5] transition-colors"
                        >
                          <Sparkles size={13} className="mt-0.5 shrink-0 text-[#111111]" />
                          <span>
                            <span className="block text-xs font-semibold text-[#111111]">{s.label}</span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-[#666666]">
                              {s.desc.replace(/\*\*/g, '')}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 字段识别结果：把"AI 认出了什么"直接摆出来，含没认出的 */}
                {peopleMapping && (
                  <div className="mt-5 rounded-2xl bg-[#F5F5F5] p-5">
                    <p className="text-xs font-semibold text-[#111111]">
                      已识别 {Object.values(peopleMapping.mapping).filter(Boolean).length} 个字段 · 共 {peopleHeaders.length} 列
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {FIELD_LABELS.map(({ field, label }) => {
                        const col = peopleMapping.mapping[field];
                        return (
                          <span
                            key={field}
                            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-mono ${
                              col ? 'bg-[#111111] text-white' : 'bg-white text-[#999999] border border-[#E5E5E5]'
                            }`}
                          >
                            {label} ← {col ?? '未识别'}
                          </span>
                        );
                      })}
                    </div>
                    {peopleMapping.unusedColumns.length > 0 && (
                      <p className="mt-2.5 text-[11px] text-[#999999]">
                        未使用列：{peopleMapping.unusedColumns.join('、')}
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-[#666666]">请上传运营数据与用户反馈 CSV 文件（支持从数据集导出）</p>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <FileUpload label="上传运营数据 CSV" onFile={uploadOps} fileName={opFile} />
                  <FileUpload label="上传用户反馈 CSV" onFile={uploadFbs} fileName={fbFile} />
                </div>
              </>
            )}
            <div className="mt-8 flex gap-3">
              <button onClick={goBackFromUpload} className="rounded-xl border border-[#E5E5E5] px-5 py-3 text-sm font-semibold text-[#666666] hover:bg-[#F5F5F5]">
                返回上一步
              </button>
              <button
                onClick={goNext}
                disabled={!canNext()}
                className="rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white disabled:bg-[#E5E5E5] transition-all hover:bg-[#333333]"
              >
                下一步：确认分析目标
              </button>
            </div>
          </section>
        )}

        {/* ===== State 4: Confirm ===== */}
        {step === 4 && (
          <section className="mt-5 rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
            <h2 className="text-lg font-bold text-[#111111]">确认分析目标</h2>
            <p className="mt-1 text-sm text-[#666666]">请确认以下信息，然后开始智能诊断</p>
            <div className="mt-5 space-y-3 rounded-xl bg-[#F5F5F5] p-5">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-[#666666] w-24 shrink-0">任务类型</span>
                <span className="font-semibold text-[#111111]">{task}</span>
              </div>
              {customQuestion && (
                <div className="flex items-start gap-3 text-sm">
                  <span className="text-[#666666] w-24 shrink-0">分析问题</span>
                  <span className="font-semibold text-[#111111]">{customQuestion}</span>
                </div>
              )}
              {isPeople ? (
                <>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-[#666666] w-24 shrink-0">数据文件</span>
                    <span className={peopleFile ? 'font-semibold text-[#111111]' : 'text-[#999999]'}>
                      {peopleFile ? `✅ ${peopleFile}` : '⏳ 未上传'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-[#666666] w-24 shrink-0">数据规模</span>
                    <span className="font-semibold text-[#111111]">
                      {peopleRows.length.toLocaleString()} 条记录 · {peopleHeaders.length} 列
                    </span>
                  </div>
                  {peopleMapping && (
                    <>
                      <div className="flex items-start gap-3 text-sm">
                        <span className="text-[#666666] w-24 shrink-0">识别到的字段</span>
                        <span className="font-semibold text-[#111111]">
                          {Object.entries(peopleMapping.mapping)
                            .filter(([, v]) => v)
                            .map(([k, v]) => `${k}=${v}`)
                            .join('、') || '无'}
                        </span>
                      </div>
                      <div className="flex items-start gap-3 text-sm">
                        <span className="text-[#666666] w-24 shrink-0">缺失的维度</span>
                        <span className="text-[#999999]">
                          {peopleMapping.unresolved.length
                            ? `${peopleMapping.unresolved.join('、')}——对应分析模块将被跳过`
                            : '无，所有维度齐备'}
                        </span>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-[#666666] w-24 shrink-0">运营数据</span>
                    <span className={opFile ? 'font-semibold text-[#111111]' : 'text-[#999999]'}>
                      {opFile ? `✅ ${opFile}` : '⏳ 未上传'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-[#666666] w-24 shrink-0">用户反馈</span>
                    <span className={fbFile ? 'font-semibold text-[#111111]' : 'text-[#999999]'}>
                      {fbFile ? `✅ ${fbFile}` : '⏳ 未上传'}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="mt-8 flex gap-3">
              <button onClick={goBackFromConfirm} className="rounded-xl border border-[#E5E5E5] px-5 py-3 text-sm font-semibold text-[#666666] hover:bg-[#F5F5F5]">
                返回修改
              </button>
              <button
                onClick={startScan}
                className="rounded-xl bg-[#111111] px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-[#333333] hover:bg-[#333333]"
              >
                开始智能诊断
              </button>
            </div>
          </section>
        )}

        {/* ===== State 5: Scanning ===== */}
        {step === 5 && isScanning && (
          <div className="mt-5">
            <AnalysisTimeline
              steps={isPeople ? PEOPLE_SCAN_STEPS : undefined}
              agentName={isPeople ? 'AI Business Analyst · 人效分析' : undefined}
            />
          </div>
        )}

        {/* ===== State 6: Results ===== */}
        {step === 6 && (
          <section className="mt-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#111111]">诊断结果</h2>
              <button
                onClick={() => setStep(7)}
                className="rounded-xl bg-[#111111] px-5 py-3 text-sm font-semibold text-white hover:bg-[#333333] transition-colors"
              >
                继续追问
              </button>
            </div>

            {/* 人效分析先给指标总览，再给诊断卡 */}
            {isPeople && peopleResult && (
              <div className="mb-5">
                <MetricsPanel analysis={peopleResult} />
              </div>
            )}

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {diagnoses.map((d) => (
                <DiagnosisCard key={d.title} d={d} />
              ))}
            </div>
          </section>
        )}

        {/* ===== State 7: Follow-up ===== */}
        {step === 7 && (
          <section className="mt-5 space-y-5">
            <FollowUpChat
              task={task}
              diagnoses={diagnoses}
              messages={followUpMessages}
              isLoading={isFollowUpLoading}
              onAsk={handleFollowUpQuestion}
              quickQuestions={isPeople ? PEOPLE_QUICK_QUESTIONS : undefined}
              agentName={isPeople ? 'AI Business Analyst · 人效分析' : undefined}
            />
            <button
              onClick={handleGenerateReport}
              className="rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white hover:bg-[#333333] transition-colors"
            >
              {isPeople ? '生成人效分析报告' : '生成活动复盘报告'}
            </button>
          </section>
        )}

        {/* ===== State 8: Report ===== */}
        {step === 8 && (
          <div className="mt-5">
            <ReportPreview
              report={report}
              task={task}
              onBack={() => setStep(7)}
              titleSuffix={isPeople ? '分析报告' : undefined}
            />
          </div>
        )}
      </div>
    </main>
  );
}
