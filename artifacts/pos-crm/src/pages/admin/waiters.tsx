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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Users, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const emptyForm = { username: "", password: "", name: "" };

export default function AdminWaiters() {
  const { user } = useAuth();
  const venueId = user?.venueId ?? 0;
  const qc = useQueryClient();
  const { toast } = useToast();

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showPass, setShowPass] = useState(false);

  const { data: waiters, isLoading } = useListWaiters(venueId, {
    query: { enabled: !!venueId, queryKey: getListWaitersQueryKey(venueId) },
  });

  const createWaiter = useCreateWaiter();
  const deleteWaiter = useDeleteWaiter();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListWaitersQueryKey(venueId) });

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
    createWaiter.mutate(
      {
        venueId,
        data: {
          username: form.username.trim(),
          password: form.password,
          name: form.name.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setModal(false);
          toast({ title: "Afitsiant qo'shildi" });
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? "Xatolik yuz berdi";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = (id: number, username: string) => {
    if (!confirm(`"${username}" ni o'chirasizmi?`)) return;
    deleteWaiter.mutate(
      { venueId, waiterId: id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Afitsiant o'chirildi" });
        },
        onError: () => toast({ title: "Xatolik", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Afitsiantlar</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {(waiters ?? []).length} ta afitsiant
          </p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700 text-foreground" onClick={handleOpen}>
          <Plus className="h-4 w-4 mr-2" />
          Afitsiant qo'shish
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-muted-foreground text-center py-16">Yuklanmoqda...</div>
      ) : (waiters ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-2xl text-muted-foreground">
          <Users className="h-16 w-16 mb-3 opacity-30" />
          <p className="text-lg font-medium">Afitsiant yo'q</p>
          <p className="text-sm mt-1">Birinchi afitsiantni qo'shing</p>
          <Button className="mt-4 bg-blue-600 hover:bg-blue-700 text-foreground" onClick={handleOpen}>
            <Plus className="h-4 w-4 mr-2" />
            Qo'shish
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {(waiters ?? []).map((w) => (
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
                <p className="font-semibold text-foreground">
                  {w.name ? w.name : w.username}
                </p>
                <p className="text-sm text-muted-foreground">@{w.username}</p>
              </div>

              {/* Date */}
              <div className="text-xs text-muted-foreground hidden sm:block">
                {new Date(w.createdAt).toLocaleDateString("uz-UZ")}
              </div>

              {/* Delete */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(w.id, w.username)}
                className="text-red-500 hover:text-red-400 hover:bg-red-500/10 h-8 w-8 p-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Yangi Afitsiant</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-zinc-300">Ism (ixtiyoriy)</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Masalan: Sardor Karimov"
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
              disabled={createWaiter.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-foreground"
            >
              {createWaiter.isPending ? "Saqlanmoqda..." : "Qo'shish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
