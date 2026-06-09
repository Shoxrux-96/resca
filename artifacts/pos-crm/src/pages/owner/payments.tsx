import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Search, DollarSign, ChevronLeft, ChevronRight, Plus, Building2, CalendarDays, Pencil } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ").format(n) + " so'm";
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("uz-UZ", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleDateString("uz-UZ", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Payment = {
  id: number;
  venueId: number;
  subscriptionId: number | null;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  billingCycle: string;
  notes: string | null;
  paidAt: string | null;
  createdAt: string;
  venueName: string | null;
};

type Venue = { id: number; name: string; type: string };

type TariffPlan = {
  id: number; name: string; monthlyPrice: number; yearlyPrice: number;
};

type VenueSubscription = {
  id: number; venueId: number; tariffPlanId: number;
  billingCycle: string; status: string;
  tariffPlan: TariffPlan | null;
};

function getToken(): string | null {
  try {
    const stored = localStorage.getItem("restoCrm_auth");
    if (stored) return JSON.parse(stored).token ?? null;
  } catch {}
  return null;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (init?.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || await res.text());
  return res.json();
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-green-500/10 text-green-400",
    pending: "bg-yellow-500/10 text-yellow-400",
    failed: "bg-red-500/10 text-red-400",
    refunded: "bg-purple-500/10 text-purple-400",
    active: "bg-green-500/10 text-green-400",
    expired: "bg-red-500/10 text-red-400",
    cancelled: "bg-zinc-500/10 text-zinc-400",
    trial: "bg-blue-500/10 text-blue-400",
  };
  const labels: Record<string, string> = {
    paid: "To'langan", pending: "Kutilmoqda", failed: "Muvaffaqiyatsiz", refunded: "Qaytarilgan",
    active: "Faol", expired: "Muddati o'tgan", cancelled: "Bekor qilingan", trial: "Sinov",
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${styles[status] || "bg-zinc-500/10 text-zinc-400"}`}>
      {labels[status] || status}
    </span>
  );
}

export default function OwnerPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 25;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const { toast } = useToast();

  const load = () => apiFetch<Payment[]>("/api/payments").then(setPayments);

  useEffect(() => { load().catch(console.error).finally(() => setLoading(false)); }, []);

  const filtered = payments.filter((p) => {
    const q = search.toLowerCase();
    if (q && !p.venueName?.toLowerCase().includes(q)) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  const totalAmount = filtered.reduce((sum, p) => sum + p.amount, 0);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const openCreate = () => { setEditingPayment(null); setDialogOpen(true); };
  const openEdit = (p: Payment) => { setEditingPayment(p); setDialogOpen(true); };

  const handleSaved = () => {
    setDialogOpen(false);
    setEditingPayment(null);
    load().catch(console.error);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Yuklanmoqda...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">To'lovlar</h1>
          <p className="text-muted-foreground mt-1">Barcha to'lovlar tarixi</p>
        </div>
        <Button onClick={openCreate} className="bg-green-600 hover:bg-green-700">
          <Plus className="h-4 w-4 mr-1" /> Yangi to'lov
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Jami to'lovlar</CardTitle>
          </CardHeader>
          <CardContent><div className="text-lg font-bold text-foreground">{payments.length} ta</div></CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Umumiy summa</CardTitle>
          </CardHeader>
          <CardContent><div className="text-lg font-bold text-green-400">{fmt(totalAmount)}</div></CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">To'langan</CardTitle>
          </CardHeader>
          <CardContent><div className="text-lg font-bold text-foreground">{payments.filter((p) => p.status === "paid").length} ta</div></CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Kutilayotgan</CardTitle>
          </CardHeader>
          <CardContent><div className="text-lg font-bold text-yellow-400">{payments.filter((p) => p.status === "pending").length} ta</div></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Korxona nomi bo'yicha qidirish..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-input border-border" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44 bg-input border-border">
            <SelectValue placeholder="Holat" />
          </SelectTrigger>
          <SelectContent className="bg-input border-border">
            <SelectItem value="all">Barcha holatlar</SelectItem>
            <SelectItem value="paid">To'langan</SelectItem>
            <SelectItem value="pending">Kutilmoqda</SelectItem>
            <SelectItem value="failed">Muvaffaqiyatsiz</SelectItem>
            <SelectItem value="refunded">Qaytarilgan</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Payments Table */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-foreground text-sm">To'lovlar ro'yxati</CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-0">
          {paged.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">To'lovlar topilmadi</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">#</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Korxona</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Summa</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Sikl</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">To'lov usuli</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Sana</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Holat</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Amallar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((p) => (
                      <tr key={p.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground text-xs">{p.id}</td>
                        <td className="px-4 py-3">
                          <a href={`/owner/venues/${p.venueId}`} className="font-medium text-foreground hover:text-primary transition-colors">
                            {p.venueName || `#${p.venueId}`}
                          </a>
                        </td>
                        <td className="px-4 py-3"><span className="font-semibold text-foreground">{fmt(p.amount)}</span></td>
                        <td className="px-4 py-3 text-muted-foreground">{p.billingCycle === "yearly" ? "Yillik" : "Oylik"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.paymentMethod || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(p.createdAt)}</td>
                        <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                        <td className="px-4 py-3">
                          {p.status !== "paid" ? (
                            <button onClick={() => openEdit(p)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) pageNum = i + 1;
                    else if (page <= 3) pageNum = i + 1;
                    else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = page - 2 + i;
                    return (
                      <button key={pageNum} onClick={() => setPage(pageNum)}
                        className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${page === pageNum ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}>
                        {pageNum}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setEditingPayment(null); setDialogOpen(false); } }}>
        <DialogContent className="bg-card border-border max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingPayment ? "To'lovni tahrirlash" : "Yangi to'lov qo'shish"}
            </DialogTitle>
          </DialogHeader>
          <PaymentForm key={editingPayment?.id || "new"} payment={editingPayment} onSuccess={handleSaved} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentForm({ payment, onSuccess }: { payment: Payment | null; onSuccess: () => void }) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueQuery, setVenueQuery] = useState("");
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [subscription, setSubscription] = useState<VenueSubscription | null>(null);
  const [amount, setAmount] = useState("");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [status, setStatus] = useState("paid");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingError, setSavingError] = useState<string | null>(null);
  const { toast } = useToast();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isEdit = !!payment;

  useEffect(() => {
    apiFetch<Venue[]>("/api/venues").then((v) => {
      setVenues(v);
      if (payment) {
        const match = v.find((x) => x.id === payment.venueId);
        if (match) {
          setSelectedVenue(match);
          setVenueQuery(match.name);
        }
        setAmount(String(payment.amount));
        setBillingCycle(payment.billingCycle);
        setStatus(payment.status);
        setPaymentMethod(payment.paymentMethod || "none");
        setNotes(payment.notes || "");
      }
    }).catch(() => {});
  }, [payment]);

  const filteredVenues = venues.filter((v) =>
    v.name.toLowerCase().includes(venueQuery.toLowerCase())
  );

  const selectVenue = (v: Venue) => {
    setSelectedVenue(v);
    setVenueQuery(v.name);
    if (!isEdit) {
      apiFetch<VenueSubscription | null>(`/api/venues/${v.id}/subscription`).then((s) => {
        setSubscription(s);
        if (s?.tariffPlan) {
          setBillingCycle(s.billingCycle);
          setAmount(String(s.billingCycle === "yearly" ? s.tariffPlan.yearlyPrice : s.tariffPlan.monthlyPrice));
        }
      }).catch(() => {});
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVenue) return;
    setSaving(true);
    setSavingError(null);
    try {
      const body = {
        venueId: selectedVenue.id,
        subscriptionId: subscription?.id ?? null,
        amount: Number(amount),
        currency: "UZS",
        status,
        paymentMethod: paymentMethod === "none" ? null : paymentMethod,
        billingCycle,
        notes: notes || null,
      };
      if (isEdit) {
        await apiFetch(`/api/payments/${payment!.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast({ title: "To'lov yangilandi" });
      } else {
        await apiFetch("/api/payments", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "To'lov qo'shildi" });
      }
      onSuccess();
    } catch (e: any) {
      const msg = e.message || "Xatolik yuz berdi";
      setSavingError(msg);
      toast({ title: "Xatolik", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Venue Search */}
      <div className="space-y-2 relative">
        <Label className="text-foreground">Korxona</Label>
        <Input
          placeholder="Korxona nomini yozing..."
          value={venueQuery}
          onChange={(e) => { setVenueQuery(e.target.value); setSelectedVenue(null); setSubscription(null); }}
          className="bg-input border-border"
        />
        {venueQuery && !selectedVenue && filteredVenues.length > 0 && (
          <div ref={dropdownRef} className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filteredVenues.map((v) => (
              <button key={v.id} type="button" onClick={() => selectVenue(v)}
                className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {v.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Venue Info */}
      {subscription && (
        <div className="p-3 bg-muted/20 rounded-lg border border-border">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            Faol obuna: <span className="font-medium text-foreground">{subscription.tariffPlan?.name || "—"}</span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-foreground">Summa (so'm)</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required className="bg-input border-border" />
        </div>
        <div className="space-y-2">
          <Label className="text-foreground">To'lov sikli</Label>
          <Select value={billingCycle} onValueChange={setBillingCycle}>
            <SelectTrigger className="bg-input border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-input border-border">
              <SelectItem value="monthly">Oylik</SelectItem>
              <SelectItem value="yearly">Yillik</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-foreground">Holat</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="bg-input border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-input border-border">
              <SelectItem value="paid">To'langan</SelectItem>
              <SelectItem value="pending">Kutilmoqda</SelectItem>
              <SelectItem value="failed">Muvaffaqiyatsiz</SelectItem>
              <SelectItem value="refunded">Qaytarilgan</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-foreground">To'lov usuli</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="bg-input border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-input border-border">
              <SelectItem value="cash">Naqd</SelectItem>
              <SelectItem value="card">Karta</SelectItem>
              <SelectItem value="transfer">Pul o'tkazmasi</SelectItem>
              <SelectItem value="click">Click</SelectItem>
              <SelectItem value="payme">Payme</SelectItem>
              <SelectItem value="uzum">Uzum</SelectItem>
              <SelectItem value="none">Ko'rsatilmagan</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-foreground">Izoh</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Qo'shimcha ma'lumot..." className="bg-input border-border" />
      </div>

      {savingError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          {savingError}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onSuccess} disabled={saving}>Bekor qilish</Button>
        <Button type="submit" disabled={saving || !selectedVenue || !amount} className="bg-green-600 hover:bg-green-700">
          {saving ? "Saqlanmoqda..." : isEdit ? "Yangilash" : "To'lovni qo'shish"}
        </Button>
      </div>
    </form>
  );
}
