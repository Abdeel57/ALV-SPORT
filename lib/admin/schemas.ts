import { z } from "zod";

/** Validación Zod de todos los formularios del admin, mensajes es-MX. */

const requiredText = (label: string, max = 120) =>
  z
    .string({ error: `${label} es obligatorio` })
    .trim()
    .min(1, `${label} es obligatorio`)
    .max(max, `${label} es demasiado largo`);

const optionalText = (max = 300) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

const uuid = (label: string) => z.uuid({ error: `Selecciona ${label}` });

const dateStr = (label: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label}: usa el formato AAAA-MM-DD`);

export const seasonSchema = z.object({
  id: z.uuid().optional(),
  leagueId: uuid("la liga"),
  name: requiredText("El nombre"),
  status: z.enum(["draft", "active", "completed", "archived"], {
    error: "Estado inválido",
  }),
  startsOn: dateStr("Inicio").nullable().optional().or(z.literal("").transform(() => null)),
  endsOn: dateStr("Fin").nullable().optional().or(z.literal("").transform(() => null)),
});

export const divisionSchema = z.object({
  id: z.uuid().optional(),
  seasonId: uuid("la temporada"),
  name: requiredText("El nombre"),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const venueSchema = z.object({
  id: z.uuid().optional(),
  name: requiredText("El nombre"),
  address: optionalText(),
});

export const courtSchema = z.object({
  id: z.uuid().optional(),
  venueId: uuid("la sede"),
  name: requiredText("El nombre"),
});

export const teamSchema = z.object({
  id: z.uuid().optional(),
  divisionId: uuid("la división"),
  name: requiredText("El nombre"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,40}$/, "El slug solo admite minúsculas, números y guiones"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "El color debe ser hexadecimal (#RRGGBB)"),
});

export const leagueSchema = z.object({
  id: z.uuid().optional(),
  name: requiredText("El nombre", 80),
  sportId: uuid("el deporte"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "El color debe ser hexadecimal (#RRGGBB)"),
  // Asistente de alta (solo aplican al crear): primera temporada y divisiones.
  seasonName: optionalText(80),
  startsOn: dateStr("Inicio").nullable().optional().or(z.literal("").transform(() => null)),
  endsOn: dateStr("Fin").nullable().optional().or(z.literal("").transform(() => null)),
  divisions: optionalText(300),
});

export const playerSchema = z.object({
  id: z.uuid().optional(),
  firstName: requiredText("El nombre", 60),
  lastName: requiredText("El apellido", 60),
  birthdate: dateStr("Fecha de nacimiento").nullable().optional().or(z.literal("").transform(() => null)),
});

export const rosterAssignSchema = z.object({
  teamId: uuid("el equipo"),
  playerId: uuid("el jugador"),
  // Opcional: los números se reparten después de cerrar inscripciones.
  jerseyNumber: optionalText(4),
  position: optionalText(12),
});

export const sanctionSchema = z.object({
  playerId: uuid("el jugador"),
  reason: requiredText("El motivo", 300),
  gamesCount: z.coerce
    .number({ error: "Número de partidos inválido" })
    .int()
    .min(1, "Mínimo 1 partido")
    .max(99),
  startsOn: dateStr("Inicio de vigencia"),
});

export const newsSchema = z.object({
  id: z.uuid().optional(),
  title: requiredText("El título", 160),
  body: requiredText("El cuerpo", 20_000),
  publish: z.coerce.boolean().default(false),
});

export const sponsorSchema = z.object({
  id: z.uuid().optional(),
  name: requiredText("El nombre", 80),
  linkUrl: z
    .union([z.url({ error: "El link debe ser una URL válida" }), z.literal("")])
    .transform((value) => (value === "" ? null : value)),
  placement: z.enum(["home", "game", "footer"], { error: "Posición inválida" }),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const registrationCreateSchema = z.object({
  seasonId: uuid("la temporada"),
  teamId: uuid("el equipo"),
  amount: z.coerce
    .number({ error: "Monto inválido" })
    .min(0, "El monto no puede ser negativo"),
});

export const cashPaymentSchema = z.object({
  registrationId: z.uuid(),
  paymentRef: optionalText(80),
  note: requiredText("La nota del pago en efectivo", 300),
});

/** Campo opcional del formulario: "" significa "sin campo asignado". */
const optionalCourt = z
  .union([z.uuid({ error: "Selecciona un campo válido" }), z.literal("")])
  .transform((value) => (value === "" ? null : value));

const localDateTime = z
  .string()
  .min(16, "Fecha y hora obligatorias")
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Fecha y hora inválidas");

export const gameCreateSchema = z
  .object({
    divisionId: uuid("la división"),
    homeTeamId: uuid("el equipo local"),
    awayTeamId: uuid("el equipo visitante"),
    scheduledAt: localDateTime,
    courtId: optionalCourt,
  })
  .refine((data) => data.homeTeamId !== data.awayTeamId, {
    message: "Un equipo no puede jugar contra sí mismo",
    path: ["awayTeamId"],
  });

export const gameUpdateSchema = z
  .object({
    gameId: z.uuid(),
    scheduledAt: localDateTime,
    courtId: optionalCourt,
    // Rivales: solo se envían al editar un partido aún programado.
    homeTeamId: z.uuid().optional(),
    awayTeamId: z.uuid().optional(),
  })
  .refine(
    (data) =>
      data.homeTeamId === undefined ||
      data.awayTeamId === undefined ||
      data.homeTeamId !== data.awayTeamId,
    { message: "Un equipo no puede jugar contra sí mismo", path: ["awayTeamId"] },
  );

export const assignmentSchema = z.object({
  gameId: z.uuid(),
  email: z.email({ error: "Correo inválido" }),
  role: z.enum(["scorekeeper", "referee"], { error: "Rol inválido" }),
});

/** formDataToObject entrega string con UN valor y array con varios: normaliza. */
const asArray = (value: unknown): unknown =>
  value === undefined || Array.isArray(value) ? value : [value];

export const scheduleConfigSchema = z.object({
  divisionId: uuid("la división"),
  startDate: dateStr("Fecha de inicio"),
  weekdays: z.preprocess(
    asArray,
    z.array(z.coerce.number().int().min(0).max(6)).min(1, "Elige al menos un día de juego"),
  ),
  times: z.preprocess(
    asArray,
    z
      .array(z.string().regex(/^\d{2}:\d{2}$/, "Horario inválido"))
      .min(1, "Elige al menos un horario"),
  ),
  courtIds: z.preprocess(
    asArray,
    z.array(z.uuid()).min(1, "Elige al menos una cancha"),
  ),
  minRestDays: z.coerce.number().int().min(0).max(30).default(4),
  doubleRound: z.coerce.boolean().default(false),
  // Índices de la vista previa elegidos por el admin; ausente = publicar todos.
  include: z.preprocess(asArray, z.array(z.coerce.number().int().min(0)).optional()),
});

/** Convierte FormData a objeto plano (múltiples valores → array). */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData
      .getAll(key)
      .filter((value): value is string => typeof value === "string");
    result[key] = values.length > 1 ? values : values[0];
  }
  return result;
}
