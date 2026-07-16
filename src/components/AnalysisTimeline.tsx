import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

const scanSteps = [
  '正在读取运营数据',
  '正在识别核心指标',
  '正在检测异常波动',
  '正在关联用户反馈',
  '正在命中业务规则',
  '正在生成经营诊断',
];

export default function AnalysisTimeline() {
  const [done, setDone] = useState<number[]>([]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    scanSteps.forEach((_, i) => {
      timers.push(setTimeout(() => setDone((prev) => [...prev, i]), i * 420 + 200));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="rounded-2xl bg-white p-6 md:p-8 border border-[#E5E5E5]">
      <div className="flex items-center gap-3">
        <Loader2 className="animate-spin text-[#111111]" size={20} />
        <h3 className="text-lg font-bold text-[#111111]">AI Business Analyst 正在工作</h3>
      </div>
      <div className="mt-6 space-y-2">
        {scanSteps.map((x, i) => {
          const isComplete = done.includes(i);
          return (
            <div
              key={x}
              className={`flex items-center gap-3 rounded-lg p-3.5 transition-colors ${
                isComplete ? 'bg-[#F5F5F5]' : ''
              }`}
            >
              {isComplete ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#111111" strokeWidth="2">
                  <polyline points="2,7 6,11 12,3" />
                </svg>
              ) : (
                <span className="inline-block h-2 w-2 rounded-full bg-[#111111] animate-pulse" />
              )}
              <span className={`text-sm ${isComplete ? 'text-[#111111] font-medium' : 'text-[#666666]'}`}>
                {x}
              </span>
              <span className="ml-auto text-xs text-[#999999]">Step {i + 1}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
