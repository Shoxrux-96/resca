import { useState } from "react";
import {
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  getListProductsQueryKey,
  type Product,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Pencil, Trash2, Search, ImageIcon, Layers, Star, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type InvItem = { id: number; name: string; unit: string; itemType: string; quantity: number };
type RecipeRow = { inventoryItemId: number; name: string; unit: string; quantity: string };

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " so'm";
}

const CATEGORIES = [
  { value: "Taomlar", label: "🍽️ Taomlar", ru: "Блюда", color: "bg-orange-500/10 text-orange-400 border-orange-800" },
  { value: "Sho'rvalar", label: "🍜 Sho'rvalar", ru: "Супы", color: "bg-yellow-500/10 text-yellow-400 border-yellow-800" },
  { value: "Kaboblar", label: "🥩 Kaboblar", ru: "Шашлыки", color: "bg-red-600/10 text-red-500 border-red-800" },
  { value: "Salatlar", label: "🥗 Salatlar", ru: "Салаты", color: "bg-green-500/10 text-green-400 border-green-800" },
  { value: "Lavashlar", label: "🫓 Lavashlar", ru: "Лаваши", color: "bg-amber-600/10 text-amber-500 border-amber-800" },
  { value: "Gamburgerlar", label: "🍔 Gamburgerlar", ru: "Бургеры", color: "bg-red-500/10 text-red-400 border-red-800" },
  { value: "Pizzalar", label: "🍕 Pizzalar", ru: "Пицца", color: "bg-red-500/10 text-red-400 border-red-800" },
  { value: "Sushilar", label: "🍣 Sushilar", ru: "Суши", color: "bg-indigo-500/10 text-indigo-400 border-indigo-800" },
  { value: "Fastfood", label: "🌮 Fastfood", ru: "Фастфуд", color: "bg-orange-500/10 text-orange-400 border-orange-800" },
  { value: "Ichimliklar", label: "🍵 Ichimliklar", ru: "Напитки", color: "bg-blue-500/10 text-blue-400 border-blue-800" },
];

const UNITS = [
  { value: "1 PORSIYA", label: "1 PORSIYA" },
  { value: "1.5 PORSIYA", label: "1.5 PORSIYA" },
  { value: "KG", label: "KG" },
  { value: "GR", label: "GR" },
  { value: "LITR", label: "LITR" },
  { value: "BAKAL", label: "BAKAL" },
  { value: "CHOYNAK", label: "CHOYNAK" },
  { value: "IDISH (TOVOQ)", label: "IDISH (TOVOQ)" },
];

const getCategoryMeta = (value: string) =>
  CATEGORIES.find((c) => c.value === value) ?? { value, label: value, ru: "", color: "bg-zinc-500/10 text-muted-foreground border-border" };

const emptyForm = {
  name: "",
  price: "",
  category: CATEGORIES[0].value,
  unit: "1 PORSIYA",
  description: "",
  imageUrl: "",
  stock: "",
  isAvailable: true,
};

type ViewMode = "grid" | "list";

export default function AdminProducts() {
  const { user } = useAuth();
  const venueId = user?.venueId ?? 0;
  const { data: products, isLoading } = useListProducts(venueId, {
    query: { enabled: !!venueId, queryKey: getListProductsQueryKey(venueId) },
  });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [recipe, setRecipe] = useState<RecipeRow[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Omborxonadagi masalliqlar ro'yxati
  const { data: ingredients = [] } = useQuery<InvItem[]>({
    queryKey: ["inventory-ingredients", venueId],
    enabled: !!venueId && !!token,
    queryFn: async () => {
      const r = await fetch(`/api/venues/${venueId}/inventory`, { headers });
      const all: InvItem[] = await r.json();
      return all.filter((i) => i.itemType === "ingredient");
    },
  });

  // Retseptni saqlash
  const saveRecipe = useMutation({
    mutationFn: async ({ productId, items }: { productId: number; items: { inventoryItemId: number; quantity: number }[] }) => {
      const r = await fetch(`/api/venues/${venueId}/products/${productId}/recipe`, {
        method: "PUT", headers, body: JSON.stringify(items),
      });
      if (!r.ok) throw new Error("Recipe save failed");
      return r.json();
    },
  });

  // Retseptni yuklash (tahrirlashda)
  const loadRecipe = async (productId: number) => {
    try {
      const r = await fetch(`/api/venues/${venueId}/products/${productId}/recipe`, { headers });
      if (r.ok) {
        const data = await r.json();
        setRecipe(data.map((d: any) => ({
          inventoryItemId: d.inventoryItemId,
          name: d.inventoryItemName ?? "",
          unit: d.unit ?? "",
          quantity: String(d.quantity),
        })));
      }
    } catch { /* ignore */ }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setRecipe([]);
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      price: String(p.price),
      category: p.category,
      unit: (p as any).unit ?? "1 PORSIYA",
      description: p.description ?? "",
      imageUrl: (p as any).imageUrl ?? "",
      stock: (p as any).stock != null ? String((p as any).stock) : "",
      isAvailable: p.isAvailable ?? true,
    });
    setRecipe([]);
    loadRecipe(p.id);
    setOpen(true);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: getListProductsQueryKey(venueId) });

  const handleSave = () => {
    if (!form.name.trim() || !form.price || !form.category) {
      toast({ title: "Barcha majburiy maydonlarni to'ldiring", variant: "destructive" });
      return;
    }
    const data = {
      name: form.name.trim(),
      price: Number(form.price),
      category: form.category,
      description: form.description || undefined,
      imageUrl: form.imageUrl || undefined,
      stock: form.stock ? Number(form.stock) : undefined,
      isAvailable: form.isAvailable,
    };
    const recipeItems = recipe
      .filter((r) => r.inventoryItemId && parseFloat(r.quantity) > 0)
      .map((r) => ({ inventoryItemId: r.inventoryItemId, quantity: parseFloat(r.quantity) }));

    if (editing) {
      updateProduct.mutate({ venueId, id: editing.id, data }, {
        onSuccess: () => {
          saveRecipe.mutate({ productId: editing.id, items: recipeItems });
          invalidate(); setOpen(false); toast({ title: "✅ Yangilandi" });
        },
        onError: () => toast({ title: "Xatolik", variant: "destructive" }),
      });
    } else {
      createProduct.mutate({ venueId, data }, {
        onSuccess: (newProduct: any) => {
          const pid = newProduct?.id;
          if (pid && recipeItems.length > 0) {
            saveRecipe.mutate({ productId: pid, items: recipeItems });
          }
          invalidate(); setOpen(false); toast({ title: "✅ Taom qo'shildi" });
        },
        onError: () => toast({ title: "Xatolik", variant: "destructive" }),
      });
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("O'chirishni tasdiqlaysizmi?")) return;
    deleteProduct.mutate({ venueId, id }, {
      onSuccess: () => { invalidate(); toast({ title: "O'chirildi" }); },
      onError: () => toast({ title: "Xatolik", variant: "destructive" }),
    });
  };

  const filtered = (products ?? []).filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || p.category === filterCat;
    return matchSearch && matchCat;
  });

  const usedCategories = [...new Set(products?.map((p) => p.category) ?? [])];
  const grouped = usedCategories
    .map((cat) => ({ cat, meta: getCategoryMeta(cat), items: filtered.filter((p) => p.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Taomlar</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{products?.length ?? 0} ta taom</p>
        </div>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 gap-2 shrink-0" size="sm">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Yangi</span> Taom
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Taom qidirish..."
            className="pl-9 bg-input border-border text-foreground h-9"
          />
        </div>
        <Select value={filterCat} onValueChange={(v) => setFilterCat(v)}>
          <SelectTrigger className="w-[180px] bg-input border-border h-9 text-sm">
            <SelectValue placeholder="Barcha kategoriyalar" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border max-h-60 overflow-y-auto">
            <SelectItem value="all">Barcha kategoriyalar</SelectItem>
            {usedCategories.map((c) => {
              const m = getCategoryMeta(c);
              return <SelectItem key={c} value={c}>{m.label}</SelectItem>;
            })}
          </SelectContent>
        </Select>
        {/* View mode */}
        <div className="flex gap-1 bg-muted rounded-md p-1">
          <button
            onClick={() => setViewMode("grid")}
            className={`px-2 py-1 rounded text-xs transition-colors ${viewMode === "grid" ? "bg-blue-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`px-2 py-1 rounded text-xs transition-colors ${viewMode === "list" ? "bg-blue-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Ro'yxat
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-52 bg-zinc-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !products?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <Package className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground font-medium">Taomlar yo'q</p>
          <p className="text-muted-foreground text-sm mt-1">Birinchi taomni qo'shing</p>
          <Button onClick={openCreate} className="mt-4 bg-blue-600 hover:bg-blue-700 gap-2">
            <Plus className="h-4 w-4" />
            Qo'shish
          </Button>
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Qidiruv bo'yicha natija topilmadi</div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ cat, meta, items }) => (
            <div key={cat}>
              {/* Category header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{meta.label.split(" ")[0]}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{meta.label.slice(meta.label.indexOf(" ") + 1)}</h3>
                    {meta.ru && <p className="text-xs text-muted-foreground">{meta.ru}</p>}
                  </div>
                </div>
                <Badge variant="outline" className={`text-xs ${meta.color}`}>{items.length} ta</Badge>
                <div className="h-px flex-1 bg-muted" />
              </div>

              {viewMode === "grid" ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {items.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      catMeta={meta}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {items.map((p) => (
                    <ProductRow
                      key={p.id}
                      product={p}
                      catMeta={meta}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Taomni Tahrirlash" : "Yangi Taom Yaratish"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Rasm — tepada, kvadrat */}
            <div>
              <Label className="text-zinc-300 text-xs">Rasm</Label>
              <div className="mt-1.5 flex flex-col items-center gap-2">
                <div className="w-36 h-36 rounded-xl border border-border bg-zinc-800 overflow-hidden flex items-center justify-center">
                  {form.imageUrl ? (
                    <img src={form.imageUrl} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="h-10 w-10 text-muted-foreground opacity-30" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-zinc-600 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-500/5 transition-colors text-xs text-muted-foreground hover:text-blue-400">
                    {form.imageUrl ? "Boshqa rasm" : "Rasm yuklash"}
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      const canvas = document.createElement("canvas"); const img = new Image();
                      img.onload = () => { const S=300; canvas.width=S; canvas.height=S; const ctx=canvas.getContext("2d")!; const sc=Math.max(S/img.width,S/img.height); const w=img.width*sc,h=img.height*sc; ctx.drawImage(img,(S-w)/2,(S-h)/2,w,h); setForm(f=>({...f,imageUrl:canvas.toDataURL("image/jpeg",0.7)})); URL.revokeObjectURL(img.src); };
                      img.src = URL.createObjectURL(file); e.target.value = "";
                    }} />
                  </label>
                  {form.imageUrl && <button type="button" onClick={() => setForm({...form, imageUrl:""})} className="text-xs text-red-500">O'chirish</button>}
                </div>
              </div>
            </div>

            {/* Nomi */}
            <div>
              <Label className="text-zinc-300 text-xs">Nomi *</Label>
              <Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="Taom nomi" className="bg-input border-border mt-1" />
            </div>

            {/* Kategoriya + Birlik */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-300 text-xs">Kategoriya *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({...form, category: v})}>
                  <SelectTrigger className="mt-1 bg-input border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border !max-h-60" position="popper" sideOffset={4}>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-zinc-300 text-xs">Sotuv birligi</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({...form, unit: v})}>
                  <SelectTrigger className="mt-1 bg-input border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border !max-h-60" position="popper" sideOffset={4}>
                    {UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Narxi */}
            <div>
              <Label className="text-zinc-300 text-xs">Narxi (so'm) *</Label>
              <Input type="number" value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} placeholder="35000" className="bg-input border-border mt-1" />
            </div>

            {/* Tavsif */}
            <div>
              <Label className="text-zinc-300 text-xs">Tavsif (ixtiyoriy)</Label>
              <Input value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="Taom haqida qisqacha ma'lumot" className="bg-input border-border mt-1" />
            </div>

            {/* ── Masalliqlar (Retsept) ── */}
            <div className="border border-border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-zinc-300 text-xs font-semibold">Masalliqlar (retsept)</Label>
                <span className="text-[10px] text-muted-foreground">{recipe.length} ta</span>
              </div>
              <p className="text-[10px] text-muted-foreground">1 porsiya tayyorlash uchun kerak bo'ladigan masalliqlar. Sotilganda ombordan avtomatik kamayadi.</p>

              {recipe.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1 text-sm text-foreground truncate">
                    {row.name} <span className="text-muted-foreground text-xs">({row.unit})</span>
                  </div>
                  <Input
                    type="number"
                    value={row.quantity}
                    onChange={(e) => { const arr = [...recipe]; arr[idx] = {...arr[idx], quantity: e.target.value}; setRecipe(arr); }}
                    className="w-20 h-8 text-xs bg-input border-border"
                    placeholder="0.3"
                  />
                  <span className="text-xs text-muted-foreground w-8">{row.unit}</span>
                  <button type="button" onClick={() => setRecipe(recipe.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-400 p-1">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {/* Masalliq qo'shish */}
              {ingredients.length > 0 && (
                <Select onValueChange={(v) => {
                  const item = ingredients.find((i) => String(i.id) === v);
                  if (item && !recipe.find((r) => r.inventoryItemId === item.id)) {
                    setRecipe([...recipe, { inventoryItemId: item.id, name: item.name, unit: item.unit, quantity: "" }]);
                  }
                }}>
                  <SelectTrigger className="h-8 bg-input border-border text-xs">
                    <SelectValue placeholder="+ Masalliq qo'shish..." />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border !max-h-48" position="popper" sideOffset={4}>
                    {ingredients.filter((i) => !recipe.find((r) => r.inventoryItemId === i.id)).map((i) => (
                      <SelectItem key={i.id} value={String(i.id)}>{i.name} ({i.quantity} {i.unit} mavjud)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {ingredients.length === 0 && (
                <p className="text-[10px] text-muted-foreground">Omborxonada masalliq yo'q. Avval omborxonaga "Masalliq" turidagi mahsulot qo'shing.</p>
              )}
            </div>

            {/* Sotuvda mavjud */}
            <div className="flex items-center gap-3">
              <Switch checked={form.isAvailable} onCheckedChange={(v) => setForm({...form, isAvailable: v})} className="data-[state=checked]:bg-green-600" />
              <Label className="text-zinc-300 text-sm">Sotuvda mavjud</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-muted-foreground">Bekor</Button>
            <Button
              onClick={handleSave}
              disabled={!form.name || !form.price || !form.category || createProduct.isPending || updateProduct.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createProduct.isPending || updateProduct.isPending ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Product Card (Grid view) ──────────────────────────── */
function ProductCard({ product: p, catMeta, onEdit, onDelete }: {
  product: Product;
  catMeta: { label: string; color: string };
  onEdit: (p: Product) => void;
  onDelete: (id: number) => void;
}) {
  const stock = (p as any).stock as number | null;
  const imageUrl = (p as any).imageUrl as string | null;

  return (
    <div className={`group relative bg-card border rounded-xl overflow-hidden transition-all hover:border-zinc-600 hover:shadow-lg hover:shadow-black/30 ${!p.isAvailable ? "opacity-60 border-border/50" : "border-border"}`}>
      {/* Image area */}
      <div className="relative h-36 bg-zinc-800 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={p.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).parentElement!.classList.add("flex", "items-center", "justify-center");
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-4xl opacity-30">{catMeta.label.split(" ")[0]}</span>
          </div>
        )}

        {/* Availability badge */}
        <div className="absolute top-2 left-2">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${p.isAvailable ? "bg-green-600/80 text-foreground" : "bg-zinc-700/80 text-muted-foreground"}`}>
            {p.isAvailable ? "Mavjud" : "Yo'q"}
          </span>
        </div>

        {/* Action buttons - appear on hover */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={() => onEdit(p)}
            className="p-2 bg-blue-600 rounded-lg text-white hover:bg-blue-700 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(p.id)}
            className="p-2 bg-red-600/80 rounded-lg text-white hover:bg-red-700 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Info area */}
      <div className="p-3">
        <h4 className="font-semibold text-foreground text-sm leading-tight line-clamp-2 mb-1">{p.name}</h4>
        {p.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{p.description}</p>
        )}
        <div className="flex items-end justify-between gap-1 mt-auto">
          <p className="text-base font-bold text-blue-400">{new Intl.NumberFormat("uz-UZ").format(p.price)}<span className="text-xs text-muted-foreground font-normal ml-0.5">so'm</span></p>
          {stock != null && (
            <div className="flex items-center gap-1 text-xs">
              <Layers className="h-3 w-3 text-muted-foreground" />
              <span className={stock <= 5 ? "text-red-400 font-medium" : "text-muted-foreground"}>{stock}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Product Row (List view) ───────────────────────────── */
function ProductRow({ product: p, catMeta, onEdit, onDelete }: {
  product: Product;
  catMeta: { label: string; color: string };
  onEdit: (p: Product) => void;
  onDelete: (id: number) => void;
}) {
  const stock = (p as any).stock as number | null;
  const imageUrl = (p as any).imageUrl as string | null;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${p.isAvailable ? "bg-card border-border hover:border-border" : "bg-card/50 border-border/50 opacity-60"}`}>
      {/* Thumbnail */}
      <div className="w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
        {imageUrl ? (
          <img src={imageUrl} alt={p.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl opacity-40">{catMeta.label.split(" ")[0]}</span>
        )}
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground text-sm truncate">{p.name}</p>
          {!p.isAvailable && <span className="text-xs text-muted-foreground shrink-0">· Yo'q</span>}
        </div>
        {p.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{p.description}</p>}
      </div>

      {/* Stock */}
      {stock != null && (
        <div className="flex items-center gap-1 shrink-0">
          <Layers className="h-3 w-3 text-muted-foreground" />
          <span className={`text-xs ${stock <= 5 ? "text-red-400 font-medium" : "text-muted-foreground"}`}>{stock} ta</span>
        </div>
      )}

      {/* Price */}
      <p className="text-sm font-bold text-foreground shrink-0 min-w-24 text-right">
        {new Intl.NumberFormat("uz-UZ").format(p.price)}<span className="text-xs text-muted-foreground font-normal"> so'm</span>
      </p>

      {/* Actions */}
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => onEdit(p)} className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(p.id)} className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-400/10">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
