import { Card, CardContent } from "@/components/ui/card";
import { FlaskConical, Construction } from "lucide-react";

export default function ExperimentsPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Experiments</h1><p className="text-sm text-muted-foreground mt-1">A/B testing and experiment management</p></div>
      <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <Construction className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="font-medium mb-1">Experiment Center</h3>
        <p className="text-sm text-muted-foreground max-w-md">This module is under development. It will provide A/B testing, prompt experiments, and model comparison capabilities.</p>
      </CardContent></Card>
    </div>
  );
}
