import Link from "next/link";

import { auth } from "@/auth";
import { SetupWizard } from "@/components/setup/SetupWizard";

export const metadata = { title: "Set up InCommand" };

export default async function SetupPage() {
  const session = await auth();

  if (!session?.userId) {
    return (
      <main style={{ maxWidth: 720, margin: "3rem auto", padding: "0 16px" }}>
        <h1>Set up InCommand</h1>
        <p style={{ color: "var(--muted)" }}>
          Please <Link href="/login">sign in</Link> to set up your organisation.
        </p>
      </main>
    );
  }

  return <SetupWizard canManageRoles={session.canManageRoles} />;
}
