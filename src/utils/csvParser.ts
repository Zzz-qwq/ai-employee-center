import { FeedbackRow, OperationRow } from '../types';

const parseLine = (line: string) => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') { current += '"'; i++; }
    else if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else current += char;
  }
  result.push(current.trim());
  return result.map(v => v.replace(/^"|"$/g, ''));
};

export const parseCsv = async <T extends Record<string, unknown>>(file: File): Promise<T[]> => {
  const text = await file.text();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseLine(line);
    return headers.reduce((obj, key, index) => ({ ...obj, [key]: values[index] ?? '' }), {}) as T;
  });
};

const toNumber = (v: unknown) => Number(String(v ?? '').replace('%', '').replace(/,/g, '')) || 0;
const normalizeRate = (v: unknown) => {
  const n = toNumber(v);
  return n > 1 ? n / 100 : n;
};

export const normalizeOperationRows = (rows: Record<string, unknown>[]): OperationRow[] => rows.map(r => ({
  日期: String(r['日期'] ?? ''),
  渠道: String(r['渠道'] ?? ''),
  曝光量: toNumber(r['曝光量']),
  点击量: toNumber(r['点击量']),
  点击率: normalizeRate(r['点击率']),
  下单量: toNumber(r['下单量']),
  转化率: normalizeRate(r['转化率']),
  GMV: toNumber(r['GMV']),
  客单价: toNumber(r['客单价']),
  退款率: normalizeRate(r['退款率']),
  用户反馈关键词: String(r['用户反馈关键词'] ?? ''),
}));

export const normalizeFeedbackRows = (rows: Record<string, unknown>[]): FeedbackRow[] => rows.map(r => {
  const obj: FeedbackRow = {};
  Object.keys(r).forEach(k => { obj[k] = String(r[k] ?? ''); });
  return obj;
});
