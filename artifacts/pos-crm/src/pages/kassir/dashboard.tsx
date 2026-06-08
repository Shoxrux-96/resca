import { useAuth } from "@/hooks/use-auth";
import { Wallet } from "lucide-react";

export default function KassirDashboard() {
  const { user } = useAuth();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Kassa paneli</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Xush kelibsiz, {user?.name || user?.username}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <Wallet className="h-5 w-5 text-amber-500" />
            <h2 className="font-semibold text-foreground">Kassir funksiyalari</h2>
          </div>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            <li>• POS terminal orqali to'lovlarni qabul qilish</li>
            <li>• Kirim-chiqimlarni yuritish</li>
            <li>• Qarz daftarini boshqarish</li>
            <li>• Sotuvlar hisobotini ko'rish</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
