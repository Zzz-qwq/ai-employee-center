import { useState } from 'react';
import { MessageSquare, X, Check } from 'lucide-react';

/**
 * 反馈投递（Web3Forms）
 * ─────────────────────────────────────────────────────────
 * 1. 打开 https://web3forms.com ，填邮箱 → 点 Create Access Key
 * 2. 邮箱里会收到一串 access key（形如 3f2a...-xxxx）
 * 3. 粘到下面 FEEDBACK_ACCESS_KEY
 *    —— 之后访客提交的反馈会直接发到那个邮箱，不用登任何后台。
 * key 为空时自动回退到 mailto，不会出现"点了没反应"的死按钮。
 */
const FEEDBACK_ACCESS_KEY = '05a46baf-42bf-47e8-89f5-83f839c04581';
const FALLBACK_MAIL = 'zhaoziyi1024@foxmail.com';

const RATINGS = ['很有帮助', '有一点帮助', '没找到价值'];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function FeedbackWidget({ open, onOpenChange }: Props) {
  const [wish, setWish] = useState('');
  const [rating, setRating] = useState('');
  const [advice, setAdvice] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    setWish('');
    setRating('');
    setAdvice('');
    setDone(false);
  };

  const close = () => {
    onOpenChange(false);
    setTimeout(reset, 200);
  };

  const submit = async () => {
    // 没配 key 时回退到邮件，保证按钮永远不是死的
    if (!FEEDBACK_ACCESS_KEY) {
      const body = [
        wish && `希望增加的 AI 同事：${wish}`,
        rating && `当前体验：${rating}`,
        advice && `建议：${advice}`,
      ]
        .filter(Boolean)
        .join('\n');
      window.location.href =
        `mailto:${FALLBACK_MAIL}` +
        `?subject=${encodeURIComponent('AI Employee Center 反馈')}` +
        `&body=${encodeURIComponent(body || '（未填写内容）')}`;
      close();
      return;
    }

    setSending(true);
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: FEEDBACK_ACCESS_KEY,
          subject: 'AI Employee Center · 新反馈',
          from_name: 'AI Employee Center',
          希望增加的AI同事: wish || '（未填）',
          当前体验: rating || '（未选）',
          建议: advice || '（未填）',
          页面: window.location.href,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(true);
        setTimeout(close, 1800);
      } else {
        throw new Error(data.message || 'submit failed');
      }
    } catch {
      alert('提交失败，可以直接邮件联系：' + FALLBACK_MAIL);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* 悬浮入口 */}
      <button
        onClick={() => onOpenChange(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full
                   bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm
                   transition-transform duration-150 hover:-translate-y-0.5"
      >
        <MessageSquare size={15} />
        提交反馈
      </button>

      {/* 弹窗 */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-2xl border-2 border-zinc-900 bg-white p-6 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {done ? (
              <div className="py-8 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900">
                  <Check size={18} className="text-white" />
                </div>
                <p className="mt-3 text-sm font-medium text-zinc-900">已收到，谢谢你</p>
                <p className="mt-1 text-xs text-zinc-500">你的意见会直接影响下一步做什么。</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-900">帮助 AI 同事变得更好</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      这是一个正在迭代中的 Beta 产品，欢迎告诉我你想要什么。
                    </p>
                  </div>
                  <button
                    onClick={close}
                    className="text-zinc-400 transition-colors hover:text-zinc-900"
                    aria-label="关闭"
                  >
                    <X size={16} />
                  </button>
                </div>

                <label className="mt-5 block text-sm font-medium text-zinc-700">
                  你希望增加什么 AI 同事？
                </label>
                <input
                  value={wish}
                  onChange={(e) => setWish(e.target.value)}
                  placeholder="例如：财务分析、竞品调研"
                  className="mt-2 w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm text-zinc-800
                             outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900"
                />

                <p className="mt-4 text-sm font-medium text-zinc-700">你觉得当前体验：</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {RATINGS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRating(r === rating ? '' : r)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors
                        ${rating === r
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : 'border-[#E5E5E5] text-zinc-600 hover:border-zinc-900'
                        }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                <label className="mt-4 block text-sm font-medium text-zinc-700">你的建议</label>
                <textarea
                  value={advice}
                  onChange={(e) => setAdvice(e.target.value)}
                  rows={3}
                  placeholder="哪里不好用、缺什么、想看到什么"
                  className="mt-2 w-full resize-none rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm
                             text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900"
                />

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    onClick={close}
                    className="rounded-lg border border-[#E5E5E5] px-4 py-2 text-sm font-medium text-zinc-600
                               transition-colors hover:border-zinc-900 hover:text-zinc-900"
                  >
                    取消
                  </button>
                  <button
                    onClick={submit}
                    disabled={sending}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white
                               transition-colors hover:bg-zinc-700 disabled:opacity-60"
                  >
                    {sending ? '发送中…' : '提交'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
