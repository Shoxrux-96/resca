import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  LayoutDashboard, Store, Users, MonitorSmartphone, Package,
  Receipt, LogOut, DoorOpen, BarChart3, Table2, Menu, X,
} from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const logoutMutation = useLogout();
  const userRole = (user?.role as string) ?? "";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [location]);

  useEffect(() => {
    // Set generic title for protected pages based on current route
    const path = location.split("/")[1];
    const roleLabel: Record<string, string> = {
      owner: "Egasi paneli",
      admin: "Admin paneli",
      waiter: "Ofitsiant paneli",
    };
    document.title = `${roleLabel[path] ?? "Panel"} — resca.uz`;
  }, [location]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSidebarOpen(false); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, { onSuccess: () => logout() });
  };

  const ownerLinks = [
    { href: "/owner/dashboard", label: "Ko'rinish", icon: LayoutDashboard },
    { href: "/owner/venues", label: "Cafe va restoranlar", icon: Store },
    { href: "/owner/users", label: "Foydalanuvchilar", icon: Users },
  ];

  const adminLinks = [
    { href: "/admin/dashboard", label: "Boshqaruv", icon: LayoutDashboard },
    { href: "/admin/pos", label: "POS Terminal", icon: MonitorSmartphone },
    { href: "/admin/products", label: "Mahsulotlar", icon: Package },
    { href: "/admin/rooms", label: "Xonalar & Stollar", icon: DoorOpen },
    { href: "/admin/waiters", label: "Afitsiantlar", icon: Users },
    { href: "/admin/debts", label: "Qarz Daftar", icon: Receipt },
    { href: "/admin/report", label: "Sotuvlar Hisobot", icon: BarChart3 },
  ];

  const waiterLinks = [
    { href: "/waiter/tables", label: "Xona va Stollar", icon: Table2 },
    { href: "/waiter/bookings", label: "Bronlar", icon: Receipt },
  ];

  const links =
    userRole === "owner" ? ownerLinks :
    userRole === "waiter" ? waiterLinks :
    adminLinks;

  const roleLabel =
    userRole === "owner" ? "Egasi" :
    userRole === "waiter" ? "Afitsiant" : "Admin";

  const SidebarContent = () => (
    <>
      <div className="p-5 flex items-start justify-between border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <img src="/favicon.png" alt="resca.uz" className="w-10 h-10 rounded object-cover shrink-0" />
            resca.uz
          </h1>
          {user?.venueName && (
            <p className="text-xs text-muted-foreground mt-1.5 truncate max-w-[170px]">{user.venueName}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle className="text-muted-foreground hover:text-foreground" />
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {links.map((link) => {
          const isActive = location === link.href || location.startsWith(`${link.href}/`);
          return (
            <Link key={link.href} href={link.href} className="block">
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-sm ${
                isActive
                  ? "bg-[#E0714F]/10 text-[#E0714F] font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}>
                <link.icon className="h-4 w-4 shrink-0" />
                {link.label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 px-2 py-2 mb-2 rounded-xl">
          <div className="w-8 h-8 rounded-full bg-[#E0714F]/20 flex items-center justify-center text-sm font-bold text-[#E0714F] shrink-0">
            {user?.username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-foreground">{user?.name || user?.username}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-red-500 hover:bg-red-500/10 text-sm"
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Chiqish
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-64 border-r border-border bg-card flex-col shrink-0">
        <SidebarContent />
      </aside>

      {/* ── Mobile overlay backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Mobile slide-in sidebar ── */}
      <aside className={`fixed top-0 left-0 z-50 h-full w-72 bg-card border-r border-border flex flex-col transition-transform duration-300 md:hidden ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <SidebarContent />
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-card shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-1 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent active:scale-95 transition-all"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-foreground text-sm">
              {links.find((l) => location === l.href || location.startsWith(`${l.href}/`))?.label ?? "resca.uz"}
            </span>
            {user?.venueName && (
              <span className="text-xs text-muted-foreground ml-2">· {user.venueName}</span>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#E0714F]/20 flex items-center justify-center text-xs font-bold text-[#E0714F]">
              {user?.username.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
