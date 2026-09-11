import { getDb } from "@/lib/db/request";
import { hasDatabaseEnv } from "@/lib/db/pool";
import { sql } from "@/lib/db/sql";

/**
 * Contenido editorial del sitio público (noticias y patrocinadores).
 * Solo existe en la base: sin base configurada regresa vacío y las
 * secciones simplemente no se renderizan.
 */

export interface PublicSponsor {
  id: string;
  name: string;
  logoUrl: string | null;
  linkUrl: string | null;
}

export interface PublicNews {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  publishedAt: string | null;
}

export async function getSponsors(
  placement: "home" | "game" | "footer",
): Promise<PublicSponsor[]> {
  if (!hasDatabaseEnv()) return [];
  const db = await getDb();
  const rows = await db.rows<{
    id: string;
    name: string;
    logo_url: string | null;
    link_url: string | null;
  }>(sql`
    select id, name, logo_url, link_url
      from public.sponsors
     where placement = ${placement} and is_active
     order by sort_order
  `);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url,
    linkUrl: row.link_url,
  }));
}

export async function getPublishedNews(limit = 3): Promise<PublicNews[]> {
  if (!hasDatabaseEnv()) return [];
  const db = await getDb();
  const rows = await db.rows<{
    id: string;
    title: string;
    body: string;
    image_url: string | null;
    published_at: string | null;
  }>(sql`
    select id, title, body, image_url, published_at
      from public.news
     where status = 'published'
     order by published_at desc
     limit ${limit}
  `);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    imageUrl: row.image_url,
    publishedAt: row.published_at,
  }));
}
