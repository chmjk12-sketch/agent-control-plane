import { prisma } from "./prisma";

// 告警条件接口
export interface AlertCondition {
  metric: string;
  operator: string;
  threshold: number;
  currentValue: number;
  duration?: number;
}

// 告警结果接口
export interface AlertResult {
  ruleId: string;
  ruleName: string;
  severity: string;
  triggered: boolean;
  currentValue: number;
  message: string;
}

// 活跃告警统计
export interface AlertStats {
  totalRules: number;
  enabledRules: number;
  globalRules: number;
  triggeredAlerts: number;
  bySeverity: Record<string, number>;
}

// 支持的比较运算符
const OPERATORS: Record<string, (value: number, threshold: number) => boolean> = {
  gt: (v, t) => v > t,
  gte: (v, t) => v >= t,
  lt: (v, t) => v < t,
  lte: (v, t) => v <= t,
  eq: (v, t) => v === t,
  neq: (v, t) => v !== t,
};

// 支持的指标名称
const SUPPORTED_METRICS = [
  "cpu_percent",
  "memory_mb",
  "latency_ms",
  "error_rate",
  "request_count",
  "cost",
  "restart_count",
  "response_time_ms",
] as const;

/**
 * 评估单条告警规则条件
 */
export function evaluateCondition(condition: AlertCondition): boolean {
  const { metric, operator, threshold, currentValue } = condition;

  const op = OPERATORS[operator];
  if (!op) {
    console.warn(`[AlertEngine] 不支持的运算符: ${operator}`);
    return false;
  }

  return op(currentValue, threshold);
}

/**
 * 检查 Agent 是否触发告警规则
 * @param agentId Agent ID
 * @param metrics Agent 当前指标 { cpu_percent, memory_mb, latency_ms, ... }
 * @returns 触发的告警列表
 */
export async function checkAgentAlerts(
  agentId: string,
  metrics: Record<string, number>
): Promise<AlertResult[]> {
  // 获取适用于该 Agent 的所有启用规则
  const rules = await prisma.alertRule.findMany({
    where: {
      enabled: true,
      OR: [
        { global: true },
        { agentId },
      ],
    },
  });

  const results: AlertResult[] = [];

  for (const rule of rules) {
    const currentValue = metrics[rule.metric];
    if (currentValue === undefined) continue;

    const triggered = evaluateCondition({
      metric: rule.metric,
      operator: rule.operator,
      threshold: rule.threshold,
      currentValue,
    });

    if (triggered) {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        triggered: true,
        currentValue,
        message: `[${rule.severity.toUpperCase()}] ${rule.name}: ${rule.metric} ${rule.operator} ${rule.threshold}, 当前值: ${currentValue}`,
      });

      // 创建告警记录
      await prisma.alert.create({
        data: {
          agentId,
          type: "metric",
          severity: rule.severity,
          message: results[results.length - 1].message,
        },
      });
    }
  }

  return results;
}

/**
 * 获取活跃告警统计
 */
export async function getAlertStats(): Promise<AlertStats> {
  const [totalRules, enabledRules, globalRules, unresolvedAlerts] = await Promise.all([
    prisma.alertRule.count(),
    prisma.alertRule.count({ where: { enabled: true } }),
    prisma.alertRule.count({ where: { global: true } }),
    prisma.alert.groupBy({
      by: ["severity"],
      where: { resolved: false },
      _count: { id: true },
    }),
  ]);

  const triggeredAlerts = unresolvedAlerts.reduce((sum: number, g: any) => sum + g._count.id, 0);
  const bySeverity: Record<string, number> = {};

  for (const group of unresolvedAlerts) {
    bySeverity[group.severity] = group._count.id;
  }

  return {
    totalRules,
    enabledRules,
    globalRules,
    triggeredAlerts,
    bySeverity,
  };
}
