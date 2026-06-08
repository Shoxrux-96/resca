import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Award, AlertCircle, Trophy, Crown, Frown, Star } from "lucide-react";

type ProductStat = {
  productId: number;
  productName: string;
  quantitySold: number;
  revenue: number;
  costTotal: number;
  profit: number;
  profitMargin: number;
};

type Analytics = {
  topProfit: ProductStat[];
  bottomProfit: ProductStat[];
  topSold: ProductStat[];
  bottomSold: ProductStat[];
};

type Period = "day" | "month" | "year" | "all";

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(n);
}

export default function ProductAnalytics() {
  const { user, token } = useAuth();
  const venueId = user?.venueId ?? 0;
  const [period, setPeriod] = useState<Period>("all");

  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ["product-analytics", venueId, period],
    enabled: !!venueId && !!token,
    queryFn: async () => {
      const r = await fetch(`/api/venues/${venueId}/analytics/products?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-foreground">Mahsulot analitikasi</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Top va bottom 5 ta — har bir kategoriya bo'yicha</p>
        </div>
        <div className="flex gap-1.5">
          {([["day", "Bugun"], ["month", "Oylik"], ["year", "Yillik"], ["all", "Barchasi"]] as [Period, string][]).map(([p, l]) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === p ? "bg-blue-600/10 text-blue-500" : "text-muted-foreground hover:text-foreground bg-muted"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Yuklanmoqda...</p>
      ) : !data ? (
        <p className="text-muted-foreground text-center py-8">Ma'lumot topilmadi</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. Eng ko'p foyda */}
          <AnalyticsCard
            icon={Crown}
            iconColor="text-amber-500"
            bgColor="bg-amber-500/10"
            title="Eng ko'p foyda"
            subtitle="Top 5 foyda keltirgan"
            items={data.topProfit}
            primaryField="profit"
            primaryLabel="foyda"
            valueColor="text-green-500"
            emptyText="Sotuvlar yo'q"
          />

          {/* 2. Eng kam foyda / zarar */}
          <AnalyticsCard
            icon={Frown}
            iconColor="text-red-500"
            bgColor="bg-red-500/10"
            title="Eng kam foyda / zarar"
            subtitle="Bottom 5 foyda yoki zarar"
            items={data.bottomProfit}
            primaryField="profit"
            primaryLabel="foyda"
            valueColor="text-red-500"
            valueColorPositive="text-amber-500"
            emptyText="Sotuvlar yo'q"
          />

          {/* 3. Eng ko'p sotilgan */}
          <AnalyticsCard
            icon={Trophy}
            iconColor="text-blue-500"
            bgColor="bg-blue-500/10"
            title="Eng ko'p sotilgan"
            subtitle="Top 5 mashhur"
            items={data.topSold}
            primaryField="quantitySold"
            primaryLabel="ta sotildi"
            valueColor="text-blue-500"
            emptyText="Sotuvlar yo'q"
            showQty
          />

          {/* 4. Eng kam sotilgan */}
          <AnalyticsCard
            icon={AlertCircle}
            iconColor="text-orange-500"
            bgColor="bg-orange-500/10"
            title="Eng kam sotilgan"
            subtitle="Bottom 5 — diqqat talab"
            items={data.bottomSold}
            primaryField="quantitySold"
            primaryLabel="ta sotildi"
            valueColor="text-orange-500"
            emptyText="Sotuvlar yo'q"
            showQty
          />
        </div>
      )}
    </div>
  );
}

function AnalyticsCard({
  icon: Icon, iconColor, bgColor, title, subtitle, items, primaryField, primaryLabel,
  valueColor, valueColorPositive, emptyText, showQty,
}: {
  icon: any; iconColor: string; bgColor: string; title: string; subtitle: string;
  items: ProductStat[]; primaryField: keyof ProductStat; primaryLabel: string;
  valueColor: string; valueColorPositive?: string; emptyText: string; showQty?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <div className={`w-9 h-9 rounded-xl ${bgColor} flex items-center justify-center shrink-0`}>
          <Icon className={`h-4.5 w-4.5 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-sm">{title}</h3>
          <p className="text-[10px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">{emptyText}</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((it, idx) => {
            const value = it[primaryField] as number;
            const isPositive = value > 0;
            const colorClass = !isPositive && valueColorPositive ? valueColor :
                              isPositive && valueColorPositive ? valueColorPositive :
                              valueColor;
            return (
              <div key={it.productId} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                {/* Rank */}
                <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  idx === 0 ? "bg-amber-500/20 text-amber-500" :
                  idx === 1 ? "bg-zinc-400/20 text-zinc-400" :
                  idx === 2 ? "bg-orange-500/20 text-orange-500" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {idx + 1}
                </div>
                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{it.productName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {showQty
                      ? `Daromad: ${fmt(it.revenue)} so'm · Foyda: ${fmt(it.profit)} so'm`
                      : `${it.quantitySold} ta · Daromad: ${fmt(it.revenue)} so'm`}
                  </p>
                </div>
                {/* Value */}
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${colorClass}`}>
                    {showQty ? `${fmt(it.quantitySold)}` : `${isPositive ? "+" : ""}${fmt(value)}`}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{primaryLabel}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
