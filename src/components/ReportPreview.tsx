import { TaskType } from '../types';

export default function ReportPreview({
  report,
  task,
  onBack,
}: {
  report: string;
  task: TaskType;
  onBack: () => void;
}) {
  const copy = () => navigator.clipboard.writeText(report);
  const download = () => {
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${task.replace(/\s/g, '_')}_复盘报告.md`;
    a.click();
  };

  return (
    <div className="rounded-2xl bg-white border border-[#E5E5E5] overflow-hidden">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[#E5E5E5]">
        <h3 className="text-lg font-bold text-[#111111]">{task} 复盘报告</h3>
        <div className="flex gap-2">
          <button
            onClick={copy}
            className="rounded-lg border border-[#E5E5E5] bg-white px-4 py-2 text-sm font-medium text-[#111111] hover:bg-[#F5F5F5] transition-colors"
          >
            复制报告
          </button>
          <button
            onClick={download}
            className="rounded-lg bg-[#111111] px-4 py-2 text-sm font-medium text-white hover:bg-[#333333] transition-colors"
          >
            导出 Markdown
          </button>
          <button
            onClick={onBack}
            className="rounded-lg border border-[#E5E5E5] px-4 py-2 text-sm font-medium text-[#666666] hover:bg-[#F5F5F5] transition-colors"
          >
            返回继续分析
          </button>
        </div>
      </div>

      {/* Report body — document style */}
      <div className="p-6 md:p-8 max-h-[560px] overflow-auto">
        <pre className="text-sm leading-7 text-[#111111] whitespace-pre-wrap font-sans">
          {report}
        </pre>
      </div>
    </div>
  );
}
