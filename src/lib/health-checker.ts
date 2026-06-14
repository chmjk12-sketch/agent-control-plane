import { prisma } from "./prisma";

export class HealthChecker {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;

  constructor(intervalMs = 30_000) {
    this.intervalMs = intervalMs;
  }

  start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.checkAll(), this.intervalMs);
    this.checkAll(); // 立即执行一次
    console.log("[HealthChecker] 已启动，间隔:", this.intervalMs, "ms");
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[HealthChecker] 已停止");
    }
  }

  private async checkAll() {
    const agents = await prisma.agent.findMany({
      where: { status: { in: ["online", "degraded"] } },
    });

    for (const agent of agents) {
      await this.checkAgent(agent);
    }
  }

  private async checkAgent(agent: any) {
    const url = agent.endpoint
      ? `${agent.endpoint}${agent.healthCheckPath || "/health"}`
      : `http://${agent.containerName}_${agent.environmentSlot}:${agent.internalPort}${agent.healthCheckPath || "/health"}`;

    const startTime = Date.now();

    try {
      const res = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      const responseTimeMs = Date.now() - startTime;
      const healthy = res.ok;

      // 记录健康检查日志
      await prisma.healthCheckLog.create({
        data: {
          agentId: agent.id,
          status: healthy ? "healthy" : "unhealthy",
          responseTimeMs,
          statusCode: res.status,
        },
      });

      // 更新 Agent 状态
      await prisma.agent.update({
        where: { id: agent.id },
        data: {
          status: healthy ? "online" : "degraded",
          updatedAt: new Date(),
        },
      });

      // 更新健康记录
      await prisma.agentHealth.upsert({
        where: { id: agent.id },
        update: {
          status: healthy ? "online" : "degraded",
          lastHeartbeat: new Date(),
        },
        create: {
          agentId: agent.id,
          status: healthy ? "online" : "degraded",
          lastHeartbeat: new Date(),
        },
      });

      if (!healthy) {
        await prisma.alert.create({
          data: {
            agentId: agent.id,
            type: "health",
            severity: "warning",
            message: `健康检查异常: HTTP ${res.status}, ${responseTimeMs}ms`,
          },
        });
      }
    } catch (error: any) {
      // 超时或不可达
      await prisma.healthCheckLog.create({
        data: {
          agentId: agent.id,
          status: "timeout",
          responseTimeMs: Date.now() - startTime,
          error: error.message,
        },
      });

      await prisma.agent.update({
        where: { id: agent.id },
        data: {
          status: "offline",
          updatedAt: new Date(),
        },
      });

      await prisma.agentHealth.upsert({
        where: { id: agent.id },
        update: {
          status: "offline",
          lastHeartbeat: new Date(),
        },
        create: {
          agentId: agent.id,
          status: "offline",
          lastHeartbeat: new Date(),
        },
      });

      await prisma.alert.create({
        data: {
          agentId: agent.id,
          type: "health",
          severity: "critical",
          message: `Agent 不可达: ${error.message}`,
        },
      });
    }
  }
}

export const healthChecker = new HealthChecker();
