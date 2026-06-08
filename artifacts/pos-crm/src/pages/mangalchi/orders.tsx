import { useAuth } from "@/hooks/use-auth";
import { Flame } from "lucide-react";

export default function MangalchiOrders() {
  const { user } = useAuth();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Mangalchi — Buyurtmalar</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Xush kelibsiz, {user?.name || user?.username}
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <Flame className="h-5 w-5 text-orange-500" />
          <h2 className="font-semibold text-foreground">Mangalchi funksiyalari</h2>
        </div>
        <ul className="text-sm text-muted-foreground space-y-1.5">
          <li>• Mangal buyurtmalarini real vaqtda ko'rish</li>
          <li>• Buyurtmalarni qabul qilish yoki bekor qilish</li>
          <li>• Tayyor bo'lgan taomlarni belgilash</li>
          <li>• Onlayn buyurtmalarni boshqarish</li>
        </ul>
      </div>

      <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
        <Flame className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Hozircha buyurtmalar yo'q</p>
        <p className="text-sm mt-1">Yangi mangal buyurtmalari bu yerda ko'rinadi</p>
      </div>
    </div>
  );
}
