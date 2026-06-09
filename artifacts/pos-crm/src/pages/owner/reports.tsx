import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend,
  ReferenceLine,
} from "recharts";
import {
  DollarSign, TrendingUp, CreditCard, Building2, Package,
  ChevronLeft, ChevronRight, CalendarDays, Activity,
} from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ").format(n) + " so'm";
}

function fmtShort(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + " mln";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + " ming";
  return String(n);
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

type ReportData = {
  totalRevenue: number;
  totalPayments: number;
  paidCount: number;
  pendingCount: number;
  failedCount: number;
  dailyBreakdown: { year: number; month: number; day: number; total: number; count: number }[];
  monthlyBreakdown: { year: number; month: number; total: number; count: number }[];
  yearlyBreakdown: { year: number; month: number; total: number; count: number }[];
  byVenue: { venueId: number; venueName: string; total: number; count: number }[];
  byTariff: { tariffPlanId: number; tariffName: string; total: number; count: number }[];
};

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

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
const STATUS_COLORS = { paid: "#22c55e", pending: "#f59e0b", failed: "#ef4444" };

function sum(arr: number[]) { return arr.reduce((a, b) => a + b, 0); }

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

function fillDays(data: { day: number; total: number; count: number }[], month: number, year: number) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const filled: { name: string; dayLabel: string; daromad: number; count: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const match = data.find((x) => x.day === d);
    filled.push({
      name: String(d),
      dayLabel: `${d} ${dayName(year, month, d)}`,
      daromad: match?.total || 0,
      count: match?.count || 0,
    });
  }
  return filled;
}

function fillMonths(data: { month: number; total: number; count: number }[], year: number) {
  const filled: { name: string; daromad: number; count: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const match = data.find((x) => x.month === m);
    filled.push({
      name: monthNameShort(m),
      daromad: match?.total || 0,
      count: match?.count || 0,
    });
  }
  return filled;
}

function DailyChart({ data, year, month, onPrev, onNext }: {
  data: { name: string; dayLabel: string; daromad: number; count: number }[];
  year: number; month: number; onPrev: () => void; onNext: () => void;
}) {
  const total = sum(data.map(d => d.daromad));
  const avg = total / data.filter(d => d.daromad > 0).length || 0;
  const best = Math.max(...data.map(d => d.daromad));

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
          <CardTitle className="text-foreground text-sm">Kunlik daromad</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={onPrev}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-sm font-medium text-foreground min-w-[120px] text-center">
            {monthName(month)} {year}
          </span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={onNext}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-4 text-xs">
          <div className="bg-muted/50 rounded-lg px-3 py-2">
            <p className="text-muted-foreground">Jami</p>
            <p className="text-foreground font-bold">{fmt(total)}</p>
          </div>
          <div className="bg-muted/50 rounded-lg px-3 py-2">
            <p className="text-muted-foreground">O'rtacha</p>
            <p className="text-foreground font-bold">{avg ? fmt(Math.round(avg)) : "0 so'm"}</p>
          </div>
          <div className="bg-muted/50 rounded-lg px-3 py-2">
            <p className="text-muted-foreground">Eng yuqori</p>
            <p className="text-green-400 font-bold">{best ? fmt(best) : "0 so'm"}</p>
          </div>
        </div>
        {!data.length ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Ma'lumot mavjud emas</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
              <defs>
                <linearGradient id="dailyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                interval={Math.max(0, Math.floor(data.length / 15) - 1)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v: number) => fmtShort(v)}
              />
              <Tooltip content={<CustomTooltip />} />
              {avg > 0 && (
                <ReferenceLine y={avg} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" strokeOpacity={0.6} />
              )}
              <Area
                type="monotone"
                dataKey="daromad"
                name="Daromad"
                stroke="#22c55e"
                strokeWidth={2.5}
                fill="url(#dailyGradient)"
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (payload.daromad === best) {
                    return (
                      <svg x={cx - 5} y={cy - 5} width={10} height={10}>
                        <circle cx={5} cy={5} r={4} fill="#22c55e" stroke="white" strokeWidth={2} />
                      </svg>
                    );
                  }
                  return <circle cx={cx} cy={cy} r={2} fill="#22c55e" opacity={0.5} />;
                }}
                activeDot={{ r: 5, fill: "#22c55e", stroke: "white", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function MonthlyChart({ data, year, onPrev, onNext }: {
  data: { name: string; daromad: number; count: number }[];
  year: number; onPrev: () => void; onNext: () => void;
}) {
  const total = sum(data.map(d => d.daromad));
  const avg = total / data.filter(d => d.daromad > 0).length || 0;
  const maxVal = Math.max(...data.map(d => d.daromad));

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
          <CardTitle className="text-foreground text-sm">Oylik daromad</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={onPrev}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-sm font-medium text-foreground min-w-[60px] text-center">{year}</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={onNext}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-4 text-xs">
          <div className="bg-muted/50 rounded-lg px-3 py-2">
            <p className="text-muted-foreground">Yillik jami</p>
            <p className="text-foreground font-bold">{fmt(total)}</p>
          </div>
          <div className="bg-muted/50 rounded-lg px-3 py-2">
            <p className="text-muted-foreground">O'rtacha oylik</p>
            <p className="text-foreground font-bold">{avg ? fmt(Math.round(avg)) : "0 so'm"}</p>
          </div>
        </div>
        {!data.length ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Ma'lumot mavjud emas</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
              <defs>
                <linearGradient id="monthlyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v: number) => fmtShort(v)}
              />
              <Tooltip content={<CustomTooltip />} />
              {avg > 0 && (
                <ReferenceLine y={avg} stroke="#f59e0b" strokeDasharray="5 5" strokeOpacity={0.7} label={{
                  value: "O'rtacha",
                  position: "right",
                  fill: "hsl(var(--muted-foreground))",
                  fontSize: 10,
                }} />
              )}
              <Bar
                dataKey="daromad"
                name="Daromad"
                fill="url(#monthlyGradient)"
                radius={[6, 6, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default function OwnerReports() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const now = useMemo(() => new Date(), []);
  const [dayYear, setDayYear] = useState(now.getFullYear());
  const [dayMonth, setDayMonth] = useState(now.getMonth() + 1);
  const [monthYear, setMonthYear] = useState(now.getFullYear());

  useEffect(() => {
    apiFetch<ReportData>("/api/owner/reports")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const dailyData = useMemo(
    () => fillDays(
      (data?.dailyBreakdown || []).filter(d => d.year === dayYear && d.month === dayMonth),
      dayMonth, dayYear,
    ),
    [data, dayYear, dayMonth],
  );

  const monthlyData = useMemo(
    () => fillMonths(
      (data?.monthlyBreakdown || []).filter(d => d.year === monthYear),
      monthYear,
    ),
    [data, monthYear],
  );

  const yearlyChartData = useMemo(
    () => (data?.yearlyBreakdown || []).map((y) => ({
      name: String(y.year),
      daromad: y.total,
      count: y.count,
    })),
    [data],
  );

  const venueChartData = useMemo(
    () => (data?.byVenue || []).map((v, i) => ({
      name: v.venueName,
      value: v.total,
      count: v.count,
      color: COLORS[i % COLORS.length],
    })),
    [data],
  );

  const tariffChartData = useMemo(
    () => (data?.byTariff || []).map((t, i) => ({
      name: t.tariffName,
      value: t.total,
      count: t.count,
      color: COLORS[i % COLORS.length],
    })),
    [data],
  );

  const statusChartData = useMemo(
    () => [
      { name: "To'langan", value: data?.paidCount || 0, color: STATUS_COLORS.paid },
      { name: "Kutilmoqda", value: data?.pendingCount || 0, color: STATUS_COLORS.pending },
      { name: "Muvaffaqiyatsiz", value: data?.failedCount || 0, color: STATUS_COLORS.failed },
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
  const prevMonth = () => setMonthYear(y => y - 1);
  const nextMonth = () => setMonthYear(y => y + 1);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analitik hisobot</h1>
          <p className="text-muted-foreground mt-1 text-sm">Platforma daromadlari bo'yicha tahlil</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Umumiy daromad", value: fmt(data?.totalRevenue || 0), color: "text-green-400" },
          { label: "Jami to'lovlar", value: `${data?.totalPayments || 0} ta`, color: "text-foreground" },
          { label: "To'langan", value: `${data?.paidCount || 0} ta`, color: "text-foreground" },
          { label: "Kutilmoqda", value: `${data?.pendingCount || 0} ta`, color: "text-yellow-400" },
          { label: "Muvaffaqiyatsiz", value: `${data?.failedCount || 0} ta`, color: "text-red-400" },
        ].map((item, i) => (
          <Card key={i} className="bg-card border-border">
            <CardHeader className="pb-1">
              <CardTitle className="text-[11px] font-medium text-muted-foreground">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DailyChart
          data={dailyData}
          year={dayYear}
          month={dayMonth}
          onPrev={prevDay}
          onNext={nextDay}
        />
        <MonthlyChart
          data={monthlyData}
          year={monthYear}
          onPrev={prevMonth}
          onNext={nextMonth}
        />
      </div>

      {/* Second row charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend Line Chart */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
              <CardTitle className="text-foreground text-sm">Daromad trendi</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {!monthlyData.length ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Ma'lumot mavjud emas</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={monthlyData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                  <defs>
                    <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v: number) => fmtShort(v)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="daromad" fill="url(#trendGradient)" stroke="none" />
                  <Line
                    type="monotone"
                    dataKey="daromad"
                    name="Daromad"
                    stroke="#8b5cf6"
                    strokeWidth={3}
                    dot={{ fill: "#8b5cf6", r: 4, stroke: "white", strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: "#8b5cf6", stroke: "white", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Payment Status Donut */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
              <CardTitle className="text-foreground text-sm">To'lov holati</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {!statusChartData.length ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Ma'lumot mavjud emas</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={statusChartData}
                    cx="50%" cy="50%"
                    innerRadius={65}
                    outerRadius={110}
                    dataKey="value"
                    paddingAngle={4}
                  >
                    {statusChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="hsl(var(--background))" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend
                    formatter={(value: string) => <span className="text-foreground text-sm">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pie Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <CardTitle className="text-foreground text-sm">Korxonalar bo'yicha daromad</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {!venueChartData.length ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Ma'lumot mavjud emas</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={venueChartData}
                    cx="50%" cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
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

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground shrink-0" />
              <CardTitle className="text-foreground text-sm">Tarif rejalari bo'yicha daromad</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {!tariffChartData.length ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Ma'lumot mavjud emas</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={tariffChartData}
                    cx="50%" cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
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
      </div>

      {/* Year-over-Year + Venue Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {yearlyChartData.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                <CardTitle className="text-foreground text-sm">Yillar bo'yicha daromad</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={yearlyChartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                  <defs>
                    <linearGradient id="yearlyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#14b8a6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 13, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v: number) => fmtShort(v)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="daromad" name="Daromad" fill="url(#yearlyGradient)" radius={[6, 6, 0, 0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {venueChartData.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <CardTitle className="text-foreground text-sm">Korxonalar reytingi</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, venueChartData.length * 45)}>
                <BarChart
                  data={venueChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  barCategoryGap={8}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v: number) => fmtShort(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    width={110}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Daromad" radius={[0, 6, 6, 0]} maxBarSize={24}>
                    {venueChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
