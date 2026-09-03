import NavigationManager from "@/components/admin/v2/NavigationManager";
import NavbarSocialLinksManager from "@/components/admin/v2/NavbarSocialLinksManager";
import { NavbarUnsavedChangesProvider } from "@/components/admin/v2/NavbarUnsavedChangesProvider";
import { getAdminNavigationData } from "@/lib/admin/navigation";
import { getAdminNavbarSocialLinksData } from "@/lib/admin/navbar-social-links";
import { createNavigationEditorModel } from "@/lib/admin/navigation-editor";

export const metadata = { title: "Navbar · Admin V2" };
export const dynamic = "force-dynamic";

export default async function AdminV2NavigationPage() {
  const [data, socialLinks] = await Promise.all([
    getAdminNavigationData(),
    getAdminNavbarSocialLinksData(),
  ]);
  const model = createNavigationEditorModel(data.navigation);
  const unsupportedVersion = data.configVersion === "unsupported";
  const configVersion = data.configVersion === 0 ? 0 : 1;
  const blockingIssues =
    data.isConfigured &&
    !data.migrationRequired &&
    !data.loadError &&
    !unsupportedVersion
      ? model.blockingIssues
      : [];

  return (
    <div className="grid gap-4">
      <header className="rounded-[26px] border border-white/9 bg-[#0d0d0f]/88 p-5 shadow-[0_22px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl sm:p-6 lg:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/34">
            Admin V2
          </span>
          <span className="h-1 w-1 rounded-full bg-[#ff3b1f]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/55">
            Navbar
          </span>
        </div>
        <h1 className="heading-ui mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
          Public navigation
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/46">
          Choose and order the six main portfolio pages shown in the header.
          In-page sections stay reachable inside their pages without crowding
          the navbar. Platform shortcuts are managed separately below.
        </p>
      </header>

      <NavbarUnsavedChangesProvider>
        <NavigationManager
          artistName={data.artistName}
          availability={data.availability}
          blockingIssues={blockingIssues}
          configVersion={configVersion}
          disabled={!data.isConfigured}
          expectedVersions={model.expectedVersions}
          initialItems={model.items}
          loadError={data.loadError}
          migrationRequired={data.migrationRequired}
          unsupportedVersion={unsupportedVersion}
        />

        <NavbarSocialLinksManager
          disabled={!socialLinks.isConfigured}
          loadError={socialLinks.loadError}
          migrationRequired={socialLinks.migrationRequired}
          snapshot={socialLinks.snapshot}
        />
      </NavbarUnsavedChangesProvider>
    </div>
  );
}
