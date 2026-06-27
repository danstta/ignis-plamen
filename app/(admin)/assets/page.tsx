import { listAssets } from "@/lib/assets/service";
import { AssetsManager } from "@/components/assets/assets-manager";
import type { Asset } from "@/lib/assets/types";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  let assets: Asset[] = [];
  let dbError: string | null = null;
  try {
    assets = await listAssets();
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  if (dbError) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Assets</h1>
        <div className="mt-6 rounded-lg border border-dashed p-6 text-sm">
          <p className="font-medium">Database not reachable</p>
          <p className="mt-1 text-muted-foreground">
            Set <code>DATABASE_URL</code> in <code>.env.local</code> and run{" "}
            <code>npm run db:migrate</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <AssetsManager initialAssets={assets} />
    </div>
  );
}
