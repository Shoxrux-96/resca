import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, MapPin, Clock, Package, Check, X, ChefHat, Truck, Bike, ShoppingBag, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type OnlineOrder = {
  id: number;
  venueId: number;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  telegramUserId: string | null;
  items: { productId: number; name: string; quantity: number; price: number; imageUrl: string | null }[];
  totalAmount: number;
  status: "new" | "accepted" | "preparing" | "ready" | "delivering" | "delivered" | "cancelled";
  notes: string | null;
  deliveryType: "pickup" | "delivery";
  acceptedBy: number | null;
  acceptedByName: string | null;
  courierId: number | null;
  courierName: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  new: { label: "Yangi", color: "bg-blue-500/20 text-blue-500 border-blue-500/30", icon: Package },
  accepted: { label: "Qabul qilindi", color: "bg-amber-500/20 text-amber-500 border-amber-500/30", icon: Check },
  preparing: { label: "Tayyorlanmoqda", color: "bg-orange-500/20 text-orange-500 border-orange-500/30", icon: ChefHat },
  ready: { label: "Tayyor", color: "bg-green-500/20 text-green-500 border-green-500/30", icon: Check },
  delivering: { label: "Yetkazilmoqda", color: "bg-purple-500/20 text-purple-500 border-purple-500/30", icon: Bike },
  delivered: { label: "Yetkazildi", color: "bg-emerald-500/20 text-emerald-500 border-emerald-500/30", icon: Check },
  cancelled: { label: "Bekor", color: "bg-red-500/20 text-red-500 border-red-500/30", icon: X },
};

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(n);
}

function timeAgo(iso: string) {
  return new Date(iso).toLocaleString("uz-UZ", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export default function OnlineOrdersPage() {
  const { user, token } = useAuth();
  const venueId = user?.venueId ?? 0;
  const role = user?.role;
  const qc = useQueryClient();
  const { toast } = useToast();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const [filter, setFilter] = useState<string>("new");
  const [receiptOrder, setReceiptOrder] = useState<OnlineOrder | null>(null);

  const { data: orders = [], isLoading } = useQuery<OnlineOrder[]>({
    queryKey: ["online-orders", venueId, filter],
    enabled: !!venueId && !!token,
    refetchInterval: 5_000,
    queryFn: async () => {
      const url = filter === "all"
        ? `/api/venues/${venueId}/online-orders`
        : `/api/venues/${venueId}/online-orders?status_filter=${filter}`;
      const r = await fetch(url, { headers });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const r = await fetch(`/api/venues/${venueId}/online-orders/${id}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["online-orders", venueId] });
      toast({ title: "Holat yangilandi" });
    },
    onError: () => toast({ title: "Xatolik", variant: "destructive" }),
  });

  // Role-based actions
  function getActions(o: OnlineOrder) {
    const actions: { label: string; status: string; color: string }[] = [];
    if (o.status === "cancelled" || o.status === "delivered") return actions;

    if (role === "dastavkachi" || role === "admin" || role === "owner") {
      if (o.status === "new") {
        actions.push({ label: "Qabul qilish", status: "accepted", color: "bg-blue-600 hover:bg-blue-700" });
        actions.push({ label: "Bekor qilish", status: "cancelled", color: "bg-red-600/80 hover:bg-red-700" });
      }
      if (o.status === "accepted") {
        actions.push({ label: "Oshxonaga yuborish", status: "preparing", color: "bg-orange-600 hover:bg-orange-700" });
      }
      if (o.status === "ready" && o.deliveryType === "delivery") {
        actions.push({ label: "Yetkazishga olish", status: "delivering", color: "bg-purple-600 hover:bg-purple-700" });
      }
      if (o.status === "delivering") {
        actions.push({ label: "Yetkazildi", status: "delivered", color: "bg-emerald-600 hover:bg-emerald-700" });
      }
      if (o.status === "ready" && o.deliveryType === "pickup") {
        actions.push({ label: "Berildi", status: "delivered", color: "bg-emerald-600 hover:bg-emerald-700" });
      }
    }

    if (role === "oshpaz" || role === "admin" || role === "owner") {
      if (o.status === "preparing") {
        actions.push({ label: "Tayyor", status: "ready", color: "bg-green-600 hover:bg-green-700" });
      }
    }

    return actions;
  }

  const counts = {
    all: orders.length,
    new: orders.filter((o) => o.status === "new").length,
    accepted: orders.filter((o) => o.status === "accepted").length,
    preparing: orders.filter((o) => o.status === "preparing").length,
    ready: orders.filter((o) => o.status === "ready").length,
    delivering: orders.filter((o) => o.status === "delivering").length,
  };

  const tabs = [
    { value: "all", label: "Barchasi", count: counts.all },
    { value: "new", label: "Yangi", count: counts.new },
    { value: "accepted", label: "Qabul qilingan", count: counts.accepted },
    { value: "preparing", label: "Tayyorlanmoqda", count: counts.preparing },
    { value: "ready", label: "Tayyor", count: counts.ready },
    { value: "delivering", label: "Yetkazilmoqda", count: counts.delivering },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Onlayn buyurtmalar</h1>
        <p className="text-muted-foreground text-sm mt-1">Telegram WebApp orqali kelgan buyurtmalar</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setFilter(t.value)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === t.value ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label} {t.count > 0 && <span className="ml-1 opacity-80">({t.count})</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <p className="text-center text-muted-foreground py-12">Yuklanmoqda...</p>
      ) : orders.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground">
          <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Onlayn buyurtmalar yo'q</p>
          <p className="text-sm mt-1">Telegram WebApp orqali buyurtmalar bu yerda paydo bo'ladi</p>
        </div>
      ) : filter === "all" ? (
        /* ───── RECEIPT TABLE ───── */
        <div className="overflow-x-auto">
          <table className="w-full text-base table-fixed">
            <thead>
              <tr className="border-b border-border/40 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="text-left py-2.5 px-2 font-medium w-[8%]">#</th>
                <th className="text-left py-2.5 px-2 font-medium w-[15%]">Mijoz</th>
                <th className="text-center py-2.5 px-2 font-medium w-[10%] hidden md:table-cell">Chek</th>
                <th className="text-right py-2.5 px-2 font-medium w-[12%]">Summa</th>
                <th className="text-center py-2.5 px-2 font-medium w-[12%]">Holat</th>
                <th className="text-center py-2.5 px-2 font-medium w-[10%] hidden md:table-cell">Yetkazish</th>
                <th className="text-center py-2.5 px-2 font-medium w-[18%] hidden md:table-cell">Vaqt</th>
                <th className="text-right py-2.5 px-2 font-medium w-[15%]">Amal</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const meta = STATUS_META[o.status];
                const StatusIcon = meta.icon;
                const actions = getActions(o);
                return (
                  <tr key={o.id} className="border-b border-border/20">
                    <td className="py-2 px-2 font-bold text-foreground truncate">#{o.id}</td>
                    <td className="py-2 px-2 truncate">
                      <p className="font-medium text-foreground truncate">{o.customerName}</p>
                      {o.customerPhone && <p className="text-xs text-muted-foreground truncate">{o.customerPhone}</p>}
                    </td>
                    <td className="py-2 px-2 text-center hidden md:table-cell">
                      <button
                        onClick={() => setReceiptOrder(o)}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-medium h-7 px-2.5 rounded-md"
                      >
                        Chek
                      </button>
                    </td>
                    <td className="py-2 px-2 text-right font-semibold text-foreground whitespace-nowrap truncate">
                      {fmt(o.totalAmount)} so'm
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${meta.color.replace('border-', '')}`}>
                        <StatusIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{meta.label}</span>
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center text-xs text-muted-foreground truncate hidden md:table-cell">
                      {o.deliveryType === "delivery" ? "Yetkazish" : "Olib ketish"}
                    </td>
                    <td className="py-2 px-2 text-center text-xs text-muted-foreground whitespace-nowrap truncate hidden md:table-cell">
                      {timeAgo(o.createdAt)}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex gap-1 justify-end">
                        {actions.length > 0 && actions.slice(0, 1).map((a) => (
                          <button
                            key={a.status}
                            className={`${a.color} text-white text-[11px] font-medium h-7 px-2.5 rounded-md`}
                            onClick={() => updateStatus.mutate({ id: o.id, status: a.status })}
                            disabled={updateStatus.isPending}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ───── CARD VIEW ───── */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {orders.map((o) => {
            const meta = STATUS_META[o.status];
            const StatusIcon = meta.icon;
            const actions = getActions(o);
            return (
              <div key={o.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">#{o.id}</span>
                    <Badge variant="outline" className={`text-[10px] ${meta.color}`}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {meta.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {o.deliveryType === "delivery" ? <><Bike className="h-3 w-3 mr-1" /> Yetkazib berish</> : <><Package className="h-3 w-3 mr-1" /> Olib ketish</>}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{timeAgo(o.createdAt)}</span>
                </div>

                {/* Customer */}
                <div className="px-4 py-2.5 border-b border-border space-y-1">
                  <p className="font-semibold text-foreground text-sm">{o.customerName}</p>
                  {o.customerPhone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Phone className="h-3 w-3" />
                      <a href={`tel:${o.customerPhone}`} className="hover:text-blue-500">{o.customerPhone}</a>
                    </p>
                  )}
                  {o.customerAddress && (
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{o.customerAddress}</span>
                    </p>
                  )}
                  {o.notes && (
                    <p className="text-xs text-amber-500/80 italic">📝 {o.notes}</p>
                  )}
                </div>

                {/* Items */}
                <div className="px-4 py-2.5 space-y-1">
                  {o.items.map((it, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{it.name} <span className="text-muted-foreground">× {it.quantity}</span></span>
                      <span className="font-medium text-foreground">{fmt(it.price * it.quantity)} so'm</span>
                    </div>
                  ))}
                </div>

                {/* Total + status info */}
                <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    {o.acceptedByName && <p>Qabul qildi: <span className="text-foreground">{o.acceptedByName}</span></p>}
                    {o.courierName && <p>Kuryer: <span className="text-foreground">{o.courierName}</span></p>}
                  </div>
                  <p className="font-bold text-foreground">
                    {fmt(o.totalAmount)} <span className="text-xs font-normal text-muted-foreground">so'm</span>
                  </p>
                </div>

                {/* Actions */}
                {actions.length > 0 && (
                  <div className="px-4 py-2.5 border-t border-border flex gap-2 flex-wrap">
                    {actions.map((a) => (
                      <Button
                        key={a.status}
                        size="sm"
                        className={`${a.color} text-white text-xs h-8`}
                        onClick={() => updateStatus.mutate({ id: o.id, status: a.status })}
                        disabled={updateStatus.isPending}
                      >
                        {a.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ───── RECEIPT MODAL ───── */}
      {receiptOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setReceiptOrder(null)}>
          <div
            className="bg-white text-black w-[320px] max-h-[90vh] overflow-y-auto p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="text-center border-b border-black/20 pb-3 mb-3">
              <h2 className="text-lg font-bold uppercase">Chek #{receiptOrder.id}</h2>
              <p className="text-xs text-black/60 mt-0.5">{timeAgo(receiptOrder.createdAt)}</p>
            </div>

            {/* Customer */}
            <div className="text-xs space-y-0.5 mb-3 pb-3 border-b border-black/20">
              <p><span className="text-black/60">Mijoz:</span> <span className="font-medium">{receiptOrder.customerName}</span></p>
              {receiptOrder.customerPhone && (
                <p><span className="text-black/60">Tel:</span> {receiptOrder.customerPhone}</p>
              )}
              {receiptOrder.customerAddress && (
                <p><span className="text-black/60">Manzil:</span> {receiptOrder.customerAddress}</p>
              )}
              <p><span className="text-black/60">Yetkazish:</span> {receiptOrder.deliveryType === "delivery" ? "Yetkazib berish" : "Olib ketish"}</p>
            </div>

            {/* Items */}
            <div className="text-xs space-y-1 mb-3 pb-3 border-b border-black/20">
              {receiptOrder.items.map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{it.name} ×{it.quantity}</span>
                  <span className="font-medium">{fmt(it.price * it.quantity)} so'm</span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex justify-between text-sm font-bold mb-4">
              <span>JAMI</span>
              <span>{fmt(receiptOrder.totalAmount)} so'm</span>
            </div>

            {/* Status */}
            <div className="text-center text-xs text-black/60 border-t border-black/20 pt-3">
              {STATUS_META[receiptOrder.status] && (
                <p>Holat: {STATUS_META[receiptOrder.status].label}</p>
              )}
            </div>

            {/* Close */}
            <button
              onClick={() => setReceiptOrder(null)}
              className="mt-4 w-full py-2 text-xs font-medium bg-black/5 hover:bg-black/10 rounded"
            >
              Yopish
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
