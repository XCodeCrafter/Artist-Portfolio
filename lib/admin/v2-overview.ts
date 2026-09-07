import "server-only";

import { requireAdmin } from "@/lib/admin/auth";
import { getAdminBioEditorData } from "@/lib/admin/bio";
import { getAdminContactEditorData } from "@/lib/admin/contact";
import { getAdminGalleryEditorData } from "@/lib/admin/gallery";
import { getAdminNewInquiryCount } from "@/lib/admin/inquiries";
import { getAdminMusicEditorData } from "@/lib/admin/music";
import { getAdminNavigationData } from "@/lib/admin/navigation";
import {
  createNavigationEditorModel,
  toPreviewNavigationItems,
} from "@/lib/admin/navigation-editor";
import { getAdminShowreelEditorData } from "@/lib/admin/showreel";
import { getVisiblePublicPageNavigationItems } from "@/lib/content/navigation";

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
  key: Exclude<AdminV2PageSummary["key"], "home">;
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

  const [navigation, bio, gallery, showreel, music, contact, inbox] =
    await Promise.all([
      getAdminNavigationData(),
      getAdminBioEditorData(),
      getAdminGalleryEditorData(),
      getAdminShowreelEditorData(),
      getAdminMusicEditorData(),
      getAdminContactEditorData(),
      getAdminNewInquiryCount(),
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

  const serviceUnavailable = [navigation, ...editors.map((item) => item.readiness)]
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

  const pages: AdminV2PageSummary[] = [
    {
      key: "home",
      label: "Home",
      description: "Homepage hero and all landing-page sections.",
      editorHref: "/admin/content#home",
      publicHref: "/",
      editorState: "classic",
      navbarState: navbarStateFor("home"),
    },
    ...editors.map(
      (editor): AdminV2PageSummary => ({
        key: editor.key,
        label: editor.label,
        description: editor.description,
        editorHref: editor.editorHref,
        publicHref: editor.publicHref,
        editorState: getEditorState(editor.readiness),
        navbarState: navbarStateFor(editor.navigationKey),
      })
    ),
  ];

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
