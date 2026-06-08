import { useEffect, useState, useMemo } from "react";
import { ShoppingCart, Plus, Minus, X, Search, Send, Clock, Menu } from "lucide-react";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: any;
    };
  }
}

type Product = {
  id: number;
  name: string;
  price: number;
  category: string;
  description: string | null;
  imageUrl: string | null;
};

type Venue = {
  id: number;
  name: string;
  type: string;
  address?: string | null;
  phone?: string | null;
};

type CartItem = { product: Product; quantity: number };

type OrderItem = {
  productId: number;
  name: string;
  quantity: number;
  price: number;
  imageUrl: string | null;
};

type Order = {
  id: number;
  customerName: string;
  customerPhone: string | null;
  status: string;
  totalAmount: number;
  items: OrderItem[];
  deliveryType: string;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  new: "Yangi",
  accepted: "Qabul qilingan",
  preparing: "Tayyorlanmoqda",
  ready: "Tayyor",
  delivering: "Yetkazilmoqda",
  delivered: "Yetkazib berilgan",
  cancelled: "Bekor qilingan",
};

const STATUS_COLORS: Record<string, string> = {
  new: "text-blue-600 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30",
  accepted: "text-yellow-600 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900/30",
  preparing: "text-orange-600 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/30",
  ready: "text-green-600 bg-green-100 dark:text-green-300 dark:bg-green-900/30",
  delivering: "text-indigo-600 bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-900/30",
  delivered: "text-zinc-600 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-900/30",
  cancelled: "text-red-600 bg-red-100 dark:text-red-300 dark:bg-red-900/30",
};

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(n);
}

export default function TelegramMenu() {
  const [data, setData] = useState<{ venue: Venue; products: Product[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("Barchasi");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tab, setTab] = useState<"menu" | "cart" | "history">("menu");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "", deliveryType: "pickup" as "pickup" | "delivery", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<number | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // URL: /tg-menu/<venueId>
  const venueId = (() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("tg-menu");
    if (idx >= 0 && parts[idx + 1]) return Number(parts[idx + 1]) || 0;
    return 0;
  })();

  const tg = window.Telegram?.WebApp;
  const tgUserId = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : null;

  // Telegram WebApp init
  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
      const u = tg.initDataUnsafe?.user;
      if (u) {
        setForm((f) => ({
          ...f,
          name: f.name || `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || "",
        }));
      }
    }
  }, []);

  // Load menu
  useEffect(() => {
    if (!venueId) return;
    setLoading(true);
    fetch(`/api/public/menu/by-id/${venueId}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .catch(() => fetch(`/api/public/menu/by-id/${venueId}`).then((r) => r.json()).catch(() => null))
      .then((d) => {
        if (d) setData(d);
        else setError("Menyu yuklanmadi");
      })
      .finally(() => setLoading(false));
  }, [venueId]);

  // Load history when tab changes to history
  useEffect(() => {
    if (tab === "history" && tgUserId && venueId) {
      setOrdersLoading(true);
      fetch(`/api/public/online-orders/${venueId}/history?telegram_user_id=${encodeURIComponent(tgUserId)}`)
        .then((r) => r.ok ? r.json() : [])
        .then(setOrders)
        .catch(() => setOrders([]))
        .finally(() => setOrdersLoading(false));
    }
  }, [tab, tgUserId, venueId]);

  const products = data?.products ?? [];
  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.map((p) => p.category)));
    return ["Barchasi", ...cats];
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const q = search.toLowerCase().trim();
      const okSearch = !q || p.name.toLowerCase().includes(q);
      const okCat = activeCat === "Barchasi" || p.category === activeCat;
      return okSearch && okCat;
    });
  }, [products, search, activeCat]);

  const addToCart = (p: Product) => {
    setCart((prev) => {
      const e = prev.find((i) => i.product.id === p.id);
      if (e) return prev.map((i) => i.product.id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product: p, quantity: 1 }];
    });
  };
  const updateQty = (id: number, delta: number) => {
    setCart((prev) => prev
      .map((i) => i.product.id === id ? { ...i, quantity: i.quantity + delta } : i)
      .filter((i) => i.quantity > 0));
  };
  const removeItem = (id: number) => setCart((prev) => prev.filter((i) => i.product.id !== id));

  const cartTotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const handleSubmit = async () => {
    if (!form.name.trim()) { alert("Ismingizni kiriting"); return; }
    if (form.deliveryType === "delivery" && !form.address.trim()) { alert("Manzilni kiriting"); return; }
    if (cart.length === 0) { alert("Savat bo'sh"); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/public/online-orders/${venueId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.name.trim(),
          customerPhone: form.phone.trim() || null,
          customerAddress: form.deliveryType === "delivery" ? form.address.trim() : null,
          telegramUserId: tgUserId,
          deliveryType: form.deliveryType,
          notes: form.notes.trim() || null,
          items: cart.map((c) => ({
            productId: c.product.id,
            name: c.product.name,
            quantity: c.quantity,
            price: c.product.price,
            imageUrl: c.product.imageUrl,
          })),
        }),
      });
      if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.detail || "Xatolik"); }
      const result = await r.json();
      setSubmitted(result.id);
      setCart([]);
      setSubmitOpen(false);
      setTab("menu");
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
    } catch (e: any) {
      alert(e.message || "Xatolik");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-600">Yuklanmoqda...</div>;
  }
  if (error || !data) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-red-500">{error || "Xatolik"}</div>;
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 mx-auto rounded-full bg-green-500/10 flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Buyurtma qabul qilindi!</h2>
          <p className="text-zinc-600 dark:text-zinc-400 text-sm">Buyurtma raqami: <span className="font-bold text-zinc-900 dark:text-zinc-100">#{submitted}</span></p>
          <p className="text-zinc-600 dark:text-zinc-400 text-sm mt-1">Tez orada siz bilan bog'lanamiz</p>
          <button onClick={() => setSubmitted(null)} className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium">Yopish</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-16">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{data.venue.name}</h1>
        {data.venue.address && <p className="text-xs text-zinc-500 dark:text-zinc-400">{data.venue.address}</p>}
      </div>

      {/* Menu tab */}
      {tab === "menu" && (
        <>
          {/* Search */}
          <div className="px-4 py-3 sticky top-[56px] z-10 bg-zinc-50 dark:bg-zinc-950">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Qidirish..."
                className="w-full h-10 pl-10 pr-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Categories */}
          <div className="px-4 pb-2 overflow-x-auto">
            <div className="flex gap-2">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setActiveCat(c)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    activeCat === c
                      ? "bg-blue-600 text-white"
                      : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Products grid */}
          <div className="px-4 grid grid-cols-2 gap-3">
            {filtered.length === 0 ? (
              <p className="col-span-2 text-center py-12 text-zinc-500">Mahsulot topilmadi</p>
            ) : filtered.map((p) => {
              const inCart = cart.find((i) => i.product.id === p.id);
              return (
                <div key={p.id} className="bg-white dark:bg-zinc-900 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
                  <div className="aspect-square bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">🍽️</div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-tight">{p.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{p.category}</p>
                    <div className="flex items-center justify-between mt-2 gap-2">
                      <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{fmt(p.price)} so'm</p>
                      {inCart ? (
                        <div className="flex items-center gap-1.5 bg-blue-600 rounded-lg">
                          <button onClick={() => updateQty(p.id, -1)} className="px-2 py-1 text-white"><Minus className="h-3 w-3" /></button>
                          <span className="text-white text-sm font-bold min-w-4 text-center">{inCart.quantity}</span>
                          <button onClick={() => updateQty(p.id, 1)} className="px-2 py-1 text-white"><Plus className="h-3 w-3" /></button>
                        </div>
                      ) : (
                        <button onClick={() => addToCart(p)} className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center"><Plus className="h-4 w-4" /></button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Cart tab */}
      {tab === "cart" && (
        <div className="px-4 py-4">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">Savat</h2>
          {cart.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingCart className="h-12 w-12 mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
              <p className="text-zinc-500">Savat bo'sh</p>
              <button onClick={() => setTab("menu")} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
                Menyuga qaytish
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-2 mb-4">
                {cart.map((it) => (
                  <div key={it.product.id} className="flex items-center gap-3 bg-white dark:bg-zinc-900 rounded-xl p-2.5 border border-zinc-200 dark:border-zinc-800">
                    <div className="w-14 h-14 rounded-lg bg-zinc-200 dark:bg-zinc-700 overflow-hidden shrink-0">
                      {it.product.imageUrl ? (
                        <img src={it.product.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{it.product.name}</p>
                      <p className="text-xs text-zinc-500">{fmt(it.product.price)} so'm</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => updateQty(it.product.id, -1)} className="w-7 h-7 rounded bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                      <span className="text-sm font-bold w-5 text-center text-zinc-900 dark:text-zinc-100">{it.quantity}</span>
                      <button onClick={() => updateQty(it.product.id, 1)} className="w-7 h-7 rounded bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center"><Plus className="h-3 w-3" /></button>
                      <button onClick={() => removeItem(it.product.id)} className="w-7 h-7 rounded text-red-500 flex items-center justify-center"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">Jami:</span>
                  <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{fmt(cartTotal)} so'm</span>
                </div>
                <button
                  onClick={() => setSubmitOpen(true)}
                  className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2"
                >
                  <Send className="h-4 w-4" /> Buyurtma berish
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (
        <div className="px-4 py-4">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">Buyurtma tarixi</h2>
          {ordersLoading ? (
            <div className="text-center py-16 text-zinc-500">Yuklanmoqda...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-16">
              <Clock className="h-12 w-12 mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
              <p className="text-zinc-500">Hali buyurtmalar yo'q</p>
              <button onClick={() => setTab("menu")} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
                Menyuga o'tish
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <div key={o.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">#{o.id}</p>
                      <p className="text-xs text-zinc-500">{new Date(o.createdAt).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || "text-zinc-600 bg-zinc-100"}`}>
                      {STATUS_LABELS[o.status] || o.status}
                    </span>
                  </div>
                  <div className="px-4 py-2 space-y-1.5">
                    {o.items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-700 dark:text-zinc-300 truncate mr-2">
                          {it.name} <span className="text-zinc-500">×{it.quantity}</span>
                        </span>
                        <span className="text-zinc-900 dark:text-zinc-100 font-medium shrink-0">{fmt(it.price * it.quantity)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-2.5 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <span className="text-xs text-zinc-500">{o.deliveryType === "delivery" ? "Yetkazib berish" : "Olib ketish"}</span>
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">Jami: {fmt(o.totalAmount)} so'm</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 z-20">
        <div className="flex items-center">
          <button
            onClick={() => setTab("menu")}
            className={`flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${
              tab === "menu" ? "text-blue-600" : "text-zinc-500"
            }`}
          >
            <Menu className="h-5 w-5 mb-0.5" />
            Menyu
          </button>
          <button
            onClick={() => setTab("cart")}
            className={`flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors relative ${
              tab === "cart" ? "text-blue-600" : "text-zinc-500"
            }`}
          >
            <ShoppingCart className="h-5 w-5 mb-0.5" />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 right-1/2 translate-x-[10px] bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            )}
            Savat
          </button>
          <button
            onClick={() => setTab("history")}
            className={`flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${
              tab === "history" ? "text-blue-600" : "text-zinc-500"
            }`}
          >
            <Clock className="h-5 w-5 mb-0.5" />
            Tarix
          </button>
        </div>
      </div>

      {/* Submit Modal */}
      {submitOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 flex items-end" onClick={() => setSubmitOpen(false)}>
          <div className="bg-white dark:bg-zinc-900 w-full max-h-[90vh] rounded-t-3xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Buyurtma malumotlari</h2>
              <button onClick={() => setSubmitOpen(false)} className="p-2 -mr-2"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-zinc-600 dark:text-zinc-400">Ism *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full h-10 px-3 mt-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm"
                  placeholder="Ismingiz"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-600 dark:text-zinc-400">Telefon</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full h-10 px-3 mt-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm"
                  placeholder="+998 90 123 45 67"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-600 dark:text-zinc-400">Olib ketish turi</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={() => setForm({ ...form, deliveryType: "pickup" })}
                    className={`py-2 rounded-lg text-sm font-medium border ${form.deliveryType === "pickup" ? "bg-blue-600 text-white border-blue-600" : "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700"}`}
                  >
                    O'zim olib ketaman
                  </button>
                  <button
                    onClick={() => setForm({ ...form, deliveryType: "delivery" })}
                    className={`py-2 rounded-lg text-sm font-medium border ${form.deliveryType === "delivery" ? "bg-blue-600 text-white border-blue-600" : "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700"}`}
                  >
                    Yetkazib berish
                  </button>
                </div>
              </div>
              {form.deliveryType === "delivery" && (
                <div>
                  <label className="text-xs text-zinc-600 dark:text-zinc-400">Manzil *</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full h-10 px-3 mt-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm"
                    placeholder="Ko'cha, uy raqami"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-zinc-600 dark:text-zinc-400">Izoh (ixtiyoriy)</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full h-10 px-3 mt-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm"
                  placeholder="Qo'shimcha xohish..."
                />
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 mt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Jami to'lov:</span>
                  <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{fmt(cartTotal)} so'm</span>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold disabled:opacity-50 mt-4"
              >
                {submitting ? "Yuborilmoqda..." : "Buyurtmani tasdiqlash"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
