import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Calendar } from "lucide-react";

type ChartPoint = { label: string; revenue: number; expenses: number; profit: number };
type Summary = { totalRevenue: number; totalExpenses: number; netProfit: number; periodLabel: string };

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(n);
}

type Period = "day" | "month" | "year";

export default function AdminRevenue() {
  const { user, token } = useAuth();
  const venueId = user?.venueId ?? 0;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const [period, setPeriod] = useState<Period>("month");

  const { data: summary } = useQuery<Summary>({
    queryKey: ["finance-summary", venueId, period],
    enabled: !!venueId && !!token,
    queryFn: async () => { const r = await fetch(`/api/venues/${venueId}/finance/summary?period=${period}`, { headers }); return r.json(); },
  });

  const { data: chart = [] } = useQuery<ChartPoint[]>({
    queryKey: ["finance-chart", venueId, period],
    enabled: !!venueId && !!token,
    queryFn: async () => { const r = await fetch(`/api/venues/${venueId}/finance/chart?period=${period}`, { headers }); return r.json(); },
  });

  const profitIsPositive = (summary?.netProfit ?? 0) >= 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Daromad va Sof foyda</h1>
        <p className="text-muted-foreground text-sm mt-1">Moliyaviy ko'rsatkichlar</p>
      </div>

      {/* Period tabs */}
      <div className="flex gap-1.5">
        {([["day", "Bugun"], ["month", "Oylik"], ["year", "Yillik"]] as [Period, string][]).map(([p, l]) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${period === p ? "bg-blue-600/10 text-blue-500" : "text-muted-foreground hover:text-foreground bg-muted"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs text-muted-foreground">Daromad</span>
              <TrendingUp className="h-3.5 w-3.5 text-green-500" />
            </div>
            <p className="text-lg sm:text-2xl font-bold text-green-500">{fmt(summary?.totalRevenue ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{summary?.periodLabel} · so'm</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs text-muted-foreground">Xarajatlar</span>
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
            </div>
            <p className="text-lg sm:text-2xl font-bold text-red-500">{fmt(summary?.totalExpenses ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{summary?.periodLabel} · so'm</p>
          </CardContent>
        </Card>
        <Card className={`border-border ${profitIsPositive ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs text-muted-foreground">Sof foyda</span>
              <DollarSign className={`h-3.5 w-3.5 ${profitIsPositive ? "text-green-500" : "text-red-500"}`} />
            </div>
            <p className={`text-lg sm:text-2xl font-bold ${profitIsPositive ? "text-green-500" : "text-red-500"}`}>
              {profitIsPositive ? "+" : ""}{fmt(summary?.netProfit ?? 0)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{summary?.periodLabel} · so'm</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue + Expenses bar chart */}
      {chart.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3 sm:p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Daromad vs Xarajat</h3>
          <div className="h-52 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8 }}
                  formatter={(v: number, name: string) => [`${fmt(v)} so'm`, name === "revenue" ? "Daromad" : "Xarajat"]} />
                <Legend formatter={(v) => v === "revenue" ? "Daromad" : "Xarajat"} />
                <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Profit line chart */}
      {chart.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3 sm:p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Sof foyda dinamikasi</h3>
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8 }}
                  formatter={(v: number) => [`${fmt(v)} so'm`, "Sof foyda"]} />
                <Line type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Period info */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Calendar className="h-3.5 w-3.5" />
        <span>
          {period === "day" ? "Bugungi kunlik ma'lumot (soatlik)" :
           period === "month" ? "Joriy oy ma'lumotlari (kunlik)" :
           "Joriy yil ma'lumotlari (oylik)"}
        </span>
      </div>
    </div>
  );
}
