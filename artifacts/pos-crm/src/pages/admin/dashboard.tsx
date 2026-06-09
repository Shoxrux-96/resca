import { useGetVenueSummary, getGetVenueSummaryQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, AlertCircle, ShoppingBag, Clock, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import ProductAnalytics from "./product-analytics";

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " so'm";
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Hozir";
  if (mins < 60) return `${mins} daqiqa oldin`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} soat oldin`;
  return d.toLocaleDateString("uz-UZ");
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const venueId = user?.venueId ?? 0;
  const { data, isLoading } = useGetVenueSummary(venueId, {
    query: { enabled: !!venueId, queryKey: getGetVenueSummaryQueryKey(venueId) },
  });

  const baseUrl = window.location.origin;
  const venueName = encodeURIComponent(user?.venueName ?? "");
  const menuUrl = `${baseUrl}/menu/${venueName}`;

  if (isLoading) return <div className="text-muted-foreground">Yuklanmoqda...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Boshqaruv Paneli</h1>
        <p className="text-muted-foreground text-sm mt-1">{user?.venueName}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-[10px] sm:text-xs text-muted-foreground">Bugungi daromad</CardTitle>
            <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-base sm:text-xl font-bold text-green-400">{fmt(data?.todayRevenue ?? 0)}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-[10px] sm:text-xs text-muted-foreground">Bugungi buyurtmalar</CardTitle>
            <ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-base sm:text-xl font-bold text-foreground">{data?.todayOrderCount ?? 0}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-[10px] sm:text-xs text-muted-foreground">Jami qarz</CardTitle>
            <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-base sm:text-xl font-bold text-red-400">{fmt(data?.totalDebt ?? 0)}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-[10px] sm:text-xs text-muted-foreground">To'lanmagan qarz</CardTitle>
            <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-orange-500" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-base sm:text-xl font-bold text-orange-400">{data?.unpaidDebtCount ?? 0} ta</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* QR Code Section */}
        <Card className="bg-card border-border h-full">
          <CardHeader>
            <CardTitle className="text-foreground text-sm flex items-center gap-2">
              <QrCode className="h-4 w-4 text-[#E0714F]" />
              Online Menyu QR Kodi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Bu QR kodni bosib chiqarib, stol ustiga qo'ying. Mijozlar skanerlab menyuni ko'radi.
            </p>
            <div className="flex flex-col items-center gap-3 bg-zinc-900/50 rounded-xl p-4">
              <QRCodeSVG value={menuUrl} size={130} level="M" className="shrink-0" />
              <div className="text-sm text-center">
                <p className="text-foreground font-medium">{user?.venueName}</p>
                <p className="text-muted-foreground mt-1 break-all text-xs">{menuUrl}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Skanerlang va menyuni ko'ring
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {data?.recentOrders && data.recentOrders.length > 0 && (
          <Card className="bg-card border-border h-full">
            <CardHeader className="flex flex-row items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-foreground text-sm">So'nggi Buyurtmalar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.recentOrders.slice(0, 5).map((o) => (
                <div key={o.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground">{o.customerName || "Naqd mijoz"}</p>
                    <p className="text-xs text-muted-foreground">{timeAgo(o.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">{fmt(o.totalAmount)}</p>
                    <p className={`text-xs ${o.paymentType === "debt" ? "text-red-400" : "text-green-400"}`}>
                      {o.paymentType === "debt" ? "Qarz" : "Naqd"}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Mahsulot analitikasi */}
      <ProductAnalytics />
    </div>
  );
}
