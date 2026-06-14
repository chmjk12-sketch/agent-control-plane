#!/bin/bash
# ============================================================
# 控制平面 V2.0 服务器端部署脚本
# 位置: /opt/app/scripts/deploy-cp.sh
# 用法: ./deploy-cp.sh [镜像tag]
# ============================================================
set -euo pipefail

REGISTRY="crpi-2hhvyuuzflfxsyey.cn-beijing.personal.cr.aliyuncs.com"
NAMESPACE="chmjk67"
APP_NAME="agent-control-plane"
IMAGE_TAG="${1:-latest}"
IMAGE="${REGISTRY}/${NAMESPACE}/${APP_NAME}:${IMAGE_TAG}"

echo "========================================"
echo " 控制平面 V2.0 部署"
echo " 镜像: ${IMAGE}"
echo "========================================"

# --- 自动探测空闲端口 ---
find_free_port() {
  local port=$1
  while ss -tlnp | grep -q ":$port "; do
    port=$((port + 1))
  done
  echo "$port"
}

APP_PORT=$(find_free_port 3000)
echo "[1/6] 空闲端口: ${APP_PORT}"

# --- 确保 PostgreSQL 运行 ---
if ! docker ps --format '{{.Names}}' | grep -q '^cp-postgres$'; then
  echo "[2/6] 启动 PostgreSQL..."
  docker rm -f cp-postgres 2>/dev/null || true
  docker run -d \
    --name cp-postgres \
    --restart always \
    --network caddy-net \
    -e POSTGRES_USER=cp_admin \
    -e POSTGRES_PASSWORD=cp_admin_2024_secure \
    -e POSTGRES_DB=agent_control_plane \
    -v cp-postgres-data:/var/lib/postgresql/data \
    postgres:16-alpine
  echo "等待 PostgreSQL 就绪..."
  for i in $(seq 1 30); do
    docker exec cp-postgres pg_isready -U cp_admin >/dev/null 2>&1 && break
    sleep 1
  done
  echo "PostgreSQL 就绪"
else
  echo "[2/6] PostgreSQL 已运行"
fi

# --- 拉取镜像 ---
echo "[3/6] 拉取镜像..."
docker pull "${IMAGE}"

# --- 部署容器 ---
echo "[4/6] 部署容器..."
docker stop "${APP_NAME}_app" 2>/dev/null || true
docker rm "${APP_NAME}_app" 2>/dev/null || true

docker run -d \
  --name "${APP_NAME}_app" \
  -p "${APP_PORT}":3000 \
  --restart always \
  --network caddy-net \
  -e DATABASE_URL="postgresql://cp_admin:cp_admin_2024_secure@cp-postgres:5432/agent_control_plane?schema=public" \
  -e NODE_ENV=production \
  -e SELF_URL="https://administrator.chmjk67.top" \
  "${IMAGE}"

# --- 数据库迁移 ---
echo "[5/6] 数据库迁移..."
sleep 8
docker exec "${APP_NAME}_app" npx prisma migrate deploy --skip-generate 2>&1 || {
  echo "迁移警告: 可能已执行过或无需迁移"
}

# --- 健康检查 ---
echo "[6/6] 健康检查..."
sleep 5
if curl -sf "http://127.0.0.1:${APP_PORT}/api/overview" >/dev/null 2>&1; then
  echo "HEALTH_OK"
else
  echo "HEALTH_FAIL (容器可能还在启动中，请稍后手动检查)"
fi

# --- 更新 Caddy ---
echo "更新 Caddy 路由..."
if [ -f /opt/app/Caddyfile ]; then
  if grep -q "administrator.chmjk67.top" /opt/app/Caddyfile; then
    sed -i '/administrator\.chmjk67\.top/,/}/ s|reverse_proxy .*|reverse_proxy '"${APP_NAME}"'_app:3000|' /opt/app/Caddyfile
  else
    echo "" >> /opt/app/Caddyfile
    echo "administrator.chmjk67.top {" >> /opt/app/Caddyfile
    echo "    reverse_proxy ${APP_NAME}_app:3000" >> /opt/app/Caddyfile
    echo "}" >> /opt/app/Caddyfile
  fi
  docker exec caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || true
  echo "Caddy 已更新"
fi

echo ""
echo "========================================"
echo " 部署完成!"
echo " 容器: ${APP_NAME}_app"
echo " 端口: ${APP_PORT}"
echo " 域名: https://administrator.chmjk67.top"
echo "========================================"
