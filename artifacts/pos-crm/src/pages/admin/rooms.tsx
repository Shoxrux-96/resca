import { useMemo, useState } from "react";
import {
  useListRooms,
  useListTables,
  useListOpenOrders,
  getListOpenOrdersQueryKey,
  useCreateRoom,
  useUpdateRoom,
  useDeleteRoom,
  useCreateTable,
  useUpdateTable,
  useDeleteTable,
  getListRoomsQueryKey,
  getListTablesQueryKey,
  type Room,
  type Table,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Plus,
  Pencil,
  Trash2,
  DoorOpen,
  Table2,
  Users,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { combineDateAndTime, formatDateTime24, toDateInputValue, toTimeInputValue } from "@/lib/datetime";

/* ── Extended table type with occupation status ── */
type TableWithStatus = Table & {
  isOccupied?: boolean;
  openOrderId?: number | null;
  openOrderTotal?: number | null;
};
type RoomWithStatus = Omit<Room, "tables"> & { tables?: TableWithStatus[] };
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

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

/* ── Helpers ──────────────────────────────────────────────── */
const emptyRoomForm = { name: "", description: "" };
const emptyTableForm = { number: "", name: "", capacity: "4", roomId: "" };

/* ── 24h Time Select (no AM/PM) ─────────────────────────── */
function TimeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [h, m] = value ? value.split(":").map(Number) : [0, 0];
  return (
    <div>
      {label && <Label className="text-muted-foreground text-sm mb-1.5 block">{label}</Label>}
      <div className="flex gap-1 items-center">
        <select
          value={h}
          onChange={(e) => onChange(`${String(Number(e.target.value)).padStart(2, "0")}:${String(m).padStart(2, "0")}`)}
          className="flex-1 bg-input border border-border text-foreground rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50"
        >
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
          ))}
        </select>
        <span className="text-muted-foreground font-bold">:</span>
        <select
          value={m}
          onChange={(e) => onChange(`${String(h).padStart(2, "0")}:${String(Number(e.target.value)).padStart(2, "0")}`)}
          className="flex-1 bg-input border border-border text-foreground rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50"
        >
          {Array.from({ length: 60 }, (_, i) => (
            <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────── */
export default function AdminRooms() {
  const { user, token } = useAuth();
  const venueId = user?.venueId ?? 0;
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: roomsRaw, isLoading } = useListRooms(venueId, {
    query: { enabled: !!venueId, queryKey: getListRoomsQueryKey(venueId), refetchInterval: 5_000 },
  });
  const { data: tablesRaw } = useListTables(venueId, {
    query: { enabled: !!venueId, queryKey: getListTablesQueryKey(venueId), refetchInterval: 5_000 },
  });
  const { data: openOrdersRaw } = useListOpenOrders(venueId, {
    query: { enabled: !!venueId, queryKey: getListOpenOrdersQueryKey(venueId), refetchInterval: 5_000 },
  });

  const bookingQueryKey = ["room-bookings", venueId];
  const { data: bookingsRaw } = useQuery<RoomBooking[]>({
    queryKey: bookingQueryKey,
    enabled: !!venueId && !!token,
    refetchInterval: 5_000,
    queryFn: async () => {
      const res = await fetch(`/api/venues/${venueId}/room-bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load bookings");
      return res.json();
    },
  });

  const createBooking = useMutation({
    mutationFn: async (payload: Omit<RoomBooking, "id" | "venueId" | "status" | "createdAt">) => {
      const res = await fetch(`/api/venues/${venueId}/room-bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let msg = "Booking create failed";
        try {
          const body = await res.json();
          msg = body?.detail || msg;
        } catch {}
        throw new Error(msg);
      }
      return res.json() as Promise<RoomBooking>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingQueryKey }),
  });

  const updateBooking = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<RoomBooking> }) => {
      const res = await fetch(`/api/venues/${venueId}/room-bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Booking update failed");
      return res.json() as Promise<RoomBooking>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingQueryKey }),
  });

  const deleteBooking = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/venues/${venueId}/room-bookings/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Booking delete failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingQueryKey }),
  });

  const now = new Date();
  const activeBookings = (bookingsRaw ?? []).filter((b) => b.status === "active");
  const ongoingBookings = activeBookings.filter((b) => new Date(b.startAt) <= now && now <= new Date(b.endAt));
  const openOrderTableIds = new Set((openOrdersRaw ?? []).map((o) => o.tableId).filter((x): x is number => !!x));
  const bookingTableIds = new Set(ongoingBookings.map((b) => b.tableId).filter((x): x is number => !!x));
  const bookingRoomIds = new Set(ongoingBookings.map((b) => b.roomId));
  const bookingByRoom = new Map<number, RoomBooking[]>();
  for (const b of ongoingBookings) {
    const arr = bookingByRoom.get(b.roomId) ?? [];
    arr.push(b);
    bookingByRoom.set(b.roomId, arr);
  }

  const tables = ((tablesRaw ?? []) as TableWithStatus[]).map((t) => ({
    ...t,
    isOccupied:
      openOrderTableIds.has(t.id) ||
      bookingTableIds.has(t.id) ||
      (!t.roomId ? false : bookingRoomIds.has(t.roomId)),
  }));
  const rooms = ((roomsRaw ?? []) as RoomWithStatus[]).map((room) => ({
    ...room,
    tables: tables.filter((t) => t.roomId === room.id),
  }));

  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom();
  const deleteRoom = useDeleteRoom();
  const createTable = useCreateTable();
  const updateTable = useUpdateTable();
  const deleteTable = useDeleteTable();

  /* Room modal state */
  const [roomModal, setRoomModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [roomForm, setRoomForm] = useState(emptyRoomForm);

  /* Table modal state */
  const [tableModal, setTableModal] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [tableForm, setTableForm] = useState(emptyTableForm);
  const [tableParentRoomId, setTableParentRoomId] = useState<number | null>(null);
  const [bookingModal, setBookingModal] = useState(false);
  const [bookingRoomId, setBookingRoomId] = useState<string>("");
  const [bookingTableId, setBookingTableId] = useState<string>("");
  const [bookingCustomerName, setBookingCustomerName] = useState("");
  const [bookingCustomerPhone, setBookingCustomerPhone] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [bookingStartTime, setBookingStartTime] = useState("");
  const [bookingEndTime, setBookingEndTime] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");

  /* Expanded rooms */
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpanded = (id: number) =>
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListRoomsQueryKey(venueId) });
    qc.invalidateQueries({ queryKey: getListTablesQueryKey(venueId) });
    qc.invalidateQueries({ queryKey: bookingQueryKey });
  };

  const roomsOccupiedCount = rooms.filter((r) => (r.tables ?? []).some((t) => t.isOccupied) || bookingRoomIds.has(r.id)).length;
  const freeRooms = rooms.filter((r) => !((r.tables ?? []).some((t) => t.isOccupied) || bookingRoomIds.has(r.id)));
  const occupiedRooms = rooms.filter((r) => (r.tables ?? []).some((t) => t.isOccupied) || bookingRoomIds.has(r.id));
  const freeTables = tables.filter((t) => !t.isOccupied);
  const occupiedTables = tables.filter((t) => t.isOccupied);

  const openBookingModal = () => {
    const nowLocal = new Date();
    const after2h = new Date(nowLocal.getTime() + 2 * 60 * 60 * 1000);
    setBookingRoomId("");
    setBookingTableId("");
    setBookingCustomerName("");
    setBookingCustomerPhone("");
    setBookingDate(toDateInputValue(nowLocal));
    setBookingStartTime(toTimeInputValue(nowLocal));
    setBookingEndTime(toTimeInputValue(after2h));
    setBookingNotes("");
    setBookingModal(true);
  };

  const handleCreateBooking = () => {
    if (!bookingRoomId || !bookingCustomerName.trim() || !bookingDate || !bookingStartTime || !bookingEndTime) {
      toast({ title: "Bron uchun majburiy maydonlarni to'ldiring", variant: "destructive" });
      return;
    }
    const startAt = combineDateAndTime(bookingDate, bookingStartTime);
    let endDate = bookingDate;
    if (bookingEndTime <= bookingStartTime) {
      const d = new Date(bookingDate + "T12:00:00");
      d.setDate(d.getDate() + 1);
      endDate = toDateInputValue(d);
    }
    const endAt = combineDateAndTime(endDate, bookingEndTime);
    createBooking.mutate(
      {
        roomId: Number(bookingRoomId),
        tableId: bookingTableId ? Number(bookingTableId) : null,
        customerName: bookingCustomerName.trim(),
        customerPhone: bookingCustomerPhone.trim() || null,
        startAt,
        endAt,
        notes: bookingNotes.trim() || null,
      },
      {
        onSuccess: () => {
          setBookingModal(false);
          toast({ title: "Bron yaratildi" });
        },
        onError: (err) => toast({ title: err.message || "Bron yaratishda xatolik", variant: "destructive" }),
      }
    );
  };

  /* ── Room handlers ── */
  const openCreateRoom = () => {
    setEditingRoom(null);
    setRoomForm(emptyRoomForm);
    setRoomModal(true);
  };

  const openEditRoom = (r: Room) => {
    setEditingRoom(r);
    setRoomForm({ name: r.name, description: r.description ?? "" });
    setRoomModal(true);
  };

  const handleSaveRoom = () => {
    if (!roomForm.name.trim()) {
      toast({ title: "Xona nomini kiriting", variant: "destructive" });
      return;
    }
    if (editingRoom) {
      updateRoom.mutate(
        { venueId, id: editingRoom.id, data: { name: roomForm.name.trim(), description: roomForm.description || undefined } },
        {
          onSuccess: () => { invalidate(); setRoomModal(false); toast({ title: "Xona yangilandi" }); },
          onError: () => toast({ title: "Xatolik", variant: "destructive" }),
        }
      );
    } else {
      createRoom.mutate(
        { venueId, data: { name: roomForm.name.trim(), description: roomForm.description || undefined } },
        {
          onSuccess: (r) => {
            invalidate();
            setRoomModal(false);
            setExpanded((prev) => new Set(prev).add(r.id));
            toast({ title: "Xona qo'shildi" });
          },
          onError: () => toast({ title: "Xatolik", variant: "destructive" }),
        }
      );
    }
  };

  const handleDeleteRoom = (r: Room) => {
    if (!confirm(`"${r.name}" xonasini va undagi barcha stollarni o'chirasizmi?`)) return;
    deleteRoom.mutate(
      { venueId, id: r.id },
      {
        onSuccess: () => { invalidate(); toast({ title: "Xona o'chirildi" }); },
        onError: () => toast({ title: "Xatolik", variant: "destructive" }),
      }
    );
  };

  const handleToggleRoom = (r: Room) => {
    updateRoom.mutate(
      { venueId, id: r.id, data: { isActive: !r.isActive } },
      { onSuccess: invalidate, onError: () => toast({ title: "Xatolik", variant: "destructive" }) }
    );
  };

  /* ── Table handlers ── */
  const openCreateTable = (roomId: number | null) => {
    setEditingTable(null);
    setTableParentRoomId(roomId);
    const usedNumbers = rooms.flatMap((r) => r.tables ?? []).map((t) => t.number);
    const nextNum = usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1;
    setTableForm({ number: String(nextNum), name: "", capacity: "4", roomId: roomId ? String(roomId) : "" });
    setTableModal(true);
  };

  const openEditTable = (t: Table) => {
    setEditingTable(t);
    setTableParentRoomId(t.roomId ?? null);
    setTableForm({
      number: String(t.number),
      name: t.name ?? "",
      capacity: String(t.capacity ?? 4),
      roomId: t.roomId ? String(t.roomId) : "",
    });
    setTableModal(true);
  };

  const handleSaveTable = () => {
    const num = parseInt(tableForm.number);
    if (!num || num < 1) {
      toast({ title: "Stol raqamini kiriting", variant: "destructive" });
      return;
    }
    const data = {
      number: num,
      name: tableForm.name.trim() || undefined,
      capacity: parseInt(tableForm.capacity) || 4,
      roomId: tableForm.roomId ? parseInt(tableForm.roomId) : null,
    };
    if (editingTable) {
      updateTable.mutate(
        { venueId, id: editingTable.id, data },
        {
          onSuccess: () => { invalidate(); setTableModal(false); toast({ title: "Stol yangilandi" }); },
          onError: () => toast({ title: "Xatolik", variant: "destructive" }),
        }
      );
    } else {
      createTable.mutate(
        { venueId, data },
        {
          onSuccess: () => { invalidate(); setTableModal(false); toast({ title: "Stol qo'shildi" }); },
          onError: () => toast({ title: "Xatolik", variant: "destructive" }),
        }
      );
    }
  };

  const handleDeleteTable = (t: Table) => {
    if (!confirm(`Stol #${t.number} ni o'chirasizmi?`)) return;
    deleteTable.mutate(
      { venueId, id: t.id },
      {
        onSuccess: () => { invalidate(); toast({ title: "Stol o'chirildi" }); },
        onError: () => toast({ title: "Xatolik", variant: "destructive" }),
      }
    );
  };

  const handleToggleTable = (t: Table) => {
    updateTable.mutate(
      { venueId, id: t.id, data: { isActive: !t.isActive } },
      { onSuccess: invalidate, onError: () => toast({ title: "Xatolik", variant: "destructive" }) }
    );
  };

  /* ── Render ── */
  const allTables = tables;
  const unassignedTables = allTables.filter((t) => !t.roomId);
  const occupiedCount = allTables.filter((t) => t.isOccupied).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Xonalar va Stollar</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {rooms.length} ta xona · {allTables.length} ta stol
            {occupiedCount > 0 && (
              <span className="ml-2 text-red-400 font-medium">{occupiedCount} ta band</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <Button
            variant="outline"
            size="sm"
            className="border-border text-foreground hover:bg-accent"
            onClick={() => openCreateTable(null)}
          >
            <Table2 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Stol qo'shish</span>
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-foreground" onClick={openCreateRoom}>
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Xona qo'shish</span>
          </Button>
          <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-foreground" onClick={openBookingModal}>
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Bron qilish</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Xonalar band</p>
          <p className="text-lg font-semibold text-red-400">{roomsOccupiedCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Xonalar bo'sh</p>
          <p className="text-lg font-semibold text-emerald-500">{freeRooms.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Stollar band</p>
          <p className="text-lg font-semibold text-red-400">{occupiedTables.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Stollar bo'sh</p>
          <p className="text-lg font-semibold text-emerald-500">{freeTables.length}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-3">
        <p className="text-sm font-medium text-foreground">Hozir band xonalar:</p>
        <p className="text-xs text-muted-foreground mt-1">
          {occupiedRooms.length > 0 ? occupiedRooms.map((r) => r.name).join(", ") : "Band xona yo'q"}
        </p>
        <p className="text-sm font-medium text-foreground mt-3">Hozir band stollar:</p>
        <p className="text-xs text-muted-foreground mt-1">
          {occupiedTables.length > 0
            ? occupiedTables.map((t) => `#${t.number}${t.roomId ? ` (${rooms.find((r) => r.id === t.roomId)?.name ?? "Xona" })` : ""}`).join(", ")
            : "Band stol yo'q"}
        </p>
      </div>



      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Bo'sh stol
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />Band (ochiq buyurtma)
        </span>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-center py-16">Yuklanmoqda...</div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border border-dashed border-border rounded-2xl">
          <DoorOpen className="h-16 w-16 mb-3 opacity-30" />
          <p className="text-lg font-medium">Xona yo'q</p>
          <p className="text-sm mt-1">Birinchi xonangizni qo'shing</p>
          <Button className="mt-4 bg-blue-600 hover:bg-blue-700 text-foreground" onClick={openCreateRoom}>
            <Plus className="h-4 w-4 mr-2" />
            Xona qo'shish
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => {
            const isOpen = expanded.has(room.id);
            const tables = (room.tables ?? []) as TableWithStatus[];
            const occupiedInRoom = tables.filter((t) => t.isOccupied).length;
            return (
              <div
                key={room.id}
                className="bg-card border border-border rounded-2xl overflow-hidden"
              >
                {/* Room header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => toggleExpanded(room.id)}
                    className="flex items-center gap-2 flex-1 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <DoorOpen className="h-4 w-4 text-blue-400" />
                    <span className="font-semibold text-foreground">{room.name}</span>
                    {room.description && (
                      <span className="text-xs text-muted-foreground ml-1">— {room.description}</span>
                    )}
                    <Badge
                      variant="outline"
                      className="ml-2 text-xs border-border text-muted-foreground"
                    >
                      {tables.length} stol
                    </Badge>
                    {occupiedInRoom > 0 && (
                      <Badge variant="outline" className="text-xs border-red-700/60 text-red-400 bg-red-900/20">
                        {occupiedInRoom} band
                      </Badge>
                    )}
                    {(bookingByRoom.get(room.id)?.length ?? 0) > 0 && (
                      <Badge variant="outline" className="text-xs border-purple-700/60 text-purple-400 bg-purple-900/20">
                        {(bookingByRoom.get(room.id) ?? []).length} bron
                      </Badge>
                    )}
                    {!room.isActive && (
                      <Badge variant="outline" className="text-xs border-red-800 text-red-400">
                        Nofaol
                      </Badge>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={room.isActive}
                      onCheckedChange={() => handleToggleRoom(room)}
                      className="data-[state=checked]:bg-blue-600"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openCreateTable(room.id)}
                      className="text-muted-foreground hover:text-foreground hover:bg-accent h-8 px-2"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Stol
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditRoom(room)}
                      className="text-muted-foreground hover:text-foreground hover:bg-accent h-8 w-8 p-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRoom(room)}
                      className="text-red-500 hover:text-red-400 hover:bg-red-500/10 h-8 w-8 p-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Tables grid */}
                {isOpen && (
                  <div className="border-t border-border px-4 py-4">
                    {tables.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Table2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Stol yo'q</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3 border-border text-muted-foreground hover:bg-accent"
                          onClick={() => openCreateTable(room.id)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Stol qo'shish
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {tables
                          .sort((a, b) => a.number - b.number)
                          .map((table) => (
                            <TableCard
                              key={table.id}
                              table={table}
                              onEdit={() => openEditTable(table)}
                              onDelete={() => handleDeleteTable(table)}
                              onToggle={() => handleToggleTable(table)}
                            />
                          ))}
                        <button
                          onClick={() => openCreateTable(room.id)}
                          className="flex flex-col items-center justify-center h-28 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-blue-600 hover:text-blue-500 transition-colors"
                        >
                          <Plus className="h-5 w-5 mb-1" />
                          <span className="text-xs">Qo'shish</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned tables */}
          {unassignedTables.length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <Table2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-muted-foreground">Xonasiz stollar</span>
                <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                  {unassignedTables.length} ta
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 p-4">
                {unassignedTables
                  .sort((a, b) => a.number - b.number)
                  .map((table) => (
                    <TableCard
                      key={table.id}
                      table={table}
                      onEdit={() => openEditTable(table)}
                      onDelete={() => handleDeleteTable(table)}
                      onToggle={() => handleToggleTable(table)}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-foreground">Aktiv bronlar</h2>
          <Badge variant="outline" className="text-xs border-border text-muted-foreground">
            {activeBookings.length} ta
          </Badge>
        </div>
        {activeBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Hozir aktiv bron yo'q.</p>
        ) : (
          <div className="space-y-2">
            {activeBookings.map((b) => {
              const roomName = rooms.find((r) => r.id === b.roomId)?.name ?? "Xona";
              const table = b.tableId ? tables.find((t) => t.id === b.tableId) : null;
              return (
                <div key={b.id} className="rounded-lg border border-border bg-muted/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground font-medium">
                        {roomName} {table ? `· Stol #${table.number}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {b.customerName}
                        {b.customerPhone ? ` · ${b.customerPhone}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime24(b.startAt)} - {formatDateTime24(b.endAt)}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60">
                        Bron qilingan: {formatDateTime24(b.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => updateBooking.mutate({ id: b.id, data: { status: "completed" } })}
                      >
                        Yakunlash
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
                        onClick={() => deleteBooking.mutate(b.id)}
                      >
                        O'chirish
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Room Modal */}
      <Dialog open={roomModal} onOpenChange={setRoomModal}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>{editingRoom ? "Xonani tahrirlash" : "Yangi xona"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-zinc-300">Xona nomi *</Label>
              <Input
                value={roomForm.name}
                onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Masalan: Asosiy zal, VIP xona..."
                className="mt-1.5 bg-input border-border text-foreground"
              />
            </div>
            <div>
              <Label className="text-zinc-300">Tavsif (ixtiyoriy)</Label>
              <Input
                value={roomForm.description}
                onChange={(e) => setRoomForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Xona haqida qo'shimcha ma'lumot"
                className="mt-1.5 bg-input border-border text-foreground"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoomModal(false)} className="border-border text-foreground">
              Bekor qilish
            </Button>
            <Button
              onClick={handleSaveRoom}
              disabled={createRoom.isPending || updateRoom.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-foreground"
            >
              {editingRoom ? "Saqlash" : "Qo'shish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table Modal */}
      <Dialog open={tableModal} onOpenChange={setTableModal}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>{editingTable ? "Stolni tahrirlash" : "Yangi stol"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-300">Stol raqami *</Label>
                <Input
                  type="number"
                  value={tableForm.number}
                  onChange={(e) => setTableForm((f) => ({ ...f, number: e.target.value }))}
                  min={1}
                  className="mt-1.5 bg-input border-border text-foreground"
                />
              </div>
              <div>
                <Label className="text-zinc-300">Sig'im (o'rin soni)</Label>
                <Input
                  type="number"
                  value={tableForm.capacity}
                  onChange={(e) => setTableForm((f) => ({ ...f, capacity: e.target.value }))}
                  min={1}
                  className="mt-1.5 bg-input border-border text-foreground"
                />
              </div>
            </div>
            <div>
              <Label className="text-zinc-300">Stol nomi (ixtiyoriy)</Label>
              <Input
                value={tableForm.name}
                onChange={(e) => setTableForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Masalan: Burchak stoli, Terrasa..."
                className="mt-1.5 bg-input border-border text-foreground"
              />
            </div>
            <div>
              <Label className="text-zinc-300">Xona</Label>
              <select
                value={tableForm.roomId}
                onChange={(e) => setTableForm((f) => ({ ...f, roomId: e.target.value }))}
                className="w-full mt-1.5 bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="">— Xona tanlang (ixtiyoriy) —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTableModal(false)} className="border-border text-foreground">
              Bekor qilish
            </Button>
            <Button
              onClick={handleSaveTable}
              disabled={createTable.isPending || updateTable.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-foreground"
            >
              {editingTable ? "Saqlash" : "Qo'shish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking Modal */}
      <Dialog open={bookingModal} onOpenChange={setBookingModal}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Yangi bron</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Xona *</Label>
              <select
                value={bookingRoomId}
                onChange={(e) => {
                  setBookingRoomId(e.target.value);
                  setBookingTableId("");
                }}
                className="w-full mt-1.5 bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm"
              >
                <option value="">— Xona tanlang —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Stol (ixtiyoriy)</Label>
              <select
                value={bookingTableId}
                onChange={(e) => setBookingTableId(e.target.value)}
                className="w-full mt-1.5 bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm"
              >
                <option value="">— Stol tanlang —</option>
                {tables
                  .filter((t) => !bookingRoomId || t.roomId === Number(bookingRoomId))
                  .map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      #{t.number} {t.name ? `(${t.name})` : ""}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label>Mijoz ismi *</Label>
              <Input value={bookingCustomerName} onChange={(e) => setBookingCustomerName(e.target.value)} className="mt-1.5 bg-input border-border text-foreground" />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input value={bookingCustomerPhone} onChange={(e) => setBookingCustomerPhone(e.target.value)} className="mt-1.5 bg-input border-border text-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-sm">Sana *</Label>
                <Input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} className="mt-1.5 bg-input border-border text-foreground" />
              </div>
              <TimeSelect value={bookingStartTime} onChange={setBookingStartTime} label="Boshlanish vaqti *" />
            </div>
            <TimeSelect value={bookingEndTime} onChange={setBookingEndTime} label="Tugash vaqti *" />
            <div>
              <Label>Izoh</Label>
              <Input value={bookingNotes} onChange={(e) => setBookingNotes(e.target.value)} className="mt-1.5 bg-input border-border text-foreground" />
            </div>
            {(activeBookings.length > 0 || (bookingsRaw ?? []).length > 0) && (
              <div className="border-t border-border pt-3">
                <p className="text-sm font-medium">Aktiv bronlar</p>
                <div className="space-y-2 mt-2 max-h-40 overflow-auto pr-1">
                  {activeBookings.map((b) => (
                    <div key={b.id} className="text-xs bg-muted rounded p-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-foreground">
                          {rooms.find((r) => r.id === b.roomId)?.name ?? "Xona"} {b.tableId ? `· Stol #${tables.find((t) => t.id === b.tableId)?.number ?? b.tableId}` : ""}
                        </div>
                        <div className="text-muted-foreground">
                          {b.customerName} · {formatDateTime24(b.startAt)} - {formatDateTime24(b.endAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => updateBooking.mutate({ id: b.id, data: { status: "completed" } })}
                        >
                          Yakunlash
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
                          onClick={() => deleteBooking.mutate(b.id)}
                        >
                          O'chirish
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingModal(false)} className="border-border text-foreground">
              Bekor
            </Button>
            <Button onClick={handleCreateBooking} disabled={createBooking.isPending} className="bg-purple-600 hover:bg-purple-700 text-foreground">
              Bronni saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Table Card Component ─────────────────────────────────── */
function TableCard({
  table,
  onEdit,
  onDelete,
  onToggle,
}: {
  table: TableWithStatus;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const isOccupied = table.isOccupied ?? false;

  return (
    <div
      className={`relative group flex flex-col items-center justify-center h-28 rounded-xl border-2 transition-all ${
        !table.isActive
          ? "border-border bg-zinc-200 dark:bg-zinc-950 opacity-50"
          : isOccupied
          ? "border-red-500/60 bg-red-100 dark:bg-red-950/20"
          : "border-border bg-zinc-200 dark:bg-zinc-900 hover:border-blue-600/60"
      }`}
    >
      {/* Occupation status dot */}
      {table.isActive && (
        <div
          className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${
            isOccupied ? "bg-red-500 animate-pulse" : "bg-emerald-500"
          }`}
        />
      )}

      <span className={`text-2xl font-bold ${isOccupied ? "text-red-700 dark:text-red-200" : "text-zinc-900 dark:text-white"}`}>
        #{table.number}
      </span>
      {table.name && (
        <span className="text-xs text-muted-foreground mt-0.5 px-1 truncate max-w-full">{table.name}</span>
      )}
      {table.capacity && (
        <div className="flex items-center gap-1 text-muted-foreground mt-1">
          <Users className="h-3 w-3" />
          <span className="text-xs">{table.capacity}</span>
        </div>
      )}
      {isOccupied && table.openOrderTotal && (
        <span className="text-xs text-red-300 font-medium mt-1">
          {fmt(table.openOrderTotal)} so'm
        </span>
      )}

      {/* Hover actions */}
      <div className="absolute inset-0 rounded-xl bg-zinc-200/95 dark:bg-zinc-900/95 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg bg-white dark:bg-zinc-800 hover:bg-blue-600 text-foreground hover:text-foreground transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <div className="p-1.5 rounded-lg bg-white dark:bg-zinc-800 hover:bg-yellow-600 text-foreground hover:text-foreground transition-colors">
          <Switch
            checked={table.isActive}
            onCheckedChange={onToggle}
            className="h-3 w-6 data-[state=checked]:bg-blue-600"
          />
        </div>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg bg-white dark:bg-zinc-800 hover:bg-red-600 text-foreground hover:text-foreground transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
