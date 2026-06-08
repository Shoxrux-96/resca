import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  QrCode, Image, Globe, Ban, Percent, DoorOpen, UtensilsCrossed,
  AlertTriangle, Settings2, ShieldCheck, UserCog, Bell, BellOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { isPushSupported, subscribeToPush, unsubscribeFromPush, isSubscribed } from "@/lib/push-notifications";

type VenueSettings = {
  receiptQrEnabled: boolean;
  receiptLogoEnabled: boolean;
  onlineOrdersEnabled: boolean;
  kassirCancelReceipt: boolean;
  kassirGiveDiscount: boolean;
  roomBookingEnabled: boolean;
  waiterCancelOrder: boolean;
  waiterGiveDiscount: boolean;
  kitchenAutoAccept: boolean;
  inventoryLowAlert: boolean;
};

type SettingItem = {
  key: keyof VenueSettings;
  label: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  group: string;
};

const SETTINGS_CONFIG: SettingItem[] = [
  // Chek
  { key: "receiptQrEnabled", label: "Chekda QR kod", description: "Chek chiqarilganda QR kod qo'shiladi", icon: QrCode, iconColor: "text-blue-500", group: "Chek sozlamalari" },
  { key: "receiptLogoEnabled", label: "Chekda logo", description: "Chekda venue logotipi chiqariladi", icon: Image, iconColor: "text-purple-500", group: "Chek sozlamalari" },
  // Onlayn
  { key: "onlineOrdersEnabled", label: "Onlayn buyurtmalar", description: "Mijozlar onlayn menyu orqali buyurtma bera oladi", icon: Globe, iconColor: "text-green-500", group: "Buyurtma sozlamalari" },
  { key: "kitchenAutoAccept", label: "Oshxona avtomatik qabul", description: "Yangi buyurtmalar oshxonaga avtomatik qabul qilinadi", icon: UtensilsCrossed, iconColor: "text-orange-500", group: "Buyurtma sozlamalari" },
  // Kassir
  { key: "kassirCancelReceipt", label: "Kassir chekni bekor qilsin", description: "Kassir to'langan chekni bekor qilishi mumkin (mahsulot qaytarilmasdan)", icon: Ban, iconColor: "text-red-500", group: "Kassir huquqlari" },
  { key: "kassirGiveDiscount", label: "Kassir chegirma bersin", description: "Kassir mahsulotga chegirma qo'yishi mumkin", icon: Percent, iconColor: "text-amber-500", group: "Kassir huquqlari" },
  // Afitsiant
  { key: "waiterCancelOrder", label: "Afitsiant buyurtmani bekor qilsin", description: "Afitsiant o'z buyurtmasini bekor qilishi mumkin", icon: Ban, iconColor: "text-red-400", group: "Afitsiant huquqlari" },
  { key: "waiterGiveDiscount", label: "Afitsiant chegirma bersin", description: "Afitsiant mahsulotga chegirma qo'yishi mumkin", icon: Percent, iconColor: "text-amber-400", group: "Afitsiant huquqlari" },
  // Bron
  { key: "roomBookingEnabled", label: "Xona/stol bron qilish", description: "Mijozlar uchun xona va stollarni bron qilish imkoni", icon: DoorOpen, iconColor: "text-indigo-500", group: "Boshqa funksiyalar" },
  // Inventar
  { key: "inventoryLowAlert", label: "Ombor ogohlantirish", description: "Mahsulot minimal miqdordan kam qolsa ogohlantirish beradi", icon: AlertTriangle, iconColor: "text-yellow-500", group: "Boshqa funksiyalar" },
];

export default function AdminSettings() {
  const { user, token } = useAuth();
  const venueId = user?.venueId ?? 0;
  const qc = useQueryClient();
  const { toast } = useToast();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Push notifications
  const [pushSubbed, setPushSubbed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushSupp, setPushSupp] = useState(true);
  useEffect(() => {
    setPushSupp(isPushSupported());
    isSubscribed().then(setPushSubbed);
  }, []);

  const togglePush = async () => {
    if (!token) return;
    setPushBusy(true);
    try {
      if (pushSubbed) {
        const ok = await unsubscribeFromPush(token);
        if (ok) { setPushSubbed(false); toast({ title: "Bildirishnoma o'chirildi" }); }
      } else {
        const ok = await subscribeToPush(token);
        if (ok) { setPushSubbed(true); toast({ title: "✅ Bildirishnoma yoqildi" }); }
        else { toast({ title: "Brauzer ruxsat bermadi yoki xatolik", variant: "destructive" }); }
      }
    } catch (e: any) {
      toast({ title: e.message || "Xatolik", variant: "destructive" });
    } finally {
      setPushBusy(false);
    }
  };

  const sendTestPush = async () => {
    try {
      const r = await fetch("/api/push/test", { method: "POST", headers });
      if (r.ok) toast({ title: "Test xabar yuborildi" });
    } catch { /* ignore */ }
  };

  const { data: settings, isLoading } = useQuery<VenueSettings>({
    queryKey: ["venue-settings", venueId],
    enabled: !!venueId && !!token,
    queryFn: async () => {
      const r = await fetch(`/api/venues/${venueId}/settings`, { headers });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const updateSetting = useMutation({
    mutationFn: async (patch: Partial<VenueSettings>) => {
      const r = await fetch(`/api/venues/${venueId}/settings`, {
        method: "PATCH", headers, body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (data) => {
      qc.setQueryData(["venue-settings", venueId], data);
      toast({ title: "Saqlandi" });
    },
    onError: () => toast({ title: "Xatolik", variant: "destructive" }),
  });

  const toggle = (key: keyof VenueSettings) => {
    if (!settings) return;
    updateSetting.mutate({ [key]: !settings[key] });
  };

  // Gruppalash
  const groups = SETTINGS_CONFIG.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, SettingItem[]>);

  const enabledCount = settings ? Object.values(settings).filter(Boolean).length : 0;
  const totalCount = SETTINGS_CONFIG.length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings2 className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500" />
            Funksiyalar
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Tizim funksiyalarini yoqish/o'chirish
          </p>
        </div>
        <Badge variant="outline" className="text-xs border-border shrink-0">
          {enabledCount}/{totalCount} faol
        </Badge>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-center py-16">Yuklanmoqda...</div>
      ) : !settings ? (
        <div className="text-muted-foreground text-center py-16">Sozlamalar topilmadi</div>
      ) : (
        <div className="space-y-6">
          {/* Push bildirishnomalar */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground text-sm">Telefonga bildirishnoma</h2>
            </div>
            <div className="px-4 sm:px-5 py-4">
              {!pushSupp ? (
                <p className="text-sm text-muted-foreground">Brauzer push bildirishnomalarni qo'llab-quvvatlamaydi. Chrome, Firefox yoki Safari (iOS 16.4+) ishlating.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ${pushSubbed ? "bg-green-500/10" : "bg-muted"}`}>
                      {pushSubbed ? <Bell className="h-5 w-5 text-green-500" /> : <BellOff className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm">Yangi sotuv bildirishnomasi</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Har bir yangi sotuv bo'lganda telefoningizga push xabar keladi</p>
                    </div>
                    <Switch
                      checked={pushSubbed}
                      onCheckedChange={togglePush}
                      disabled={pushBusy}
                      className="data-[state=checked]:bg-blue-600 shrink-0"
                    />
                  </div>
                  {pushSubbed && (
                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <Button size="sm" variant="outline" onClick={sendTestPush}>
                        <Bell className="h-3.5 w-3.5 mr-1.5" /> Test xabar yuborish
                      </Button>
                      <span className="text-xs text-muted-foreground">— ishlayotganini sinab ko'rish uchun</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {Object.entries(groups).map(([groupName, items]) => {
            const groupIcon = groupName === "Chek sozlamalari" ? QrCode
              : groupName === "Kassir huquqlari" ? ShieldCheck
              : groupName === "Afitsiant huquqlari" ? UserCog
              : groupName === "Buyurtma sozlamalari" ? Globe
              : Settings2;
            const GroupIcon = groupIcon;

            return (
              <div key={groupName} className="bg-card border border-border rounded-2xl overflow-hidden">
                {/* Group header */}
                <div className="px-4 sm:px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
                  <GroupIcon className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-semibold text-foreground text-sm">{groupName}</h2>
                  <Badge variant="outline" className="ml-auto text-[10px] border-border">
                    {items.filter((i) => settings[i.key]).length}/{items.length}
                  </Badge>
                </div>

                {/* Items */}
                <div className="divide-y divide-border">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const enabled = settings[item.key];
                    return (
                      <div
                        key={item.key}
                        className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 sm:py-4 hover:bg-muted/20 transition-colors"
                      >
                        <div className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ${enabled ? "bg-blue-500/10" : "bg-muted"}`}>
                          <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${enabled ? item.iconColor : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground text-sm sm:text-base">{item.label}</p>
                          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-snug">{item.description}</p>
                        </div>
                        <Switch
                          checked={enabled}
                          onCheckedChange={() => toggle(item.key)}
                          disabled={updateSetting.isPending}
                          className="data-[state=checked]:bg-blue-600 shrink-0"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
