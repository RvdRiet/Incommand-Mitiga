import Link from "next/link";

import { auth } from "@/auth";
import { UsersAdmin } from "@/components/auth/UsersAdmin";
import { BackLink } from "@/components/ui/BackLink";
import { canManageUsers } from "@/lib/auth/roles";

export const metadata = { title: "User management · InCommand" };

export default async function AdminUsersPage() {
  const session = await auth();

  if (!session?.userId) {
    return (
      <main style={{ maxWidth: 720, margin: "3rem auto", padding: "0 16px" }}>
        <h1>User management</h1>
        <p style={{ color: "var(--muted)" }}>
          Please <Link href="/login">sign in</Link> to manage users.
        </p>
      </main>
    );
  }

  if (!canManageUsers(session.role)) {
    return (
      <main style={{ maxWidth: 720, margin: "3rem auto", padding: "0 16px" }}>
        <BackLink href="/">Events</BackLink>
        <h1 style={{ marginTop: 16 }}>User management</h1>
        <p style={{ color: "var(--muted)" }}>
          You need the <strong>org admin</strong> role or higher to manage users. Ask a district
          administrator for access.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "3rem auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ marginBottom: 4 }}>User management</h1>
        <nav style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 14 }}>
          <Link href="/admin/roles" style={{ color: "var(--muted)" }}>
            Roles &amp; access
          </Link>
          <BackLink href="/">Events</BackLink>
        </nav>
      </div>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Invite people to your district, set their roles, and disable or sign out accounts.
      </p>
      <UsersAdmin myRole={session.role} myId={session.userId} />
    </main>
  );
}
