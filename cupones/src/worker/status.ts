// ÚNICA definición del estado EFECTIVO de un cupón, usada por la validación, los listados y
// las estadísticas (así nunca se contradicen ni hay doble conteo: las categorías son
// mutuamente excluyentes y suman el total).
//
// Precedencia (de mayor a menor):
//   1. cupón canjeado           -> redeemed     (hecho irreversible)
//   2. cupón anulado            -> voided
//   3. ahora >= fin de campaña  -> expired      (ends_at es EXCLUSIVO)
//   4. campaña inactiva, o ahora < inicio -> unavailable
//   5. en otro caso             -> available
//
// `nowParam` es el placeholder SQL (con parámetro ligado) que contiene el instante actual en ISO UTC.

export function effectiveStatusSql(nowParam: string, coupon = "c", campaign = "ca"): string {
  return `CASE
    WHEN ${coupon}.status = 'redeemed' THEN 'redeemed'
    WHEN ${coupon}.status = 'voided' THEN 'voided'
    WHEN ${nowParam} >= ${campaign}.ends_at THEN 'expired'
    WHEN ${campaign}.status <> 'active' OR ${nowParam} < ${campaign}.starts_at THEN 'unavailable'
    ELSE 'available' END`;
}
