import { LogOut } from "lucide-react";

import { logoutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export default function SettingsAccountPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your admin session on this device.
      </p>

      <div className="mt-6 space-y-4">
        <section className="rounded-lg border p-5">
          <h2 className="text-sm font-medium">Session</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign out of the admin session on this device.
          </p>
          <form action={logoutAction} className="mt-3">
            <Button type="submit" variant="outline">
              <LogOut className="size-4" /> Sign out
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
