import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Plus, Trash2, TrendingDown, Wallet, Calendar, Package, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Expense = {
  id: number; venueId: number; category: string; amount: number;
  description: string | null; date: string; createdBy: number | null; createdAt: string;
};
type ProductExpenseDetail = {
  id: number; itemName: string; quantity: number; unit: string;
  costPrice: number; totalCost: number; date: string;
};
type ProductExpenses = { total: number; details: ProductExpenseDetail[] };
type ChartPoint = { label: string; revenue: number; expenses: number; profit: number };

const CATEGORIES = [
  { value: "ish_haqi", label: "Ish haqi" },
  { value: "ijara", label: "Ijara" },
  { value: "kommunal", label: "Kommunal xizmat" },
  { value: "reklama", label: "Reklama" },
  { value: "transport", label: "Transport" },
  { value: "jihozlar", label: "Jihozlar" },
  { value: "boshqa", label: "Boshqa" },
];

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(n);
}

type Period = "day" | "month" | "year" | "all";
type Tab = "product" | "other";

export default function AdminExpenses() {
  const { user, token } = useAuth();
  const venueId = user?.venueId ?? 0;
  const qc = useQueryClient();
  const { toast } = useToast();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const [period, setPeriod] = useState<Period>("month");
  const [tab, setTab] = useState<Tab>("other");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ category: "ish_haqi", amount: "", description: "", date: new Date().toISOString().slice(0, 10) });

  // Boshqa xarajatlar (qo'lda kiritilgan)
  const { data: expenses = [] } = useQuery<Expense[]>({
    queryKey: ["expenses", venueId],
    enabled: !!venueId && !!token,
    refetchInterval: 15_000,
    queryFn: async () => { const r = await fetch(`/api/venues/${venueId}/expenses`, { headers }); return r.json(); },
  });

  // Mahsulot xaridlari (ombor kirimlaridan)
  const { data: productExp } = useQuery<ProductExpenses>({
    queryKey: ["product-expenses", venueId, period],
    enabled: !!venueId && !!token,
    queryFn: async () => { const r = await fetch(`/api/venues/${venueId}/finance/product-expenses?period=${period}`, { headers }); return r.json(); },
  });

  // Diagramma uchun
  const { data: chart = [] } = useQuery<ChartPoint[]>({
    queryKey: ["finance-chart", venueId, period],
    enabled: !!venueId && !!token,
    queryFn: async () => { const r = await fetch(`/api/venues/${venueId}/finance/chart?period=${period}`, { headers }); return r.json(); },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["expenses", venueId] });
    qc.invalidateQueries({ queryKey: ["product-expenses", venueId, period] });
    qc.invalidateQueries({ queryKey: ["finance-chart", venueId, period] });
    qc.invalidateQueries({ queryKey: ["finance-summary", venueId, period] });
  };

  const createExpense = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(`/api/venues/${venueId}/expenses`, { method: "POST", headers, body: JSON.stringify(data) });
      if (!r.ok) throw new Error("Xatolik");
      return r.json();
    },
    onSuccess: () => { invalidate(); setModal(false); toast({ title: "Xarajat qo'shildi" }); },
    onError: () => toast({ title: "Xatolik", variant: "destructive" }),
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/venues/${venueId}/expenses/${id}`, { method: "DELETE", headers }); },
    onSuccess: () => { invalidate(); toast({ title: "O'chirildi" }); },
  });

  const handleCreate = () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { toast({ title: "Summani kiriting", variant: "destructive" }); return; }
    createExpense.mutate({ category: form.category, amount: parseFloat(form.amount), description: form.description || undefined, date: form.date ? `${form.date}T12:00:00Z` : undefined });
  };

  // Umumiy hisob
  const productTotal = productExp?.total ?? 0;
  const otherTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const grandTotal = productTotal + otherTotal;

  const expenseChartData = chart.map((p) => ({ label: p.label, xarajat: p.expenses }));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Xarajatlar</h1>
          <p className="text-muted-foreground text-sm mt-1">Mahsulot xaridlari va boshqa xarajatlar</p>
        </div>
        <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => { setForm({ category: "ish_haqi", amount: "", description: "", date: new Date().toISOString().slice(0, 10) }); setTab("other"); setModal(true); }}>
          <Plus className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Xarajat qo'shish</span>
        </Button>
      </div>

      {/* Period tabs */}
      <div className="flex gap-1.5">
        {([["day", "Bugun"], ["month", "Oylik"], ["year", "Yillik"], ["all", "Barchasi"]] as [Period, string][]).map(([p, l]) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${period === p ? "bg-red-600/10 text-red-500" : "text-muted-foreground hover:text-foreground bg-muted"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1"><Package className="h-3 w-3" /> Mahsulot xaridlari</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-orange-500">{fmt(productTotal)} <span className="text-xs font-normal text-muted-foreground">so'm</span></p>
            <p className="text-[10px] text-muted-foreground">Ombor kirimlaridan</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1"><Receipt className="h-3 w-3" /> Boshqa xarajatlar</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-red-500">{fmt(otherTotal)} <span className="text-xs font-normal text-muted-foreground">so'm</span></p>
            <p className="text-[10px] text-muted-foreground">Qo'lda kiritilgan</p>
          </CardContent>
        </Card>
        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Umumiy xarajat</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-red-500">{fmt(grandTotal)} <span className="text-xs font-normal text-muted-foreground">so'm</span></p>
            <p className="text-[10px] text-muted-foreground">{period === "day" ? "Bugungi" : period === "month" ? "Oylik" : period === "year" ? "Yillik" : "Barcha vaqt"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {expenseChartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3 sm:p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Xarajatlar diagrammasi</h3>
          <div className="h-44 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenseChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8 }} formatter={(v: number) => [`${fmt(v)} so'm`, "Xarajat"]} />
                <Bar dataKey="xarajat" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tab switch */}
      <div className="flex gap-1.5 border-b border-border pb-2">
        <button onClick={() => setTab("product")}
          className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === "product" ? "bg-orange-600/10 text-orange-500" : "text-muted-foreground hover:text-foreground"}`}>
          <Package className="h-3.5 w-3.5" /> Mahsulot xaridlari
        </button>
        <button onClick={() => setTab("other")}
          className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === "other" ? "bg-red-600/10 text-red-500" : "text-muted-foreground hover:text-foreground"}`}>
          <Receipt className="h-3.5 w-3.5" /> Boshqa xarajatlar
        </button>
      </div>

      {/* Tab: Mahsulot xaridlari */}
      {tab === "product" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Mahsulot xaridlari (ombor kirimi)</h3>
            <Badge variant="outline" className="text-xs">{productExp?.details?.length ?? 0} ta kirim</Badge>
          </div>
          {(!productExp?.details || productExp.details.length === 0) ? (
            <div className="border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>Bu davrda ombor kirimi yo'q</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Nomi</th>
                    <th className="px-3 py-2.5 font-medium">Miqdori</th>
                    <th className="px-3 py-2.5 font-medium">Narxi</th>
                    <th className="px-3 py-2.5 font-medium">Jami</th>
                    <th className="px-3 py-2.5 font-medium">Sana</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {productExp.details.map((d) => (
                    <tr key={d.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2.5 font-medium text-foreground">{d.itemName}</td>
                      <td className="px-3 py-2.5 text-foreground">{d.quantity} {d.unit}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{fmt(d.costPrice)} so'm</td>
                      <td className="px-3 py-2.5 font-semibold text-orange-500">{fmt(d.totalCost)} so'm</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{new Date(d.date).toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/20 border-t border-border">
                  <tr>
                    <td colSpan={3} className="px-3 py-2.5 font-semibold text-foreground text-right">
                      {period === "day" ? "Kunlik" : period === "month" ? "Oylik" : period === "year" ? "Yillik" : "Umumiy"} jami:
                    </td>
                    <td className="px-3 py-2.5 font-bold text-orange-500">{fmt(productTotal)} so'm</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Boshqa xarajatlar */}
      {tab === "other" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Qo'lda kiritilgan xarajatlar</h3>
            <Badge variant="outline" className="text-xs">{expenses.length} ta</Badge>
          </div>
          {expenses.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground">
              <Wallet className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>Xarajat yo'q</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {expenses.slice(0, 50).map((e) => (
                <div key={e.id} className="flex items-center gap-3 bg-card border border-border rounded-lg px-3 sm:px-4 py-2.5 text-sm">
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm">{CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category}</p>
                    {e.description && <p className="text-xs text-muted-foreground truncate">{e.description}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-red-500 text-sm">-{fmt(e.amount)}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(e.date).toLocaleDateString("uz-UZ")}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500/50 hover:text-red-500 hover:bg-red-500/10"
                    onClick={() => { if (confirm("O'chirasizmi?")) deleteExpense.mutate(e.id); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader><DialogTitle>Xarajat qo'shish</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Kategoriya</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1 bg-input border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Summa (so'm) *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" className="mt-1 bg-input border-border" />
            </div>
            <div>
              <Label>Sana</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="mt-1 bg-input border-border" />
            </div>
            <div>
              <Label>Izoh (ixtiyoriy)</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Masalan: Iyun oyi ijarasi" className="mt-1 bg-input border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Bekor</Button>
            <Button onClick={handleCreate} disabled={createExpense.isPending} className="bg-red-600 hover:bg-red-700">
              {createExpense.isPending ? "..." : "Qo'shish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
