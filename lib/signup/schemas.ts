import { z } from "zod";

/**
 * Validación del auto-registro público. Mensajes es-MX. El honeypot
 * (`website`) debe venir vacío: los bots suelen llenar todos los campos.
 */
export const signupSchema = z
  .object({
    seasonId: z.uuid({ error: "Selecciona una liga/temporada" }),
    kind: z.enum(["coach", "player"], { error: "Tipo inválido" }),
    fullName: z
      .string({ error: "Tu nombre es obligatorio" })
      .trim()
      .min(2, "Tu nombre es obligatorio")
      .max(120, "El nombre es demasiado largo"),
    email: z.email({ error: "El correo no es válido" }).max(160),
    phone: z
      .string()
      .trim()
      .max(30)
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    teamName: z
      .string()
      .trim()
      .max(80)
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    teamColor: z
      .union([
        z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido"),
        z.literal(""),
      ])
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    preferredTeamId: z
      .union([z.uuid(), z.literal("")])
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    position: z
      .string()
      .trim()
      .max(40)
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    jerseyNumber: z
      .string()
      .trim()
      .max(4)
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    message: z
      .string()
      .trim()
      .max(600)
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    // Honeypot: campo oculto que un humano nunca llena.
    website: z.string().max(0, "spam").optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "coach" && (!data.teamName || data.teamName.length < 2)) {
      ctx.addIssue({
        code: "custom",
        path: ["teamName"],
        message: "El nombre del equipo es obligatorio para coaches",
      });
    }
  });

export type SignupInput = z.infer<typeof signupSchema>;

/** Unión a un equipo vía link de invitación (el código va en la URL). */
export const teamJoinSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4, "Código inválido")
    .max(12, "Código inválido"),
  fullName: z
    .string({ error: "Tu nombre es obligatorio" })
    .trim()
    .min(2, "Tu nombre es obligatorio")
    .max(120, "El nombre es demasiado largo"),
  email: z.email({ error: "El correo no es válido" }).max(160),
  phone: z
    .string()
    .trim()
    .max(30)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
  position: z
    .string()
    .trim()
    .max(40)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
  jerseyNumber: z
    .string()
    .trim()
    .max(4)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
  message: z
    .string()
    .trim()
    .max(600)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
  website: z.string().max(0, "spam").optional().or(z.literal("")),
});

/** Aprobación de coach: crea el equipo en la división elegida. */
export const approveCoachSchema = z.object({
  requestId: z.uuid(),
  divisionId: z.uuid({ error: "Selecciona la división" }),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,40}$/, "El slug solo admite minúsculas, números y guiones"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "El color debe ser hexadecimal (#RRGGBB)"),
  amount: z
    .union([z.coerce.number().min(0), z.literal("")])
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
});

/** Aprobación de jugador: crea el jugador y lo pone en el roster elegido. */
export const approvePlayerSchema = z.object({
  requestId: z.uuid(),
  teamId: z.uuid({ error: "Selecciona el equipo" }),
  jerseyNumber: z
    .string({ error: "El número es obligatorio" })
    .trim()
    .min(1, "El número es obligatorio")
    .max(4),
  position: z
    .string()
    .trim()
    .max(40)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
});
