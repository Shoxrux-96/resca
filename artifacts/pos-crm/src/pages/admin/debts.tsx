import { useState } from "react";
import {
  useListDebts,
  usePayDebt,
  getListDebtsQueryKey,
  type Debt,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Receipt, Phone, CheckCircle, AlertCircle, Clock, Search, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " so'm";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function AdminDebts() {
  const { user } = useAuth();
  const venueId = user?.venueId ?? 0;
  const { data: debts, isLoading } = useListDebts(venueId, {
    query: { enabled: !!venueId, queryKey: getListDebtsQueryKey(venueId) },
  });
  const payDebt = usePayDebt();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [payingDebt, setPayingDebt] = useState<Debt | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [filter, setFilter] = useState<"unpaid" | "partial" | "all" | "paid">("unpaid");
  const [search, setSearch] = useState("");

  const filtered = (debts ?? []).filter((d) => {
    const matchFilter =
      filter === "all" ? true :
      filter === "unpaid" ? (d.status === "unpaid" || d.status === "partial") :
      d.status === filter;
    const matchSearch = search.length === 0 || d.customerName.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const totalUnpaid = (debts ?? [])
    .filter((d) => d.status !== "paid")
    .reduce((sum, d) => sum + (d.remaining ?? d.amount), 0);

  const unpaidCount = (debts ?? []).filter((d) => d.status === "unpaid").length;
  const partialCount = (debts ?? []).filter((d) => d.status === "partial").length;
  const paidCount = (debts ?? []).filter((d) => d.status === "paid").length;

  const handlePay = () => {
    if (!payingDebt) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      toast({ title: "Miqdorni kiriting", variant: "destructive" });
      return;
    }
    const maxPay = payingDebt.remaining ?? payingDebt.amount;
    if (amount > maxPay) {
      toast({ title: `Maksimal to'lov: ${fmt(maxPay)}`, variant: "destructive" });
      return;
    }

    payDebt.mutate(
      { venueId, id: payingDebt.id, data: { amount } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListDebtsQueryKey(venueId) });
          setPayingDebt(null);
          setPayAmount("");
          toast({ title: "✅ To'lov qabul qilindi" });
        },
        onError: () => toast({ title: "Xatolik yuz berdi", variant: "destructive" }),
      }
    );
  };

  const statusBadge = (status: string) => {
    if (status === "paid")
      return <Badge className="bg-green-600/20 text-green-400 border-green-800 text-xs">✓ To'langan</Badge>;
    if (status === "partial")
      return <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-800 text-xs">◑ Qisman</Badge>;
    return <Badge className="bg-red-600/20 text-red-400 border-red-800 text-xs">✕ To'lanmagan</Badge>;
  };

  const filterBtns = [
    { key: "unpaid" as const, label: "Qarzdorlar", count: unpaidCount + partialCount, color: "text-red-400" },
    { key: "partial" as const, label: "Qisman", count: partialCount, color: "text-yellow-400" },
    { key: "paid" as const, label: "To'langan", count: paidCount, color: "text-green-400" },
    { key: "all" as const, label: "Barchasi", count: debts?.length ?? 0, color: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Qarz Daftar</h1>
        <p className="text-muted-foreground mt-1">Qarzga savdo qilgan mijozlar ro'yxati</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Jami qarzdorlar</span>
              <AlertCircle className="h-3.5 w-3.5 text-red-500" />
            </div>
            <p className="text-xl font-bold text-red-400">{unpaidCount + partialCount} ta</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Jami qarz summasi</span>
              <Wallet className="h-3.5 w-3.5 text-orange-500" />
            </div>
            <p className="text-xl font-bold text-orange-400">{fmt(totalUnpaid)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">To'langan</span>
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            </div>
            <p className="text-xl font-bold text-green-400">{paidCount} ta</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {filterBtns.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors active:scale-95 ${
                filter === f.key
                  ? "bg-blue-600 text-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              <span className={`ml-1 ${filter === f.key ? "text-blue-200" : f.color}`}>({f.count})</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Mijoz nomi bo'yicha qidirish..."
            className="pl-9 bg-input border-border text-foreground h-9 text-sm"
          />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-muted-foreground text-center py-10">Yuklanmoqda...</div>
      ) : !filtered.length ? (
        <Card className="bg-card border-border">
          <CardContent className="py-14 text-center">
            <Receipt className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-muted-foreground">{filter === "unpaid" ? "Qarzdor mijozlar yo'q" : "Yozuv topilmadi"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => {
            const remaining = d.remaining ?? d.amount;
            const pct = d.amount > 0 ? ((d.paidAmount ?? 0) / d.amount) * 100 : 0;
            return (
              <Card key={d.id} className={`border transition-colors ${d.status === "paid" ? "bg-card/50 border-border/50" : "bg-card border-border hover:border-border"}`}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-foreground">{d.customerName}</p>
                        {statusBadge(d.status)}
                      </div>
                      {d.customerPhone && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {d.customerPhone}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Buyurtma #{d.orderId} · {fmtDate(d.createdAt)}
                      </p>

                      {/* Progress bar for partial payments */}
                      {d.status === "partial" && d.amount > 0 && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>To'landi: {fmt(d.paidAmount ?? 0)}</span>
                            <span>{Math.round(pct)}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-yellow-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">Jami:</p>
                      <p className="text-sm text-foreground font-medium">{fmt(d.amount)}</p>
                      {d.status !== "paid" && (
                        <>
                          <p className="text-xs text-muted-foreground mt-1">Qoldi:</p>
                          <p className="text-lg font-bold text-red-400">{fmt(remaining)}</p>
                        </>
                      )}
                      {d.status === "paid" && (
                        <p className="text-sm text-green-400 mt-1">✓ To'liq to'landi</p>
                      )}
                      {d.status !== "paid" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setPayingDebt(d);
                            setPayAmount(String(Math.round(remaining)));
                          }}
                          className="mt-2 bg-green-600 hover:bg-green-700 text-foreground text-xs h-8"
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          To'lash
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pay Dialog */}
      <Dialog open={!!payingDebt} onOpenChange={() => { setPayingDebt(null); setPayAmount(""); }}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle>Qarz To'lash</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mijoz:</span>
                <span className="text-foreground font-medium">{payingDebt?.customerName}</span>
              </div>
              {payingDebt?.customerPhone && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Telefon:</span>
                  <span className="text-zinc-300">{payingDebt.customerPhone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Jami qarz:</span>
                <span className="text-foreground">{fmt(payingDebt?.amount ?? 0)}</span>
              </div>
              {(payingDebt?.paidAmount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">To'langan:</span>
                  <span className="text-green-400">{fmt(payingDebt?.paidAmount ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-zinc-300 font-medium">Qoldiq qarz:</span>
                <span className="text-red-400 font-bold">{fmt(payingDebt?.remaining ?? 0)}</span>
              </div>
            </div>

            <div>
              <Label className="text-zinc-300">To'lov miqdori (so'm)</Label>
              <Input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                max={payingDebt?.remaining ?? payingDebt?.amount}
                placeholder="Miqdorni kiriting"
                className="bg-input border-border mt-1.5 text-foreground"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setPayAmount(String(Math.round(payingDebt?.remaining ?? 0)))}
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  To'liq to'lash
                </button>
                <span className="text-zinc-700">·</span>
                <button
                  onClick={() => setPayAmount(String(Math.round((payingDebt?.remaining ?? 0) / 2)))}
                  className="text-xs text-muted-foreground hover:text-zinc-300 underline"
                >
                  Yarmini to'lash
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPayingDebt(null); setPayAmount(""); }} className="text-muted-foreground">
              Bekor
            </Button>
            <Button
              onClick={handlePay}
              disabled={!payAmount || Number(payAmount) <= 0 || payDebt.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {payDebt.isPending ? "Saqlanmoqda..." : "✓ To'lovni Qabul Qilish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
