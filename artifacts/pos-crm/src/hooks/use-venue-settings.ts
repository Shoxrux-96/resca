import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";

export type VenueSettings = {
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

export function useVenueSettings() {
  const { user, token } = useAuth();
  const venueId = user?.venueId ?? 0;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  return useQuery<VenueSettings>({
    queryKey: ["venue-settings", venueId],
    enabled: !!venueId && !!token,
    queryFn: async () => {
      const r = await fetch(`/api/venues/${venueId}/settings`, { headers });
      if (!r.ok) throw new Error("Sozlamalarni yuklab bo'lmadi");
      return r.json();
    },
    staleTime: 30_000,
  });
}
