// Tipos y textos compartidos entre la API y la interfaz.

export type Role = "validador" | "moderador" | "analista";

/** Estado EFECTIVO de un cupón (almacenado + vigencia de campaña). Mutuamente excluyentes. */
export type CouponState = "available" | "redeemed" | "voided" | "expired" | "unavailable";

export const STATE_LABELS: Record<CouponState | "not_found", string> = {
  available: "Cupón disponible",
  redeemed: "Este cupón ya fue canjeado",
  voided: "Este cupón fue anulado",
  expired: "Este cupón está vencido",
  unavailable: "La campaña no está disponible",
  not_found: "No encontramos ese código",
};

/** Etiquetas cortas para tablas y gráficos. */
export const STATE_SHORT: Record<CouponState, string> = {
  available: "Disponible",
  redeemed: "Canjeado",
  voided: "Anulado",
  expired: "Vencido",
  unavailable: "Campaña no disponible",
};

export const STATE_ORDER: CouponState[] = ["available", "redeemed", "expired", "voided", "unavailable"];

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LookupResult {
  state: CouponState | "not_found";
  message: string;
  coupon?: { campaign: string; benefit: string; validFrom: string; validUntil: string };
}
