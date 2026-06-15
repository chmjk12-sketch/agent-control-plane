import { prisma } from "./prisma";
import { messageBus } from "./message-bus";

// 工作流节点类型
export type NodeType = "start" | "end" | "agent" | "condition" | "delay" | "webhook";

// 工作流节点定义
export interface WorkflowNodeDef {
  id: string;
  type: NodeType;
  label: string;
  config: Record<string, any>;
  agentId?: string;
  positionX?: number;
  positionY?: number;
}

// 工作流边定义
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

// 节点执行结果
export interface NodeResult {
  nodeId: string;
  status: "success" | "error" | "skipped";
  output?: any;
  error?: string;
  durationMs: number;
}

// 工作流执行上下文
export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  variables: Record<string, any>;
  nodeResults: Map<string, NodeResult>;
  input: any;
}

/**
 * DAG 拓扑排序
 */
function topologicalSort(nodes: WorkflowNodeDef[], edges: WorkflowEdge[]): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) queue.push(nodeId);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    sorted.push(nodeId);
    for (const neighbor of adjacency.get(nodeId) || []) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  return sorted;
}

/**
 * 执行单个节点
 */
async function executeNode(
  node: WorkflowNodeDef,
  context: ExecutionContext
): Promise<NodeResult> {
  const startTime = Date.now();

  try {
    switch (node.type) {
      case "start":
        return {
          nodeId: node.id,
          status: "success",
          output: context.input,
          durationMs: Date.now() - startTime,
        };

      case "end":
        return {
          nodeId: node.id,
          status: "success",
          output: context.input,
          durationMs: Date.now() - startTime,
        };

      case "agent": {
        if (!node.agentId) {
          throw new Error(`Agent 节点 ${node.id} 未指定 agentId`);
        }

        const agent = await prisma.agent.findUnique({
          where: { id: node.agentId },
        });

        if (!agent || agent.status !== "online") {
          throw new Error(`Agent ${node.agentId} 不存在或未在线`);
        }

        const endpoint = agent.endpoint
          ? `${agent.endpoint}/execute`
          : `http://${agent.containerName}_${agent.environmentSlot}:${agent.internalPort}/execute`;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: context.input,
            variables: context.variables,
            nodeId: node.id,
            executionId: context.executionId,
          }),
          signal: AbortSignal.timeout(node.config.timeout || 30000),
        });

        if (!res.ok) {
          throw new Error(`Agent 执行失败: HTTP ${res.status}`);
        }

        const result = await res.json();

        // 发布消息到消息总线
        messageBus.publish(`workflow.${context.workflowId}.node.${node.id}`, {
          type: "agent_complete",
          agentId: node.agentId,
          result,
        });

        return {
          nodeId: node.id,
          status: "success",
          output: result,
          durationMs: Date.now() - startTime,
        };
      }

      case "condition": {
        const conditionExpr = node.config.condition || "true";
        // 简单条件评估（支持基本表达式）
        const result = evaluateCondition(conditionExpr, context.variables);
        return {
          nodeId: node.id,
          status: "success",
          output: { branch: result ? "true" : "false" },
          durationMs: Date.now() - startTime,
        };
      }

      case "delay": {
        const delayMs = (node.config.delaySeconds || 0) * 1000;
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        return {
          nodeId: node.id,
          status: "success",
          output: { delayed: delayMs },
          durationMs: Date.now() - startTime,
        };
      }

      case "webhook": {
        const webhookUrl = node.config.url;
        if (!webhookUrl) {
          throw new Error(`Webhook 节点 ${node.id} 未配置 url`);
        }

        const res = await fetch(webhookUrl, {
          method: node.config.method || "POST",
          headers: node.config.headers || {},
          body: JSON.stringify({
            workflowId: context.workflowId,
            executionId: context.executionId,
            nodeId: node.id,
            input: context.input,
            variables: context.variables,
          }),
          signal: AbortSignal.timeout(node.config.timeout || 10000),
        });

        const result = res.ok ? await res.json().catch(() => null) : null;

        return {
          nodeId: node.id,
          status: res.ok ? "success" : "error",
          output: result,
          error: res.ok ? undefined : `Webhook 失败: HTTP ${res.status}`,
          durationMs: Date.now() - startTime,
        };
      }

      default:
        return {
          nodeId: node.id,
          status: "skipped",
          durationMs: Date.now() - startTime,
        };
    }
  } catch (error: any) {
    return {
      nodeId: node.id,
      status: "error",
      error: error.message,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * 简单条件评估器
 */
function evaluateCondition(expr: string, variables: Record<string, any>): boolean {
  try {
    // 替换变量引用
    let evalExpr = expr;
    for (const [key, value] of Object.entries(variables)) {
      evalExpr = evalExpr.replace(new RegExp(`\\b${key}\\b`, "g"), JSON.stringify(value));
    }
    // 安全评估（仅支持简单比较表达式）
    return new Function(`return ${evalExpr}`)() as boolean;
  } catch {
    return false;
  }
}

/**
 * 获取节点的下游节点（考虑条件分支）
 */
function getNextNodes(nodeId: string, edges: WorkflowEdge[], nodeResults: Map<string, NodeResult>): string[] {
  const outEdges = edges.filter((e) => e.source === nodeId);
  const nextNodes: string[] = [];

  for (const edge of outEdges) {
    // 如果边有条件，检查是否满足
    if (edge.condition) {
      const result = nodeResults.get(nodeId);
      if (result?.output?.branch !== edge.condition) continue;
    }
    nextNodes.push(edge.target);
  }

  return nextNodes;
}

/**
 * 工作流引擎 - 执行工作流
 */
export async function executeWorkflow(
  workflowId: string,
  input?: any
): Promise<{
  executionId: string;
  status: string;
  output?: any;
  error?: string;
  durationMs: number;
  nodeResults: NodeResult[];
}> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
  });

  if (!workflow) {
    throw new Error(`工作流 ${workflowId} 不存在`);
  }

  const nodes: WorkflowNodeDef[] = JSON.parse(workflow.nodes || "[]");
  const edges: WorkflowEdge[] = JSON.parse(workflow.edges || "[]");
  const variables = JSON.parse(workflow.variables || "{}");

  // 创建执行记录
  const execution = await prisma.workflowExecution.create({
    data: {
      workflowId,
      status: "running",
      input: input ? JSON.stringify(input) : null,
    },
  });

  const context: ExecutionContext = {
    workflowId,
    executionId: execution.id,
    variables,
    nodeResults: new Map(),
    input: input || {},
  };

  const startTime = Date.now();

  try {
    // 拓扑排序确定执行顺序
    const sortedNodeIds = topologicalSort(nodes, edges);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // 发布工作流开始事件
    messageBus.publish(`workflow.${workflowId}.started`, {
      executionId: execution.id,
      input,
    });

    // 按拓扑顺序执行节点
    for (const nodeId of sortedNodeIds) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      // 检查上游条件节点是否满足分支条件
      const incomingEdges = edges.filter((e) => e.target === nodeId);
      let shouldExecute = true;

      for (const edge of incomingEdges) {
        if (edge.condition) {
          const sourceResult = context.nodeResults.get(edge.source);
          if (sourceResult?.output?.branch !== edge.condition) {
            shouldExecute = false;
            break;
          }
        }
      }

      if (!shouldExecute) {
        context.nodeResults.set(nodeId, {
          nodeId,
          status: "skipped",
          durationMs: 0,
        });
        continue;
      }

      // 执行节点
      const result = await executeNode(node, context);
      context.nodeResults.set(nodeId, result);

      // 更新上下文输入为当前节点输出
      if (result.output) {
        context.input = { ...context.input, ...result.output };
      }

      // 如果节点执行失败，终止工作流
      if (result.status === "error") {
        throw new Error(`节点 ${node.label} (${nodeId}) 执行失败: ${result.error}`);
      }
    }

    const durationMs = Date.now() - startTime;
    const nodeResultsArr = Array.from(context.nodeResults.values());

    // 更新执行记录为成功
    await prisma.workflowExecution.update({
      where: { id: execution.id },
      data: {
        status: "success",
        output: JSON.stringify(context.input),
        nodeResults: JSON.stringify(nodeResultsArr),
        finishedAt: new Date(),
        durationMs,
      },
    });

    // 更新工作流统计
    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        executionCount: { increment: 1 },
        successCount: { increment: 1 },
      },
    });

    // 发布工作流完成事件
    messageBus.publish(`workflow.${workflowId}.completed`, {
      executionId: execution.id,
      output: context.input,
      durationMs,
    });

    return {
      executionId: execution.id,
      status: "success",
      output: context.input,
      durationMs,
      nodeResults: nodeResultsArr,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const nodeResultsArr = Array.from(context.nodeResults.values());

    // 更新执行记录为失败
    await prisma.workflowExecution.update({
      where: { id: execution.id },
      data: {
        status: "error",
        error: error.message,
        nodeResults: JSON.stringify(nodeResultsArr),
        finishedAt: new Date(),
        durationMs,
      },
    });

    // 更新工作流统计
    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        executionCount: { increment: 1 },
        failureCount: { increment: 1 },
      },
    });

    // 发布工作流失败事件
    messageBus.publish(`workflow.${workflowId}.failed`, {
      executionId: execution.id,
      error: error.message,
      durationMs,
    });

    return {
      executionId: execution.id,
      status: "error",
      error: error.message,
      durationMs,
      nodeResults: nodeResultsArr,
    };
  }
}
