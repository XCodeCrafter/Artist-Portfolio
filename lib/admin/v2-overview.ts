import "server-only";

import { requireAdmin } from "@/lib/admin/auth";
import { getAdminBioEditorData } from "@/lib/admin/bio";
import { getAdminContactEditorData } from "@/lib/admin/contact";
import { getAdminGalleryEditorData } from "@/lib/admin/gallery";
import { getAdminHomeEditorData } from "@/lib/admin/home";
import { getAdminNewInquiryCount } from "@/lib/admin/inquiries";
import { getAdminMusicEditorData } from "@/lib/admin/music";
import { getMediaLibraryV2Data } from "@/lib/admin/media-library";
import { getAdminNavigationData } from "@/lib/admin/navigation";
import {
  createNavigationEditorModel,
  toPreviewNavigationItems,
} from "@/lib/admin/navigation-editor";
import { getAdminShowreelEditorData } from "@/lib/admin/showreel";
import { getAdminAppearanceData } from "@/lib/admin/site-appearance";
import { getVisiblePublicPageNavigationItems } from "@/lib/content/navigation";
import { getProductionReadiness } from "@/lib/admin/readiness";

export type AdminV2PageEditorState =
  | "ready"
  | "setup-required"
  | "unavailable"
  | "classic";

export type AdminV2NavbarState = "shown" | "hidden" | "unknown";

export type AdminV2PageSummary = {
  key: "home" | "bio" | "gallery" | "showreel" | "music" | "contact";
  label: string;
  description: string;
  editorHref: string;
  publicHref: string;
  editorState: AdminV2PageEditorState;
  navbarState: AdminV2NavbarState;
};

export type AdminV2OverviewIssue = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: "error" | "warning" | "setup";
};

export type AdminV2OverviewData = {
  issues: AdminV2OverviewIssue[];
  navigation: {
    selectedCount: number | null;
    visibleCount: number | null;
    pageCount: number;
  };
  newInquiryCount: number | null;
  pages: AdminV2PageSummary[];
};

type EditorReadiness = {
  isConfigured: boolean;
  migrationRequired: boolean;
  loadError?: string;
};

type EditorDefinition = {
  key: AdminV2PageSummary["key"];
  label: string;
  description: string;
  editorHref: string;
  publicHref: string;
  migrationLabel: string;
  readiness: EditorReadiness;
  navigationKey: string;
};

function getEditorState(readiness: EditorReadiness): AdminV2PageEditorState {
  if (!readiness.isConfigured || readiness.loadError) return "unavailable";
  if (readiness.migrationRequired) return "setup-required";
  return "ready";
}

function createEditorIssue(
  editor: EditorDefinition
): AdminV2OverviewIssue | null {
  if (editor.readiness.loadError) {
    return {
      id: `${editor.key}-unavailable`,
      title: `${editor.label} editor is unavailable`,
      detail: editor.readiness.loadError,
      href: editor.editorHref,
      tone: "error",
    };
  }

  if (editor.readiness.migrationRequired) {
    return {
      id: `${editor.key}-migration`,
      title: `${editor.label} editor needs setup`,
      detail: `${editor.migrationLabel} must be applied before this editor can publish changes.`,
      href: editor.editorHref,
      tone: "warning",
    };
  }

  return null;
}

function sortIssues(issues: AdminV2OverviewIssue[]) {
  const rank: Record<AdminV2OverviewIssue["tone"], number> = {
    error: 0,
    warning: 1,
    setup: 2,
  };
  return issues.sort((left, right) => rank[left.tone] - rank[right.tone]);
}

/**
 * Builds the task-first dashboard model and returns only presentation-safe
 * states. Full editor snapshots never cross into the client-side finder.
 */
export async function getAdminV2OverviewData(): Promise<AdminV2OverviewData> {
  await requireAdmin();

  const [navigation, home, bio, gallery, showreel, music, contact, inbox, appearance, media, readiness] =
    await Promise.all([
      getAdminNavigationData(),
      getAdminHomeEditorData(),
      getAdminBioEditorData(),
      getAdminGalleryEditorData(),
      getAdminShowreelEditorData(),
      getAdminMusicEditorData(),
      getAdminContactEditorData(),
      getAdminNewInquiryCount(),
      getAdminAppearanceData(),
      getMediaLibraryV2Data(),
      // Page/workspace loaders above already verify their snapshots. Do not
      // repeat that full fan-out just to show deployment warnings on Overview.
      getProductionReadiness({ includeSchema: false }).catch(() => null),
    ]);

  const navigationModel = createNavigationEditorModel(navigation.navigation);
  const pageItems = navigationModel.items.filter(
    (item) => item.itemType === "known" && item.kind === "page"
  );
  const navigationUnavailable =
    !navigation.isConfigured || Boolean(navigation.loadError);
  const navigationStateReliable =
    !navigationUnavailable &&
    navigation.configVersion !== "unsupported" &&
    navigationModel.blockingIssues.length === 0;
  const selectedCount = navigationStateReliable
    ? pageItems.filter((item) => item.isVisible).length
    : null;
  const visibleCount = navigationStateReliable
    ? getVisiblePublicPageNavigationItems(
        toPreviewNavigationItems(navigationModel.items),
        navigation.availability
      ).length
    : null;
  const navbarStateFor = (key: string): AdminV2NavbarState => {
    if (!navigationStateReliable) return "unknown";
    const item = pageItems.find((candidate) => candidate.key === key);
    if (!item) return "unknown";
    return item.isVisible ? "shown" : "hidden";
  };

  const editors: EditorDefinition[] = [
    {
      key: "home",
      label: "Home",
      description: "Section order, visibility, text, and images.",
      editorHref: "/admin/v2/pages/home",
      publicHref: "/",
      migrationLabel: "The Home V2 database migration (0037)",
      readiness: home,
      navigationKey: "home",
    },
    {
      key: "bio",
      label: "Bio",
      description: "Biography, portraits, resume, and acting credits.",
      editorHref: "/admin/v2/pages/bio",
      publicHref: "/bio",
      migrationLabel: "The Bio V2 database migration",
      readiness: bio,
      navigationKey: "bio",
    },
    {
      key: "gallery",
      label: "Gallery",
      description: "Opening, introduction, image order, and visibility.",
      editorHref: "/admin/v2/pages/gallery",
      publicHref: "/gallery",
      migrationLabel: "The Gallery V2 database migration",
      readiness: gallery,
      navigationKey: "gallery",
    },
    {
      key: "showreel",
      label: "Showreel",
      description: "Showreels, scenes, clips, and music videos.",
      editorHref: "/admin/v2/pages/showreel",
      publicHref: "/video",
      migrationLabel: "The Showreel V2 database migration",
      readiness: showreel,
      navigationKey: "works",
    },
    {
      key: "music",
      label: "Music",
      description: "Hero, platform cards, Spotify, and SoundCloud.",
      editorHref: "/admin/v2/pages/music",
      publicHref: "/music",
      migrationLabel: "The Music V2 database migration",
      readiness: music,
      navigationKey: "music",
    },
    {
      key: "contact",
      label: "Contact",
      description: "Booking form, contact details, and delivery context.",
      editorHref: "/admin/v2/pages/contact",
      publicHref: "/booking",
      migrationLabel: "The Contact V2 database migration",
      readiness: contact,
      navigationKey: "contact",
    },
  ];

  const serviceUnavailable = [navigation, appearance, media, ...editors.map((item) => item.readiness)]
    .some((item) => !item.isConfigured);
  const issues: AdminV2OverviewIssue[] = [];

  if (serviceUnavailable) {
    issues.push({
      id: "admin-data-unavailable",
      title: "Admin data connection needs setup",
      detail:
        "One or more editors cannot reach the server-only Supabase connection. Review technical health before editing.",
      href: "/admin/v2/security#configuration",
      tone: "error",
    });
  } else {
    if (navigation.loadError) {
      issues.push({
        id: "navbar-unavailable",
        title: "Navbar editor is unavailable",
        detail: navigation.loadError,
        href: "/admin/v2/navigation",
        tone: "error",
      });
    } else if (navigation.migrationRequired) {
      issues.push({
        id: "navbar-migration",
        title: "Navbar editor needs setup",
        detail:
          "The Navbar V2 database migration must be applied before saving changes.",
        href: "/admin/v2/navigation",
        tone: "warning",
      });
    } else if (
      navigation.configVersion === "unsupported" ||
      navigationModel.blockingIssues.length > 0
    ) {
      issues.push({
        id: "navbar-review",
        title: "Navbar configuration needs review",
        detail:
          navigationModel.blockingIssues[0] ||
          "The saved navbar format is not supported by this dashboard version.",
        href: "/admin/v2/navigation",
        tone: "warning",
      });
    }

    for (const editor of editors) {
      const issue = createEditorIssue(editor);
      if (issue) issues.push(issue);
    }

    if (!inbox.isConfigured || inbox.loadError) {
      issues.push({
        id: "inbox-count-unavailable",
        title: "Inbox status could not be checked",
        detail:
          inbox.loadError ||
          "Inbox storage is not configured in this runtime. Open Inbox for details.",
        href: "/admin/v2/inbox#messages",
        tone: "warning",
      });
    }
  }

  // These are separate workspaces, not public pages. Their migration health
  // still belongs in the setup queue; a ready Bio editor says nothing about
  // whether the new footer or safe Media removal can be saved.
  if (appearance.isConfigured) {
    if (appearance.loadError || appearance.migrationRequired) {
      issues.push({
        id: "appearance-unavailable", title: "Appearance settings need attention",
        detail: appearance.loadError || "The saved typography and profile settings need their database setup checked.",
        href: "/admin/v2/settings/appearance", tone: "error",
      });
    } else if (appearance.footerMigrationRequired) {
      issues.push({
        id: "footer-migration", title: "Footer content needs setup",
        detail: "Apply and verify migration 0039 before editing footer content. Fonts and profile text remain available.",
        href: "/admin/v2/settings/appearance", tone: "warning",
      });
    }
  }
  if (media.isConfigured) {
    if (media.loadError) {
      issues.push({
        id: "media-unavailable", title: "Media library is unavailable", detail: media.loadError,
        href: "/admin/v2/media", tone: "error",
      });
    } else if (media.usageError) {
      issues.push({
        id: "media-usage-unavailable", title: "Media usage and removal need attention", detail: media.usageError,
        href: "/admin/v2/media", tone: "warning",
      });
    }
  }

  if (
    contact.isConfigured &&
    !contact.loadError &&
    (!contact.delivery.emailConfigured || !contact.delivery.webhookConfigured)
  ) {
    const missing = [
      !contact.delivery.emailConfigured ? "email notifications" : null,
      !contact.delivery.webhookConfigured ? "delivery monitoring" : null,
    ].filter(Boolean);
    issues.push({
      id: "contact-delivery-setup",
      title: "Finish Contact delivery setup",
      detail: `Inbox storage still works. Configure ${missing.join(
        " and "
      )} when you are ready to receive message alerts.`,
      href: "/admin/v2/pages/contact",
      tone: "setup",
    });
  }

  if (!readiness) {
    issues.push({
      id: "readiness-unavailable",
      title: "Production checks could not be verified",
      detail: "Editing may still work. Open Security → Advanced and retry the read-only checks before launch.",
      href: "/admin/v2/security#configuration",
      tone: "warning",
    });
  } else {
    for (const check of readiness.checks) {
      if (!check.critical || check.status === "pass") continue;
      // Keep one actionable card for the same problem instead of duplicating
      // Contact setup and the server-connection warning already shown above.
      if (check.id === "email" && issues.some((issue) => issue.id === "contact-delivery-setup")) continue;
      if (serviceUnavailable && (check.id === "service-key" || check.status === "unknown")) continue;
      issues.push({
        id: `production-${check.id}`,
        title: `${check.label}: ${check.status === "unknown" ? "not verified" : "needs attention"}`,
        detail: check.detail,
        href: "/admin/v2/security#configuration",
        tone: check.status === "unknown" ? "warning" : "error",
      });
    }
  }

  const pages: AdminV2PageSummary[] = editors.map(
    (editor): AdminV2PageSummary => ({
      key: editor.key,
      label: editor.label,
      description: editor.description,
      editorHref: editor.editorHref,
      publicHref: editor.publicHref,
      editorState: getEditorState(editor.readiness),
      navbarState: navbarStateFor(editor.navigationKey),
    })
  );

  return {
    issues: sortIssues(issues),
    navigation: {
      selectedCount,
      visibleCount,
      pageCount: pageItems.length,
    },
    newInquiryCount: inbox.count,
    pages,
  };
}
