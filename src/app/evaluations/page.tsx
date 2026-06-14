import { Card, CardContent } from "@/components/ui/card";
import { TestTube, Construction } from "lucide-react";

export default function EvaluationsPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">评估中心</h1><p className="text-sm text-muted-foreground mt-1">智能体质量评估与基准测试</p></div>
      <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <Construction className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="font-medium mb-1">评估中心</h3>
        <p className="text-sm text-muted-foreground max-w-md">此模块正在开发中。它将提供智能体质量评估、基准测试和性能评分功能。</p>
      </CardContent></Card>
    </div>
  );
}
