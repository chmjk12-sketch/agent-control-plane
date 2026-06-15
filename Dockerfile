# ============================================================
# Stage 1: Builder
# ============================================================
FROM node:22-bookworm-slim AS builder

LABEL maintainer="agent-control-plane"

WORKDIR /app

# 依赖安装（利用 Docker 缓存层）
COPY package*.json ./
RUN npm ci

# 复制源码
COPY . .

# 生成 Prisma Client（强制指定 binary target 避免 OpenSSL 检测问题）
RUN npx prisma generate --generator client

# 构建 Next.js 应用
RUN npm run build

# ============================================================
# Stage 2: Runner (production)
# ============================================================
FROM node:22-bookworm-slim AS runner

LABEL maintainer="agent-control-plane"
LABEL description="Agent Control Plane - 生产运行镜像"
LABEL version="1.0.0"

WORKDIR /app
ENV NODE_ENV=production

# Prisma 运行时依赖 OpenSSL
RUN apt-get update -y && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

# Next.js standalone 输出
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma schema + 迁移 SQL 文件
COPY --from=builder /app/prisma ./prisma

# Prisma Client（运行时必需）
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# 确保运行时 OpenSSL 3.x 引擎存在
RUN ls -la ./node_modules/.prisma/client/libquery_engine-* 2>/dev/null || echo "No engines found"

# Prisma CLI（运行时执行迁移）
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# 静态资源
COPY --from=builder /app/public ./public

EXPOSE 3000

# 健康检查：每 30 秒探测一次，连续 3 次失败视为不健康
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
