import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useVenueSettings } from "@/hooks/use-venue-settings";
import { useLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationsBell } from "@/components/notifications-bell";
import {
  LayoutDashboard, Store, Users, MonitorSmartphone, Package,
  Receipt, LogOut, DoorOpen, BarChart3, Table2, Menu, X,
  ChefHat, Truck, Wallet, Warehouse, Settings2,
  TrendingDown, TrendingUp, UtensilsCrossed, Globe, ClipboardList,
  CreditCard, Building2, FileBarChart,
} from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const logoutMutation = useLogout();
  const userRole = (user?.role as string) ?? "";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: settings } = useVenueSettings();

  const ownerLinks = [
    { href: "/owner/dashboard", label: "Ko'rinish", icon: LayoutDashboard, setting: undefined as string | undefined },
    { href: "/owner/venues", label: "Cafe va restoranlar", icon: Store, setting: undefined },
    { href: "/owner/users", label: "Foydalanuvchilar", icon: Users, setting: undefined },
    { href: "/owner/tariff", label: "Tarif reja", icon: Building2, setting: undefined },
    { href: "/owner/payments", label: "To'lovlar", icon: CreditCard, setting: undefined },
    { href: "/owner/reports", label: "Hisobot", icon: FileBarChart, setting: undefined },
  ];

  useEffect(() => { setSidebarOpen(false); }, [location]);

  useEffect(() => {
    // Set generic title for protected pages based on current route
    const path = location.split("/")[1];
    const roleLabel: Record<string, string> = {
      owner: "Egasi paneli",
      admin: "Admin paneli",
      waiter: "Ofitsiant paneli",
      kassir: "Kassir paneli",
      oshpaz: "Oshpaz paneli",
      dastavkachi: "Dastavkachi paneli",
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

  const adminLinks = [
    { href: "/admin/dashboard", label: "Boshqaruv", icon: LayoutDashboard, setting: undefined as string | undefined },
    { href: "/admin/pos", label: "Kassa POS", icon: MonitorSmartphone, setting: undefined },
    { href: "/admin/online-orders", label: "Onlayn buyurtmalar", icon: Globe, setting: "onlineOrdersEnabled" },
    { href: "/dastavkachi/orders", label: "Yetkazish", icon: Truck, setting: "onlineOrdersEnabled" },
    { href: "/admin/products", label: "Taomlar", icon: UtensilsCrossed, setting: undefined },
    { href: "/admin/inventory", label: "Omborxona", icon: Warehouse, setting: undefined },
    { href: "/admin/rooms", label: "Xonalar & Stollar", icon: DoorOpen, setting: "roomBookingEnabled" },
    { href: "/admin/debts", label: "Qarz Daftar", icon: Receipt, setting: undefined },
    { href: "/admin/expenses", label: "Xarajatlar", icon: TrendingDown, setting: undefined },
    { href: "/admin/revenue", label: "Daromad & Foyda", icon: TrendingUp, setting: undefined },
    { href: "/admin/report", label: "Sotuvlar Hisobot", icon: BarChart3, setting: undefined },
    { href: "/admin/staff", label: "Hodimlar", icon: Users, setting: undefined },
    { href: "/admin/settings", label: "Funksiyalar", icon: Settings2, setting: undefined },
  ];

  const waiterLinks = [
    { href: "/waiter/tables", label: "Xona va Stollar", icon: Table2, setting: undefined as string | undefined },
    { href: "/waiter/orders", label: "Buyurtmalar", icon: ClipboardList, setting: undefined as string | undefined },
    { href: "/waiter/bookings", label: "Bronlar", icon: Receipt, setting: "roomBookingEnabled" },
  ];

  const kassirLinks = [
    { href: "/admin/dashboard", label: "Boshqaruv", icon: LayoutDashboard, setting: undefined },
    { href: "/admin/pos", label: "Kassa POS", icon: MonitorSmartphone, setting: undefined },
    { href: "/admin/online-orders", label: "Onlayn buyurtmalar", icon: Globe, setting: "onlineOrdersEnabled" },
    { href: "/dastavkachi/orders", label: "Yetkazish", icon: Truck, setting: "onlineOrdersEnabled" },
    { href: "/admin/products", label: "Taomlar", icon: UtensilsCrossed, setting: undefined },
    { href: "/admin/inventory", label: "Omborxona", icon: Warehouse, setting: undefined },
    { href: "/admin/rooms", label: "Xonalar & Stollar", icon: DoorOpen, setting: "roomBookingEnabled" },
    { href: "/admin/debts", label: "Qarz Daftar", icon: Receipt, setting: undefined },
    { href: "/admin/expenses", label: "Xarajatlar", icon: TrendingDown, setting: undefined },
    { href: "/admin/revenue", label: "Daromad & Foyda", icon: TrendingUp, setting: undefined },
  ];

  const oshpazLinks = [
    { href: "/oshpaz/orders", label: "Buyurtmalar", icon: ChefHat, setting: undefined as string | undefined },
    { href: "/oshpaz/online-orders", label: "Onlayn buyurtmalar", icon: Globe, setting: "onlineOrdersEnabled" },
  ];

  const dastavkachiLinks = [
    { href: "/dastavkachi/orders", label: "Yetkazish", icon: Truck, setting: undefined as string | undefined },
    { href: "/dastavkachi/online-orders", label: "Onlayn buyurtmalar", icon: Globe, setting: "onlineOrdersEnabled" },
  ];

  const links =
    (userRole === "owner" ? ownerLinks :
    userRole === "waiter" ? waiterLinks :
    userRole === "kassir" ? kassirLinks :
    userRole === "oshpaz" ? oshpazLinks :
    userRole === "dastavkachi" ? dastavkachiLinks :
    adminLinks).filter((l) => {
      if (!l.setting || !settings) return true;
      return settings[l.setting as keyof typeof settings] === true;
    });

  const roleLabel =
    userRole === "owner" ? "Egasi" :
    userRole === "waiter" ? "Afitsiant" :
    userRole === "kassir" ? "Kassir" :
    userRole === "oshpaz" ? "Oshpaz" :
    userRole === "dastavkachi" ? "Dastavkachi" : "Admin";

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
          <div className="shrink-0 flex items-center gap-1">
            <NotificationsBell />
            <div className="w-7 h-7 rounded-full bg-[#E0714F]/20 flex items-center justify-center text-xs font-bold text-[#E0714F]">
              {user?.username.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Desktop top bar — bell on right (admin/kassir/waiter) */}
        {(userRole === "admin" || userRole === "kassir" || userRole === "waiter") && (
          <header className="hidden md:flex items-center justify-end gap-2 h-12 px-6 border-b border-border bg-card shrink-0">
            <NotificationsBell />
          </header>
        )}

        <div className="flex-1 overflow-auto p-3 sm:p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
