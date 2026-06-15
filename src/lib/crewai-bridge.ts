// CrewAI 桥接模块 - 连接控制平面与 CrewAI 服务

const CREWAI_SERVICE_URL = process.env.CREWAI_SERVICE_URL || "http://crewai-service:8000";

/**
 * CrewAI 服务健康检查
 */
export async function health(): Promise<{
  status: string;
  version?: string;
  responseTimeMs: number;
}> {
  const startTime = Date.now();
  try {
    const res = await fetch(`${CREWAI_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return {
      status: res.ok ? "healthy" : "unhealthy",
      version: data.version,
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      status: "unreachable",
      responseTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * 通过 CrewAI 服务执行任务
 */
export async function execute(params: {
  task: string;
  agents?: Array<{
    name: string;
    role: string;
    goal?: string;
    backstory?: string;
    llm?: string;
  }>;
  inputs?: Record<string, any>;
  crewConfig?: Record<string, any>;
}): Promise<{
  success: boolean;
  result?: any;
  error?: string;
  durationMs: number;
}> {
  const startTime = Date.now();
  try {
    const res = await fetch(`${CREWAI_SERVICE_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(120000), // 2 分钟超时
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || `CrewAI 服务错误: HTTP ${res.status}`,
        durationMs: Date.now() - startTime,
      };
    }

    const data = await res.json();
    return {
      success: true,
      result: data,
      durationMs: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "CrewAI 服务不可达",
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * 将控制平面工作流配置转换为 CrewAI Crew 配置
 */
export function workflowToCrewConfig(workflow: {
  nodes: string;
  edges: string;
  variables: string;
}): {
  agents: Array<{
    name: string;
    role: string;
    goal: string;
    backstory: string;
    llm?: string;
  }>;
  tasks: Array<{
    name: string;
    description: string;
    agent: string;
    expectedOutput?: string;
  }>;
  process: string;
} {
  const nodes = JSON.parse(workflow.nodes || "[]");
  const variables = JSON.parse(workflow.variables || "{}");

  const agents: Array<{
    name: string;
    role: string;
    goal: string;
    backstory: string;
    llm?: string;
  }> = [];

  const tasks: Array<{
    name: string;
    description: string;
    agent: string;
    expectedOutput?: string;
  }> = [];

  for (const node of nodes) {
    if (node.type === "agent" && node.config) {
      agents.push({
        name: node.label || node.id,
        role: node.config.role || "assistant",
        goal: node.config.goal || "完成分配的任务",
        backstory: node.config.backstory || "",
        llm: node.config.llm || variables.llm,
      });

      if (node.config.task) {
        tasks.push({
          name: `${node.label || node.id}_task`,
          description: node.config.task,
          agent: node.label || node.id,
          expectedOutput: node.config.expectedOutput,
        });
      }
    }
  }

  return {
    agents,
    tasks,
    process: "sequential",
  };
}
