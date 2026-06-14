import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create users
  const user1 = await prisma.user.create({
    data: {
      name: "Zhang Wei",
      email: "zhangwei@example.com",
      role: "admin",
    },
  });
  const user2 = await prisma.user.create({
    data: {
      name: "Li Na",
      email: "lina@example.com",
      role: "member",
    },
  });

  // Agent definitions
  const agentDefs = [
    {
      name: "Business Insight Agent",
      slug: "business-insight",
      description: "Analyzes market trends and identifies business opportunities using real-time data and LLM reasoning.",
      model: "gpt-4-turbo",
      tags: JSON.stringify(["business", "market-analysis", "insight"]),
      icon: "trending-up",
      endpoint: "http://10.0.1.10:3001",
      status: "online",
    },
    {
      name: "Root Cause Analysis Agent",
      slug: "root-cause-analysis",
      description: "Performs deep root cause analysis on system incidents using chain-of-thought reasoning and log analysis.",
      model: "claude-3-opus",
      tags: JSON.stringify(["devops", "analysis", "troubleshooting"]),
      icon: "search",
      endpoint: "http://10.0.1.10:3002",
      status: "online",
    },
    {
      name: "Investment Research Agent",
      slug: "investment-research",
      description: "Conducts comprehensive investment research, analyzing financial reports, market conditions, and generating investment theses.",
      model: "gpt-4-turbo",
      tags: JSON.stringify(["finance", "research", "investment"]),
      icon: "line-chart",
      endpoint: "http://10.0.1.10:3003",
      status: "online",
    },
    {
      name: "Stock Picker Agent",
      slug: "stock-picker",
      description: "Selects stocks based on multi-factor quantitative analysis combined with qualitative LLM assessment.",
      model: "gpt-4",
      tags: JSON.stringify(["stock", "quant", "trading"]),
      icon: "bar-chart-3",
      endpoint: "http://10.0.1.10:3004",
      status: "degraded",
    },
    {
      name: "Document Summarizer Agent",
      slug: "document-summarizer",
      description: "Summarizes long documents with high accuracy, preserving key information and generating structured outputs.",
      model: "claude-3-sonnet",
      tags: JSON.stringify(["document", "nlp", "summarization"]),
      icon: "file-text",
      endpoint: "http://10.0.1.10:3005",
      status: "offline",
    },
  ];

  const gitCommits = [
    "a1b2c3d", "e4f5g6h", "i7j8k9l", "m0n1o2p",
    "q3r4s5t", "u6v7w8x", "y9z0a1b", "c2d3e4f",
    "g5h6i7j", "k8l9m0n", "o1p2q3r", "s4t5u6v",
  ];

  const imageTags = [
    "ghcr.io/company/business-insight:v1.2.3",
    "ghcr.io/company/root-cause:v2.0.1",
    "ghcr.io/company/investment-research:v1.5.0",
    "ghcr.io/company/stock-picker:v0.9.2",
    "ghcr.io/company/doc-summarizer:v1.0.0",
  ];

  for (let i = 0; i < agentDefs.length; i++) {
    const def = agentDefs[i];
    const agent = await prisma.agent.create({ data: def });

    // Create 3 versions per agent
    for (let v = 0; v < 3; v++) {
      const version = await prisma.agentVersion.create({
        data: {
          agentId: agent.id,
          versionTag: `v${1 + v}.${i}.0`,
          codeRef: `refs/tags/v${1 + v}.${i}.0`,
          promptRef: `prompt_${gitCommits[v * 2]}`,
          modelRef: v === 0 ? "gpt-4" : v === 1 ? "gpt-4-turbo" : "claude-3-opus",
          toolConfig: JSON.stringify({
            tools: ["web_search", "data_analysis", "report_generation"],
            max_tool_calls: 5,
          }),
          envVars: JSON.stringify({
            LOG_LEVEL: "info",
            MAX_TOKENS: "4096",
            TEMPERATURE: "0.7",
          }),
          imageTag: imageTags[i].replace(/:[^:]+$/, `:v${1 + v}.${i}.0`),
          gitCommit: gitCommits[v * 2],
          changelog: `Version ${1 + v}.${i}.0: ${v === 0 ? "Initial release" : v === 1 ? "Added streaming support" : "Performance improvements & bug fixes"}`,
        },
      });

      // Create 1 deployment per version
      const deployStatuses = ["success", "success", "success"];
      await prisma.deployment.create({
        data: {
          agentId: agent.id,
          versionId: version.id,
          gitCommit: gitCommits[v * 2],
          imageTag: version.imageTag,
          status: deployStatuses[v],
          resultLog: `Deployed ${version.imageTag} to ECS cluster successfully. Git commit: ${gitCommits[v * 2]}`,
          deployedAt: new Date(Date.now() - (3 - v) * 7 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Create health records
    const now = new Date();
    const statuses: Array<"running" | "degraded" | "offline"> = ["running", "running", "running", "degraded", "offline"];
    await prisma.agentHealth.create({
      data: {
        agentId: agent.id,
        status: statuses[i],
        uptime: i < 3 ? Math.floor(Math.random() * 604800) + 86400 : Math.floor(Math.random() * 3600),
        memoryMb: Math.floor(Math.random() * 400) + 100,
        cpuPercent: Math.floor(Math.random() * 60) + 10,
        restartCount: Math.floor(Math.random() * 5),
        lastHeartbeat: new Date(now.getTime() - Math.floor(Math.random() * 30000)),
      },
    });

    // Create execution records
    const models = ["gpt-4", "gpt-4-turbo", "claude-3-opus", "claude-3-sonnet"];
    const execStatuses = ["success", "success", "success", "success", "failed"];

    for (let e = 0; e < 50; e++) {
      const inputTokens = Math.floor(Math.random() * 8000) + 500;
      const outputTokens = Math.floor(Math.random() * 4000) + 200;
      const totalTokens = inputTokens + outputTokens;
      const model = models[Math.floor(Math.random() * models.length)];
      const costPer1k = model.startsWith("gpt-4") ? 0.03 : model.startsWith("claude") ? 0.015 : 0.01;
      const cost = (totalTokens / 1000) * costPer1k;
      const status = execStatuses[Math.floor(Math.random() * execStatuses.length)];
      const latencyMs = Math.floor(Math.random() * 15000) + 500;

      await prisma.agentExecution.create({
        data: {
          agentId: agent.id,
          versionId: (await prisma.agentVersion.findFirst({ where: { agentId: agent.id }, orderBy: { createdAt: "desc" } }))?.id,
          requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${e}`,
          userId: e % 3 === 0 ? user1.id : user2.id,
          inputTokens,
          outputTokens,
          totalTokens,
          cost,
          latencyMs,
          status,
          errorMsg: status === "failed" ? "Timeout exceeded" : null,
          createdAt: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)),
        },
      });
    }
  }

  console.log("Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
