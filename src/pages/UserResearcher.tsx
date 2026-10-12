import { useState, useRef, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Loader2, ChevronDown, ChevronUp, Send, Check, FileText, TrendingUp, Download, Copy, Eye } from 'lucide-react';
import { URTaskType, URStep, URFeedbackRow, InsightResult, FollowUpMessage } from '../types';
import { generateMockFeedback, analyzeFeedback, parseFeedbackCSV, generateInsightAnswer, generateDynamicQuestions } from '../utils/insightEngine';

// ═══════════════════════════════ Constants ═══════════════════════════════

const tasks: { label: URTaskType; desc: string }[] = [
  { label: '用户反馈分析', desc: '分析活动/产品后的用户反馈，提炼核心诉求与痛点' },
  { label: '客服记录分析', desc: '挖掘客服对话中的高频问题与服务瓶颈' },
  { label: '评价情感分析', desc: '对用户评价进行情感倾向识别与关键词提取' },
  { label: '产品体验分析', desc: '从体验反馈中定位产品功能与交互问题' },
  { label: 'NPS调研分析', desc: '分析NPS调研文本，识别推荐者与贬损者的关键差异' },
  { label: '自定义分析', desc: '输入你想让 AI 分析的具体问题，粘贴或上传反馈数据' },
];

const mockScenes = [
  { label: '618 大促用户反馈' },
  { label: '双11 活动反馈' },
  { label: 'App 改版体验反馈' },
  { label: '客服满意度调研' },
  { label: '新品上线用户评价' },
  { label: '会员日专属反馈' },
  { label: 'NPS调研文本' },
  { label: '自定义场景...' },
];

const scanSteps = [
  '正在读取用户反馈文本',
  '正在分词与关键词提取',
  '正在情感倾向识别（含反话/讽刺检测）',
  '正在需求聚类与主题归纳',
  '正在优先级排序与争议标记',
  '正在生成洞察摘要',
];

// ═══════════════════════════════ Component ═══════════════════════════════

export default function UserResearcher({ onHome }: { onHome: () => void }) {
  const [step, setStep] = useState<URStep>(1);
  const [task, setTask] = useState<URTaskType>('用户反馈分析');

  // Data
  const [feedbacks, setFeedbacks] = useState<URFeedbackRow[]>([]);
  const [fbFile, setFbFile] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [mockScene, setMockScene] = useState('618 大促用户反馈');
  const [customScene, setCustomScene] = useState('');
  const [mockCount, setMockCount] = useState(200);
  const [mockCountInput, setMockCountInput] = useState('200');
  const [showDataPreview, setShowDataPreview] = useState(false);

  // Custom analysis
  const [customQuestion, setCustomQuestion] = useState('');
  const customExamples = [
    '用户在支付环节遇到的最大问题是什么？',
    '为什么 NPS 得分下降了？',
    '客服记录中反映最突出的体验问题是？',
  ];

  // Analysis
  const [scanProgress, setScanProgress] = useState(0);
  const [insight, setInsight] = useState<InsightResult | null>(null);
  const [expandedTheme, setExpandedTheme] = useState<number | null>(null);

  // Follow-up
  const [followUpMessages, setFollowUpMessages] = useState<FollowUpMessage[]>([]);
  const [followUpInput, setFollowUpInput] = useState('');
  const [isFollowUpLoading, setIsFollowUpLoading] = useState(false);

  // Report
  const [reportGenerated, setReportGenerated] = useState(false);
  const [showReportPreview, setShowReportPreview] = useState(false);

  const insightRef = useRef<HTMLDivElement>(null);
  const [disputedResolved, setDisputedResolved] = useState<Record<string, string>>({});

  // ── Disputed review: group by theme for batch actions ──
  const disputedGroups = useMemo(() => {
    if (!insight) return [];
    const disputed = feedbacks.filter(f => f.情绪 === '争议');
    if (disputed.length === 0) return [];

    // Group by category
    const groups = new Map<string, URFeedbackRow[]>();
    for (const fb of disputed) {
      const cat = fb.类别 || '其他';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(fb);
    }
    return [...groups.entries()]
      .map(([cat, items]) => ({
        category: cat,
        count: items.length,
        samples: items.slice(0, 3).map(f => f.反馈内容),
        resolved: disputedResolved[cat] || null,
      }))
      .filter(g => !g.resolved)
      .sort((a, b) => b.count - a.count);
  }, [insight, feedbacks, disputedResolved]);

  const handleResolveDisputed = (category: string, as: string) => {
    setDisputedResolved(prev => ({ ...prev, [category]: as }));
    // Apply to feedbacks
    const updated = feedbacks.map(f => {
      if ((f.类别 || '其他') === category && f.情绪 === '争议') {
        return { ...f, 情绪: as };
      }
      return f;
    });
    setFeedbacks(updated);
    // Re-analyze
    const newInsight = analyzeFeedback(updated);
    setInsight(newInsight);
  };

  const handleResolveAllDisputed = (as: string) => {
    const updated = feedbacks.map(f => {
      if (f.情绪 === '争议') {
        return { ...f, 情绪: as };
      }
      return f;
    });
    setFeedbacks(updated);
    setDisputedResolved({});
    const newInsight = analyzeFeedback(updated);
    setInsight(newInsight);
  };

  // Dynamic follow-up questions
  const dynamicQuestions = useMemo(() => {
    if (!insight) return ['用户最不满意的是什么？', '哪些问题最紧急？', '整体情感倾向如何？', '有哪些改进建议？', '生成面向老板的汇报版'];
    return generateDynamicQuestions(insight);
  }, [insight]);

  // ── Navigation ──
  const goNext = () => {
    if (step === 1) {
      if (feedbacks.length === 0) return;
      if (task === '自定义分析' && !customQuestion.trim()) return;
      setStep(2);
      let i = 0;
      const timer = setInterval(() => {
        i++;
        setScanProgress(i);
        if (i >= scanSteps.length) {
          clearInterval(timer);
          const result = analyzeFeedback(feedbacks);
          setInsight(result);
          setTimeout(() => {
            setStep(3);
            insightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 500);
        }
      }, 400);
    } else if (step === 3) {
      setStep(4);
    }
  };

  const goBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(1);
    else if (step === 4) setStep(3);
  };

  const canNext1 = () => {
    if (feedbacks.length === 0) return false;
    if (task === '自定义分析' && !customQuestion.trim()) return false;
    return true;
  };

  // ── Data loading ──
  const handleFile = (csvText: string, name: string) => {
    const rows = parseFeedbackCSV(csvText);
    setFeedbacks(rows);
    setFbFile(name);
  };

  const handleTextSubmit = () => {
    if (!textInput.trim()) return;
    const lines = textInput.trim().split('\n').filter(l => l.trim());
    const rows: URFeedbackRow[] = lines.map(l => ({ 反馈内容: l.trim() }));
    setFeedbacks(rows);
    setFbFile(`粘贴文本（${rows.length}条）`);
  };

  const handleMockData = () => {
    const scene = mockScene === '自定义场景...' ? (customScene.trim() || '通用场景') : mockScene;
    const count = Math.min(Math.max(parseInt(mockCountInput) || mockCount, 1), 500);
    setMockCount(count);
    const rows = generateMockFeedback(scene, count);
    setFeedbacks(rows);
    setFbFile(`模拟数据 · ${scene}（${rows.length}条）`);
    setShowDataPreview(false);
  };

  const handleDownloadMockCSV = () => {
    if (feedbacks.length === 0) return;
    const header = '反馈内容,情绪,类别,来源';
    const rows = feedbacks.map(f => `"${f.反馈内容.replace(/"/g, '""')}",${f.情绪 || ''},${f.类别 || ''},${f.来源 || ''}`).join('\n');
    const csv = '﻿' + header + '\n' + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `用户反馈数据_${fbFile?.replace(/[^\\u4e00-\\u9fa5\\w]/g, '_') || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Follow-up ──
  const handleFollowUp = (question: string) => {
    if (!insight || !question.trim()) return;
    setIsFollowUpLoading(true);
    setFollowUpMessages(prev => [...prev, { question, answer: '' }]);
    setTimeout(() => {
      const answer = generateInsightAnswer(question, insight);
      setFollowUpMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, answer } : m));
      setIsFollowUpLoading(false);
    }, 800 + Math.random() * 600);
  };

  // ── Report ──
  const generateReportMarkdown = () => {
    if (!insight) return '';
    const { sentiment, keywords, themes, summary } = insight;
    const total = sentiment.total;
    const topThemes = themes.slice(0, 6);
    let md = `# 用户洞察报告\n\n`;
    md += `**任务类型**：${task}${customQuestion ? ' — ' + customQuestion : ''}\n`;
    md += `**数据来源**：${fbFile || '未知'}\n`;
    md += `**分析日期**：${new Date().toLocaleDateString('zh-CN')}\n\n---\n\n## 洞察摘要\n\n${summary}\n\n---\n\n## 情感倾向\n\n| 情感 | 数量 | 占比 |\n|------|------|------|\n`;
    md += `| 😊 正面 | ${sentiment.positive} | ${Math.round(sentiment.positive/total*100)}% |\n`;
    md += `| 😐 中性 | ${sentiment.neutral} | ${Math.round(sentiment.neutral/total*100)}% |\n`;
    md += `| 😞 负面 | ${sentiment.negative} | ${Math.round(sentiment.negative/total*100)}% |\n`;
    if (sentiment.disputed > 0) md += `| ⚠️ 争议 | ${sentiment.disputed} | ${Math.round(sentiment.disputed/total*100)}% |\n`;
    md += `\n---\n\n## 需求聚类\n\n`;
    topThemes.forEach((t, i) => {
      md += `### ${i+1}. ${t.name}（${t.count}条 | ${t.severity}优先级）${t.needsManualReview ? ' ⚠️ 含争议' : ''}\n\n**建议**：${t.suggestion}\n\n**用户原声**：\n`;
      t.quotes.forEach(q => { md += `> "${q}"\n\n`; });
    });
    md += `\n---\n\n## 高频关键词\n\n`;
    keywords.slice(0, 12).forEach(k => { md += `- **${k.word}**（${k.count}次 · ${k.sentiment}）\n`; });
    md += `\n---\n\n> 本报告由 AI User Researcher 基于 ${total} 条用户反馈自动生成。`;
    return md;
  };

  const handleGenerateReport = () => {
    setReportGenerated(true);
    setShowReportPreview(true);
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(generateReportMarkdown());
  };

  const handleExportMarkdown = () => {
    const md = generateReportMarkdown();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `用户洞察报告_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ──
  return (
    <main className="min-h-screen bg-[#FAFAFA] px-4 py-5 md:px-6 md:py-6">
      <div className="mx-auto max-w-5xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 border border-[#E5E5E5]">
          <div>
            <button onClick={onHome} className="inline-flex items-center gap-1 text-sm font-semibold text-[#111111] hover:text-[#666666] transition-colors">
              <ArrowLeft size={16} /> 返回员工中心
            </button>
            <h1 className="mt-1.5 text-xl font-bold text-[#111111]">AI User Researcher 工作台</h1>
            <p className="text-xs text-[#666666] mt-0.5">用户反馈分析 · 情感识别 · 需求洞察 · 争议检测</p>
          </div>
          <span className="rounded-full bg-[#F5F5F5] px-4 py-2 text-sm font-semibold text-[#111111] border border-[#E5E5E5]">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-1.5" />已开放
          </span>
        </div>

        {/* ── Step indicator ── */}
        <div className="mt-5 rounded-2xl bg-white px-5 py-4 border border-[#E5E5E5]">
          <div className="flex items-center gap-0 text-sm">
            {['选择任务', 'AI 洞察分析', '洞察结果', '追问深挖'].map((s, i) => (
              <div key={s} className="flex items-center shrink-0">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold mr-1.5 ${step > i + 1 ? 'bg-[#666666] text-white' : step === i + 1 ? 'bg-[#111111] text-white' : 'bg-[#F5F5F5] text-[#999999]'}`}>
                  {step > i + 1 ? <Check size={11} /> : i + 1}
                </span>
                <span className={`${step === i + 1 ? 'font-semibold text-[#111111]' : step > i + 1 ? 'text-[#666666]' : 'text-[#999999]'}`}>{s}</span>
                {i < 3 && <span className="mx-2 text-[#E5E5E5]">—</span>}
              </div>
            ))}
          </div>
        </div>

        {/* ════════════════ Step 1 ════════════════ */}
        {step === 1 && (
          <section className="mt-5 space-y-5">
            {/* Task selection */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <h2 className="text-lg font-bold text-[#111111]">选择分析任务</h2>
              <p className="mt-1 text-sm text-[#666666]">AI User Researcher 支持多种文本分析场景，请选择你需要的分析类型</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tasks.map((t) => {
                  const sel = task === t.label;
                  return (
                    <button key={t.label} onClick={() => setTask(t.label)} className={`rounded-2xl border-2 p-4 text-left transition-all ${sel ? 'border-[#111111] bg-[#F5F5F5]' : 'border-[#E5E5E5] bg-white hover:border-[#D4D4D4]'}`}>
                      <div className="font-semibold text-sm text-[#111111]">{t.label}</div>
                      <div className="mt-1 text-xs text-[#999999] leading-relaxed">{t.desc}</div>
                    </button>
                  );
                })}
              </div>

              {/* Custom question — only for 自定义分析 */}
              {task === '自定义分析' && (
                <div className="mt-5 rounded-xl border-2 border-[#111111] bg-[#F9F9F9] p-5">
                  <p className="text-sm font-bold text-[#111111] mb-3">你想分析什么问题？</p>
                  <textarea value={customQuestion} onChange={(e) => setCustomQuestion(e.target.value)}
                    placeholder="例如：用户在支付环节遇到的最大问题是什么？" rows={3}
                    className="w-full rounded-xl border border-[#E5E5E5] px-4 py-3 text-sm outline-none focus:border-[#111111] resize-none placeholder:text-[#CCCCCC]" />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {customExamples.map(ex => (
                      <button key={ex} onClick={() => setCustomQuestion(ex)} className="rounded-lg border border-[#E5E5E5] bg-white px-3 py-1.5 text-xs text-[#666666] hover:border-[#111111] hover:text-[#111111] transition-colors">{ex}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Data input */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <h2 className="text-lg font-bold text-[#111111]">导入反馈数据</h2>
              <p className="mt-1 text-sm text-[#666666]">上传 CSV 文件、粘贴文本、或生成模拟数据</p>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                {/* CSV upload */}
                <div>
                  <p className="text-sm font-semibold text-[#111111] mb-2">上传反馈 CSV</p>
                  <label className="block cursor-pointer rounded-xl border-2 border-dashed border-[#E5E5E5] bg-[#F5F5F5] p-6 hover:border-[#111111] transition-colors">
                    <input type="file" accept=".csv" className="hidden"
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) { const r = new FileReader(); r.onload = (ev) => handleFile(ev.target?.result as string, file.name); r.readAsText(file); }}} />
                    <div className="flex items-center gap-4">
                      <div className="rounded-lg border border-[#E5E5E5] bg-white p-2.5"><Download size={20} className="text-[#111111]" /></div>
                      <div><div className="font-semibold text-[#111111] text-sm">上传 CSV 文件</div>
                        <div className="mt-1 text-sm text-[#999999]">{fbFile && !fbFile.includes('模拟') && !fbFile.includes('粘贴') ? fbFile : '点击选择（一列一条反馈）'}</div></div>
                    </div>
                  </label>
                </div>

                {/* Text paste */}
                <div>
                  <p className="text-sm font-semibold text-[#111111] mb-2">或直接粘贴文本</p>
                  <textarea value={textInput} onChange={(e) => setTextInput(e.target.value)}
                    placeholder="每行一条用户反馈，例如：&#10;优惠券点不了，好烦&#10;物流太慢了&#10;客服态度很好"
                    rows={4} className="w-full rounded-xl border border-[#E5E5E5] px-4 py-3 text-sm outline-none focus:border-[#111111] resize-none placeholder:text-[#CCCCCC]" />
                  <button onClick={handleTextSubmit} disabled={!textInput.trim()}
                    className="mt-2 rounded-lg border border-[#E5E5E5] px-4 py-2 text-xs font-medium text-[#666666] hover:border-[#111111] disabled:opacity-40 transition-colors">
                    使用粘贴文本
                  </button>
                </div>
              </div>

              {/* Mock data generator */}
              <div className="mt-5 pt-5 border-t border-[#F0F0F0]">
                <p className="text-sm font-semibold text-[#111111] mb-2">快速体验：生成模拟反馈数据</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <select value={mockScene} onChange={(e) => setMockScene(e.target.value)}
                    className="rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm text-[#111111] outline-none focus:border-[#111111]">
                    {mockScenes.map(s => (<option key={s.label} value={s.label}>{s.label}</option>))}
                  </select>
                  {mockScene === '自定义场景...' && (
                    <input type="text" value={customScene} onChange={(e) => setCustomScene(e.target.value)}
                      placeholder="输入场景名称，如：双12直播反馈"
                      className="w-48 rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm outline-none focus:border-[#111111] placeholder:text-[#CCCCCC]" />
                  )}
                  <input type="number" value={mockCountInput} onChange={(e) => { setMockCountInput(e.target.value); const v = parseInt(e.target.value); if (v > 0) setMockCount(Math.min(v, 500)); }}
                    min={1} max={500} placeholder="200"
                    className="w-20 rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm text-[#111111] outline-none focus:border-[#111111]" />
                  <span className="text-xs text-[#999999]">条（上限500）</span>
                  <button onClick={handleMockData}
                    className="rounded-lg bg-[#111111] px-4 py-2 text-sm font-medium text-white hover:bg-[#333333] transition-colors">
                    生成模拟数据
                  </button>
                </div>
              </div>

              {/* Data status + preview */}
              {feedbacks.length > 0 && (
                <div className="mt-4 rounded-xl border border-emerald-200 overflow-hidden">
                  <div className="flex items-center bg-emerald-50 px-4 py-3">
                    <div className="flex items-center gap-2 flex-1">
                      <Check size={14} className="text-emerald-600 shrink-0" />
                      <span className="text-sm text-emerald-700 font-medium">{fbFile || `已加载 ${feedbacks.length} 条反馈`}</span>
                      {feedbacks.some(f => f.情绪 === '争议') && (
                        <span className="text-[11px] text-amber-600 bg-amber-100 rounded-full px-2 py-0.5">含争议反馈</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={handleDownloadMockCSV}
                        className="flex items-center gap-1 rounded border border-emerald-300 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
                        <Download size={11} /> 下载CSV
                      </button>
                      <button onClick={() => setShowDataPreview(!showDataPreview)}
                        className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800">
                        <Eye size={12} /> {showDataPreview ? '收起' : '预览'}
                      </button>
                    </div>
                  </div>
                  {showDataPreview && (
                    <div className="border-t border-emerald-200 max-h-[220px] overflow-y-auto bg-white">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-[#F5F5F5] sticky top-0">
                          <th className="px-3 py-2 text-left font-semibold text-[#666666] w-8">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-[#666666]">反馈内容</th>
                          <th className="px-3 py-2 text-left font-semibold text-[#666666] w-16">情绪</th>
                          <th className="px-3 py-2 text-left font-semibold text-[#666666] w-20">类别</th>
                        </tr></thead>
                        <tbody className="divide-y divide-[#F0F0F0]">
                          {feedbacks.slice(0, 40).map((fb, i) => (
                            <tr key={i} className="hover:bg-[#F9F9F9]">
                              <td className="px-3 py-1.5 text-[#999999]">{i + 1}</td>
                              <td className="px-3 py-1.5 text-[#111111] max-w-[350px] truncate">{fb.反馈内容}</td>
                              <td className="px-3 py-1.5">
                                <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${fb.情绪 === '负面' ? 'bg-red-50 text-red-600' : fb.情绪 === '正面' ? 'bg-emerald-50 text-emerald-600' : fb.情绪 === '争议' ? 'bg-amber-50 text-amber-600' : 'bg-zinc-50 text-zinc-500'}`}>
                                  {fb.情绪 || '中性'}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-[#666666]">{fb.类别 || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {feedbacks.length > 40 && (
                        <p className="px-3 py-2 text-[11px] text-[#999999] bg-[#F9F9F9] border-t">显示前 40 条，共 {feedbacks.length} 条</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-8">
                {task === '自定义分析' && !customQuestion.trim() && feedbacks.length > 0 && (
                  <p className="text-xs text-amber-600 mb-2">请先在上方填写你要分析的具体问题。</p>
                )}
                <button onClick={goNext} disabled={!canNext1()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#333333] disabled:bg-[#E5E5E5] disabled:text-[#999999]">
                  开始 AI 洞察分析<ArrowRight size={15} />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ════════════════ Step 2 — Scanning ════════════════ */}
        {step === 2 && (
          <section className="mt-5 rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
            <div className="flex items-center gap-3">
              <Loader2 className="animate-spin text-[#111111]" size={20} />
              <h2 className="text-lg font-bold text-[#111111]">AI User Researcher 正在分析</h2>
            </div>
            <div className="mt-6 space-y-2">
              {scanSteps.map((x, i) => {
                const done = i < scanProgress, current = i === scanProgress;
                return (
                  <div key={x} className={`flex items-center gap-3 rounded-lg p-3.5 transition-colors ${done ? 'bg-[#F5F5F5]' : ''}`}>
                    {done ? (<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#111111" strokeWidth="2"><polyline points="2,7 6,11 12,3" /></svg>)
                      : current ? (<span className="inline-block h-2 w-2 rounded-full bg-[#111111] animate-pulse" />)
                      : (<span className="inline-block h-2 w-2 rounded-full bg-[#E5E5E5]" />)}
                    <span className={`text-sm ${done ? 'text-[#111111] font-medium' : current ? 'text-[#111111]' : 'text-[#CCCCCC]'}`}>{x}</span>
                    {done && <span className="ml-auto text-xs text-[#999999]">完成</span>}
                    {current && <span className="ml-auto text-xs text-[#999999]">分析中…</span>}
                  </div>
                );})}
            </div>
          </section>
        )}

        {/* ════════════════ Step 3 — Results ════════════════ */}
        {step === 3 && insight && (
          <section className="mt-5 space-y-5" ref={insightRef}>
            {/* Summary */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border-2 border-[#111111]">
              <h2 className="text-lg font-bold text-[#111111]">洞察摘要</h2>
              <p className="mt-3 text-sm text-[#111111] leading-relaxed">{insight.summary}</p>
            </div>

            {/* Sentiment */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <h3 className="text-sm font-semibold text-[#111111] mb-4">情感倾向分布</h3>
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  { label: '正面', count: insight.sentiment.positive, cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                  { label: '中性', count: insight.sentiment.neutral, cls: 'bg-zinc-50 border-zinc-200 text-zinc-700' },
                  { label: '负面', count: insight.sentiment.negative, cls: 'bg-red-50 border-red-200 text-red-700' },
                  { label: '争议 ⚠️', count: insight.sentiment.disputed, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl border p-3 text-center ${s.cls}`}>
                    <p className="text-xl font-bold">{s.count}</p>
                    <p className="text-[10px] mt-0.5 font-medium">{s.label}（{insight.sentiment.total > 0 ? Math.round(s.count/insight.sentiment.total*100) : 0}%）</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 h-2 w-full rounded-full bg-[#F0F0F0] overflow-hidden flex">
                {insight.sentiment.positive > 0 && <div className="h-full bg-emerald-500" style={{width:`${Math.round(insight.sentiment.positive/insight.sentiment.total*100)}%`}}/>}
                {insight.sentiment.neutral > 0 && <div className="h-full bg-zinc-400" style={{width:`${Math.round(insight.sentiment.neutral/insight.sentiment.total*100)}%`}}/>}
                {insight.sentiment.negative > 0 && <div className="h-full bg-red-400" style={{width:`${Math.round(insight.sentiment.negative/insight.sentiment.total*100)}%`}}/>}
                {insight.sentiment.disputed > 0 && <div className="h-full bg-amber-400" style={{width:`${Math.round(insight.sentiment.disputed/insight.sentiment.total*100)}%`}}/>}
              </div>
            </div>

            {/* Keywords */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <h3 className="text-sm font-semibold text-[#111111] mb-4">高频关键词</h3>
              <div className="flex flex-wrap gap-2">
                {insight.keywords.map(k => (
                  <span key={k.word} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${k.sentiment==='负面'?'border-red-200 bg-red-50 text-red-700':k.sentiment==='正面'?'border-emerald-200 bg-emerald-50 text-emerald-700':'border-zinc-200 bg-zinc-50 text-zinc-700'}`}>
                    {k.word} <span className="ml-1 opacity-60">{k.count}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Themes */}
            <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
              <h3 className="text-sm font-semibold text-[#111111] mb-4">需求聚类（按提及量排序）</h3>
              <div className="space-y-3">
                {insight.themes.map((t, i) => (
                  <div key={t.name} className="rounded-xl border border-[#E5E5E5] overflow-hidden">
                    <button onClick={() => setExpandedTheme(expandedTheme===i ? null : i)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F9F9F9] transition-colors">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${t.severity==='高'?'bg-red-100 text-red-700':t.severity==='中'?'bg-amber-100 text-amber-700':'bg-zinc-100 text-zinc-600'}`}>{t.severity}</span>
                      <span className="flex-1 font-semibold text-sm text-[#111111]">{t.name}</span>
                      {t.needsManualReview && <span className="text-[10px] text-amber-600 bg-amber-100 rounded-full px-1.5 py-0.5">需复核</span>}
                      <span className="text-xs text-[#999999]">{t.count} 条</span>
                      {expandedTheme===i ? <ChevronUp size={15} className="text-[#999999]"/> : <ChevronDown size={15} className="text-[#999999]"/>}
                    </button>
                    {expandedTheme===i && (
                      <div className="border-t border-[#E5E5E5] bg-[#F9F9F9] px-4 py-4 space-y-3">
                        <div><p className="text-xs font-semibold text-[#666666] mb-1">关联关键词</p>
                          <div className="flex flex-wrap gap-1.5">{t.keywords.map(kw=>(<span key={kw} className="rounded bg-white border border-[#E5E5E5] px-2 py-0.5 text-[11px] text-[#666666]">{kw}</span>))}</div></div>
                        <div><p className="text-xs font-semibold text-[#666666] mb-1">用户原声</p>
                          {t.quotes.map((q,qi)=>(<p key={qi} className="text-xs text-[#666666] leading-relaxed pl-2 border-l-2 border-[#E5E5E5] mb-1">"{q}"</p>))}</div>
                        <div><p className="text-xs font-semibold text-[#666666] mb-1">AI 建议</p>
                          <p className="text-xs text-[#111111] leading-relaxed">{t.suggestion}</p>
                          {t.needsManualReview && <p className="text-xs text-amber-600 mt-1">⚠️ 该分类存在争议/反话反馈，建议人工抽查确认后纳入决策。</p>}</div>
                      </div>)}
                  </div>
                ))}
              </div>
            </div>

            {/* === Disputed Review Panel === */}
            {insight.sentiment.disputed > 0 && disputedGroups.length > 0 && (
              <div className="rounded-2xl bg-white p-6 md:p-8 border border-amber-200 bg-amber-50/30">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-amber-800">争议反馈快速复核</h3>
                    <p className="mt-0.5 text-xs text-amber-600">
                      检测到 {insight.sentiment.disputed} 条争议/反话反馈（{Math.round(insight.sentiment.disputed/insight.sentiment.total*100)}%），已按类别分组。
                      逐条审核太慢，按组确认即可。
                    </p>
                  </div>
                  <button onClick={() => handleResolveAllDisputed('负面')}
                    className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition-colors">
                    全部标记为负面
                  </button>
                </div>

                <div className="space-y-2">
                  {disputedGroups.map(g => (
                    <div key={g.category} className="rounded-lg bg-white border border-amber-200 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[#111111]">{g.category}</span>
                          <span className="text-[11px] text-amber-600 bg-amber-100 rounded-full px-1.5 py-0.5">{g.count} 条争议</span>
                        </div>
                        <div className="flex gap-1.5">
                          <button onClick={() => handleResolveDisputed(g.category, '负面')}
                            className="rounded border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors">
                            确认负面
                          </button>
                          <button onClick={() => handleResolveDisputed(g.category, '正面')}
                            className="rounded border border-emerald-200 px-2.5 py-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-50 transition-colors">
                            确认正面
                          </button>
                          <button onClick={() => handleResolveDisputed(g.category, '中性')}
                            className="rounded border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-50 transition-colors">
                            忽略
                          </button>
                        </div>
                      </div>
                      {g.samples.map((q, qi) => (
                        <p key={qi} className="text-[11px] text-[#666666] pl-2 border-l-2 border-amber-200 mb-1 leading-relaxed">"{q}"</p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={goBack} className="rounded-xl border border-[#E5E5E5] px-5 py-3 text-sm font-semibold text-[#666666] hover:bg-[#F5F5F5] transition-colors">返回修改数据</button>
              <button onClick={() => setStep(4)} className="inline-flex items-center gap-2 rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white hover:bg-[#333333] transition-colors">
                继续追问深挖<ArrowRight size={15} />
              </button>
            </div>
          </section>
        )}

        {/* ════════════════ Step 4 — Follow-up + Report ════════════════ */}
        {step === 4 && insight && (
          <section className="mt-5 space-y-5">
            {/* Follow-up chat */}
            <div className="rounded-2xl bg-white p-6 border border-[#E5E5E5]">
              <h3 className="text-lg font-bold text-[#111111]">追问 AI User Researcher</h3>
              <p className="mt-1 text-sm text-[#666666]">基于当前洞察结果，继续深入分析。以下问题根据分析结果动态生成。</p>

              <div className="mt-4 flex flex-wrap gap-2">
                {dynamicQuestions.map(x => (
                  <button key={x} onClick={() => handleFollowUp(x)} disabled={isFollowUpLoading}
                    className="rounded-full border border-[#E5E5E5] bg-white px-4 py-2 text-sm text-[#666666] hover:border-[#111111] hover:text-[#111111] transition-colors disabled:opacity-50">{x}</button>
                ))}
              </div>

              {followUpMessages.length > 0 && (
                <div className="mt-5 space-y-3 max-h-[350px] overflow-y-auto">
                  {followUpMessages.map((m, i) => (
                    <div key={i} className="space-y-3">
                      <div className="flex justify-end"><div className="max-w-[75%] rounded-2xl rounded-br-md bg-[#111111] px-4 py-2.5 text-sm text-white">{m.question}</div></div>
                      {m.answer ? (
                        <div className="flex justify-start"><div className="max-w-[85%] rounded-2xl rounded-bl-md bg-[#F5F5F5] border border-[#E5E5E5] px-4 py-2.5 text-sm text-[#111111] leading-relaxed whitespace-pre-line">{m.answer}</div></div>
                      ) : (
                        <div className="flex justify-start"><div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-[#F5F5F5] border border-[#E5E5E5] px-4 py-2.5"><Loader2 size={14} className="animate-spin text-[#999999]"/><span className="text-sm text-[#999999]">AI 正在思考…</span></div></div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <input type="text" value={followUpInput} onChange={(e) => setFollowUpInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { handleFollowUp(followUpInput); setFollowUpInput(''); }}}
                  placeholder="输入你想深入了解的问题…" disabled={isFollowUpLoading}
                  className="flex-1 rounded-xl border border-[#E5E5E5] px-4 py-2.5 text-sm outline-none focus:border-[#111111] disabled:opacity-50 placeholder:text-[#CCCCCC]" />
                <button onClick={() => { handleFollowUp(followUpInput); setFollowUpInput(''); }}
                  disabled={!followUpInput.trim() || isFollowUpLoading}
                  className="rounded-xl bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white disabled:bg-[#E5E5E5] disabled:text-[#999999] hover:bg-[#333333] transition-colors"><Send size={15} /></button>
              </div>
            </div>

            {/* Report generation */}
            <div className="rounded-2xl bg-white p-6 border border-[#E5E5E5]">
              <h3 className="text-sm font-semibold text-[#111111] mb-3">生成洞察报告</h3>
              <p className="text-xs text-[#666666] mb-4">将本次分析结果导出为结构化 Markdown 报告，可直接用于汇报或存档。</p>

              {!reportGenerated ? (
                <button onClick={handleGenerateReport}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white hover:bg-[#333333] transition-colors">
                  <FileText size={15} /> 生成洞察报告
                </button>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-emerald-600">✅ 报告已生成</p>
                  <div className="flex gap-3 flex-wrap">
                    <button onClick={handleExportMarkdown}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#111111] bg-[#111111] px-5 py-3 text-sm font-semibold text-white hover:bg-[#333333] transition-colors">
                      <Download size={14} /> 导出 Markdown
                    </button>
                    <button onClick={handleCopyReport}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] px-5 py-3 text-sm font-semibold text-[#666666] hover:border-[#111111] hover:text-[#111111] transition-colors">
                      <Copy size={14} /> 复制报告
                    </button>
                  </div>
                  {/* Report preview */}
                  {showReportPreview && (
                    <div className="mt-4 rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] p-4 max-h-[300px] overflow-y-auto">
                      <pre className="text-xs text-[#111111] leading-relaxed whitespace-pre-wrap font-sans">{generateReportMarkdown()}</pre>
                    </div>
                  )}
                  <button onClick={() => setShowReportPreview(!showReportPreview)}
                    className="text-xs text-[#666666] hover:text-[#111111] transition-colors">
                    {showReportPreview ? '收起预览' : '展开预览'}
                  </button>
                </div>
              )}
            </div>

            {/* Handoff */}
            <div className="rounded-2xl bg-white p-6 border border-[#E5E5E5]">
              <h3 className="text-sm font-semibold text-[#111111] mb-3">传递给其他 AI 员工</h3>
              <p className="text-xs text-[#666666] mb-4">将本次用户洞察结论作为输入，传递给数据分析师或增长运营师，形成「听用户 → 找问题 → 定方案」完整决策链。</p>
              <div className="flex gap-3">
                <button onClick={onHome} className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] px-5 py-3 text-sm font-semibold text-[#666666] hover:border-[#111111] hover:text-[#111111] transition-colors">
                  <FileText size={14} /> 返回员工中心
                </button>
                <button onClick={onHome} className="inline-flex items-center gap-1.5 rounded-xl bg-[#111111] px-5 py-3 text-sm font-semibold text-white hover:bg-[#333333] transition-colors">
                  <TrendingUp size={14} /> 传递给 AI 数据分析师
                </button>
              </div>
              <p className="mt-4 text-[11px] text-[#999999]">提示：员工间数据传递功能将在 V1.1 中实现，当前版本请手动在 BA/GM 中引用 UR 的洞察结论。</p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
