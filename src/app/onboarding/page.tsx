"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Copy,
  Bot,
  HeartPulse,
  Webhook,
  TestTube,
  Loader2,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

const modelOptions = [
  "gpt-4",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-3.5-turbo",
  "claude-3-opus",
  "claude-3-sonnet",
  "自定义",
];

const steps = [
  { title: "填写智能体信息", icon: Bot, description: "注册您的 AI 应用基本信息" },
  { title: "配置健康检查", icon: HeartPulse, description: "配置健康检查端点以便平台监控" },
  { title: "配置 Token 上报", icon: Webhook, description: "将 LLM 调用的 token 消耗上报到平台" },
  { title: "测试连接", icon: TestTube, description: "验证接入配置是否正常" },
];

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [creating, setCreating] = useState(false);

  // Step 1 - Agent info
  const [form, setForm] = useState({
    name: "",
    model: "gpt-4",
    endpoint: "",
    apiKey: "",
  });

  // Step 2 - Health check
  const [healthPath, setHealthPath] = useState("/health");
  const [healthInterval, setHealthInterval] = useState("30");

  // Step 4 - Test result
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  // Created agent id (after step 1)
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [createdAgentName, setCreatedAgentName] = useState("");

  const canProceed = () => {
    if (currentStep === 0) return form.name.trim().length > 0;
    return true;
  };

  const handleNext = async () => {
    if (currentStep === 0) {
      // Create agent via API
      setCreating(true);
      try {
        const body: any = {
          name: form.name.trim(),
          model: form.model,
          endpoint: form.endpoint.trim() || undefined,
        };
        const res = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("创建智能体失败");
        const agent = await res.json();
        setCreatedAgentId(agent.id);
        setCreatedAgentName(agent.name);
        setCurrentStep(1);
      } catch (e: any) {
        alert(e.message);
      } finally {
        setCreating(false);
      }
    } else {
      setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
    }
  };

  const handlePrev = () => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  };

  const handleTest = async () => {
    if (!createdAgentId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: createdAgentId,
          prompt: "你好，请回复「连接测试成功」。",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: "连接测试成功！智能体已正常响应。" });
      } else {
        setTestResult({ success: false, message: data.error || "连接测试失败" });
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || "网络错误" });
    } finally {
      setTesting(false);
    }
  };

  const reportEndpoint = `${typeof window !== "undefined" ? window.location.origin : ""}/api/report`;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">接入已部署的应用</h1>
        <p className="text-sm text-muted-foreground mt-1">
          按照以下步骤将您已有的 AI 应用快速接入平台进行统一管理和监控
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex items-start gap-0">
        {steps.map((step, idx) => {
          const StepIcon = step.icon;
          const isActive = idx === currentStep;
          const isCompleted = idx < currentStep;
          return (
            <div key={idx} className="flex-1 relative">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-200 ${
                    isCompleted
                      ? "bg-primary border-primary text-primary-foreground"
                      : isActive
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <StepIcon className="h-5 w-5" />
                  )}
                </div>
                <p
                  className={`text-xs mt-2 text-center leading-tight ${
                    isActive ? "text-primary font-medium" : "text-muted-foreground"
                  }`}
                >
                  {step.title}
                </p>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`absolute top-5 left-[60%] w-[80%] h-[2px] -translate-y-1/2 ${
                    isCompleted ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <Card>
        {/* Step 1: Agent info */}
        {currentStep === 0 && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-5 w-5 text-muted-foreground" />
                步骤 1：填写智能体信息
              </CardTitle>
              <CardDescription>注册您的 AI 应用，填写基本信息和访问凭证</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  智能体名称 <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="例如：客服助手"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">模型</label>
                <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
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
                <label className="text-sm font-medium">部署端点 URL</label>
                <Input
                  placeholder="https://your-app.example.com"
                  value={form.endpoint}
                  onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  您的 AI 应用提供 API 服务的 URL 地址
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">API Key</label>
                <Input
                  type="password"
                  placeholder="您的应用 API 密钥"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  用于平台调用您的应用 API 时进行身份验证
                </p>
              </div>
            </CardContent>
          </>
        )}

        {/* Step 2: Health check */}
        {currentStep === 1 && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HeartPulse className="h-5 w-5 text-muted-foreground" />
                步骤 2：配置健康检查端点
              </CardTitle>
              <CardDescription>
                配置健康检查后，平台将定期检测您应用的可用性
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">健康检查路径</label>
                <Input
                  placeholder="/health"
                  value={healthPath}
                  onChange={(e) => setHealthPath(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  您的应用暴露的健康检查 HTTP 端点路径
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">检查间隔（秒）</label>
                <Select value={healthInterval} onValueChange={setHealthInterval}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 秒</SelectItem>
                    <SelectItem value="30">30 秒</SelectItem>
                    <SelectItem value="60">60 秒</SelectItem>
                    <SelectItem value="300">5 分钟</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border bg-secondary/30 p-4 space-y-2">
                <p className="text-sm font-medium">健康检查要求</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>端点需返回 HTTP 200 状态码</li>
                  <li>推荐响应体：{`{"status": "healthy"}`}</li>
                  <li>响应超时时间应小于检查间隔</li>
                </ul>
              </div>

              {form.endpoint && (
                <div className="rounded-lg border bg-secondary/30 p-4">
                  <p className="text-xs text-muted-foreground mb-1">完整的健康检查 URL：</p>
                  <code className="text-sm font-mono bg-background px-2 py-1 rounded border">
                    {form.endpoint.replace(/\/$/, "")}{healthPath.startsWith("/") ? healthPath : "/" + healthPath}
                  </code>
                </div>
              )}
            </CardContent>
          </>
        )}

        {/* Step 3: Token report */}
        {currentStep === 2 && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Webhook className="h-5 w-5 text-muted-foreground" />
                步骤 3：配置 Token 上报
              </CardTitle>
              <CardDescription>
                每次 LLM 调用后，将 token 消耗等信息上报到平台，用于成本分析和监控
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">上报端点</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-secondary/30 px-3 py-2 rounded border">
                    {reportEndpoint}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(reportEndpoint)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  每次 LLM 调用完成后，向此端点 POST 以下 JSON 数据
                </p>
              </div>

              <div className="rounded-lg border bg-secondary/30 p-4 space-y-2">
                <p className="text-sm font-medium">请求示例</p>
                <pre className="text-xs font-mono bg-background p-3 rounded border overflow-x-auto">
{`POST ${reportEndpoint}
Content-Type: application/json

{
  "agentId": "${createdAgentId || "<智能体 ID>"}",
  "requestId": "req_xxx",
  "inputTokens": 150,
  "outputTokens": 300,
  "cost": 0.0025,
  "latencyMs": 1200,
  "status": "success",
  "errorMsg": null
}`}
                </pre>
              </div>

              <div className="rounded-lg border bg-secondary/30 p-4 space-y-1">
                <p className="text-sm font-medium">字段说明</p>
                <div className="text-xs space-y-1">
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">agentId</Badge>
                    <span className="text-muted-foreground">智能体 ID（必填）</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">requestId</Badge>
                    <span className="text-muted-foreground">请求唯一标识（必填）</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">inputTokens</Badge>
                    <span className="text-muted-foreground">输入 token 数</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">outputTokens</Badge>
                    <span className="text-muted-foreground">输出 token 数</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">cost</Badge>
                    <span className="text-muted-foreground">调用成本（美元）</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">latencyMs</Badge>
                    <span className="text-muted-foreground">延迟（毫秒）</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">status</Badge>
                    <span className="text-muted-foreground">状态：success / failed</span>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">errorMsg</Badge>
                    <span className="text-muted-foreground">错误信息（失败时填写）</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </>
        )}

        {/* Step 4: Test */}
        {currentStep === 3 && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TestTube className="h-5 w-5 text-muted-foreground" />
                步骤 4：测试连接
              </CardTitle>
              <CardDescription>
                验证智能体接入配置是否正确，确认平台可以正常调用您的应用
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-secondary/30 p-4 space-y-2">
                <p className="text-sm font-medium">接入概览</p>
                <div className="text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">智能体名称</span>
                    <span className="font-medium">{createdAgentName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">智能体 ID</span>
                    <span className="font-mono text-[10px]">{createdAgentId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">模型</span>
                    <span>{form.model}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">端点</span>
                    <span className="font-mono text-[10px]">{form.endpoint || "未配置"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">健康检查路径</span>
                    <span className="font-mono text-[10px]">{healthPath}</span>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleTest}
                disabled={testing}
                className="w-full"
                variant={testResult?.success ? "outline" : "default"}
              >
                {testing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    测试中...
                  </>
                ) : testResult?.success ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-400" />
                    重新测试
                  </>
                ) : (
                  <>
                    <TestTube className="h-4 w-4 mr-2" />
                    开始测试连接
                  </>
                )}
              </Button>

              {testResult && (
                <div
                  className={`rounded-lg border p-4 flex items-start gap-3 ${
                    testResult.success
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-destructive/30 bg-destructive/10"
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <TestTube className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        testResult.success ? "text-emerald-400" : "text-destructive"
                      }`}
                    >
                      {testResult.success ? "测试通过" : "测试失败"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{testResult.message}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </>
        )}
      </Card>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        <div>
          {currentStep > 0 && (
            <Button variant="outline" onClick={handlePrev} disabled={creating || testing}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              上一步
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {currentStep < steps.length - 1 ? (
            <Button onClick={handleNext} disabled={!canProceed() || creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  创建中...
                </>
              ) : (
                <>
                  下一步
                  <ChevronRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              <Link href={`/agents/${createdAgentId}`}>
                <Button variant="outline">
                  查看智能体详情
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
              <Link href="/agents">
                <Button>
                  返回智能体列表
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
