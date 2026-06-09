import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  useListVenues,
  useCreateVenue,
  useDeleteVenue,
  type VenueInputType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListVenuesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Store, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function OwnerVenues() {
  const [, setLocation] = useLocation();
  const { data: venues, isLoading } = useListVenues();
  const createVenue = useCreateVenue();
  const deleteVenue = useDeleteVenue();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [form, setForm] = useState({ name: "", type: "cafe" as VenueInputType, logoUrl: "", address: "", phone: "" });

  const handleCreate = () => {
    createVenue.mutate(
      { data: { name: form.name, type: form.type, logoUrl: form.logoUrl || undefined, address: form.address || undefined, phone: form.phone || undefined } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListVenuesQueryKey() });
          setOpen(false);
          setForm({ name: "", type: "cafe", logoUrl: "", address: "", phone: "" });
          toast({ title: "Korxona qo'shildi" });
        },
        onError: () => toast({ title: "Xatolik", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Korxonani o'chirishni tasdiqlaysizmi?")) return;
    deleteVenue.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListVenuesQueryKey() });
          toast({ title: "Korxona o'chirildi" });
        },
      }
    );
  };

  const filtered = useMemo(() => {
    if (!venues) return [];
    const q = search.toLowerCase();
    return venues.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.address?.toLowerCase() || "").includes(q) ||
        (v.phone?.toLowerCase() || "").includes(q) ||
        (v.adminName?.toLowerCase() || "").includes(q)
    );
  }, [venues, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const handlePageChange = (p: number) => {
    if (p >= 1 && p <= totalPages) setPage(p);
  };

  const PER_PAGE_OPTIONS = [10, 25, 50];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Cafe va restoranlar</h1>
          <p className="text-muted-foreground mt-1 text-sm">Barcha cafe va restoranlar</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700 shrink-0" size="sm">
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Yangi Korxona</span>
        </Button>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Qidirish..."
                className="bg-input border-border pl-9 h-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
              <span>Satr:</span>
              <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); setPage(1); }}>
                <SelectTrigger className="bg-input border-border h-8 w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-input border-border">
                  {PER_PAGE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-muted-foreground text-center py-12">Yuklanmoqda...</div>
          ) : !paginated.length ? (
            <div className="text-center py-16">
              <Store className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-muted-foreground">{search ? "Topilmadi" : "Hali korxona yo'q"}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Korxona</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Turi</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Manzil</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Telefon</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Admin</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Amallar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((venue) => (
                      <tr
                        key={venue.id}
                        onClick={() => setLocation(`/owner/venues/${venue.id}`)}
                        className="border-b border-border hover:bg-muted/20 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center overflow-hidden shrink-0">
                              {venue.logoUrl ? (
                                <img src={venue.logoUrl} alt={venue.name} className="w-full h-full object-cover" />
                              ) : (
                                <Store className="h-4 w-4 text-blue-500" />
                              )}
                            </div>
                            <span className="font-medium text-foreground truncate max-w-[200px]">{venue.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs capitalize border-border text-muted-foreground">
                            {venue.type === "cafe" ? "Kafe" : "Restoran"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell truncate max-w-[180px]">
                          {venue.address || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{venue.phone || "—"}</td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {venue.adminName ? (
                            <span className="text-blue-400">{venue.adminName}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:bg-red-500/10 h-8 w-8"
                            onClick={(e) => handleDelete(venue.id, e)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} / {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page <= 1}
                    onClick={() => handlePageChange(page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                    const p = start + i;
                    if (p > totalPages) return null;
                    return (
                      <Button
                        key={p}
                        variant={p === page ? "default" : "ghost"}
                        size="icon"
                        className="h-8 w-8 text-xs"
                        onClick={() => handlePageChange(p)}
                      >
                        {p}
                      </Button>
                    );
                  })}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page >= totalPages}
                    onClick={() => handlePageChange(page + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Yangi Korxona Qo'shish</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Logo (ixtiyoriy)</Label>
              <div className="mt-1 flex items-center gap-3">
                <div className="w-16 h-16 rounded-lg border border-border bg-input overflow-hidden flex items-center justify-center shrink-0">
                  {form.logoUrl ? (
                    <img src={form.logoUrl} alt="logo" className="w-full h-full object-cover" />
                  ) : (
                    <Store className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="inline-flex items-center justify-center gap-2 h-9 px-3 border border-dashed border-border rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-500/5 transition-colors text-sm text-muted-foreground hover:text-blue-400">
                    {form.logoUrl ? "Boshqa rasm" : "Logo yuklash"}
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
                          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
                          setForm((f) => ({ ...f, logoUrl: dataUrl }));
                          URL.revokeObjectURL(img.src);
                        };
                        img.src = URL.createObjectURL(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {form.logoUrl && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, logoUrl: "" }))}
                      className="text-xs text-red-500 hover:text-red-400 text-left"
                    >
                      O'chirish
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <Label>Nomi</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Korxona nomi"
                className="bg-input border-border mt-1"
              />
            </div>
            <div>
              <Label>Turi</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as VenueInputType })}>
                <SelectTrigger className="bg-input border-border mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-input border-border">
                  <SelectItem value="cafe">Kafe</SelectItem>
                  <SelectItem value="restaurant">Restoran</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Manzil</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Manzil (ixtiyoriy)"
                className="bg-input border-border mt-1"
              />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+998901234567 (ixtiyoriy)"
                className="bg-input border-border mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Bekor qilish</Button>
            <Button
              onClick={handleCreate}
              disabled={!form.name || createVenue.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createVenue.isPending ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
