import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Package, Clock, Check, Printer, Volume2, VolumeX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type OrderItemEx = {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  total: number;
  batchNumber: number | null;
  itemStatus: string;
};

type KitchenOrder = {
  id: number;
  venueId: number;
  tableId?: number | null;
  tableNumber?: number | null;
  roomName?: string | null;
  waiterId?: number | null;
  waiterName?: string | null;
  totalAmount: number;
  source: string;
  status: string;
  notes?: string | null;
  createdAt: string;
  items: OrderItemEx[];
};

type BatchGroup = { batchNumber: number; status: string; items: OrderItemEx[] };

type OnlineOrder = {
  id: number;
  venueId: number;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  items: { productId: number; name: string; quantity: number; price: number; imageUrl: string | null }[];
  totalAmount: number;
  status: string;
  deliveryType: "pickup" | "delivery";
  createdAt: string;
};

const BATCH_STATUS_META: Record<string, { label: string; color: string }> = {
  sent: { label: "Yangi", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  preparing: { label: "Tayyorlanmoqda", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  ready: { label: "Tayyor", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  served: { label: "Yetkazildi", color: "bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400" },
};

const ONLINE_STATUS_META: Record<string, { label: string; color: string }> = {
  preparing: { label: "Tayyorlanmoqda", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  ready: { label: "Tayyor", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
};

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(n);
}

function timeAgo(iso: string) {
  return new Date(iso).toLocaleString("uz-UZ", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 1100;
    osc2.type = "sine";
    gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc2.start(ctx.currentTime + 0.1);
    osc2.stop(ctx.currentTime + 0.5);
  } catch {}
}

function printReceiptHtml(
  order: KitchenOrder,
  batch: BatchGroup,
  locationStr: string,
  meta: { label: string; color: string }
) {
  const itemsHtml = batch.items
    .map(
      (it) => `
    <tr>
      <td style="font-size:18px;font-weight:700;padding:6px 0">${it.productName}</td>
      <td style="font-size:22px;font-weight:900;text-align:center;padding:6px 0;white-space:nowrap">×${it.quantity}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><title>Oshxona #${order.id}</title>
<style>
  @page { margin:0; }
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;font-size:15px;padding:12px;color:#000;background:#fff;max-width:100%}
  .hdr{text-align:center;border-bottom:2px dashed #000;padding-bottom:8px;margin-bottom:8px}
  .hdr h1{font-size:22px;margin-bottom:2px;letter-spacing:2px}
  .hdr .sub{font-size:13px;margin-top:2px}
  .info{width:100%;margin-bottom:10px;font-size:14px}
  .info td{padding:2px 4px}
  .info td:last-child{font-weight:700;text-align:right}
  table.items{width:100%;border-collapse:collapse;margin-bottom:8px}
  table.items th{border-bottom:2px solid #000;padding:4px 0;font-size:13px}
  table.items td{border-bottom:1px dotted #999}
  .ftr{text-align:center;margin-top:10px;padding-top:8px;border-top:2px dashed #000;font-size:12px}
  .ftr .urgent{font-size:16px;font-weight:900;margin-top:6px;letter-spacing:1px}
</style></head>
<body>
  <div class="hdr">
    <h1>🏪 OSHXONA</h1>
    <div class="sub">Buyurtma #${order.id} · Batch #${batch.batchNumber}</div>
    <div style="font-size:15px;font-weight:700;margin-top:4px">${locationStr}</div>
  </div>
  <table class="info">
    <tr><td>Vaqt:</td><td>${timeAgo(order.createdAt)}</td></tr>
    ${order.waiterName ? `<tr><td>Afitsiant:</td><td>${order.waiterName}</td></tr>` : ""}
    ${order.notes ? `<tr><td>Eslatma:</td><td>${order.notes}</td></tr>` : ""}
  </table>
  <table class="items">
    <thead><tr><th style="text-align:left">Mahsulot</th><th style="text-align:center">Miqdor</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="ftr">
    <div>${new Date().toLocaleString("uz-UZ", { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
    <div class="urgent">TEZ VA ANIQ TAYYORLANG!</div>
  </div>
  <script>window.onload=function(){window.print();window.close()};<\/script>
</body>
</html>`;
}

export default function OshpazOrders() {
  const { user, token } = useAuth();
  const venueId = user?.venueId ?? 0;
  const role = user?.role;
  const qc = useQueryClient();
  const { toast } = useToast();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const [tab, setTab] = useState<"offline" | "online">("offline");
  const [autoPrint, setAutoPrint] = useState(() => localStorage.getItem("kitchen_auto_print") === "true");
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("kitchen_sound") !== "false");
  const prevJson = useRef("");
  const printedKeys = useRef<Set<string>>(new Set());

  const { data: kitchenOrders = [], isLoading: loadingKitchen } = useQuery<KitchenOrder[]>({
    queryKey: ["kitchen-orders", venueId],
    enabled: !!venueId && !!token,
    refetchInterval: 5_000,
    queryFn: async () => {
      const r = await fetch(`/api/venues/${venueId}/open-orders?status_filter=all`, { headers });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: onlineOrders = [], isLoading: loadingOnline } = useQuery<OnlineOrder[]>({
    queryKey: ["online-orders-oshpaz", venueId],
    enabled: !!venueId && !!token,
    refetchInterval: 5_000,
    queryFn: async () => {
      const r = await fetch(`/api/venues/${venueId}/online-orders?status_filter=all`, { headers });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const onlineFiltered = onlineOrders.filter((o) => o.status === "preparing" || o.status === "ready");

  const updateBatchStatus = useMutation({
    mutationFn: async ({ orderId, batchNumber, status }: { orderId: number; batchNumber: number; status: string }) => {
      const r = await fetch(`/api/venues/${venueId}/open-orders/${orderId}/batch/${batchNumber}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kitchen-orders", venueId] }),
    onError: () => toast({ title: "Xatolik", variant: "destructive" }),
  });

  const updateOnlineStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const r = await fetch(`/api/venues/${venueId}/online-orders/${id}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["online-orders-oshpaz", venueId] }),
    onError: () => toast({ title: "Xatolik", variant: "destructive" }),
  });

  const isOshpaz = role === "oshpaz" || role === "admin" || role === "owner";

  /* ── Sound on new batch ────────────────────────────────── */
  useEffect(() => {
    const cur = JSON.stringify(
      kitchenOrders.map((o) => ({
        id: o.id,
        batches: o.items.filter((i) => i.batchNumber != null && i.itemStatus === "sent").map((i) => i.batchNumber),
      }))
    );
    if (prevJson.current && prevJson.current !== cur && soundOn) {
      playNotificationSound();
    }
    prevJson.current = cur;
  }, [kitchenOrders, soundOn]);

  /* ── Auto-print new sent batches ───────────────────────── */
  useEffect(() => {
    if (!autoPrint) return;
    for (const order of kitchenOrders) {
      const grouped = new Map<number, BatchGroup>();
      for (const item of order.items) {
        if (item.batchNumber == null) continue;
        const g = grouped.get(item.batchNumber);
        if (g) g.items.push(item);
        else
          grouped.set(item.batchNumber, {
            batchNumber: item.batchNumber,
            status: item.itemStatus,
            items: [item],
          });
      }
      for (const [, batch] of grouped) {
        if (batch.status !== "sent") continue;
        const key = `${order.id}-${batch.batchNumber}`;
        if (printedKeys.current.has(key)) continue;
        printedKeys.current.add(key);

        const loc = [order.roomName, order.tableNumber ? `Stol ${order.tableNumber}` : ""]
          .filter(Boolean)
          .join(" / ");
        const meta = BATCH_STATUS_META.sent;
        const html = printReceiptHtml(order, batch, loc, meta);

        const w = window.open("", "_blank", "width=400,height=600");
        if (w) {
          w.document.write(html);
          w.document.close();
        }
      }
    }
  }, [kitchenOrders, autoPrint]);

  /* ── Manual print handler ──────────────────────────────── */
  const handlePrint = (order: KitchenOrder, batch: BatchGroup) => {
    const loc = [order.roomName, order.tableNumber ? `Stol ${order.tableNumber}` : ""]
      .filter(Boolean)
      .join(" / ");
    const meta = BATCH_STATUS_META[batch.status] || BATCH_STATUS_META.sent;
    const html = printReceiptHtml(order, batch, loc, meta);
    const w = window.open("", "_blank", "width=400,height=600");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  /* ── Toggle auto-print ─────────────────────────────────── */
  const toggleAutoPrint = () => {
    const next = !autoPrint;
    setAutoPrint(next);
    localStorage.setItem("kitchen_auto_print", String(next));
    if (next) printedKeys.current.clear();
    toast({ title: next ? "Avtomatik chop etish yoqildi" : "Avtomatik chop etish o'chirildi" });
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem("kitchen_sound", String(next));
  };

  /* ── Extract batches from order ────────────────────────── */
  const extractBatches = (o: KitchenOrder): BatchGroup[] => {
    const grouped = new Map<number, BatchGroup>();
    for (const item of o.items) {
      if (item.batchNumber == null) continue;
      const g = grouped.get(item.batchNumber);
      if (g) g.items.push(item);
      else
        grouped.set(item.batchNumber, {
          batchNumber: item.batchNumber,
          status: item.itemStatus,
          items: [item],
        });
    }
    return Array.from(grouped.values()).sort((a, b) => a.batchNumber - b.batchNumber);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Oshpaz — Oshxona</h1>
          <p className="text-muted-foreground text-sm mt-1">Xush kelibsiz, {user?.name || user?.username}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            className={`p-2 rounded-lg border transition-colors ${
              soundOn
                ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-700/30 dark:text-green-400"
                : "bg-muted border-border text-muted-foreground"
            }`}
            title={soundOn ? "Ovoz o'chirish" : "Ovoz yoqish"}
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            onClick={toggleAutoPrint}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              autoPrint
                ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-700/30 dark:text-blue-400"
                : "bg-muted border-border text-muted-foreground"
            }`}
            title={autoPrint ? "Avtomatik chop etish yoqilgan" : "Avtomatik chop etish o'chirilgan"}
          >
            <Printer className="h-4 w-4" />
            {autoPrint ? "Avto-chop" : "Chop etish"}
          </button>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────── */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setTab("offline")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "offline" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          <Package className="h-4 w-4" />
          Oflayn buyurtmalar
          <span className="ml-1 text-xs opacity-80">({kitchenOrders.length})</span>
        </button>
        <button
          onClick={() => setTab("online")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "online" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          <Globe className="h-4 w-4" />
          Onlayn buyurtmalar
          <span className="ml-1 text-xs opacity-80">({onlineFiltered.length})</span>
        </button>
      </div>

      {/* ── Offline tab ───────────────────────────────────── */}
      {tab === "offline" && (
        <>
          {loadingKitchen ? (
            <p className="text-center text-muted-foreground py-12">Yuklanmoqda...</p>
          ) : kitchenOrders.length === 0 ? (
            <div className="border border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Oflayn buyurtmalar yo'q</p>
              <p className="text-sm mt-1">Afitsiantlar tomonidan yuborilgan buyurtmalar bu yerda ko'rinadi</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {kitchenOrders.map((o) => {
                const batches = extractBatches(o);
                return (
                  <div key={o.id} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                    {/* Order header */}
                    <div className="bg-[#1c1816] text-white px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold tracking-wider">BUYURTMA #{o.id}</span>
                        <span className="text-xs opacity-70">{timeAgo(o.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {o.roomName && (
                          <span className="text-sm font-medium opacity-90">
                            {o.roomName}{o.tableNumber ? ` / Stol ${o.tableNumber}` : ""}
                          </span>
                        )}
                        {o.waiterName && (
                          <span className="text-xs opacity-60 ml-auto">{o.waiterName}</span>
                        )}
                      </div>
                      {o.notes && (
                        <div className="mt-1 text-xs bg-yellow-400/20 text-yellow-300 px-2 py-0.5 rounded inline-block">
                          📝 {o.notes}
                        </div>
                      )}
                    </div>

                    {/* Batches */}
                    <div className="divide-y divide-border/60">
                      {batches.map((batch) => {
                        const meta = BATCH_STATUS_META[batch.status] || BATCH_STATUS_META.sent;
                        return (
                          <div key={batch.batchNumber} className="p-0">
                            {/* Batch header */}
                            <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border/40">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Partiya #{batch.batchNumber}
                                </span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${meta.color}`}>
                                  {meta.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handlePrint(o, batch)}
                                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                  title="Chekni chop etish"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                </button>
                                {batch.status === "sent" && isOshpaz && (
                                  <button
                                    onClick={() =>
                                      updateBatchStatus.mutate({
                                        orderId: o.id,
                                        batchNumber: batch.batchNumber,
                                        status: "preparing",
                                      })
                                    }
                                    disabled={updateBatchStatus.isPending}
                                    className="text-xs px-2.5 py-1 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1"
                                  >
                                    <Clock className="h-3 w-3" />
                                    Boshlash
                                  </button>
                                )}
                                {batch.status === "preparing" && isOshpaz && (
                                  <button
                                    onClick={() =>
                                      updateBatchStatus.mutate({
                                        orderId: o.id,
                                        batchNumber: batch.batchNumber,
                                        status: "ready",
                                      })
                                    }
                                    disabled={updateBatchStatus.isPending}
                                    className="text-xs px-2.5 py-1 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 flex items-center gap-1"
                                  >
                                    <Check className="h-3 w-3" />
                                    Tayyor
                                  </button>
                                )}
                                {batch.status === "ready" && (
                                  <span className="text-xs px-2.5 py-1 rounded-lg bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-medium flex items-center gap-1">
                                    <Check className="h-3 w-3" />
                                    Tayyor
                                  </span>
                                )}
                                {batch.status === "served" && (
                                  <span className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400 font-medium">
                                    Yetkazildi
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Items - receipt style */}
                            <div className="px-4 py-2">
                              {batch.items.map((it, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between py-2 border-b border-dotted border-border/40 last:border-0"
                                >
                                  <span className="text-[15px] font-semibold text-foreground leading-tight">
                                    {it.productName}
                                  </span>
                                  <span className="text-lg font-black text-foreground ml-3 whitespace-nowrap">
                                    ×{it.quantity}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Order footer */}
                    <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">Jami: {fmt(o.totalAmount)} so'm</span>
                      <span className="text-xs text-muted-foreground">{o.items.length} ta mahsulot</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Online tab ─────────────────────────────────────── */}
      {tab === "online" && (
        <>
          {loadingOnline ? (
            <p className="text-center text-muted-foreground py-12">Yuklanmoqda...</p>
          ) : onlineFiltered.length === 0 ? (
            <div className="border border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground">
              <Globe className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Onlayn buyurtmalar yo'q</p>
              <p className="text-sm mt-1">Telegram WebApp orqali kelgan buyurtmalar bu yerda ko'rinadi</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {onlineFiltered.map((o) => {
                const meta = ONLINE_STATUS_META[o.status];
                return (
                  <div key={o.id} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                    {/* Online order header */}
                    <div className="bg-purple-900 text-white px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold tracking-wider">ONLINE #{o.id}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${meta?.color || ""}`}>
                          {meta?.label || o.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-medium">{o.customerName}</span>
                        {o.deliveryType === "delivery" ? (
                          <span className="text-xs bg-purple-400/20 text-purple-300 px-1.5 py-0.5 rounded">
                            Yetkazish
                          </span>
                        ) : (
                          <span className="text-xs bg-blue-400/20 text-blue-300 px-1.5 py-0.5 rounded">
                            Olib ketish
                          </span>
                        )}
                      </div>
                      {o.customerPhone && (
                        <div className="text-xs opacity-70 mt-0.5">{o.customerPhone}</div>
                      )}
                      {o.deliveryType === "delivery" && o.customerAddress && (
                        <div className="text-xs opacity-70 mt-0.5">{o.customerAddress}</div>
                      )}
                    </div>

                    {/* Items */}
                    <div className="px-4 py-2">
                      {o.items.map((it, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-2 border-b border-dotted border-border/40 last:border-0"
                        >
                          <span className="text-[15px] font-semibold text-foreground leading-tight">
                            {it.name}
                          </span>
                          <span className="text-lg font-black text-foreground ml-3 whitespace-nowrap">
                            ×{it.quantity}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between">
                      <span className="font-bold text-foreground">{fmt(o.totalAmount)} so'm</span>
                      <div className="flex gap-1.5">
                        {o.status === "preparing" && isOshpaz && (
                          <button
                            onClick={() => updateOnlineStatus.mutate({ id: o.id, status: "ready" })}
                            disabled={updateOnlineStatus.isPending}
                            className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 flex items-center gap-1"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Tayyor
                          </button>
                        )}
                        {o.status === "ready" && (
                          <span className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-medium flex items-center gap-1">
                            <Check className="h-3.5 w-3.5" />
                            Tayyor
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
