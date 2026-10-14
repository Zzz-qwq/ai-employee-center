import { downloadCSV } from './mockDataGenerator';

/**
 * 人力投入与效率分析的合成样例数据。
 *
 * ⚠️ 人名、部门、金额全部为虚构。真实的工作日报属于使用者所在公司，
 * 只在本地浏览器里解析，绝不进入仓库、不进入构建产物。
 *
 * 用带种子的伪随机（mulberry32），保证每次生成的样例完全一致——
 * 便于回归验证，也让面试官每次看到的是同一份可复现的数据。
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

interface Profile {
  name: string;
  rows: number;
  overtimeRate: number;
  bias: keyof typeof WEIGHTS;
  /** 个人耗时系数：>1 表示同类任务干得比别人久，<1 表示更快 */
  stretch?: number;
}

/** 12 个虚构同事。刻意留了离群点，让 PE01–PE08 都能被演示到 */
const TEAM: Profile[] = [
  { name: '张伟', rows: 180, overtimeRate: 0.25, bias: 'dev' },       // 工时最高的主力
  { name: '李娜', rows: 130, overtimeRate: 0.10, bias: 'ops' },
  { name: '王芳', rows: 100, overtimeRate: 0.15, bias: 'biz' },
  { name: '刘洋', rows: 70, overtimeRate: 0.08, bias: 'ops' },
  { name: '陈静', rows: 55, overtimeRate: 0.22, bias: 'dev' },
  { name: '杨帆', rows: 45, overtimeRate: 0.05, bias: 'research' },
  { name: '赵磊', rows: 38, overtimeRate: 0.12, bias: 'ops' },
  { name: '黄敏', rows: 30, overtimeRate: 0.30, bias: 'admin' },
  { name: '周涛', rows: 35, overtimeRate: 0.60, bias: 'dev' },        // 超时率离群
  { name: '吴倩', rows: 22, overtimeRate: 0.05, bias: 'research', stretch: 1.7 }, // 单条耗时离群
  { name: '徐明', rows: 14, overtimeRate: 0.05, bias: 'light', stretch: 0.8 },
  { name: '孙丽', rows: 10, overtimeRate: 0.00, bias: 'light', stretch: 0.55 },   // 单条最短、产出率最高
];

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

/** 样例 A：一条记录 = 一个已完成工作项（与人效引擎的兜底口径一致） */
export function generatePeopleWorklogCSV(): string {
  const rnd = mulberry32(20261014);
  const rows: (string | number)[][] = [];
  const day = () => String(1 + Math.floor(rnd() * 28)).padStart(2, '0');
  const month = () => String(7 + Math.floor(rnd() * 3)).padStart(2, '0');

  // 预埋两条带换行的描述，用来验证 CSV 解析器对字段内换行的处理
  const multilineAt = new Set([17, 233]);

  let idx = 0;
  for (const p of TEAM) {
    const w = WEIGHTS[p.bias];
    for (let i = 0; i < p.rows; i++) {
      const ci = weightedPick(w, rnd());
      const c = CATS[ci];
      const [lo, hi] = c.band;
      const overtime = rnd() < p.overtimeRate;
      // 超时的记录必然超出标准上限；未超时的落在区间内
      const base0 = overtime ? hi * (1.05 + 0.35 * rnd()) : lo + (hi - lo) * (0.2 + 0.8 * rnd());
      const hours = base0 * (p.stretch ?? 1);
      const sub = c.subs[Math.floor(rnd() * c.subs.length)];
      const base = DESCS[Math.floor(rnd() * DESCS.length)].replace('{cat}', c.cat);
      const desc = multilineAt.has(idx)
        ? `${base}\n（追加说明：本条含换行，用于验证解析器不会把它切成两条记录）`
        : base;
      idx++;

      rows.push([
        desc, p.name, c.cat, sub, `${lo.toFixed(1)} ~ ${hi.toFixed(1)}`,
        `2026/0${month()}/0${day()} 09:00`, `2026/0${month()}/0${day()} 18:00`,
        hours.toFixed(2), overtime ? '是' : '否', overtime ? '任务复杂度高于预期' : '',
        `2026/0${month()}/1${Math.floor(rnd() * 9)} 21:00`,
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

const SURNAMES = ['陈', '林', '黄', '何', '高', '罗', '郑', '梁', '谢', '唐', '许', '邓'];
const GIVEN = ['磊', '婷', '强', '敏', '杰', '欣', '峰', '雪', '阳', '琳', '超', '悦'];

/** 样例 B：一行 = 一个人一个月，口径是经营数据 */
export function generatePeopleDeptCSV(): string {
  const rnd = mulberry32(778899);
  const rows: (string | number)[][] = [];
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
  let seedIdx = 0;

  for (const d of DEPTS) {
    for (let p = 0; p < d.people; p++) {
      // 两段式取名：前 12 人用第一个名，后 12 人换一个名，保证 24 人姓名互不重复
      const name = SURNAMES[seedIdx % 12] + GIVEN[Math.floor(seedIdx / 12) * 5 % 12];
      seedIdx++;
      // 预埋一个高薪低产出的离群点，用来触发 PE10
      const isLag = d.dept === '技术部' && p === 2;
      const salary = isLag
        ? d.salary[1]
        : Math.round(d.salary[0] + rnd() * (d.salary[1] - d.salary[0]));

      for (const m of months) {
        const hours = Math.round(150 + rnd() * 30);
        const qty = isLag ? 8 : Math.round(d.qty[0] + rnd() * (d.qty[1] - d.qty[0]));
        const sales = d.sales ? Math.round(d.sales * (0.8 + rnd() * 0.4)) : 0;
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
    desc: '12 人 · 约 680 条工作记录。结构对齐真实工作日报，**不含**薪资与部门字段——用来演示「缺字段就如实跳过」',
    filename: '人力投入与效率分析_工时日报样例（虚拟）.csv',
  },
  {
    id: 'dept',
    label: '部门经营样例',
    desc: '6 个部门 · 24 人 · 5 个月。含部门、工时、完成数量、销售额、工资——四个分析模块全部点亮',
    filename: '人力投入与效率分析_部门经营样例（虚拟）.csv',
  },
];

export function generatePeopleSample(id: PeopleSampleId): string {
  return id === 'dept' ? generatePeopleDeptCSV() : generatePeopleWorklogCSV();
}

export function downloadPeopleSample(id: PeopleSampleId): void {
  const s = PEOPLE_SAMPLES.find(x => x.id === id);
  if (s) downloadCSV(generatePeopleSample(id), s.filename);
}
