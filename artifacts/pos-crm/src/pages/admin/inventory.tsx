import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, Search, Package, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Trash2, Pencil, LayoutGrid, List,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ── Types ── */
type InvItem = {
  id: number; venueId: number; name: string; category: string; itemType: string;
  imageUrl?: string | null;
  unit: string; packUnit: string | null; packSize: number;
  quantity: number; minQuantity: number; costPrice: number; sellPrice: number; createdAt: string;
};
type InvTransaction = {
  id: number; venueId: number; itemId: number; itemName: string | null;
  type: "in" | "out"; quantity: number; note: string | null;
  createdBy: number | null; createdByName: string | null; createdAt: string;
};
type InvAlert = { id: number; name: string; unit: string; quantity: number; minQuantity: number };

const UNITS = [
  { value: "kg", label: "KG" },
  { value: "gr", label: "GR" },
  { value: "litr", label: "LITR" },
  { value: "ml", label: "ML" },
  { value: "dona", label: "DONA" },
  { value: "pachka", label: "PACHKA" },
  { value: "blok", label: "BLOK" },
  { value: "boshqa", label: "BOSHQA" },
];

const PACK_UNITS = [
  { value: "kg", label: "KG" },
  { value: "gr", label: "GR" },
  { value: "litr", label: "LITR" },
  { value: "ml", label: "ML" },
  { value: "dona", label: "DONA" },
  { value: "pachka", label: "PACHKA" },
  { value: "blok", label: "BLOK" },
  { value: "boshqa", label: "BOSHQA" },
];

const CATEGORIES = [
  { value: "go'sht", label: "🥩 Go'sht", ru: "Мясо" },
  { value: "sabzavot", label: "🥕 Sabzavot", ru: "Овощи" },
  { value: "meva", label: "🍎 Meva", ru: "Фрукты" },
  { value: "ichimlik", label: "🥤 Ichimlik", ru: "Напитки" },
  { value: "spirtli", label: "🍷 Spirtli ichimlik", ru: "Алкоголь" },
  { value: "sut-mahsulot", label: "🥛 Sut mahsulot", ru: "Молочные" },
  { value: "un-mahsulot", label: "🌾 Un mahsulot", ru: "Мучные" },
  { value: "don", label: "🌾 Don (guruch, tariq)", ru: "Крупы" },
  { value: "ziravor", label: "🧂 Ziravor", ru: "Специи" },
  { value: "yog'", label: "🫒 Yog'", ru: "Масло" },
  { value: "shirinlik", label: "🍰 Shirinlik", ru: "Сладости" },
  { value: "muzqaymoq", label: "🍦 Muzqaymoq", ru: "Мороженое" },
  { value: "non", label: "🍞 Non", ru: "Хлеб" },
  { value: "sous", label: "🫙 Sous", ru: "Соусы" },
  { value: "konserva", label: "🥫 Konserva", ru: "Консервы" },
  { value: "boshqa", label: "📦 Boshqa", ru: "Другое" },
];

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 2 }).format(n);
}

function getCatLabel(val: string) {
  const c = CATEGORIES.find((cat) => cat.value === val);
  return c ? c.label : val;
}

/* ── Tab type ── */
type Tab = "in" | "out";

export default function AdminInventory() {
  const { user, token } = useAuth();
  const venueId = user?.venueId ?? 0;
  const qc = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>("in");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPrice, setFilterPrice] = useState<"all" | "low" | "mid" | "high">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [itemModal, setItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InvItem | null>(null);
  const [txModal, setTxModal] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // --- Queries ---
  const { data: items = [], isLoading } = useQuery<InvItem[]>({
    queryKey: ["inventory", venueId],
    enabled: !!venueId && !!token,
    refetchInterval: 10_000,
    queryFn: async () => {
      const r = await fetch(`/api/venues/${venueId}/inventory`, { headers });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const { data: transactions = [] } = useQuery<InvTransaction[]>({
    queryKey: ["inventory-tx", venueId],
    enabled: !!venueId && !!token,
    refetchInterval: 10_000,
    queryFn: async () => {
      const r = await fetch(`/api/venues/${venueId}/inventory/transactions`, { headers });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const { data: alerts = [] } = useQuery<InvAlert[]>({
    queryKey: ["inventory-alerts", venueId],
    enabled: !!venueId && !!token,
    refetchInterval: 15_000,
    queryFn: async () => {
      const r = await fetch(`/api/venues/${venueId}/inventory/alerts`, { headers });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["inventory", venueId] });
    qc.invalidateQueries({ queryKey: ["inventory-tx", venueId] });
    qc.invalidateQueries({ queryKey: ["inventory-alerts", venueId] });
    qc.invalidateQueries({ queryKey: ["product-expenses", venueId] });
    qc.invalidateQueries({ queryKey: ["finance-summary", venueId] });
    qc.invalidateQueries({ queryKey: ["finance-chart", venueId] });
  };

  // --- Create item ---
  const emptyItemForm = { name: "", category: "boshqa", itemType: "ingredient", unit: "dona", packUnit: "kg", packSize: "1", quantity: "0", minQuantity: "0", costPrice: "0", sellPrice: "0", imageUrl: "" };
  const [itemForm, setItemForm] = useState(emptyItemForm);

  const createItem = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(`/api/venues/${venueId}/inventory`, { method: "POST", headers, body: JSON.stringify(data) });
      if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.detail ?? "Xatolik"); }
      return r.json();
    },
    onSuccess: () => { invalidateAll(); setItemModal(false); toast({ title: "Mahsulot qo'shildi" }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/venues/${venueId}/inventory/${id}`, { method: "PATCH", headers, body: JSON.stringify(data) });
      if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.detail ?? "Xatolik"); }
      return r.json();
    },
    onSuccess: () => { invalidateAll(); setItemModal(false); toast({ title: "Yangilandi" }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: number) => {
      await fetch(`/api/venues/${venueId}/inventory/${itemId}`, { method: "DELETE", headers });
    },
    onSuccess: () => { invalidateAll(); toast({ title: "O'chirildi" }); },
  });

  // --- Transaction ---
  const [txForm, setTxForm] = useState({ itemId: "", quantity: "", note: "" });

  const createTx = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(`/api/venues/${venueId}/inventory/transaction`, { method: "POST", headers, body: JSON.stringify(data) });
      if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.detail ?? "Xatolik"); }
      return r.json();
    },
    onSuccess: () => { invalidateAll(); setTxModal(false); toast({ title: tab === "in" ? "Kirim qilindi" : "Chiqim qilindi" }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  // --- Filtered items for search ---
  const filtered = useMemo(() => {
    let result = items;
    // Text search (name)
    const q = search.toLowerCase().trim();
    if (q) {
      result = result.filter((i) => i.name.toLowerCase().includes(q));
    }
    // Category filter
    if (filterCategory !== "all") {
      result = result.filter((i) => i.category === filterCategory);
    }
    // Price filter (cost price ranges)
    if (filterPrice === "low") {
      result = result.filter((i) => i.costPrice <= 10000);
    } else if (filterPrice === "mid") {
      result = result.filter((i) => i.costPrice > 10000 && i.costPrice <= 50000);
    } else if (filterPrice === "high") {
      result = result.filter((i) => i.costPrice > 50000);
    }
    return result;
  }, [items, search, filterCategory, filterPrice]);

  const activeCategories = useMemo(() => {
    const cats = new Set(items.map((i) => i.category));
    return Array.from(cats).sort();
  }, [items]);

  const handleSaveItem = () => {
    if (!itemForm.name.trim()) { toast({ title: "Nomini kiriting", variant: "destructive" }); return; }
    const data: any = {
      name: itemForm.name.trim(),
      category: itemForm.category,
      itemType: itemForm.itemType,
      imageUrl: itemForm.imageUrl || undefined,
      unit: itemForm.unit,
      packUnit: itemForm.packUnit || undefined,
      packSize: parseFloat(itemForm.packSize) || 1,
      minQuantity: parseFloat(itemForm.minQuantity) || 0,
      costPrice: parseFloat(itemForm.costPrice) || 0,
      sellPrice: parseFloat(itemForm.sellPrice) || 0,
    };
    if (editingItem) {
      // Tahrirlash
      data.quantity = (parseFloat(itemForm.quantity) || 0);  // sotuv birligidagi miqdor
      updateItem.mutate({ id: editingItem.id, data });
    } else {
      // Yangi yaratish
      data.quantity = (parseFloat(itemForm.quantity) || 0) * (parseFloat(itemForm.packSize) || 1);
      createItem.mutate(data);
    }
  };

  const openEditItem = (item: InvItem) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      category: item.category,
      itemType: item.itemType,
      unit: item.unit,
      packUnit: (item as any).packUnit || "kg",
      packSize: String((item as any).packSize ?? 1),
      quantity: String(item.quantity),
      minQuantity: String(item.minQuantity),
      costPrice: String(item.costPrice),
      sellPrice: String(item.sellPrice),
      imageUrl: (item as any).imageUrl || "",
    });
    setItemModal(true);
  };

  const handleCreateTx = () => {
    if (!txForm.itemId || !txForm.quantity) { toast({ title: "Mahsulot va miqdorni tanlang", variant: "destructive" }); return; }
    createTx.mutate({ itemId: Number(txForm.itemId), type: tab, quantity: parseFloat(txForm.quantity), note: txForm.note || undefined });
  };

  const openTxModal = (type: Tab) => {
    setTab(type);
    setTxForm({ itemId: "", quantity: "", note: "" });
    setTxModal(true);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Omborxona</h1>
          <p className="text-muted-foreground text-sm mt-1">{items.length} ta mahsulot</p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <Button variant="outline" size="sm" className="border-border" onClick={() => openTxModal("in")}>
            <ArrowDownCircle className="h-4 w-4 sm:mr-1.5 text-green-500" />
            <span className="hidden sm:inline">Kirim</span>
          </Button>
          <Button variant="outline" size="sm" className="border-border" onClick={() => openTxModal("out")}>
            <ArrowUpCircle className="h-4 w-4 sm:mr-1.5 text-red-500" />
            <span className="hidden sm:inline">Chiqim</span>
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => { setEditingItem(null); setItemForm(emptyItemForm); setItemModal(true); }}>
            <Plus className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Mahsulot</span>
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="font-semibold text-red-500 text-sm">Ogohlantirish: {alerts.length} ta mahsulot kam qoldi</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {alerts.map((a) => (
              <Badge key={a.id} variant="outline" className="border-red-500/40 text-red-400 text-xs">
                {a.name}: {fmt(a.quantity)} {a.unit} (min: {fmt(a.minQuantity)})
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <button
          onClick={() => setTab("in")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "in" ? "bg-green-600/10 text-green-500" : "text-muted-foreground hover:text-foreground"}`}
        >
          <ArrowDownCircle className="h-4 w-4 inline mr-1.5" />Kirim
        </button>
        <button
          onClick={() => setTab("out")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "out" ? "bg-red-600/10 text-red-500" : "text-muted-foreground hover:text-foreground"}`}
        >
          <ArrowUpCircle className="h-4 w-4 inline mr-1.5" />Chiqim (Qoldiq)
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Mahsulot nomini izlash..."
            className="pl-10 bg-input border-border"
          />
        </div>
        <div className="flex gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="flex-1 sm:w-[160px] sm:flex-none bg-input border-border text-sm">
              <SelectValue placeholder="Kategoriya" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border !max-h-60" position="popper" sideOffset={4}>
              <SelectItem value="all">Barcha kategoriya</SelectItem>
              {activeCategories.map((c) => {
                const meta = CATEGORIES.find((cat) => cat.value === c);
                return <SelectItem key={c} value={c}>{meta ? `${meta.label} · ${meta.ru}` : c}</SelectItem>;
              })}
            </SelectContent>
          </Select>
          <Select value={filterPrice} onValueChange={(v) => setFilterPrice(v as any)}>
            <SelectTrigger className="flex-1 sm:w-[150px] sm:flex-none bg-input border-border text-sm">
              <SelectValue placeholder="Narx" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">Barcha narx</SelectItem>
              <SelectItem value="low">≤ 10,000</SelectItem>
              <SelectItem value="mid">10,000 — 50,000</SelectItem>
              <SelectItem value="high">&gt; 50,000</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Active filters */}
      {(filterCategory !== "all" || filterPrice !== "all" || search) && (
        <div className="flex items-center gap-2 flex-wrap">
          {search && (
            <Badge variant="outline" className="text-xs gap-1">
              Izlash: "{search}"
              <button onClick={() => setSearch("")} className="ml-1 hover:text-red-400">×</button>
            </Badge>
          )}
          {filterCategory !== "all" && (
            <Badge variant="outline" className="text-xs gap-1 capitalize">
              {filterCategory}
              <button onClick={() => setFilterCategory("all")} className="ml-1 hover:text-red-400">×</button>
            </Badge>
          )}
          {filterPrice !== "all" && (
            <Badge variant="outline" className="text-xs gap-1">
              Narx: {filterPrice === "low" ? "≤ 10K" : filterPrice === "mid" ? "10K-50K" : "> 50K"}
              <button onClick={() => setFilterPrice("all")} className="ml-1 hover:text-red-400">×</button>
            </Badge>
          )}
          <button
            onClick={() => { setSearch(""); setFilterCategory("all"); setFilterPrice("all"); }}
            className="text-xs text-blue-500 hover:underline"
          >
            Tozalash
          </button>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} ta natija</span>
        </div>
      )}

      {/* Tab: Kirim — mahsulotlar */}
      {tab === "in" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-sm">Ombordagi mahsulotlar</h2>
            <div className="flex gap-1 bg-muted rounded-md p-0.5">
              <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded transition-colors ${viewMode === "grid" ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground"}`}>
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setViewMode("list")} className={`p-1.5 rounded transition-colors ${viewMode === "list" ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground"}`}>
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-10">Yuklanmoqda...</p>
          ) : filtered.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Mahsulot topilmadi</p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map((item) => {
                const isLow = item.minQuantity > 0 && item.quantity <= item.minQuantity;
                return (
                  <div key={item.id} className={`group relative bg-card border rounded-xl overflow-hidden transition-all hover:border-zinc-600 hover:shadow-lg ${isLow ? "border-red-500/30" : "border-border"}`}>
                    <div className="relative h-28 bg-zinc-800 flex items-center justify-center overflow-hidden">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl opacity-30">{getCatLabel(item.category).split(" ")[0]}</span>
                      )}
                      {isLow && (
                        <div className="absolute top-1.5 left-1.5">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        </div>
                      )}
                      <div className="absolute top-1.5 right-1.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${item.itemType === "direct" ? "bg-blue-500/80 text-white" : "bg-green-500/80 text-white"}`}>
                          {item.itemType === "direct" ? "Tayyor" : "Masalliq"}
                        </span>
                      </div>
                      {/* Hover actions */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button onClick={() => openEditItem(item)} className="p-2 bg-blue-600 rounded-lg text-white hover:bg-blue-700">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => { if (confirm(`"${item.name}" o'chirilsinmi?`)) deleteItem.mutate(item.id); }} className="p-2 bg-red-600 rounded-lg text-white hover:bg-red-700">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="p-2.5">
                      <p className="font-semibold text-foreground text-xs leading-tight line-clamp-2">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{getCatLabel(item.category)}</p>
                      <div className="flex items-end justify-between mt-1.5">
                        <span className={`text-sm font-bold ${isLow ? "text-red-500" : "text-foreground"}`}>{fmt(item.quantity)} <span className="text-[10px] font-normal text-muted-foreground">{item.unit}</span></span>
                        <span className="text-[10px] text-muted-foreground">{fmt(item.sellPrice)} so'm</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((item) => {
                const isLow = item.minQuantity > 0 && item.quantity <= item.minQuantity;
                return (
                  <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${isLow ? "bg-red-500/5 border-red-500/20" : "bg-card border-border hover:border-zinc-600"}`}>
                    <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg opacity-40">{getCatLabel(item.category).split(" ")[0]}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-foreground text-sm truncate">{item.name}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${item.itemType === "direct" ? "bg-blue-500/10 text-blue-400" : "bg-green-500/10 text-green-400"}`}>
                          {item.itemType === "direct" ? "Tayyor" : "Masalliq"}
                        </span>
                        {isLow && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{getCatLabel(item.category)} · {item.unit}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${isLow ? "text-red-500" : "text-foreground"}`}>{fmt(item.quantity)} <span className="text-xs font-normal text-muted-foreground">{item.unit}</span></p>
                      <p className="text-[10px] text-muted-foreground">{fmt(item.sellPrice)} so'm</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-accent" onClick={() => openEditItem(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10" onClick={() => { if (confirm(`"${item.name}" o'chirilsinmi?`)) deleteItem.mutate(item.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent in transactions */}
          {transactions.filter((t) => t.type === "in").length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold text-foreground text-sm mb-2">So'nggi kirimlar</h3>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {transactions.filter((t) => t.type === "in").slice(0, 20).map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 bg-card border border-border rounded-lg px-3 py-2 text-sm">
                    <ArrowDownCircle className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="font-medium text-foreground">{tx.itemName}</span>
                    <span className="text-green-500 font-semibold">+{fmt(tx.quantity)}</span>
                    {tx.note && <span className="text-muted-foreground text-xs truncate">— {tx.note}</span>}
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString("uz-UZ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Chiqim — qoldiqlar */}
      {tab === "out" && (
        <div className="space-y-3">
          <h2 className="font-semibold text-foreground text-sm">Ombor qoldiqlari (Real vaqt)</h2>
          {filtered.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Mahsulot topilmadi</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm min-w-[500px]">
                <thead className="bg-muted/40">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 sm:px-4 py-2.5 sm:py-3 font-medium">Nomi</th>
                    <th className="px-3 sm:px-4 py-2.5 sm:py-3 font-medium hidden sm:table-cell">Kategoriya</th>
                    <th className="px-3 sm:px-4 py-2.5 sm:py-3 font-medium">Qoldiq</th>
                    <th className="px-3 sm:px-4 py-2.5 sm:py-3 font-medium hidden sm:table-cell">Birlik</th>
                    <th className="px-3 sm:px-4 py-2.5 sm:py-3 font-medium hidden md:table-cell">Min. miqdor</th>
                    <th className="px-3 sm:px-4 py-2.5 sm:py-3 font-medium">Holat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((item) => {
                    const isLow = item.minQuantity > 0 && item.quantity <= item.minQuantity;
                    const isEmpty = item.quantity <= 0;
                    return (
                      <tr key={item.id} className={`${isEmpty ? "bg-red-500/10" : isLow ? "bg-amber-500/5" : "hover:bg-muted/30"} transition-colors`}>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3 font-medium text-foreground">
                          <div>{item.name}</div>
                          <span className="text-xs text-muted-foreground sm:hidden capitalize">{getCatLabel(item.category)} · {item.unit}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-muted-foreground capitalize hidden sm:table-cell">{getCatLabel(item.category)}</td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                          <span className={`font-bold text-base sm:text-lg ${isEmpty ? "text-red-500" : isLow ? "text-amber-500" : "text-green-500"}`}>
                            {fmt(item.quantity)}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1 sm:hidden">{item.unit}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-muted-foreground hidden sm:table-cell">{item.unit}</td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-muted-foreground hidden md:table-cell">{fmt(item.minQuantity)}</td>
                        <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                          {isEmpty ? (
                            <Badge className="bg-red-500/20 text-red-500 border-red-500/30 text-[10px] sm:text-xs">Tugagan</Badge>
                          ) : isLow ? (
                            <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-[10px] sm:text-xs">Kam</Badge>
                          ) : (
                            <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-[10px] sm:text-xs">Yetarli</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent out transactions */}
          {transactions.filter((t) => t.type === "out").length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold text-foreground text-sm mb-2">So'nggi chiqimlar</h3>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {transactions.filter((t) => t.type === "out").slice(0, 20).map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 bg-card border border-border rounded-lg px-3 py-2 text-sm">
                    <ArrowUpCircle className="h-4 w-4 text-red-500 shrink-0" />
                    <span className="font-medium text-foreground">{tx.itemName}</span>
                    <span className="text-red-500 font-semibold">-{fmt(tx.quantity)}</span>
                    {tx.note && <span className="text-muted-foreground text-xs truncate">— {tx.note}</span>}
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString("uz-UZ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === Create Item Modal === */}
      <Dialog open={itemModal} onOpenChange={setItemModal}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader><DialogTitle>{editingItem ? "Mahsulotni tahrirlash" : "Yangi mahsulot qo'shish"}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            {/* Rasm — tepada kvadrat */}
            <div>
              <Label className="text-xs">Rasm (ixtiyoriy)</Label>
              <div className="mt-1.5 flex flex-col items-center gap-2">
                <div className="w-32 h-32 rounded-xl border border-border bg-zinc-800 overflow-hidden flex items-center justify-center">
                  {itemForm.imageUrl ? (
                    <img src={itemForm.imageUrl} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <Package className="h-8 w-8 text-muted-foreground opacity-30" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-zinc-600 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-500/5 transition-colors text-xs text-muted-foreground hover:text-blue-400">
                    {itemForm.imageUrl ? "Boshqa rasm" : "Rasm yuklash"}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const canvas = document.createElement("canvas");
                        const img = new Image();
                        img.onload = () => {
                          const SIZE = 300;
                          canvas.width = SIZE; canvas.height = SIZE;
                          const ctx = canvas.getContext("2d")!;
                          const scale = Math.max(SIZE / img.width, SIZE / img.height);
                          const w = img.width * scale, h = img.height * scale;
                          ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
                          setItemForm((f) => ({ ...f, imageUrl: canvas.toDataURL("image/jpeg", 0.7) }));
                          URL.revokeObjectURL(img.src);
                        };
                        img.src = URL.createObjectURL(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {itemForm.imageUrl && (
                    <button type="button" onClick={() => setItemForm((f) => ({ ...f, imageUrl: "" }))} className="text-xs text-red-500 hover:text-red-400">O'chirish</button>
                  )}
                </div>
              </div>
            </div>

            {/* Turi */}
            <div>
              <Label>Turi *</Label>
              <Select value={itemForm.itemType} onValueChange={(v) => setItemForm((f) => ({ ...f, itemType: v }))}>
                <SelectTrigger className="mt-1 bg-input border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="direct">To'g'ri sotiladigan (tayyor)</SelectItem>
                  <SelectItem value="ingredient">Masalliq (ovqat uchun)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                {itemForm.itemType === "direct" ? "Kassada sotilganda ombordan kamayadi" : "Ovqat sotilganda retseptga qarab kamayadi"}
              </p>
            </div>

            {/* Nomi */}
            <div>
              <Label>Nomi *</Label>
              <Input value={itemForm.name} onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))} placeholder="Masalan: Kartoshka" className="mt-1 bg-input border-border" />
            </div>

            {/* Kategoriya */}
            <div>
              <Label>Kategoriya</Label>
              <Select value={itemForm.category} onValueChange={(v) => setItemForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1 bg-input border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border !max-h-60" position="popper" sideOffset={4}>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label} · {c.ru}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Miqdor va birlik */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kiritilayotgan miqdor *</Label>
                <Input type="number" value={itemForm.quantity} onChange={(e) => setItemForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="10" className="mt-1 bg-input border-border" />
              </div>
              <div>
                <Label>Kirim birligi</Label>
                <Select value={itemForm.packUnit} onValueChange={(v) => setItemForm((f) => ({ ...f, packUnit: v }))}>
                  <SelectTrigger className="mt-1 bg-input border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {PACK_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Sotuv birligi va pack_size */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sotuv birligi *</Label>
                <Select value={itemForm.unit} onValueChange={(v) => setItemForm((f) => ({ ...f, unit: v }))}>
                  <SelectTrigger className="mt-1 bg-input border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>1 {itemForm.packUnit.toUpperCase()} = ? {itemForm.unit.toUpperCase()}</Label>
                <Input type="number" value={itemForm.packSize} onChange={(e) => setItemForm((f) => ({ ...f, packSize: e.target.value }))} placeholder="6" className="mt-1 bg-input border-border" />
              </div>
            </div>
            {parseFloat(itemForm.packSize) > 1 && parseFloat(itemForm.quantity) > 0 && (
              <p className="text-xs text-green-500 -mt-1">= {(parseFloat(itemForm.quantity) * parseFloat(itemForm.packSize)).toFixed(0)} {itemForm.unit.toUpperCase()} bo'ladi</p>
            )}

            {/* Min miqdor */}
            <div>
              <Label>Min. miqdor (ogohlantirish uchun)</Label>
              <Input type="number" value={itemForm.minQuantity} onChange={(e) => setItemForm((f) => ({ ...f, minQuantity: e.target.value }))} placeholder="10" className="mt-1 bg-input border-border" />
            </div>

            {/* Narxlar */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tan narxi ({itemForm.unit.toUpperCase()})</Label>
                <Input type="number" value={itemForm.costPrice} onChange={(e) => setItemForm((f) => ({ ...f, costPrice: e.target.value }))} placeholder="5000" className="mt-1 bg-input border-border" />
              </div>
              <div>
                <Label>Sotuv narxi</Label>
                <Input type="number" value={itemForm.sellPrice} onChange={(e) => setItemForm((f) => ({ ...f, sellPrice: e.target.value }))} placeholder="8000" className="mt-1 bg-input border-border" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemModal(false)}>Bekor</Button>
            <Button onClick={handleSaveItem} disabled={createItem.isPending || updateItem.isPending} className="bg-blue-600 hover:bg-blue-700">
              {createItem.isPending || updateItem.isPending ? "..." : editingItem ? "Saqlash" : "Qo'shish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Transaction Modal === */}
      <Dialog open={txModal} onOpenChange={setTxModal}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle>{tab === "in" ? "Kirim qilish" : "Chiqim qilish"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Mahsulot *</Label>
              <Select value={txForm.itemId} onValueChange={(v) => setTxForm((f) => ({ ...f, itemId: v }))}>
                <SelectTrigger className="mt-1 bg-input border-border"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                <SelectContent className="bg-card border-border max-h-60">
                  {items.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.name} ({fmt(i.quantity)} {i.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Miqdor *</Label>
              <Input type="number" value={txForm.quantity} onChange={(e) => setTxForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="0" className="mt-1 bg-input border-border" />
            </div>
            <div>
              <Label>Izoh (ixtiyoriy)</Label>
              <Input value={txForm.note} onChange={(e) => setTxForm((f) => ({ ...f, note: e.target.value }))} placeholder="Masalan: Bozordan olib kelindi" className="mt-1 bg-input border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxModal(false)}>Bekor</Button>
            <Button onClick={handleCreateTx} disabled={createTx.isPending} className={tab === "in" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}>
              {createTx.isPending ? "..." : tab === "in" ? "Kirim" : "Chiqim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
