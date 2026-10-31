import { z } from "zod";

export const CODE_MIN_LENGTH = 4;
export const CODE_MAX_LENGTH = 16;

/** Código numérico como TEXTO (conserva ceros iniciales). No se recorta ni se rellena. */
export const codeSchema = z
  .string({ error: "Ingresa el código del cupón." })
  .trim()
  .regex(new RegExp(`^\\d{${CODE_MIN_LENGTH},${CODE_MAX_LENGTH}}$`), "El código debe tener solo números (entre 4 y 16 dígitos).");

export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,64}$/, "Clave de reintento inválida.");

const cleanText = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .pipe(z.string().max(max, `Máximo ${max} caracteres.`));

/** Campo opcional: vacío se vuelve null y NO se valida; con contenido se valida. */
function optional<T extends z.ZodType<string>>(schema: T) {
  return z
    .string()
    .nullish()
    .transform((v, ctx) => {
      const text = typeof v === "string" ? v.trim() : "";
      if (text === "") return null as string | null;
      const r = schema.safeParse(text);
      if (!r.success) {
        for (const issue of r.error.issues) ctx.addIssue({ code: "custom", message: issue.message });
        return z.NEVER;
      }
      return r.data as string;
    });
}

export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s\-().]/g, ""))
  .pipe(z.string().regex(/^\+?\d{7,15}$/, "Ingresa un teléfono válido (solo números, de 7 a 15 dígitos)."));

export const emailSchema = z
  .string()
  .trim()
  .max(254, "El correo es demasiado largo.")
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Ingresa un correo válido.")
  .transform((s) => s.toLowerCase());

export const contactInputSchema = z
  .object({
    firstName: optional(cleanText(80)),
    lastName: optional(cleanText(80)),
    phone: optional(phoneSchema),
    email: optional(emailSchema),
    consent: z.boolean({ error: "Falta indicar el consentimiento." }),
    consentTextVersion: z.string().max(40),
  })
  .strict();

export type ContactInput = z.infer<typeof contactInputSchema>;

export const campaignInputSchema = z
  .object({
    name: z.string().trim().min(3, "El nombre es muy corto.").max(80),
    description: z.string().trim().max(500).default(""),
    benefit: z.string().trim().min(3, "Describe el beneficio.").max(200),
    startsAt: z.iso.datetime({ message: "Fecha de inicio inválida." }),
    endsAt: z.iso.datetime({ message: "Fecha de fin inválida." }),
    status: z.enum(["active", "inactive"]).default("active"),
    codeLength: z.number().int().min(CODE_MIN_LENGTH).max(CODE_MAX_LENGTH),
  })
  .strict()
  .refine((v) => new Date(v.endsAt).getTime() > new Date(v.startsAt).getTime(), {
    message: "La fecha de fin debe ser posterior a la de inicio.",
    path: ["endsAt"],
  });

export type CampaignInput = z.infer<typeof campaignInputSchema>;

/** Valida un código contra la longitud configurada de su campaña. */
export function codeProblem(code: string, codeLength: number): string | null {
  if (!/^\d+$/.test(code)) return "El código debe tener solo números.";
  if (code.length !== codeLength) return `El código debe tener exactamente ${codeLength} dígitos.`;
  return null;
}
