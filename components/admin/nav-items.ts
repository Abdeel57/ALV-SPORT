import {
  Ban,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  type LucideIcon,
  LayoutDashboard,
  MapPin,
  Medal,
  Megaphone,
  MoreHorizontal,
  Newspaper,
  ScrollText,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";

/** Destinos del panel: los nombres son cortos y coinciden con cada título. */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const primaryNav: readonly NavItem[] = [
  { href: "/admin", label: "Panel", icon: LayoutDashboard },
  { href: "/admin/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/admin/equipos", label: "Equipos", icon: Users },
  { href: "/admin/mas", label: "Más", icon: MoreHorizontal },
];

export const navGroups: readonly { label: string; items: readonly NavItem[] }[] = [
  {
    label: "General",
    items: [
      { href: "/admin", label: "Panel", icon: LayoutDashboard },
      { href: "/admin/calendario", label: "Calendario", icon: CalendarDays },
    ],
  },
  {
    label: "Competencia",
    items: [
      { href: "/admin/ligas", label: "Ligas", icon: Medal },
      { href: "/admin/temporadas", label: "Temporadas", icon: Trophy },
      { href: "/admin/equipos", label: "Equipos", icon: Users },
      { href: "/admin/jugadores", label: "Jugadores", icon: UserRound },
      { href: "/admin/sedes", label: "Sedes", icon: MapPin },
    ],
  },
  {
    label: "Inscripciones",
    items: [
      { href: "/admin/solicitudes", label: "Solicitudes", icon: ClipboardCheck },
      { href: "/admin/inscripciones", label: "Inscripciones", icon: CreditCard },
      { href: "/admin/sanciones", label: "Sanciones", icon: Ban },
    ],
  },
  {
    label: "Contenido",
    items: [
      { href: "/admin/noticias", label: "Noticias", icon: Newspaper },
      { href: "/admin/patrocinadores", label: "Patrocinadores", icon: Megaphone },
    ],
  },
  {
    label: "Sistema",
    items: [{ href: "/admin/auditoria", label: "Auditoría", icon: ScrollText }],
  },
];
