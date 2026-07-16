import { useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { Diagnosis } from '../types';

export default function DiagnosisCard({ d }: { d: Diagnosis }) {
  const [expanded, setExpanded] = useState(false);
  const top = d.rules[0];
  const isHigh = top?.severity === 'high';

  return (
    <div
      className={`rounded-2xl bg-white overflow-hidden transition-shadow duration-200 hover:shadow-sm
        ${isHigh ? 'border-2 border-[#111111]' : 'border border-[#E5E5E5]'}`}
    >
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-[#E5E5E5]">
        <span className="text-xs font-semibold text-[#666666]">
          置信度 {d.confidence}%
        </span>
        <span className="text-xs text-[#999999] font-mono">{top?.ruleId}</span>
      </div>

      <div className="p-5 space-y-3">
        {/* Title + impact */}
        <div>
          <h3 className="text-base font-bold text-[#111111] leading-snug">{d.title}</h3>
          <p className="text-xs text-[#999999] mt-1">影响指标：{d.impactMetric}</p>
        </div>

        {/* Triggered rule (compact) */}
        <div className="rounded-lg bg-[#F5F5F5] p-3 border-l-2 border-[#111111]">
          <p className="text-xs font-semibold text-[#666666] mb-1">命中的业务规则</p>
          <p className="text-sm font-semibold text-[#111111]">{top?.ruleName}</p>
          <p className="text-xs text-[#999999] mt-0.5">触发条件：{top?.triggerCondition}</p>
        </div>

        {/* Suggestion (always visible) */}
        <div>
          <h4 className="text-sm font-semibold text-[#111111] mb-1">优化建议</h4>
          <p className="text-sm text-[#666666] leading-relaxed whitespace-pre-line">{top?.suggestion}</p>
        </div>

        {/* Expandable detail */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-sm font-semibold text-[#111111] hover:text-[#666666] transition-colors w-full"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          查看分析详情
        </button>

        {expanded && (
          <div className="space-y-4 pt-1 border-t border-[#E5E5E5]">
            {/* Evidence */}
            <div>
              <h4 className="text-sm font-semibold text-[#111111] mb-2">指标证据</h4>
              <ul className="space-y-1.5">
                {top?.evidence.map((e, i) => (
                  <li key={i} className="text-sm text-[#666666] pl-3 border-l-2 border-[#E5E5E5]">
                    {e}
                  </li>
                ))}
              </ul>
            </div>

            {/* Business judgment */}
            <div>
              <h4 className="text-sm font-semibold text-[#111111] mb-1.5">业务判断</h4>
              <p className="text-sm text-[#111111] leading-relaxed bg-[#F5F5F5] rounded-lg p-3">{d.businessJudgment}</p>
            </div>

            {/* Possible causes */}
            <div>
              <h4 className="text-sm font-semibold text-[#111111] mb-2">可能原因</h4>

              {d.dataSupportedReasons.length > 0 && (
                <div className="mb-3">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#111111] mb-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
                    已被数据支撑
                  </span>
                  <ul className="space-y-1">
                    {d.dataSupportedReasons.map((r, i) => (
                      <li key={i} className="text-sm text-[#111111] pl-3 border-l-2 border-[#111111]">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {d.needsVerificationReasons.length > 0 && (
                <div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#666666] mb-1.5">
                    <Search size={12} />
                    需进一步验证
                  </span>
                  <ul className="space-y-1">
                    {d.needsVerificationReasons.map((r, i) => (
                      <li key={i} className="text-sm text-[#666666] pl-3 border-l-2 border-[#E5E5E5]">
                        优先排查：{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
