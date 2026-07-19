import { logoutAdmin } from "@/app/admin/actions";
import ActionButton from "@/components/admin/ActionButton";

export default function LogoutButton() {
  return (
    <form action={logoutAdmin}>
      <ActionButton
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.07] px-4 text-sm font-semibold text-white/72 transition duration-300 hover:border-white/22 hover:bg-white/[0.12] hover:text-white"
        pendingLabel="Signing out..."
      >
        Sign out
      </ActionButton>
    </form>
  );
}
