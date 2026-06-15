// Template Engine - 模板引擎，负责 Fork 模板、变量替换和内置模板管理

import { prisma } from "./prisma";
import {
  createRepoFromTemplate,
  createFiles,
  getFileContent,
  getRepoContents,
} from "./github-client";

// --- Fork 模板 ---

export interface ForkTemplateOptions {
  templateId: string;
  agentId: string;
  agentName: string;
  agentSlug: string;
  variables?: Record<string, string>;
}

export interface ForkResult {
  success: boolean;
  repoUrl?: string;
  owner?: string;
  repo?: string;
  error?: string;
}

/**
 * Fork 模板创建新 Agent 项目
 */
export async function forkTemplate(
  options: ForkTemplateOptions
): Promise<ForkResult> {
  const { templateId, agentId, agentName, agentSlug, variables = {} } = options;

  // 1. 获取模板信息
  const template = await prisma.template.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    return { success: false, error: "Template not found" };
  }

  const org = process.env.GITHUB_ORG || "";
  const repoName = `agent-${agentSlug}`;
  const branch = template.githubBranch || "main";

  try {
    // 2. 从模板仓库创建新仓库
    if (template.githubRepo) {
      const [templateOwner, templateRepo] = template.githubRepo.split("/");
      if (templateOwner && templateRepo) {
        await createRepoFromTemplate({
          templateOwner,
          templateRepo,
          repoName,
          description: `${agentName} - forked from ${template.name}`,
          private: true,
        });

        // 3. 应用变量替换
        if (Object.keys(variables).length > 0) {
          await applyVariables(org, repoName, variables, branch);
        }

        // 4. 记录 AgentTemplate 关联
        await prisma.agentTemplate.create({
          data: {
            agentId,
            templateId,
            variables: JSON.stringify(variables),
          },
        });

        // 5. 更新模板 fork 计数
        await prisma.template.update({
          where: { id: templateId },
          data: { forkCount: { increment: 1 } },
        });

        return {
          success: true,
          repoUrl: `https://github.com/${org}/${repoName}`,
          owner: org,
          repo: repoName,
        };
      }
    }

    return { success: false, error: "Template githubRepo is not configured" };
  } catch (err) {
    return {
      success: false,
      error: `Fork failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// --- 变量替换 ---

/**
 * 在仓库文件中替换 {{varName}} 变量
 */
export async function applyVariables(
  owner: string,
  repo: string,
  variables: Record<string, string>,
  branch: string = "main"
): Promise<void> {
  // 获取仓库根目录文件列表
  const contents = (await getRepoContents(owner, repo, "", branch)) as Array<{
    type: string;
    path: string;
    name: string;
  }>;

  const filesToUpdate: Array<{ path: string; content: string }> = [];

  for (const item of contents) {
    if (item.type === "file") {
      try {
        const content = await getFileContent(owner, repo, item.path, branch);
        const replaced = replaceVariables(content, variables);
        if (replaced !== content) {
          filesToUpdate.push({ path: item.path, content: replaced });
        }
      } catch {
        // 跳过无法读取的文件（如二进制文件）
      }
    }
  }

  if (filesToUpdate.length > 0) {
    await createFiles(
      owner,
      repo,
      filesToUpdate,
      "chore: apply template variables",
      branch
    );
  }
}

/**
 * 替换字符串中的 {{varName}} 变量
 */
function replaceVariables(
  content: string,
  variables: Record<string, string>
): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${escapeRegex(key)}\\}\\}`, "g"), value);
  }
  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- 模板列表 ---

export interface TemplateListItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  type: string;
  icon: string;
  tags: string[];
  forkCount: number;
  usageCount: number;
  githubRepo: string;
  githubBranch: string;
}

/**
 * 获取模板列表
 */
export async function listTemplates(
  type?: string
): Promise<TemplateListItem[]> {
  const where = type ? { type } : {};
  const templates = await prisma.template.findMany({
    where,
    orderBy: [{ usageCount: "desc" }, { createdAt: "desc" }],
  });

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description || undefined,
    type: t.type,
    icon: t.icon,
    tags: JSON.parse(t.tags),
    forkCount: t.forkCount,
    usageCount: t.usageCount,
    githubRepo: t.githubRepo,
    githubBranch: t.githubBranch,
  }));
}

// --- 内置模板初始化 ---

const BUILTIN_TEMPLATES = [
  {
    name: "Agent Base",
    slug: "agent-base",
    description: "基础 Agent 模板，包含 FastAPI 项目结构和健康检查",
    type: "fastapi",
    icon: "bot",
    tags: JSON.stringify(["base", "fastapi", "starter"]),
    githubRepo: "",
    githubBranch: "main",
    variables: JSON.stringify([
      { name: "agent_name", label: "Agent 名称", type: "string", required: true },
      { name: "agent_port", label: "端口", type: "number", default: "3000" },
    ]),
    files: JSON.stringify([
      "agent.yaml",
      "Dockerfile",
      ".trae/rules.md",
      "src/main.py",
      "tests/test_health.py",
    ]),
  },
];

/**
 * 初始化内置模板（如果不存在则创建）
 */
export async function seedBuiltinTemplates(): Promise<number> {
  let count = 0;
  for (const tmpl of BUILTIN_TEMPLATES) {
    const existing = await prisma.template.findUnique({
      where: { slug: tmpl.slug },
    });
    if (!existing) {
      await prisma.template.create({ data: tmpl });
      count++;
    }
  }
  return count;
}
