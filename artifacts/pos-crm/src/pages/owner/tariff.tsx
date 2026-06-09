import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, CheckCircle, XCircle, Clock, DollarSign, CalendarDays, Zap,
  Plus, Pencil, Trash2,
} from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ").format(n) + " so'm";
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("uz-UZ", { day: "2-digit", month: "short", year: "numeric" });
}

type TariffPlan = {
  id: number;
  name: string;
  description: string | null;
  monthlyPrice: number;
  yearlyPrice: number;
  maxProducts: number | null;
  maxStaff: number | null;
  featuresJson: string | null;
  trialDays: number | null;
  isActive: boolean;
  createdAt: string;
};

type VenueSubscription = {
  id: number;
  venueId: number;
  tariffPlanId: number;
  startDate: string;
  endDate: string;
  status: string;
  billingCycle: string;
  autoRenew: boolean;
  createdAt: string;
  updatedAt: string;
  tariffPlan: TariffPlan | null;
  venueName: string | null;
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

function parseFeatures(featuresJson: string | null): string[] {
  if (!featuresJson) return [];
  try { return JSON.parse(featuresJson); } catch { return [featuresJson]; }
}

function StatusBadge({ status }: { status: string }) {
  const s: Record<string, string> = {
    active: "bg-green-500/10 text-green-400",
    expired: "bg-red-500/10 text-red-400",
    cancelled: "bg-zinc-500/10 text-zinc-400",
    trial: "bg-blue-500/10 text-blue-400",
  };
  const l: Record<string, string> = {
    active: "Faol", expired: "Muddati o'tgan", cancelled: "Bekor qilingan", trial: "Sinov",
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${s[status] || "bg-zinc-500/10 text-zinc-400"}`}>
      {l[status] || status}
    </span>
  );
}

export default function OwnerTariff() {
  const [plans, setPlans] = useState<TariffPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<VenueSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TariffPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = () => Promise.all([
    apiFetch<TariffPlan[]>("/api/tariff-plans"),
    apiFetch<VenueSubscription[]>("/api/subscriptions"),
  ]).then(([p, s]) => { setPlans(p); setSubscriptions(s); });

  useEffect(() => { load().catch(console.error).finally(() => setLoading(false)); }, []);

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (plan: TariffPlan) => { setEditing(plan); setDialogOpen(true); };

  const handleSave = async (form: FormData) => {
    setSaving(true);
    try {
      const body = {
        name: form.get("name") as string,
        description: (form.get("description") as string) || null,
        monthlyPrice: Number(form.get("monthlyPrice")) || 0,
        yearlyPrice: Number(form.get("yearlyPrice")) || 0,
        maxProducts: form.get("maxProducts") === "" ? null : Number(form.get("maxProducts")),
        maxStaff: form.get("maxStaff") === "" ? null : Number(form.get("maxStaff")),
        trialDays: form.get("trialDays") === "" ? null : Number(form.get("trialDays")),
        featuresJson: (() => {
          const raw = form.get("featuresJson") as string;
          if (!raw) return null;
          const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
          return JSON.stringify(lines);
        })(),
        isActive: form.get("isActive") === "true",
      };
      if (editing) {
        await apiFetch(`/api/tariff-plans/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast({ title: "Tarif reja yangilandi" });
      } else {
        await apiFetch("/api/tariff-plans", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Tarif reja yaratildi" });
      }
      setDialogOpen(false);
      await load();
    } catch (e: any) {
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (plan: TariffPlan) => {
    if (!confirm(`"${plan.name}" tarif rejasini o'chirishni tasdiqlaysizmi?`)) return;
    try {
      await apiFetch(`/api/tariff-plans/${plan.id}`, { method: "DELETE" });
      toast({ title: "Tarif reja o'chirildi" });
      await load();
    } catch (e: any) {
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Yuklanmoqda...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tarif rejalari</h1>
          <p className="text-muted-foreground mt-1">Korxonalaringiz uchun mavjud tarif rejalari</p>
        </div>
        <Button onClick={openCreate} className="bg-purple-600 hover:bg-purple-700">
          <Plus className="h-4 w-4 mr-1" /> Yangi tarif
        </Button>
      </div>

      {/* Active Subscriptions */}
      {subscriptions.filter((s) => s.status === "active").length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-foreground text-sm">Faol obunalar</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {subscriptions.filter((s) => s.status === "active").map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                      <Zap className="h-4 w-4 text-green-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">
                        {s.venueName || `#${s.venueId}`} — {s.tariffPlan?.name || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.billingCycle === "yearly" ? "Yillik" : "Oylik"} · {fmtDate(s.startDate)} — {fmtDate(s.endDate)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-green-400 text-sm">
                      {s.billingCycle === "yearly"
                        ? fmt(s.tariffPlan?.yearlyPrice ?? 0)
                        : fmt(s.tariffPlan?.monthlyPrice ?? 0)}
                    </p>
                    <StatusBadge status={s.status} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tariff Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const features: string[] = parseFeatures(plan.featuresJson);
          return (
            <Card key={plan.id} className={`bg-card border-border relative overflow-hidden ${plan.isActive ? "" : "opacity-50"}`}>
              {!plan.isActive && (
                <div className="absolute top-2 right-2">
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Nofaol</Badge>
                </div>
              )}
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    <CardTitle className="text-foreground text-lg">{plan.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(plan)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(plan)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {plan.description && (
                  <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Price */}
                <div className="space-y-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-foreground">{fmt(plan.monthlyPrice)}</span>
                    <span className="text-xs text-muted-foreground">/oy</span>
                  </div>
                  {plan.yearlyPrice > 0 && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-semibold text-muted-foreground">{fmt(plan.yearlyPrice)}</span>
                      <span className="text-[10px] text-muted-foreground">/yil</span>
                    </div>
                  )}
                  {plan.trialDays && plan.trialDays > 0 ? (
                    <div className="flex items-center gap-1.5 text-xs text-blue-400">
                      <Clock className="h-3 w-3" />
                      <span>{plan.trialDays} kun bepul sinov</span>
                    </div>
                  ) : null}
                </div>

                {/* Limits */}
                <div className="space-y-1.5 text-xs">
                  {plan.maxProducts !== null && !plan.monthlyPrice && plan.trialDays ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      <span>Cheksiz mahsulotlar</span>
                    </div>
                  ) : plan.maxProducts !== null ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      <span>Mahsulotlar: {plan.maxProducts === 0 ? "Cheksiz" : `${plan.maxProducts} xil`}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      <span>Cheksiz mahsulotlar</span>
                    </div>
                  )}
                  {plan.maxStaff !== null ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      <span>Xodimlar: {plan.maxStaff === 0 ? "Cheksiz" : `${plan.maxStaff} ta`}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      <span>Cheksiz xodimlar</span>
                    </div>
                  )}
                </div>

                {/* Features */}
                {features.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-foreground">Imkoniyatlar:</p>
                    {features.map((f) => (
                      <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle className="h-3 w-3 text-primary shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Active count */}
                {subscriptions.filter((s) => s.tariffPlanId === plan.id && s.status === "active").length > 0 && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Zap className="h-3 w-3 text-green-500" />
                      {subscriptions.filter((s) => s.tariffPlanId === plan.id && s.status === "active").length} ta korxonada
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* All Subscriptions */}
      {subscriptions.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-foreground text-sm">Barcha obunalar</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Korxona</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Tarif</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Sikl</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Boshlanish</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Tugash</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Narx</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Holat</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((s) => (
                    <tr key={s.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <a href={`/owner/venues/${s.venueId}`} className="font-medium text-foreground hover:text-primary transition-colors">
                          {s.venueName || `#${s.venueId}`}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-foreground">{s.tariffPlan?.name || "—"}</td>
                      <td className="px-4 py-3"><span className="text-xs text-muted-foreground">{s.billingCycle === "yearly" ? "Yillik" : "Oylik"}</span></td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(s.startDate)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(s.endDate)}</td>
                      <td className="px-4 py-3 text-foreground font-medium">
                        {s.billingCycle === "yearly" ? fmt(s.tariffPlan?.yearlyPrice ?? 0) : fmt(s.tariffPlan?.monthlyPrice ?? 0)}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editing ? "Tarif rejani tahrirlash" : "Yangi tarif reja"}</DialogTitle>
          </DialogHeader>
          <TariffForm key={editing?.id || "new"} plan={editing} saving={saving} onSubmit={handleSave} onCancel={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TariffForm({ plan, saving, onSubmit, onCancel }: {
  plan: TariffPlan | null;
  saving: boolean;
  onSubmit: (d: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(new FormData(e.currentTarget));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label className="text-foreground">Nomi</Label>
        <Input name="name" defaultValue={plan?.name || ""} required className="bg-input border-border" />
      </div>
      <div className="space-y-2">
        <Label className="text-foreground">Tavsif</Label>
        <Textarea name="description" defaultValue={plan?.description || ""} className="bg-input border-border" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-foreground">Oylik narx (so'm)</Label>
          <Input name="monthlyPrice" type="number" defaultValue={plan?.monthlyPrice || 0} required className="bg-input border-border" />
        </div>
        <div className="space-y-2">
          <Label className="text-foreground">Yillik narx (so'm)</Label>
          <Input name="yearlyPrice" type="number" defaultValue={plan?.yearlyPrice || 0} required className="bg-input border-border" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label className="text-foreground">Max mahsulotlar</Label>
          <Input name="maxProducts" type="number" defaultValue={plan?.maxProducts ?? ""} placeholder="Cheksiz" className="bg-input border-border" />
        </div>
        <div className="space-y-2">
          <Label className="text-foreground">Max xodimlar</Label>
          <Input name="maxStaff" type="number" defaultValue={plan?.maxStaff ?? ""} placeholder="Cheksiz" className="bg-input border-border" />
        </div>
        <div className="space-y-2">
          <Label className="text-foreground">Sinov kunlari</Label>
          <Input name="trialDays" type="number" defaultValue={plan?.trialDays ?? ""} placeholder="0" className="bg-input border-border" />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-foreground">Imkoniyatlar (har bir qatorni yangi qatorga yozing)</Label>
        <Textarea
          name="featuresJson"
          defaultValue={plan?.featuresJson ? parseFeatures(plan.featuresJson).join("\n") : ""}
          className="bg-input border-border"
          rows={4}
        />
      </div>
      <div className="flex items-center gap-3">
        <Label className="text-foreground">Faol</Label>
        <select name="isActive" defaultValue={plan?.isActive ? "true" : "false"} className="bg-input border-border text-foreground rounded-lg px-3 py-1.5 text-sm">
          <option value="true">Ha</option>
          <option value="false">Yo'q</option>
        </select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Bekor qilish</Button>
        <Button type="submit" disabled={saving} className="bg-purple-600 hover:bg-purple-700">
          {saving ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </form>
  );
}
