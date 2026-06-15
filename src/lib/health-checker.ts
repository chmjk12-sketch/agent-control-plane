import { prisma } from "./prisma";

export class HealthChecker {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private readonly startupDelayMs: number;
  private readonly maxConcurrency: number;
  private readonly maxConsecutiveFailures: number;

  private consecutiveFailures = 0;
  private isRunning = false;
  private isStopped = false;

  constructor(options?: {
    intervalMs?: number;
    startupDelayMs?: number;
    maxConcurrency?: number;
    maxConsecutiveFailures?: number;
  }) {
    this.intervalMs = options?.intervalMs ?? 30_000;
    this.startupDelayMs = options?.startupDelayMs ?? 15_000;
    this.maxConcurrency = options?.maxConcurrency ?? 5;
    this.maxConsecutiveFailures = options?.maxConsecutiveFailures ?? 3;
  }

  start() {
    if (this.intervalId) return;

    this.isStopped = false;
    this.consecutiveFailures = 0;

    this.intervalId = setInterval(() => this.checkAll(), this.intervalMs);

    // 首次启动延迟执行，等待数据库迁移完成
    console.log(
      `[HealthChecker] 已启动，间隔: ${this.intervalMs}ms，首次检查延迟: ${this.startupDelayMs}ms`
    );

    setTimeout(() => {
      if (this.isStopped) return;
      this.checkAll().catch((err) => {
        console.warn(
          "[HealthChecker] 首次健康检查失败（服务可能仍在启动中）:",
          err instanceof Error ? err.message : err
        );
      });
    }, this.startupDelayMs);

    // 注册优雅关闭
    this.registerGracefulShutdown();
  }

  stop() {
    this.isStopped = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[HealthChecker] 已停止");
    }
  }

  private registerGracefulShutdown() {
    const shutdown = (signal: string) => {
      console.log(`[HealthChecker] 收到 ${signal}，正在优雅关闭...`);
      this.stop();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }

  private async checkAll() {
    if (this.isStopped) return;
    if (this.isRunning) {
      console.log("[HealthChecker] 上一次检查尚未完成，跳过本次");
      return;
    }

    this.isRunning = true;

    try {
      const agents = await prisma.agent.findMany({
        where: { status: { in: ["online", "degraded"] } },
      });

      // 并发限制：同时最多检查 maxConcurrency 个 agent
      const chunks: typeof agents[] = [];
      for (let i = 0; i < agents.length; i += this.maxConcurrency) {
        chunks.push(agents.slice(i, i + this.maxConcurrency));
      }

      for (const chunk of chunks) {
        if (this.isStopped) break;
        // 每个 agent 独立 try-catch，互不影响
        await Promise.allSettled(
          chunk.map((agent) => this.checkAgent(agent))
        );
      }

      // 成功完成一轮检查，重置连续失败计数
      this.consecutiveFailures = 0;
    } catch (error) {
      this.consecutiveFailures++;
      console.error(
        `[HealthChecker] checkAll 第 ${this.consecutiveFailures}/${this.maxConsecutiveFailures} 次连续失败:`,
        error instanceof Error ? error.message : error
      );

      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        console.error(
          `[HealthChecker] 连续 ${this.maxConsecutiveFailures} 次 checkAll 失败，自动停止以避免日志刷屏`
        );
        this.stop();
      }
    } finally {
      this.isRunning = false;
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
