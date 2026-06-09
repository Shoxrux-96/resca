import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import {
  useListRooms,
  useListTables,
  useListProducts,
  getListRoomsQueryKey,
  getListTablesQueryKey,
  getListProductsQueryKey,
  getListOpenOrdersQueryKey,
  useListOpenOrders,
  useCreateOpenOrder,
  useCancelOpenOrder,
  type Product,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Search, Plus, Minus, Trash2, Save, X, ShoppingCart, CheckCircle, Ban,
  Send, ChefHat, UtensilsCrossed,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime24 } from "@/lib/datetime";

type RoomBooking = {
  id: number; venueId: number; roomId: number; tableId?: number | null;
  customerName: string; customerPhone?: string | null;
  startAt: string; endAt: string; notes?: string | null;
  status: "active" | "completed" | "cancelled"; createdAt: string;
};

type CartItem = { product: Product; quantity: number };
type OrderItemEx = {
  id: number; productId: number; productName: string; quantity: number;
  unitPrice: number; discountPct: number; total: number;
  batchNumber: number | null; itemStatus: string;
};
type BatchGroup = { batchNumber: number; status: string; items: OrderItemEx[] };
type TableInfo = {
  id: number; number: number; name: string | null;
  roomId: number | null; roomName: string | null;
  isOccupied?: boolean; openOrderId?: number | null;
};

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const ITEM_STATUS = {
  draft: { label: "Qoralama", color: "text-gray-400 bg-gray-800/40 border-gray-700/50" },
  sent: { label: "Oshxonada", color: "text-yellow-300 bg-yellow-900/30 border-yellow-700/50" },
  preparing: { label: "Tayyorlanmoqda", color: "text-orange-300 bg-orange-900/30 border-orange-700/50" },
  ready: { label: "Tayyor", color: "text-emerald-300 bg-emerald-900/30 border-emerald-700/50" },
  served: { label: "Yetkazildi", color: "text-blue-300 bg-blue-900/30 border-blue-700/50" },
} as const;

export default function WaiterOrder() {
  const { tableId: tableIdStr } = useParams<{ tableId: string }>();
  const tableId = parseInt(tableIdStr ?? "0", 10);
  const [, setLocation] = useLocation();
  const { user, token } = useAuth();
  const venueId = user?.venueId ?? 0;
  const qc = useQueryClient();
  const { toast } = useToast();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Barchasi");
  const [showCart, setShowCart] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [serveBusy, setServeBusy] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: rooms } = useListRooms(venueId, {
    query: { enabled: !!venueId, queryKey: getListRoomsQueryKey(venueId) },
  });
  const { data: tables } = useListTables(venueId, {
    query: { enabled: !!venueId, queryKey: getListTablesQueryKey(venueId) },
  });
  const { data: products } = useListProducts(venueId, {
    query: { enabled: !!venueId, queryKey: getListProductsQueryKey(venueId) },
  });
  const { data: openOrders } = useListOpenOrders(venueId, {
    query: { enabled: !!venueId, queryKey: getListOpenOrdersQueryKey(venueId) },
  });
  const { data: bookings } = useQuery<RoomBooking[]>({
    queryKey: ["room-bookings", venueId],
    enabled: !!venueId && !!token,
    refetchInterval: 5_000,
    queryFn: async () => {
      const res = await fetch(`/api/venues/${venueId}/room-bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const now = new Date();
  const tableBooking = useMemo(() => {
    if (!bookings || !tableId) return null;
    return bookings.find((b) => {
      if (b.status !== "active") return false;
      if (b.tableId !== tableId) return false;
      return new Date(b.startAt) <= now && now <= new Date(b.endAt);
    }) ?? null;
  }, [bookings, tableId]);

  const createOpenOrder = useCreateOpenOrder();
  const cancelOpenOrder = useCancelOpenOrder();

  const tableInfo: TableInfo | null = useMemo(() => {
    if (!tables || !rooms || !tableId) return null;
    const table = tables.find((t) => t.id === tableId);
    if (!table) return null;
    const room = rooms.find((r) => r.id === table.roomId);
    return {
      id: table.id,
      number: table.number,
      name: table.name ?? null,
      roomId: table.roomId ?? null,
      roomName: room?.name ?? null,
    };
  }, [tables, rooms, tableId]);

  const allTableOrders = useMemo(() => {
    return (openOrders ?? []).filter((o) => o.tableId === tableId);
  }, [openOrders, tableId]);

  const existingOrder = allTableOrders[0] ?? null;
  const orderCount = allTableOrders.length;

  // Check if this order belongs to the current waiter
  const isWaiterOwner = !existingOrder || existingOrder.waiterId === user?.id;

  // All items from all orders
  const orderItems = useMemo<OrderItemEx[]>(() => {
    if (!existingOrder) return [];
    return existingOrder.items.map((i: any) => ({
      ...i,
      batchNumber: i.batchNumber ?? null,
      itemStatus: i.itemStatus ?? "draft",
    }));
  }, [existingOrder]);

  const draftItems = useMemo(() => orderItems.filter((i) => i.itemStatus === "draft"), [orderItems]);
  const batches = useMemo<BatchGroup[]>(() => {
    const grouped = new Map<number, OrderItemEx[]>();
    for (const item of orderItems) {
      if (item.batchNumber != null && item.itemStatus !== "draft") {
        const list = grouped.get(item.batchNumber) ?? [];
        list.push(item);
        grouped.set(item.batchNumber, list);
      }
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .map(([batchNumber, items]) => ({
        batchNumber,
        status: items[0].itemStatus,
        items,
      }));
  }, [orderItems]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set((products ?? []).filter((p) => p.isAvailable && p.category).map((p) => p.category!)));
    return ["Barchasi", ...cats];
  }, [products]);

  const filteredProducts = useMemo(() =>
    (products ?? []).filter((p) => {
      if (!p.isAvailable) return false;
      const matchCat = activeCategory === "Barchasi" || p.category === activeCategory;
      const matchSearch = !search.trim() || p.name.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    }),
    [products, activeCategory, search]
  );

  const addProduct = (product: Product) => {
    setCart((prev) => {
      const ex = prev.find((i) => i.product.id === product.id);
      return ex ? prev.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i) : [...prev, { product, quantity: 1 }];
    });
  };

  const changeQty = (productId: number, delta: number) => {
    setCart((prev) => prev.map((i) => i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i).filter((i) => i.quantity > 0));
  };

  const removeItem = (productId: number) => setCart((prev) => prev.filter((i) => i.product.id !== productId));
  const total = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const orderTotal = orderItems.reduce((s, i) => s + i.total, 0);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListOpenOrdersQueryKey(venueId) });
  };

  const handleSave = async () => {
    if (cart.length === 0) { toast({ title: "Mahsulot qo'shing", variant: "destructive" }); return; }
    if (tableBooking && !existingOrder) {
      toast({ title: `Bu stol bron qilingan (${tableBooking.customerName})`, variant: "destructive" });
      return;
    }
    const items = cart.map((i) => ({ productId: i.product.id, quantity: i.quantity }));
    const onSuccess = () => {
      setCart([]);
      invalidate();
      toast({ title: "Mahsulotlar saqlandi", variant: "default" });
    };
    const onError = (err: any) => {
      const status = err?.status ?? err?.response?.status ?? 0;
      const msg = status === 409
        ? "Bu stol boshqa afitsiant tomonidan xizmat ko'rsatilmoqda"
        : status === 403
        ? "Bu sizning mijozingiz emas"
        : err?.data?.error ?? "Xatolik";
      toast({ title: msg, variant: "destructive" });
    };

    if (existingOrder) {
      try {
        const r = await fetch(`/api/venues/${venueId}/open-orders/${existingOrder.id}/items`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          if (r.status === 403) throw new Error("Bu sizning mijozingiz emas");
          if (r.status === 409) throw new Error("Bu stol boshqa afitsiant tomonidan xizmat ko'rsatilmoqda");
          throw new Error(err.detail || "Xatolik");
        }
        onSuccess();
      } catch (e: any) {
        toast({ title: e.message || "Xatolik", variant: "destructive" });
      }
    } else {
      createOpenOrder.mutate(
        { venueId, data: { tableId, tableNumber: tableInfo?.number ?? null, roomId: tableInfo?.roomId ?? null, roomName: tableInfo?.roomName ?? null, items } },
        { onSuccess, onError }
      );
    }
  };

  const [activeRoundIdx, setActiveRoundIdx] = useState(0);

  useEffect(() => {
    if (orderCount > 0 && activeRoundIdx >= orderCount) {
      setActiveRoundIdx(orderCount - 1);
    }
  }, [orderCount, activeRoundIdx]);

  const handleNewRound = () => {
    if (cart.length === 0) { toast({ title: "Avval mahsulot qo'shing", variant: "destructive" }); return; }
    if (tableBooking && !existingOrder) {
      toast({ title: `Bu stol bron qilingan (${tableBooking.customerName})`, variant: "destructive" });
      return;
    }
    const items = cart.map((i) => ({ productId: i.product.id, quantity: i.quantity }));
    createOpenOrder.mutate(
      { venueId, data: { tableId, tableNumber: tableInfo?.number ?? null, roomId: tableInfo?.roomId ?? null, roomName: tableInfo?.roomName ?? null, items } },
      {
        onSuccess: () => {
          setCart([]);
          invalidate();
          toast({ title: "Yangi tur qo'shildi", variant: "default" });
        },
        onError: (err: any) => {
          const status = err?.status ?? err?.response?.status ?? 0;
          const msg = status === 409
            ? "Bu stol boshqa afitsiant tomonidan xizmat ko'rsatilmoqda"
            : status === 403
            ? "Bu sizning mijozingiz emas"
            : err?.data?.error ?? "Xatolik";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleSendBatch = async () => {
    if (!existingOrder) return;
    setSendBusy(true);
    try {
      const r = await fetch(`/api/venues/${venueId}/open-orders/${existingOrder.id}/send-batch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        if (r.status === 403) throw new Error("Bu sizning mijozingiz emas");
        throw new Error(err.detail || "Xatolik");
      }
      invalidate();
      toast({ title: "Oshxonaga yuborildi", variant: "default" });
    } catch (e: any) {
      toast({ title: e.message || "Xatolik", variant: "destructive" });
    } finally {
      setSendBusy(false);
    }
  };

  const handleServeBatch = async (batchNumber: number) => {
    if (!existingOrder) return;
    setServeBusy(batchNumber);
    try {
      const r = await fetch(`/api/venues/${venueId}/open-orders/${existingOrder.id}/batch/${batchNumber}/serve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        if (r.status === 403) throw new Error("Bu sizning mijozingiz emas");
        throw new Error(err.detail || "Xatolik");
      }
      invalidate();
      toast({ title: "Yetkazildi", variant: "default" });
    } catch (e: any) {
      toast({ title: e.message || "Xatolik", variant: "destructive" });
    } finally {
      setServeBusy(null);
    }
  };

  const handleCancel = () => {
    if (!existingOrder) { setLocation("/waiter/orders"); return; }
    if (!confirm("Bu buyurtmani bekor qilasizmi?")) return;
    cancelOpenOrder.mutate({ venueId, orderId: existingOrder.id }, {
      onSuccess: () => {
        invalidate();
        setLocation("/waiter/orders");
      },
      onError: (err: any) => {
        const status = err?.status ?? err?.response?.status ?? 0;
        const msg = status === 403 ? "Bu sizning mijozingiz emas" : "Xatolik";
        toast({ title: msg, variant: "destructive" });
      },
    });
  };

  const handleWaiterClose = async () => {
    if (!existingOrder) return;
    if (!confirm("Buyurtmani yopish va kassirga topshirishni tasdiqlaysizmi?")) return;
    try {
      const r = await fetch(`/api/venues/${venueId}/open-orders/${existingOrder.id}/waiter-close`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        if (r.status === 403) throw new Error("Bu sizning mijozingiz emas");
        throw new Error(err.detail || "Xatolik");
      }
      invalidate();
      setSaved(true);
      setTimeout(() => setLocation("/waiter/orders"), 1400);
    } catch (e: any) {
      toast({ title: e.message || "Xatolik", variant: "destructive" });
    }
  };

  if (saved) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-zinc-950 z-50">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-5">
          <CheckCircle className="h-12 w-12 text-emerald-400" />
        </div>
        <p className="text-2xl font-bold text-foreground">Buyurtma yopildi!</p>
        <p className="text-muted-foreground mt-2">Kassirga topshirildi</p>
      </div>
    );
  }

  if (existingOrder && !isWaiterOwner) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-zinc-950 z-50">
        <div className="w-20 h-20 rounded-full bg-red-900/30 flex items-center justify-center mb-5">
          <Ban className="h-12 w-12 text-red-400" />
        </div>
        <p className="text-2xl font-bold text-foreground">Bu sizning mijozingiz emas</p>
        <p className="text-muted-foreground mt-2 text-center max-w-xs">
          Ushbu buyurtma boshqa afitsiant tomonidan xizmat ko'rsatilmoqda
        </p>
        <button
          onClick={() => setLocation("/waiter/orders")}
          className="mt-6 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white text-sm font-semibold active:scale-95 transition-all"
        >
          Ortga qaytish
        </button>
      </div>
    );
  }

  const isBusy = createOpenOrder.isPending || sendBusy;

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden">
      <header className="flex items-center gap-3 px-4 h-14 border-b border-border bg-card shrink-0">
        <button
          onClick={() => setLocation("/waiter/orders")}
          className="p-2 -ml-1 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent active:scale-95 transition-all"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground text-base leading-tight">
            {tableInfo ? `Stol #${tableInfo.number}` : "Buyurtma"}
            {tableInfo?.name ? ` · ${tableInfo.name}` : ""}
          </p>
          {tableInfo?.roomName && (
            <p className="text-xs text-muted-foreground leading-none mt-0.5">{tableInfo.roomName}</p>
          )}
        </div>
        {existingOrder && orderCount > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            {allTableOrders.map((o, i) => (
              <button
                key={o.id}
                onClick={() => setActiveRoundIdx(i)}
                className={`text-xs font-bold px-2 py-1 rounded-lg transition-all ${
                  i === activeRoundIdx
                    ? "bg-orange-600 text-white"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                #{o.id}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setShowCart(true)}
          className="relative p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent active:scale-95 transition-all"
        >
          <ShoppingCart className="h-5 w-5" />
          {cartCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none px-1">
              {cartCount}
            </span>
          )}
        </button>
      </header>

      {/* Round selector bar */}
      {orderCount > 1 && (
        <div className="bg-zinc-900/60 border-b border-border px-4 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="text-xs text-muted-foreground shrink-0">Turlar:</span>
          {allTableOrders.map((o, i) => (
            <button
              key={o.id}
              onClick={() => setActiveRoundIdx(i)}
              className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                i === activeRoundIdx
                  ? "bg-orange-600 text-white"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              #{o.id}
            </button>
          ))}
          <button
            onClick={handleNewRound}
            disabled={cart.length === 0 || createOpenOrder.isPending}
            className="shrink-0 flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-all ml-auto"
          >
            <Plus className="h-3 w-3" />
            Yangi tur
          </button>
        </div>
      )}

      {tableBooking && !existingOrder && (
        <div className="bg-yellow-900/30 border-b border-yellow-600/30 px-4 py-2.5 flex items-center gap-2.5 shrink-0">
          <Ban className="h-4 w-4 text-yellow-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-yellow-300">Stol bron qilingan</p>
            <p className="text-xs text-yellow-200/80">
              {tableBooking.customerName}
              {tableBooking.customerPhone && <> · {tableBooking.customerPhone}</>}
            </p>
            <p className="text-[10px] text-yellow-200/60">
              {formatDateTime24(tableBooking.startAt)} - {formatDateTime24(tableBooking.endAt)}
              {" · "}Bron: {formatDateTime24(tableBooking.createdAt)}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search + Categories */}
          <div className="px-3 pt-3 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Mahsulot qidiring..."
                className="w-full pl-9 pr-9 py-2.5 bg-card border border-border text-foreground rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          {categories.length > 1 && (
            <div className="flex gap-2 px-3 pb-2 overflow-x-auto shrink-0 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 ${
                    activeCategory === cat
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Products grid */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Search className="h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm">Mahsulot topilmadi</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {filteredProducts.map((product) => {
                  const inCart = cart.find((i) => i.product.id === product.id);
                  return (
                    <button
                      key={product.id}
                      onClick={() => addProduct(product)}
                      className={`relative flex flex-col items-start p-3 rounded-xl border text-left transition-all active:scale-[0.97] ${
                        inCart
                          ? "border-blue-500/50 bg-blue-600/10"
                          : "border-border bg-card hover:border-border/80 hover:bg-accent/50"
                      }`}
                    >
                      {inCart && (
                        <span className="absolute top-2 right-2 w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                          {inCart.quantity}
                        </span>
                      )}
                      {product.imageUrl && (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-20 object-cover rounded-lg mb-2"
                        />
                      )}
                      <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">{product.name}</p>
                      {product.category && (
                        <p className="text-xs text-muted-foreground mt-0.5">{product.category}</p>
                      )}
                      <p className="text-sm font-bold text-blue-400 mt-1.5">{fmt(product.price)} so'm</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Desktop right panel: Batches + Cart */}
        <div className="hidden lg:flex w-80 border-l border-border bg-card flex-col shrink-0">
          <BatchPanel
            draftItems={draftItems}
            batches={batches}
            orderTotal={orderTotal}
            existingOrder={existingOrder}
            cart={cart}
            total={total}
            isBusy={isBusy}
            sendBusy={sendBusy}
            serveBusy={serveBusy}
            cancelPending={cancelOpenOrder.isPending}
            onChangeQty={changeQty}
            onRemove={removeItem}
            onSave={handleSave}
            onSendBatch={handleSendBatch}
            onServeBatch={handleServeBatch}
            onCancel={handleCancel}
            onWaiterClose={handleWaiterClose}
          />
        </div>
      </div>

      {/* Mobile: Floating action bar */}
      <div className="lg:hidden shrink-0 border-t border-border bg-card px-4 py-3 flex gap-2">
        {existingOrder && (
          <button
            onClick={handleCancel}
            disabled={cancelOpenOrder.isPending}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-red-800/60 text-red-400 text-sm font-medium hover:bg-red-900/20 active:scale-95 transition-all disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Bekor
          </button>
        )}
        {existingOrder && draftItems.length > 0 && (
          <button
            onClick={handleSendBatch}
            disabled={sendBusy}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white text-sm font-semibold active:scale-[0.98] transition-all"
          >
            <Send className="h-4 w-4" />
            {sendBusy ? "..." : "Oshxonaga"}
          </button>
        )}
        {existingOrder && cart.length > 0 && orderCount > 0 && (
          <button
            onClick={handleNewRound}
            disabled={cart.length === 0 || createOpenOrder.isPending}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold active:scale-[0.98] transition-all"
          >
            <Plus className="h-4 w-4" />
            {createOpenOrder.isPending ? "..." : "Yangi tur"}
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={cart.length === 0 || isBusy}
          className="flex-1 flex items-center justify-between px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl text-white text-sm font-semibold active:scale-[0.98] transition-all"
        >
          <span className="flex items-center gap-2">
            <Save className="h-4 w-4" />
            {isBusy ? "Saqlanmoqda..." : existingOrder ? "Qo'shish" : "Saqlash"}
          </span>
          {cart.length > 0 && (
            <span className="bg-white/20 px-2 py-0.5 rounded-lg text-xs font-bold">
              {fmt(total)} so'm
            </span>
          )}
        </button>
      </div>

      {/* Mobile cart bottom sheet */}
      {showCart && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setShowCart(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl max-h-[85vh] flex flex-col lg:hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Savat ({cartCount} ta)
              </h3>
              <button onClick={() => setShowCart(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <BatchPanel
                draftItems={draftItems}
                batches={batches}
                orderTotal={orderTotal}
                existingOrder={existingOrder}
                cart={cart}
                total={total}
                isBusy={isBusy}
                sendBusy={sendBusy}
                serveBusy={serveBusy}
                cancelPending={cancelOpenOrder.isPending}
                onChangeQty={changeQty}
                onRemove={removeItem}
                onSave={() => { setShowCart(false); handleSave(); }}
                onSendBatch={() => { setShowCart(false); handleSendBatch(); }}
                onServeBatch={handleServeBatch}
                onCancel={() => { setShowCart(false); handleCancel(); }}
                onWaiterClose={() => { setShowCart(false); handleWaiterClose(); }}
                compact
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BatchPanel({
  draftItems, batches, orderTotal, existingOrder,
  cart, total, isBusy, sendBusy, serveBusy, cancelPending,
  onChangeQty, onRemove, onSave, onSendBatch, onServeBatch, onCancel, onWaiterClose, compact,
}: {
  draftItems: OrderItemEx[];
  batches: BatchGroup[];
  orderTotal: number;
  existingOrder: any;
  cart: CartItem[];
  total: number;
  isBusy: boolean;
  sendBusy: boolean;
  serveBusy: number | null;
  cancelPending: boolean;
  onChangeQty: (id: number, d: number) => void;
  onRemove: (id: number) => void;
  onSave: () => void;
  onSendBatch: () => void;
  onServeBatch: (batchNumber: number) => void;
  onCancel: () => void;
  onWaiterClose: () => void;
  compact?: boolean;
}) {
  const grandTotal = orderTotal + total;

  return (
    <>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Draft items (not sent to kitchen) */}
        {draftItems.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Qoralama</p>
              <button
                onClick={onSendBatch}
                disabled={sendBusy}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white text-xs font-medium transition-all"
              >
                <Send className="h-3 w-3" />
                {sendBusy ? "..." : "Oshxonaga"}
              </button>
            </div>
            {draftItems.map((item) => (
              <div key={`d-${item.id}`} className="flex items-center gap-2 bg-zinc-800/60 rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(item.unitPrice)} × {item.quantity} = {fmt(item.total)} so'm
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sent batches */}
        {batches.map((batch) => {
          const st = ITEM_STATUS[batch.status as keyof typeof ITEM_STATUS] ?? ITEM_STATUS.sent;
          return (
            <div key={batch.batchNumber} className="space-y-1.5 rounded-xl border border-border/50 bg-zinc-900/40 p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">#{batch.batchNumber}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${st.color}`}>
                    {st.label}
                  </span>
                </div>
                {batch.status === "ready" && (
                  <button
                    onClick={() => onServeBatch(batch.batchNumber)}
                    disabled={serveBusy === batch.batchNumber}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium transition-all"
                  >
                    <UtensilsCrossed className="h-3 w-3" />
                    {serveBusy === batch.batchNumber ? "..." : "Yetkazish"}
                  </button>
                )}
              </div>
              {batch.items.map((item) => (
                <div key={`b${batch.batchNumber}-${item.id}`} className="flex items-center gap-2 bg-zinc-800/40 rounded-lg px-2.5 py-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(item.unitPrice)} × {item.quantity} = {fmt(item.total)} so'm
                    </p>
                  </div>
                </div>
              ))}
            </div>
          );
        })}

        {/* New cart items */}
        {cart.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Yangi</p>
            {cart.map((item) => (
              <div key={`c-${item.product.id}`} className="flex items-center gap-2 bg-zinc-900/60 rounded-xl px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(item.product.price)} × {item.quantity} = {fmt(item.product.price * item.quantity)} so'm
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onChangeQty(item.product.id, -1)} className="w-7 h-7 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-lg text-foreground active:scale-90 transition-transform">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-bold text-foreground">{item.quantity}</span>
                  <button onClick={() => onChangeQty(item.product.id, 1)} className="w-7 h-7 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-lg text-foreground active:scale-90 transition-transform">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => onRemove(item.product.id)} className="w-7 h-7 flex items-center justify-center bg-red-900/30 hover:bg-red-900/60 rounded-lg text-red-400 ml-0.5 active:scale-90 transition-transform">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {cart.length === 0 && draftItems.length === 0 && batches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm">Mahsulot qo'shing</p>
          </div>
        )}
      </div>

      {/* Total + Actions */}
      <div className={`border-t border-border p-4 space-y-3 shrink-0 ${compact ? "pb-6" : ""}`}>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Jami:</span>
          <span className="text-xl font-bold text-foreground">{fmt(grandTotal)} so'm</span>
        </div>
        {cart.length > 0 && (
          <button
            onClick={onSave}
            disabled={isBusy}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl text-white text-sm font-bold active:scale-[0.98] transition-all"
          >
            <Save className="h-4 w-4" />
            {isBusy ? "Saqlanmoqda..." : "Savatni saqlash"}
          </button>
        )}
        {existingOrder && (
          <>
            <button
              onClick={onWaiterClose}
              className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-white text-sm font-bold active:scale-[0.98] transition-all"
            >
              <CheckCircle className="h-4 w-4" />
              Buyurtmani yopish
            </button>
            <button
              onClick={onCancel}
              disabled={cancelPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-red-800/60 text-red-400 rounded-xl text-sm font-medium hover:bg-red-900/20 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Bekor qilish
            </button>
          </>
        )}
      </div>
    </>
  );
}
