import { z } from "zod";
import { isDateString } from "./dates";

export const dateString = z.string().refine(isDateString, "Must be a date in YYYY-MM-DD format");
export const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be a time in HH:mm format");
export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});

export function pageArgs(p: { page: number; pageSize: number }) {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export function paged<T>(items: T[], total: number, p: { page: number; pageSize: number }) {
  return { items, total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total / p.pageSize) };
}
