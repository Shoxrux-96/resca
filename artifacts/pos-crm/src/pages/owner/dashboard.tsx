import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend,
  ReferenceLine,
} from "recharts";
import {
  Store, TrendingUp, CreditCard, CalendarDays, ArrowRight,
  DollarSign, CheckCircle, XCircle, Building2, Package,
  ChevronLeft, ChevronRight, Activity, Download,
} from "lucide-react";
import * as XLSX from "xlsx";

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ").format(n) + " so'm";
}

function fmtShort(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + " mln";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + " ming";
  return String(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("uz-UZ", { day: "2-digit", month: "short", year: "numeric" });
}

function monthName(m: number) {
  const names = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
  return names[m - 1] || m;
}

function monthNameShort(m: number) {
  const names = ["Yan", "Fev", "Mar", "Apr", "May", "Iyun", "Iyul", "Avg", "Sen", "Okt", "Noy", "Dek"];
  return names[m - 1] || m;
}

function dayName(year: number, month: number, day: number) {
  const names = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"];
  return names[new Date(year, month - 1, day).getDay()];
}

function sum(arr: number[]) { return arr.reduce((a, b) => a + b, 0); }

type TariffPlan = {
  id: number; name: string; description: string | null;
  monthlyPrice: number; yearlyPrice: number;
  maxProducts: number | null; maxStaff: number | null;
  featuresJson: string | null; isActive: boolean; createdAt: string;
};

type Payment = {
  id: number; venueId: number; subscriptionId: number | null;
  amount: number; currency: string; status: string;
  paymentMethod: string | null; billingCycle: string;
  notes: string | null; paidAt: string | null; createdAt: string;
  venueName: string | null;
};

type VenueStat = {
  venueId: number; venueName: string;
  todayRevenue: number; totalDebt: number; orderCount: number;
};

type VenueSubscription = {
  id: number; venueId: number; tariffPlanId: number;
  startDate: string; endDate: string; status: string;
  billingCycle: string; autoRenew: boolean;
  createdAt: string; updatedAt: string;
  tariffPlan: TariffPlan | null; venueName: string | null;
};

type ChartDay = { year: number; month: number; day: number; total: number; count: number };
type ChartMonth = { year: number; month: number; total: number; count: number };
type ChartVenue = { venueId: number; venueName: string; total: number; count: number };
type ChartTariff = { tariffPlanId: number; tariffName: string; total: number; count: number };

type DashboardData = {
  totalVenues: number;
  totalMonthlyRevenue: number;
  totalYearlyRevenue: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  recentPayments: Payment[];
  latestVenues: VenueStat[];
  venueSubscriptions: VenueSubscription[];
  totalRevenue: number;
  paidCount: number;
  pendingCount: number;
  failedCount: number;
  dailyBreakdown: ChartDay[];
  monthlyBreakdown: ChartMonth[];
  yearlyBreakdown: ChartMonth[];
  byVenue: ChartVenue[];
  byTariff: ChartTariff[];
};

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-500/10 text-green-400", expired: "bg-red-500/10 text-red-400",
    cancelled: "bg-zinc-500/10 text-zinc-400", trial: "bg-blue-500/10 text-blue-400",
    paid: "bg-green-500/10 text-green-400", pending: "bg-yellow-500/10 text-yellow-400",
    failed: "bg-red-500/10 text-red-400", refunded: "bg-purple-500/10 text-purple-400",
  };
  const labels: Record<string, string> = {
    active: "Faol", expired: "Muddati o'tgan", cancelled: "Bekor qilingan",
    trial: "Sinov", paid: "To'langan", pending: "Kutilmoqda",
    failed: "Muvaffaqiyatsiz", refunded: "Qaytarilgan",
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${styles[status] || "bg-zinc-500/10 text-zinc-400"}`}>
      {labels[status] || status}
    </span>
  );
}

function getToken(): string | null {
  try { const s = localStorage.getItem("restoCrm_auth"); if (s) return JSON.parse(s).token ?? null; } catch {}
  return null;
}

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload?.length) {
    return (
      <div className="bg-popover border border-border rounded-xl p-4 shadow-2xl">
        <p className="text-foreground font-semibold mb-2 text-sm">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full" style={{ background: entry.color }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="text-foreground font-medium">{fmt(entry.value)}</span>
          </div>
        ))}
        {payload[0]?.payload?.count != null && (
          <p className="text-muted-foreground text-xs mt-1">To'lovlar: {payload[0].payload.count} ta</p>
        )}
      </div>
    );
  }
  return null;
}

function downloadExcel(data: Record<string, unknown>[], filename: string, sheetName: string) {
  if (!data.length) return;
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function fillDays(year: number, month: number, data: { day: number; total: number; count: number }[]) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const filled: { name: string; daromad: number; count: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const match = data.find((x) => x.day === d);
    filled.push({ name: String(d), daromad: match?.total || 0, count: match?.count || 0 });
  }
  return filled;
}

function fillMonths(data: { month: number; total: number; count: number }[]) {
  const filled: { name: string; daromad: number; count: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const match = data.find((x) => x.month === m);
    filled.push({ name: monthNameShort(m), daromad: match?.total || 0, count: match?.count || 0 });
  }
  return filled;
}

export default function OwnerDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const now = useMemo(() => new Date(), []);
  const [monthlyStyle, setMonthlyStyle] = useState<"bar" | "line">("bar");
  const [yearlyStyle, setYearlyStyle] = useState<"bar" | "line">("bar");
  const [dayYear, setDayYear] = useState(now.getFullYear());
  const [dayMonth, setDayMonth] = useState(now.getMonth() + 1);
  const [monthYear, setMonthYear] = useState(now.getFullYear());

  useEffect(() => {
    apiFetch<DashboardData>("/api/owner/dashboard")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const dailyData = useMemo(
    () => fillDays(
      dayYear, dayMonth,
      (data?.dailyBreakdown || []).filter(d => d.year === dayYear && d.month === dayMonth),
    ),
    [data, dayYear, dayMonth],
  );

  const monthlyData = useMemo(
    () => fillMonths((data?.monthlyBreakdown || []).filter(d => d.year === monthYear)),
    [data, monthYear],
  );

  const yearlyChartData = useMemo(
    () => (data?.yearlyBreakdown || []).map((y) => ({ name: String(y.year), daromad: y.total, count: y.count })),
    [data],
  );

  const venueChartData = useMemo(
    () => (data?.byVenue || []).map((v, i) => ({ name: v.venueName, value: v.total, count: v.count, color: COLORS[i % COLORS.length] })),
    [data],
  );

  const tariffChartData = useMemo(
    () => (data?.byTariff || []).map((t, i) => ({ name: t.tariffName, value: t.total, count: t.count, color: COLORS[i % COLORS.length] })),
    [data],
  );

  const statusChartData = useMemo(
    () => [
      { name: "To'langan", value: data?.paidCount || 0, color: "#22c55e" },
      { name: "Kutilmoqda", value: data?.pendingCount || 0, color: "#f59e0b" },
      { name: "Muvaffaqiyatsiz", value: data?.failedCount || 0, color: "#ef4444" },
    ].filter((s) => s.value > 0),
    [data],
  );

  const prevDay = () => {
    if (dayMonth === 1) { setDayMonth(12); setDayYear(y => y - 1); }
    else setDayMonth(m => m - 1);
  };
  const nextDay = () => {
    if (dayMonth === 12) { setDayMonth(1); setDayYear(y => y + 1); }
    else setDayMonth(m => m + 1);
  };
  const prevM = () => setMonthYear(y => y - 1);
  const nextM = () => setMonthYear(y => y + 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  const statsCards = [
    { title: "Jami Korxonalar", value: data?.totalVenues ?? 0, suffix: "ta", icon: Store, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Oylik daromad", value: fmt(data?.totalMonthlyRevenue ?? 0), suffix: "", icon: DollarSign, color: "text-green-500", bg: "bg-green-500/10" },
    { title: "Yillik daromad", value: fmt(data?.totalYearlyRevenue ?? 0), suffix: "", icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "Faol obunalar", value: data?.activeSubscriptions ?? 0, suffix: "ta", icon: CheckCircle, color: "text-green-500", bg: "bg-green-500/10" },
    { title: "Muddati o'tgan", value: data?.expiredSubscriptions ?? 0, suffix: "ta", icon: XCircle, color: "text-red-500", bg: "bg-red-500/10" },
  ];

  // Daily chart helpers
  const dailyTotal = sum(dailyData.map(d => d.daromad));
  const dailyAvg = dailyTotal / dailyData.filter(d => d.daromad > 0).length || 0;
  const dailyBest = Math.max(...dailyData.map(d => d.daromad));

  // Monthly chart helpers
  const monthlyTotal = sum(monthlyData.map(d => d.daromad));
  const monthlyAvg = monthlyTotal / monthlyData.filter(d => d.daromad > 0).length || 0;

  // Yearly chart helpers
  const yearlyTotal = sum(yearlyChartData.map(d => d.daromad));
  const yearlyAvg = yearlyTotal / yearlyChartData.filter(d => d.daromad > 0).length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">Barcha filiallar bo'yicha umumiy ko'rinish</p>
      </div>

      {/* ── STATS CARDS ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {statsCards.map((card) => (
          <Card key={card.title} className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{card.title}</CardTitle>
              <div className={`${card.bg} p-1.5 rounded-lg`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-foreground">
                {card.value}{card.suffix && <span className="text-xs text-muted-foreground ml-1">{card.suffix}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── LATEST VENUES + RECENT PAYMENTS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-foreground text-sm">Eng so'nggi korxonalar</CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadExcel(
                (data?.latestVenues || []).map(v => ({ "Korxona": v.venueName, "Buyurtmalar": v.orderCount, "Bugungi daromad": v.todayRevenue, "Qarz": v.totalDebt })),
                "eng-songgi-korxonalar", "Korxonalar"
              )} title="Excel yuklash">
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Store className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {!data?.latestVenues?.length ? (
              <p className="text-muted-foreground text-sm py-4 text-center">Korxona topilmadi</p>
            ) : (
              <div className="space-y-2">
                {data.latestVenues.slice(0, 5).map((v) => (
                  <a key={v.venueId} href={`/owner/venues/${v.venueId}`}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Store className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{v.venueName}</p>
                        <p className="text-xs text-muted-foreground">{v.orderCount} buyurtma · {fmt(v.todayRevenue)}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-foreground text-sm">So'nggi to'lovlar</CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadExcel(
                (data?.recentPayments || []).map(p => ({ "Korxona": p.venueName || `#${p.venueId}`, "Summa": p.amount, "Holat": p.status, "Sana": fmtDate(p.createdAt) })),
                "songgi-tolovlar", "To'lovlar"
              )} title="Excel yuklash">
                <Download className="h-3.5 w-3.5" />
              </Button>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {!data?.recentPayments?.length ? (
              <p className="text-muted-foreground text-sm py-4 text-center">To'lovlar mavjud emas</p>
            ) : (
              <div className="space-y-2">
                {data.recentPayments.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                        <DollarSign className="h-4 w-4 text-green-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{p.venueName || `#${p.venueId}`}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(p.createdAt)}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-green-400 text-sm">{fmt(p.amount)}</p>
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── DAILY REVENUE ── */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <CardTitle className="text-foreground text-sm">Kunlik daromad</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={prevDay}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-sm font-medium text-foreground min-w-[120px] text-center">
              {monthName(dayMonth)} {dayYear}
            </span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={nextDay}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadExcel(
              dailyData.map(d => ({ "Kun": d.name, "Daromad": d.daromad, "To'lovlar": d.count })),
              `kunlik-daromad-${dayYear}-${dayMonth}`, "Kunlik"
            )} title="Excel yuklash">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4 text-xs">
            <div className="bg-muted/50 rounded-lg px-3 py-2">
              <p className="text-muted-foreground">Jami</p>
              <p className="text-foreground font-bold">{fmt(dailyTotal)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg px-3 py-2">
              <p className="text-muted-foreground">O'rtacha</p>
              <p className="text-foreground font-bold">{dailyAvg ? fmt(Math.round(dailyAvg)) : "0 so'm"}</p>
            </div>
            <div className="bg-muted/50 rounded-lg px-3 py-2">
              <p className="text-muted-foreground">Eng yuqori</p>
              <p className="text-green-400 font-bold">{dailyBest ? fmt(dailyBest) : "0 so'm"}</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dailyData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
              <defs>
                <linearGradient id="dGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={Math.max(0, Math.floor(dailyData.length / 15) - 1)} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtShort(v)} />
              <Tooltip content={<CustomTooltip />} />
              {dailyAvg > 0 && <ReferenceLine y={dailyAvg} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" strokeOpacity={0.6} />}
              <Area type="monotone" dataKey="daromad" name="Daromad" stroke="#22c55e" strokeWidth={2.5} fill="url(#dGrad)"
                dot={(p: any) => {
                  if (p.payload.daromad === dailyBest) return <svg x={p.cx - 5} y={p.cy - 5} width={10} height={10}><circle cx={5} cy={5} r={4} fill="#22c55e" stroke="white" strokeWidth={2} /></svg>;
                  return <circle cx={p.cx} cy={p.cy} r={2} fill="#22c55e" opacity={0.5} />;
                }}
                activeDot={{ r: 5, fill: "#22c55e", stroke: "white", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── MONTHLY REVENUE ── */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
            <CardTitle className="text-foreground text-sm">Oylik daromad</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-muted rounded-lg p-0.5">
              {(["bar", "line"] as const).map((t) => (
                <button key={t} onClick={() => setMonthlyStyle(t)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${monthlyStyle === t ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
                >{t === "bar" ? "Ustunli" : "Chiziqli"}</button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={prevM}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-sm font-medium text-foreground min-w-[50px] text-center">{monthYear}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={nextM}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <div className="w-px h-5 bg-border mx-1" />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadExcel(
                monthlyData.map(d => ({ "Oy": d.name, "Daromad": d.daromad, "To'lovlar": d.count })),
                `oylik-daromad-${monthYear}`, "Oylik"
              )} title="Excel yuklash">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4 text-xs">
            <div className="bg-muted/50 rounded-lg px-3 py-2">
              <p className="text-muted-foreground">{monthYear} yil jami</p>
              <p className="text-foreground font-bold">{fmt(monthlyTotal)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg px-3 py-2">
              <p className="text-muted-foreground">O'rtacha oylik</p>
              <p className="text-foreground font-bold">{monthlyAvg ? fmt(Math.round(monthlyAvg)) : "0 so'm"}</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            {monthlyStyle === "bar" ? (
              <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <defs>
                  <linearGradient id="mGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtShort(v)} />
                <Tooltip content={<CustomTooltip />} />
                {monthlyAvg > 0 && (
                  <ReferenceLine y={monthlyAvg} stroke="#f59e0b" strokeDasharray="5 5" strokeOpacity={0.7} label={{
                    value: "O'rtacha", position: "right", fill: "hsl(var(--muted-foreground))", fontSize: 10,
                  }} />
                )}
                <Bar dataKey="daromad" name="Daromad" fill="url(#mGrad)" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            ) : (
              <LineChart data={monthlyData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtShort(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="daromad" name="Daromad" stroke="#3b82f6" strokeWidth={3}
                  dot={{ fill: "#3b82f6", r: 4, stroke: "white", strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: "#3b82f6", stroke: "white", strokeWidth: 2 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── YEARLY REVENUE ── */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
            <CardTitle className="text-foreground text-sm">Yillik daromad</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-muted rounded-lg p-0.5">
              {(["bar", "line"] as const).map((t) => (
                <button key={t} onClick={() => setYearlyStyle(t)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${yearlyStyle === t ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
                >{t === "bar" ? "Ustunli" : "Chiziqli"}</button>
              ))}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadExcel(
              yearlyChartData.map(d => ({ "Yil": d.name, "Daromad": d.daromad, "To'lovlar": d.count })),
              "yillik-daromad", "Yillik"
            )} title="Excel yuklash">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4 text-xs">
            <div className="bg-muted/50 rounded-lg px-3 py-2">
              <p className="text-muted-foreground">Jami daromad</p>
              <p className="text-foreground font-bold">{fmt(yearlyTotal)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg px-3 py-2">
              <p className="text-muted-foreground">O'rtacha yillik</p>
              <p className="text-foreground font-bold">{yearlyAvg ? fmt(Math.round(yearlyAvg)) : "0 so'm"}</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            {yearlyStyle === "bar" ? (
              <BarChart data={yearlyChartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <defs>
                  <linearGradient id="yGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14b8a6" stopOpacity={1} />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 13, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtShort(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="daromad" name="Daromad" fill="url(#yGrad)" radius={[6, 6, 0, 0]} maxBarSize={60} />
              </BarChart>
            ) : (
              <LineChart data={yearlyChartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 13, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtShort(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="daromad" name="Daromad" stroke="#14b8a6" strokeWidth={3}
                  dot={{ fill: "#14b8a6", r: 4, stroke: "white", strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: "#14b8a6", stroke: "white", strokeWidth: 2 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Row 1: Venue Ranking | Venue Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Venue Ranking */}
        {venueChartData.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground shrink-0" />
                <CardTitle className="text-foreground text-sm">Korxonalar reytingi</CardTitle>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadExcel(
                venueChartData.map(v => ({ "Korxona": v.name, "Daromad": v.value, "To'lovlar": v.count })),
                "korxonalar-reytingi", "Reyting"
              )} title="Excel yuklash">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(220, venueChartData.length * 38)}>
                <BarChart data={venueChartData} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }} barCategoryGap={6}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtShort(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={80} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Daromad" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {venueChartData.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Venue Pie */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <CardTitle className="text-foreground text-sm">Korxonalar bo'yicha daromad</CardTitle>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadExcel(
              venueChartData.map(v => ({ "Korxona": v.name, "Daromad": v.value, "Ulush": `${((v.value / (venueChartData.reduce((s, x) => s + x.value, 0))) * 100).toFixed(1)}%` })),
              "korxonalar-daromad", "Korxonalar"
            )} title="Excel yuklash">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {!venueChartData.length ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Ma'lumot mavjud emas</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={venueChartData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {venueChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="hsl(var(--background))" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Tariff Pie | Status Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tariff Pie */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground shrink-0" />
              <CardTitle className="text-foreground text-sm">Tarif rejalari bo'yicha daromad</CardTitle>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadExcel(
              tariffChartData.map(t => ({ "Tarif": t.name, "Daromad": t.value, "To'lovlar": t.count })),
              "tarif-daromad", "Tarif"
            )} title="Excel yuklash">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {!tariffChartData.length ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Ma'lumot mavjud emas</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={tariffChartData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {tariffChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="hsl(var(--background))" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status Donut */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
              <CardTitle className="text-foreground text-sm">To'lov holati</CardTitle>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadExcel(
              statusChartData.map(s => ({ "Holat": s.name, "Soni": s.value, "Foiz": `${((s.value / (statusChartData.reduce((a, x) => a + x.value, 0))) * 100).toFixed(1)}%` })),
              "tolov-holati", "Holat"
            )} title="Excel yuklash">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {!statusChartData.length ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Ma'lumot mavjud emas</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={statusChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                    dataKey="value" paddingAngle={4}>
                    {statusChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="hsl(var(--background))" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend formatter={(value: string) => <span className="text-foreground text-xs">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
