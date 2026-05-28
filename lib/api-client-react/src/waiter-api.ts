import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

/* ── Types ── */

export interface OpenOrderItem {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  total: number;
}

export interface ActiveOrder {
  id: number;
  venueId: number;
  tableId: number | null;
  tableNumber: number | null;
  roomId: number | null;
  roomName: string | null;
  waiterId: number | null;
  waiterName: string | null;
  totalAmount: number;
  notes: string | null;
  createdAt: string;
  items: OpenOrderItem[];
}

export interface WaiterUser {
  id: number;
  username: string;
  name: string | null;
  venueId: number | null;
  createdAt: string;
}

export interface CreateOpenOrderInput {
  tableId?: number | null;
  tableNumber?: number | null;
  roomId?: number | null;
  roomName?: string | null;
  items: Array<{ productId: number; quantity: number; discountPct?: number }>;
  notes?: string;
}

export interface UpdateOpenOrderInput {
  items: Array<{ productId: number; quantity: number; discountPct?: number }>;
  notes?: string;
}

export interface PayOpenOrderInput {
  paymentType: "cash" | "card" | "transfer" | "debt";
  paymentSplit?: Record<string, number>;
  customerId?: number | null;
  notes?: string;
  items?: Array<{ productId: number; quantity: number; discountPct?: number }>;
}

export interface CreateWaiterInput {
  username: string;
  password: string;
  name?: string;
}

/* ── Query keys ── */

export const getListOpenOrdersQueryKey = (venueId: number) =>
  ["/api/venues", venueId, "open-orders"] as const;

export const getListWaitersQueryKey = (venueId: number) =>
  ["/api/venues", venueId, "waiters"] as const;

/* ── Hooks: Open Orders ── */

export function useListOpenOrders(
  venueId: number,
  options?: { query?: UseQueryOptions<ActiveOrder[], unknown, ActiveOrder[]> }
) {
  return useQuery<ActiveOrder[]>({
    queryKey: getListOpenOrdersQueryKey(venueId),
    queryFn: () => customFetch<ActiveOrder[]>(`/api/venues/${venueId}/open-orders`),
    enabled: !!venueId,
    refetchInterval: 15_000,
    ...options?.query,
  });
}

export function useCreateOpenOrder(
  options?: UseMutationOptions<ActiveOrder, unknown, { venueId: number; data: CreateOpenOrderInput }>
) {
  return useMutation<ActiveOrder, unknown, { venueId: number; data: CreateOpenOrderInput }>({
    mutationFn: ({ venueId, data }) =>
      customFetch<ActiveOrder>(`/api/venues/${venueId}/open-orders`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    ...options,
  });
}

export function useUpdateOpenOrder(
  options?: UseMutationOptions<ActiveOrder, unknown, { venueId: number; orderId: number; data: UpdateOpenOrderInput }>
) {
  return useMutation<ActiveOrder, unknown, { venueId: number; orderId: number; data: UpdateOpenOrderInput }>({
    mutationFn: ({ venueId, orderId, data }) =>
      customFetch<ActiveOrder>(`/api/venues/${venueId}/open-orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    ...options,
  });
}

export function usePayOpenOrder(
  options?: UseMutationOptions<{ id: number; status: string; totalAmount: number }, unknown, { venueId: number; orderId: number; data: PayOpenOrderInput }>
) {
  return useMutation<{ id: number; status: string; totalAmount: number }, unknown, { venueId: number; orderId: number; data: PayOpenOrderInput }>({
    mutationFn: ({ venueId, orderId, data }) =>
      customFetch(`/api/venues/${venueId}/open-orders/${orderId}/pay`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    ...options,
  });
}

export function useCancelOpenOrder(
  options?: UseMutationOptions<void, unknown, { venueId: number; orderId: number }>
) {
  return useMutation<void, unknown, { venueId: number; orderId: number }>({
    mutationFn: ({ venueId, orderId }) =>
      customFetch<void>(`/api/venues/${venueId}/open-orders/${orderId}`, {
        method: "DELETE",
      }),
    ...options,
  });
}

/* ── Hooks: Waiters ── */

export function useListWaiters(
  venueId: number,
  options?: { query?: UseQueryOptions<WaiterUser[], unknown, WaiterUser[]> }
) {
  return useQuery<WaiterUser[]>({
    queryKey: getListWaitersQueryKey(venueId),
    queryFn: () => customFetch<WaiterUser[]>(`/api/venues/${venueId}/waiters`),
    enabled: !!venueId,
    ...options?.query,
  });
}

export function useCreateWaiter(
  options?: UseMutationOptions<WaiterUser, unknown, { venueId: number; data: CreateWaiterInput }>
) {
  return useMutation<WaiterUser, unknown, { venueId: number; data: CreateWaiterInput }>({
    mutationFn: ({ venueId, data }) =>
      customFetch<WaiterUser>(`/api/venues/${venueId}/waiters`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    ...options,
  });
}

export function useDeleteWaiter(
  options?: UseMutationOptions<void, unknown, { venueId: number; waiterId: number }>
) {
  return useMutation<void, unknown, { venueId: number; waiterId: number }>({
    mutationFn: ({ venueId, waiterId }) =>
      customFetch<void>(`/api/venues/${venueId}/waiters/${waiterId}`, {
        method: "DELETE",
      }),
    ...options,
  });
}
