import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Bell, AlertTriangle, Package, X, Check, ChefHat, UtensilsCrossed } from "lucide-react";
import { useLocation } from "wouter";

type InvAlert = { id: number; name: string; unit: string; quantity: number; minQuantity: number };

type ReadyBatchNotif = {
  orderId: number;
  tableId: number | null;
  tableNumber: number | null;
  roomName: string | null;
  batchNumber: number;
  items: string[];
};

const READ_KEY = "restoCrm_notifs_read";

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(Array.from(ids)));
  } catch { /* ignore */ }
}

export function NotificationsBell() {
  const { user, token } = useAuth();
  const venueId = user?.venueId ?? 0;
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => getReadIds());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const role = user?.role;

  // Inventory alerts for admin/kassir
  const allowedInv = (role === "admin" || role === "kassir") && !!venueId;
  const { data: alerts = [] } = useQuery<InvAlert[]>({
    queryKey: ["inventory-alerts", venueId],
    enabled: !!venueId && !!token && allowedInv,
    refetchInterval: 30_000,
    queryFn: async () => {
      const r = await fetch(`/api/venues/${venueId}/inventory/alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return [];
      return r.json();
    },
  });

  // Ready batch notifications for waiters
  const allowedReady = role === "waiter" && !!venueId;
  const { data: readyNotifs = [] } = useQuery<ReadyBatchNotif[]>({
    queryKey: ["waiter-ready-notifs", venueId],
    enabled: !!venueId && !!token && allowedReady,
    refetchInterval: 5_000,
    queryFn: async () => {
      const r = await fetch(`/api/venues/${venueId}/open-orders?status_filter=all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return [];
      const orders = await r.json();
      const notifs: ReadyBatchNotif[] = [];
      for (const o of orders) {
        if (o.waiterId !== user?.id) continue;
        const batches = new Map<number, { batchNumber: number; items: string[] }>();
        for (const item of o.items ?? []) {
          if (item.batchNumber != null && item.itemStatus === "ready") {
            const b = batches.get(item.batchNumber) ?? { batchNumber: item.batchNumber, items: [] };
            b.items.push(item.productName);
            batches.set(item.batchNumber, b);
          }
        }
        for (const [, b] of batches) {
          notifs.push({
            orderId: o.id,
            tableId: o.tableId,
            tableNumber: o.tableNumber,
            roomName: o.roomName,
            batchNumber: b.batchNumber,
            items: b.items,
          });
        }
      }
      return notifs;
    },
  });

  const allowed = allowedInv || allowedReady;

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!allowed) return null;

  const unreadAlerts = alerts.filter((a) => !readIds.has(`alert-${a.id}`));
  const unreadReady = readyNotifs.filter((n) => !readIds.has(`ready-${n.orderId}-${n.batchNumber}`));
  const unreadCount = unreadAlerts.length + unreadReady.length;

  const markAsRead = (id: string) => {
    const next = new Set(readIds);
    next.add(id);
    setReadIds(next);
    saveReadIds(next);
  };

  const markAllAsRead = () => {
    const next = new Set(readIds);
    alerts.forEach((a) => next.add(`alert-${a.id}`));
    readyNotifs.forEach((n) => next.add(`ready-${n.orderId}-${n.batchNumber}`));
    setReadIds(next);
    saveReadIds(next);
  };

  const handleClick = (path: string, id: string) => {
    markAsRead(id);
    setOpen(false);
    setLocation(path);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Bildirishnomalar"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-foreground" />
              <h3 className="font-semibold text-foreground text-sm">Bildirishnomalar</h3>
              {(alerts.length > 0 || readyNotifs.length > 0) && (
                <span className="text-xs text-muted-foreground">({alerts.length + readyNotifs.length})</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1 px-2 py-1 rounded hover:bg-accent"
                  title="Barchasini o'qilgan deb belgilash"
                >
                  <Check className="h-3 w-3" />
                  Hammasi
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[60vh] overflow-y-auto">
            {alerts.length === 0 && readyNotifs.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check className="h-6 w-6 text-green-500" />
                </div>
                <p className="text-sm font-medium text-foreground">Hammasi yaxshi</p>
                <p className="text-xs text-muted-foreground mt-1">Yangi bildirishnoma yo'q</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* Ready batch section for waiters */}
                {allowedReady && readyNotifs.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-muted/30">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <ChefHat className="h-3 w-3 text-emerald-500" />
                        Tayyor buyurtmalar
                      </p>
                    </div>
                    {readyNotifs.map((n) => {
                      const id = `ready-${n.orderId}-${n.batchNumber}`;
                      const isUnread = !readIds.has(id);
                      return (
                        <button
                          key={id}
                          onClick={() => handleClick(`/waiter/table/${n.tableId ?? n.orderId}`, id)}
                          className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors ${isUnread ? "bg-emerald-500/5" : ""}`}
                        >
                          <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-500/10">
                            <UtensilsCrossed className="h-4 w-4 text-emerald-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {n.roomName ? `${n.roomName} · ` : ""}Stol #{n.tableNumber ?? "?"}
                              {isUnread && <span className="ml-2 inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full" />}
                            </p>
                            <p className="text-xs text-emerald-500 mt-0.5">
                              #{n.batchNumber} partiya tayyor
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {n.items.join(", ")}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
                {/* Inventory alerts for admin/kassir */}
                {allowedInv && alerts.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-muted/30">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                        Ombor ogohlantirishlar
                      </p>
                    </div>
                    {alerts.map((a) => {
                      const id = `alert-${a.id}`;
                      const isUnread = !readIds.has(id);
                      const isEmpty = a.quantity <= 0;
                      return (
                        <button
                          key={a.id}
                          onClick={() => handleClick("/admin/inventory", id)}
                          className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors ${isUnread ? "bg-blue-500/5" : ""}`}
                        >
                          <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${isEmpty ? "bg-red-500/10" : "bg-amber-500/10"}`}>
                            {isEmpty ? (
                              <Package className="h-4 w-4 text-red-500" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {a.name}
                              {isUnread && <span className="ml-2 inline-block w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                            </p>
                            <p className={`text-xs mt-0.5 ${isEmpty ? "text-red-500" : "text-amber-500"}`}>
                              {isEmpty ? "Tugagan!" : `Faqat ${a.quantity} ${a.unit} qoldi`}
                              <span className="text-muted-foreground"> · min: {a.minQuantity} {a.unit}</span>
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {alerts.length > 0 && allowedInv && (
            <div className="px-4 py-2.5 border-t border-border bg-muted/20">
              <button
                onClick={() => { setOpen(false); setLocation("/admin/inventory"); }}
                className="w-full text-xs text-blue-500 hover:text-blue-400 font-medium"
              >
                Omborxona sahifasiga o'tish →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
