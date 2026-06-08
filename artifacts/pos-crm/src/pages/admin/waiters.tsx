import { useState } from "react";
import {
  useListWaiters,
  useCreateWaiter,
  useDeleteWaiter,
  getListWaitersQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Users, Eye, EyeOff, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ROLES = [
  { value: "kassir", label: "Kassir", color: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  { value: "waiter", label: "Afitsiant", color: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  { value: "oshpaz", label: "Oshpaz", color: "bg-green-500/10 text-green-500 border-green-500/30" },
  { value: "mangalchi", label: "Mangalchi", color: "bg-orange-500/10 text-orange-500 border-orange-500/30" },
  { value: "dastavkachi", label: "Dastavkachi", color: "bg-purple-500/10 text-purple-500 border-purple-500/30" },
] as const;

type StaffRole = (typeof ROLES)[number]["value"];

const emptyForm = { username: "", password: "", name: "", phone: "", role: "waiter" as StaffRole };

function getRoleMeta(role: string | null | undefined) {
  return ROLES.find((r) => r.value === role) ?? { value: role ?? "", label: role ?? "Noma'lum", color: "bg-muted text-muted-foreground border-border" };
}

export default function AdminStaff() {
  const { user } = useAuth();
  const venueId = user?.venueId ?? 0;
  const qc = useQueryClient();
  const { toast } = useToast();

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showPass, setShowPass] = useState(false);
  const [filterRole, setFilterRole] = useState<string>("all");

  const { data: staff, isLoading } = useListWaiters(venueId, {
    query: { enabled: !!venueId, queryKey: getListWaitersQueryKey(venueId) },
  });

  const createStaff = useCreateWaiter();
  const deleteStaff = useDeleteWaiter();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListWaitersQueryKey(venueId) });

  const filtered = (staff ?? []).filter((s) => filterRole === "all" || s.role === filterRole);

  const handleOpen = () => {
    setForm(emptyForm);
    setShowPass(false);
    setModal(true);
  };

  const handleCreate = () => {
    if (!form.username.trim() || !form.password) {
      toast({ title: "Username va parol kerak", variant: "destructive" });
      return;
    }
    if (form.password.length < 4) {
      toast({ title: "Parol kamida 4 ta belgi bo'lishi kerak", variant: "destructive" });
      return;
    }
    if (!form.name.trim()) {
      toast({ title: "Ism familiya kerak", variant: "destructive" });
      return;
    }
    createStaff.mutate(
      {
        venueId,
        data: {
          username: form.username.trim(),
          password: form.password,
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          role: form.role,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setModal(false);
          toast({ title: "Hodim qo'shildi" });
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? err?.message ?? "Xatolik yuz berdi";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`"${name}" ni o'chirasizmi?`)) return;
    deleteStaff.mutate(
      { venueId, waiterId: id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Hodim o'chirildi" });
        },
        onError: () => toast({ title: "Xatolik", variant: "destructive" }),
      }
    );
  };

  const roleCounts = ROLES.map((r) => ({
    ...r,
    count: (staff ?? []).filter((s) => s.role === r.value).length,
  }));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Hodimlar</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {(staff ?? []).length} ta hodim
          </p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700 text-foreground" onClick={handleOpen}>
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Hodim qo'shish</span>
        </Button>
      </div>

      {/* Role stats */}
      <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 md:grid-cols-5 sm:overflow-visible">
        {roleCounts.map((r) => (
          <button
            key={r.value}
            onClick={() => setFilterRole(filterRole === r.value ? "all" : r.value)}
            className={`rounded-xl border p-3 text-left transition-all shrink-0 w-28 sm:w-auto ${
              filterRole === r.value ? "ring-2 ring-blue-500 " + r.color : "bg-card border-border hover:border-blue-700"
            }`}
          >
            <p className="text-[10px] sm:text-xs text-muted-foreground">{r.label}</p>
            <p className="text-lg font-bold text-foreground">{r.count}</p>
          </button>
        ))}
      </div>

      {filterRole !== "all" && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            Filtr: {getRoleMeta(filterRole).label}
          </Badge>
          <button onClick={() => setFilterRole("all")} className="text-xs text-blue-500 hover:underline">
            Barchasini ko'rsatish
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="text-muted-foreground text-center py-16">Yuklanmoqda...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-2xl text-muted-foreground">
          <Users className="h-16 w-16 mb-3 opacity-30" />
          <p className="text-lg font-medium">Hodim yo'q</p>
          <p className="text-sm mt-1">Birinchi hodimni qo'shing</p>
          <Button className="mt-4 bg-blue-600 hover:bg-blue-700 text-foreground" onClick={handleOpen}>
            <Plus className="h-4 w-4 mr-2" />
            Qo'shish
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((w) => {
            const meta = getRoleMeta(w.role);
            return (
              <div
                key={w.id}
                className="flex items-center gap-4 bg-card border border-border rounded-xl px-5 py-4"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-foreground shrink-0">
                  {(w.name || w.username).charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground truncate">
                      {w.name || w.username}
                    </p>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${meta.color}`}>
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">@{w.username}</p>
                  {w.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="h-3 w-3" />
                      {w.phone}
                    </p>
                  )}
                </div>

                {/* Date */}
                <div className="text-xs text-muted-foreground hidden sm:block">
                  {new Date(w.createdAt).toLocaleDateString("uz-UZ")}
                </div>

                {/* Delete */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(w.id, w.name || w.username)}
                  className="text-red-500 hover:text-red-400 hover:bg-red-500/10 h-8 w-8 p-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Yangi Hodim Qo'shish</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-zinc-300">Lavozim *</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as StaffRole }))}>
                <SelectTrigger className="mt-1.5 bg-input border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-zinc-300">Ism Familiya *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Masalan: Sardor Karimov"
                className="mt-1.5 bg-input border-border text-foreground"
              />
            </div>

            <div>
              <Label className="text-zinc-300">Telefon raqam (ixtiyoriy)</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+998 90 123 45 67"
                className="mt-1.5 bg-input border-border text-foreground"
              />
            </div>

            <div>
              <Label className="text-zinc-300">Username *</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="Masalan: sardor01"
                className="mt-1.5 bg-input border-border text-foreground"
                autoComplete="off"
              />
            </div>

            <div>
              <Label className="text-zinc-300">Parol *</Label>
              <div className="relative mt-1.5">
                <Input
                  type={showPass ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Kamida 4 ta belgi"
                  className="bg-input border-border text-foreground pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-zinc-300"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModal(false)}
              className="border-border text-foreground hover:bg-accent"
            >
              Bekor qilish
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createStaff.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-foreground"
            >
              {createStaff.isPending ? "Saqlanmoqda..." : "Qo'shish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
