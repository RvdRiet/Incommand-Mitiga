import Link from "next/link";

import { auth } from "@/auth";
import { MfaSettings } from "@/components/auth/MfaSettings";
import { BackLink } from "@/components/ui/BackLink";

export const metadata = { title: "Security · InCommand" };

export default async function SecurityPage() {
  const session = await auth();

  if (!session?.userId) {
    return (
      <main style={{ maxWidth: 640, margin: "3rem auto", padding: "0 16px" }}>
        <h1>Security</h1>
        <p style={{ color: "var(--muted)" }}>
          Please <Link href="/login">sign in</Link> to manage your security settings.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 640, margin: "3rem auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ marginBottom: 4 }}>Security</h1>
        <BackLink href="/">Events</BackLink>
      </div>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>Signed in as {session.user?.email}.</p>

      <h2 style={{ marginTop: 24 }}>Two-factor authentication</h2>
      <MfaSettings />
    </main>
  );
}
