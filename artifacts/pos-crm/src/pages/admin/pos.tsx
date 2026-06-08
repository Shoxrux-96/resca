import { useState, useRef, useEffect, useMemo } from "react";
import {
  useListProducts,
  useListCustomers,
  useListTables,
  useCreateCustomer,
  useCreateOrder,
  useListRooms,
  useListOpenOrders,
  usePayOpenOrder,
  getListCustomersQueryKey,
  getListProductsQueryKey,
  getListTablesQueryKey,
  getListRoomsQueryKey,
  getListOpenOrdersQueryKey,
  type Product,
  type Table,
  type Room,
  type ActiveOrder,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Search, Plus, Minus, Trash2, Printer, CheckCircle, ChevronUp, X,
  Percent, ShoppingBag, UserPlus, DoorOpen, Table2, Shuffle, ClipboardList,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { formatDateTime24 } from "@/lib/datetime";

type Unit = string;
const UNITS: { value: string; label: string }[] = [
  { value: "dona", label: "dona" },
  { value: "porsiya", label: "porsiya" },
  { value: "stakan", label: "stakan" },
  { value: "shisha", label: "shisha" },
  { value: "quti", label: "quti" },
  { value: "kg", label: "kg" },
  { value: "gram", label: "gram" },
  { value: "litr", label: "litr" },
  { value: "ml", label: "ml" },
  { value: "kosa", label: "kosa" },
  { value: "tarelka", label: "tarelka" },
  { value: "piyola", label: "piyola" },
  { value: "lagan", label: "lagan" },
];

type PayType = "naxt" | "karta" | "qarz" | "aralash";

type SplitPayment = {
  cash: number;
  card: number;
  debt: number;
};

type CartItem = {
  product: Product;
  quantity: number;
  discount: number;
  unit: Unit;
};

type ReceiptData = {
  orderId: number;
  venueName: string;
  items: CartItem[];
  subtotal: number;
  totalDiscount: number;
  total: number;
  payType: PayType;
  splitPayment?: SplitPayment;
  customerName?: string;
  tableNumber?: number;
  roomName?: string;
  date: Date;
};

type TableSelection = {
  roomId: number | null;
  roomName: string | null;
  tableId: number | null;
  tableNumber: number | null;
};

type TableWithStatus = {
  id: number;
  number: number;
  name?: string | null;
  capacity?: number | null;
  isActive: boolean;
  roomId?: number | null;
  isOccupied?: boolean;
  openOrderId?: number | null;
  openOrderTotal?: number | null;
};

function itemTotal(item: CartItem) {
  const base = item.product.price * item.quantity;
  return base - (base * item.discount) / 100;
}

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

/* ── Thermal Fiscal Receipt ──────────────────────────────── */
function ThermalReceipt({ data, onClose }: { data: ReceiptData; onClose: () => void }) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const dateStr = data.date.toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const checkNum = String(data.orderId).padStart(6, "0");

  const qrData = JSON.stringify({
    id: data.orderId,
    venue: data.venueName,
    total: data.total,
    date: data.date.toISOString().slice(0, 10),
  });

  const payLabel = (type: PayType, split?: SplitPayment) => {
    if (type === "aralash" && split) {
      const parts: string[] = [];
      if (split.cash > 0) parts.push(`Naqd: ${fmt(split.cash)} so'm`);
      if (split.card > 0) parts.push(`Karta: ${fmt(split.card)} so'm`);
      if (split.debt > 0) parts.push(`Qarz: ${fmt(split.debt)} so'm`);
      return parts.join(" / ");
    }
    return type === "naxt" ? "Naqd pul" : type === "karta" ? "Bank kartasi" : "Qarzga";
  };

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    const content = receiptRef.current?.innerHTML ?? "";
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>CHEK #${checkNum}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        @page { size: 58mm auto; margin: 0; }
        @media print {
          html, body { width: 58mm; }
        }
        body {
          font-family: 'Courier New', 'Courier', monospace;
          font-size: 10px;
          width: 58mm;
          max-width: 58mm;
          background: #fff;
          color: #000;
          padding: 2mm 3mm;
          line-height: 1.35;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
        .c { text-align: center; }
        .r { text-align: right; }
        .b { font-weight: bold; }
        .dash { border-top: 1px dashed #000; margin: 2mm 0; }
        .solid { border-top: 1px solid #000; margin: 2mm 0; }
        .dbl { border-top: 3px double #000; margin: 2mm 0; }
        .row { display: flex; justify-content: space-between; line-height: 1.4; }
        .xl { font-size: 13px; font-weight: bold; }
        .sm { font-size: 8px; }
        .qr { display: flex; justify-content: center; margin: 2mm 0; }
        canvas, svg { display: block; max-width: 100%; }
      </style>
      </head><body>${content}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  const Dash = () => <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />;
  const Solid = () => <div style={{ borderTop: "1px solid #000", margin: "4px 0" }} />;
  const Dbl = () => <div style={{ borderTop: "3px double #000", margin: "4px 0" }} />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xs w-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="font-semibold text-gray-800 text-sm">Sotuv muvaffaqiyatli!</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[72vh] p-3 bg-gray-50">
          <div
            ref={receiptRef}
            className="bg-white mx-auto p-3 shadow-inner"
            style={{ fontFamily: "'Courier New', monospace", fontSize: "10px", width: "220px", color: "#000", lineHeight: "1.35" }}
          >
            <div style={{ textAlign: "center", marginBottom: "2px" }}>
              <div style={{ fontWeight: "bold", fontSize: "14px", letterSpacing: "1px" }}>
                {data.venueName.toUpperCase()}
              </div>
              <div style={{ fontSize: "9px", color: "#555" }}>Savdo cheki / Товарный чек</div>
            </div>
            <Solid />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px" }}>
              <span>CHEK: <b>#{checkNum}</b></span>
              <span>{dateStr}</span>
            </div>
            {data.customerName && (
              <div style={{ fontSize: "9px" }}>Mijoz: <b>{data.customerName}</b></div>
            )}
            {(data.roomName || data.tableNumber) && (
              <div style={{ fontSize: "9px" }}>
                Joy: <b>{[data.roomName, data.tableNumber ? `Stol #${data.tableNumber}` : ""].filter(Boolean).join(" · ")}</b>
              </div>
            )}
            <Dash />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#555" }}>
              <span style={{ flex: 1 }}>MAHSULOT</span>
              <span style={{ width: "70px", textAlign: "right" }}>SUMMA</span>
            </div>
            <Dash />
            {data.items.map((item, i) => {
              const lineTotal = itemTotal(item);
              return (
                <div key={i} style={{ marginBottom: "3px" }}>
                  <div style={{ fontWeight: "bold", fontSize: "10px" }}>
                    {i + 1}. {item.product.name}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px" }}>
                    <span>
                      {item.quantity} {item.unit} × {fmt(item.product.price)}
                      {item.discount > 0 ? ` (-${item.discount}%)` : ""}
                    </span>
                    <span style={{ fontWeight: "bold" }}>{fmt(lineTotal)}</span>
                  </div>
                </div>
              );
            })}
            <Dash />
            {data.totalDiscount > 0 && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px" }}>
                  <span>Jami (chegirmasiz):</span>
                  <span>{fmt(data.subtotal)} so'm</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#c00" }}>
                  <span>Chegirma:</span>
                  <span>-{fmt(data.totalDiscount)} so'm</span>
                </div>
              </>
            )}
            <Dbl />
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "14px" }}>
              <span>JAMI:</span>
              <span>{fmt(data.total)} so'm</span>
            </div>
            <Dbl />
            {data.payType === "aralash" && data.splitPayment ? (
              <div style={{ fontSize: "9px", marginTop: "2px" }}>
                <div style={{ fontWeight: "bold", marginBottom: "1px" }}>To'lov:</div>
                {data.splitPayment.cash > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Naqd pul:</span><span>{fmt(data.splitPayment.cash)} so'm</span>
                  </div>
                )}
                {data.splitPayment.card > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Bank kartasi:</span><span>{fmt(data.splitPayment.card)} so'm</span>
                  </div>
                )}
                {data.splitPayment.debt > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#c00" }}>
                    <span>Qarz:</span><span>{fmt(data.splitPayment.debt)} so'm</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px" }}>
                <span>To'lov turi:</span>
                <span style={{ fontWeight: "bold" }}>{payLabel(data.payType)}</span>
              </div>
            )}
            <Dash />
            <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
              <QRCodeSVG value={qrData} size={72} level="M" />
            </div>
            <div style={{ textAlign: "center", fontSize: "8px", color: "#555" }}>Chekni skaner qiling</div>
            <Solid />
            <div style={{ textAlign: "center", fontSize: "9px", marginTop: "3px" }}>
              <div style={{ fontWeight: "bold" }}>✦ XARID UCHUN RAHMAT ✦</div>
              <div style={{ fontSize: "8px", color: "#777", marginTop: "2px" }}>
                Ushbu chek fiskal hujjat hisoblanadi
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 p-3 border-t border-gray-200">
          <Button onClick={handlePrint} className="flex-1 bg-blue-600 hover:bg-blue-700 text-sm gap-1.5">
            <Printer className="h-3.5 w-3.5" />
            Chop etish
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1 text-sm border-gray-300 text-gray-700">
            Yopish
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Split Payment Panel ─────────────────────────────────── */
function SplitPaymentPanel({
  total, customers, venueId, onConfirm, onCancel, qc,
}: {
  total: number;
  customers: { id: number; name: string; phone?: string | null }[];
  venueId: number;
  onConfirm: (split: SplitPayment, customer?: { id?: number; name: string; phone?: string }) => void;
  onCancel: () => void;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [cashAmt, setCashAmt] = useState(String(Math.round(total)));
  const [cardAmt, setCardAmt] = useState("0");
  const [debtAmt, setDebtAmt] = useState("0");
  const [debtMode, setDebtMode] = useState<"existing" | "new">("existing");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const createCustomer = useCreateCustomer();
  const { toast } = useToast();

  const cash = parseFloat(cashAmt) || 0;
  const card = parseFloat(cardAmt) || 0;
  const debt = parseFloat(debtAmt) || 0;
  const entered = cash + card + debt;
  const remaining = Math.round(total - entered);
  const hasDebt = debt > 0;

  const autoBalance = (field: "cash" | "card" | "debt", val: number) => {
    const others = { cash, card, debt, [field]: val };
    const sumOthers = Object.entries(others).filter(([k]) => k !== field).reduce((s, [, v]) => s + v, 0);
    return Math.max(0, total - sumOthers);
  };

  const handleConfirm = async () => {
    if (Math.abs(cash + card + debt - total) > 1) {
      toast({ title: `Summa to'g'ri kelmayapti. Farq: ${fmt(Math.abs(remaining))} so'm`, variant: "destructive" });
      return;
    }
    if (hasDebt) {
      let customer: { id?: number; name: string; phone?: string } | undefined;
      if (debtMode === "existing") {
        if (!selectedCustomerId) { toast({ title: "Mijozni tanlang", variant: "destructive" }); return; }
        const c = customers.find((x) => String(x.id) === selectedCustomerId);
        customer = { id: c?.id, name: c?.name ?? "", phone: c?.phone ?? "" };
      } else {
        if (!newName.trim()) { toast({ title: "Ism kiriting", variant: "destructive" }); return; }
        try {
          const newC = await new Promise<{ id: number; name: string; phone?: string | null }>((resolve, reject) => {
            createCustomer.mutate(
              { venueId, data: { name: newName.trim(), phone: newPhone.trim() || undefined } },
              { onSuccess: resolve, onError: reject }
            );
          });
          qc.invalidateQueries({ queryKey: getListCustomersQueryKey(venueId) });
          customer = { id: newC.id, name: newC.name, phone: newC.phone ?? "" };
        } catch { toast({ title: "Xatolik", variant: "destructive" }); return; }
      }
      onConfirm({ cash, card, debt }, customer);
    } else {
      onConfirm({ cash, card, debt });
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={onCancel}>
      <div
        className="bg-zinc-200 dark:bg-zinc-900 border-t border-border rounded-t-2xl shadow-2xl p-5 max-w-lg mx-auto w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slideUp 0.25s ease-out" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shuffle className="h-5 w-5 text-purple-400" />
            <h3 className="text-lg font-bold text-foreground">Aralash To'lov</h3>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="bg-muted rounded-xl p-3 flex justify-between items-center mb-4">
          <span className="text-muted-foreground text-sm">To'lov summasi:</span>
          <span className="text-xl font-bold text-foreground">{fmt(total)} so'm</span>
        </div>
        <div className="space-y-3 mb-4">
          {[
            { key: "cash" as const, label: "💵 Naqd pul", color: "text-green-400", val: cashAmt, set: setCashAmt },
            { key: "card" as const, label: "💳 Bank kartasi", color: "text-blue-400", val: cardAmt, set: setCardAmt },
            { key: "debt" as const, label: "📝 Qarzga", color: "text-red-400", val: debtAmt, set: setDebtAmt },
          ].map(({ key, label, color, val, set }) => (
            <div key={key} className="flex items-center gap-3">
              <span className={`text-sm font-medium w-28 shrink-0 ${color}`}>{label}</span>
              <Input type="number" value={val} onChange={(e) => set(e.target.value)} className="bg-input border-border text-foreground" placeholder="0" />
              <button onClick={() => set(String(Math.round(autoBalance(key, 0))))} className="text-xs text-muted-foreground hover:text-zinc-300 shrink-0 whitespace-nowrap">
                Avto
              </button>
            </div>
          ))}
        </div>
        <div className={`flex justify-between text-sm p-2 rounded-lg mb-4 ${Math.abs(remaining) < 1 ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"}`}>
          <span>{Math.abs(remaining) < 1 ? "✓ Balans to'g'ri" : "Farq:"}</span>
          {Math.abs(remaining) >= 1 && <span>{remaining > 0 ? `+${fmt(remaining)}` : fmt(remaining)} so'm</span>}
        </div>
        {hasDebt && (
          <div className="border border-red-900/50 rounded-xl p-3 mb-4 space-y-3">
            <p className="text-sm text-red-400 font-medium">Qarz uchun mijoz tanlang ({fmt(debt)} so'm)</p>
            <div className="flex gap-2">
              <button onClick={() => setDebtMode("existing")} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${debtMode === "existing" ? "bg-blue-600 text-foreground" : "bg-muted text-muted-foreground"}`}>Mavjud</button>
              <button onClick={() => setDebtMode("new")} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1 ${debtMode === "new" ? "bg-blue-600 text-foreground" : "bg-muted text-muted-foreground"}`}><UserPlus className="h-3 w-3" />Yangi</button>
            </div>
            {debtMode === "existing" ? (
              <select value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)} className="w-full bg-input border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">— Mijozni tanlang —</option>
                {customers.map((c) => <option key={c.id} value={String(c.id)}>{c.name} {c.phone ? `(${c.phone})` : ""}</option>)}
              </select>
            ) : (
              <>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ism *" className="bg-input border-border text-foreground" />
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Telefon" className="bg-input border-border text-foreground" />
              </>
            )}
          </div>
        )}
        <Button
          onClick={handleConfirm}
          disabled={Math.abs(cash + card + debt - total) > 1 || createCustomer.isPending}
          className="w-full bg-purple-600 hover:bg-purple-700 font-semibold"
        >
          {createCustomer.isPending ? "Saqlanmoqda..." : "To'lovni amalga oshirish"}
        </Button>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  );
}

/* ── Debt Panel ──────────────────────────────────────────── */
function DebtPanel({
  total, customers, venueId, onConfirm, onCancel, qc,
}: {
  total: number;
  customers: { id: number; name: string; phone?: string | null }[];
  venueId: number;
  onConfirm: (info: { customerId?: number; customerName: string; phone: string; deadline: string }) => void;
  onCancel: () => void;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [deadline, setDeadline] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const createCustomer = useCreateCustomer();
  const { toast } = useToast();
  const selectedCustomer = customers.find((c) => String(c.id) === selectedId);

  const handleConfirm = async () => {
    if (mode === "existing") {
      if (!selectedId) { toast({ title: "Mijozni tanlang", variant: "destructive" }); return; }
      onConfirm({ customerId: Number(selectedId), customerName: selectedCustomer?.name ?? "", phone: selectedCustomer?.phone ?? "", deadline });
    } else {
      if (!name.trim()) { toast({ title: "Ism kiriting", variant: "destructive" }); return; }
      createCustomer.mutate(
        { venueId, data: { name: name.trim(), phone: phone.trim() || undefined } },
        {
          onSuccess: (c) => {
            qc.invalidateQueries({ queryKey: getListCustomersQueryKey(venueId) });
            onConfirm({ customerId: c.id, customerName: c.name, phone: c.phone ?? "", deadline });
          },
          onError: () => toast({ title: "Xatolik", variant: "destructive" }),
        }
      );
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={onCancel}>
      <div
        className="bg-zinc-200 dark:bg-zinc-900 border-t border-border rounded-t-2xl shadow-2xl p-5 max-w-lg mx-auto w-full"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slideUp 0.25s ease-out" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2"><ChevronUp className="h-5 w-5 text-red-400" />Qarzga Sotuv</h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="bg-muted rounded-xl p-3 flex justify-between mb-4">
          <span className="text-muted-foreground text-sm">Qarz summasi:</span>
          <span className="text-xl font-bold text-red-400">{fmt(total)} so'm</span>
        </div>
        <div className="flex gap-2 mb-4">
          <button onClick={() => setMode("existing")} className={`flex-1 py-2 rounded-lg text-sm font-medium ${mode === "existing" ? "bg-blue-600 text-foreground" : "bg-muted text-muted-foreground"}`}>Mavjud mijoz</button>
          <button onClick={() => setMode("new")} className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1 ${mode === "new" ? "bg-blue-600 text-foreground" : "bg-muted text-muted-foreground"}`}><UserPlus className="h-4 w-4" />Yangi</button>
        </div>
        <div className="space-y-3">
          {mode === "existing" ? (
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="w-full bg-input border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="">— Mijozni tanlang —</option>
              {customers.map((c) => <option key={c.id} value={String(c.id)}>{c.name} {c.phone ? `(${c.phone})` : ""}</option>)}
            </select>
          ) : (
            <>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ism *" className="bg-input border-border text-foreground" />
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998901234567" className="bg-input border-border text-foreground" />
            </>
          )}
          <div>
            <Label className="text-muted-foreground text-sm">Qarz muddati</Label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="bg-input border-border text-foreground mt-1"
            />
          </div>
          <Button onClick={handleConfirm} disabled={createCustomer.isPending} className="w-full bg-red-600 hover:bg-red-700 font-semibold">
            {createCustomer.isPending ? "Saqlanmoqda..." : "Qarzga Sotish"}
          </Button>
        </div>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  );
}

/* ── Main POS Page ────────────────────────────────────────── */
type RoomBooking = {
  id: number; venueId: number; roomId: number; tableId?: number | null;
  customerName: string; customerPhone?: string | null;
  startAt: string; endAt: string; notes?: string | null;
  status: "active" | "completed" | "cancelled"; createdAt: string;
};

export default function AdminPos() {
  const { user, token } = useAuth();
  const venueId = user?.venueId ?? 0;
  const { data: products } = useListProducts(venueId, { query: { enabled: !!venueId, queryKey: getListProductsQueryKey(venueId) } });
  const { data: customers } = useListCustomers(venueId, { query: { enabled: !!venueId, queryKey: getListCustomersQueryKey(venueId) } });

  // Omborxonadagi tayyor (direct) mahsulotlar
  const { data: directItems } = useQuery<any[]>({
    queryKey: ["inventory-direct", venueId],
    enabled: !!venueId && !!token,
    refetchInterval: 10_000,
    queryFn: async () => {
      const r = await fetch(`/api/venues/${venueId}/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return [];
      const all = await r.json();
      return all.filter((i: any) => i.itemType === "direct" && i.quantity > 0);
    },
  });
  const { data: rooms } = useListRooms(venueId, { query: { enabled: !!venueId, queryKey: getListRoomsQueryKey(venueId), refetchInterval: 5_000 } });
  const { data: tables } = useListTables(venueId, { query: { enabled: !!venueId, queryKey: getListTablesQueryKey(venueId), refetchInterval: 5_000 } });
  const { data: openOrders, refetch: refetchOpenOrders } = useListOpenOrders(venueId, {
    query: { enabled: !!venueId, refetchInterval: 5_000, queryKey: getListOpenOrdersQueryKey(venueId) },
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
  const createOrder = useCreateOrder();
  const payOpenOrder = usePayOpenOrder();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Barchasi");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeOpenOrderId, setActiveOpenOrderId] = useState<number | null>(null);
  const [showDebtPanel, setShowDebtPanel] = useState(false);
  const [showSplitPanel, setShowSplitPanel] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showTablePanel, setShowTablePanel] = useState(false);
  const [tableSelection, setTableSelection] = useState<TableSelection>({ roomId: null, roomName: null, tableId: null, tableNumber: null });
  const searchRef = useRef<HTMLInputElement>(null);

  const availableProducts = useMemo(() => {
    return ((products ?? []).filter((p) => p.isAvailable)) as any[];
  }, [products]);
  const suggestions = search.length > 0 ? availableProducts.filter((p: any) => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8) : [];

  const categories = useMemo(() => {
    const cats = Array.from(new Set(availableProducts.filter((p) => p.category).map((p) => p.category!)));
    return ["Barchasi", ...cats];
  }, [availableProducts]);

  const filteredProducts = useMemo(() =>
    availableProducts.filter((p) => {
      const matchCat = activeCategory === "Barchasi" || p.category === activeCategory;
      const matchSearch = !search.trim() || p.name.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    }),
    [availableProducts, activeCategory, search]
  );

  const subtotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const totalDiscount = cart.reduce((s, i) => s + (i.product.price * i.quantity * i.discount) / 100, 0);
  const total = subtotal - totalDiscount;
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  /* Load open order items into cart */
  const loadOpenOrder = (order: ActiveOrder) => {
    if (!products) return;
    const newCart: CartItem[] = order.items
      .map((item) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product) return null;
        return {
          product,
          quantity: item.quantity,
          discount: item.discountPct ?? 0,
          unit: "dona",
        };
      })
      .filter(Boolean) as CartItem[];
    setCart(newCart);
    setActiveOpenOrderId(order.id);
    toast({ title: `Stol #${order.tableNumber ?? ""} buyurtmasi yuklandi` });
  };

  /* When a table is selected, check if it has an open order and auto-load */
  const handleTableSelect = (sel: TableSelection) => {
    if (sel.tableId && bookings) {
      const now = new Date();
      const booked = bookings.find((b) => {
        if (b.status !== "active") return false;
        if (b.tableId !== sel.tableId) return false;
        return new Date(b.startAt) <= now && now <= new Date(b.endAt);
      });
      if (booked && !openOrders?.find((o) => o.tableId === sel.tableId)) {
        toast({ title: `Bu stol bron qilingan (${booked.customerName})`, variant: "destructive" });
        return;
      }
    }
    setTableSelection(sel);
    setShowTablePanel(false);
    if (sel.tableId && openOrders) {
      const existingOrder = openOrders.find((o) => o.tableId === sel.tableId);
      if (existingOrder && products) {
        loadOpenOrder(existingOrder);
      }
    }
  };

  const addProduct = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) return prev.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1, discount: 0, unit: "dona" }];
    });
    setSearch(""); setShowSuggestions(false);
    searchRef.current?.focus();
  };

  const updateItem = (productId: number, field: Partial<Omit<CartItem, "product">>) =>
    setCart((prev) => prev.map((i) => (i.product.id === productId ? { ...i, ...field } : i)));

  const removeItem = (productId: number) => setCart((prev) => prev.filter((i) => i.product.id !== productId));

  const clearCart = () => {
    setCart([]);
    setActiveOpenOrderId(null);
    setTableSelection({ roomId: null, roomName: null, tableId: null, tableNumber: null });
    qc.invalidateQueries({ queryKey: getListRoomsQueryKey(venueId) });
    qc.invalidateQueries({ queryKey: getListOpenOrdersQueryKey(venueId) });
  };

  const placeOrder = (opts: {
    customerId?: number;
    customerName?: string;
    payType: PayType;
    apiPayType: "cash" | "card" | "transfer" | "debt";
    splitPayment?: SplitPayment;
    notes?: string;
  }) => {
    const apiSplit = opts.splitPayment && opts.payType === "aralash"
      ? {
          ...(opts.splitPayment.cash > 0 && { cash: opts.splitPayment.cash }),
          ...(opts.splitPayment.card > 0 && { card: opts.splitPayment.card }),
          ...(opts.splitPayment.debt > 0 && { debt: opts.splitPayment.debt }),
        }
      : undefined;

    const onSuccess = (order: { id: number }) => {
      setReceipt({
        orderId: order.id,
        venueName: user?.venueName ?? "Kafe",
        items: [...cart],
        subtotal, totalDiscount, total,
        payType: opts.payType,
        splitPayment: opts.splitPayment,
        customerName: opts.customerName,
        tableNumber: tableSelection.tableNumber ?? undefined,
        roomName: tableSelection.roomName ?? undefined,
        date: new Date(),
      });
      clearCart();
      setShowDebtPanel(false);
      setShowSplitPanel(false);
    };

    /* If there's an active open order, close it via the open orders endpoint */
    if (activeOpenOrderId) {
      payOpenOrder.mutate(
        {
          venueId,
          orderId: activeOpenOrderId,
          data: {
            paymentType: opts.apiPayType,
            paymentSplit: apiSplit,
            customerId: opts.customerId ?? null,
            notes: opts.notes,
            items: cart.map((i) => ({
              productId: i.product.id,
              quantity: i.quantity,
              discountPct: i.discount,
            })),
          },
        },
        {
          onSuccess,
          onError: () => toast({ title: "Xatolik yuz berdi", variant: "destructive" }),
        }
      );
      return;
    }

    /* Otherwise create a new order */
    createOrder.mutate(
      {
        venueId,
        data: {
          customerId: opts.customerId ?? null,
          roomId: tableSelection.roomId ?? null,
          tableId: tableSelection.tableId ?? null,
          tableNumber: tableSelection.tableNumber ?? null,
          roomName: tableSelection.roomName ?? null,
          items: cart.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
          paymentType: opts.apiPayType,
          paymentSplit: apiSplit,
          notes: opts.notes,
        },
      },
      {
        onSuccess,
        onError: () => toast({ title: "Xatolik yuz berdi", variant: "destructive" }),
      }
    );
  };

  const handleDebtConfirm = (info: { customerId?: number; customerName: string; phone: string; deadline: string }) => {
    placeOrder({
      customerId: info.customerId,
      customerName: info.customerName,
      payType: "qarz",
      apiPayType: "debt",
      notes: `Qarz muddati: ${info.deadline}${info.phone ? `, Tel: ${info.phone}` : ""}`,
    });
  };

  const handleSplitConfirm = (split: SplitPayment, customer?: { id?: number; name: string; phone?: string }) => {
    // If any amount is marked as debt, treat the whole sale as "debt" so it is
    // recorded in the debts ledger (the backend stores the debt portion).
    const apiType =
      split.debt > 0 ? "debt" : split.card >= split.cash ? "card" : "cash";
    const notesParts: string[] = [];
    if (customer) notesParts.push(`Mijoz: ${customer.name}${customer.phone ? ` (${customer.phone})` : ""}`);
    placeOrder({
      customerId: customer?.id,
      customerName: customer?.name,
      payType: "aralash",
      apiPayType: apiType,
      splitPayment: split,
      notes: notesParts.join(", ") || undefined,
    });
  };

  const isPaying = createOrder.isPending || payOpenOrder.isPending;
  const [mobileTab, setMobileTab] = useState<"cart" | "payment">("cart");

  return (
    <div className="flex flex-col h-[calc(100svh-56px)] md:h-[calc(100vh-0px)] gap-0 overflow-hidden -m-4 md:-m-6 lg:-m-8">
      {/* Top bar */}
      <div className="bg-card border-b border-border px-3 md:px-4 py-2.5 flex items-center gap-2 md:gap-3">
        <ShoppingBag className="h-5 w-5 text-blue-500 shrink-0" />
        <h1 className="text-foreground font-bold text-base md:text-lg">Kassa POS</h1>
        {/* Active open order badge */}
        {activeOpenOrderId && (
          <span className="text-xs bg-red-900/50 text-red-300 border border-red-700 px-2 py-0.5 rounded-full font-medium">
            Ochiq buyurtma #{activeOpenOrderId}
          </span>
        )}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShowTablePanel(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setShowTablePanel(true);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ml-2 cursor-pointer select-none ${
            tableSelection.tableNumber
              ? "bg-blue-600/20 text-blue-400 border border-blue-600/40 hover:bg-blue-600/30"
              : "bg-muted text-muted-foreground border border-border hover:bg-zinc-700 hover:text-zinc-300"
          }`}
        >
          <Table2 className="h-3.5 w-3.5" />
          {tableSelection.tableNumber
            ? `${tableSelection.roomName ? `${tableSelection.roomName} · ` : ""}Stol #${tableSelection.tableNumber}`
            : "Stol tanlash"}
          {tableSelection.tableNumber && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setTableSelection({ roomId: null, roomName: null, tableId: null, tableNumber: null });
                setActiveOpenOrderId(null);
              }}
              className="ml-1 text-muted-foreground hover:text-foreground"
              aria-label="Stol tanlovini tozalash"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <span className="text-muted-foreground text-sm ml-auto">{user?.venueName}</span>
      </div>

      {/* Mobile tabs */}
      <div className="flex md:hidden border-b border-border bg-card shrink-0">
        <button
          onClick={() => setMobileTab("cart")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${mobileTab === "cart" ? "text-blue-400 border-b-2 border-blue-500" : "text-muted-foreground"}`}
        >
          <ShoppingBag className="h-4 w-4" />
          Savat {cart.length > 0 && <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{cart.reduce((s, i) => s + i.quantity, 0)}</span>}
        </button>
        <button
          onClick={() => setMobileTab("payment")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${mobileTab === "payment" ? "text-green-400 border-b-2 border-green-500" : "text-muted-foreground"}`}
        >
          💵 To'lov
          {cart.length > 0 && <span className="text-xs font-bold text-foreground bg-muted px-2 py-0.5 rounded-full">{fmt(total)}</span>}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Search + Cart */}
        <div
          className={`flex flex-col flex-1 overflow-hidden bg-zinc-200 dark:bg-zinc-900 ${
            mobileTab === "payment" ? "hidden md:flex" : "flex"
          }`}
        >
          {/* Search */}
          <div className="p-4 border-b border-border relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Mahsulot nomini yozing..."
                className="pl-9 bg-input border-border text-foreground placeholder-zinc-500 text-base"
                autoComplete="off"
              />
              {search && (
                <button onClick={() => { setSearch(""); setShowSuggestions(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-4 right-4 top-full mt-1 z-30 bg-input border border-border rounded-xl shadow-2xl overflow-hidden">
                {suggestions.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors text-left"
                  >
                    <div>
                      <p className="text-foreground font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.category}</p>
                    </div>
                    <span className="text-blue-400 font-semibold text-sm">{fmt(p.price)} so'm</span>
                  </button>
                ))}
              </div>
            )}
            {showSuggestions && search.length > 0 && suggestions.length === 0 && (
              <div className="absolute left-4 right-4 top-full mt-1 z-30 bg-input border border-border rounded-xl shadow-xl px-4 py-3">
                <p className="text-muted-foreground text-sm">"{search}" topilmadi</p>
              </div>
            )}
          </div>

          {/* Category tabs + Product grid + Cart */}
          <div className="flex-1 overflow-y-auto" onClick={() => setShowSuggestions(false)}>
            {/* Category tabs */}
            {categories.length > 1 && (
              <div className="flex gap-2 px-4 pt-3 pb-2 overflow-x-auto shrink-0 scrollbar-none">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => { setActiveCategory(cat); setSearch(""); }}
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

            {/* Product grid */}
            <div className="px-4 pb-3">
              {filteredProducts.length === 0 && search.length > 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">"<b>{search}</b>" bo'yicha mahsulot topilmadi</p>
              ) : filteredProducts.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {filteredProducts.map((product) => {
                    const inCart = cart.find((i) => i.product.id === product.id);
                    const unit = (product as any).unit || "";
                    const stock = (product as any).stock as number | null;
                    return (
                      <button
                        key={product.id}
                        onClick={() => addProduct(product)}
                        className={`relative flex flex-col items-start p-2.5 rounded-xl border text-left transition-all active:scale-[0.97] ${
                          inCart
                            ? "border-blue-500/50 bg-blue-600/10"
                            : "border-border bg-card hover:border-border/80 hover:bg-accent/50"
                        }`}
                      >
                        {inCart && (
                          <span className="absolute top-2 right-2 w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none z-10">
                            {inCart.quantity}
                          </span>
                        )}
                        {(product as any).imageUrl ? (
                          <img
                            src={(product as any).imageUrl}
                            alt={product.name}
                            className="w-full aspect-square object-cover rounded-lg mb-2"
                          />
                        ) : (
                          <div className="w-full aspect-square rounded-lg bg-zinc-300 dark:bg-zinc-800 flex items-center justify-center mb-2">
                            <span className="text-2xl opacity-40">{(product as any)._isDirect ? "📦" : "🍽️"}</span>
                          </div>
                        )}
                        <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">{product.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {unit && <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded font-medium">{unit}</span>}
                          {stock != null && (
                            <span className={`text-[10px] ${stock <= 5 ? "text-red-400" : "text-muted-foreground"}`}>{stock} ta</span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-blue-400 mt-1">{fmt(product.price)} so'm</p>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* Cart items */}
            {cart.length > 0 && (
              <div className="px-4 pb-4 border-t border-border pt-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <ShoppingBag className="h-4 w-4" />
                    Savat ({cartCount} ta)
                  </h3>
                  <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-300">Tozalash</button>
                </div>
                <div className="space-y-2">
                  {cart.map((item, idx) => {
                    const lineTotal = itemTotal(item);
                    return (
                      <div key={item.product.id} className="bg-card border border-border rounded-xl p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-start gap-2">
                            {(item.product as any).imageUrl ? (
                              <img src={(item.product as any).imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 mt-0.5" />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-zinc-300 dark:bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                                <span className="text-lg opacity-40">🍽️</span>
                              </div>
                            )}
                            <div>
                              <span className="text-xs text-muted-foreground mr-1">{idx + 1}.</span>
                              <span className="text-foreground font-semibold text-sm">{item.product.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{item.product.category}</span>
                            </div>
                          </div>
                          <button onClick={() => removeItem(item.product.id)} className="text-red-500 hover:bg-red-500/10 rounded p-1 ml-2">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center bg-muted rounded-lg overflow-hidden">
                            <button
                              onClick={() => updateItem(item.product.id, { quantity: Math.max(1, item.quantity - 1) })}
                              className="px-2 py-1.5 text-foreground hover:bg-zinc-300 dark:hover:bg-zinc-700"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <input type="number" value={item.quantity} onChange={(e) => updateItem(item.product.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} className="w-10 text-center bg-transparent text-foreground text-sm font-semibold focus:outline-none" />
                            <button
                              onClick={() => updateItem(item.product.id, { quantity: item.quantity + 1 })}
                              className="px-2 py-1.5 text-foreground hover:bg-zinc-300 dark:hover:bg-zinc-700"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <select
                            value={item.unit}
                            onChange={(e) => updateItem(item.product.id, { unit: e.target.value as Unit })}
                            className="bg-input border border-border text-foreground text-sm rounded-lg px-2 py-1.5 focus:outline-none"
                          >
                            {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                          </select>
                          <div className="flex items-center gap-1 bg-muted rounded-lg px-2 py-1.5">
                            <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                            <input type="number" value={item.discount} min={0} max={100} onChange={(e) => updateItem(item.product.id, { discount: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })} className="w-10 text-center bg-transparent text-foreground text-sm focus:outline-none" placeholder="0" />
                            <span className="text-muted-foreground text-xs">chegirma</span>
                          </div>
                          <div className="ml-auto text-right">
                            {item.discount > 0 && <p className="text-xs text-muted-foreground line-through">{fmt(item.product.price * item.quantity)} so'm</p>}
                            <p className="text-foreground font-bold">{fmt(lineTotal)} so'm</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Summary + Payment + Open Orders */}
        <div className={`flex flex-col bg-card border-l border-border overflow-hidden w-full md:w-72 md:flex ${mobileTab === "cart" ? "hidden md:flex" : "flex"}`}>
          {/* Totals */}
          <div className="p-4 border-b border-border space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Mahsulotlar:</span>
              <span className="text-foreground">{cart.reduce((s, i) => s + i.quantity, 0)} ta</span>
            </div>
            {totalDiscount > 0 && (
              <>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Chegirmasiz:</span><span className="text-zinc-300">{fmt(subtotal)} so'm</span>
                </div>
                <div className="flex justify-between text-sm text-green-500">
                  <span>Chegirma:</span><span>−{fmt(totalDiscount)} so'm</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-xl font-bold border-t border-border pt-2 mt-1">
              <span className="text-foreground">Jami:</span>
              <span className="text-foreground">{fmt(total)} so'm</span>
            </div>
          </div>

          {/* Payment buttons */}
          <div className="p-4 space-y-2.5 border-b border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">To'lov turi</p>
            <button
              onClick={() => { if (!cart.length) return; placeOrder({ payType: "naxt", apiPayType: "cash" }); }}
              disabled={!cart.length || isPaying}
              className={`w-full py-3 rounded-xl font-bold text-base transition-all ${cart.length ? "bg-green-600 hover:bg-green-500 text-foreground" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
            >
              💵 Naqd Pul
            </button>
            <button
              onClick={() => { if (!cart.length) return; placeOrder({ payType: "karta", apiPayType: "card" }); }}
              disabled={!cart.length || isPaying}
              className={`w-full py-3 rounded-xl font-bold text-base transition-all ${
                cart.length
                  ? "bg-zinc-300 hover:bg-zinc-400 text-zinc-900 dark:bg-blue-600 dark:hover:bg-blue-500 dark:text-foreground"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              💳 Karta
            </button>
            <button
              onClick={() => { if (!cart.length) return; setShowDebtPanel(true); }}
              disabled={!cart.length || isPaying}
              className={`w-full py-3 rounded-xl font-bold text-base transition-all ${cart.length ? "bg-red-600 hover:bg-red-500 text-foreground" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
            >
              📝 Qarzga
            </button>
            <button
              onClick={() => { if (!cart.length) return; setShowSplitPanel(true); }}
              disabled={!cart.length || isPaying}
              className={`w-full py-3 rounded-xl font-bold text-base transition-all ${cart.length ? "bg-purple-600 hover:bg-purple-500 text-foreground" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
            >
              🔀 Aralash
            </button>
            {cart.length > 0 && (
              <button onClick={clearCart} className="w-full py-2 text-sm text-muted-foreground hover:text-red-400 transition-colors">
                Savatni tozalash
              </button>
            )}
          </div>

          {/* Open Orders Section — "Ochiq Buyurtmalar" */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ochiq Buyurtmalar</span>
                {(openOrders ?? []).length > 0 && (
                  <span className="bg-red-600 text-foreground text-xs rounded-full px-1.5 py-0.5 font-bold leading-none">
                    {(openOrders ?? []).length}
                  </span>
                )}
              </div>
              <button
                onClick={() => refetchOpenOrders()}
                className="text-xs text-muted-foreground hover:text-zinc-300 transition-colors"
              >
                ↺
              </button>
            </div>

            <div className="px-3 pb-3 space-y-2 mt-1">
              {(openOrders ?? []).length === 0 ? (
                <p className="text-xs text-zinc-700 text-center py-3">Ochiq buyurtma yo'q</p>
              ) : (
                (openOrders ?? []).map((order) => (
                  <div
                    key={order.id}
                    className={`rounded-xl border p-3 transition-all ${
                      activeOpenOrderId === order.id
                        ? "border-blue-500 bg-blue-600/10"
                        : "border-border bg-zinc-900 hover:border-border"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-semibold text-foreground">
                            Stol #{order.tableNumber ?? "?"}
                          </span>
                        </div>
                        {order.roomName && (
                          <p className="text-xs text-muted-foreground mt-0.5">{order.roomName}</p>
                        )}
                        {order.waiterName && (
                          <p className="text-xs text-muted-foreground">{order.waiterName}</p>
                        )}
                      </div>
                      <span className="text-sm font-bold text-foreground whitespace-nowrap">
                        {fmt(order.totalAmount)} so'm
                      </span>
                    </div>

                    <div className="text-xs text-muted-foreground mb-2">
                      {order.items.length} mahsulot
                      {order.items.slice(0, 2).map((i) => ` · ${i.productName} ×${i.quantity}`).join("")}
                      {order.items.length > 2 && ` +${order.items.length - 2}`}
                    </div>

                    <button
                      onClick={() => loadOpenOrder(order)}
                      disabled={!products}
                      className={`w-full py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        activeOpenOrderId === order.id
                          ? "bg-blue-600 text-white hover:bg-blue-500"
                          : "bg-zinc-800 text-foreground hover:bg-zinc-700"
                      }`}
                    >
                      {activeOpenOrderId === order.id ? "✓ Yuklandi" : "Yuklash"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {showDebtPanel && <DebtPanel total={total} customers={customers ?? []} venueId={venueId} onConfirm={handleDebtConfirm} onCancel={() => setShowDebtPanel(false)} qc={qc} />}
      {showSplitPanel && <SplitPaymentPanel total={total} customers={customers ?? []} venueId={venueId} onConfirm={handleSplitConfirm} onCancel={() => setShowSplitPanel(false)} qc={qc} />}
      {receipt && <ThermalReceipt data={receipt} onClose={() => setReceipt(null)} />}
      {showTablePanel && (
        <TableSelectionPanel
          rooms={rooms ?? []}
          tables={tables ?? []}
          products={products ?? []}
          openOrders={openOrders ?? []}
          bookings={bookings ?? []}
          current={tableSelection}
          onSelect={handleTableSelect}
          onCancel={() => setShowTablePanel(false)}
        />
      )}
    </div>
  );
}

/* ── Table Selection Panel ────────────────────────────────── */
function TableSelectionPanel({
  rooms, tables, products, openOrders, bookings, current, onSelect, onCancel,
}: {
  rooms: Room[];
  tables: Table[];
  products: Product[];
  openOrders: ActiveOrder[];
  bookings: RoomBooking[];
  current: TableSelection;
  onSelect: (sel: TableSelection) => void;
  onCancel: () => void;
}) {
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(current.roomId);

  const now = new Date();
  const activeBookings = useMemo(() =>
    bookings.filter((b) => {
      if (b.status !== "active") return false;
      return new Date(b.startAt) <= now && now <= new Date(b.endAt);
    }),
    [bookings],
  );
  const bookingTableIds = useMemo(() => new Set(activeBookings.map((b) => b.tableId).filter((x): x is number => !!x)), [activeBookings]);
  const bookingRoomIds = useMemo(() => new Set(activeBookings.map((b) => b.roomId)), [activeBookings]);
  const bookingByRoom = useMemo(() => {
    const m = new Map<number, RoomBooking[]>();
    for (const b of activeBookings) {
      const arr = m.get(b.roomId) ?? [];
      arr.push(b);
      m.set(b.roomId, arr);
    }
    return m;
  }, [activeBookings]);

  const roomTables = useMemo(() => {
    const orderByTable = new Map<number, ActiveOrder>();
    for (const o of openOrders) {
      if (o.tableId != null) orderByTable.set(o.tableId, o);
    }
    return rooms
      .filter((r) => r.isActive)
      .map((room) => ({
        room,
        tables: tables
          .filter((t) => t.roomId === room.id && t.isActive)
          .map((t) => {
            const order = orderByTable.get(t.id);
            const isBooked = bookingTableIds.has(t.id) || (!t.roomId ? false : bookingRoomIds.has(t.roomId));
            const roomBookings = bookingByRoom.get(room.id) ?? [];
            return { ...t, order: order ?? null, isBooked, bookings: roomBookings };
          }),
      }));
  }, [rooms, tables, openOrders, bookingTableIds, bookingRoomIds, bookingByRoom]);

  const allFiltered = selectedRoomId
    ? roomTables.find((rt) => rt.room.id === selectedRoomId)?.tables ?? []
    : roomTables.flatMap((rt) => rt.tables);

  const occupiedCount = roomTables.reduce((s, rt) => s + rt.tables.filter((t) => t.order || t.isBooked).length, 0);
  const freeCount = roomTables.reduce((s, rt) => s + rt.tables.filter((t) => !t.order && !t.isBooked).length, 0);

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={onCancel}>
      <div
        className="bg-zinc-900 border-t border-border rounded-t-2xl shadow-2xl max-w-4xl mx-auto w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slideUp 0.25s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Table2 className="h-5 w-5 text-blue-400" />
            <h3 className="text-lg font-bold text-foreground">Xona va Stol tanlash</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />{freeCount} bo'sh</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />{occupiedCount} band</span>
            </div>
            <button onClick={onCancel} className="text-muted-foreground hover:text-foreground p-1"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Room sidebar */}
          {roomTables.length > 0 && (
            <div className="w-44 lg:w-52 border-r border-border overflow-y-auto py-2 shrink-0">
              <button
                onClick={() => setSelectedRoomId(null)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-left ${selectedRoomId === null ? "bg-blue-600/10 text-blue-400 font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
              >
                <Table2 className="h-4 w-4 shrink-0" />Barcha stollar
              </button>
    {roomTables.map(({ room, tables: rt }) => {
      const busy = rt.filter((t) => t.order || t.isBooked).length;
      return (
        <button
          key={room.id}
          onClick={() => setSelectedRoomId(room.id)}
          className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-left ${selectedRoomId === room.id ? "bg-blue-600/10 text-blue-400 font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
        >
          <DoorOpen className="h-4 w-4 shrink-0" />
          <span className="truncate flex-1">{room.name}</span>
          <span className="text-xs text-muted-foreground/70">{busy > 0 ? `${busy}/${rt.length}` : String(rt.length)}</span>
        </button>
      );
    })}
            </div>
          )}

          {/* Table grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {allFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <Table2 className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">Stol topilmadi</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {allFiltered.sort((a, b) => a.number - b.number).map((table) => {
                  const isSelected = current.tableId === table.id;
                  const isOccupied = !!table.order || table.isBooked;
                  const order = table.order;
                  const roomName = rooms.find((r) => r.id === table.roomId)?.name ?? null;
                  const tableBookings = table.isBooked ? (table as any).bookings ?? [] : [];
                  return (
                    <button
                      key={table.id}
                      onClick={() => onSelect({ roomId: table.roomId ?? null, roomName, tableId: table.id, tableNumber: table.number })}
                      className={`relative flex flex-col items-start p-3 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? "border-blue-500 bg-blue-600/20"
                          : isOccupied
                          ? "border-red-600/60 bg-red-950/30 hover:border-red-500"
                          : "border-border bg-zinc-800 hover:border-blue-600/50 hover:bg-zinc-700"
                      }`}
                    >
                      {/* Top row: table number + status dot */}
                      <div className="flex items-center gap-2 w-full">
                        <span className={`text-lg font-bold ${isOccupied ? "text-red-200" : "text-white"}`}>#{table.number}</span>
                        <div className={`ml-auto w-2.5 h-2.5 rounded-full ${isOccupied ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`} />
                      </div>

                      {table.name && <span className="text-xs text-muted-foreground mt-0.5">{table.name}</span>}

                      {/* Order details for occupied tables */}
                      {order && (
                        <div className="mt-2 w-full space-y-1">
                          <div className="text-xs text-red-400 font-medium flex items-center gap-1">
                            <ClipboardList className="h-3 w-3" />
                            Buyurtma
                          </div>
                          <div className="space-y-0.5">
                            {order.items.slice(0, 4).map((item) => (
                              <div key={item.id} className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground truncate mr-1">
                                  {item.productName}
                                </span>
                                <span className="text-foreground shrink-0">×{item.quantity}</span>
                              </div>
                            ))}
                            {order.items.length > 4 && (
                              <p className="text-xs text-muted-foreground">+ {order.items.length - 4} ta mahsulot</p>
                            )}
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-red-900/40 mt-1">
                            <span className="text-xs text-muted-foreground">Jami:</span>
                            <span className="text-xs font-bold text-red-300">
                              {new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(order.totalAmount)} so'm
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Booking info for tables with booking but no order */}
                      {!order && tableBookings.length > 0 && (
                        <div className="mt-2 w-full space-y-1">
                          <div className="text-xs text-yellow-400 font-medium flex items-center gap-1">
                            <DoorOpen className="h-3 w-3" />
                            Bron
                          </div>
                          {tableBookings.slice(0, 2).map((b: RoomBooking) => (
                            <div key={b.id} className="text-xs text-muted-foreground">
                              <span className="text-foreground font-medium">{b.customerName}</span>
                              {b.customerPhone && <span> · {b.customerPhone}</span>}
                            </div>
                          ))}
                          <div className="text-[10px] text-muted-foreground/70 leading-tight">
                            {formatDateTime24(tableBookings[0].startAt)} - {formatDateTime24(tableBookings[0].endAt)}
                          </div>
                          <div className="text-[9px] text-muted-foreground/50">
                            Bron qilingan: {formatDateTime24(tableBookings[0].createdAt)}
                          </div>
                        </div>
                      )}

                      {!isOccupied && (
                        <span className="text-xs text-emerald-600 font-medium mt-1.5">Bo'sh</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {current.tableNumber && (
          <div className="px-5 py-3 border-t border-border shrink-0">
            <button
              onClick={() => onSelect({ roomId: null, roomName: null, tableId: null, tableNumber: null })}
              className="w-full py-2 text-sm text-muted-foreground hover:text-red-400 transition-colors"
            >
              Stol tanlovini bekor qilish
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  );
}
