export type StayOption = { id: string; checkIn: string; checkOut: string; totalCost: string };
export const currencies = ["SGD", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "NZD", "CHF", "THB", "MYR", "IDR", "KRW", "TWD", "HKD", "CNY", "INR"];

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function stayNights(checkIn: string, checkOut: string) {
  if (!validDate(checkIn) || !validDate(checkOut)) return 0;
  return Math.max(0, (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000);
}

export function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: 2 }).format(amount);
}

export function readAccommodation(form: FormData) {
  const get = (key: string) => typeof form.get(key) === "string" ? (form.get(key) as string).trim() : "";
  const name = get("name");
  const kind = get("kind");
  const currency = get("currency");
  const bookedVia = get("bookedVia");
  const description = get("description");
  const confirmedOptionId = get("confirmedOptionId") || null;
  const freeCancellation = form.get("freeCancellation") === "on";
  const cancellationUntil = freeCancellation ? get("cancellationUntil") : "";
  const cancellationTimezone = freeCancellation ? get("cancellationTimezone") : "";
  if (!name || name.length > 200) return { error: "Enter an accommodation name (up to 200 characters)." } as const;
  if (kind !== "hotel" && kind !== "airbnb") return { error: "Choose Hotel or Airbnb." } as const;
  if (!currencies.includes(currency)) return { error: "Choose a supported currency." } as const;
  if (bookedVia.length > 200 || description.length > 10000) return { error: "Booking platform or description is too long." } as const;
  let parsed: unknown;
  try { parsed = JSON.parse(get("dateOptions")); } catch { return { error: "Date options could not be read." } as const; }
  if (!Array.isArray(parsed) || parsed.length > 50) return { error: "Add up to 50 date options." } as const;
  const dateOptions: StayOption[] = [];
  for (const option of parsed) {
    if (!option || typeof option.id !== "string" || !/^[\w-]{1,64}$/.test(option.id) || dateOptions.some((existing) => existing.id === option.id)) return { error: "Date options must have unique IDs." } as const;
    if (typeof option.checkIn !== "string" || typeof option.checkOut !== "string" || !stayNights(option.checkIn, option.checkOut)) return { error: "Each check-out date must be after a valid check-in date." } as const;
    if (typeof option.totalCost !== "string" || !/^\d{1,9}(\.\d{1,2})?$/.test(option.totalCost)) return { error: "Enter a non-negative total cost with up to two decimal places for every date option." } as const;
    dateOptions.push({ id: option.id, checkIn: option.checkIn, checkOut: option.checkOut, totalCost: option.totalCost });
  }
  if (confirmedOptionId && !dateOptions.some((option) => option.id === confirmedOptionId)) return { error: "Choose an existing date option to confirm." } as const;
  if (freeCancellation) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(cancellationUntil) || !validDate(cancellationUntil.slice(0, 10)) || Number(cancellationUntil.slice(11, 13)) > 23 || Number(cancellationUntil.slice(14)) > 59) return { error: "Enter the free cancellation deadline, including the time." } as const;
    try { new Intl.DateTimeFormat("en", { timeZone: cancellationTimezone }).format(); } catch { return { error: "Enter a valid cancellation time zone, e.g. Asia/Tokyo." } as const; }
    if (!cancellationTimezone) return { error: "Enter the time zone shown on the booking." } as const;
  }
  return { value: { name, kind, currency, bookedVia, description, dateOptions, confirmedOptionId, freeCancellation, cancellationUntil, cancellationTimezone } } as const;
}
