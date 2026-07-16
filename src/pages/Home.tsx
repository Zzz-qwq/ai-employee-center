import EmployeeCard from '../components/EmployeeCard';

const employees = [
  {
    name: 'AI 数据分析师',
    enName: 'AI Business Analyst',
    role: '经营分析',
    status: '已开放',
    abilities: ['异常识别', '经营诊断', '复盘报告'],
    avatarSrc: '/avatars/glasses-icon.svg',
    hoverLine: '让我先看看数据。',
    enabled: true,
  },
  {
    name: 'AI 增长运营师',
    enName: 'AI Growth Manager',
    role: '增长策略',
    status: '已开放',
    abilities: ['增长策略', '活动策划', '渠道优化'],
    avatarSrc: '/avatars/compass-icon.svg',
    hoverLine: '增长，总有突破口。',
    enabled: true,
  },
  {
    name: 'AI 用户洞察师',
    enName: 'AI User Researcher',
    role: '用户研究',
    status: '建设中',
    abilities: ['用户反馈', '需求洞察', '体验优化'],
    avatarSrc: '/avatars/question-icon.svg',
    hoverLine: '用户不会直接告诉你答案。',
    enabled: false,
  },
];

export default function Home({ onEnter, onEnterGM }: { onEnter: () => void; onEnterGM: () => void }) {
  return (
    <main className="min-h-screen bg-[#FAFAFA] flex flex-col justify-center">
      {/* Hero */}
      <section className="px-6 pt-16 pb-8 md:pt-20 md:pb-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs tracking-[0.45em] text-zinc-400 uppercase font-medium">
            AI Employee Center
          </p>
          <h1 className="mt-4 text-3xl md:text-4xl font-bold text-zinc-900 tracking-tight">
            AI 员工中心
          </h1>
          <p className="mt-3 text-base font-normal text-zinc-600">
            选择一位 AI 员工，开始协作。
          </p>
          <p className="mt-2.5 text-sm font-normal text-zinc-500 leading-relaxed max-w-lg mx-auto">
            这里不只是一个聊天框，而是一组可以协作的 AI 同事。
          </p>
          <p className="mt-0.5 text-sm font-normal text-zinc-500 leading-relaxed max-w-lg mx-auto">
            选择一位 AI 员工，让它陪你看数据、找问题、整理反馈，并生成可执行的复盘建议。
          </p>
        </div>
      </section>

      {/* Employee cards */}
      <section className="px-6 pb-14 md:pb-16">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-4 md:grid-cols-3">
            {employees.map((e) => (
              <EmployeeCard
                key={e.name}
                name={e.name}
                enName={e.enName}
                role={e.role}
                status={e.status}
                abilities={e.abilities}
                avatarSrc={e.avatarSrc}
                hoverLine={e.hoverLine}
                enabled={e.enabled}
                onClick={e.enabled ? (e.enName === 'AI Growth Manager' ? onEnterGM : onEnter) : undefined}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
