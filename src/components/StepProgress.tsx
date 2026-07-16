const steps = ['选择任务', '分析问题', '上传数据', '确认目标', 'AI 扫描', '诊断结果', '继续追问', '复盘报告'];

export default function StepProgress({ current }: { current: number }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {steps.map((s, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < current;
        const isActive = stepNum === current;
        return (
          <div key={s} className="flex items-center gap-0.5">
            {/* Step node */}
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors
                  ${isDone
                    ? 'bg-[#111111] text-white'
                    : isActive
                    ? 'border-2 border-[#111111] text-[#111111]'
                    : 'border border-dashed border-[#E5E5E5] text-[#999999]'
                  }`}
              >
                {isDone ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2">
                    <polyline points="2,6 5,9 10,3" />
                  </svg>
                ) : (
                  stepNum
                )}
              </span>
              <span
                className={`hidden text-xs font-medium md:inline ${
                  isDone ? 'text-[#666666]' : isActive ? 'text-[#111111] font-semibold' : 'text-[#999999]'
                }`}
              >
                {s}
              </span>
            </div>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div
                className={`hidden h-px w-5 md:block ${
                  stepNum <= current ? 'bg-[#111111]' : 'bg-[#E5E5E5]'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
