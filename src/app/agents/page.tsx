"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Bot,
  Plus,
  Search,
  Wifi,
  WifiOff,
  AlertTriangle,
  ArrowRight,
  Loader2,
  Server,
  Shield,
} from "lucide-react";
import { formatCost } from "@/lib/utils";

const statusConfig: Record<
  string,
  { icon: any; color: "success" | "destructive" | "warning"; label: string }
> = {
  online: { icon: Wifi, color: "success", label: "在线" },
  offline: { icon: WifiOff, color: "destructive", label: "离线" },
  degraded: { icon: AlertTriangle, color: "warning", label: "降级" },
};

const modelOptions = [
  "deepseek-chat",
  "deepseek-reasoner",
  "gpt-4o",
  "gpt-4o-mini",
  "claude-3-sonnet",
  "自定义",
];

const deployStrategyOptions = [
  { value: "blue-green", label: "蓝绿部署" },
  { value: "rolling", label: "滚动部署" },
];

export default function AgentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Create dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    model: "deepseek-chat",
    endpoint: "",
    description: "",
    tags: "",
    containerName: "",
    internalPort: 3000,
    deployStrategy: "blue-green",
    healthCheckPath: "/health",
    maxCostBudget: "",
  });

  const fetchAgents = useCallback(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    const qs = params.toString();
    fetch(`/api/agents${qs ? "?" + qs : ""}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [search, statusFilter]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const resetForm = () => {
    setForm({
      name: "",
      model: "deepseek-chat",
      endpoint: "",
      description: "",
      tags: "",
      containerName: "",
      internalPort: 3000,
      deployStrategy: "blue-green",
      healthCheckPath: "/health",
      maxCostBudget: "",
    });
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const body: any = {
        name: form.name.trim(),
        model: form.model,
        containerName: form.containerName.trim() || undefined,
        internalPort: form.internalPort,
        deployStrategy: form.deployStrategy,
        healthCheckPath: form.healthCheckPath,
      };
      if (form.endpoint.trim()) body.endpoint = form.endpoint.trim();
      if (form.description.trim()) body.description = form.description.trim();
      if (tags.length > 0) body.tags = tags;
      if (form.maxCostBudget.trim())
        body.maxCostBudget = parseFloat(form.maxCostBudget);

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "创建失败");
      }

      setDialogOpen(false);
      resetForm();
      fetchAgents();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">智能体</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理和监控您的 AI 智能体
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            新建智能体
          </Button>
          <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>新建智能体</DialogTitle>
              <DialogDescription>
                填写智能体基本信息，创建后可在详情页进一步配置。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  智能体名称 <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="例如：客服助手"
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">模型</label>
                  <Select
                    value={form.model}
                    onValueChange={(v) => setForm({ ...form, model: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">部署策略</label>
                  <Select
                    value={form.deployStrategy}
                    onValueChange={(v) =>
                      setForm({ ...form, deployStrategy: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {deployStrategyOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">容器名</label>
                  <Input
                    placeholder="默认使用 slug"
                    value={form.containerName}
                    onChange={(e) =>
                      setForm({ ...form, containerName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">内部端口</label>
                  <Input
                    type="number"
                    value={form.internalPort}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        internalPort: parseInt(e.target.value) || 3000,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">健康检查路径</label>
                <Input
                  value={form.healthCheckPath}
                  onChange={(e) =>
                    setForm({ ...form, healthCheckPath: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">服务端点</label>
                <Input
                  placeholder="已部署应用的 URL 地址（可选）"
                  value={form.endpoint}
                  onChange={(e) =>
                    setForm({ ...form, endpoint: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">月度预算 ($)</label>
                <Input
                  type="number"
                  placeholder="0 = 无限制"
                  value={form.maxCostBudget}
                  onChange={(e) =>
                    setForm({ ...form, maxCostBudget: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">描述</label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="智能体功能描述（可选）"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">标签</label>
                <Input
                  placeholder="多个标签用逗号分隔（可选）"
                  value={form.tags}
                  onChange={(e) =>
                    setForm({ ...form, tags: e.target.value })
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={creating}>
                  取消
                </Button>
              </DialogClose>
              <Button
                onClick={handleCreate}
                disabled={creating || !form.name.trim()}
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    创建中...
                  </>
                ) : (
                  "确认创建"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索智能体..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="online">在线</SelectItem>
            <SelectItem value="offline">离线</SelectItem>
            <SelectItem value="degraded">降级</SelectItem>
          </SelectContent>
        </Select>
        {statusFilter && (
          <Button variant="ghost" size="sm" onClick={() => setStatusFilter("")}>
            清除
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[180px] rounded-xl bg-card border border-border animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.data?.map((agent: any) => {
            const status = statusConfig[agent.status] || statusConfig.offline;
            const StatusIcon = status.icon;
            return (
              <Link key={agent.id} href={`/agents/${agent.id}`}>
                <Card className="hover:border-primary/30 transition-all duration-200 cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-secondary/50">
                          <Bot className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="font-medium text-sm group-hover:text-primary transition-colors">
                            {agent.name}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {agent.model}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={status.color}
                        className="flex items-center gap-1"
                      >
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-4 min-h-[32px]">
                      {agent.description || "暂无描述"}
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
                      <div className="flex gap-4">
                        <span className="flex items-center gap-1">
                          <Server className="h-3 w-3" />
                          {agent.containerName || "N/A"}
                        </span>
                        <span>{agent.todayRequests} 请求</span>
                        <span>{formatCost(agent.todayCost)}</span>
                      </div>
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {agent.trafficWeight !== 100 && (
                      <div className="mt-2 flex items-center gap-1">
                        <Shield className="h-3 w-3 text-primary" />
                        <span className="text-[10px] text-primary">
                          灰度: Green {agent.trafficWeight}%
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {data?.data?.length === 0 && (
        <div className="text-center py-12">
          <Bot className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">未找到智能体</p>
        </div>
      )}
    </div>
  );
}
