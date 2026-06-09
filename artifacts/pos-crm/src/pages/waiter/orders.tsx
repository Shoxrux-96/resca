import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  useListOpenOrders,
  useListRooms,
  useListTables,
  useCancelOpenOrder,
  getListOpenOrdersQueryKey,
  getListRoomsQueryKey,
  getListTablesQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList, Plus, X, Eye, Ban, CheckCircle, Clock,
  UtensilsCrossed, DoorOpen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ").format(n);
}

export default function WaiterOrders() {
  const { user } = useAuth();
  const venueId = user?.venueId ?? 0;
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: openOrders, refetch } = useListOpenOrders(venueId, {
    query: { enabled: !!venueId, refetchInterval: 5_000, queryKey: getListOpenOrdersQueryKey(venueId) },
  });
  const { data: rooms } = useListRooms(venueId, {
    query: { enabled: !!venueId, queryKey: getListRoomsQueryKey(venueId) },
  });
  const { data: tables } = useListTables(venueId, {
    query: { enabled: !!venueId, queryKey: getListTablesQueryKey(venueId) },
  });

  const cancelOrder = useCancelOpenOrder();

  const myOrders = useMemo(() => {
    return (openOrders ?? [])
      .filter((o) => o.waiterId === user?.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [openOrders, user?.id]);

  const roomMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rooms ?? []) m.set(r.id, r.name);
    return m;
  }, [rooms]);

  const tableMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of tables ?? []) m.set(t.id, `Stol #${t.number}`);
    return m;
  }, [tables]);

  const handleCancel = (orderId: number) => {
    cancelOrder.mutate(
      { venueId, orderId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListOpenOrdersQueryKey(venueId) });
          toast({ title: "Bekor qilindi" });
        },
        onError: () => toast({ title: "Xatolik", variant: "destructive" }),
      }
    );
  };

  const handleClose = async (orderId: number) => {
    try {
      const r = await fetch(`/api/venues/${venueId}/open-orders/${orderId}/waiter-close`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("restoCrm_auth") ? JSON.parse(localStorage.getItem("restoCrm_auth")!).token : ""}`,
          "Content-Type": "application/json",
        },
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || "Xatolik");
      }
      refetch();
      toast({ title: "Kassaga topshirildi ✅" });
    } catch (e: any) {
      toast({ title: e.message || "Xatolik", variant: "destructive" });
    }
  };

  const statusLabel: Record<string, { label: string; color: string }> = {
    open: { label: "Ochiq", color: "text-blue-600 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30" },
    preparing: { label: "Tayyorlanmoqda", color: "text-amber-600 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30" },
    ready: { label: "Tayyor", color: "text-green-600 bg-green-100 dark:text-green-300 dark:bg-green-900/30" },
  };

  if (myOrders.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2 mb-6">
          <ClipboardList className="h-5 w-5 text-blue-500" />
          Mening buyurtmalarim
        </h1>
        <div className="text-center py-20 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Hozircha buyurtmalar yo'q</p>
          <p className="text-sm mt-1">Yangi buyurtma yaratish uchun Stol va Xonalar bo'limiga o'ting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-blue-500" />
          Mening buyurtmalarim
        </h1>
        <span className="text-sm text-muted-foreground">{myOrders.length} ta</span>
      </div>

      {myOrders.map((order) => {
        const sl = statusLabel[order.status] ?? { label: order.status, color: "text-gray-600 bg-gray-100" };
        const locationStr = [
          order.roomName || (order.roomId ? roomMap.get(order.roomId) : null),
          order.tableNumber ? `Stol #${order.tableNumber}` : (order.tableId ? tableMap.get(order.tableId) : null),
        ].filter(Boolean).join(" · ");

        return (
          <div
            key={order.id}
            className="bg-card border border-border rounded-2xl overflow-hidden"
          >
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-lg text-foreground">#{order.id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sl.color}`}>
                      {sl.label}
                    </span>
                    {order.waiterClosed && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium text-emerald-600 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/30">
                        <CheckCircle className="h-3 w-3 inline mr-0.5" />
                        Kassaga topshirilgan
                      </span>
                    )}
                  </div>
                  {locationStr && (
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                      <DoorOpen className="h-3.5 w-3.5" />
                      {locationStr}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground mt-1">
                    Summa: <span className="font-bold text-foreground">{fmt(order.totalAmount)} so'm</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!order.waiterClosed && order.status === "open" && (
                    <button
                      onClick={() => handleClose(order.id)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-xl font-medium flex items-center gap-1 transition-colors"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Kassaga topshirish
                    </button>
                  )}
                  {order.status === "open" && !order.waiterClosed && (
                    <button
                      onClick={() => handleCancel(order.id)}
                      className="px-3 py-1.5 border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 text-xs rounded-xl font-medium flex items-center gap-1 transition-colors"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Bekor qilish
                    </button>
                  )}
                </div>
              </div>
              {order.items && order.items.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground mb-1.5 font-medium">Mahsulotlar:</p>
                  <div className="space-y-1">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-foreground">{item.productName} × {item.quantity}</span>
                        <span className="text-muted-foreground">{fmt(item.total)} so'm</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
