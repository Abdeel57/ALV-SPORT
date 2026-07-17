// Ejecuta SQL arbitrario contra DATABASE_URL (ops de Supabase autoalojado).
//   DATABASE_URL=... node scripts/run-sql.cjs "select 1"
const { Client } = require("pg");

async function main() {
  const sql = process.argv[2];
  if (!sql) throw new Error("Uso: node scripts/run-sql.cjs \"<sql>\"");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
  });
  await client.connect();
  try {
    const result = await client.query(sql);
    const rows = Array.isArray(result) ? result.at(-1)?.rows : result.rows;
    console.log(JSON.stringify(rows ?? [], null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
