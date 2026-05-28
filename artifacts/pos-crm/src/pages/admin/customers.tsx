import { useState } from "react";
import {
  useListCustomers,
  useCreateCustomer,
  useListDebts,
  getListCustomersQueryKey,
  getListDebtsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, UsersRound, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " so'm";
}

export default function AdminCustomers() {
  const { user } = useAuth();
  const venueId = user?.venueId ?? 0;
  const { data: customers, isLoading } = useListCustomers(venueId, { query: { enabled: !!venueId, queryKey: getListCustomersQueryKey(venueId) } });
  const { data: debts } = useListDebts(venueId, { query: { enabled: !!venueId, queryKey: getListDebtsQueryKey(venueId) } });
  const createCustomer = useCreateCustomer();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [search, setSearch] = useState("");

  const debtByCustomer = (debts ?? []).reduce<Record<number, number>>((acc, d) => {
    if (d.status !== "paid") {
      acc[d.customerId] = (acc[d.customerId] ?? 0) + (d.remaining ?? d.amount);
    }
    return acc;
  }, {});

  const filtered = (customers ?? []).filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? "").includes(search)
  );

  const handleCreate = () => {
    createCustomer.mutate(
      { venueId, data: { name: form.name, phone: form.phone || undefined } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListCustomersQueryKey(venueId) });
          setOpen(false);
          setForm({ name: "", phone: "" });
          toast({ title: "Mijoz qo'shildi" });
        },
        onError: () => toast({ title: "Xatolik", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mijozlar</h1>
          <p className="text-muted-foreground mt-1">{customers?.length ?? 0} ta mijoz</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Yangi Mijoz
        </Button>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Ism yoki telefon bo'yicha qidirish..."
        className="bg-card border-border text-foreground"
      />

      {isLoading ? (
        <div className="text-muted-foreground">Yuklanmoqda...</div>
      ) : !filtered.length ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <UsersRound className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-muted-foreground">Mijoz topilmadi</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const debt = debtByCustomer[c.id] ?? 0;
            return (
              <Card key={c.id} className="bg-card border-border">
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-600/20 flex items-center justify-center text-sm font-bold text-blue-400">
                      {c.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{c.name}</p>
                      {c.phone && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </p>
                      )}
                    </div>
                  </div>
                  {debt > 0 ? (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Qarz</p>
                      <p className="text-red-400 font-semibold">{fmt(debt)}</p>
                    </div>
                  ) : (
                    <span className="text-xs text-green-400">Qarz yo'q</span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Yangi Mijoz Qo'shish</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Ism</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Mijoz ismi" className="bg-input border-border mt-1" />
            </div>
            <div>
              <Label>Telefon (ixtiyoriy)</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+998901234567" className="bg-input border-border mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Bekor</Button>
            <Button onClick={handleCreate} disabled={!form.name || createCustomer.isPending} className="bg-blue-600 hover:bg-blue-700">
              {createCustomer.isPending ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
