import { Card, CardContent } from "@/components/ui/card";
import { GitBranch, Construction } from "lucide-react";

export default function WorkflowsPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">工作流</h1><p className="text-sm text-muted-foreground mt-1">多智能体工作流编排</p></div>
      <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <Construction className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="font-medium mb-1">工作流中心</h3>
        <p className="text-sm text-muted-foreground max-w-md">此模块正在开发中。它将提供多智能体工作流编排、DAG 管道和智能体协作功能。</p>
      </CardContent></Card>
    </div>
  );
}
