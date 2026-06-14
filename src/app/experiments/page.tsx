import { Card, CardContent } from "@/components/ui/card";
import { FlaskConical, Construction } from "lucide-react";

export default function ExperimentsPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">实验中心</h1><p className="text-sm text-muted-foreground mt-1">A/B 测试与实验管理</p></div>
      <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <Construction className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="font-medium mb-1">实验中心</h3>
        <p className="text-sm text-muted-foreground max-w-md">此模块正在开发中。它将提供 A/B 测试、提示词实验和模型对比功能。</p>
      </CardContent></Card>
    </div>
  );
}
