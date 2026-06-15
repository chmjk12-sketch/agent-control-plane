# Agent Control Plane V3.0 Phase 1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成基础加固（Swap、PostgreSQL 共享、Prisma 修复、ICP 备案）

**Architecture:** 在现有 V2.0 架构上修补，不引入新服务，确保 2核2G 稳定运行

**Tech Stack:** Docker, Docker Compose, PostgreSQL, Prisma, Caddy, GitHub Actions

---

## 文件变更总览

| 文件 | 操作 | 说明 |
|------|------|------|
| `.github/workflows/deploy.yml` | 修改 | 增加 Swap 挂载、强制删除容器、精简 Caddy 配置 |
| `docker-compose.yml` | 修改 | 资源限制、共享 PostgreSQL、移除独立网络 |
| `Dockerfile` | 修改 | Prisma 引擎修复、精简层 |
| `prisma/schema.prisma` | 修改 | 新增 Environment 表、Agent MCP 字段 |
| `src/lib/caddy-manager.ts` | 修改 | 支持 Caddyfile 片段生成 + reload |
| `scripts/setup-swap.sh` | 新增 | ECS Swap 挂载脚本 |

---

## Task 1: ECS Swap 挂载

**Files:**
- Create: `scripts/setup-swap.sh`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: 编写 Swap 挂载脚本**

```bash
#!/bin/bash
# scripts/setup-swap.sh
# ECS 2核2G 必须挂载 Swap 防 OOM

set -e

SWAP_SIZE="4G"
SWAP_FILE="/swapfile"

# 检查是否已有 Swap
if swapon --show | grep -q "$SWAP_FILE"; then
    echo "Swap 已存在: $(swapon --show=SIZE,USED --noheadings $SWAP_FILE)"
    exit 0
fi

# 创建 Swap 文件
if [ ! -f "$SWAP_FILE" ]; then
    echo "创建 ${SWAP_SIZE} Swap 文件..."
    fallocate -l $SWAP_SIZE $SWAP_FILE || dd if=/dev/zero of=$SWAP_FILE bs=1M count=4096
    chmod 600 $SWAP_FILE
    mkswap $SWAP_FILE
fi

# 启用 Swap
swapon $SWAP_FILE

# 持久化到 /etc/fstab
if ! grep -q "$SWAP_FILE" /etc/fstab; then
    echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
fi

# 调整 swappiness
echo "vm.swappiness=60" >> /etc/sysctl.conf
sysctl -p

echo "Swap 配置完成:"
swapon --show
echo "内存状态:"
free -h
```

- [ ] **Step 2: 在 deploy.yml 中调用 Swap 脚本**

在 SSH 部署脚本的最开头添加：

```yaml
- name: Setup Swap
  run: |
    ssh ${{ secrets.ECS_USER }}@${{ env.ECS_HOST }} '
      if [ ! -f /swapfile ]; then
        sudo fallocate -l 4G /swapfile
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile
        sudo swapon /swapfile
        echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab
        echo "vm.swappiness=60" | sudo tee -a /etc/sysctl.conf
        sudo sysctl -p
      fi
      echo "=== Swap Status ==="
      swapon --show
      free -h
    '
```

- [ ] **Step 3: Commit**

```bash
git add scripts/setup-swap.sh .github/workflows/deploy.yml
git commit -m "feat: add 4G swap setup for ECS 2G RAM OOM protection"
```

---

## Task 2: Docker Compose 资源限制

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: 添加资源限制和共享配置**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: cp-postgres
    restart: unless-stopped
    # 资源限制
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-cp_admin}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-cp_admin_2024_secure}
      POSTGRES_DB: ${POSTGRES_DB:-agent_control_plane}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - caddy-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-cp_admin}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: agent-control-plane:latest
    container_name: cp-app
    restart: unless-stopped
    # 资源限制
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
    env_file:
      - .env
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-cp_admin}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-agent_control_plane}?schema=public
      NODE_ENV: production
    depends_on:
      postgres:
        condition: service_healthy
    expose:
      - "3000"
    networks:
      - caddy-net
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 40s

  caddy:
    image: caddy:2-alpine
    container_name: cp-caddy
    restart: unless-stopped
    # 资源限制
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 128M
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      app:
        condition: service_healthy
    networks:
      - caddy-net

volumes:
  postgres-data:
  caddy-data:
  caddy-config:

networks:
  caddy-net:
    driver: bridge
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add Docker resource limits for 2C2G ECS"
```

---

## Task 3: Prisma OpenSSL 修复

**Files:**
- Modify: `Dockerfile`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 修复 Dockerfile 中 Prisma 引擎生成**

```dockerfile
# Stage 1: Builder
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# 安装 OpenSSL 和构建依赖
RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

# 显式指定 binary target，避免自动检测错误
RUN npx prisma generate --schema=./prisma/schema.prisma

RUN npm run build

# Stage 2: Runner
FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# 运行时只需要 OpenSSL
RUN apt-get update -y && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

# 复制 standalone 输出
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 复制 Prisma 必需文件
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# 验证引擎存在
RUN ls -la ./node_modules/.prisma/client/libquery_engine-*

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
```

- [ ] **Step 2: 验证 schema.prisma 的 binaryTargets**

确保已有：
```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile prisma/schema.prisma
git commit -m "fix: prisma openssl engine detection for bookworm-slim"
```

---

## Task 4: Caddy 动态路由（Caddyfile + reload）

**Files:**
- Modify: `src/lib/caddy-manager.ts`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: 重写 caddy-manager.ts**

```typescript
// src/lib/caddy-manager.ts
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const CADDY_FILE = '/opt/app/Caddyfile';
const AGENTS_DIR = '/opt/app/caddy-agents';

interface AgentRoute {
  slug: string;
  containerName: string;
  port: number;
  domain?: string;
}

export class CaddyManager {
  /**
   * 生成 Agent 的 Caddyfile 片段
   */
  static async generateAgentRoute(agent: AgentRoute): Promise<string> {
    const domain = agent.domain || `${agent.slug}.chmjk67.top`;
    return `
# Agent: ${agent.slug}
${domain} {
    reverse_proxy ${agent.containerName}:${agent.port}
}
`;
  }

  /**
   * 写入 Agent 路由片段
   */
  static async writeAgentRoute(agent: AgentRoute): Promise<void> {
    await fs.mkdir(AGENTS_DIR, { recursive: true });
    const routeFile = `${AGENTS_DIR}/${agent.slug}.caddy`;
    const content = await this.generateAgentRoute(agent);
    await fs.writeFile(routeFile, content, 'utf-8');
  }

  /**
   * 删除 Agent 路由
   */
  static async removeAgentRoute(slug: string): Promise<void> {
    const routeFile = `${AGENTS_DIR}/${slug}.caddy`;
    try {
      await fs.unlink(routeFile);
    } catch (e) {
      // 文件不存在，忽略
    }
  }

  /**
   * 重新生成主 Caddyfile 并 reload
   */
  static async reloadCaddy(): Promise<void> {
    // 读取所有 Agent 路由
    const files = await fs.readdir(AGENTS_DIR).catch(() => []);
    let routes = '';
    
    for (const file of files) {
      if (file.endsWith('.caddy')) {
        const content = await fs.readFile(`${AGENTS_DIR}/${file}`, 'utf-8');
        routes += content + '\n';
      }
    }

    // 生成完整 Caddyfile
    const caddyfile = `
# 控制平面默认路由
:80 {
    reverse_proxy cp-app:3000
}

# Agent 动态路由
${routes}
`;

    await fs.writeFile(CADDY_FILE, caddyfile, 'utf-8');

    // 热重载 Caddy
    try {
      await execAsync('docker exec cp-caddy caddy reload --config /etc/caddy/Caddyfile');
    } catch (e) {
      console.error('Caddy reload failed:', e);
      throw e;
    }
  }
}
```

- [ ] **Step 2: 在 deploy.yml 中创建 caddy-agents 目录**

```yaml
# 在部署脚本中添加
mkdir -p /opt/app/caddy-agents
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/caddy-manager.ts
git commit -m "feat: caddy dynamic routing via Caddyfile fragments + reload"
```

---

## Task 5: Prisma Schema 扩展（Environment + MCP）

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 新增 Environment 表和 MCP 字段**

```prisma
// 新增：环境管理
model Environment {
  id        String   @id @default(cuid())
  name      String   @unique // dev | staging | prod
  agents    Agent[]
  createdAt DateTime @default(now()) @map("created_at")
}

// 修改 Agent：增加 MCP 和环境关联
model Agent {
  id                  String   @id @default(cuid())
  name                String
  slug                String   @unique
  description         String?
  status              String   @default("offline")
  model               String   @default("deepseek-chat")
  tags                String   @default("[]")
  icon                String   @default("bot")
  endpoint            String?
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  // V2.0 字段
  environmentSlot     String   @default("blue") @map("environment_slot")
  trafficWeight       Int      @default(100) @map("traffic_weight")
  deployStrategy      String   @default("blue-green") @map("deploy_strategy")
  healthCheckPath     String   @default("/health") @map("health_check_path")
  healthCheckInterval Int      @default(30) @map("health_check_interval")
  containerName       String?  @map("container_name")
  internalPort        Int      @default(3000) @map("internal_port")
  registryImage       String?  @map("registry_image")
  maxCostBudget       Float    @default(0) @map("max_cost_budget")
  apiKeyHash          String?  @map("api_key_hash")

  // V3.0 新增：MCP 支持
  mcpEnabled          Boolean  @default(false) @map("mcp_enabled")
  mcpToolsEndpoint    String?  @map("mcp_tools_endpoint")

  // V3.0 新增：环境关联
  environmentId       String?  @map("environment_id")
  environment         Environment? @relation(fields: [environmentId], references: [id])

  versions       AgentVersion[]
  deployments    Deployment[]
  executions     AgentExecution[]
  health         AgentHealth[]
  healthCheckLogs HealthCheckLog[]
  alerts         Alert[]
  apiKeys        ApiKey[]
}
```

- [ ] **Step 2: 生成迁移文件**

```bash
npx prisma migrate dev --name add_environment_and_mcp
```

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Environment table and MCP fields to Agent"
```

---

## Task 6: deploy.yml 增强（强制删除 + 精简）

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: 修复容器部署逻辑**

在 SSH 脚本中修改部署部分：

```bash
# --- [5/7] 部署容器 ---
echo ""
echo "=== [5/7] 部署容器 ==="

# 强制停止并删除旧容器（避免名称冲突）
docker stop cp-app 2>/dev/null || true
docker rm -f cp-app 2>/dev/null || true
sleep 2

# 启动新容器
docker run -d --name cp-app \
  --network caddy-net \
  -p 3000:3000 \
  --restart unless-stopped \
  --memory=512m \
  --cpus=0.5 \
  -e DATABASE_URL="postgresql://cp_admin:cp_admin_2024_secure@cp-postgres:5432/agent_control_plane?schema=public" \
  -e NODE_ENV=production \
  "$IMAGE"

echo "容器已启动"
```

- [ ] **Step 2: 精简 Caddy 配置更新**

```bash
# --- [7/7] Caddy 配置更新 ---
echo ""
echo "=== [7/7] Caddy 配置 ==="

# 确保目录存在
mkdir -p /opt/app/caddy-agents

# 生成基础 Caddyfile
cat > /opt/app/Caddyfile << 'EOF'
:80 {
    reverse_proxy cp-app:3000
}
EOF

# 加载 Agent 路由片段
for f in /opt/app/caddy-agents/*.caddy; do
    if [ -f "$f" ]; then
        cat "$f" >> /opt/app/Caddyfile
    fi
done

# 热重载 Caddy
docker exec cp-caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || {
    echo "Caddy reload failed, restarting..."
    docker restart cp-caddy
}

echo "Caddy 配置已更新"
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "fix: force remove container before deploy, simplify caddy config"
```

---

## Task 7: 集成测试

**Files:**
- Modify: `.github/workflows/deploy.yml`（添加测试步骤）

- [ ] **Step 1: 在 GitHub Actions 中添加测试阶段**

```yaml
# 在 build-and-deploy job 中添加 test 阶段
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run linter
        run: npm run lint
        
      - name: Type check
        run: npx tsc --noEmit
        
      # 注意：不运行真实数据库测试，仅做编译检查
      # 真实测试在部署后的健康检查中验证
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add type check and lint to GitHub Actions"
```

---

## 验证清单

部署完成后验证：

```bash
# 1. 检查 Swap
swapon --show
free -h

# 2. 检查容器资源限制
docker stats --no-stream

# 3. 检查 Caddy 路由
docker exec cp-caddy caddy list-modules

# 4. 检查 Prisma 引擎
docker exec cp-app ls -la node_modules/.prisma/client/

# 5. 检查 API 健康
curl http://localhost:3000/api/health

# 6. 检查数据库迁移
docker exec cp-postgres psql -U cp_admin -c "\dt"
```

---

*计划结束*
