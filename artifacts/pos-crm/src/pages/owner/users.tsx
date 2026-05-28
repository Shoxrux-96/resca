import { useState } from "react";
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
import { Plus, Users, User, Pencil, Trash2 } from "lucide-react";
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
  return { label: role, cls: "bg-zinc-600/20 text-zinc-400 border-zinc-800" };
};

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Foydalanuvchilar</h1>
          <p className="text-muted-foreground mt-1 text-sm">Barcha admin va owner'lar</p>
        </div>
        <Button onClick={openCreate} className="bg-[#E0714F] hover:bg-[#D06040] shrink-0" size="sm">
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Yangi Foydalanuvchi</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Yuklanmoqda...</div>
      ) : !users?.length ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-muted-foreground">Foydalanuvchi topilmadi</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const rb = roleBadge(u.role);
            return (
              <Card key={u.id} className="bg-card border-border">
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{u.name || u.username}</p>
                      <p className="text-sm text-muted-foreground">@{u.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {u.venueName && (
                      <span className="text-sm text-muted-foreground">{u.venueName}</span>
                    )}
                    <Badge variant="outline" className={rb.cls}>{rb.label}</Badge>
                    {u.role !== "owner" && (
                      <>
                        <button onClick={() => openEdit(u)} className="text-muted-foreground hover:text-[#E0714F] transition-colors" title="Tahrirlash">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ id: u.id, name: u.name || u.username })}
                          className="text-muted-foreground hover:text-red-500 transition-colors"
                          title="O'chirish"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="waiter">Afitsiant</SelectItem>
                  <SelectItem value="owner">Egasi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(form.role === "admin" || form.role === "waiter") && (
              <div>
                <Label>Cafe / Restoran (ixtiyoriy)</Label>
                <Select value={form.venueId} onValueChange={(v) => setForm({ ...form, venueId: v })}>
                  <SelectTrigger className="bg-input border-border mt-1">
                    <SelectValue placeholder="Cafe/restoran tanlang" />
                  </SelectTrigger>
                  <SelectContent className="bg-input border-border">
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
