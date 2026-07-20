// Alta de un usuario del panel (ops de Supabase autoalojado):
// crea la cuenta vía la API admin de GoTrue (email confirmado) y le asigna
// rol en organization_members — el paso 5 del runbook del README, sin Studio.
//
//   SUPABASE_URL=... SERVICE_ROLE_KEY=... \
//   node scripts/create-user.cjs <email> <password> [rol] [organization_id]
//
// Rol por defecto: org_admin. Org por defecto: la única organización.
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SERVICE_ROLE_KEY ?? "";

async function main() {
  const [email, password, role = "org_admin", orgArg] = process.argv.slice(2);
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error("Faltan SUPABASE_URL / SERVICE_ROLE_KEY en el entorno");
  }
  if (!email || !password) {
    throw new Error(
      "Uso: node scripts/create-user.cjs <email> <password> [rol] [org_id]",
    );
  }
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };

  let organizationId = orgArg;
  if (!organizationId) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/organizations?select=id,name`,
      { headers },
    );
    const orgs = await response.json();
    if (!Array.isArray(orgs) || orgs.length !== 1) {
      throw new Error(
        `Se esperaba exactamente 1 organización; pasa org_id explícito. Hay: ${JSON.stringify(orgs)}`,
      );
    }
    organizationId = orgs[0].id;
    console.log(`organización: ${orgs[0].name} (${organizationId})`);
  }

  const createResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await createResponse.json();
  if (!createResponse.ok) {
    throw new Error(
      `crear usuario: ${createResponse.status} ${JSON.stringify(user)}`,
    );
  }
  console.log(`usuario creado: ${user.email} (${user.id})`);

  const memberResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/organization_members`,
    {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: organizationId,
        user_id: user.id,
        role,
      }),
    },
  );
  const member = await memberResponse.json();
  if (!memberResponse.ok) {
    throw new Error(
      `asignar rol: ${memberResponse.status} ${JSON.stringify(member)}`,
    );
  }
  console.log(`rol asignado: ${role} en ${organizationId}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
