import { prisma } from "./prisma";

export interface CaddyRoute {
  domain: string;
  upstreams: Array<{
    address: string;
    weight: number;
  }>;
}

export class CaddyManager {
  private caddyfilePath: string;
  private caddyContainer: string;

  constructor(
    caddyfilePath = "/opt/app/Caddyfile",
    caddyContainer = "caddy"
  ) {
    this.caddyfilePath = caddyfilePath;
    this.caddyContainer = caddyContainer;
  }

  /**
   * 生成 Caddy 路由配置块
   */
  generateRouteBlock(route: CaddyRoute): string {
    if (route.upstreams.length === 1) {
      return `${route.domain} {
    reverse_proxy ${route.upstreams[0].address}
}`;
    }

    const upstreamLines = route.upstreams
      .map((u) => `        to ${u.address} weight=${u.weight}`)
      .join("\n");

    return `${route.domain} {
    reverse_proxy {
        lb_policy weighted_round_robin
${upstreamLines}
    }
}`;
  }

  /**
   * 切换蓝绿流量（单 upstream）
   */
  async switchTraffic(
    agentId: string,
    targetSlot: "blue" | "green"
  ): Promise<{ success: boolean; command: string }> {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new Error("Agent not found");

    const targetContainer = `${agent.containerName}_${targetSlot}`;
    const domain = `${agent.slug}.chmjk67.top`;

    // 生成 sed 命令替换 upstream
    const oldPattern = `${agent.containerName}_(blue|green):${agent.internalPort}`;
    const newUpstream = `${targetContainer}:${agent.internalPort}`;

    const command = `
# 备份 Caddyfile
cp ${this.caddyfilePath} ${this.caddyfilePath}.bak.$(date +%s)

# 替换 upstream
sed -i 's|${oldPattern}|${newUpstream}|g' ${this.caddyfilePath}

# 重载 Caddy
docker exec ${this.caddyContainer} caddy reload --config /etc/caddy/Caddyfile
`;

    return { success: true, command };
  }

  /**
   * 设置灰度权重（多 upstream）
   */
  async setCanaryWeight(
    agentId: string,
    newWeight: number
  ): Promise<{ success: boolean; command: string }> {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new Error("Agent not found");

    const blueWeight = 100 - newWeight;
    const greenWeight = newWeight;
    const domain = `${agent.slug}.chmjk67.top`;

    const route: CaddyRoute = {
      domain,
      upstreams: [
        {
          address: `${agent.containerName}_blue:${agent.internalPort}`,
          weight: blueWeight,
        },
        {
          address: `${agent.containerName}_green:${agent.internalPort}`,
          weight: greenWeight,
        },
      ],
    };

    const newBlock = this.generateRouteBlock(route);

    // 使用 Python 脚本精确替换路由块
    const command = `
# 备份 Caddyfile
cp ${this.caddyfilePath} ${this.caddyfilePath}.bak.$(date +%s)

# Python 替换路由块
python3 -c "
import re
with open('${this.caddyfilePath}', 'r') as f:
    content = f.read()

pattern = r'${domain}\\\\s*\\\\{[^\\\\}]+\\\\}'
replacement = '''${newBlock}'''

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('${this.caddyfilePath}', 'w') as f:
    f.write(content)
"

# 重载 Caddy
docker exec ${this.caddyContainer} caddy reload --config /etc/caddy/Caddyfile
`;

    return { success: true, command };
  }

  /**
   * 注释掉路由（下架）
   */
  async disableRoute(agentId: string): Promise<{ success: boolean; command: string }> {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new Error("Agent not found");

    const domain = `${agent.slug}.chmjk67.top`;

    const command = `
# 备份 Caddyfile
cp ${this.caddyfilePath} ${this.caddyfilePath}.bak.$(date +%s)

# 注释掉该 Agent 的路由块
python3 -c "
import re
with open('${this.caddyfilePath}', 'r') as f:
    content = f.read()

pattern = r'(${domain}\\\\s*\\\\{[^\\\\}]+\\\\})'
content = re.sub(pattern, r'# DISABLED by CP\\\\n# \\1', content, flags=re.DOTALL)

with open('${this.caddyfilePath}', 'w') as f:
    f.write(content)
"

# 重载 Caddy
docker exec ${this.caddyContainer} caddy reload --config /etc/caddy/Caddyfile
`;

    return { success: true, command };
  }

  /**
   * 启用路由（上架）
   */
  async enableRoute(agentId: string): Promise<{ success: boolean; command: string }> {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new Error("Agent not found");

    const domain = `${agent.slug}.chmjk67.top`;
    const upstream = `${agent.containerName}_${agent.environmentSlot}:${agent.internalPort}`;

    const route: CaddyRoute = {
      domain,
      upstreams: [{ address: upstream, weight: 100 }],
    };

    const block = this.generateRouteBlock(route);

    const command = `
# 备份 Caddyfile
cp ${this.caddyfilePath} ${this.caddyfilePath}.bak.$(date +%s)

# 移除注释并恢复路由
python3 -c "
import re
with open('${this.caddyfilePath}', 'r') as f:
    content = f.read()

# 移除 DISABLED 注释块
pattern = r'# DISABLED by CP\\\\n# (${domain}\\\\s*\\\\{[^\\\\}]+\\\\})'
content = re.sub(pattern, r'\\1', content, flags=re.DOTALL)

# 如果路由不存在，追加到文件末尾
if '${domain}' not in content:
    content += '\\\\n${block}\\\\n'

with open('${this.caddyfilePath}', 'w') as f:
    f.write(content)
"

# 重载 Caddy
docker exec ${this.caddyContainer} caddy reload --config /etc/caddy/Caddyfile
`;

    return { success: true, command };
  }
}

export const caddyManager = new CaddyManager();
