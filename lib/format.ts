export function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function hours(value: number): string {
  return `${value.toFixed(1)}`;
}

export function pct(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function clockLabel(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
