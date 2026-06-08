import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useRef } from "react";
import { Truck, MapPin, Package, Clock, CheckCircle, ChevronDown, ChevronUp, Navigation } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface OnlineOrderItem {
  productId: number;
  name: string;
  quantity: number;
  price: number;
  imageUrl?: string | null;
}

interface OnlineOrder {
  id: number;
  venueId: number;
  customerName: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  deliveryType: string;
  notes?: string | null;
  status: string;
  items: OnlineOrderItem[];
  createdAt: string;
  telegramUserId?: string | null;
  telegramUsername?: string | null;
}

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  accepted: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  delivering: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  delivered: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const statusLabels: Record<string, string> = {
  new: "Yangi",
  accepted: "Qabul qilingan",
  delivering: "Yo'lda",
  delivered: "Yetkazilgan",
  cancelled: "Bekor qilingan",
};

export default function DastavkachiOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [updating, setUpdating] = useState<number | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [mapOrder, setMapOrder] = useState<OnlineOrder | null>(null);
  const [tab, setTab] = useState<"active" | "history">("active");

  // Fetch orders (polling)
  useEffect(() => {
    if (!user?.venueId) return;
    const fetchOrders = () => {
      fetch(`/api/venues/${user.venueId}/online-orders`)
        .then((r) => r.ok ? r.json() : [])
        .then((data) => {
          setOrders(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    fetchOrders();
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [user?.venueId]);

  // Map for customer location
  useEffect(() => {
    if (leafletRef.current) {
      leafletRef.current.remove();
      leafletRef.current = null;
      markerRef.current = null;
    }
    if (!mapRef.current || !mapOrder?.latitude || !mapOrder?.longitude) return;
    const map = L.map(mapRef.current).setView([mapOrder.latitude, mapOrder.longitude], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    const marker = L.marker([mapOrder.latitude, mapOrder.longitude]).addTo(map);
    marker.bindPopup(`<b>${mapOrder.customerName}</b><br/>${mapOrder.customerAddress || ""}`);
    leafletRef.current = map;
    markerRef.current = marker;
    return () => {
      leafletRef.current?.remove();
      leafletRef.current = null;
      markerRef.current = null;
    };
  }, [mapOrder]);

  const updateStatus = async (orderId: number, status: string) => {
    if (!user?.venueId) return;
    setUpdating(orderId);
    try {
      const r = await fetch(`/api/venues/${user.venueId}/online-orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Xatolik");
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status } : o));
    } catch {
      alert("Statusni o'zgartirishda xatolik");
    } finally {
      setUpdating(null);
    }
  };

  const activeOrders = orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled");
  const historyOrders = orders.filter((o) => o.status === "delivered" || o.status === "cancelled");

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dastavkachi — Yetkazish</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Xush kelibsiz, {user?.name || user?.username}
          </p>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setTab("active")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${tab === "active" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Faol ({activeOrders.length})
          </button>
          <button
            onClick={() => setTab("history")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${tab === "history" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Tarix ({historyOrders.length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Orders list */}
        <div className="lg:col-span-3 space-y-3">
          {loading ? (
            <div className="text-center text-muted-foreground py-10">Yuklanmoqda...</div>
          ) : tab === "active" && activeOrders.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
              <Truck className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Faol buyurtmalar yo'q</p>
              <p className="text-sm mt-1">Yangi yetkazish buyurtmalari bu yerda ko'rinadi</p>
            </div>
          ) : tab === "history" && historyOrders.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Tarix bo'sh</p>
            </div>
          ) : (
            (tab === "active" ? activeOrders : historyOrders).map((o) => (
              <div
                key={o.id}
                className={`bg-card border rounded-xl overflow-hidden transition-all ${expandedOrder === o.id ? "border-blue-500 shadow-md" : "border-border hover:border-blue-300"}`}
              >
                {/* Card header */}
                <div
                  className="p-3 cursor-pointer"
                  onClick={() => {
                    setExpandedOrder(expandedOrder === o.id ? null : o.id);
                    if (o.latitude && o.longitude) setMapOrder(o);
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                        #{o.id}
                      </span>
                      <h3 className="font-semibold text-foreground text-sm">{o.customerName}</h3>
                      {o.deliveryType === "delivery" && o.latitude && o.longitude && (
                        <Navigation className="h-3.5 w-3.5 text-purple-500" />
                      )}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusColors[o.status] || ""}`}>
                      {statusLabels[o.status] || o.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {o.createdAt?.slice(0, 16).replace("T", " ")} &middot;{" "}
                    {o.deliveryType === "delivery" ? "Yetkazish" : "Olib ketish"}
                  </p>
                  {/* Customer info summary */}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[11px] text-muted-foreground">
                    {o.telegramUserId && <span>🆔 {o.telegramUserId}</span>}
                    {o.telegramUsername && <span>@ {o.telegramUsername}</span>}
                    {o.customerPhone && <span>📞 {o.customerPhone}</span>}
                  </div>
                  {o.customerAddress && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3 shrink-0" /> {o.customerAddress}
                    </p>
                  )}
                  {o.items && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {o.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}
                    </p>
                  )}
                </div>

                {/* Expanded details */}
                {expandedOrder === o.id && (
                  <div className="px-3 pb-3 border-t border-border">
                    {/* Full customer info table */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] mt-2 mb-2">
                      {o.telegramUserId && (
                        <>
                          <span className="text-muted-foreground">Telegram ID</span>
                          <span className="text-foreground text-right">{o.telegramUserId}</span>
                        </>
                      )}
                      {o.telegramUsername && (
                        <>
                          <span className="text-muted-foreground">Username</span>
                          <span className="text-foreground text-right">@{o.telegramUsername}</span>
                        </>
                      )}
                      {o.customerPhone && (
                        <>
                          <span className="text-muted-foreground">Telefon</span>
                          <span className="text-foreground text-right">{o.customerPhone}</span>
                        </>
                      )}
                      <span className="text-muted-foreground">Ism</span>
                      <span className="text-foreground text-right">{o.customerName}</span>
                      {o.deliveryType === "delivery" && o.customerAddress && (
                        <>
                          <span className="text-muted-foreground">Manzil</span>
                          <span className="text-foreground text-right">{o.customerAddress}</span>
                        </>
                      )}
                    </div>
                    {o.notes && <p className="text-[11px] text-muted-foreground mb-2">Izoh: {o.notes}</p>}
                    {/* Items table */}
                    {o.items && o.items.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Buyurtma tarkibi</p>
                        <div className="space-y-0.5">
                          {o.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-[11px]">
                              <span className="text-foreground">{item.name} ×{item.quantity}</span>
                              <span className="text-muted-foreground">{(item.price * item.quantity).toLocaleString()} so'm</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Status buttons */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {o.status === "new" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(o.id, "accepted"); }}
                          disabled={updating === o.id}
                          className="text-xs px-3 py-1 rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50"
                        >
                          Qabul qilish
                        </button>
                      )}
                      {o.status === "accepted" && o.latitude && o.longitude && (
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(o.id, "delivering"); }}
                          disabled={updating === o.id}
                          className="text-xs px-3 py-1 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50"
                        >
                          Yo'lda
                        </button>
                      )}
                      {(o.status === "accepted" || o.status === "delivering") && (
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(o.id, "delivered"); }}
                          disabled={updating === o.id}
                          className="text-xs px-3 py-1 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
                        >
                          Yetkazildi
                        </button>
                      )}
                      {o.status === "new" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(o.id, "cancelled"); }}
                          disabled={updating === o.id}
                          className="text-xs px-3 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                        >
                          Bekor qilish
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Map panel */}
        <div className="lg:col-span-2">
          <div className="bg-card border border-border rounded-xl p-3 sticky top-20">
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-purple-500" />
              {mapOrder ? `${mapOrder.customerName} — Xaritada` : "Buyurtma tanlang"}
            </h3>
            {mapOrder?.latitude && mapOrder?.longitude ? (
              <div ref={mapRef} className="w-full h-64 rounded-lg overflow-hidden border border-border" />
            ) : (
              <div className="w-full h-64 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                {mapOrder ? "Lokatsiya mavjud emas" : "Xaritada ko'rish uchun buyurtmani bosing"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
