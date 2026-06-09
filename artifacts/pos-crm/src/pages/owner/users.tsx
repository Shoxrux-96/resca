import { useState, useMemo } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  useListUsers,
  useCreateUser,
  useListVenues,
  getListUsersQueryKey,
  type UserInputRole,
} from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Search, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type FormState = {
  username: string;
  password: string;
  name: string;
  role: UserInputRole;
  venueId: string;
};

const emptyForm: FormState = { username: "", password: "", name: "", role: "admin", venueId: "" };

const roleBadge = (role: string) => {
  if (role === "owner") return { label: "Egasi", cls: "bg-purple-600/20 text-purple-400 border-purple-800" };
  if (role === "admin") return { label: "Admin", cls: "bg-blue-600/20 text-blue-400 border-blue-800" };
  if (role === "waiter") return { label: "Afitsiant", cls: "bg-green-600/20 text-green-400 border-green-800" };
  if (role === "kassir") return { label: "Kassir", cls: "bg-yellow-600/20 text-yellow-400 border-yellow-800" };
  if (role === "oshpaz") return { label: "Oshpaz", cls: "bg-orange-600/20 text-orange-400 border-orange-800" };
  if (role === "dastavkachi") return { label: "Dastavkachi", cls: "bg-cyan-600/20 text-cyan-400 border-cyan-800" };
  return { label: role, cls: "bg-zinc-600/20 text-zinc-400 border-zinc-800" };
};

const ALL_ROLES = ["admin", "waiter", "kassir", "oshpaz", "dastavkachi", "owner"];

export default function OwnerUsers() {
  const { data: users, isLoading } = useListUsers();
  const { data: venues } = useListVenues();
  const createUser = useCreateUser();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{ id: number } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [venueFilter, setVenueFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      customFetch(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setOpen(false);
      setEditingUser(null);
      setForm(emptyForm);
      toast({ title: "Foydalanuvchi yangilandi" });
    },
    onError: (err: Error) => toast({ title: err.message || "Xatolik", variant: "destructive" }),
  });

  const deleteUser = useMutation({
    mutationFn: (id: number) => customFetch(`/api/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setDeleteConfirm(null);
      toast({ title: "Foydalanuvchi o'chirildi" });
    },
    onError: (err: Error) => toast({ title: err.message || "Xatolik", variant: "destructive" }),
  });

  const openCreate = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (u: { id: number; username: string; name?: string | null; role: string; venueId?: number | null }) => {
    setEditingUser({ id: u.id });
    setForm({
      username: u.username,
      password: "",
      name: u.name ?? "",
      role: u.role as UserInputRole,
      venueId: u.venueId ? String(u.venueId) : "",
    });
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.username) {
      toast({ title: "Foydalanuvchi nomini kiriting", variant: "destructive" });
      return;
    }
    if (editingUser) {
      const data: Record<string, unknown> = { username: form.username, name: form.name || null, role: form.role, venueId: form.venueId ? Number(form.venueId) : null };
      if (form.password) data.password = form.password;
      updateUser.mutate({ id: editingUser.id, data });
    } else {
      if (!form.password) {
        toast({ title: "Parolni kiriting", variant: "destructive" });
        return;
      }
      createUser.mutate(
        {
          data: {
            username: form.username,
            password: form.password,
            name: form.name || undefined,
            role: form.role,
            venueId: form.venueId ? Number(form.venueId) : null,
          },
        },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
            setOpen(false);
            setForm(emptyForm);
            toast({ title: "Foydalanuvchi qo'shildi" });
          },
          onError: () => toast({ title: "Xatolik", variant: "destructive" }),
        }
      );
    }
  };

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = search.toLowerCase();
    return users.filter((u) => {
      const nameMatch = u.name?.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
      const roleMatch = roleFilter === "all" || u.role === roleFilter;
      const venueMatch = venueFilter === "all" || String(u.venueId ?? "") === venueFilter;
      return nameMatch && roleMatch && venueMatch;
    });
  }, [users, search, roleFilter, venueFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const PER_PAGE_OPTIONS = [10, 25, 50];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Foydalanuvchilar</h1>
          <p className="text-muted-foreground mt-1 text-sm">Barcha foydalanuvchilar</p>
        </div>
        <Button onClick={openCreate} className="bg-[#E0714F] hover:bg-[#D06040] shrink-0" size="sm">
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Yangi Foydalanuvchi</span>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Ism yoki username bo'yicha..."
            className="bg-input border-border pl-9 h-9 text-sm"
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
          <SelectTrigger className="bg-input border-border h-9 w-[130px] text-sm">
            <SelectValue placeholder="Rol" />
          </SelectTrigger>
          <SelectContent className="bg-input border-border">
            <SelectItem value="all">Barcha rollar</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="waiter">Afitsiant</SelectItem>
            <SelectItem value="kassir">Kassir</SelectItem>
            <SelectItem value="oshpaz">Oshpaz</SelectItem>
            <SelectItem value="dastavkachi">Dastavkachi</SelectItem>
            <SelectItem value="owner">Egasi</SelectItem>
          </SelectContent>
        </Select>
        <Select value={venueFilter} onValueChange={(v) => { setVenueFilter(v); setPage(1); }}>
          <SelectTrigger className="bg-input border-border h-9 w-[170px] text-sm">
            <SelectValue placeholder="Korxona" />
          </SelectTrigger>
          <SelectContent className="bg-input border-border">
            <SelectItem value="all">Barcha korxonalar</SelectItem>
            <SelectItem value="none">Biriktirilmagan</SelectItem>
            {venues?.map((v) => (
              <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-muted-foreground text-center py-12">Yuklanmoqda...</div>
          ) : !paginated.length ? (
            <div className="text-center py-16">
              <Users className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-muted-foreground">Foydalanuvchi topilmadi</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Foydalanuvchi</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Username</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Rol</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Korxona</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Amallar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((u) => {
                      const rb = roleBadge(u.role);
                      return (
                        <tr key={u.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-muted-foreground">
                                  {(u.name || u.username).charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <span className="font-medium text-foreground truncate max-w-[180px]">{u.name || u.username}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">@{u.username}</td>
                          <td className="px-4 py-3"><Badge variant="outline" className={rb.cls}>{rb.label}</Badge></td>
                          <td className="px-4 py-3 text-muted-foreground hidden md:table-cell truncate max-w-[180px]">
                            {u.venueName || <span className="text-xs italic">Biriktirilmagan</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {u.role !== "owner" && (
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openEdit(u)} className="p-1.5 text-muted-foreground hover:text-[#E0714F] transition-colors" title="Tahrirlash">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm({ id: u.id, name: u.name || u.username })}
                                  className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
                                  title="O'chirish"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} / {filtered.length}
                  </span>
                  <span className="text-border">|</span>
                  <span>Satr:</span>
                  <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); setPage(1); }}>
                    <SelectTrigger className="bg-input border-border h-7 w-14 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-input border-border">
                      {PER_PAGE_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                    const p = start + i;
                    if (p > totalPages) return null;
                    return (
                      <Button key={p} variant={p === page ? "default" : "ghost"} size="icon" className="h-7 w-7 text-xs" onClick={() => setPage(p)}>
                        {p}
                      </Button>
                    );
                  })}
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) { setEditingUser(null); setForm(emptyForm); } setOpen(v); }}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Foydalanuvchini tahrirlash" : "Yangi Foydalanuvchi"}</DialogTitle>
            {editingUser && <DialogDescription className="text-muted-foreground">Parolni o'zgartirish uchun yangi parol kiriting</DialogDescription>}
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Ism</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="To'liq ism" className="bg-input border-border mt-1" />
            </div>
            <div>
              <Label>Foydalanuvchi nomi</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="username" className="bg-input border-border mt-1" />
            </div>
            <div>
              <Label>{editingUser ? "Yangi parol (bo'sh qoldirilsa o'zgarmaydi)" : "Parol"}</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editingUser ? "Yangi parol" : "Parol"} className="bg-input border-border mt-1" />
            </div>
            <div>
              <Label>Roli</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as UserInputRole })}>
                <SelectTrigger className="bg-input border-border mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-input border-border">
                  {ALL_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{roleBadge(r).label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.role !== "owner" && (
              <div>
                <Label>Cafe / Restoran</Label>
                <Select value={form.venueId} onValueChange={(v) => setForm({ ...form, venueId: v })}>
                  <SelectTrigger className="bg-input border-border mt-1">
                    <SelectValue placeholder="Biriktirmaslik uchun bo'sh qoldiring" />
                  </SelectTrigger>
                  <SelectContent className="bg-input border-border">
                    <SelectItem value="none">Biriktirilmagan</SelectItem>
                    {venues?.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); setEditingUser(null); setForm(emptyForm); }}>Bekor</Button>
            <Button
              onClick={handleSave}
              disabled={!form.username || (!editingUser && !form.password) || createUser.isPending || updateUser.isPending}
              className="bg-[#E0714F] hover:bg-[#D06040]"
            >
              {createUser.isPending || updateUser.isPending ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle>Foydalanuvchini o'chirish</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              "{deleteConfirm?.name}" foydalanuvchisini o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Bekor qilish</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteUser.mutate(deleteConfirm.id)}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? "O'chirilmoqda..." : "O'chirish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
