import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import StepProgress from '../components/StepProgress';
import AnalysisTimeline from '../components/AnalysisTimeline';
import DiagnosisCard from '../components/DiagnosisCard';
import FollowUpChat from '../components/FollowUpChat';
import ReportPreview from '../components/ReportPreview';
import { normalizeFeedbackRows, normalizeOperationRows, parseCsv } from '../utils/csvParser';
import { runBusinessRules, analyzeFeedback } from '../utils/businessRules';
import { generateReport } from '../utils/reportGenerator';
import { Diagnosis, FeedbackRow, FollowUpMessage, OperationRow, RuleResult, TaskType, Step } from '../types';

const tasks: { label: TaskType; desc: string }[] = [
  { label: '618 大促复盘', desc: '基于运营数据与用户反馈进行活动复盘' },
  { label: '双11 活动复盘', desc: '分析大促期间的运营表现与异常指标' },
  { label: '会员日活动复盘', desc: '评估会员专属活动的转化与反馈' },
  { label: '新品上线复盘', desc: '诊断新品上线的曝光、点击与转化链路' },
  { label: '渠道效果分析', desc: '对比各渠道效率、质量与 ROI' },
  { label: '自定义分析', desc: '输入你想让 AI 分析的具体问题' },
];

const customExamples = [
  '为什么本次活动转化率下降？',
  '哪个渠道质量最低？',
  '用户反馈中最大的问题是什么？',
];

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

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
  const [task, setTask] = useState<TaskType>('618 大促复盘');
  const [customQuestion, setCustomQuestion] = useState('');

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

  // ═══════════════════════════════════════════
  // 主分析流程 — 仅由「开始智能诊断」按钮触发
  // ═══════════════════════════════════════════
  const startScan = () => {
    setIsScanning(true);
    setStep(5);

    const customQ = task === '自定义分析' ? customQuestion : undefined;
    const ruleResults = runBusinessRules(ops, fbs, customQ);
    const diagResults = buildDiagnoses(ruleResults, fbs);

    setRules(ruleResults);
    setDiagnoses(diagResults);

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
    setReport(generateReport(task, ops, rules));
    setStep(8);
  };

  // ═══════════════════════════════════════════
  // 返回操作 — 清空分析结果
  // ═══════════════════════════════════════════
  const goBackFromConfirm = () => {
    setRules([]);
    setDiagnoses([]);
    setReport('');
    setFollowUpMessages([]);
    setStep(3);
  };

  const goBackFromUpload = () => {
    setRules([]);
    setDiagnoses([]);
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
    if (step === 3) return ops.length > 0 && fbs.length > 0;
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
          <StepProgress current={step} />
        </div>

        {/* ===== State 1: Select task ===== */}
        {step === 1 && (
          <section className="mt-5 rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
            <h2 className="text-lg font-bold text-[#111111]">选择分析任务</h2>
            <p className="mt-1 text-sm text-[#666666]">AI Business Analyst 支持多种活动复盘场景，请选择你需要的分析类型</p>
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
            <p className="mt-1 text-sm text-[#666666]">请上传运营数据与用户反馈 CSV 文件（支持从数据集导出）</p>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <FileUpload label="上传运营数据 CSV" onFile={uploadOps} fileName={opFile} />
              <FileUpload label="上传用户反馈 CSV" onFile={uploadFbs} fileName={fbFile} />
            </div>
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
            <AnalysisTimeline />
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
            />
            <button
              onClick={handleGenerateReport}
              className="rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white hover:bg-[#333333] transition-colors"
            >
              生成活动复盘报告
            </button>
          </section>
        )}

        {/* ===== State 8: Report ===== */}
        {step === 8 && (
          <div className="mt-5">
            <ReportPreview report={report} task={task} onBack={() => setStep(7)} />
          </div>
        )}
      </div>
    </main>
  );
}
