import { useEffect, useState, useMemo, useRef } from "react";
import { ShoppingCart, Plus, Minus, X, Search, Send, Clock, Menu, MapPin, Navigation } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

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
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  instagram?: string | null;
  telegram?: string | null;
  facebook?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
  customerAddress: string | null;
  telegramUserId: string | null;
  telegramUsername: string | null;
  status: string;
  totalAmount: number;
  items: OrderItem[];
  deliveryType: string;
  createdAt: string;
  posOrderId: number | null;
};

type ReceiptItem = {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  total: number;
};

type ReceiptDetail = {
  id: number;
  venueId: number;
  totalAmount: number;
  paymentType: string;
  status: string;
  notes: string | null;
  items: ReceiptItem[];
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
  const [form, setForm] = useState({ name: "", deliveryType: "pickup" as "pickup" | "delivery", lat: null as number | null, lng: null as number | null });
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<number | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [receipts, setReceipts] = useState<Record<number, any>>({});
  const [receiptLoading, setReceiptLoading] = useState<Record<number, boolean>>({});

  // URL: /tg-menu/<venueId>
  const venueId = (() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("tg-menu");
    if (idx >= 0 && parts[idx + 1]) return Number(parts[idx + 1]) || 0;
    return 0;
  })();

  const tg = window.Telegram?.WebApp;
  const tgUserId = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : null;
  const deviceId = (() => {
    let d = localStorage.getItem("tg_device_id");
    if (!d) { d = crypto.randomUUID(); localStorage.setItem("tg_device_id", d); }
    return d;
  })();
  const effectiveUserId = tgUserId || deviceId;

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

  // Map for delivery location
  useEffect(() => {
    if (form.deliveryType !== "delivery") {
      leafletRef.current?.remove();
      leafletRef.current = null;
      markerRef.current = null;
      return;
    }
    const timer = setTimeout(() => {
      if (!mapRef.current || leafletRef.current) return;

      const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      });
      const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "&copy; Esri",
        maxZoom: 19,
      });
      const satLabel = L.tileLayer("https://{s}.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
        attribution: "&copy; Esri",
        maxZoom: 19,
      });

      const map = L.map(mapRef.current, {
        layers: [osm],
        zoomControl: true,
        attributionControl: true,
      }).setView([41.311081, 69.240562], 13);

      // Layer control — Street / Satellite
      const baseMaps = {
        "Ko'cha": osm,
        "Sun'iy yo'ldosh": L.layerGroup([sat, satLabel]),
      };
      L.control.layers(baseMaps, null, { position: "bottomleft" }).addTo(map);

      // Marker (draggable + crosshair cursor)
      const marker = L.marker([41.311081, 69.240562], {
        draggable: true,
        autoPan: true,
      }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        setForm((f) => ({ ...f, lat: pos.lat, lng: pos.lng }));
      });
      map.on("click", (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        setForm((f) => ({ ...f, lat: e.latlng.lat, lng: e.latlng.lng }));
      });

      // Joriy lokatsiyani avtomatik aniqlash
      let located = false;
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            map.setView([latitude, longitude], 16);
            marker.setLatLng([latitude, longitude]);
            setForm((f) => ({ ...f, lat: latitude, lng: longitude }));
            located = true;
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }

      // "Mening joylashuvim" tugmasi (xarita yuklangandan keyin 3 soniyagacha kutadi)
      const locateBtn = L.control({ position: "topright" });
      locateBtn.onAdd = () => {
        const btn = L.DomUtil.create("button", "leaflet-bar leaflet-control");
        btn.innerHTML = "📍";
        btn.title = "Mening joylashuvim";
        btn.style.cssText = "width:34px;height:34px;font-size:18px;cursor:pointer;background:white;border:2px solid rgba(0,0,0,.2);border-radius:4px;display:flex;align-items:center;justify-content:center;line-height:1;";
        btn.onclick = () => {
          if (!navigator.geolocation) return;
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude, longitude } = pos.coords;
              map.setView([latitude, longitude], 17);
              marker.setLatLng([latitude, longitude]);
              setForm((f) => ({ ...f, lat: latitude, lng: longitude }));
            },
            () => alert("Lokatsiyani aniqlab bo'lmadi"),
            { enableHighAccuracy: true, timeout: 10000 }
          );
        };
        return btn;
      };
      locateBtn.addTo(map);

      leafletRef.current = map;
      markerRef.current = marker;
    }, 200);
    return () => {
      leafletRef.current?.remove();
      leafletRef.current = null;
      markerRef.current = null;
    };
  }, [form.deliveryType]);

  // Load history when tab changes to history
  useEffect(() => {
    if (tab === "history" && effectiveUserId && venueId) {
      setOrdersLoading(true);
      fetch(`/api/public/online-orders/${venueId}/history?telegram_user_id=${encodeURIComponent(effectiveUserId)}`)
        .then((r) => r.ok ? r.json() : [])
        .then(setOrders)
        .catch(() => setOrders([]))
        .finally(() => setOrdersLoading(false));
    }
  }, [tab, effectiveUserId, venueId]);

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

  const toggleReceipt = async (o: Order) => {
    if (!o.posOrderId || !data?.venue?.id) return;
    if (receipts[o.id]) {
      setReceipts((prev) => { const next = { ...prev }; delete next[o.id]; return next; });
      return;
    }
    setReceiptLoading((prev) => ({ ...prev, [o.id]: true }));
    try {
      const r = await fetch(`/api/venues/${data.venue.id}/orders/${o.posOrderId}`);
      if (r.ok) {
        const detail = await r.json();
        setReceipts((prev) => ({ ...prev, [o.id]: detail }));
      }
    } catch {}
    setReceiptLoading((prev) => ({ ...prev, [o.id]: false }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { alert("Ismingizni kiriting"); return; }
    if (cart.length === 0) { alert("Savat bo'sh"); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/public/online-orders/${venueId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.name.trim(),
          customerAddress: form.lat && form.lng ? `${form.lat.toFixed(6)}, ${form.lng.toFixed(6)}` : null,
          latitude: form.deliveryType === "delivery" ? form.lat : null,
          longitude: form.deliveryType === "delivery" ? form.lng : null,
          telegramUserId: effectiveUserId,
          telegramUsername: tg?.initDataUnsafe?.user?.username || null,
          deliveryType: form.deliveryType,
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
      // Buyurtma tarixini yangilash
      if (effectiveUserId && venueId) {
        fetch(`/api/public/online-orders/${venueId}/history?telegram_user_id=${encodeURIComponent(effectiveUserId)}`)
          .then((r) => r.ok ? r.json() : [])
          .then(setOrders)
          .catch(() => {});
      }
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
        <div className="flex items-center gap-3 mb-1">
          {data.venue.logoUrl ? (
            <img
              src={data.venue.logoUrl}
              alt={data.venue.name}
              className="w-10 h-10 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-[#E0714F] flex items-center justify-center text-white text-sm font-bold shrink-0">
              {data.venue.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 truncate">{data.venue.name}</h1>
            {data.venue.latitude && data.venue.longitude ? (
              <a
                href={`https://www.google.com/maps?q=${data.venue.latitude},${data.venue.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate inline-flex items-center gap-1"
              >
                <Navigation className="h-3 w-3 shrink-0" />
                Google Maps da ochish
              </a>
            ) : (
              <p className="text-xs text-zinc-400 truncate">Xaritada joylashuv mavjud emas</p>
            )}
          </div>
        </div>
        {/* Social links */}
        {(data.venue.instagram || data.venue.telegram || data.venue.facebook) && (
          <div className="flex items-center gap-2 mt-1.5">
            {data.venue.instagram && (
              <a
                href={data.venue.instagram.startsWith("http") ? data.venue.instagram : `https://instagram.com/${data.venue.instagram.replace("@", "")}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                Instagram
              </a>
            )}
            {data.venue.telegram && (
              <a
                href={data.venue.telegram.startsWith("http") ? data.venue.telegram : `https://t.me/${data.venue.telegram.replace("@", "")}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                Telegram
              </a>
            )}
            {data.venue.facebook && (
              <a
                href={data.venue.facebook.startsWith("http") ? data.venue.facebook : `https://facebook.com/${data.venue.facebook}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-800 dark:text-blue-300 hover:underline flex items-center gap-1"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Facebook
              </a>
            )}
          </div>
        )}
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

          {/* Products grid — grouped by category when "Barchasi" is selected */}
          <div className="px-4">
            {filtered.length === 0 ? (
              <p className="col-span-2 text-center py-12 text-zinc-500">Mahsulot topilmadi</p>
            ) : activeCat === "Barchasi" && !search.trim() ? (
              (() => {
                const grouped: Record<string, typeof filtered> = {};
                filtered.forEach((p) => {
                  const cat = p.category || "Boshqa";
                  if (!grouped[cat]) grouped[cat] = [];
                  grouped[cat].push(p);
                });
                return Object.entries(grouped).map(([cat, prods]) => (
                  <div key={cat} className="mb-6">
                    <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-3 uppercase tracking-wider">{cat}</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {prods.map((p) => {
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
                  </div>
                ));
              })()
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filtered.map((p) => {
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
            )}
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
                      <p className="text-[11px] text-zinc-500">{new Date(o.createdAt).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || "text-zinc-600 bg-zinc-100"}`}>
                        {STATUS_LABELS[o.status] || o.status}
                      </span>
                      <p className="text-[10px] text-zinc-400 mt-1">{o.deliveryType === "delivery" ? "Yetkazib berish" : "Olib ketish"}</p>
                    </div>
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
                  {o.customerAddress && (
                    <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-800">
                      <p className="text-[11px] text-zinc-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {o.customerAddress}
                      </p>
                    </div>
                  )}
                  <div className="px-4 py-2.5 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">Jami</span>
                      {o.posOrderId && (
                        <button
                          onClick={() => toggleReceipt(o)}
                          className="text-[11px] px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-medium"
                        >
                          {receipts[o.id] ? "🧾 Yopish" : "🧾 Chek"}
                        </button>
                      )}
                    </div>
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{fmt(o.totalAmount)} so'm</span>
                  </div>
                  {receiptLoading[o.id] && (
                    <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-500">
                      Yuklanmoqda...
                    </div>
                  )}
                  {receipts[o.id] && (
                    <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/30">
                      <div className="text-center mb-3 border-b border-dashed border-zinc-300 dark:border-zinc-700 pb-2">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{data?.venue?.name || ""}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Chek №{receipts[o.id].id} &middot;{" "}
                          {new Date(receipts[o.id].createdAt).toLocaleString("uz-UZ", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="space-y-1 mb-3">
                        <div className="flex justify-between text-[10px] text-zinc-400 uppercase font-semibold pb-1 border-b border-zinc-200 dark:border-zinc-800">
                          <span>Mahsulot</span>
                          <span>Miqdor Narxi Summa</span>
                        </div>
                        {receipts[o.id].items.map((it: any, i: number) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-zinc-800 dark:text-zinc-200 truncate mr-2">{it.productName}</span>
                            <span className="text-zinc-600 dark:text-zinc-400 shrink-0 text-right">
                              {it.quantity} × {fmt(it.unitPrice)} = {fmt(it.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-dashed border-zinc-300 dark:border-zinc-700 pt-2 flex justify-between items-center">
                        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">JAMI</span>
                        <span className="text-base font-bold text-blue-600 dark:text-blue-400">{fmt(receipts[o.id].totalAmount)} so'm</span>
                      </div>
                      <p className="text-[10px] text-zinc-400 text-center mt-3 border-t border-dashed border-zinc-300 dark:border-zinc-700 pt-2">
                        {receipts[o.id].paymentType === "cash" ? "Naqt to'lov" : receipts[o.id].paymentType}
                      </p>
                    </div>
                  )}
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
                  <div className="flex items-center gap-2 mb-1.5">
                    <Navigation className="h-4 w-4 text-blue-500" />
                    <label className="text-xs text-zinc-600 dark:text-zinc-400">Xaritada joylashuvingizni belgilang</label>
                  </div>
                  <div ref={mapRef} className="w-full h-72 sm:h-80 rounded-xl overflow-hidden border border-zinc-300 dark:border-zinc-700 shadow-inner" />
                  {form.lat && form.lng && (
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-[10px] text-zinc-400 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {form.lat.toFixed(6)}, {form.lng.toFixed(6)}
                      </p>
                      <a
                        href={`https://www.google.com/maps?q=${form.lat},${form.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <Navigation className="h-3 w-3" />
                        Google Maps
                      </a>
                    </div>
                  )}
                </div>
              )}

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
