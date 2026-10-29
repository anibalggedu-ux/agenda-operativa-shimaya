import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../src/web/auth";
import { Login } from "../../src/web/pages/Login";

let calls: { url: string; method: string; body: any }[] = [];

function mockFetch(pin: { status: number; body: unknown }) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url === "/api/auth/me") return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 });
      if (url === "/api/auth/tiendas") return new Response(JSON.stringify({ stores: [{ id: "s1", name: "Tienda Miraflores" }, { id: "s2", name: "Tienda San Isidro" }] }), { status: 200 });
      if (url === "/api/auth/pin-login") return new Response(JSON.stringify(pin.body), { status: pin.status });
      return new Response("{}", { status: 404 });
    }),
  );
}
const show = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>,
  );
beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe("Login por PIN de tienda", () => {
  it("el líder elige su tienda, escribe 6 números y envía solo tienda y PIN", async () => {
    mockFetch({ status: 200, body: { user: { id: "u1", name: "Tienda Miraflores", role: "validador" } } });
    show();
    const button = screen.getByRole("button", { name: "Ingresar" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await waitFor(() => expect(screen.getByRole("option", { name: "Tienda Miraflores" })).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText(/Tienda/), "s1");
    await userEvent.type(screen.getByLabelText(/PIN de la tienda/), "12ab3456");
    expect((screen.getByLabelText(/PIN de la tienda/) as HTMLInputElement).value).toBe("123456");
    expect(button.disabled).toBe(false);
    await userEvent.click(button);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/auth/pin-login")).toBe(true));
    expect(calls.find((c) => c.url === "/api/auth/pin-login")!.body).toEqual({ storeId: "s1", pin: "123456" });
  });

  it("con PIN incorrecto muestra el error y vacía el campo", async () => {
    mockFetch({ status: 401, body: { error: "bad_pin", message: "PIN incorrecto." } });
    show();
    await waitFor(() => expect(screen.getByRole("option", { name: "Tienda San Isidro" })).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText(/Tienda/), "s2");
    await userEvent.type(screen.getByLabelText(/PIN de la tienda/), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));
    await waitFor(() => expect(screen.getByText("PIN incorrecto.")).toBeTruthy());
    expect((screen.getByLabelText(/PIN de la tienda/) as HTMLInputElement).value).toBe("");
  });

  it("la pestaña Administración conserva el ingreso con correo y contraseña", async () => {
    mockFetch({ status: 200, body: {} });
    show();
    await userEvent.click(screen.getByRole("tab", { name: "Administración" }));
    expect(screen.getByLabelText("Correo")).toBeTruthy();
    expect(screen.getByLabelText("Contraseña")).toBeTruthy();
  });
});
