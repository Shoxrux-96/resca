import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Login() {
  useEffect(() => { document.title = "Kirish — resca.uz"; }, []);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const loginMutation = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(
      { data: { username, password } },
      {
        onSuccess: (data) => {
          login(data.user, data.token);
          const role = data.user.role as string;
          if (role === "owner") {
            setLocation("/owner/dashboard");
          } else if (role === "waiter") {
            setLocation("/waiter/tables");
          } else {
            setLocation("/admin/dashboard");
          }
        },
        onError: () => {
          toast({
            title: "Xatolik",
            description: "Foydalanuvchi nomi yoki parol noto'g'ri",
            variant: "destructive",
          });
        }
      }
    );
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-background">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-zinc-100/90 dark:bg-zinc-900 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button onClick={() => setLocation("/")} className="flex items-center gap-2.5">
            <img src="/favicon.png" alt="resca.uz" className="w-10 h-10 rounded-lg object-cover" />
            <span className="font-semibold text-lg tracking-tight text-foreground">resca.uz</span>
          </button>
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setLocation("/")}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-white/5"
            >
              Bosh sahifa
            </button>
            <ThemeToggle className="text-muted-foreground" />
          </nav>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-border text-foreground shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src="/favicon.png" alt="resca.uz" className="w-12 h-12 rounded-lg object-cover" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">resca.uz</CardTitle>
          <CardDescription className="text-muted-foreground">
            Tizimga kirish uchun ma'lumotlaringizni kiriting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-foreground">Foydalanuvchi nomi</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="bg-input border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Parol</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-input border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-[#E0714F] hover:bg-[#D06040] text-white"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Kirish..." : "Kirish"}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
