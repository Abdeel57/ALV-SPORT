import { cache } from "react";
import { getDb } from "@/lib/db/request";
import { hasDatabaseEnv } from "@/lib/db/pool";
import { sql } from "@/lib/db/sql";

/**
 * Contenido editorial del sitio público (noticias y patrocinadores).
 * Solo existe en la base: sin base configurada regresa vacío y las
 * secciones simplemente no se renderizan.
 */

/** Nivel de patrocinio; la exposición es acumulativa (ver migración sponsor_tiers). */
export type SponsorTier = "main" | "official" | "ally";

export interface PublicSponsor {
  id: string;
  name: string;
  logoUrl: string | null;
  linkUrl: string | null;
  tier: SponsorTier;
}

export interface PublicNews {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  publishedAt: string | null;
}

/**
 * Patrocinadores activos ordenados por nivel y orden manual. Se memoriza por
 * petición (React cache): layout y página lo piden y solo hay una consulta.
 */
export const getSponsors = cache(async (): Promise<PublicSponsor[]> => {
  if (!hasDatabaseEnv()) return [];
  const db = await getDb();
  const rows = await db.rows<{
    id: string;
    name: string;
    logo_url: string | null;
    link_url: string | null;
    tier: SponsorTier;
  }>(sql`
    select id, name, logo_url, link_url, tier::text as tier
      from public.sponsors
     where is_active
     order by tier, sort_order, created_at
  `);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url,
    linkUrl: row.link_url,
    tier: row.tier,
  }));
});

/**
 * Patrocinador principal para el lugar "Presenta" de la marquesina. Si hay
 * varios principales se turnan el lugar cada cinco minutos.
 */
export function pickPresenter(sponsors: PublicSponsor[]): PublicSponsor | null {
  const mains = sponsors.filter((sponsor) => sponsor.tier === "main");
  if (mains.length === 0) return null;
  return mains[Math.floor(Date.now() / 300_000) % mains.length] ?? null;
}

/** Principales y oficiales: los que rotan en la barra deslizante. */
export function tickerSponsors(sponsors: PublicSponsor[]): PublicSponsor[] {
  return sponsors.filter((sponsor) => sponsor.tier !== "ally");
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
