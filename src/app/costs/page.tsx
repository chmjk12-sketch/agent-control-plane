import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Construction } from "lucide-react";

export default function CostsPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">成本分析</h1><p className="text-sm text-muted-foreground mt-1">成本分析与预算管理</p></div>
      <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <Construction className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="font-medium mb-1">成本分析</h3>
        <p className="text-sm text-muted-foreground max-w-md">此模块正在开发中。它将提供详细的成本分析、预算追踪和智能体集群优化建议。</p>
      </CardContent></Card>
    </div>
  );
}
