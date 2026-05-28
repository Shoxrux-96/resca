/** YYYY-MM-DD for <input type="date"> */
export function toDateInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** HH:mm (24 soat) for <input type="time"> */
export function toTimeInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO string from date + time (local) */
export function combineDateAndTime(date: string, time: string): string {
  if (!date || !time) return "";
  const [h, m] = time.split(":").map((x) => parseInt(x, 10));
  const [y, mo, d] = date.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, mo - 1, d, h || 0, m || 0, 0, 0);
  return dt.toISOString();
}

/** Ko‘rsatish: 28.05.2026, 14:30 (24 soat, AM/PM yo‘q) */
export function formatDateTime24(iso: string): string {
  return new Date(iso).toLocaleString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
