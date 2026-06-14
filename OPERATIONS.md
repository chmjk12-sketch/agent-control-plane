# Agent Control Plane 运维手册

> 文档版本：v1.0
> 更新日期：2026-06-14
> 适用项目：Agent Control Plane（AI 智能体统一管理平台）

---

## 目录

1. [项目概述](#1-项目概述)
2. [部署架构](#2-部署架构)
3. [环境变量清单](#3-环境变量清单)
4. [运维操作手册](#4-运维操作手册)
5. [数据库运维](#5-数据库运维)
6. [监控与告警](#6-监控与告警)
7. [安全建议](#7-安全建议)

---

## 1. 项目概述

### 1.1 产品定位

Agent Control Plane 是一个 **AI 智能体统一管理平台**，提供以下核心能力：

- 多智能体（Agent）生命周期管理
- 对话历史与上下文管理
- 工具（Tool）注册与调用编排
- 统一 API 网关与权限控制
- 可视化管理后台

### 1.2 访问地址

| 环境 | 地址 |
|------|------|
| 生产环境 | https://administrator.chmjk67.top |
| 服务器 IP | 39.105.86.184:3004 |

### 1.3 技术栈

| 层级 | 技术选型 | 版本 |
|------|----------|------|
| 前端框架 | Next.js | 15.x |
| UI 库 | React | 18.x |
| 开发语言 | TypeScript | 5.x |
| 样式方案 | Tailwind CSS | 3.x |
| ORM | Prisma | 5.x |
| 数据库 | SQLite | 3.x |
| 运行时 | Node.js | 20.x LTS |
| 容器化 | Docker | 24.x+ |
| 反向代理 | Caddy | 2.x |
| CI/CD | GitHub Actions | - |
| 镜像仓库 | 阿里云容器镜像服务（ACR） | - |
| 云服务器 | 阿里云 ECS | - |

### 1.4 服务器信息

```
公网 IP：39.105.86.184
内网 IP：172.17.0.1（Docker 网桥）
开放端口：22 (SSH)、80 (HTTP)、443 (HTTPS)、3004 (应用)
域名：administrator.chmjk67.top
```

---

## 2. 部署架构

### 2.1 整体架构图

```
+------------------+        +-------------------+        +------------------+
|     用户         |  HTTPS  |   Caddy 反向代理   |  HTTP  |  Next.js 应用    |
|  (浏览器)        | <-----> |  80/443 端口      | <-----> |  3004 端口       |
+------------------+        +-------------------+        +------------------+
                                    |                           |
                                    |                           v
                                    |                    +------------------+
                                    |                    |   Docker 容器     |
                                    |                    |  (Node.js App)   |
                                    |                    +------------------+
                                    |                           |
                                    v                           v
                           +-------------------+        +------------------+
                           |  自动 HTTPS 证书   |        |   SQLite 数据库   |
                           |  (Let's Encrypt)  |        |  (prisma/dev.db)  |
                           +-------------------+        +------------------+
```

### 2.2 Docker 多阶段构建流程

项目采用多阶段构建（Multi-stage Build）以减小最终镜像体积：

```dockerfile
# 阶段一：依赖安装
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# 阶段二：构建应用
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# 阶段三：运行环境
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3000
CMD ["node", "server.js"]
```

构建命令示例：

```bash
# 本地构建测试
docker build -t agent-control-plane:latest .

# 查看镜像大小
docker images agent-control-plane:latest

# 本地运行测试
docker run -d \
  -p 3004:3000 \
  -e DATABASE_URL="file:./dev.db" \
  -e NEXTAUTH_SECRET="your-secret" \
  --name acp-test \
  agent-control-plane:latest
```

### 2.3 GitHub Actions 工作流说明

CI/CD 流程分为以下阶段：

```
代码推送/合并到 main 分支
        |
        v
+-------------------+
| 1. 触发 GitHub    |
|    Actions 工作流  |
+-------------------+
        |
        v
+-------------------+
| 2. 运行测试与构建  |
|    - npm ci       |
|    - npm run build|
|    - 生成 Prisma  |
+-------------------+
        |
        v
+-------------------+
| 3. 构建 Docker    |
|    镜像并推送 ACR  |
+-------------------+
        |
        v
+-------------------+
| 4. SSH 登录 ECS   |
|    拉取镜像并重启  |
+-------------------+
        |
        v
+-------------------+
| 5. 健康检查       |
|    验证部署成功    |
+-------------------+
```

工作流文件位置：`.github/workflows/deploy.yml`

关键配置项：

```yaml
env:
  ACR_REGISTRY: registry.cn-beijing.aliyuncs.com
  ACR_NAMESPACE: your-namespace
  IMAGE_NAME: agent-control-plane
  ECS_HOST: 39.105.86.184
  ECS_USER: root
```

### 2.4 Caddy 反向代理配置

Caddy 配置文件位置（服务器）：`/etc/caddy/Caddyfile`

```caddyfile
administrator.chmjk67.top {
    reverse_proxy localhost:3004
    encode gzip zstd

    # 安全响应头
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    # 日志配置
    log {
        output file /var/log/caddy/acp-access.log
        format json
    }

    # 自动 HTTPS（Let's Encrypt）
    tls your-email@example.com
}
```

Caddy 常用命令：

```bash
# 验证配置语法
caddy validate --config /etc/caddy/Caddyfile

# 重新加载配置
caddy reload --config /etc/caddy/Caddyfile

# 查看 Caddy 状态
systemctl status caddy

# 重启 Caddy
systemctl restart caddy

# 查看 Caddy 日志
journalctl -u caddy -f
```

### 2.5 DNS 配置

域名解析配置：

| 记录类型 | 主机记录 | 解析值 | TTL |
|----------|----------|--------|-----|
| A | administrator | 39.105.86.184 | 600 |

验证 DNS 解析：

```bash
# 使用 dig 查询
dig administrator.chmjk67.top A +short

# 使用 nslookup
nslookup administrator.chmjk67.top

# 测试 HTTPS 连通性
curl -I https://administrator.chmjk67.top
```

---

## 3. 环境变量清单

### 3.1 必需环境变量

| 变量名 | 说明 | 示例值 | 是否必填 |
|--------|------|--------|----------|
| `DATABASE_URL` | SQLite 数据库连接地址 | `file:./prisma/dev.db` | 是 |
| `NEXTAUTH_SECRET` | NextAuth.js 加密密钥 | `your-random-secret-key-32chars` | 是 |
| `NEXTAUTH_URL` | NextAuth.js 回调地址 | `https://administrator.chmjk67.top` | 是 |
| `NODE_ENV` | 运行环境 | `production` | 是 |

### 3.2 可选环境变量

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `PORT` | 应用监听端口 | `3000` | `3000` |
| `LOG_LEVEL` | 日志级别 | `info` | `info` |
| `API_TIMEOUT` | API 请求超时（毫秒） | `30000` | `30000` |

### 3.3 API 密钥配置

| 变量名 | 说明 | 配置位置 |
|--------|------|----------|
| `OPENAI_API_KEY` | OpenAI API 密钥 | 环境变量 / 管理后台 |
| `ANTHROPIC_API_KEY` | Anthropic Claude API 密钥 | 环境变量 / 管理后台 |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | 环境变量 / 管理后台 |

### 3.4 环境变量配置方式

#### 方式一：Docker 运行时传入

```bash
docker run -d \
  --name agent-control-plane \
  -p 3004:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="file:./prisma/dev.db" \
  -e NEXTAUTH_SECRET="your-secret-key" \
  -e NEXTAUTH_URL="https://administrator.chmjk67.top" \
  -v /data/acp/db:/app/prisma \
  registry.cn-beijing.aliyuncs.com/your-namespace/agent-control-plane:latest
```

#### 方式二：使用 Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    image: registry.cn-beijing.aliyuncs.com/your-namespace/agent-control-plane:latest
    container_name: agent-control-plane
    restart: unless-stopped
    ports:
      - "3004:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=file:./prisma/dev.db
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=https://administrator.chmjk67.top
    volumes:
      - ./data:/app/prisma
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

启动命令：

```bash
# 创建 .env 文件
cat > .env << 'EOF'
NEXTAUTH_SECRET=your-random-secret-key-at-least-32-characters-long
EOF

# 启动服务
docker-compose up -d

# 查看状态
docker-compose ps
```

#### 方式三：服务器环境变量文件

```bash
# 创建环境变量文件
sudo mkdir -p /opt/acp
sudo tee /opt/acp/.env << 'EOF'
NODE_ENV=production
DATABASE_URL=file:./prisma/dev.db
NEXTAUTH_SECRET=your-random-secret-key-here
NEXTAUTH_URL=https://administrator.chmjk67.top
EOF

# 设置权限
sudo chmod 600 /opt/acp/.env
sudo chown root:root /opt/acp/.env
```

---

## 4. 运维操作手册

### 4.1 连接服务器

```bash
# SSH 登录（需提前配置密钥）
ssh root@39.105.86.184

# 如果使用自定义端口
ssh -p 22 root@39.105.86.184
```

### 4.2 查看容器日志

```bash
# 查看实时日志（最后 100 行，持续跟踪）
docker logs -f --tail 100 agent-control-plane

# 查看最近 1 小时的日志
docker logs --since 1h agent-control-plane

# 查看指定时间范围的日志
docker logs --since "2026-06-14T10:00:00" --until "2026-06-14T12:00:00" agent-control-plane

# 将日志导出到文件
docker logs agent-control-plane > /tmp/acp-logs-$(date +%Y%m%d-%H%M%S).txt 2>&1

# 查看日志中是否包含错误
docker logs --tail 500 agent-control-plane | grep -i "error\|exception\|fatal"
```

### 4.3 重启服务

```bash
# 方法 1：重启容器
docker restart agent-control-plane

# 方法 2：停止后启动
docker stop agent-control-plane
docker start agent-control-plane

# 方法 3：强制重启（删除并重新创建）
docker stop agent-control-plane
docker rm agent-control-plane
docker run -d \
  --name agent-control-plane \
  -p 3004:3000 \
  --env-file /opt/acp/.env \
  -v /opt/acp/data:/app/prisma \
  --restart unless-stopped \
  registry.cn-beijing.aliyuncs.com/your-namespace/agent-control-plane:latest

# 方法 4：使用 Docker Compose
cd /opt/acp
docker-compose down
docker-compose up -d
```

### 4.4 备份数据库

SQLite 数据库备份策略：

```bash
# 创建备份目录
mkdir -p /opt/backups/acp

# 方式 1：直接复制数据库文件（需先停止写入）
docker stop agent-control-plane
cp /opt/acp/data/dev.db /opt/backups/acp/dev.db.$(date +%Y%m%d-%H%M%S)
docker start agent-control-plane

# 方式 2：在线备份（使用 SQLite 备份命令，无需停止服务）
docker exec agent-control-plane sh -c "sqlite3 /app/prisma/dev.db '.backup /app/prisma/dev.db.backup'"
docker cp agent-control-plane:/app/prisma/dev.db.backup /opt/backups/acp/dev.db.$(date +%Y%m%d-%H%M%S)

# 方式 3：使用 Prisma 导出（推荐用于迁移）
docker exec agent-control-plane npx prisma db pull --schema=/tmp/backup-schema.prisma

# 自动备份脚本（添加到 crontab）
cat > /opt/backups/acp/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/acp"
DATE=$(date +%Y%m%d-%H%M%S)
DB_PATH="/opt/acp/data/dev.db"
RETENTION_DAYS=30

# 创建备份
mkdir -p "$BACKUP_DIR"
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/dev.db.$DATE'"

# 压缩备份
gzip "$BACKUP_DIR/dev.db.$DATE"

# 清理旧备份（保留 30 天）
find "$BACKUP_DIR" -name "dev.db.*.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Backup completed: dev.db.$DATE.gz"
EOF
chmod +x /opt/backups/acp/backup.sh

# 添加到定时任务（每天凌晨 2 点执行）
echo "0 2 * * * /opt/backups/acp/backup.sh >> /var/log/acp-backup.log 2>&1" | crontab -
```

### 4.5 更新代码并重新部署

#### 自动部署（推荐）

代码推送到 `main` 分支后，GitHub Actions 会自动完成部署。

#### 手动部署

```bash
# 1. 登录服务器
ssh root@39.105.86.184

# 2. 拉取最新镜像
docker pull registry.cn-beijing.aliyuncs.com/your-namespace/agent-control-plane:latest

# 3. 停止并删除旧容器
docker stop agent-control-plane
docker rm agent-control-plane

# 4. 启动新容器
docker run -d \
  --name agent-control-plane \
  -p 3004:3000 \
  --env-file /opt/acp/.env \
  -v /opt/acp/data:/app/prisma \
  --restart unless-stopped \
  registry.cn-beijing.aliyuncs.com/your-namespace/agent-control-plane:latest

# 5. 验证部署
docker ps | grep agent-control-plane
docker logs --tail 50 agent-control-plane
```

#### 使用 Docker Compose 更新

```bash
cd /opt/acp

# 拉取最新镜像
docker-compose pull

# 重新创建容器
docker-compose up -d

# 清理旧镜像
docker image prune -f
```

### 4.6 查看健康状态

```bash
# 检查容器运行状态
docker ps | grep agent-control-plane

# 查看容器资源占用
docker stats agent-control-plane --no-stream

# 应用内健康检查端点
curl -f http://localhost:3004/api/health

# 检查 HTTPS 外部访问
curl -I https://administrator.chmjk67.top

# 查看服务器整体状态
free -h
df -h
top -bn1 | head -20

# 查看端口监听
ss -tlnp | grep 3004
```

### 4.7 常见问题排查

#### 问题 1：容器无法启动

```bash
# 查看容器退出日志
docker logs agent-control-plane

# 检查端口是否被占用
lsof -i :3004
ss -tlnp | grep 3004

# 检查环境变量是否正确
docker inspect agent-control-plane | grep -A 20 Env
```

#### 问题 2：数据库连接失败

```bash
# 检查数据库文件是否存在
ls -la /opt/acp/data/dev.db

# 检查数据库文件权限
ls -la /opt/acp/data/

# 在容器内测试数据库连接
docker exec -it agent-control-plane sh -c "npx prisma db execute --stdin < /dev/null"

# 查看 Prisma 客户端生成状态
docker exec agent-control-plane ls -la node_modules/.prisma/client/
```

#### 问题 3：应用响应缓慢

```bash
# 查看容器资源占用
docker stats agent-control-plane --no-stream

# 查看服务器负载
uptime
cat /proc/loadavg

# 查看内存使用
free -h

# 查看磁盘 I/O
iostat -x 1 5

# 查看应用日志中的慢请求
docker logs --tail 500 agent-control-plane | grep -i "slow\|timeout"
```

#### 问题 4：HTTPS 证书问题

```bash
# 检查证书状态
caddy list-modules | grep tls

# 手动触发证书续期
caddy reload --config /etc/caddy/Caddyfile

# 查看 Caddy 证书存储
ls -la /var/lib/caddy/.local/share/caddy/certificates/

# 测试证书有效期
echo | openssl s_client -servername administrator.chmjk67.top -connect administrator.chmjk67.top:443 2>/dev/null | openssl x509 -noout -dates
```

#### 问题 5：镜像拉取失败

```bash
# 检查 ACR 登录状态
cat ~/.docker/config.json | grep "registry.cn-beijing.aliyuncs.com"

# 重新登录 ACR
docker login --username=your-username registry.cn-beijing.aliyuncs.com

# 检查镜像是否存在
docker pull registry.cn-beijing.aliyuncs.com/your-namespace/agent-control-plane:latest

# 检查网络连通性
ping registry.cn-beijing.aliyuncs.com
```

---

## 5. 数据库运维

### 5.1 Prisma 迁移命令

```bash
# 进入容器执行 Prisma 命令
docker exec -it agent-control-plane sh

# 查看迁移状态
npx prisma migrate status

# 创建新迁移（开发环境）
npx prisma migrate dev --name add_new_feature

# 部署迁移到生产环境
npx prisma migrate deploy

# 重置数据库（危险操作，会丢失数据）
npx prisma migrate reset

# 生成 Prisma Client（更新 schema 后必须执行）
npx prisma generate

# 验证 schema 语法
npx prisma validate

# 格式化 schema 文件
npx prisma format
```

生产环境迁移流程：

```bash
# 1. 备份数据库
sqlite3 /app/prisma/dev.db ".backup /app/prisma/dev.db.pre-migration"

# 2. 部署迁移
npx prisma migrate deploy

# 3. 验证迁移结果
npx prisma migrate status

# 4. 如出现问题，回滚备份
cp /app/prisma/dev.db.pre-migration /app/prisma/dev.db
```

### 5.2 数据库备份与恢复

#### 备份

```bash
# 完整备份（包含数据和结构）
BACKUP_FILE="/opt/backups/acp/dev.db.$(date +%Y%m%d-%H%M%S)"
docker exec agent-control-plane sh -c "sqlite3 /app/prisma/dev.db '.backup /tmp/dev.db.backup'"
docker cp agent-control-plane:/tmp/dev.db.backup "$BACKUP_FILE"
gzip "$BACKUP_FILE"

# 仅导出 SQL
docker exec agent-control-plane sh -c "sqlite3 /app/prisma/dev.db '.dump'" > /opt/backups/acp/dev.db.$(date +%Y%m%d-%H%M%S).sql
```

#### 恢复

```bash
# 从备份文件恢复
BACKUP_FILE="/opt/backups/acp/dev.db.20260614-020000.gz"

# 停止应用
docker stop agent-control-plane

# 解压备份
gunzip -c "$BACKUP_FILE" > /opt/acp/data/dev.db

# 或者从 SQL 恢复
docker exec -i agent-control-plane sh -c "sqlite3 /app/prisma/dev.db" < /opt/backups/acp/dev.db.20260614-020000.sql

# 启动应用
docker start agent-control-plane

# 验证
docker exec agent-control-plane sh -c "sqlite3 /app/prisma/dev.db 'SELECT COUNT(*) FROM sqlite_master;'"
```

### 5.3 Seed 数据重新生成

```bash
# 执行 seed 脚本
docker exec agent-control-plane npx prisma db seed

# 或者手动执行 seed 文件
docker exec agent-control-plane node prisma/seed.js

# 清空数据并重新 seed（危险操作）
docker exec agent-control-plane npx prisma migrate reset --force
```

### 5.4 数据库诊断

```bash
# 查看数据库大小
docker exec agent-control-plane sh -c "ls -lh /app/prisma/dev.db"

# 查看表列表
docker exec agent-control-plane sh -c "sqlite3 /app/prisma/dev.db '.tables'"

# 查看表结构
docker exec agent-control-plane sh -c "sqlite3 /app/prisma/dev.db '.schema'"

# 查看特定表的数据量
docker exec agent-control-plane sh -c "sqlite3 /app/prisma/dev.db 'SELECT COUNT(*) FROM Agent;'"

# 查看数据库完整性
docker exec agent-control-plane sh -c "sqlite3 /app/prisma/dev.db 'PRAGMA integrity_check;'"

# 分析查询性能
docker exec agent-control-plane sh -c "sqlite3 /app/prisma/dev.db 'PRAGMA optimize;'"
```

---

## 6. 监控与告警

### 6.1 当前监控能力

目前项目具备的基础监控能力：

| 监控项 | 方式 | 说明 |
|--------|------|------|
| 容器状态 | Docker 命令 | `docker ps`、`docker stats` |
| 应用日志 | Docker 日志 | `docker logs` |
| 访问日志 | Caddy 日志 | `/var/log/caddy/acp-access.log` |
| 健康检查 | 应用端点 | `/api/health` |
| 服务器资源 | Linux 命令 | `top`、`free`、`df` |

### 6.2 建议的监控方案

#### 方案一：轻量级监控（推荐）

使用 `docker-compose` 集成 Prometheus + Grafana：

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    volumes:
      - grafana-data:/var/lib/grafana
    ports:
      - "3005:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=your-admin-password

  node-exporter:
    image: prom/node-exporter:latest
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.rootfs=/rootfs'
      - '--path.sysfs=/host/sys'

volumes:
  prometheus-data:
  grafana-data:
```

#### 方案二：阿里云云监控

```bash
# 安装阿里云监控插件（CloudMonitor）
wget http://cms-download.aliyun.com/cms-install.sh
chmod +x cms-install.sh
sudo ./cms-install.sh

# 配置告警规则（在阿里云控制台操作）
# 1. 登录阿里云控制台 -> 云监控 -> 告警服务
# 2. 创建告警规则：
#    - CPU 使用率 > 80% 持续 5 分钟
#    - 内存使用率 > 85% 持续 5 分钟
#    - 磁盘使用率 > 90% 持续 5 分钟
#    - 网站不可用（HTTP 状态码 != 200）
```

#### 方案三：Uptime 监控

```bash
# 使用 uptime-kuma 监控网站可用性
docker run -d \
  --name uptime-kuma \
  -p 3006:3001 \
  -v /opt/uptime-kuma:/app/data \
  --restart unless-stopped \
  louislam/uptime-kuma:1

# 访问 http://39.105.86.184:3006 配置监控项
# 添加监控：https://administrator.chmjk67.top
```

### 6.3 关键监控指标

| 指标 | 告警阈值 | 检查频率 |
|------|----------|----------|
| 网站可用性 | HTTP 200 | 每 60 秒 |
| 容器状态 | Running | 每 60 秒 |
| CPU 使用率 | > 80% | 每 5 分钟 |
| 内存使用率 | > 85% | 每 5 分钟 |
| 磁盘使用率 | > 90% | 每 5 分钟 |
| 响应时间 | > 5 秒 | 每 60 秒 |
| 错误率 | > 5% | 每 5 分钟 |

---

## 7. 安全建议

### 7.1 安全组配置

阿里云 ECS 安全组规则：

| 方向 | 协议 | 端口 | 授权对象 | 说明 |
|------|------|------|----------|------|
| 入方向 | TCP | 22 | 你的 IP/32 | SSH 访问（限制 IP） |
| 入方向 | TCP | 80 | 0.0.0.0/0 | HTTP（Caddy 自动跳转 HTTPS） |
| 入方向 | TCP | 443 | 0.0.0.0/0 | HTTPS |
| 入方向 | TCP | 3004 | 127.0.0.1/32 | 应用端口（仅本地访问） |
| 出方向 | 全部 | -1 | 0.0.0.0/0 | 允许所有出站流量 |

**注意**：
- 禁止将 3004 端口暴露到公网
- SSH 端口建议限制为特定 IP 或 VPN 网段
- 考虑修改 SSH 默认端口（22 -> 其他高位端口）

### 7.2 HTTPS 证书

Caddy 自动管理 Let's Encrypt 证书：

```bash
# 验证证书状态
curl -vI https://administrator.chmjk67.top 2>&1 | grep "SSL\|TLS\|certificate"

# 查看证书详情
echo | openssl s_client -servername administrator.chmjk67.top -connect administrator.chmjk67.top:443 2>/dev/null | openssl x509 -noout -text

# 检查证书过期时间
echo | openssl s_client -servername administrator.chmjk67.top -connect administrator.chmjk67.top:443 2>/dev/null | openssl x509 -noout -enddate

# 手动续期（通常不需要，Caddy 自动处理）
caddy reload --config /etc/caddy/Caddyfile
```

证书自动续期配置：

```caddyfile
administrator.chmjk67.top {
    tls your-email@example.com {
        protocols tls1.2 tls1.3
        ciphers TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
    }
    ...
}
```

### 7.3 API 密钥管理

#### 密钥存储原则

1. **绝不硬编码**：不要将 API 密钥写入代码或提交到 Git
2. **环境变量隔离**：生产密钥与开发密钥分离
3. **定期轮换**：建议每 90 天更换一次密钥
4. **最小权限**：为不同环境分配不同密钥

#### 密钥管理操作

```bash
# 生成安全的随机密钥
openssl rand -base64 32

# 生成 NextAuth Secret
openssl rand -base64 32

# 查看当前环境变量（注意过滤敏感信息）
docker exec agent-control-plane env | grep -v "SECRET\|KEY\|PASSWORD"

# 更新密钥（不重启容器）
docker exec agent-control-plane sh -c "export NEW_KEY=new-value"
# 注意：此方法仅临时生效，永久生效需修改启动配置并重启
```

#### 密钥轮换流程

```bash
# 1. 生成新密钥
NEW_SECRET=$(openssl rand -base64 32)

# 2. 更新环境变量文件
sed -i "s/NEXTAUTH_SECRET=.*/NEXTSECRET=$NEW_SECRET/" /opt/acp/.env

# 3. 重启容器
docker restart agent-control-plane

# 4. 验证应用正常
curl -f https://administrator.chmjk67.top/api/health

# 5. 在管理后台更新 API 密钥（如 OpenAI、Claude 等）
```

### 7.4 其他安全建议

#### 定期更新依赖

```bash
# 检查依赖漏洞
docker exec agent-control-plane npm audit

# 自动修复漏洞
docker exec agent-control-plane npm audit fix

# 更新基础镜像
docker pull node:20-alpine
# 然后重新构建并部署
```

#### 日志脱敏

```bash
# 检查日志中是否包含敏感信息
docker logs agent-control-plane | grep -i "password\|secret\|token\|key"

# 配置日志过滤（在应用层面实现）
# 确保 API 密钥、密码等敏感字段不出现在日志中
```

#### 防火墙配置

```bash
# 启用 UFW 防火墙（Ubuntu）
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# 查看防火墙状态
sudo ufw status verbose
```

#### Docker 安全

```bash
# 以非 root 用户运行容器（推荐）
docker run -d \
  --user 1000:1000 \
  --read-only \
  --tmpfs /tmp:noexec,nosuid,size=100m \
  ...

# 限制容器资源
docker run -d \
  --memory=512m \
  --memory-swap=512m \
  --cpus=1.0 \
  ...

# 定期清理未使用的镜像和容器
docker system prune -a -f
```

---

## 附录

### A. 常用命令速查表

| 操作 | 命令 |
|------|------|
| 登录服务器 | `ssh root@39.105.86.184` |
| 查看容器状态 | `docker ps` |
| 查看日志 | `docker logs -f agent-control-plane` |
| 重启服务 | `docker restart agent-control-plane` |
| 进入容器 | `docker exec -it agent-control-plane sh` |
| 备份数据库 | `sqlite3 dev.db ".backup dev.db.backup"` |
| 查看资源占用 | `docker stats` |
| 查看磁盘空间 | `df -h` |
| 查看内存使用 | `free -h` |
| 重启 Caddy | `systemctl restart caddy` |
| 检查 HTTPS | `curl -I https://administrator.chmjk67.top` |

### B. 重要文件路径

| 文件/目录 | 路径 |
|-----------|------|
| 应用数据 | `/opt/acp/data/` |
| 环境变量 | `/opt/acp/.env` |
| Caddy 配置 | `/etc/caddy/Caddyfile` |
| Caddy 日志 | `/var/log/caddy/` |
| 数据库备份 | `/opt/backups/acp/` |
| Docker Compose | `/opt/acp/docker-compose.yml` |

### C. 联系信息

| 项目 | 信息 |
|------|------|
| 服务器 IP | 39.105.86.184 |
| 域名 | administrator.chmjk67.top |
| 部署地址 | https://administrator.chmjk67.top |

---

> 本文档由运维团队维护，如有更新请及时同步。
