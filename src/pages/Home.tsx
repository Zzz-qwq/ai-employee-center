import { useState } from 'react';
import EmployeeCard from '../components/EmployeeCard';
import FeedbackWidget from '../components/FeedbackWidget';

const employees = [
  {
    name: 'AI 数据分析师',
    enName: 'AI Business Analyst',
    role: '经营分析',
    desc: '上传业务数据，帮你找到问题和下一步行动',
    status: '已开放',
    abilities: ['异常识别', '经营诊断', '复盘报告'],
    avatarSrc: `${import.meta.env.BASE_URL}avatars/glasses-icon.svg`,
    hoverLine: '让我先看看数据。',
    enabled: true,
  },
  {
    name: 'AI 增长运营师',
    enName: 'AI Growth Manager',
    role: '增长策略',
    desc: '从增长目标，到实验方案，再到行动计划',
    status: '已开放',
    abilities: ['增长策略', '活动策划', '渠道优化'],
    avatarSrc: `${import.meta.env.BASE_URL}avatars/compass-icon.svg`,
    hoverLine: '增长，总有突破口。',
    enabled: true,
  },
  {
    name: 'AI 用户洞察师',
    enName: 'AI User Researcher',
    role: '用户研究',
    desc: '从用户反馈里，发现真正的问题是什么',
    status: '已开放',
    abilities: ['用户反馈', '需求洞察', '体验优化'],
    avatarSrc: `${import.meta.env.BASE_URL}avatars/question-icon.svg`,
    hoverLine: '用户不会直接告诉你答案。',
    enabled: true,
  },
];

export default function Home({
  onEnter,
  onEnterGM,
  onEnterUR,
}: {
  onEnter: () => void;
  onEnterGM: () => void;
  onEnterUR: () => void;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <main className="min-h-screen bg-[#FAFAFA] flex flex-col justify-center">
      {/* Hero */}
      <section className="px-6 pt-16 pb-8 md:pt-20 md:pb-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs tracking-[0.45em] text-zinc-400 uppercase font-medium">
            AI Employee Center
          </p>
          <h1 className="mt-4 text-3xl md:text-4xl font-bold text-zinc-900 tracking-tight">
            你的 AI 专业团队
          </h1>
          <p className="mt-3 text-base font-normal text-zinc-600">
            不是聊天机器人，而是拥有岗位方法论和工作流程的 AI 同事。
          </p>
          <p className="mt-2.5 text-sm font-normal text-zinc-500 leading-relaxed max-w-lg mx-auto">
            每一位都有自己的岗位、分析流程和业务规则。
          </p>
          <p className="mt-0.5 text-sm font-normal text-zinc-500 leading-relaxed max-w-lg mx-auto">
            选择一位，让它陪你看数据、找问题、整理反馈，并给出可执行的建议。
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
                desc={e.desc}
                status={e.status}
                abilities={e.abilities}
                avatarSrc={e.avatarSrc}
                hoverLine={e.hoverLine}
                enabled={e.enabled}
                onClick={
                  e.enabled
                    ? e.enName === 'AI Growth Manager'
                      ? onEnterGM
                      : e.enName === 'AI User Researcher'
                        ? onEnterUR
                        : onEnter
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      </section>

      {/* 反馈入口（右下角悬浮） */}
      <FeedbackWidget open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </main>
  );
}
