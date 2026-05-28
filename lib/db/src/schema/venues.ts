import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const venuesTable = pgTable("venues", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["cafe", "restaurant"] }).notNull().default("cafe"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  instagram: text("instagram"),
  telegram: text("telegram"),
  facebook: text("facebook"),
  adminId: integer("admin_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVenueSchema = createInsertSchema(venuesTable).omit({ id: true, createdAt: true });
export type InsertVenue = z.infer<typeof insertVenueSchema>;
export type Venue = typeof venuesTable.$inferSelect;
