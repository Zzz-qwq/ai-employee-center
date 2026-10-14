import { CanonicalField, EfficiencyDefinition, FieldMapping, PeopleModuleId } from '../types';
import { resolveGroupField, PeopleAnalysisGroupSource } from './fieldMapper';

export interface RouterDecision {
  modules: { moduleId: PeopleModuleId; active: boolean; reason: string }[];
  efficiency: EfficiencyDefinition;
  groupField: string | null;
  groupFieldSource: PeopleAnalysisGroupSource;
  warnings: string[];
}

const has = (fm: FieldMapping, f: CanonicalField) => fm.mapping[f] != null;

const MODULE_NAMES: Record<PeopleModuleId, string> = {
  productivity: '产出贡献',
  efficiency: '人效指标',
  risk: '人效异常诊断',
  compensation: '薪资成本',
};

export const moduleNameOf = (id: PeopleModuleId) => MODULE_NAMES[id];

/**
 * 先看「你有什么数据」，再决定跑什么分析。
 *
 * 人效比不硬套一个公式——不同行业定义不同，而且很多表里根本没有收入列。
 * 所以按六档优先级链式解析，命中即用，并**在报告里写明用的是哪一档、局限是什么**。
 */
export function routeSkills(
  fm: FieldMapping,
  headers: string[],
  rows: Record<string, string>[],
): RouterDecision {
  const emp = has(fm, 'employee');
  const hours = has(fm, 'hours');
  const qty = has(fm, 'outputQuantity');
  const amount = has(fm, 'outputAmount');
  const comp = has(fm, 'compensation');
  const norm = has(fm, 'standardHours') || has(fm, 'overtimeFlag');

  const group = resolveGroupField(fm, headers, rows);
  // 没有人员列时（例如「部门成本 + 产出」这类表），退而用分组维度当分析主体
  const entity = emp || Boolean(group.field);
  // 人效模块的开关不能只看工时：金额型人效比（销售额 ÷ 人工成本）根本不需要工时字段
  const eff = resolveEfficiency(fm);
  const hasEfficiency = eff.name !== '暂无可用人效口径';

  const modules: RouterDecision['modules'] = [
    {
      moduleId: 'productivity',
      active: entity && (hours || qty || amount),
      reason: entity && (hours || qty || amount)
        ? (emp ? '已识别到人员与投入/产出字段' : '未识别到人员列，改用分组维度作为分析主体')
        : '需要「人员」或可用分组字段，且至少有工时或产出之一',
    },
    {
      moduleId: 'efficiency',
      active: entity && hasEfficiency,
      reason: entity && hasEfficiency
        ? (emp ? `已识别到可计算口径的字段（${eff.name}）` : `未识别到人员列，改用分组维度计算人效（${eff.name}）`)
        : '当前字段组合无法构成任何一种人效比口径',
    },
    {
      moduleId: 'risk',
      active: entity && (hours || qty || norm),
      reason: entity && (hours || qty || norm) ? '已识别到可用于异常检测的字段' : '需要人员或分组字段，且至少有工时或超时标注',
    },
    {
      moduleId: 'compensation',
      active: comp,
      reason: comp ? '已识别到薪资/人工成本字段' : '未检测到薪资/人工成本字段（工资、薪资、人工成本、月度成本）',
    },
  ];

  return {
    modules,
    efficiency: resolveEfficiency(fm),
    groupField: group.field,
    groupFieldSource: group.source,
    warnings: buildWarnings(fm, modules),
  };
}

function resolveEfficiency(fm: FieldMapping): EfficiencyDefinition {
  const hours = has(fm, 'hours');
  const qty = has(fm, 'outputQuantity');
  const amount = has(fm, 'outputAmount');
  const comp = has(fm, 'compensation');

  if (amount && comp) {
    return {
      name: '金额型人效比',
      formula: '总产出金额 ÷ 总人工成本',
      unit: '元/元',
      reason: '已识别到产出金额与人工成本，这是最接近经营口径的人效比：每投入 1 元人力成本产出多少收入。',
    };
  }
  if (amount && hours) {
    return {
      name: '时均产出',
      formula: '总产出金额 ÷ 总工时',
      unit: '元/小时',
      reason: '已识别到产出金额与工时但没有人工成本，按「每小时产出多少钱」衡量。',
    };
  }
  if (qty && hours) {
    return {
      name: '工作项产出率',
      formula: '工作项数 ÷ 总工时',
      unit: '项/小时',
      reason: '已识别到产出数量与工时字段，按每小时完成多少个工作项衡量。该口径不含价值权重，只反映工作量密度，不能等同于业务贡献。',
    };
  }
  if (qty && comp) {
    return {
      name: '单位人工成本产出',
      formula: '工作项数 ÷ 总人工成本',
      unit: '项/元',
      reason: '已识别到产出数量与人工成本，按每元人力成本产出多少工作项衡量。',
    };
  }
  if (hours && !amount) {
    return {
      name: '工作项产出率',
      formula: '有效记录条数 ÷ 总工时',
      unit: '项/小时',
      reason: '本数据集未包含产出金额、产出数量与薪资字段，人效比退化为「工作项产出率」：以一条工作记录视作一个已完成工作项，除以总工时。该口径不含价值权重，只反映工作量密度，不能等同于业务贡献；如需金额口径，请补充销售额或人工成本字段。',
    };
  }
  if (hours && (has(fm, 'standardHours') || has(fm, 'overtimeFlag'))) {
    return {
      name: '标准工时达标率',
      formula: '未超出标准时长的记录数 ÷ 有超时标注的记录数',
      unit: '%',
      reason: '数据里没有产出量也没有金额，只能评价「计划性」：任务是否落在标准工时区间内。达标率高说明排期与工时估算更准，不代表业务贡献更大。',
    };
  }
  if (hours) {
    return {
      name: '工时结构分析',
      formula: '按人与工作类别拆分工时分布',
      unit: '小时/人',
      reason: '数据里只有工时，无法计算比率型人效比，退化为工时结构分布与集中度分析。',
    };
  }
  return {
    name: '暂无可用人效口径',
    formula: '—',
    unit: '—',
    reason: '未识别到工时、产出或薪酬字段，无法计算人效比。请确认表中至少包含工时或产出数据。',
  };
}

function buildWarnings(fm: FieldMapping, modules: RouterDecision['modules']): string[] {
  const w: string[] = [];
  const inactive = modules.filter(m => !m.active);
  for (const m of inactive) w.push(`${MODULE_NAMES[m.moduleId]}模块已跳过：${m.reason}`);
  if (fm.ambiguous.length) {
    for (const a of fm.ambiguous) {
      w.push(`「${a.candidates.join('」「')}」都像是「${a.field}」，已取前者，请确认是否选错`);
    }
  }
  return w;
}
