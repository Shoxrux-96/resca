import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import { MapPin } from "lucide-react";

type PublicVenue = {
  id: number;
  name: string;
  type: string;
  address: string | null;
  phone: string | null;
  instagram: string | null;
  telegram: string | null;
  facebook: string | null;
  logoUrl: string | null;
  latitude: number | null;
  longitude: number | null;
};

type PublicProduct = {
  id: number;
  name: string;
  price: number;
  category: string;
  description: string | null;
  imageUrl: string | null;
};

type PublicMenu = {
  venue: PublicVenue;
  products: PublicProduct[];
};

type Grouped = Record<string, PublicProduct[]>;

const CATEGORY_ORDER = ["Barchasi", "Taomlar", "Kaboblar", "Sho'rvalar", "Salatlar", "Mazzalar", "Souvslar", "Gamburgerlar", "Pizzalar", "Sushilar", "Fastfood", "Nonlar", "Lavashlar", "Pishiriqlar", "Ichimliklar", "Issiq ichimliklar", "Spirtli ichimliklar", "Pivolar", "Shirinliklar", "Muzqaymoqlar", "Tort va pirojniylar", "Boshqa"];

function fmt(n: number) {
  return new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " so'm";
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

export default function MenuPage() {
  const params = useParams<{ venueName: string }>();
  const venueName = decodeURIComponent(params.venueName);
  const [data, setData] = useState<PublicMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("Barchasi");
  const tabsRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("menu-theme");
      if (stored) return stored === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("menu-theme", dark ? "dark" : "light");
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [dark]);

  useEffect(() => {
    if (!venueName) return;
    setLoading(true);
    customFetch<PublicMenu>(`/api/public/menu/by-name/${encodeURIComponent(venueName)}`)
      .then((d) => {
        setData(d);
      })
      .catch(() => setError("Menyu yuklanmadi"))
      .finally(() => setLoading(false));
  }, [venueName]);

  useEffect(() => {
    if (lightbox) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [lightbox]);

  const scrollTabs = (dir: "left" | "right") => {
    if (!tabsRef.current) return;
    tabsRef.current.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
  };

  const grouped: Grouped = {};
  if (data) {
    for (const p of data.products) {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    }
  }

  const existingCategories = new Set(Object.keys(grouped));
  const orderedTabs = CATEGORY_ORDER.filter((c) => c === "Barchasi" || existingCategories.has(c));
  for (const cat of Object.keys(grouped)) {
    if (!CATEGORY_ORDER.includes(cat)) {
      orderedTabs.push(cat);
    }
  }

  const filteredProducts = activeCategory === "Barchasi"
    ? (data?.products ?? [])
    : (grouped[activeCategory] ?? []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf9f7] dark:bg-zinc-950 flex items-center justify-center">
        <div className="animate-pulse text-[#E0714F] text-lg">Yuklanmoqda...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#faf9f7] dark:bg-zinc-950 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="text-6xl mb-4">🍽️</div>
          <p className="text-zinc-500 dark:text-zinc-400 text-lg">{error || "Menyu topilmadi"}</p>
        </div>
      </div>
    );
  }

  const venue = data.venue;

  return (
    <div className="min-h-screen bg-[#faf9f7] dark:bg-zinc-950 transition-colors">
      {/* Venue Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 transition-colors">
        <div className="max-w-full px-10 sm:px-12 lg:px-14 py-4 sm:py-5">
          <div className="flex items-center justify-between gap-4">
            {/* Left — venue avatar + name + type */}
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              {venue.logoUrl ? (
                <img
                  src={venue.logoUrl}
                  alt={venue.name}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover shadow shrink-0"
                />
              ) : (
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#E0714F] flex items-center justify-center text-white text-lg sm:text-xl font-bold shadow shrink-0">
                  {venue.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100 truncate">{venue.name}</h1>
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 truncate">
                  <span>{venue.type === "cafe" ? "☕ Kafe" : "🍽️ Restoran"}</span>
                  {venue.address && (
                    <><span className="text-zinc-300 dark:text-zinc-600">·</span>
                      <a href={`https://www.google.com/maps?q=${venue.latitude ? `${venue.latitude},${venue.longitude}` : encodeURIComponent(venue.address)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="truncate text-zinc-500 dark:text-zinc-400 hover:text-[#E0714F] dark:hover:text-[#E0714F] transition-colors inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{venue.address}</span>
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right — social links + theme toggle */}
            <div className="flex items-center gap-3 sm:gap-4 shrink-0">
              {[venue.instagram, venue.telegram, venue.facebook].some(Boolean) && (
                <>
                  {venue.instagram && (
                    <a href={`https://instagram.com/${venue.instagram}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 hover:text-[#E0714F] dark:hover:text-[#E0714F] transition-colors">
                      <InstagramIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                      <span className="text-xs sm:text-sm font-medium hidden sm:inline">Instagram</span>
                    </a>
                  )}
                  {venue.telegram && (
                    <a href={`https://t.me/${venue.telegram}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 hover:text-[#E0714F] dark:hover:text-[#E0714F] transition-colors">
                      <TelegramIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                      <span className="text-xs sm:text-sm font-medium hidden sm:inline">Telegram</span>
                    </a>
                  )}
                  {venue.facebook && (
                    <a href={`https://facebook.com/${venue.facebook}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 hover:text-[#E0714F] dark:hover:text-[#E0714F] transition-colors">
                      <FacebookIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                      <span className="text-xs sm:text-sm font-medium hidden sm:inline">Facebook</span>
                    </a>
                  )}
                </>
              )}

              <button onClick={() => setDark((d) => !d)}
                className="ml-1 sm:ml-2 p-2 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                {dark ? <SunIcon /> : <MoonIcon />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Category tabs */}
      {orderedTabs.length > 1 && (
        <div className="sticky top-0 z-10 bg-[#1c1816] shadow-lg">
          <div className="relative flex items-center justify-center max-w-7xl mx-auto px-2">
            <button onClick={() => scrollTabs("left")}
              className="shrink-0 px-2 py-3 text-zinc-400 hover:text-white transition-colors">
              ◀
            </button>
            <div ref={tabsRef} className="flex gap-1 py-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory scroll-smooth" style={{ scrollbarWidth: "none" }}>
              {orderedTabs.map((cat) => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 snap-start px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    activeCategory === cat
                      ? "bg-[#E0714F] text-white"
                      : "text-zinc-300 hover:text-white hover:bg-zinc-800"
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
            <button onClick={() => scrollTabs("right")}
              className="shrink-0 px-2 py-3 text-zinc-400 hover:text-white transition-colors">
              ▶
            </button>
          </div>
        </div>
      )}

      {/* Products */}
      <div className="px-10 sm:px-12 lg:px-14 py-6 max-w-full">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-zinc-500 dark:text-zinc-400">Hozircha mahsulotlar yo'q</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredProducts.map((p) => (
              <div key={p.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden hover:shadow-md dark:hover:shadow-zinc-900/50 transition-all">
                {p.imageUrl && (
                  <div className="w-full aspect-square bg-zinc-100 dark:bg-zinc-800 cursor-pointer overflow-hidden" onClick={() => setLightbox(p.imageUrl!)}>
                    <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" loading="lazy" />
                  </div>
                )}
                <div className="p-3.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">{p.name}</h3>
                    {p.description && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">{p.description}</p>}
                  </div>
                  <span className="text-[#E0714F] font-bold text-sm whitespace-nowrap shrink-0">{fmt(p.price)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Image Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="relative max-w-3xl w-full max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setLightbox(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white text-2xl">
              ✕
            </button>
            <img src={lightbox} alt="Katta ko'rinish" className="w-full h-auto max-h-[85vh] object-contain rounded-lg" />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 mt-8">
        <div className="px-10 sm:px-12 lg:px-14 py-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
          Menyu {venue.name} tomonidan taqdim etilgan
          <br />
          <span className="text-[#E0714F]">resca.uz</span> orqali boshqariladi
        </div>
      </div>
    </div>
  );
}
