import { ArrowRight } from 'lucide-react';

interface Props {
  name: string;
  enName: string;
  role: string;
  status: string;
  abilities: string[];
  avatarSrc: string;
  hoverLine: string;
  enabled?: boolean;
  onClick?: () => void;
}

export default function EmployeeCard({
  name, enName, role, status, abilities, avatarSrc, hoverLine, enabled, onClick,
}: Props) {
  return (
    <button
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      className={`group relative flex flex-col bg-white p-5 text-left transition-all duration-200 rounded-2xl
        ${enabled
          ? 'border-2 border-zinc-900 hover-lift cursor-pointer'
          : 'border border-[#E5E7EB] opacity-85 cursor-not-allowed'
        }`}
    >
      {/* Avatar + Status */}
      <div className="flex items-start justify-between">
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg border overflow-hidden transition-colors duration-200
          ${enabled ? 'bg-white border-zinc-900' : 'bg-[#F5F5F5] border-[#E5E5E5]'}`}
        >
          <img src={avatarSrc} alt={name} className="h-full w-full object-cover" />
        </div>

        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium
          ${enabled
            ? 'border-zinc-900 bg-zinc-900 text-white'
            : 'border-[#E5E7EB] text-zinc-500'
          }`}
        >
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${enabled ? 'bg-white' : 'bg-zinc-500'}`} />
          {status}
        </span>
      </div>

      {/* Name + English name + role */}
      <div className="mt-4">
        <h3 className="text-base font-semibold text-zinc-800">{name}</h3>
        <p className="mt-0.5 text-[11px] text-zinc-400">{enName}</p>
        <p className="mt-0.5 text-sm text-zinc-500">{role}</p>
      </div>

      {/* Abilities */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {abilities.map((a) => (
          <span
            key={a}
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors
              ${enabled
                ? 'border-[#E5E5E5] text-zinc-600 group-hover:border-zinc-900'
                : 'border-[#E5E7EB] text-zinc-500'
              }`}
          >
            {a}
          </span>
        ))}
      </div>

      {/* Hover speech bubble */}
      <div className="absolute left-[80px] top-[22px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
        <div className="relative rounded-lg border border-zinc-900 bg-white px-2.5 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="absolute -left-[5px] top-2.5 h-2.5 w-2.5 rotate-45 border-l border-b border-zinc-900 bg-white" />
          <p className="text-xs text-zinc-700 leading-relaxed whitespace-nowrap">
            {hoverLine}
          </p>
        </div>
      </div>

      {/* Action footer */}
      <div className={`mt-auto pt-4 flex items-center gap-1.5 text-sm font-semibold ${enabled ? 'text-zinc-900' : 'text-zinc-500'}`}>
        {enabled ? '进入工作台' : '敬请期待'}
        {enabled && (
          <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1.5" />
        )}
      </div>
    </button>
  );
}
