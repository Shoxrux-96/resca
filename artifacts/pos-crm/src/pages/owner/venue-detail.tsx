import { useParams } from "wouter";
import {
  useGetVenue,
  useGetVenueStats,
  useListUsers,
  useAssignVenueAdmin,
  useUpdateVenue,
  getGetVenueQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Store, TrendingUp, AlertCircle, Package, ShoppingBag, UserCheck, Phone, Mail, Instagram, Send, Facebook } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ").format(n) + " so'm";
}

export default function OwnerVenueDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: venue, isLoading } = useGetVenue(id);
  const { data: stats } = useGetVenueStats(id);
  const { data: users } = useListUsers();
  const assignAdmin = useAssignVenueAdmin();
  const updateVenue = useUpdateVenue();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { token } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const [contactForm, setContactForm] = useState({
    phone: "",
    email: "",
    instagram: "",
    telegram: "",
    facebook: "",
    telegramBotToken: "",
  });

  useEffect(() => {
    if (venue) {
      setContactForm({
        phone: venue.phone ?? "",
        email: venue.email ?? "",
        instagram: venue.instagram ?? "",
        telegram: venue.telegram ?? "",
        facebook: venue.facebook ?? "",
        telegramBotToken: (venue as any).telegramBotToken ?? "",
      });
    }
  }, [venue]);

  const adminUsers = users?.filter((u) => u.role === "admin") ?? [];

  const handleAssign = () => {
    if (!selectedUserId) return;
    assignAdmin.mutate(
      { id, data: { userId: Number(selectedUserId) } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetVenueQueryKey(id) });
          setSelectedUserId("");
          toast({ title: "Admin tayinlandi" });
        },
        onError: () => toast({ title: "Xatolik", variant: "destructive" }),
      }
    );
  };

  const handleContactSave = () => {
    updateVenue.mutate(
      {
        id,
        data: {
          phone: contactForm.phone || null,
          email: contactForm.email || null,
          instagram: contactForm.instagram || null,
          telegram: contactForm.telegram || null,
          facebook: contactForm.facebook || null,
          telegramBotToken: contactForm.telegramBotToken || null,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetVenueQueryKey(id) });
          toast({ title: "Aloqa ma'lumotlari saqlandi" });
        },
        onError: () => toast({ title: "Xatolik", variant: "destructive" }),
      }
    );
  };

  const setupWebhook = async () => {
    if (!token) return;
    try {
      const r = await fetch(`/api/venues/${id}/telegram/setup-webhook`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || "Xatolik");
      toast({ title: "✅ Bot webhook o'rnatildi", description: d.webhookUrl });
    } catch (e: any) {
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Yuklanmoqda...</div>;
  if (!venue) return <div className="text-red-400">Filial topilmadi</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center">
          <Store className="h-6 w-6 text-blue-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{venue.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="capitalize border-border text-muted-foreground">
              {venue.type === "cafe" ? "Kafe" : "Restoran"}
            </Badge>
            {venue.address && <span className="text-sm text-muted-foreground">{venue.address}</span>}
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Bugungi savdo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-green-400">{fmt(stats.todaySales)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Jami daromad
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-foreground">{fmt(stats.totalRevenue)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Qarz
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-red-400">{fmt(stats.totalDebts)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                <ShoppingBag className="h-3 w-3" /> Buyurtmalar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-foreground">{stats.orderCount}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Contact Info Form ─── */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center gap-2">
          <Phone className="h-5 w-5 text-blue-500" />
          <div>
            <CardTitle className="text-foreground">Aloqa Sozlamalari</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Bu ma'lumotlar sayt va footer qismida ko'rsatiladi</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Telefon raqam
              </Label>
              <Input
                placeholder="+998 90 123 45 67"
                value={contactForm.phone}
                onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))}
                className="bg-input border-border text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Elektron pochta
              </Label>
              <Input
                placeholder="info@restoran.uz"
                value={contactForm.email}
                onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                className="bg-input border-border text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Instagram className="h-3.5 w-3.5" /> Instagram
              </Label>
              <div className="flex items-center">
                <span className="px-3 py-2 text-xs text-muted-foreground bg-zinc-800 border border-border border-r-0 rounded-l-md">@</span>
                <Input
                  placeholder="restoran_uz"
                  value={contactForm.instagram}
                  onChange={(e) => setContactForm((p) => ({ ...p, instagram: e.target.value }))}
                  className="bg-input border-border text-foreground rounded-l-none"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" /> Telegram
              </Label>
              <div className="flex items-center">
                <span className="px-3 py-2 text-xs text-muted-foreground bg-zinc-800 border border-border border-r-0 rounded-l-md">@</span>
                <Input
                  placeholder="restoran_uz"
                  value={contactForm.telegram}
                  onChange={(e) => setContactForm((p) => ({ ...p, telegram: e.target.value }))}
                  className="bg-input border-border text-foreground rounded-l-none"
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Facebook className="h-3.5 w-3.5" /> Facebook
              </Label>
              <Input
                placeholder="facebook.com/restoran"
                value={contactForm.facebook}
                onChange={(e) => setContactForm((p) => ({ ...p, facebook: e.target.value }))}
                className="bg-input border-border text-foreground"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" /> Telegram Bot Token
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="123456789:AAEhBpVGr..."
                  value={contactForm.telegramBotToken}
                  onChange={(e) => setContactForm((p) => ({ ...p, telegramBotToken: e.target.value }))}
                  className="bg-input border-border text-foreground font-mono text-xs flex-1"
                />
                {contactForm.telegramBotToken && (
                  <Button type="button" variant="outline" size="sm" onClick={setupWebhook} className="shrink-0">
                    Webhook o'rnatish
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                @BotFather orqali bot yarating va tokeni shu yerga yozing → Saqlash → Webhook o'rnatish.
                Saytingiz HTTPS public URL'da bo'lishi kerak.
              </p>
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button
              onClick={handleContactSave}
              disabled={updateVenue.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {updateVenue.isPending ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Admin Assignment ─── */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center gap-2">
          <UserCheck className="h-5 w-5 text-blue-500" />
          <CardTitle className="text-foreground">Admin Tayinlash</CardTitle>
        </CardHeader>
        <CardContent>
          {venue.adminName ? (
            <div className="flex items-center gap-3 mb-4 p-3 bg-zinc-900 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-sm font-bold text-blue-400">
                {venue.adminName.charAt(0)}
              </div>
              <div>
                <p className="text-foreground font-medium">{venue.adminName}</p>
                <p className="text-sm text-muted-foreground">Joriy admin</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm mb-4">Hali admin tayinlanmagan</p>
          )}
          <div className="flex gap-3">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="bg-input border-border flex-1">
                <SelectValue placeholder="Admin tanlang" />
              </SelectTrigger>
              <SelectContent className="bg-input border-border">
                {adminUsers.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name || u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAssign}
              disabled={!selectedUserId || assignAdmin.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Tayinlash
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Venue Info ─── */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center gap-2">
          <Package className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-foreground">Filial Ma'lumotlari</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0 text-sm">
          <div className="flex justify-between py-2.5 border-b border-border">
            <span className="text-muted-foreground">Manzil</span>
            <span className="text-foreground">{venue.address || "—"}</span>
          </div>
          <div className="flex justify-between py-2.5 border-b border-border">
            <span className="text-muted-foreground">Mahsulotlar soni</span>
            <span className="text-foreground">{stats?.productCount ?? "—"}</span>
          </div>
          <div className="flex justify-between py-2.5 border-b border-border">
            <span className="text-muted-foreground">Jami buyurtmalar</span>
            <span className="text-foreground">{stats?.orderCount ?? "—"}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-muted-foreground">Yaratilgan</span>
            <span className="text-foreground">
              {venue.createdAt ? new Date(venue.createdAt).toLocaleDateString("uz-UZ") : "—"}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
