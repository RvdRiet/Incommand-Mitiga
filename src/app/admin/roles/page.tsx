import Link from "next/link";

import { auth } from "@/auth";
import { RoleManager } from "@/components/auth/RoleManager";
import { AuthConsole } from "@/components/auth/ui";
import { BackLink } from "@/components/ui/BackLink";

export const metadata = { title: "Roles & access · InCommand" };

export default async function AdminRolesPage() {
  const session = await auth();

  if (!session?.userId) {
    return (
      <AuthConsole>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 16px" }}>
          <h1>Roles &amp; access</h1>
          <p style={{ color: "var(--muted)" }}>
            Please <Link href="/login">sign in</Link> to manage access.
          </p>
        </main>
      </AuthConsole>
    );
  }

  if (!session.canManageRoles) {
    return (
      <AuthConsole>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 16px" }}>
          <BackLink href="/">Events</BackLink>
          <h1 style={{ marginTop: 16 }}>Roles &amp; access</h1>
          <p style={{ color: "var(--muted)" }}>
            You need a role with the <strong>manage roles</strong> permission to change access.
          </p>
        </main>
      </AuthConsole>
    );
  }

  return (
    <AuthConsole>
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "3rem 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ marginBottom: 4 }}>Roles &amp; access</h1>
        <nav style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 14 }}>
          <Link href="/admin/users" style={{ color: "var(--muted)" }}>
            Users
          </Link>
          <BackLink href="/">Events</BackLink>
        </nav>
      </div>
      <p style={{ color: "var(--muted)", marginTop: 0, maxWidth: 680 }}>
        Create roles for your district, set what each one can do and see, and delete the ones
        you no longer need. You can only change roles below your own; a role with everything
        ticked is unrestricted, and everyone always keeps the Overview dashboard.
      </p>
      <RoleManager />
    </main>
    </AuthConsole>
  );
}
