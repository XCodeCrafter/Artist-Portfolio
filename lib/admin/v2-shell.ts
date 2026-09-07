export const ADMIN_V2_SIDEBAR_STORAGE_KEY =
  "artist-admin-v2-sidebar-state";

export const ADMIN_V2_NAVIGATION = [
  {
    key: "overview",
    href: "/admin/v2",
    label: "Overview",
    description: "Start here",
    group: "Start",
  },
  {
    key: "navigation",
    href: "/admin/v2/navigation",
    label: "Navbar",
    description: "Order and visibility",
    group: "Portfolio",
  },
  {
    key: "bio",
    href: "/admin/v2/pages/bio",
    label: "Bio page",
    description: "Biography, resume and credits",
    group: "Portfolio",
  },
  {
    key: "gallery",
    href: "/admin/v2/pages/gallery",
    label: "Gallery page",
    description: "Hero, introduction and frames",
    group: "Portfolio",
  },
  {
    key: "showreel",
    href: "/admin/v2/pages/showreel",
    label: "Showreel page",
    description: "Hero, introduction and videos",
    group: "Portfolio",
  },
  {
    key: "music",
    href: "/admin/v2/pages/music",
    label: "Music page",
    description: "Visual section editor",
    group: "Portfolio",
  },
  {
    key: "contact",
    href: "/admin/v2/pages/contact",
    label: "Contact page",
    description: "Page and inquiry delivery",
    group: "Portfolio",
  },
  {
    key: "inbox",
    href: "/admin/v2/inbox",
    label: "Inbox",
    description: "Messages and follow-up",
    group: "Work",
  },
  {
    key: "insights",
    href: "/admin/v2/insights",
    label: "Insights",
    description: "Traffic and engagement",
    group: "Work",
  },
  {
    key: "settings",
    href: "/admin/v2/settings",
    label: "Settings",
    description: "Brand, access and health",
    group: "Settings",
  },
] as const;

export type AdminV2NavigationKey =
  (typeof ADMIN_V2_NAVIGATION)[number]["key"];

export function getAdminV2ActiveItem(pathname: string) {
  const normalized =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname || "/";

  if (
    normalized === "/admin/v2/security" ||
    normalized.startsWith("/admin/v2/security/")
  ) {
    return ADMIN_V2_NAVIGATION.find((item) => item.key === "settings")!;
  }

  return (
    [...ADMIN_V2_NAVIGATION]
      .sort((left, right) => right.href.length - left.href.length)
      .find((item) =>
        item.href === "/admin/v2"
          ? normalized === item.href
          : normalized === item.href || normalized.startsWith(`${item.href}/`)
      ) ?? ADMIN_V2_NAVIGATION[0]
  );
}

export function parseAdminV2SidebarState(value: string | null | undefined) {
  return value === "collapsed";
}

export function serializeAdminV2SidebarState(collapsed: boolean) {
  return collapsed ? "collapsed" : "expanded";
}
