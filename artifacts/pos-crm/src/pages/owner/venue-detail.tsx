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
import { Store, TrendingUp, AlertCircle, Package, ShoppingBag, UserCheck, Phone, Mail, Instagram, Send, Facebook, MapPin, Navigation, Satellite, Map, Crosshair, CalendarDays, DollarSign, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

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

  const [mapCoords, setMapCoords] = useState({ lat: 41.311081, lng: 69.240562 });
  const [satellite, setSatellite] = useState(false);
  const [locating, setLocating] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);
  const [tariffPlans, setTariffPlans] = useState<any[]>([]);
  const [selectedTariffId, setSelectedTariffId] = useState("");
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [assigningSub, setAssigningSub] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    if (mapRef.current && !leafletRef.current) {
      const map = L.map(mapRef.current, { zoomControl: true }).setView([mapCoords.lat, mapCoords.lng], 13);
      const tile = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);
      const marker = L.marker([mapCoords.lat, mapCoords.lng], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        setMapCoords({ lat: pos.lat, lng: pos.lng });
      });
      map.on("click", (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        setMapCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
      leafletRef.current = map;
      markerRef.current = marker;
      tileLayerRef.current = tile;
      map.whenReady(() => map.invalidateSize());
    }
    return () => {
      leafletRef.current?.remove();
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!leafletRef.current) return;
    tileLayerRef.current?.remove();
    const tileUrl = satellite
      ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    const tileAttribution = satellite
      ? "&copy; Esri"
      : "&copy; OpenStreetMap";
    const tile = L.tileLayer(tileUrl, { attribution: tileAttribution }).addTo(leafletRef.current);
    tileLayerRef.current = tile;
  }, [satellite]);

  useEffect(() => {
    if (!id || !token) return;
    fetch(`/api/venues/${id}/subscription`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then(setSubscription)
      .catch(() => {});
    fetch("/api/tariff-plans", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then(setTariffPlans)
      .catch(() => {});
  }, [id, token]);

  const handleAssignSubscription = async () => {
    if (!selectedTariffId || !token) return;
    setAssigningSub(true);
    try {
      const res = await fetch(`/api/venues/${id}/subscription`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tariffPlanId: Number(selectedTariffId), billingCycle: selectedBillingCycle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Xatolik");
      setSubscription(data);
      toast({ title: "Obuna o'rnatildi" });
    } catch (e: any) {
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    } finally {
      setAssigningSub(false);
    }
  };

  const handleLocate = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolokatsiya qo'llab-quvvatlanmaydi", variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setMapCoords({ lat: latitude, lng: longitude });
        leafletRef.current?.setView([latitude, longitude], 16);
        markerRef.current?.setLatLng([latitude, longitude]);
        setLocating(false);
      },
      () => {
        toast({ title: "Joylashuv aniqlanmadi", variant: "destructive" });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  useEffect(() => {
    if (venue?.latitude && venue?.longitude && !markerRef.current?.getLatLng().equals([venue.latitude, venue.longitude] as any)) {
      setMapCoords({ lat: venue.latitude, lng: venue.longitude });
      leafletRef.current?.setView([venue.latitude, venue.longitude], 13);
      markerRef.current?.setLatLng([venue.latitude, venue.longitude]);
    }
  }, [venue]);

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
          if (contactForm.telegramBotToken) {
            setupWebhook();
          }
        },
        onError: () => toast({ title: "Xatolik", variant: "destructive" }),
      }
    );
  };

  const handleSaveCoords = () => {
    updateVenue.mutate(
      { id, data: { latitude: mapCoords.lat, longitude: mapCoords.lng } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetVenueQueryKey(id) });
          toast({ title: "📍 Joylashuv saqlandi" });
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
      const msg = e.message || "";
      if (msg.includes("HTTPS")) {
        toast({
          title: "Bot webhook o'rnatilmadi",
          description: "Telegram webhook uchun HTTPS talab qilinadi. Loyihani serverga deploy qiling yoki ngrok ishlating.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Xatolik", description: msg, variant: "destructive" });
      }
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Yuklanmoqda...</div>;
  if (!venue) return <div className="text-red-400">Korxona topilmadi</div>;

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

      {/* ─── Venue Location Map ─── */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-green-500" />
            <div>
              <CardTitle className="text-foreground">Korxona joylashuvi</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Xaritada korxonani belgilang va saqlang</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLocate}
              disabled={locating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              title="Joriy joylashuvni belgilash"
            >
              <Crosshair className={`h-3.5 w-3.5 ${locating ? "animate-spin" : ""}`} />
              {locating ? "..." : "Mening joylashuvim"}
            </button>
            <button
              onClick={() => setSatellite((s) => !s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                satellite
                  ? "bg-green-600 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              title={satellite ? "Oddiy ko'rinish" : "Sun'iy yo'ldosh ko'rinishi"}
            >
              {satellite ? <Map className="h-3.5 w-3.5" /> : <Satellite className="h-3.5 w-3.5" />}
              {satellite ? "Oddiy" : "Sun'iy yo'ldosh"}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div ref={mapRef} className="w-full h-64 rounded-xl overflow-hidden border border-border mb-3" />
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs text-muted-foreground">
              Kenglik: {mapCoords.lat.toFixed(5)}, Uzunlik: {mapCoords.lng.toFixed(5)}
            </p>
            <Button size="sm" onClick={handleSaveCoords} disabled={updateVenue.isPending} className="bg-green-600 hover:bg-green-700 shrink-0">
              {updateVenue.isPending ? "..." : "Saqlash"}
            </Button>
          </div>
          <a
            href={`https://www.google.com/maps?q=${mapCoords.lat},${mapCoords.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            <Navigation className="h-3.5 w-3.5" />
            Google Maps da ko'rish
          </a>
        </CardContent>
      </Card>

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

      {/* ─── Tariff / Subscription ─── */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center gap-2">
          <CalendarDays className="h-5 w-5 text-purple-500" />
          <CardTitle className="text-foreground">Tarif rejasi</CardTitle>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-semibold text-foreground">{subscription.tariffPlan?.name || "—"}</p>
                  <p className="text-sm text-muted-foreground">
                    {subscription.billingCycle === "yearly" ? "Yillik" : "Oylik"} ·{" "}
                    {new Date(subscription.startDate).toLocaleDateString("uz-UZ")} —{" "}
                    {new Date(subscription.endDate).toLocaleDateString("uz-UZ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-foreground">
                    {subscription.billingCycle === "yearly"
                      ? fmt(subscription.tariffPlan?.yearlyPrice ?? 0)
                      : fmt(subscription.tariffPlan?.monthlyPrice ?? 0)}
                  </p>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    subscription.status === "active" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                  }`}>
                    {subscription.status === "active" ? "Faol" : "Muddati o'tgan"}
                  </span>
                </div>
              </div>
              {subscription.tariffPlan?.featuresJson && (
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    try { return JSON.parse(subscription.tariffPlan.featuresJson).map((f: string) => (
                      <span key={f} className="text-[11px] px-2 py-0.5 bg-primary/5 text-primary rounded-full">{f}</span>
                    )); } catch { return null; }
                  })()}
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm mb-4">Hali tarif rejasi tanlanmagan</p>
          )}
          <div className="mt-4 p-4 bg-muted/20 rounded-lg border border-border">
            <p className="text-xs font-medium text-foreground mb-3">Tarif rejasini o'zgartirish</p>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[140px]">
                <Select value={selectedTariffId} onValueChange={setSelectedTariffId}>
                  <SelectTrigger className="bg-input border-border">
                    <SelectValue placeholder="Tarifni tanlang" />
                  </SelectTrigger>
                  <SelectContent className="bg-input border-border">
                    {tariffPlans.filter((p) => p.isActive).map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} — {fmt(p.monthlyPrice)}/oy
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[100px]">
                <Select value={selectedBillingCycle} onValueChange={(v) => setSelectedBillingCycle(v as "monthly" | "yearly")}>
                  <SelectTrigger className="bg-input border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-input border-border">
                    <SelectItem value="monthly">Oylik</SelectItem>
                    <SelectItem value="yearly">Yillik</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleAssignSubscription}
                disabled={!selectedTariffId || assigningSub}
                size="sm"
                className="bg-purple-600 hover:bg-purple-700"
              >
                {assigningSub ? "..." : "O'rnatish"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Venue Info ─── */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center gap-2">
          <Package className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-foreground">Korxona Ma'lumotlari</CardTitle>
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
