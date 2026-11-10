export function formatMoney(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

export function formatCompactMoney(minor: number, currency = "USD"): string {
  return formatMoney(minor, currency);
}

export function greeting(name: string, now = new Date()): string {
  const hour = now.getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${name}!`;
}

export function relativeDay(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function formatWhen(iso: string | null, now = new Date()): string {
  if (!iso) return "Not verified yet";
  return `${relativeDay(iso, now)} · ${new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

export function csvEscape(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function invoicesToCsv(
  rows: { number: string; customer: string; status: string; total: string; due: string; updated: string }[],
): string {
  const header = ["Invoice", "Customer", "Status", "Total", "Amount due", "Updated"];
  const body = rows.map((row) => [row.number, row.customer, row.status, row.total, row.due, row.updated].map(csvEscape).join(","));
  return [header.join(","), ...body].join("\n");
}

export function statusLabel(value: string): string {
  return value.replaceAll("_", " ");
}
