import { useGetOwnerSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Store, TrendingUp, AlertCircle } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ").format(n) + " so'm";
}

export default function OwnerDashboard() {
  const { data, isLoading } = useGetOwnerSummary();

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Yuklanmoqda...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Umumiy Ko'rinish</h1>
        <p className="text-muted-foreground mt-1">Barcha filiallar statistikasi</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Jami Filiallar</CardTitle>
            <Store className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{data?.totalVenues ?? 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Jami Daromad</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400">{fmt(data?.totalRevenue ?? 0)}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Jami Qarz</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-400">{fmt(data?.totalDebt ?? 0)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Filiallar Bo'yicha (Bugun)</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.venueStats?.length ? (
            <p className="text-muted-foreground text-sm py-4 text-center">Filial topilmadi</p>
          ) : (
            <div className="space-y-3">
              {data.venueStats.map((v) => (
                <div key={v.venueId} className="flex items-center justify-between p-4 bg-zinc-900 rounded-lg border border-border">
                  <div>
                    <p className="font-semibold text-foreground">{v.venueName}</p>
                    <p className="text-sm text-muted-foreground">{v.orderCount ?? 0} ta buyurtma bugun</p>
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 font-semibold">{fmt(v.todayRevenue)}</p>
                    {v.totalDebt > 0 && (
                      <p className="text-sm text-red-400">Qarz: {fmt(v.totalDebt)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
