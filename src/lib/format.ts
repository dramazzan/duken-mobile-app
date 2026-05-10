export function formatMoney(value: number) {
  return `${new Intl.NumberFormat('ru-KZ', {
    maximumFractionDigits: 0,
  }).format(Math.round(value))} ₸`;
}

export function parsePositiveNumber(value: string) {
  const normalized = value.replace(',', '.').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseInteger(value: string) {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}
