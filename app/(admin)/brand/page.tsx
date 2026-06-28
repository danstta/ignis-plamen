import Link from "next/link";
import { Plus } from "lucide-react";
import { listBrands } from "@/lib/brand/service";
import { createBrandAction } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function BrandPage() {
  let rows: Awaited<ReturnType<typeof listBrands>> = [];
  let dbError: string | null = null;
  try {
    rows = await listBrands();
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Brand identity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define brand colors (and fonts/logo) that show up while designing templates.
          </p>
        </div>
        <form action={createBrandAction}>
          <Button type="submit">
            <Plus className="size-4" /> New brand
          </Button>
        </form>
      </div>

      {dbError ? (
        <div className="mt-6 rounded-lg border border-dashed p-6 text-sm">
          <p className="font-medium">Database not reachable</p>
          <p className="mt-1 text-muted-foreground">
            Set <code>DATABASE_URL</code> in <code>.env.local</code> and run{" "}
            <code>bun run db:migrate</code>.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">No brands yet.</p>
          <form action={createBrandAction} className="mt-3">
            <Button type="submit">
              <Plus className="size-4" /> Create your first brand
            </Button>
          </form>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((b) => (
            <Link key={b.id} href={`/brand/${b.id}`}>
              <Card className="h-full transition-colors hover:border-foreground/20">
                <CardHeader>
                  <CardTitle>{b.name}</CardTitle>
                  <CardDescription>
                    {b.colors.length} color{b.colors.length === 1 ? "" : "s"}
                  </CardDescription>
                </CardHeader>
                {b.colors.length > 0 ? (
                  <div className="flex flex-wrap gap-1 px-6 pb-6">
                    {b.colors.slice(0, 10).map((c) => (
                      <span
                        key={c.id}
                        className="size-5 rounded-full border"
                        style={{ backgroundColor: c.value }}
                        title={c.name || c.value}
                      />
                    ))}
                  </div>
                ) : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
