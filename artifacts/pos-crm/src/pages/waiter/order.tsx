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
  useUpdateOpenOrder,
  useCancelOpenOrder,
  type Product,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, Plus, Minus, Trash2, Save, X, ShoppingCart, CheckCircle, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime24 } from "@/lib/datetime";

type RoomBooking = {
  id: number; venueId: number; roomId: number; tableId?: number | null;
  customerName: string; customerPhone?: string | null;
  startAt: string; endAt: string; notes?: string | null;
  status: "active" | "completed" | "cancelled"; createdAt: string;
};

type CartItem = { product: Product; quantity: number };
type TableInfo = {
  id: number; number: number; name: string | null;
  roomId: number | null; roomName: string | null;
  isOccupied?: boolean; openOrderId?: number | null;
};

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

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
  const updateOpenOrder = useUpdateOpenOrder();
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

  const existingOrder = openOrders?.find((o) => o.tableId === tableId) ?? null;

  useEffect(() => {
    if (!existingOrder || !products) return;
    const newCart: CartItem[] = existingOrder.items
      .map((item) => {
        const product = products.find((p) => p.id === item.productId);
        return product ? { product, quantity: item.quantity } : null;
      })
      .filter(Boolean) as CartItem[];
    setCart(newCart);
  }, [existingOrder?.id, products?.length]);

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

  const handleSave = async () => {
    if (cart.length === 0) { toast({ title: "Mahsulot qo'shing", variant: "destructive" }); return; }
    if (tableBooking && !existingOrder) {
      toast({ title: `Bu stol bron qilingan (${tableBooking.customerName})`, variant: "destructive" });
      return;
    }
    const items = cart.map((i) => ({ productId: i.product.id, quantity: i.quantity }));
    const opts = {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListRoomsQueryKey(venueId) });
        qc.invalidateQueries({ queryKey: getListTablesQueryKey(venueId) });
        qc.invalidateQueries({ queryKey: getListOpenOrdersQueryKey(venueId) });
        setSaved(true);
        setTimeout(() => setLocation("/waiter/tables"), 1400);
      },
      onError: (err: any) => toast({ title: err?.data?.error ?? "Xatolik", variant: "destructive" }),
    };
    if (existingOrder) {
      updateOpenOrder.mutate({ venueId, orderId: existingOrder.id, data: { items } }, opts);
    } else {
      createOpenOrder.mutate({ venueId, data: { tableId, tableNumber: tableInfo?.number ?? null, roomId: tableInfo?.roomId ?? null, roomName: tableInfo?.roomName ?? null, items } }, opts);
    }
  };

  const handleCancel = () => {
    if (!existingOrder) { setLocation("/waiter/tables"); return; }
    if (!confirm("Bu buyurtmani bekor qilasizmi?")) return;
    cancelOpenOrder.mutate({ venueId, orderId: existingOrder.id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListRoomsQueryKey(venueId) });
        qc.invalidateQueries({ queryKey: getListTablesQueryKey(venueId) });
        qc.invalidateQueries({ queryKey: getListOpenOrdersQueryKey(venueId) });
        setLocation("/waiter/tables");
      },
      onError: () => toast({ title: "Xatolik", variant: "destructive" }),
    });
  };

  if (saved) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-zinc-950 z-50">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-5">
          <CheckCircle className="h-12 w-12 text-emerald-400" />
        </div>
        <p className="text-2xl font-bold text-foreground">Saqlandi!</p>
        <p className="text-muted-foreground mt-2">Stollar sahifasiga qaytilmoqda...</p>
      </div>
    );
  }

  const isBusy = createOpenOrder.isPending || updateOpenOrder.isPending;

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden">
      {/* ── Top header ── */}
      <header className="flex items-center gap-3 px-4 h-14 border-b border-border bg-card shrink-0">
        <button
          onClick={() => setLocation("/waiter/tables")}
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
        {existingOrder && (
          <span className="text-xs bg-orange-900/40 text-orange-300 border border-orange-700/50 px-2.5 py-1 rounded-full shrink-0">
            Ochiq
          </span>
        )}
        {/* Cart button (mobile) */}
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

      {/* Booking warning banner */}
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

      {/* ── Content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Product panel ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search */}
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

          {/* Category tabs */}
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

        {/* ── Desktop cart (right panel) ── */}
        <div className="hidden lg:flex w-80 border-l border-border bg-card flex-col shrink-0">
          <CartPanel
            cart={cart}
            total={total}
            existingOrder={!!existingOrder}
            isBusy={isBusy}
            cancelPending={cancelOpenOrder.isPending}
            onChangeQty={changeQty}
            onRemove={removeItem}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      </div>

      {/* ── Mobile: floating save bar ── */}
      <div className="lg:hidden shrink-0 border-t border-border bg-card px-4 py-3 flex gap-3">
        {existingOrder && (
          <button
            onClick={handleCancel}
            disabled={cancelOpenOrder.isPending}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-800/60 text-red-400 text-sm font-medium hover:bg-red-900/20 active:scale-95 transition-all disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Bekor
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={cart.length === 0 || isBusy}
          className="flex-1 flex items-center justify-between px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl text-white text-sm font-semibold active:scale-[0.98] transition-all"
        >
          <span className="flex items-center gap-2">
            <Save className="h-4 w-4" />
            {isBusy ? "Saqlanmoqda..." : existingOrder ? "Yangilash" : "Saqlash"}
          </span>
          {cart.length > 0 && (
            <span className="bg-white/20 px-2 py-0.5 rounded-lg text-xs font-bold">
              {fmt(total)} so'm
            </span>
          )}
        </button>
      </div>

      {/* ── Mobile cart bottom sheet ── */}
      {showCart && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setShowCart(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl max-h-[85vh] flex flex-col lg:hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Buyurtma ({cartCount} ta)
              </h3>
              <button onClick={() => setShowCart(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <CartPanel
                cart={cart}
                total={total}
                existingOrder={!!existingOrder}
                isBusy={isBusy}
                cancelPending={cancelOpenOrder.isPending}
                onChangeQty={changeQty}
                onRemove={removeItem}
                onSave={() => { setShowCart(false); handleSave(); }}
                onCancel={() => { setShowCart(false); handleCancel(); }}
                compact
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CartPanel({
  cart, total, existingOrder, isBusy, cancelPending,
  onChangeQty, onRemove, onSave, onCancel, compact,
}: {
  cart: CartItem[]; total: number; existingOrder: boolean;
  isBusy: boolean; cancelPending: boolean;
  onChangeQty: (id: number, d: number) => void;
  onRemove: (id: number) => void;
  onSave: () => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  function fmt(n: number) { return new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }
  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm">Mahsulot qo'shing</p>
          </div>
        ) : (
          <>
            {cart.map((item) => (
              <div key={item.product.id} className="flex items-center gap-2 bg-zinc-900/60 rounded-xl px-3 py-2.5">
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
          </>
        )}
      </div>

      {/* Total + Actions */}
      <div className={`border-t border-border p-4 space-y-3 shrink-0 ${compact ? "pb-6" : ""}`}>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Jami:</span>
          <span className="text-xl font-bold text-foreground">{fmt(total)} so'm</span>
        </div>
        <button
          onClick={onSave}
          disabled={cart.length === 0 || isBusy}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl text-white text-sm font-bold active:scale-[0.98] transition-all"
        >
          <Save className="h-4 w-4" />
          {isBusy ? "Saqlanmoqda..." : existingOrder ? "Yangilash" : "Saqlash"}
        </button>
        {existingOrder && (
          <button
            onClick={onCancel}
            disabled={cancelPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-red-800/60 text-red-400 rounded-xl text-sm font-medium hover:bg-red-900/20 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Buyurtmani bekor qilish
          </button>
        )}
      </div>
    </>
  );
}
