import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, MapPin, Clock, Package, Check, X, ChefHat, Truck, Bike, ShoppingBag } from "lucide-react";
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
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "hozir";
  if (m < 60) return `${m} daqiqa oldin`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} soat oldin`;
  return new Date(iso).toLocaleDateString("uz-UZ");
}

export default function OnlineOrdersPage() {
  const { user, token } = useAuth();
  const venueId = user?.venueId ?? 0;
  const role = user?.role;
  const qc = useQueryClient();
  const { toast } = useToast();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const [filter, setFilter] = useState<string>("all");

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

  const counts = {
    all: orders.length,
    new: orders.filter((o) => o.status === "new").length,
    accepted: orders.filter((o) => o.status === "accepted").length,
    preparing: orders.filter((o) => o.status === "preparing").length,
    ready: orders.filter((o) => o.status === "ready").length,
    delivering: orders.filter((o) => o.status === "delivering").length,
  };

  // Rolega qarab filtr default
  const tabs = [
    { value: "all", label: "Barchasi", count: counts.all },
    { value: "new", label: "Yangi", count: counts.new },
    { value: "preparing", label: "Tayyorlanmoqda", count: counts.preparing },
    { value: "ready", label: "Tayyor", count: counts.ready },
    { value: "delivering", label: "Yetkazilmoqda", count: counts.delivering },
  ];

  // Rolega qarab tugmalar
  function getActions(o: OnlineOrder) {
    const actions: { label: string; status: string; color: string }[] = [];
    if (o.status === "cancelled" || o.status === "delivered") return actions;

    if (role === "admin" || role === "kassir" || role === "owner") {
      if (o.status === "new") {
        actions.push({ label: "Qabul qilish", status: "accepted", color: "bg-blue-600 hover:bg-blue-700" });
        actions.push({ label: "Bekor", status: "cancelled", color: "bg-red-600/80 hover:bg-red-700" });
      }
    }
    if (role === "oshpaz" || role === "mangalchi" || role === "admin" || role === "owner") {
      if (o.status === "accepted" || o.status === "new") {
        actions.push({ label: "Tayyorlashni boshlash", status: "preparing", color: "bg-orange-600 hover:bg-orange-700" });
      }
      if (o.status === "preparing") {
        actions.push({ label: "Tayyor", status: "ready", color: "bg-green-600 hover:bg-green-700" });
      }
    }
    if (role === "dastavkachi" || role === "admin" || role === "owner") {
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
    return actions;
  }

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

      {/* Orders */}
      {isLoading ? (
        <p className="text-center text-muted-foreground py-12">Yuklanmoqda...</p>
      ) : orders.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground">
          <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Onlayn buyurtmalar yo'q</p>
          <p className="text-sm mt-1">Telegram WebApp orqali buyurtmalar bu yerda paydo bo'ladi</p>
        </div>
      ) : (
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
    </div>
  );
}
