import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Diagnosis, FollowUpMessage, TaskType } from '../types';

const defaultQuestions = [
  '哪个渠道问题最严重？',
  '转化率下降从哪天开始？',
  '用户最不满意什么？',
  '哪些反馈最影响购买？',
  '下周应该优先优化什么？',
  '请帮我生成面向老板汇报的版本',
];

interface Props {
  task: TaskType;
  diagnoses: Diagnosis[];
  messages: FollowUpMessage[];
  isLoading: boolean;
  onAsk: (question: string) => void;
}

export default function FollowUpChat({ task, diagnoses, messages, isLoading, onAsk }: Props) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onAsk(input.trim());
    setInput('');
  };

  const handleQuickAsk = (q: string) => {
    if (isLoading) return;
    onAsk(q);
  };

  return (
    <div className="rounded-2xl bg-white p-6 border border-[#E5E5E5]">
      <h3 className="text-lg font-bold text-[#111111]">继续追问 AI Business Analyst</h3>
      <p className="mt-1 text-sm text-[#666666]">基于当前诊断结果，你可以继续深入分析</p>

      {/* Quick questions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {defaultQuestions.map((x) => (
          <button
            key={x}
            onClick={() => handleQuickAsk(x)}
            disabled={isLoading}
            className="rounded-full border border-[#E5E5E5] bg-white px-4 py-2 text-sm text-[#666666] hover:border-[#111111] hover:text-[#111111] transition-colors disabled:opacity-50"
          >
            {x}
          </button>
        ))}
      </div>

      {/* Custom input */}
      <div className="mt-4 flex gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="你还想让我继续分析什么？"
          disabled={isLoading}
          className="flex-1 rounded-xl border border-[#E5E5E5] px-4 py-3 text-sm text-[#111111] outline-none focus:border-[#111111] transition-colors disabled:opacity-50 placeholder:text-[#999999]"
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="rounded-xl bg-[#111111] px-4 py-3 text-sm font-semibold text-white hover:bg-[#333333] transition-colors disabled:bg-[#E5E5E5] disabled:text-[#999999]"
        >
          <Send size={16} />
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="mt-5 flex items-center gap-3 rounded-xl bg-[#F5F5F5] p-4 text-sm text-[#111111]">
          <Loader2 size={16} className="animate-spin" />
          AI Business Analyst 正在继续分析…
        </div>
      )}

      {/* Message history */}
      {messages.length > 0 && (
        <div className="mt-5 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[#111111] px-4 py-3 text-sm text-white">
                  {msg.question}
                </div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-[#F5F5F5] px-4 py-3 text-sm text-[#111111] leading-relaxed whitespace-pre-wrap">
                  {msg.answer}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
