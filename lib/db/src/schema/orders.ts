import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull(),
  customerId: integer("customer_id"),
  waiterId: integer("waiter_id"),
  roomId: integer("room_id"),
  tableId: integer("table_id"),
  tableNumber: integer("table_number"),
  roomName: text("room_name"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  paymentType: text("payment_type", { enum: ["cash", "card", "transfer", "debt"] }).notNull().default("cash"),
  paymentSplit: text("payment_split"),
  status: text("status", { enum: ["open", "completed", "debt", "cancelled"] }).notNull().default("completed"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
