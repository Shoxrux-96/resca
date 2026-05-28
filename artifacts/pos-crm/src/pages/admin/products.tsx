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
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Pencil, Trash2, Search, ImageIcon, Layers, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " so'm";
}

const CATEGORIES = [
  { value: "Taomlar", label: "🍽️ Taomlar", ru: "Блюда", color: "bg-orange-500/10 text-orange-400 border-orange-800" },
  { value: "Sho'rvalar", label: "🍜 Sho'rvalar", ru: "Супы", color: "bg-yellow-500/10 text-yellow-400 border-yellow-800" },
  { value: "Salatlar", label: "🥗 Salatlar", ru: "Салаты", color: "bg-green-500/10 text-green-400 border-green-800" },
  { value: "Ichimliklar", label: "🥤 Ichimliklar", ru: "Напитки", color: "bg-blue-500/10 text-blue-400 border-blue-800" },
  { value: "Shirinliklar", label: "🍰 Shirinliklar", ru: "Десерты", color: "bg-pink-500/10 text-pink-400 border-pink-800" },
  { value: "Muzqaymoqlar", label: "🍦 Muzqaymoqlar", ru: "Мороженое", color: "bg-cyan-500/10 text-cyan-400 border-cyan-800" },
  { value: "Spirtli ichimliklar", label: "🍷 Spirtli ichimliklar", ru: "Алкоголь", color: "bg-purple-500/10 text-purple-400 border-purple-800" },
  { value: "Nonlar", label: "🍞 Nonlar", ru: "Хлеб", color: "bg-amber-500/10 text-amber-400 border-amber-800" },
  { value: "Lavashlar", label: "🫓 Lavashlar", ru: "Лаваши", color: "bg-amber-500/10 text-amber-400 border-amber-800" },
  { value: "Gamburgerlar", label: "🍔 Gamburgerlar", ru: "Бургеры", color: "bg-red-500/10 text-red-400 border-red-800" },
  { value: "Pizzalar", label: "🍕 Pizzalar", ru: "Пицца", color: "bg-red-500/10 text-red-400 border-red-800" },
  { value: "Sushilar", label: "🍣 Sushilar", ru: "Суши", color: "bg-indigo-500/10 text-indigo-400 border-indigo-800" },
  { value: "Mazzalar", label: "🍡 Mazzalar", ru: "Закуски", color: "bg-zinc-500/10 text-muted-foreground border-border" },
  { value: "Fastfood", label: "🌮 Fastfood", ru: "Fastfood", color: "bg-orange-500/10 text-orange-400 border-orange-800" },
  { value: "Boshqa", label: "📦 Boshqa", ru: "Другое", color: "bg-zinc-500/10 text-muted-foreground border-border" },
];

const UNITS = [
  { value: "dona", label: "dona (штука)" },
  { value: "porsiya", label: "porsiya (порция)" },
  { value: "stakan", label: "stakan (стакан)" },
  { value: "shisha", label: "shisha (бутылка)" },
  { value: "quti", label: "quti (коробка/банка)" },
  { value: "kg", label: "kg (кг)" },
  { value: "gram", label: "gram (грамм)" },
  { value: "litr", label: "litr (литр)" },
  { value: "ml", label: "ml (мл)" },
  { value: "kosa", label: "kosa (миска)" },
  { value: "tarelka", label: "tarelka (тарелка)" },
  { value: "piyola", label: "piyola (пиала)" },
  { value: "qadoq", label: "qadoq (пачка)" },
  { value: "lagan", label: "lagan (ляган)" },
];

const getCategoryMeta = (value: string) =>
  CATEGORIES.find((c) => c.value === value) ?? { label: value, ru: "", color: "bg-zinc-500/10 text-muted-foreground border-border" };

const emptyForm = {
  name: "",
  price: "",
  category: CATEGORIES[0].value,
  unit: UNITS[0].value,
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
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      price: String(p.price),
      category: p.category,
      unit: (p as any).unit ?? UNITS[0].value,
      description: p.description ?? "",
      imageUrl: (p as any).imageUrl ?? "",
      stock: (p as any).stock != null ? String((p as any).stock) : "",
      isAvailable: p.isAvailable ?? true,
    });
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
    if (editing) {
      updateProduct.mutate({ venueId, id: editing.id, data }, {
        onSuccess: () => { invalidate(); setOpen(false); toast({ title: "✅ Yangilandi" }); },
        onError: () => toast({ title: "Xatolik", variant: "destructive" }),
      });
    } else {
      createProduct.mutate({ venueId, data }, {
        onSuccess: () => { invalidate(); setOpen(false); toast({ title: "✅ Mahsulot qo'shildi" }); },
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
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Mahsulotlar</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{products?.length ?? 0} ta mahsulot</p>
        </div>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 gap-2 shrink-0" size="sm">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Yangi</span> Mahsulot
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Mahsulot qidirish..."
            className="pl-9 bg-input border-border text-foreground h-9"
          />
        </div>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 h-9"
        >
          <option value="all">Barcha kategoriyalar</option>
          {usedCategories.map((c) => {
            const m = getCategoryMeta(c);
            return <option key={c} value={c}>{m.label}</option>;
          })}
        </select>
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
          <p className="text-muted-foreground font-medium">Mahsulotlar yo'q</p>
          <p className="text-muted-foreground text-sm mt-1">Birinchi mahsulotni qo'shing</p>
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
            <DialogTitle>{editing ? "Mahsulotni Tahrirlash" : "Yangi Mahsulot Qo'shish"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Image preview */}
            {form.imageUrl && (
              <div className="relative rounded-lg overflow-hidden h-36 bg-muted">
                <img src={form.imageUrl} alt="preview" className="w-full h-full object-cover" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-zinc-300 text-xs">Nomi *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Mahsulot nomi"
                  className="bg-input border-border mt-1"
                />
              </div>

              <div>
                <Label className="text-zinc-300 text-xs">Narxi (so'm) *</Label>
                <Input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="15000"
                  className="bg-input border-border mt-1"
                />
              </div>

              <div>
                <Label className="text-zinc-300 text-xs">Miqdor (zaxira)</Label>
                <Input
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  placeholder="100"
                  className="bg-input border-border mt-1"
                />
              </div>

              <div className="col-span-2">
                <Label className="text-zinc-300 text-xs">Kategoriya *</Label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full mt-1 bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label} · {c.ru}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <Label className="text-zinc-300 text-xs">Rasm (ixtiyoriy)</Label>
                <div className="mt-1 space-y-2">
                  {/* Image preview */}
                  {form.imageUrl && (
                    <div className="relative rounded-lg overflow-hidden h-28 bg-zinc-800 group">
                      <img src={form.imageUrl} alt="preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, imageUrl: "" })}
                        className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  )}
                  <label className="flex items-center justify-center gap-2 w-full h-10 border border-dashed border-zinc-600 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-500/5 transition-colors text-sm text-muted-foreground hover:text-blue-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    {form.imageUrl ? "Boshqa rasm tanlash" : "Kompyuterdan rasm yuklash"}
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
                          const MAX = 240;
                          let w = img.width, h = img.height;
                          if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
                          else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
                          canvas.width = w; canvas.height = h;
                          canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
                          const dataUrl = canvas.toDataURL("image/jpeg", 0.55);
                          setForm((f) => ({ ...f, imageUrl: dataUrl }));
                          URL.revokeObjectURL(img.src);
                        };
                        img.src = URL.createObjectURL(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="col-span-2">
                <Label className="text-zinc-300 text-xs">Tavsif (ixtiyoriy)</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Mahsulot haqida qisqacha ma'lumot"
                  className="bg-input border-border mt-1"
                />
              </div>

              <div className="col-span-2 flex items-center gap-3 pt-1">
                <Switch
                  checked={form.isAvailable}
                  onCheckedChange={(v) => setForm({ ...form, isAvailable: v })}
                  className="data-[state=checked]:bg-green-600"
                />
                <Label className="text-zinc-300 text-sm">Sotuvda mavjud</Label>
              </div>
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
