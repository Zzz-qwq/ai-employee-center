import { OperationRow, RuleResult } from '../types';
const sum = (arr:number[])=>arr.reduce((a,b)=>a+b,0); const avg=(arr:number[])=>arr.length?sum(arr)/arr.length:0; const pct=(n:number)=>`${(n*100).toFixed(1)}%`;
export function generateReport(task: string, ops: OperationRow[], rules: RuleResult[]) {
 const exposure=sum(ops.map(r=>r.曝光量)); const clicks=sum(ops.map(r=>r.点击量)); const orders=sum(ops.map(r=>r.下单量)); const gmv=sum(ops.map(r=>r.GMV));
 const conv=avg(ops.map(r=>r.转化率)); const refund=avg(ops.map(r=>r.退款率));
 const high=rules.filter(r=>r.severity==='high');
 return `# ${task} 复盘报告\n\n## 1. 活动概览\n本次分析任务为「${task}」，覆盖站内推荐、搜索、短视频、社群、会员短信等渠道。\n\n## 2. 核心指标表现\n- 总曝光量：${Math.round(exposure).toLocaleString()}\n- 总点击量：${Math.round(clicks).toLocaleString()}\n- 总下单量：${Math.round(orders).toLocaleString()}\n- 总GMV：${Math.round(gmv).toLocaleString()}\n- 平均转化率：${pct(conv)}\n- 平均退款率：${pct(refund)}\n\n## 3. 异常问题识别\n${rules.map(r=>`- 【${r.severity}】${r.ruleName}：${r.conclusion}`).join('\n')}\n\n## 4. 用户反馈归因\n用户反馈集中在优惠券、物流和活动规则三类问题上。优惠券失效或门槛不清会直接影响下单决策；物流负面反馈会降低用户信任；活动规则复杂会提高理解成本，导致用户在点击后放弃购买。\n\n## 5. 策略建议\n${rules.slice(0,6).map((r,i)=>`${i+1}. ${r.suggestion}`).join('\n')}\n\n## 6. 下阶段行动计划\n1. 优先恢复并突出展示核心优惠券，减少用户找券和试错成本。\n2. 针对高曝光低转化渠道做承接页和人群包复核。\n3. 对物流延迟订单设置主动提醒与补偿机制。\n4. 将活动规则改为更清晰的三步说明，并在结算页同步展示到手价。\n5. 建立活动期间每日异常看板，监控曝光、点击、转化、退款和反馈关键词。\n\n本报告由本地规则引擎和模拟AI总结生成，后续可替换为真实LLM API生成更自然的业务复盘。`;
}
