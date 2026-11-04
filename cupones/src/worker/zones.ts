// Zona de un cupón: la zona de su campaña cuyo rango contiene el número del código (0001 = 1).
// Devuelve NULL si ninguna cubre ese número. No se guarda en el cupón: se calcula al consultar.
export const zoneNameSql = (coupon = "c") =>
  `(SELECT z.name FROM campaign_zones z
     WHERE z.campaign_id = ${coupon}.campaign_id AND CAST(${coupon}.code AS INTEGER) BETWEEN z.from_number AND z.to_number
     LIMIT 1)`;
