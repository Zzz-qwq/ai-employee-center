import { Upload } from 'lucide-react';

export default function FileUpload({
  label,
  onFile,
  fileName,
}: {
  label: string;
  onFile: (file: File) => void;
  fileName?: string;
}) {
  return (
    <label className="block cursor-pointer rounded-xl border-2 border-dashed border-[#E5E5E5] bg-[#F5F5F5] p-6 hover:border-[#111111] transition-colors">
      <input
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <div className="flex items-center gap-4">
        <div className="rounded-lg border border-[#E5E5E5] bg-white p-2.5">
          <Upload size={20} className="text-[#111111]" />
        </div>
        <div>
          <div className="font-semibold text-[#111111] text-sm">{label}</div>
          <div className="mt-1 text-sm text-[#999999]">
            {fileName || '点击选择 CSV 文件'}
          </div>
        </div>
      </div>
    </label>
  );
}
