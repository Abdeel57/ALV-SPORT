import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Contenido editorial del sitio público (noticias y patrocinadores).
 * Solo existe en la base: sin proyecto configurado regresa vacío y las
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
  if (!hasSupabaseEnv()) return [];
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("sponsors")
    .select("id, name, logo_url, link_url")
    .eq("placement", placement)
    .eq("is_active", true)
    .order("sort_order");
  return ((data ?? []) as Array<{
    id: string;
    name: string;
    logo_url: string | null;
    link_url: string | null;
  }>).map((row) => ({
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url,
    linkUrl: row.link_url,
  }));
}

export async function getPublishedNews(limit = 3): Promise<PublicNews[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("news")
    .select("id, title, body, image_url, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Array<{
    id: string;
    title: string;
    body: string;
    image_url: string | null;
    published_at: string | null;
  }>).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    imageUrl: row.image_url,
    publishedAt: row.published_at,
  }));
}
