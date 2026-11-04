import { describe, expect, it } from "vitest";
import { parseCouponCsv } from "../../src/shared/csv";
import { formatLima, limaDayEndExclusiveIso, limaDayStartIso, limaYmd, limaYmdOfInclusiveEnd, parseYmd } from "../../src/shared/time";
import { codeProblem, contactInputSchema } from "../../src/shared/validation";
import { hashPassword, verifyPassword } from "../../src/worker/password";

describe("zona horaria America/Lima", () => {
  it("convierte días de Lima a instantes UTC (UTC-5, sin horario de verano)", () => {
    expect(limaDayStartIso("2026-12-01")).toBe("2026-12-01T05:00:00.000Z");
    expect(limaDayStartIso("2026-07-01")).toBe("2026-07-01T05:00:00.000Z");
    expect(limaDayEndExclusiveIso("2026-12-31")).toBe("2027-01-01T05:00:00.000Z");
  });
  it("rechaza fechas inexistentes", () => {
    expect(parseYmd("2026-02-30")).toBeNull();
    expect(parseYmd("2026-13-01")).toBeNull();
    expect(parseYmd("26-1-1")).toBeNull();
    expect(limaDayStartIso("hoy")).toBeNull();
  });
  it("muestra en Lima, no en UTC", () => {
    expect(limaYmd("2026-10-25T03:00:00.000Z")).toBe("2026-10-24");
    expect(limaYmd("2026-10-25T05:00:00.000Z")).toBe("2026-10-25");
    expect(limaYmdOfInclusiveEnd("2027-01-01T05:00:00.000Z")).toBe("2026-12-31");
    expect(formatLima("2026-10-25T03:00:00.000Z")).toMatch(/24/);
    expect(formatLima("basura")).toBe("—");
  });
});

describe("lector de CSV de cupones", () => {
  it("conserva ceros, detecta duplicados y errores por fila (numeradas como en el archivo)", () => {
    const { rows } = parseCouponCsv("codigo\n00001234\n00001234\n12\n\nabc\n", 8);
    expect(rows).toEqual([
      { rowNumber: 2, code: "00001234", error: null },
      expect.objectContaining({ rowNumber: 3, error: expect.stringContaining("fila 2") }),
      expect.objectContaining({ rowNumber: 4, error: expect.stringContaining("Longitud") }),
      expect.objectContaining({ rowNumber: 6, error: "El código debe tener solo números." }),
    ]);
  });
  it("sin encabezado toma la primera columna; con encabezado busca la columna 'código'", () => {
    expect(parseCouponCsv("00001111\n00002222", 8).rows.map((r) => r.code)).toEqual(["00001111", "00002222"]);
    expect(parseCouponCsv("nota,Código\nx,00003333", 8).rows.map((r) => r.code)).toEqual(["00003333"]);
  });
  it("explica la pérdida de ceros típica de Excel", () => {
    expect(parseCouponCsv("12345", 8).rows[0]!.error).toMatch(/Texto/);
  });
});

describe("validaciones", () => {
  it("longitud por campaña", () => {
    expect(codeProblem("1234", 6)).toMatch(/exactamente 6/);
    expect(codeProblem("123456", 6)).toBeNull();
    expect(codeProblem("12a456", 6)).toMatch(/solo números/);
  });
  it("contacto: vacíos se vuelven null, teléfono se normaliza, correo en minúsculas", () => {
    const r = contactInputSchema.parse({ firstName: " ", lastName: null, phone: "(+51) 987-654-321", email: " A@B.CO ", consent: true, consentTextVersion: "x" });
    expect(r).toMatchObject({ firstName: null, lastName: null, phone: "+51987654321", email: "a@b.co" });
  });
});

describe("contraseñas", () => {
  it("PBKDF2: verifica la correcta, rechaza la incorrecta, sales distintas, nunca en claro", async () => {
    const h1 = await hashPassword("una clave larga 123");
    const h2 = await hashPassword("una clave larga 123");
    expect(h1).not.toBe(h2);
    expect(h1).toMatch(/^pbkdf2\$sha256\$100000\$/);
    expect(h1).not.toContain("una clave larga");
    expect(await verifyPassword("una clave larga 123", h1)).toBe(true);
    expect(await verifyPassword("otra", h1)).toBe(false);
    expect(await verifyPassword("x", "texto-plano")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2$sha256$999999999$AAAA$AAAA")).toBe(false);
  });
});
