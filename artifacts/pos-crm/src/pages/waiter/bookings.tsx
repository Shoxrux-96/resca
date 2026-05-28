import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime24 } from "@/lib/datetime";

type RoomBooking = {
  id: number;
  venueId: number;
  roomId: number;
  tableId?: number | null;
  customerName: string;
  customerPhone?: string | null;
  startAt: string;
  endAt: string;
  notes?: string | null;
  status: "active" | "completed" | "cancelled";
  createdAt: string;
};

type Room = { id: number; name: string; isActive: boolean };
type Table = { id: number; roomId?: number | null; number: number; isActive: boolean };

export default function WaiterBookings() {
  const { user, token } = useAuth();
  const venueId = user?.venueId ?? 0;
  const qc = useQueryClient();

  const bookingQueryKey = ["room-bookings", venueId];
  const roomQueryKey = ["rooms", venueId];
  const tableQueryKey = ["tables", venueId];

  const { data: bookings = [], isLoading } = useQuery<RoomBooking[]>({
    queryKey: bookingQueryKey,
    enabled: !!venueId && !!token,
    refetchInterval: 15_000,
    queryFn: async () => {
      const res = await fetch(`/api/venues/${venueId}/room-bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load bookings");
      return res.json();
    },
  });

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: roomQueryKey,
    enabled: !!venueId && !!token,
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await fetch(`/api/venues/${venueId}/rooms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load rooms");
      return res.json();
    },
  });

  const { data: tables = [] } = useQuery<Table[]>({
    queryKey: tableQueryKey,
    enabled: !!venueId && !!token,
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await fetch(`/api/venues/${venueId}/tables`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load tables");
      return res.json();
    },
  });

  const updateBooking = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<RoomBooking> }) => {
      const res = await fetch(`/api/venues/${venueId}/room-bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingQueryKey }),
  });

  const now = new Date();
  const activeBookings = bookings.filter((b) => {
    if (b.status !== "active") return false;
    return new Date(b.startAt) <= now && now <= new Date(b.endAt);
  });
  const upcomingBookings = bookings.filter((b) => b.status === "active" && new Date(b.startAt) > now);

  const roomName = (id: number) => rooms.find((r) => r.id === id)?.name ?? "Xona";
  const tableLabel = (id?: number | null) => {
    if (!id) return "";
    const t = tables.find((x) => x.id === id);
    return t ? `Stol #${t.number}` : `Stol #${id}`;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bronlar</h1>
        <p className="text-sm text-muted-foreground mt-1">Afitsiantlar uchun xonalar/stollar bron holati</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Aktiv bronlar</p>
          <p className="text-lg font-semibold text-red-400">{activeBookings.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Kelasi bronlar</p>
          <p className="text-lg font-semibold text-blue-400">{upcomingBookings.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Jami bronlar</p>
          <p className="text-lg font-semibold text-foreground">{bookings.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Yakunlangan</p>
          <p className="text-lg font-semibold text-emerald-500">{bookings.filter((b) => b.status === "completed").length}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-foreground">Aktiv bronlar ro'yxati</h2>
          <Badge variant="outline" className="text-xs border-border text-muted-foreground">
            {activeBookings.length} ta
          </Badge>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
        ) : activeBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Hozir aktiv bron yo'q.</p>
        ) : (
          <div className="space-y-2">
            {activeBookings.map((b) => (
              <div key={b.id} className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground font-medium">
                      {roomName(b.roomId)} {b.tableId ? `· ${tableLabel(b.tableId)}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.customerName}
                      {b.customerPhone ? ` · ${b.customerPhone}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime24(b.startAt)} - {formatDateTime24(b.endAt)}
                    </p>
                    {b.notes ? <p className="text-xs text-muted-foreground mt-1">{b.notes}</p> : null}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs shrink-0"
                    onClick={() => updateBooking.mutate({ id: b.id, data: { status: "completed" } })}
                  >
                    Yakunlash
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

