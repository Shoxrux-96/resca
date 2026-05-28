import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { useEffect } from "react";

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    title: "POS Terminal",
    desc: "Tezkor buyurtma qabul qilish, savat boshqaruvi, naqd va qarzga sotish — bir ekranda.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    title: "Mahsulotlar Boshqaruvi",
    desc: "Menyu yaratish, narx va kategoriya bo'yicha tartib, rasm yuklash va mavjudlik holati.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: "Mijozlar Bazasi",
    desc: "Har bir mijozni ro'yxatdan o'tkazish, qidiruv va qarz holati tarixini kuzatish.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    title: "Qarz Daftar",
    desc: "Qarzga bergan buyurtmalarni kuzatish, qisman yoki to'liq to'lash imkoniyati.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    title: "Ko'p Filial",
    desc: "Bir nechta restoran va kafe filiallarini bitta tizimdan boshqaring.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: "Hisobot va Tahlil",
    desc: "Kunlik daromad, eng ko'p sotilgan mahsulotlar va qarz statistikasi.",
  },
];

const stats = [
  { value: "2x", label: "Tezroq xizmat" },
  { value: "100%", label: "O'zbek tilida" },
  { value: "0", label: "Yo'qolgan buyurtma" },
  { value: "24/7", label: "Ishlash vaqti" },
];

const steps = [
  { num: "01", title: "Tizimga kiring", desc: "Egasi yoki admin akkauntingiz bilan kirish qiling." },
  { num: "02", title: "Menyu tuzing", desc: "Mahsulotlar va kategoriyalarni qo'shing, narxlarni belgilang." },
  { num: "03", title: "Sotishni boshlang", desc: "POS terminaldan buyurtma qabul qiling va chek chiqaring." },
];

export default function Home() {
  useEffect(() => { document.title = "resca.uz — Restoran va Kafe uchun CRM va POS tizimi"; }, []);
  const [, setLocation] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const firstVenue: any = null;

  const handleGoToDashboard = () => {
    const role = user?.role;
    if (role === "owner") setLocation("/owner/dashboard");
    else if (role === "admin") setLocation("/admin/dashboard");
    else if (role === "waiter") setLocation("/waiter/tables");
    else setLocation("/login");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── Navbar ─── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-zinc-100/90 dark:bg-zinc-900 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.png" alt="resca.uz" className="w-10 h-10 rounded-lg object-cover" />
            <span className="font-semibold text-lg tracking-tight">resca.uz</span>
          </div>
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setLocation("/")}
              className="px-4 py-2 text-sm font-medium text-foreground hover:text-[#E0714F] transition-colors rounded-lg hover:bg-white/5"
            >
              Bosh sahifa
            </button>
            <button
              onClick={isAuthenticated ? handleGoToDashboard : () => setLocation("/login")}
              className="px-4 py-2 text-sm font-medium bg-[#E0714F] hover:bg-[#D06040] text-white rounded-lg transition-colors"
            >
              {isAuthenticated ? "Boshqaruv paneli" : "Kirish"}
            </button>
            <ThemeToggle className="text-muted-foreground" />
          </nav>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#E0714F]/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#E0714F]/10 border border-[#E0714F]/20 text-[#E0714F] text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E0714F] animate-pulse" />
            Restoran va Kafe uchun zamonaviy tizim
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
            Biznesingizni<br />
            <span className="text-[#E0714F]">tartibli boshqaring</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            resca.uz — restoran va kafe uchun to'liq CRM va POS tizimi. Buyurtmalar, mahsulotlar,
            mijozlar va qarzlarni bitta joydan boshqaring.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={isAuthenticated ? handleGoToDashboard : () => setLocation("/login")}
              className="w-full sm:w-auto px-8 py-3 bg-[#E0714F] hover:bg-[#D06040] text-white font-medium rounded-xl transition-colors text-sm"
            >
              {isAuthenticated ? "Panelga o'tish" : "Tizimga kirish"}
            </button>
            <a
              href="#features"
              className="w-full sm:w-auto px-8 py-3 bg-white/5 hover:bg-white/10 border border-border text-foreground font-medium rounded-xl transition-colors text-sm text-center"
            >
              Imkoniyatlarni ko'rish
            </a>
          </div>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section className="py-12 border-y border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl sm:text-4xl font-bold text-[#E0714F] mb-1">{s.value}</div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="py-20 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Barcha kerakli vositalar</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Biznesingizni samarali yuritish uchun zarur bo'lgan barcha funksiyalar bir tizimda.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div
                key={f.title}
                className="group p-6 rounded-2xl bg-card border border-border hover:border-[#E0714F]/40 hover:bg-[#E0714F]/5 transition-all duration-200"
              >
                <div className="w-11 h-11 rounded-xl bg-[#E0714F]/10 text-[#E0714F] flex items-center justify-center mb-4 group-hover:bg-[#E0714F]/20 transition-colors">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-base mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="py-20 sm:py-24 bg-card/30 border-y border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Qanday ishlaydi?</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Uch oddiy qadamda biznesingizni raqamlashtiring.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={step.num} className="relative text-center">
                {i < steps.length - 1 && (
                  <div className="hidden sm:block absolute top-7 left-1/2 w-full h-px bg-border" />
                )}
                <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#E0714F]/10 border border-[#E0714F]/30 text-[#E0714F] font-bold text-lg mb-5">
                  {step.num}
                </div>
                <h3 className="font-semibold text-base mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── POS advantages ─── */}
      <section className="py-20 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-600/10 border border-green-500/20 text-green-400 text-xs font-medium mb-6">
                POS Terminal
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-5 leading-tight">
                Tezkor va qulay<br />savdo tizimi
              </h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                Zamonaviy POS terminal orqali har bir buyurtmani sekundlar ichida qayta ishlang.
                Xodimlaringiz kamroq vaqt sarflaydi — mijozlaringiz esa tezroq xizmat oladi.
              </p>
              <ul className="space-y-3">
                {[
                  "Naqd va qarzga sotish imkoniyati",
                  "Zal va stol bo'yicha buyurtma boshqaruvi",
                  "Avtomatik chek va hisob-faktura",
                  "Ofitsiantlar uchun alohida panel",
                  "Qarz to'lash va kuzatib borish",
                  "Kunlik daromad hisoboti",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm">
                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-[#E0714F]/5 rounded-3xl blur-2xl" />
              <div className="relative bg-card border border-border rounded-2xl p-6 space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <span className="font-semibold text-sm">Buyurtma #24</span>
                  <span className="text-xs bg-green-600/15 text-green-400 px-2 py-0.5 rounded-full">Faol</span>
                </div>
                {[
                  { name: "Lag'mon", qty: 2, price: "28 000" },
                  { name: "Choy (limon)", qty: 3, price: "9 000" },
                  { name: "Non", qty: 2, price: "4 000" },
                ].map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{item.name} × {item.qty}</span>
                    <span>{item.price} so'm</span>
                  </div>
                ))}
                <div className="pt-3 border-t border-border">
                  <div className="flex items-center justify-between font-semibold">
                    <span>Jami</span>
                    <span className="text-[#E0714F]">41 000 so'm</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="py-2 rounded-xl bg-green-600/10 text-green-400 text-center text-xs font-medium border border-green-500/20">
                    Naqd ✓
                  </div>
                  <div className="py-2 rounded-xl bg-orange-600/10 text-orange-400 text-center text-xs font-medium border border-orange-500/20">
                    Qarzga
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Kimlar uchun ─── */}
      <section className="py-20 sm:py-24 border-t border-border/50 bg-gradient-to-b from-transparent via-[#E0714F]/[0.02] to-transparent">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#E0714F]/10 border border-[#E0714F]/20 text-[#E0714F] text-xs font-medium mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E0714F] animate-pulse" />
              Kimlar uchun
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Har bir rol uchun yechim</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              resca.uz — restoran egalari, ofitsiantlar va hamkorlar uchun maxsus ishlab chiqilgan.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Restoran egalari */}
            <div className="group relative p-6 rounded-2xl bg-card border border-border hover:border-[#E0714F]/40 transition-all duration-300 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-[#E0714F]/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-[#E0714F]/10 text-[#E0714F] flex items-center justify-center mb-4 group-hover:bg-[#E0714F]/20 group-hover:scale-110 transition-all duration-300">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-3">Restoran va Kafe Egalari</h3>
                <ul className="space-y-2.5 mb-5">
                  {[
                    "POS terminal — bir ekranda savdo",
                    "Mahsulot va menyu boshqaruvi",
                    "Xona va stollarni boshqarish",
                    "Kunlik hisobot va tahlillar",
                    "Mijozlar bazasi va qarz daftar",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm">
                      <svg className="w-4 h-4 text-[#E0714F] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 text-sm text-[#E0714F] font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#E0714F] animate-pulse" />
                  Aniq va tezkor boshqaruv
                </div>
              </div>
            </div>

            {/* Ofitsiantlar */}
            <div className="group relative p-6 rounded-2xl bg-card border border-border hover:border-emerald-500/40 transition-all duration-300 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-emerald-600/10 text-emerald-400 flex items-center justify-center mb-4 group-hover:bg-emerald-600/20 group-hover:scale-110 transition-all duration-300">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-3">Ofitsiantlar</h3>
                <ul className="space-y-2.5 mb-5">
                  {[
                    "Stollar holatini real vaqtda ko'rish",
                    "Tezkor buyurtma qabul qilish",
                    "Maxsus ofitsiant paneli",
                    "Buyurtma tarixi va to'lov holati",
                    "Qulay interfeys bilan kam harakat",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm">
                      <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 text-sm text-emerald-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Tezroq xizmat — ko'proq daromad
                </div>
              </div>
            </div>

            {/* Hamkorlar */}
            <div className="group relative p-6 rounded-2xl bg-card border border-border hover:border-purple-500/40 transition-all duration-300 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-600/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-purple-600/10 text-purple-400 flex items-center justify-center mb-4 group-hover:bg-purple-600/20 group-hover:scale-110 transition-all duration-300">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-3">Hamkorlar</h3>
                <ul className="space-y-2.5 mb-5">
                  {[
                    "Bir nechta filialni bitta panelda",
                    "Egasi va admin rollarini ajratish",
                    "Barcha filiallar bo'yicha hisobot",
                    "Xodimlar faoliyati monitoringi",
                    "Kengaytirilgan tahlil va statistika",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm">
                      <svg className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 text-sm text-purple-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  Kengaytirilgan boshqaruv imkoniyati
                </div>
              </div>
            </div>
          </div>

          {/* Interesting facts */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: "⚡", value: "10x", label: "Tezroq buyurtma qabul qilish", color: "from-[#E0714F]/10 to-[#E0714F]/5 border-[#E0714F]/20" },
              { icon: "📊", value: "100%", label: "Raqamlashtirilgan hisobot", color: "from-emerald-600/10 to-emerald-600/5 border-emerald-500/20" },
              { icon: "🎯", value: "0", label: "Yo'qolgan buyurtma", color: "from-amber-600/10 to-amber-600/5 border-amber-500/20" },
              { icon: "🌙", value: "24/7", label: "Uzluksiz ishlash", color: "from-purple-600/10 to-purple-600/5 border-purple-500/20" },
            ].map((fact) => (
              <div
                key={fact.label}
                className={`relative p-4 rounded-xl bg-gradient-to-br ${fact.color} border overflow-hidden group hover:scale-[1.02] transition-all duration-200`}
              >
                <span className="text-2xl block mb-2">{fact.icon}</span>
                <div className="text-2xl sm:text-3xl font-bold text-foreground mb-0.5">{fact.value}</div>
                <div className="text-xs text-muted-foreground">{fact.label}</div>
              </div>
            ))}
          </div>


        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border/50 bg-zinc-50 dark:bg-zinc-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <img src="/favicon.png" alt="resca.uz" className="w-11 h-11 rounded-xl object-cover" />
              <span className="font-bold text-lg text-foreground">resca.uz</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">
              Restoran va kafe biznesini raqamlashtirish uchun zamonaviy CRM va POS tizimi.
            </p>
            <div className="flex items-center gap-3">
              {(firstVenue?.telegram || firstVenue?.instagram || firstVenue?.facebook) ? (
                <>
                  {firstVenue?.telegram && (
                    <a
                      href={`https://t.me/${firstVenue.telegram.replace("@", "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#E0714F]/20 border border-border hover:border-[#E0714F]/40 flex items-center justify-center text-muted-foreground hover:text-[#E0714F] transition-all"
                      title="Telegram"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11.944 0A12 12 0 1 0 24 12 12.017 12.017 0 0 0 11.944 0Zm4.96 8.284-2.085 9.818c-.157.709-.57.88-1.154.548l-3.18-2.34-1.534 1.476c-.169.17-.312.311-.64.311l.228-3.221 5.879-5.313c.256-.228-.055-.354-.397-.126L8.29 14.5l-3.099-.97c-.674-.21-.686-.674.14-.998l12.09-4.665c.562-.204 1.054.138.483 1.417Z" />
                      </svg>
                    </a>
                  )}
                  {firstVenue?.instagram && (
                    <a
                      href={`https://instagram.com/${firstVenue.instagram.replace("@", "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-9 h-9 rounded-lg bg-white/5 hover:bg-pink-600/20 border border-border hover:border-pink-500/40 flex items-center justify-center text-muted-foreground hover:text-pink-400 transition-all"
                      title="Instagram"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                      </svg>
                    </a>
                  )}
                  {firstVenue?.facebook && (
                    <a
                      href={firstVenue.facebook.startsWith("http") ? firstVenue.facebook : `https://facebook.com/${firstVenue.facebook}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#E0714F]/20 border border-border hover:border-[#E0714F]/40 flex items-center justify-center text-muted-foreground hover:text-[#E0714F] transition-all"
                      title="Facebook"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                    </a>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground/60 italic">Ijtimoiy tarmoqlar sozlanmagan</p>
              )}
            </div>
          </div>

          {/* Features */}
          <div>
            <h4 className="font-semibold text-foreground text-sm mb-4">Imkoniyatlar</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              {[
                "POS Terminal",
                "Mahsulotlar boshqaruvi",
                "Mijozlar bazasi",
                "Qarz daftar",
                "Ko'p filial boshqaruvi",
                "Hisobot va tahlil",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 hover:text-foreground transition-colors cursor-default">
                  <span className="w-1 h-1 rounded-full bg-[#E0714F] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-foreground text-sm mb-4">Tizim</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <button onClick={() => setLocation("/")} className="hover:text-foreground transition-colors">
                  Bosh sahifa
                </button>
              </li>
              <li>
                <button onClick={() => setLocation("/login")} className="hover:text-foreground transition-colors">
                  Tizimga kirish
                </button>
              </li>
              <li>
                <a href="#features" className="hover:text-foreground transition-colors">Imkoniyatlar</a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-foreground text-sm mb-4">Aloqa</h4>
            <div className="space-y-3">
              <a
                href="tel:+998999649695"
                className="flex items-center gap-3 p-3 rounded-xl bg-[#E0714F]/5 border border-[#E0714F]/10 hover:bg-[#E0714F]/10 hover:border-[#E0714F]/30 transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-[#E0714F]/10 text-[#E0714F] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Telefon</p>
                  <p className="text-sm font-medium text-foreground">+998 99 964 96 95</p>
                </div>
              </a>
              <a
                href="mailto:webtexnogroup@gmail.com"
                className="flex items-center gap-3 p-3 rounded-xl bg-purple-600/5 border border-purple-500/10 hover:bg-purple-600/10 hover:border-purple-500/30 transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-purple-600/10 text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium text-foreground">webtexnogroup@gmail.com</p>
                </div>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border/50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>© 2026 resca.uz. Barcha huquqlar himoyalangan.</span>
            <div className="flex items-center gap-5">
              <span>O'zbek tilida</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>Restoran & Kafe uchun</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span className="text-[#E0714F]">v1.0</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
