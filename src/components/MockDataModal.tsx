import { useState } from 'react';
import { X, Download, RefreshCw, Trash2, ChevronDown, ChevronUp, Shuffle, ArrowLeft, Info } from 'lucide-react';
import {
  MockConfig,
  generateFunnelCSV,
  generateOpsCSV,
  generateFeedbackCSV,
  parseCsvToRows,
  downloadCSV,
} from '../utils/mockDataGenerator';

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (opsCSV: string, funnelCSV: string, fbCSV: string, config: MockConfig) => void;
  scene: string;
  goal: string;
  onBackToScene: () => void;
}

const problemOptions = [
  { value: '曝光到点击异常', label: '曝光到点击异常' },
  { value: '详情页到加购异常', label: '详情页到加购异常' },
  { value: '加购到提交订单异常', label: '加购到提交订单异常' },
  { value: '提交订单到支付异常', label: '提交订单到支付异常' },
  { value: '多环节复合问题', label: '多环节复合问题' },
  { value: '自定义问题', label: '自定义问题…' },
];

const severityOptions = ['轻度', '中度', '严重', '临界/有争议'] as const;
const trendOptions = ['上升', '下降', '波动', '稳定'] as const;
const periodOptions = [7, 14, 30];

// ── Random preset scenarios (internally consistent) ──
const RANDOM_SCENARIOS = [
  { problem: '加购到提交订单异常', severity: '严重' as const, period: 7, trend: '下降' as const, includeFeedback: true, isCompound: false, desc: '活动期间流量充足，加购率正常但下单率骤降，优惠券使用门槛过高和满减规则复杂导致用户放弃下单。' },
  { problem: '提交订单到支付异常', severity: '中度' as const, period: 14, trend: '下降' as const, includeFeedback: true, isCompound: false, desc: '订单提交量保持稳定，但支付完成率持续下降，同时物流时效相关负面反馈增加，用户在支付前犹豫。' },
  { problem: '详情页到加购异常', severity: '轻度' as const, period: 14, trend: '稳定' as const, includeFeedback: true, isCompound: false, desc: '新品曝光量充足，用户点击进入详情页后加购意愿偏弱，怀疑商品描述不够突出核心卖点。' },
  { problem: '曝光到点击异常', severity: '中度' as const, period: 30, trend: '下降' as const, includeFeedback: false, isCompound: false, desc: '近一个月各渠道点击率出现分化，百度和直投渠道的点击率明显下降，疑似素材老化和人群疲劳。' },
  { problem: '多环节复合问题', severity: '严重' as const, period: 7, trend: '波动' as const, includeFeedback: true, isCompound: true, desc: '大促期间多个转化环节同时恶化，详情页加购率和下单支付率双降，用户反馈中优惠券与支付问题集中爆发。' },
  { problem: '加购到提交订单异常', severity: '中度' as const, period: 14, trend: '波动' as const, includeFeedback: true, isCompound: false, desc: '发放了大量优惠券但核销率低于预期，用户在结算时发现优惠券不可用或已过期，投诉量上升。' },
  { problem: '提交订单到支付异常', severity: '轻度' as const, period: 14, trend: '上升' as const, includeFeedback: true, isCompound: false, desc: '近两周用户反馈中负面情绪占比上升，主要集中在物流时效和商品质量，虽暂未严重冲击转化但需预警。' },
  { problem: '提交订单到支付异常', severity: '临界/有争议' as const, period: 7, trend: '稳定' as const, includeFeedback: true, isCompound: false, desc: '支付环节转化率接近阈值边界，部分渠道支付成功率正常但部分渠道明显偏低，需确认是系统问题还是用户犹豫。' },
  { problem: '加购到提交订单异常', severity: '中度' as const, period: 14, trend: '下降' as const, includeFeedback: false, isCompound: false, desc: '新品加购后下单转化率低于老品，用户可能在比价或等待降价，需要分析加购后行为路径。' },
  { problem: '多环节复合问题', severity: '中度' as const, period: 30, trend: '下降' as const, includeFeedback: true, isCompound: true, desc: '商城整体转化漏斗效率逐月下降，多个环节出现轻微恶化，需系统性排查而非单点修复。' },
];

export default function MockDataModal({ open, onClose, onApply, scene, goal, onBackToScene }: Props) {
  const [problem, setProblem] = useState('加购到提交订单异常');
  const [severity, setSeverity] = useState<MockConfig['severity']>('中度');
  const [trend, setTrend] = useState<MockConfig['trend']>('稳定');
  const [includeFeedback, setIncludeFeedback] = useState(true);
  const [isCompound, setIsCompound] = useState(false);
  const [period, setPeriod] = useState(7);
  const [customPeriod, setCustomPeriod] = useState('');
  const [description, setDescription] = useState('');
  const [customProblem, setCustomProblem] = useState('');
  const [generated, setGenerated] = useState<{
    ops: string;
    funnel: string;
    fb: string;
    config: MockConfig;
  } | null>(null);
  const [previewTab, setPreviewTab] = useState<'funnel' | 'ops' | 'fb'>('funnel');
  const [previewExpanded, setPreviewExpanded] = useState(true);

  if (!open) return null;

  const effectivePeriod = period === 0 ? parseInt(customPeriod, 10) || 7 : period;

  const handleRandomFill = () => {
    const s = RANDOM_SCENARIOS[Math.floor(Math.random() * RANDOM_SCENARIOS.length)];
    setProblem(s.problem);
    setCustomProblem('');
    setSeverity(s.severity);
    setTrend(s.trend);
    setIncludeFeedback(s.includeFeedback);
    setIsCompound(s.isCompound);
    setPeriod(s.period);
    setCustomPeriod('');
    setDescription(s.desc);
  };

  const handleGenerate = () => {
    const effectiveProblem = problem === '自定义问题' ? (customProblem.trim() || '加购到提交订单异常') : problem;
    const config: MockConfig = {
      scene,
      goal,
      currentRate: '',
      targetRate: '',
      problem: effectiveProblem,
      severity,
      period: effectivePeriod,
      trend,
      includeFeedback,
      isCompound,
      description,
    };
    const ops = generateOpsCSV(config);
    const funnel = generateFunnelCSV(config);
    const fb = generateFeedbackCSV(config);
    setGenerated({ ops, funnel, fb, config });
    setPreviewExpanded(true);
  };

  const handleApply = () => {
    if (generated) {
      onApply(generated.ops, generated.funnel, generated.fb, generated.config);
      onClose();
    }
  };

  const handleClose = () => {
    setGenerated(null);
    onClose();
  };

  const previewData = generated
    ? { funnel: generated.funnel, ops: generated.ops, fb: generated.fb }
    : { funnel: '', ops: '', fb: '' };

  const previewRows = parseCsvToRows(previewData[previewTab]).slice(0, 6);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl border border-[#E5E5E5] w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 shadow-[0_2px_16px_rgba(0,0,0,0.08)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E5E5] sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-base font-bold text-[#111111]">
              {generated ? '模拟数据已生成' : '自定义生成模拟数据'}
            </h2>
            <p className="text-xs text-[#999999] mt-0.5">
              {generated ? '请检查数据预览，确认后应用到诊断流程' : '配置模拟条件，系统将生成一致的示例数据'}
            </p>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-[#F5F5F5]">
            <X size={18} className="text-[#999999]" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {!generated ? (
            <>
              {/* Inherited scene + goal (read-only) */}
              <div className="rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#111111]">当前业务场景</p>
                  <button
                    onClick={onBackToScene}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#666666] hover:text-[#111111] transition-colors"
                  >
                    <ArrowLeft size={13} /> 返回修改业务场景
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span className="text-[#999999]">场景类型</span>
                  <span className="text-[#111111] font-medium">{scene}</span>
                  <span className="text-[#999999]">增长目标</span>
                  <span className="text-[#111111] font-medium">{goal}</span>
                </div>
                <div className="flex items-start gap-1.5 rounded-lg bg-white border border-[#E5E5E5] px-3 py-2">
                  <Info size={13} className="text-[#999999] shrink-0 mt-0.5" />
                  <p className="text-[11px] text-[#999999] leading-relaxed">业务场景和增长目标从业务现状页自动继承，如需修改请点击上方按钮返回。</p>
                </div>
              </div>

              {/* Problem */}
              <div>
                <label className="block text-sm font-semibold text-[#111111] mb-1.5">希望模拟的问题</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {problemOptions.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setProblem(p.value)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                        problem === p.value
                          ? 'border-[#111111] bg-[#F5F5F5] font-semibold text-[#111111]'
                          : 'border-[#E5E5E5] bg-white text-[#666666] hover:border-[#D4D4D4]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {problem === '自定义问题' && (
                  <textarea
                    value={customProblem}
                    onChange={(e) => setCustomProblem(e.target.value)}
                    rows={2}
                    placeholder="描述你想模拟的具体问题，例如：用户在加购后频繁放弃下单，优惠券过期提醒不及时，支付环节跳转失败率高…"
                    className="mt-2 w-full rounded-lg border border-[#111111] bg-white px-3 py-2 text-sm text-[#111111] outline-none focus:ring-1 focus:ring-[#E5E5E5] resize-none placeholder:text-[#999999]"
                  />
                )}
              </div>

              {/* Severity */}
              <div>
                <label className="block text-sm font-semibold text-[#111111] mb-1.5">问题严重程度</label>
                <div className="flex gap-2">
                  {severityOptions.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSeverity(s)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                        severity === s
                          ? 'border-[#111111] bg-[#111111] text-white'
                          : 'border-[#E5E5E5] bg-white text-[#666666] hover:border-[#D4D4D4]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Period */}
              <div>
                <label className="block text-sm font-semibold text-[#111111] mb-1.5">数据周期</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {periodOptions.map((p) => (
                    <button
                      key={p}
                      onClick={() => { setPeriod(p); setCustomPeriod(''); }}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                        period === p
                          ? 'border-[#111111] bg-[#111111] text-white'
                          : 'border-[#E5E5E5] bg-white text-[#666666] hover:border-[#D4D4D4]'
                      }`}
                    >
                      {p} 天
                    </button>
                  ))}
                  <button
                    onClick={() => setPeriod(0)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                      period === 0 ? 'border-[#111111] bg-[#111111] text-white' : 'border-[#E5E5E5] bg-white text-[#666666] hover:border-[#D4D4D4]'
                    }`}
                  >
                    自定义
                  </button>
                  {period === 0 && (
                    <input
                      type="number"
                      value={customPeriod}
                      onChange={(e) => setCustomPeriod(e.target.value)}
                      placeholder="天数"
                      min={1}
                      max={90}
                      className="w-20 rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm outline-none focus:border-[#111111]"
                    />
                  )}
                </div>
              </div>

              {/* Trend */}
              <div>
                <label className="block text-sm font-semibold text-[#111111] mb-1.5">趋势变化</label>
                <div className="flex gap-2">
                  {trendOptions.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTrend(t)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                        trend === t
                          ? 'border-[#111111] bg-[#111111] text-white'
                          : 'border-[#E5E5E5] bg-white text-[#666666] hover:border-[#D4D4D4]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles: Feedback + Compound */}
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => setIncludeFeedback(!includeFeedback)}
                  className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${
                    includeFeedback ? 'border-[#111111] bg-[#F5F5F5]' : 'border-[#E5E5E5] bg-white hover:border-[#D4D4D4]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#111111]">包含用户反馈</span>
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${includeFeedback ? 'bg-[#111111] text-white' : 'bg-[#E5E5E5] text-[#999999]'}`}>
                      {includeFeedback ? '✓' : '—'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#999999] mt-1 leading-relaxed">生成用户反馈关键词和情绪数据，用于交叉验证</p>
                </button>
                <button
                  onClick={() => setIsCompound(!isCompound)}
                  className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${
                    isCompound ? 'border-[#111111] bg-[#F5F5F5]' : 'border-[#E5E5E5] bg-white hover:border-[#D4D4D4]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#111111]">复合问题模式</span>
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${isCompound ? 'bg-[#111111] text-white' : 'bg-[#E5E5E5] text-[#999999]'}`}>
                      {isCompound ? '✓' : '—'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#999999] mt-1 leading-relaxed">同时模拟多个漏斗环节异常，诊断更全面</p>
                </button>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-[#111111] mb-1.5">补充描述（可选）</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="例如：曝光上涨、点击率稳定，但加购率和下单率持续下降，同时优惠券不可用相关反馈增加。"
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm text-[#111111] outline-none focus:border-[#111111] focus:ring-1 focus:ring-[#E5E5E5] resize-none placeholder:text-[#999999]"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleRandomFill}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-white px-4 py-3 text-sm font-semibold text-[#666666] hover:border-[#111111] hover:text-[#111111] transition-all"
                >
                  <Shuffle size={15} /> 随机生成一组场景配置
                </button>
                <button
                  onClick={handleGenerate}
                  className="flex-1 rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#333333]"
                >
                  生成模拟数据
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Generated summary */}
              <div className="rounded-xl bg-[#F9F9F9] border border-[#E5E5E5] p-4 space-y-2">
                <p className="text-sm font-semibold text-[#111111]">本次模拟条件</p>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <span className="text-[#999999]">场景</span><span className="text-[#111111] font-medium">{generated.config.scene}</span>
                  <span className="text-[#999999]">目标</span><span className="text-[#111111] font-medium">{generated.config.goal}</span>
                  <span className="text-[#999999]">问题</span><span className="text-[#111111] font-medium">{generated.config.problem}</span>
                  <span className="text-[#999999]">严重程度</span><span className="text-[#111111] font-medium">{generated.config.severity}</span>
                  <span className="text-[#999999]">周期</span><span className="text-[#111111] font-medium">{generated.config.period} 天</span>
                  <span className="text-[#999999]">趋势</span><span className="text-[#111111] font-medium">{generated.config.trend}</span>
                  <span className="text-[#999999]">反馈</span><span className="text-[#111111] font-medium">{generated.config.includeFeedback ? '包含' : '不含'}</span>
                  <span className="text-[#999999]">复合</span><span className="text-[#111111] font-medium">{generated.config.isCompound ? '是' : '否'}</span>
                </div>
                {generated.config.description && (
                  <div className="text-xs">
                    <span className="text-[#999999]">补充描述：</span>
                    <span className="text-[#111111]">{generated.config.description}</span>
                  </div>
                )}
              </div>

              {/* Data description */}
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                模拟数据根据用户设置生成，仅用于产品演示与规则验证。
              </div>

              {/* Preview */}
              <div>
                <button
                  onClick={() => setPreviewExpanded(!previewExpanded)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-[#111111] hover:text-[#666666]"
                >
                  {previewExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  数据预览（前 5 行）
                </button>
                {previewExpanded && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-2">
                      {(['funnel', 'ops', 'fb'] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setPreviewTab(tab)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                            previewTab === tab
                              ? 'bg-[#111111] text-white'
                              : 'bg-[#F5F5F5] text-[#666666] hover:bg-[#E5E5E5]'
                          }`}
                        >
                          {tab === 'funnel' ? '漏斗数据' : tab === 'ops' ? '运营数据' : '用户反馈'}
                        </button>
                      ))}
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-[#E5E5E5]">
                      <table className="w-full text-xs">
                        <tbody>
                          {previewRows.map((row, ri) => (
                            <tr key={ri} className={ri === 0 ? 'bg-[#F5F5F5] font-semibold' : ''}>
                              {row.map((cell, ci) => (
                                <td key={ci} className={`px-2.5 py-1.5 whitespace-nowrap ${ri === 0 ? 'text-[#111111]' : 'text-[#666666]'} ${ri > 0 ? 'border-t border-[#F0F0F0]' : ''}`}>
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => downloadCSV(generated.funnel, '模拟漏斗数据.csv')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E5E5] px-3 py-2 text-xs font-medium text-[#666666] hover:border-[#111111] transition-colors"
                >
                  <Download size={13} /> 下载漏斗 CSV
                </button>
                <button
                  onClick={() => downloadCSV(generated.ops, '模拟运营数据.csv')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E5E5] px-3 py-2 text-xs font-medium text-[#666666] hover:border-[#111111] transition-colors"
                >
                  <Download size={13} /> 下载运营 CSV
                </button>
                <button
                  onClick={() => downloadCSV(generated.fb, '模拟用户反馈.csv')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E5E5] px-3 py-2 text-xs font-medium text-[#666666] hover:border-[#111111] transition-colors"
                >
                  <Download size={13} /> 下载反馈 CSV
                </button>
                <button
                  onClick={handleGenerate}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E5E5] px-3 py-2 text-xs font-medium text-[#666666] hover:border-[#111111] transition-colors"
                >
                  <RefreshCw size={13} /> 重新生成
                </button>
                <button
                  onClick={() => setGenerated(null)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={13} /> 删除
                </button>
              </div>

              <button
                onClick={handleApply}
                className="w-full rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#333333]"
              >
                应用模拟数据到诊断流程
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
