import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_DEFAULT_CHECKED } from "../../src/shared/consent";
import { ContactForm } from "../../src/web/ContactForm";
import { Validar } from "../../src/web/pages/Validar";

type Handler = (url: string, init: RequestInit) => { status: number; body: unknown } | "network";
let calls: { url: string; method: string; body: any; headers: Record<string, string> }[] = [];

function mockFetch(handler: Handler) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined, headers: (init.headers ?? {}) as Record<string, string> });
      const r = handler(url, init);
      if (r === "network") throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify(r.body), { status: r.status });
    }),
  );
}
beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe("ContactForm", () => {
  it("el consentimiento aparece desmarcado por defecto", () => {
    mockFetch(() => ({ status: 200, body: {} }));
    render(<ContactForm redemptionId="r1" onFinish={() => {}} />);
    expect(CONSENT_DEFAULT_CHECKED).toBe(false);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("¿El cliente desea recibir próximas promociones?")).toBeTruthy();
  });

  it("escribir un teléfono sin marcar la casilla NO envía nada y pide el consentimiento", async () => {
    mockFetch(() => ({ status: 201, body: {} }));
    const onFinish = vi.fn();
    render(<ContactForm redemptionId="r1" onFinish={onFinish} />);
    await userEvent.type(screen.getByLabelText(/Teléfono/), "987654321");
    await userEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));
    expect(screen.getByText(/Marca la casilla de consentimiento/)).toBeTruthy();
    expect(calls).toHaveLength(0);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("valida solo lo que tiene contenido y exige al menos un medio de contacto", async () => {
    mockFetch(() => ({ status: 201, body: {} }));
    render(<ContactForm redemptionId="r1" onFinish={() => {}} />);
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));
    expect(screen.getByText("Ingresa al menos un teléfono o un correo.")).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/Correo/), "no-es-correo");
    await userEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));
    expect(screen.getByText("Ingresa un correo válido.")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it("“Omitir y continuar” no llama a la API", async () => {
    mockFetch(() => ({ status: 201, body: {} }));
    const onFinish = vi.fn();
    render(<ContactForm redemptionId="r1" onFinish={onFinish} />);
    await userEvent.click(screen.getByRole("button", { name: "Omitir y continuar" }));
    expect(onFinish).toHaveBeenCalledWith("skipped");
    expect(calls).toHaveLength(0);
  });

  it("con consentimiento envía versión del texto y el cuerpo esperado a la ruta del canje", async () => {
    mockFetch(() => ({ status: 201, body: { saved: true } }));
    const onFinish = vi.fn();
    render(<ContactForm redemptionId="abc" onFinish={onFinish} />);
    await userEvent.type(screen.getByLabelText(/Correo/), "ana@ejemplo.com");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith("saved"));
    expect(calls[0]).toMatchObject({ url: "/api/validador/redemptions/abc/contact", method: "POST" });
    expect(calls[0]!.body).toMatchObject({ email: "ana@ejemplo.com", consent: true, consentTextVersion: "2026-10-v1" });
    expect(calls[0]!.headers["x-shimaya-csrf"]).toBe("1");
  });
});

describe("pantalla Validar", () => {
  const redemption = { replayed: false, message: "Cupón canjeado correctamente", redemption: { id: "r-1", redeemedAt: "2026-10-24T17:00:00.000Z", campaign: "Gyoza", benefit: "Una gyoza" } };
  const coupon = { campaign: "Gyoza", benefit: "Una gyoza", validFrom: "2026-10-01T05:00:00.000Z", validUntil: "2026-12-01T05:00:00.000Z" };

  it("consultar no canjea; el canje es un paso aparte y la clave de reintento se conserva", async () => {
    let redeemAttempts = 0;
    mockFetch((url) => {
      if (url.endsWith("/coupons/lookup")) return { status: 200, body: { state: "available", message: "Cupón disponible", coupon } };
      redeemAttempts++;
      return redeemAttempts === 1 ? "network" : { status: 201, body: redemption };
    });
    render(<Validar />);
    await userEvent.type(screen.getByLabelText(/Código del cupón/), "00012345");
    await userEvent.click(screen.getByRole("button", { name: "Consultar cupón" }));
    await screen.findByText("Cupón disponible");
    expect(calls.filter((c) => c.url.endsWith("/redemptions"))).toHaveLength(0);
    expect((screen.getByLabelText(/Código del cupón/) as HTMLInputElement).value).toBe("00012345");

    await userEvent.click(screen.getByRole("button", { name: "Confirmar canje" }));
    await screen.findByText(/falta de conexión/);
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText("Cupón canjeado correctamente");
    const redeems = calls.filter((c) => c.url.endsWith("/redemptions"));
    expect(redeems).toHaveLength(2);
    expect(redeems[0]!.headers["idempotency-key"]).toBeTruthy();
    expect(redeems[0]!.headers["idempotency-key"]).toBe(redeems[1]!.headers["idempotency-key"]);
  });

  it("si falla el guardado del contacto, el canje queda hecho y NO se vuelve a canjear", async () => {
    mockFetch((url) => {
      if (url.endsWith("/coupons/lookup")) return { status: 200, body: { state: "available", message: "Cupón disponible", coupon } };
      if (url.endsWith("/contact")) return { status: 500, body: { error: "contact_save_failed", message: "No pudimos guardar los datos. El canje ya quedó registrado; puedes reintentar u omitir." } };
      return { status: 201, body: redemption };
    });
    render(<Validar />);
    await userEvent.type(screen.getByLabelText(/Código del cupón/), "00012345");
    await userEvent.click(screen.getByRole("button", { name: "Consultar cupón" }));
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar canje" }));
    await screen.findByText("¿El cliente desea recibir próximas promociones?");
    await userEvent.type(screen.getByLabelText(/Teléfono/), "987654321");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));
    await screen.findByText(/El canje ya quedó registrado/);
    expect(screen.getByText("Cupón canjeado correctamente")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar guardar" }));
    await screen.findByText(/El canje ya quedó registrado/);
    expect(calls.filter((c) => c.url.endsWith("/redemptions"))).toHaveLength(1);
  });

  it("muestra el mensaje exacto de cada estado y solo ofrece confirmar cuando está disponible", async () => {
    for (const [state, msg] of [["redeemed", "Este cupón ya fue canjeado"], ["voided", "Este cupón fue anulado"], ["expired", "Este cupón está vencido"], ["unavailable", "La campaña no está disponible"], ["not_found", "No encontramos ese código"]] as const) {
      cleanup();
      mockFetch(() => ({ status: 200, body: { state, message: msg, ...(state === "not_found" ? {} : { coupon }) } }));
      render(<Validar />);
      await userEvent.type(screen.getByLabelText(/Código del cupón/), "00012345");
      await userEvent.click(screen.getByRole("button", { name: "Consultar cupón" }));
      await screen.findByText(msg);
      expect(screen.queryByRole("button", { name: "Confirmar canje" })).toBeNull();
      expect(screen.getByRole("button", { name: "Validar otro cupón" })).toBeTruthy();
    }
  });

  it("el campo es numérico para teclado móvil y descarta letras", async () => {
    mockFetch(() => ({ status: 200, body: {} }));
    render(<Validar />);
    const input = screen.getByLabelText(/Código del cupón/) as HTMLInputElement;
    expect(input.getAttribute("inputmode")).toBe("numeric");
    await userEvent.type(input, "00a1 2b3");
    expect(input.value).toBe("00123");
  });
});
