import { Blocks } from "lucide-react";
import { listPluginStates } from "@/lib/plugins/service";
import { PluginToggle } from "@/components/plugins/plugin-toggle";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function PluginsPage() {
  let states: Awaited<ReturnType<typeof listPluginStates>> = [];
  let dbError: string | null = null;
  try {
    states = await listPluginStates();
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2">
        <Blocks className="size-5" />
        <h1 className="text-2xl font-semibold">Plugins</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Turn features on or off. Disabled plugins hide their nodes from the
        workflow canvas and stop those nodes from running.
      </p>

      {dbError ? (
        <div className="mt-6 rounded-lg border border-dashed p-6 text-sm">
          <p className="font-medium">Database not reachable</p>
          <p className="mt-1 text-muted-foreground">
            Set <code>DATABASE_URL</code> in <code>.env.local</code> and run{" "}
            <code>bun run db:migrate</code>.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {states.map((p) => {
            const builtIn = p.id === "core";
            return (
              <Card key={p.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <CardTitle>{p.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {p.description}
                      </CardDescription>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Nodes: {p.nodeTypeIds.join(", ")}
                      </p>
                    </div>
                    {builtIn ? (
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        Built-in
                      </span>
                    ) : (
                      <PluginToggle id={p.id} enabled={p.enabled} />
                    )}
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
