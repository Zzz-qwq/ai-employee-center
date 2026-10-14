import { downloadCSV } from './mockDataGenerator';

/**
 * 人力投入与效率分析的合成样例数据。
 *
 * ⚠️ 人名、部门、金额全部为虚构。真实的工作日报属于使用者所在公司，
 * 只在本地浏览器里解析，绝不进入仓库、不进入构建产物。
 *
 * 每次调用都重新生成一份**不一样的**数据（人数、工时分布、离群点位置都变），
 * 这样连续点两次「试用示例数据」不会看到一模一样的数字——死的数据一眼就是假的。
 * 但参数只在**能持续产出有价值结论的范围内**抖动：始终保证有高工时集中、
 * 有超时离群、有单条耗时离群，否则访客可能点到一份什么异常都没有的数据。
 *
 * 需要复现时传 seed（验证脚本用这个）。不传就是随机的。
 */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rnd = () => number;
const between = (rnd: Rnd, lo: number, hi: number) => lo + rnd() * (hi - lo);
const intBetween = (rnd: Rnd, lo: number, hi: number) => Math.round(between(rnd, lo, hi));
const pickOne = <T,>(rnd: Rnd, arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const shuffled = <T,>(rnd: Rnd, arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (headers: string[], rows: (string | number)[][], eol = '\n') =>
  [headers.join(','), ...rows.map(r => r.map(esc).join(','))].join(eol);

// ═══════════════════════════════════════════
// 样例 A · 工时日报（结构对齐真实工作日报，不含薪资/部门/销售额）
// ═══════════════════════════════════════════

interface CatDef { cat: string; subs: string[]; band: [number, number] }

const CATS: CatDef[] = [
  { cat: '文档撰写', subs: ['项目文档', '技术文档', '提案/决策文档'], band: [0.5, 2.0] },
  { cat: '会议', subs: ['周会', '内部协调会', '一对一沟通'], band: [0.5, 2.0] },
  { cat: '内部沟通', subs: ['团队协调', '内部协调'], band: [0.5, 1.5] },
  { cat: '产品研发', subs: ['功能开发', '需求评审', '原型设计'], band: [1.5, 3.5] },
  { cat: '数据处理', subs: ['数据统计/分析', '数据清洗/匹配'], band: [0.8, 2.5] },
  { cat: '人事办理', subs: ['招聘/面试', '入职/离职'], band: [0.5, 2.0] },
  { cat: '商务', subs: ['客户对接', '合同跟进'], band: [1.0, 3.0] },
  { cat: '项目管理', subs: ['进度跟进', '风险管理'], band: [0.5, 2.0] },
  { cat: '培训学习', subs: ['技能学习', '入职培训'], band: [1.0, 3.0] },
  { cat: '新媒体', subs: ['内容创作', '社群运营'], band: [1.0, 3.0] },
  { cat: '研究分析', subs: ['行业研究', '竞品分析'], band: [1.5, 3.5] },
  { cat: '行政支持', subs: ['物资采购', '场地协调'], band: [0.5, 1.5] },
];

/** 各岗位画像的类别偏好权重，顺序与 CATS 一一对应 */
const WEIGHTS: Record<string, number[]> = {
  dev: [2, 6, 5, 8, 6, 0, 0, 2, 1, 1, 2, 0],
  ops: [3, 6, 6, 3, 3, 2, 2, 3, 1, 1, 1, 2],
  biz: [3, 6, 5, 1, 1, 0, 7, 2, 1, 2, 2, 0],
  admin: [3, 6, 6, 1, 2, 7, 1, 2, 1, 1, 1, 4],
  research: [4, 4, 4, 2, 5, 0, 1, 2, 1, 1, 6, 0],
  light: [4, 6, 6, 1, 1, 2, 1, 2, 1, 2, 1, 2],
};

/** 虚构姓名池，每次从中随机取一部分 */
const NAME_POOL = [
  '张伟', '李娜', '王芳', '刘洋', '陈静', '杨帆', '赵磊', '黄敏', '周涛',
  '吴倩', '徐明', '孙丽', '郑凯', '谢婷', '高强', '何杰', '罗琳', '梁超', '唐雪', '许阳',
];

interface Profile {
  name: string;
  rows: number;
  overtimeRate: number;
  bias: keyof typeof WEIGHTS;
  /** 个人耗时系数：>1 表示同类任务干得比别人久，<1 表示更快 */
  stretch: number;
}

const DESCS = [
  '整理{cat}相关材料', '跟进{cat}事项', '完成{cat}任务', '处理{cat}需求',
  '同步{cat}进度', '输出{cat}文档', '对接{cat}工作', '复盘{cat}问题',
];

function weightedPick(weights: number[], r: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const target = r * total;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (target <= acc) return i;
  }
  return weights.length - 1;
}

/**
 * 随机生成一份「有看点」的团队画像：
 * 头部 3 人吃掉大部分工时（保证工时集中、产出集中会被算出来），
 * 尾部随机埋 3 个离群点：超时率高的、单条耗时长产出低的、单条极短产出率高的。
 */
function buildTeam(rnd: Rnd): Profile[] {
  const n = intBetween(rnd, 11, 14);
  const names = shuffled(rnd, NAME_POOL).slice(0, n);
  const biases = Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[];

  // 头部权重高、尾部权重低，制造真实的「少数人扛大部分活」形态
  const weights = names.map((_, i) => (i < 3 ? between(rnd, 1.6, 2.8) : between(rnd, 0.15, 0.9)));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const totalRows = intBetween(rnd, 600, 820);

  const profiles: Profile[] = names.map((name, i) => ({
    name,
    rows: Math.max(8, Math.round((totalRows * weights[i]) / totalWeight)),
    overtimeRate: i < 3 ? between(rnd, 0.05, 0.28) : between(rnd, 0, 0.42),
    bias: pickOne(rnd, biases),
    stretch: between(rnd, 0.85, 1.15),
  }));

  // 离群点只埋在尾部成员身上，避免和「主力」重叠
  const tail = profiles.map((_, i) => i).filter(i => i >= 3);
  if (tail.length >= 3) {
    const ovIdx = pickOne(rnd, tail);
    profiles[ovIdx].overtimeRate = between(rnd, 0.45, 0.72);

    const rest = tail.filter(i => i !== ovIdx);
    const slowIdx = pickOne(rnd, rest);
    profiles[slowIdx].bias = 'research';                       // 长周期类别
    profiles[slowIdx].stretch = between(rnd, 1.45, 1.9);       // 单条耗时长、产出率低

    const fastIdx = pickOne(rnd, rest.filter(i => i !== slowIdx));
    profiles[fastIdx].bias = 'light';
    profiles[fastIdx].stretch = between(rnd, 0.5, 0.7);        // 单条短、产出率高
  }

  return profiles;
}

/** 样例 A：一条记录 = 一个已完成工作项（与引擎的兜底口径一致） */
export function generatePeopleWorklogCSV(seed?: number): string {
  const rnd = mulberry32(seed ?? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0));
  const team = buildTeam(rnd);
  const rows: (string | number)[][] = [];
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const fmtDT = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  /** 随机一个开工时刻（7–9 月的某天上午/下午） */
  const randomStart = () => {
    const d = new Date(2026, intBetween(rnd, 6, 8), intBetween(rnd, 1, 28),
      intBetween(rnd, 9, 19), intBetween(rnd, 0, 5) * 10);
    return d.getTime();
  };

  // 预埋两条带换行的描述，用来验证 CSV 解析器对字段内换行的处理
  const multilineAt = new Set([intBetween(rnd, 5, 40), intBetween(rnd, 200, 400)]);

  let idx = 0;
  for (const p of team) {
    // 每个人的类别分布再加一点抖动，避免同画像的人长得一样
    const w = WEIGHTS[p.bias].map(x => x * between(rnd, 0.6, 1.4));
    for (let i = 0; i < p.rows; i++) {
      const ci = weightedPick(w, rnd());
      const c = CATS[ci];
      const [lo, hi] = c.band;
      const overtime = rnd() < p.overtimeRate;
      // 超时的记录必然超出标准上限；未超时的落在区间内
      const base = overtime ? hi * (1.05 + 0.35 * rnd()) : lo + (hi - lo) * (0.2 + 0.8 * rnd());
      const hours = base * p.stretch;
      const sub = pickOne(rnd, c.subs);
      const desc0 = pickOne(rnd, DESCS).replace('{cat}', c.cat);
      const desc = multilineAt.has(idx)
        ? `${desc0}\n（追加说明：本条含换行，用于验证解析器不会把它切成两条记录）`
        : desc0;
      idx++;

      // 结束时间由开工时间 + 实际工时推出，最后更新时间再往后挪；
      // 三者必须自洽——否则「开始 7/14、结束 7/17、工时 1.11 小时」这种
      // 自相矛盾的数据，拿给老板看一眼就穿帮。
      const startMs = randomStart();
      const endMs = startMs + Math.round(hours * 60) * 60000;
      const updatedMs = endMs + intBetween(rnd, 0, 3) * 24 * 3600000 + intBetween(rnd, 0, 20) * 3600000;

      rows.push([
        desc, p.name, c.cat, sub, `${lo.toFixed(1)} ~ ${hi.toFixed(1)}`,
        fmtDT(startMs), fmtDT(endMs),
        hours.toFixed(2), overtime ? '是' : '否',
        overtime ? pickOne(rnd, ['任务复杂度高于预期', '依赖方回复延迟', '需求中途变更', '']) : '',
        fmtDT(updatedMs),
      ]);
    }
  }

  return toCsv(
    ['工作内容描述', '日报提交人', '工作类别', '工作子活动', '标准工时范围', '开始工作时间', '工作结束时间',
      '工作时长', '是否超出标准时长', '超时原因', '最后更新时间'],
    rows,
  );
}

// ═══════════════════════════════════════════
// 样例 B · 部门经营（含部门、工时、产出数量、销售额、工资 → 四个模块全部点亮）
// ═══════════════════════════════════════════

interface DeptDef { dept: string; people: number; salary: [number, number]; qty: [number, number]; sales: number }

const DEPTS: DeptDef[] = [
  { dept: '技术部', people: 8, salary: [26000, 34000], qty: [13, 22], sales: 0 },
  { dept: '销售部', people: 5, salary: [12000, 20000], qty: [24, 38], sales: 220000 },
  { dept: '运营部', people: 4, salary: [10000, 15000], qty: [20, 30], sales: 60000 },
  { dept: '市场部', people: 3, salary: [10000, 14000], qty: [14, 22], sales: 45000 },
  { dept: '职能部', people: 2, salary: [9000, 12000], qty: [16, 24], sales: 0 },
  { dept: '客服部', people: 2, salary: [8000, 10000], qty: [35, 46], sales: 20000 },
];

const SURNAMES = ['陈', '林', '黄', '何', '高', '罗', '郑', '梁', '谢', '唐', '许', '邓', '冯', '曹', '彭', '苏'];
const GIVEN = ['磊', '婷', '强', '敏', '杰', '欣', '峰', '雪', '阳', '琳', '超', '悦', '宁', '航', '怡', '然'];

/** 样例 B：一行 = 一个人一个月，口径是经营数据 */
export function generatePeopleDeptCSV(seed?: number): string {
  const rnd = mulberry32(seed ?? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0));
  const rows: (string | number)[][] = [];

  // 周期数随机 4~6 个月
  const monthCount = intBetween(rnd, 4, 6);
  const startMonth = intBetween(rnd, 1, 12 - monthCount + 1);
  const months = Array.from({ length: monthCount }, (_, i) =>
    `2026-${String(startMonth + i).padStart(2, '0')}`);

  // 随机挑一个部门当「高成本、低单位产出」的离群部门，并随机挑一个人当高薪低产出的离群点
  const lagDept = pickOne(rnd, DEPTS.filter(d => d.salary[0] >= 20000));
  const surnames = shuffled(rnd, SURNAMES);
  const given = shuffled(rnd, GIVEN);
  let seedIdx = 0;

  for (const d of DEPTS) {
    const people = Math.max(2, d.people + intBetween(rnd, -1, 1));
    const lagPerson = intBetween(rnd, 0, people - 1);

    for (let p = 0; p < people; p++) {
      const name = surnames[seedIdx % surnames.length] + given[(seedIdx * 3 + Math.floor(seedIdx / surnames.length)) % given.length];
      seedIdx++;

      const isLag = d.dept === lagDept.dept && p === lagPerson;
      const salary = isLag
        ? d.salary[1]
        : Math.round(between(rnd, d.salary[0], d.salary[1]));

      for (const m of months) {
        const hours = intBetween(rnd, 148, 182);
        const qty = isLag ? intBetween(rnd, 6, 9) : intBetween(rnd, d.qty[0], d.qty[1]);
        const sales = d.sales ? Math.round(d.sales * between(rnd, 0.8, 1.25)) : 0;
        rows.push([name, d.dept, m, hours, qty, sales, salary]);
      }
    }
  }

  // 样例 B 用 CRLF，顺便覆盖解析器的 CR 分支
  return toCsv(['姓名', '部门', '月份', '工时', '完成数量', '销售额', '工资'], rows, '\r\n');
}

// ═══════════════════════════════════════════
// 对外接口
// ═══════════════════════════════════════════

export type PeopleSampleId = 'worklog' | 'dept';

export const PEOPLE_SAMPLES: { id: PeopleSampleId; label: string; desc: string; filename: string }[] = [
  {
    id: 'worklog',
    label: '工时日报样例',
    desc: '每次生成一份新的：约 11–14 人 · 600–820 条记录。结构对齐真实工作日报，不含薪资与部门字段——用来演示「缺字段就如实跳过」',
    filename: '人力投入与效率分析_工时日报样例（虚拟）.csv',
  },
  {
    id: 'dept',
    label: '部门经营样例',
    desc: '每次生成一份新的：6 个部门 · 20 余人 · 4–6 个月。含部门、工时、完成数量、销售额、工资——四个分析模块全部点亮',
    filename: '人力投入与效率分析_部门经营样例（虚拟）.csv',
  },
];

export function generatePeopleSample(id: PeopleSampleId, seed?: number): string {
  return id === 'dept' ? generatePeopleDeptCSV(seed) : generatePeopleWorklogCSV(seed);
}

export function downloadPeopleSample(id: PeopleSampleId): void {
  const s = PEOPLE_SAMPLES.find(x => x.id === id);
  if (s) downloadCSV(generatePeopleSample(id), s.filename);
}
