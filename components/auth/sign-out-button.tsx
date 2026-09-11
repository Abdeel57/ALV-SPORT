import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";

/**
 * Cierre de sesión. Antes no existía: la sesión de GoTrue solo caducaba
 * sola. Ahora la cookie se borra en el servidor con una Server Action.
 */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className={
          className ??
          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        }
      >
        <LogOut className="size-3.5 shrink-0" aria-hidden />
        Cerrar sesión
      </button>
    </form>
  );
}
