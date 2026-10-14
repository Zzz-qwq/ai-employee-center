import { FeedbackRow, OperationRow } from '../types';

/**
 * RFC-4180 CSV 解析：对整段文本跑状态机。
 *
 * 关键点：引号内的换行与逗号必须原样保留在同一个字段里。
 * 之前的实现是「先按 \n 切行、再解析引号」，遇到带字段内换行的 CSV
 * （例如工作日报的产出成果关联列）会被静默切成多行，产生幻影记录。
 */
export function parseCsvRaw(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // 只去一次 BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; } // 转义 "" → "
        inQuotes = false; i++; continue;                            // 收尾引号
      }
      field += ch; i++; continue;                                   // ★ 引号内的换行/逗号原样保留
    }

    if (ch === '"' && field === '') { inQuotes = true; i++; continue; } // 只在字段起始处开引号
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }                               // 吞掉 CR，兼容 CRLF
    if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; i++; continue; }
    field += ch; i++;
  }

  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); } // 末行无换行时收尾
  return rows;
}

export function parseCsvText<T extends Record<string, unknown>>(text: string): T[] {
  const raw = parseCsvRaw(text).filter(r => r.some(c => c.trim() !== ''));
  if (raw.length === 0) return [];
  const headers = raw[0].map(h => h.trim().replace(/^﻿/, ''));
  return raw.slice(1).map(r =>
    headers.reduce((obj, key, index) => ({ ...obj, [key]: (r[index] ?? '').trim() }), {}) as T,
  );
}

export const parseCsv = async <T extends Record<string, unknown>>(file: File): Promise<T[]> =>
  parseCsvText<T>(await file.text());

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
