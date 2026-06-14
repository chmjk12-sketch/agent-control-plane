import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Settings, User, Bell, Key, Database } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">系统设置</h1><p className="text-sm text-muted-foreground mt-1">系统配置与偏好设置</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" />个人资料</CardTitle><CardDescription>您的账户信息</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div><label className="text-xs text-muted-foreground">姓名</label><Input defaultValue="Zhang Wei" className="mt-1" /></div>
            <div><label className="text-xs text-muted-foreground">邮箱</label><Input defaultValue="zhangwei@example.com" className="mt-1" /></div>
            <Button size="sm">保存更改</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Bell className="h-4 w-4" />通知</CardTitle><CardDescription>配置通知偏好</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-sm">邮件通知</span><Badge variant="success">已启用</Badge></div>
            <div className="flex items-center justify-between"><span className="text-sm">Slack 集成</span><Badge variant="secondary">未配置</Badge></div>
            <div className="flex items-center justify-between"><span className="text-sm">Webhook 告警</span><Badge variant="secondary">未配置</Badge></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Database className="h-4 w-4" />系统</CardTitle><CardDescription>系统信息</CardDescription></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">版本</span><span>1.0.0</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">环境</span><Badge variant="secondary">开发环境</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">数据库</span><span>SQLite (Dev)</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Key className="h-4 w-4" />API 密钥</CardTitle><CardDescription>管理 API 密钥和令牌</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-sm font-mono text-xs">sk-***...***abc</span><Button variant="outline" size="sm">撤销</Button></div>
            <Button variant="outline" size="sm">生成新密钥</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
