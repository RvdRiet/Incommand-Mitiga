import Link from "next/link";

import { auth } from "@/auth";
import { RolePermissionsAdmin } from "@/components/auth/RolePermissionsAdmin";
import { BackLink } from "@/components/ui/BackLink";
import { canManageUsers } from "@/lib/auth/roles";

export const metadata = { title: "Roles & access · InCommand" };

export default async function AdminRolesPage() {
  const session = await auth();

  if (!session?.userId) {
    return (
      <main style={{ maxWidth: 720, margin: "3rem auto", padding: "0 16px" }}>
        <h1>Roles &amp; access</h1>
        <p style={{ color: "var(--muted)" }}>
          Please <Link href="/login">sign in</Link> to manage access.
        </p>
      </main>
    );
  }

  if (!canManageUsers(session.role)) {
    return (
      <main style={{ maxWidth: 720, margin: "3rem auto", padding: "0 16px" }}>
        <BackLink href="/">Events</BackLink>
        <h1 style={{ marginTop: 16 }}>Roles &amp; access</h1>
        <p style={{ color: "var(--muted)" }}>
          You need the <strong>org admin</strong> role or higher to manage access.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 980, margin: "3rem auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ marginBottom: 4 }}>Roles &amp; access</h1>
        <nav style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 14 }}>
          <Link href="/admin/users" style={{ color: "var(--muted)" }}>
            Users
          </Link>
          <BackLink href="/">Events</BackLink>
        </nav>
      </div>
      <p style={{ color: "var(--muted)", marginTop: 0, maxWidth: 640 }}>
        Choose which parts of the platform each role can see in your district. You can only
        change roles below your own, and a role with everything ticked is unrestricted.
        Everyone always keeps the Overview dashboard.
      </p>
      <RolePermissionsAdmin />
    </main>
  );
}
