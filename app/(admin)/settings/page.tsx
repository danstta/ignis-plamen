import { ThemeToggle } from "@/components/theme-toggle";

export default function SettingsAppearancePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Appearance</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Switch between light, dark, or your system theme.
      </p>

      <div className="mt-6 space-y-4">
        <section className="rounded-lg border p-5">
          <h2 className="text-sm font-medium">Theme</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose how the admin looks on this device.
          </p>
          <div className="mt-3 max-w-xs">
            <ThemeToggle />
          </div>
        </section>
      </div>
    </div>
  );
}
