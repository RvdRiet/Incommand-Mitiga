import Link from "next/link";

import { auth } from "@/auth";
import { UsersAdmin } from "@/components/auth/UsersAdmin";
import { AuthConsole } from "@/components/auth/ui";
import { BackLink } from "@/components/ui/BackLink";

export const metadata = { title: "User management · InCommand" };

export default async function AdminUsersPage() {
  const session = await auth();

  if (!session?.userId) {
    return (
      <AuthConsole>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 16px" }}>
          <h1>User management</h1>
          <p style={{ color: "var(--muted)" }}>
            Please <Link href="/login">sign in</Link> to manage users.
          </p>
        </main>
      </AuthConsole>
    );
  }

  if (!session.canManageUsers) {
    return (
      <AuthConsole>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 16px" }}>
          <BackLink href="/">Events</BackLink>
          <h1 style={{ marginTop: 16 }}>User management</h1>
          <p style={{ color: "var(--muted)" }}>
            You need the <strong>org admin</strong> role or higher to manage users. Ask a district
            administrator for access.
          </p>
        </main>
      </AuthConsole>
    );
  }

  return (
    <AuthConsole>
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 16px" }}>
      <div className="ic-admin-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
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
      <UsersAdmin myRank={session.roleRank} myId={session.userId} />
    </main>
    </AuthConsole>
  );
}
