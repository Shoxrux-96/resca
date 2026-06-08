import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useGetVenueReport, getGetVenueReportQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";
import { BarChart3, TrendingUp, ShoppingBag, Receipt, Printer, ChevronLeft, ChevronRight, Download } from "lucide-react";
import * as XLSX from "xlsx";
import ProductAnalytics from "@/pages/admin/product-analytics";

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + " mln";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + " ming";
  return new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtFull(n: number) {
  return new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " so'm";
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const PAYMENT_LABELS: Record<string, { label: string; color: string }> = {
  cash:     { label: "Naqd",    color: "bg-green-600/20 text-green-400 border-green-800" },
  card:     { label: "Karta",   color: "bg-blue-600/20 text-blue-400 border-blue-800" },
  debt:     { label: "Qarzga",  color: "bg-red-600/20 text-red-400 border-red-800" },
  transfer: { label: "O'tkazma", color: "bg-purple-600/20 text-purple-400 border-purple-800" },
};

const STATUS_LABELS: Record<string, string> = {
  completed: "Tugallangan",
  pending:   "Kutilmoqda",
  cancelled: "Bekor",
  debt:      "Qarz",
};

type OrderItem = { productId: number; productName: string; quantity: number; unitPrice: number; total: number };
type Order = {
  id: number;
  customerName?: string | null;
  roomName?: string | null;
  tableNumber?: string | null;
  totalAmount: number;
  paymentType: string;
  status: string;
  notes?: string | null;
  items: OrderItem[];
  createdAt: string;
};

export default function AdminReport() {
  const { user } = useAuth();
  const venueId = user?.venueId ?? 0;
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const [filterPayment, setFilterPayment] = useState<string>("all");

  const { data, isLoading } = useGetVenueReport(venueId, { year }, {
    query: { enabled: !!venueId, queryKey: getGetVenueReportQueryKey(venueId, { year }) },
  });

  const filteredOrders = ((data?.allOrders ?? []) as Order[])
    .filter((o) => filterPayment === "all" ? true : o.paymentType === filterPayment)
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const chartData = (data?.monthlySales ?? []).map((m) => ({
    name: (m.monthName ?? "").slice(0, 3),
    fullName: m.monthName ?? "",
    revenue: m.revenue,
    orders: m.orderCount,
  }));

  const exportToExcel = () => {
    const orders = (data?.allOrders ?? []) as Order[];
    if (!orders.length) return;

    // Sheet 1: Summary by month
    const monthlySheet = (data?.monthlySales ?? []).map((m) => ({
      "Oy": m.monthName ?? "",
      "Buyurtmalar soni": m.orderCount,
      "Daromad (so'm)": m.revenue,
    }));

    // Sheet 2: All orders
    const ordersSheet = orders.map((o) => ({
      "Chek #": o.id,
      "Sana": fmtDate(o.createdAt),
      "Mijoz": o.customerName ?? "Mehmon",
      "Joy": [o.roomName, o.tableNumber ? `Stol ${o.tableNumber}` : ""].filter(Boolean).join(" · ") || "—",
      "To'lov turi": PAYMENT_LABELS[o.paymentType]?.label ?? o.paymentType,
      "Holat": STATUS_LABELS[o.status] ?? o.status,
      "Summa (so'm)": o.totalAmount,
      "Mahsulotlar": (o.items ?? []).map((i) => `${i.productName} ×${i.quantity}`).join(", "),
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(monthlySheet);
    const ws2 = XLSX.utils.json_to_sheet(ordersSheet);

    // Column widths for orders sheet
    ws2["!cols"] = [
      { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 16 },
      { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 50 },
    ];
    ws1["!cols"] = [{ wch: 15 }, { wch: 18 }, { wch: 16 }];

    XLSX.utils.book_append_sheet(wb, ws2, "Sotuvlar");
    XLSX.utils.book_append_sheet(wb, ws1, `${year} yil oylik`);
    XLSX.writeFile(wb, `sotuvlar_${year}.xlsx`);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-input border border-border rounded-lg p-3 text-sm shadow-xl">
          <p className="text-foreground font-medium mb-1">{payload[0]?.payload?.fullName}</p>
          {payload.map((p: any) => (
            <div key={p.dataKey} className="flex justify-between gap-4">
              <span className="text-muted-foreground">{p.dataKey === "revenue" ? "Daromad:" : "Buyurtmalar:"}</span>
              <span style={{ color: p.color }} className="font-semibold">
                {p.dataKey === "revenue" ? fmtFull(p.value) : `${p.value} ta`}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sotuvlar Hisobot</h1>
          <p className="text-muted-foreground mt-1">Oylik va yillik daromad tahlili</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={exportToExcel} disabled={!data?.allOrders?.length} variant="outline" className="gap-2 border-green-700 text-green-400 hover:bg-green-700/10 hover:text-green-300">
            <Download className="h-4 w-4" />
            Excel yuklash
          </Button>
          <div className="flex items-center gap-2 bg-muted rounded-lg px-2 py-1">
            <button onClick={() => setYear((y) => y - 1)} className="p-1 text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-foreground font-semibold w-12 text-center">{year}</span>
            <button onClick={() => setYear((y) => Math.min(y + 1, currentYear))} disabled={year >= currentYear} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-center py-20">Yuklanmoqda...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">{year} yil daromadi</span><TrendingUp className="h-3.5 w-3.5 text-green-500" /></div>
                <p className="text-xl font-bold text-green-400">{fmt(data?.totalRevenue ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">so'm</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">Jami buyurtmalar</span><ShoppingBag className="h-3.5 w-3.5 text-blue-500" /></div>
                <p className="text-xl font-bold text-foreground">{data?.totalOrders ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">ta</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">O'rtacha chek</span><Receipt className="h-3.5 w-3.5 text-purple-500" /></div>
                <p className="text-xl font-bold text-purple-400">{fmt((data?.totalOrders ?? 0) > 0 ? (data?.totalRevenue ?? 0) / data!.totalOrders : 0)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">so'm</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">Eng yaxshi oy</span><BarChart3 className="h-3.5 w-3.5 text-orange-500" /></div>
                {(() => {
                  const best = [...(data?.monthlySales ?? [])].sort((a, b) => b.revenue - a.revenue)[0];
                  return best && best.revenue > 0
                    ? <><p className="text-xl font-bold text-orange-400">{best.monthName}</p><p className="text-xs text-muted-foreground mt-0.5">{fmt(best.revenue)} so'm</p></>
                    : <p className="text-xl font-bold text-muted-foreground">—</p>;
                })()}
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm text-foreground">{year} yil oylik daromad</CardTitle>
              <div className="flex gap-1">
                {(["bar", "line"] as const).map((t) => (
                  <button key={t} onClick={() => setChartType(t)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${chartType === t ? "bg-blue-600 text-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                    {t === "bar" ? "Ustunli" : "Chiziqli"}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                {chartType === "bar" ? (
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => fmt(v)} tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                ) : (
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => fmt(v)} tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} dot={{ fill: "#2563eb", r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
              <div className="grid grid-cols-6 md:grid-cols-12 gap-1 mt-3">
                {(data?.monthlySales ?? []).map((m) => (
                  <div key={m.month} className="text-center">
                    <p className="text-xs text-muted-foreground">{(m.monthName ?? "").slice(0, 3)}</p>
                    <p className="text-xs font-medium text-blue-400">{m.orderCount}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Mahsulot analitikasi */}
          <ProductAnalytics />

          {/* Orders table */}
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm text-foreground">
                Barcha Sotuvlar <span className="ml-2 text-muted-foreground font-normal">{filteredOrders.length} ta</span>
              </CardTitle>
              <div className="flex gap-1 flex-wrap justify-end">
                {(["all", "cash", "card", "debt", "transfer"] as const).map((pt) => (
                  <button key={pt} onClick={() => setFilterPayment(pt)} className={`px-2 py-1 rounded text-xs font-medium transition-colors ${filterPayment === pt ? "bg-blue-600 text-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                    {pt === "all" ? "Barchasi" : PAYMENT_LABELS[pt]?.label ?? pt}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredOrders.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">Sotuvlar yo'q</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2.5 px-4 text-xs text-muted-foreground font-medium">ID</th>
                        <th className="text-left py-2.5 px-4 text-xs text-muted-foreground font-medium">Sana</th>
                        <th className="text-left py-2.5 px-4 text-xs text-muted-foreground font-medium">Mijoz / Stol</th>
                        <th className="text-left py-2.5 px-4 text-xs text-muted-foreground font-medium">Tur</th>
                        <th className="text-left py-2.5 px-4 text-xs text-muted-foreground font-medium">Holat</th>
                        <th className="text-right py-2.5 px-4 text-xs text-muted-foreground font-medium">Summa</th>
                        <th className="text-center py-2.5 px-4 text-xs text-muted-foreground font-medium">Chek</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((o) => {
                        const pm = PAYMENT_LABELS[o.paymentType] ?? { label: o.paymentType, color: "bg-muted text-muted-foreground border-border" };
                        return (
                          <tr key={o.id} className="border-b border-border/50 hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => setSelectedOrder(o)}>
                            <td className="py-3 px-4 text-muted-foreground">#{o.id}</td>
                            <td className="py-3 px-4 text-muted-foreground whitespace-nowrap text-xs">{fmtDate(o.createdAt)}</td>
                            <td className="py-3 px-4">
                              <p className="text-foreground">{o.customerName ?? "Mehmon"}</p>
                              {(o.roomName || o.tableNumber) && <p className="text-xs text-muted-foreground">{o.roomName} {o.tableNumber ? `· Stol ${o.tableNumber}` : ""}</p>}
                            </td>
                            <td className="py-3 px-4"><Badge variant="outline" className={`text-xs ${pm.color}`}>{pm.label}</Badge></td>
                            <td className="py-3 px-4">
                              <span className={`text-xs ${o.status === "completed" ? "text-green-400" : o.status === "cancelled" ? "text-red-400" : "text-yellow-400"}`}>
                                {STATUS_LABELS[o.status as string] ?? o.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-foreground">{fmtFull(o.totalAmount)}</td>
                            <td className="py-3 px-4 text-center">
                              <button onClick={(e) => { e.stopPropagation(); setSelectedOrder(o); }} className="text-blue-400 hover:text-blue-300 transition-colors" title="Chekni ko'rish">
                                <Receipt className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Admin Receipt Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-blue-400" />
              Sotuv Cheki #{selectedOrder?.id}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              {/* Receipt preview in thermal format */}
              <div
                id="report-receipt"
                className="bg-white mx-auto p-3 shadow-inner"
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: "10px",
                  width: "220px",
                  color: "#000",
                  lineHeight: "1.35",
                }}
              >
                <div style={{ textAlign: "center", marginBottom: "2px" }}>
                  <div style={{ fontWeight: "bold", fontSize: "13px", letterSpacing: "1px" }}>
                    {(user?.venueName ?? "KAFE").toUpperCase()}
                  </div>
                  <div style={{ fontSize: "8px", color: "#555" }}>Savdo cheki / Товарный чек</div>
                </div>
                <div style={{ borderTop: "1px solid #000", margin: "4px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px" }}>
                  <span>CHEK: <b>#{String(selectedOrder.id).padStart(6, "0")}</b></span>
                  <span>{fmtDate(selectedOrder.createdAt)}</span>
                </div>
                {selectedOrder.customerName && (
                  <div style={{ fontSize: "9px" }}>Mijoz: <b>{selectedOrder.customerName}</b></div>
                )}
                {(selectedOrder.roomName || selectedOrder.tableNumber) && (
                  <div style={{ fontSize: "9px" }}>
                    Joy: <b>{[selectedOrder.roomName, selectedOrder.tableNumber ? `Stol #${selectedOrder.tableNumber}` : ""].filter(Boolean).join(" · ")}</b>
                  </div>
                )}
                <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#555" }}>
                  <span style={{ flex: 1 }}>MAHSULOT</span>
                  <span style={{ width: "70px", textAlign: "right" }}>SUMMA</span>
                </div>
                <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
                {selectedOrder.items.map((item, i) => (
                  <div key={i} style={{ marginBottom: "3px" }}>
                    <div style={{ fontWeight: "bold", fontSize: "10px" }}>
                      {i + 1}. {item.productName}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px" }}>
                      <span>{item.quantity} × {fmtFull(item.unitPrice).replace(" so'm", "")}</span>
                      <span style={{ fontWeight: "bold" }}>{fmtFull(item.total).replace(" so'm", "")}</span>
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: "3px double #000", margin: "4px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "13px" }}>
                  <span>JAMI:</span>
                  <span>{fmtFull(selectedOrder.totalAmount)}</span>
                </div>
                <div style={{ borderTop: "3px double #000", margin: "4px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px" }}>
                  <span>To'lov turi:</span>
                  <span style={{ fontWeight: "bold" }}>{PAYMENT_LABELS[selectedOrder.paymentType]?.label ?? selectedOrder.paymentType}</span>
                </div>
                {selectedOrder.notes && (
                  <div style={{ fontSize: "8px", color: "#555", marginTop: "2px" }}>Izoh: {selectedOrder.notes}</div>
                )}
                <div style={{ borderTop: "1px solid #000", margin: "4px 0" }} />
                <div style={{ textAlign: "center", fontSize: "9px", marginTop: "3px" }}>
                  <div style={{ fontWeight: "bold" }}>✦ XARID UCHUN RAHMAT ✦</div>
                  <div style={{ fontSize: "8px", color: "#777", marginTop: "2px" }}>
                    Ushbu chek fiskal hujjat hisoblanadi
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    const el = document.getElementById("report-receipt");
                    if (!el) return;
                    const checkNum = String(selectedOrder.id).padStart(6, "0");
                    const win = window.open("", "_blank", "width=400,height=600");
                    if (!win) return;
                    win.document.write(`<!DOCTYPE html><html><head>
                      <meta charset="utf-8"/>
                      <title>CHEK #${checkNum}</title>
                      <style>
                        * { margin:0; padding:0; box-sizing:border-box; }
                        @page { size: 58mm auto; margin: 0; }
                        @media print { html, body { width: 58mm; } }
                        body {
                          font-family: 'Courier New', 'Courier', monospace;
                          font-size: 10px; width: 58mm; max-width: 58mm;
                          background: #fff; color: #000; padding: 2mm 3mm;
                          line-height: 1.35;
                          print-color-adjust: exact;
                          -webkit-print-color-adjust: exact;
                        }
                        .c { text-align: center; }
                        .r { text-align: right; }
                        .b { font-weight: bold; }
                        canvas, svg { display: block; max-width: 100%; }
                      </style>
                    </head><body>${el.innerHTML}</body></html>`);
                    win.document.close();
                    win.focus();
                    setTimeout(() => { win.print(); win.close(); }, 400);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-sm gap-1.5"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Chop etish
                </Button>
                <Button variant="outline" onClick={() => setSelectedOrder(null)} className="flex-1 text-sm border-gray-300 text-gray-700">
                  Yopish
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
