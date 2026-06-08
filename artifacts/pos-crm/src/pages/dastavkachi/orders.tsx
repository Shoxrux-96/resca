import { useAuth } from "@/hooks/use-auth";
import { Truck } from "lucide-react";

export default function DastavkachiOrders() {
  const { user } = useAuth();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dastavkachi — Yetkazish</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Xush kelibsiz, {user?.name || user?.username}
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <Truck className="h-5 w-5 text-purple-500" />
          <h2 className="font-semibold text-foreground">Dastavkachi funksiyalari</h2>
        </div>
        <ul className="text-sm text-muted-foreground space-y-1.5">
          <li>• Onlayn buyurtmalarni ko'rish</li>
          <li>• Buyurtmani qabul qilish</li>
          <li>• Yetkazish jarayonini belgilash (yo'lda, yetkazildi)</li>
          <li>• Buyurtma tarixini ko'rish</li>
        </ul>
      </div>

      <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
        <Truck className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Hozircha buyurtmalar yo'q</p>
        <p className="text-sm mt-1">Yangi yetkazish buyurtmalari bu yerda ko'rinadi</p>
      </div>
    </div>
  );
}
