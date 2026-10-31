import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { campaign, count, coupon, makeApi, userWithSession } from "./helpers";

async function setup(codeLength = 8) {
  const api = makeApi();
  const m = await userWithSession(api, "moderador");
  const camp = await campaign(api, { codeLength });
  return { api, m, camp };
}
const unique = () => String(10000000 + Math.floor(Math.random() * 80000000));
const post = (api: ReturnType<typeof makeApi>, cookie: string, path: string, body: object) => api.call("POST", path, { cookie, body });

describe("importación CSV", () => {
  it("vista previa: valida cada fila, conserva ceros iniciales y NO escribe nada", async () => {
    const { api, m, camp } = await setup();
    const a = unique();
    const csv = `codigo\n00012345\n${a}\nabc12345\n1234\n`;
    const before = await count("SELECT COUNT(*) AS n FROM coupons WHERE campaign_id = ?", camp.id);
    const r = await post(api, m.cookie, "/api/admin/imports/preview", { campaignId: camp.id, csv });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 4, valid: 2, invalid: 2 });
    expect(r.body.errors.map((e: { rowNumber: number }) => e.rowNumber)).toEqual([4, 5]);
    expect(await count("SELECT COUNT(*) AS n FROM coupons WHERE campaign_id = ?", camp.id)).toBe(before);
  });

  it("detecta códigos duplicados dentro del archivo y contra la base de datos", async () => {
    const { api, m, camp } = await setup();
    const existing = await coupon(camp.id, { code: "55500001" });
    const fresh = unique();
    const csv = `${fresh}\n${fresh}\n55500001\n`;
    const r = await post(api, m.cookie, "/api/admin/imports/preview", { campaignId: camp.id, csv });
    expect(r.body).toMatchObject({ total: 3, valid: 1, invalid: 2 });
    expect(r.body.errors[0].error).toMatch(/repetido en el archivo \(primera aparición en la fila 1\)/);
    expect(r.body.errors[1].error).toMatch(/ya existe en la base de datos/);
    expect(existing.code).toBe("55500001");
  });

  it("todo-o-nada (por defecto): con un solo error no se importa NINGÚN cupón, y el error queda registrado", async () => {
    const { api, m, camp } = await setup();
    const a = unique();
    const r = await post(api, m.cookie, "/api/admin/imports/confirm", { campaignId: camp.id, csv: `${a}\nmalo\n` });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ error: "import_rejected", imported: 0, valid: 1, invalid: 1 });
    expect(await count("SELECT COUNT(*) AS n FROM coupons WHERE campaign_id = ?", camp.id)).toBe(0);
    const errs = await api.call("GET", `/api/admin/imports/${r.body.batchId}/errors`, { cookie: m.cookie });
    expect(errs.body.errors).toEqual([{ rowNumber: 2, code: "malo", message: "El código debe tener solo números." }]);
    const batch = await env.DB.prepare("SELECT imported_rows, rejected_rows, mode FROM import_batches WHERE id = ?").bind(r.body.batchId).first();
    expect(batch).toMatchObject({ imported_rows: 0, rejected_rows: 2, mode: "todo_o_nada" });
  });

  it("todo-o-nada sin errores importa todo, con ceros iniciales intactos, y audita", async () => {
    const { api, m, camp } = await setup();
    const csv = "codigo\n00000001\n00000002\n00000003\n";
    const r = await post(api, m.cookie, "/api/admin/imports/confirm", { campaignId: camp.id, csv });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ imported: 3, invalid: 0 });
    const rows = await env.DB.prepare("SELECT code, status FROM coupons WHERE campaign_id = ? ORDER BY code").bind(camp.id).all();
    expect(rows.results).toEqual([
      { code: "00000001", status: "available" },
      { code: "00000002", status: "available" },
      { code: "00000003", status: "available" },
    ]);
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'import_completed' AND entity_id = ?", r.body.batchId)).toBe(1);
  });

  it("modo parcial: importa las filas válidas y registra las rechazadas", async () => {
    const { api, m, camp } = await setup();
    const a = unique();
    const b = unique();
    const r = await post(api, m.cookie, "/api/admin/imports/confirm", { campaignId: camp.id, csv: `${a}\nx\n${b}\n`, mode: "parcial" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ imported: 2, invalid: 1, total: 3 });
    expect(await count("SELECT COUNT(*) AS n FROM coupons WHERE campaign_id = ?", camp.id)).toBe(2);
    expect(await count("SELECT COUNT(*) AS n FROM import_errors WHERE batch_id = ?", r.body.batchId)).toBe(1);
  });

  it("no sobrescribe cupones existentes: un código ya canjeado sigue intacto", async () => {
    const { api, m, camp } = await setup();
    const used = await coupon(camp.id, { code: "77700001", status: "redeemed" });
    const r = await post(api, m.cookie, "/api/admin/imports/confirm", { campaignId: camp.id, csv: "77700001\n", mode: "parcial" });
    expect(r.body).toMatchObject({ imported: 0, invalid: 1 });
    const row = await env.DB.prepare("SELECT status FROM coupons WHERE id = ?").bind(used.id).first<{ status: string }>();
    expect(row?.status).toBe("redeemed");
  });

  it("la longitud se valida contra la campaña, también en el servidor", async () => {
    const { api, m, camp } = await setup(6);
    const r = await post(api, m.cookie, "/api/admin/imports/preview", { campaignId: camp.id, csv: "123456\n12345678\n" });
    expect(r.body).toMatchObject({ valid: 1, invalid: 1 });
    expect(r.body.errors[0].error).toMatch(/exige 6/);
  });

  it("acepta ; como delimitador, comillas, BOM y fin de línea Windows", async () => {
    const { api, m, camp } = await setup();
    const csv = `﻿nota;codigo\r\nuno;"00000010"\r\ndos;00000011\r\n`;
    const r = await post(api, m.cookie, "/api/admin/imports/preview", { campaignId: camp.id, csv });
    expect(r.body).toMatchObject({ total: 2, valid: 2, invalid: 0 });
  });

  it("rechaza archivos vacíos o con demasiadas filas", async () => {
    const { api, m, camp } = await setup();
    expect((await post(api, m.cookie, "/api/admin/imports/preview", { campaignId: camp.id, csv: "codigo\n" })).body.error).toBe("empty_file");
    const many = Array.from({ length: 2001 }, (_, i) => String(20000000 + i)).join("\n");
    expect((await post(api, m.cookie, "/api/admin/imports/preview", { campaignId: camp.id, csv: many })).body.error).toBe("too_many_rows");
  });

  it("una importación grande (2000 filas) entra completa y de forma atómica", async () => {
    const { api, m, camp } = await setup();
    const base = 30000000 + Math.floor(Math.random() * 1000000) * 10;
    const csv = Array.from({ length: 2000 }, (_, i) => String(base + i)).join("\n");
    const r = await post(api, m.cookie, "/api/admin/imports/confirm", { campaignId: camp.id, csv });
    expect(r.status).toBe(201);
    expect(r.body.imported).toBe(2000);
    expect(await count("SELECT COUNT(*) AS n FROM coupons WHERE campaign_id = ?", camp.id)).toBe(2000);
  });

  it("el validador y el analista no pueden importar", async () => {
    const { api, camp } = await setup();
    for (const role of ["validador", "analista"] as const) {
      const u = await userWithSession(api, role);
      expect((await post(api, u.cookie, "/api/admin/imports/confirm", { campaignId: camp.id, csv: unique() })).status).toBe(403);
    }
  });
});
