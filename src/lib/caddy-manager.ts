import { exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "./prisma";

const CADDY_AGENTS_DIR = path.join(process.cwd(), "caddy-agents");
const CADDYFILE_PATH = path.join(process.cwd(), "Caddyfile");
const CADDY_CONTAINER = "acp-caddy";

export interface AgentRouteInfo {
  slug: string;
  containerName: string | null;
  slot: string;
  internalPort: number;
}

/**
 * 生成单个 Agent 的 Caddyfile 片段
 */
export function generateAgentRoute(agent: AgentRouteInfo): string {
  const domain = `${agent.slug}.chmjk67.top`;
  const upstream = agent.containerName
    ? `${agent.containerName}_${agent.slot}:${agent.internalPort}`
    : `${agent.slug}_app:${agent.internalPort}`;

  return `${domain} {
	reverse_proxy ${upstream}
}`;
}

/**
 * 写入 Agent 路由片段到 caddy-agents/ 目录
 */
export async function writeAgentRoute(agent: AgentRouteInfo): Promise<void> {
  await fs.mkdir(CADDY_AGENTS_DIR, { recursive: true });
  const fragment = generateAgentRoute(agent);
  const filePath = path.join(CADDY_AGENTS_DIR, `${agent.slug}.conf`);
  await fs.writeFile(filePath, fragment, "utf-8");
}

/**
 * 删除 Agent 路由片段
 */
export async function removeAgentRoute(slug: string): Promise<void> {
  const filePath = path.join(CADDY_AGENTS_DIR, `${slug}.conf`);
  try {
    await fs.unlink(filePath);
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      throw err;
    }
    // 文件不存在，忽略
  }
}

/**
 * 重新生成主 Caddyfile 并 reload Caddy
 */
export async function reloadCaddy(): Promise<void> {
  // 读取主 Caddyfile 头部（非 agent 路由部分）
  let mainCaddyfile = "";
  try {
    mainCaddyfile = await fs.readFile(CADDYFILE_PATH, "utf-8");
  } catch {
    mainCaddyfile = "";
  }

  // 提取主 Caddyfile 中非 agent 路由的内容（保留非 *.chmjk67.top 的块）
  const lines = mainCaddyfile.split("\n");
  const mainLines: string[] = [];
  let skipBlock = false;

  for (const line of lines) {
    // 检测 agent 路由块（*.chmjk67.top），跳过
    if (/^[a-z0-9-]+\.chmjk67\.top\s*\{/.test(line.trim())) {
      skipBlock = true;
      continue;
    }
    if (skipBlock && line.trim() === "}") {
      skipBlock = false;
      continue;
    }
    if (!skipBlock) {
      mainLines.push(line);
    }
  }

  // 读取所有 agent 路由片段
  let agentFragments = "";
  try {
    const files = await fs.readdir(CADDY_AGENTS_DIR);
    const confFiles = files.filter((f) => f.endsWith(".conf")).sort();
    for (const file of confFiles) {
      const content = await fs.readFile(
        path.join(CADDY_AGENTS_DIR, file),
        "utf-8"
      );
      agentFragments += content.trim() + "\n\n";
    }
  } catch {
    // caddy-agents 目录不存在，忽略
  }

  // 组合主 Caddyfile
  const newCaddyfile = mainLines.join("\n").trimEnd() + "\n\n" + agentFragments.trimEnd() + "\n";
  await fs.writeFile(CADDYFILE_PATH, newCaddyfile, "utf-8");

  // Reload Caddy
  await new Promise<void>((resolve, reject) => {
    exec(
      `docker exec ${CADDY_CONTAINER} caddy reload --config /etc/caddy/Caddyfile`,
      (err, stdout, stderr) => {
        if (err) {
          console.error("Caddy reload failed:", stderr);
          reject(new Error(`Caddy reload failed: ${stderr}`));
        } else {
          console.log("Caddy reloaded:", stdout);
          resolve();
        }
      }
    );
  });
}

/**
 * 添加 Agent 路由并 reload
 */
export async function addAgentRoute(agent: AgentRouteInfo): Promise<void> {
  await writeAgentRoute(agent);
  await reloadCaddy();
}

/**
 * 移除 Agent 路由并 reload
 */
export async function removeAgentRouteAndReload(slug: string): Promise<void> {
  await removeAgentRoute(slug);
  await reloadCaddy();
}

/**
 * 同步所有在线 Agent 的路由
 */
export async function syncAllAgentRoutes(): Promise<{
  synced: string[];
  removed: string[];
}> {
  const onlineAgents = await prisma.agent.findMany({
    where: { status: "online" },
    select: {
      slug: true,
      containerName: true,
      environmentSlot: true,
      internalPort: true,
    },
  });

  // 获取当前已有的路由片段
  const existingSlugs = new Set<string>();
  try {
    const files = await fs.readdir(CADDY_AGENTS_DIR);
    for (const file of files) {
      if (file.endsWith(".conf")) {
        existingSlugs.add(file.replace(".conf", ""));
      }
    }
  } catch {
    // 目录不存在
  }

  const synced: string[] = [];
  const removed: string[] = [];

  // 写入所有在线 Agent 的路由
  for (const agent of onlineAgents) {
    await writeAgentRoute({
      slug: agent.slug,
      containerName: agent.containerName,
      slot: agent.environmentSlot,
      internalPort: agent.internalPort,
    });
    synced.push(agent.slug);
    existingSlugs.delete(agent.slug);
  }

  // 删除离线 Agent 的路由片段
  for (const slug of existingSlugs) {
    await removeAgentRoute(slug);
    removed.push(slug);
  }

  // Reload Caddy
  await reloadCaddy();

  return { synced, removed };
}

export const caddyManager = {
  generateAgentRoute,
  writeAgentRoute,
  removeAgentRoute,
  reloadCaddy,
  addAgentRoute,
  removeAgentRouteAndReload,
  syncAllAgentRoutes,
};
