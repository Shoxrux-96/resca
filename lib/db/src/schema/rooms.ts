import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roomsTable = pgTable("rooms", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tablesTable = pgTable("tables", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull(),
  roomId: integer("room_id"),
  number: integer("number").notNull(),
  name: text("name"),
  capacity: integer("capacity").default(4),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRoomSchema = createInsertSchema(roomsTable).omit({ id: true, createdAt: true });
export const insertTableSchema = createInsertSchema(tablesTable).omit({ id: true, createdAt: true });

export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type InsertTable = z.infer<typeof insertTableSchema>;
export type Room = typeof roomsTable.$inferSelect;
export type Table = typeof tablesTable.$inferSelect;
