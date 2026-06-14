-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "model" TEXT NOT NULL DEFAULT 'deepseek-chat',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "icon" TEXT NOT NULL DEFAULT 'bot',
    "endpoint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "environment_slot" TEXT NOT NULL DEFAULT 'blue',
    "traffic_weight" INTEGER NOT NULL DEFAULT 100,
    "deploy_strategy" TEXT NOT NULL DEFAULT 'blue-green',
    "health_check_path" TEXT NOT NULL DEFAULT '/health',
    "health_check_interval" INTEGER NOT NULL DEFAULT 30,
    "container_name" TEXT,
    "internal_port" INTEGER NOT NULL DEFAULT 3000,
    "registry_image" TEXT,
    "max_cost_budget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "api_key_hash" TEXT,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentVersion" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "version_tag" TEXT NOT NULL,
    "code_ref" TEXT,
    "prompt_ref" TEXT,
    "model_ref" TEXT,
    "tool_config" TEXT,
    "env_vars" TEXT,
    "image_tag" TEXT,
    "git_commit" TEXT,
    "changelog" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "version_id" TEXT,
    "git_commit" TEXT,
    "image_tag" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result_log" TEXT,
    "deployed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slot" TEXT NOT NULL DEFAULT 'blue',
    "traffic_weight" INTEGER NOT NULL DEFAULT 100,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "deployed_by" TEXT,
    "trigger_source" TEXT NOT NULL DEFAULT 'manual',
    "rollback_from_id" TEXT,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentExecution" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "version_id" TEXT,
    "request_id" TEXT NOT NULL,
    "user_id" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_msg" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentHealth" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "uptime" INTEGER NOT NULL DEFAULT 0,
    "memory_mb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpu_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "restart_count" INTEGER NOT NULL DEFAULT 0,
    "last_heartbeat" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCheckLog" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response_time_ms" INTEGER NOT NULL DEFAULT 0,
    "status_code" INTEGER,
    "error" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthCheckLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "name" TEXT,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_slug_key" ON "Agent"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AgentExecution_request_id_key" ON "AgentExecution"("request_id");

-- CreateIndex
CREATE INDEX "HealthCheckLog_agent_id_checked_at_idx" ON "HealthCheckLog"("agent_id", "checked_at");

-- CreateIndex
CREATE INDEX "Alert_agent_id_created_at_idx" ON "Alert"("agent_id", "created_at");

-- CreateIndex
CREATE INDEX "Alert_resolved_severity_idx" ON "Alert"("resolved", "severity");

-- CreateIndex
CREATE INDEX "ApiKey_agent_id_idx" ON "ApiKey"("agent_id");

-- AddForeignKey
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "AgentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "AgentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHealth" ADD CONSTRAINT "AgentHealth_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCheckLog" ADD CONSTRAINT "HealthCheckLog_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

