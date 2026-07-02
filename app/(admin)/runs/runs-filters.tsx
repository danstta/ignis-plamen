"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "waiting", label: "Waiting" },
  { value: "success", label: "Success" },
  { value: "error", label: "Error" },
  { value: "stopped", label: "Stopped" },
];

/**
 * Filter controls for the global Runs page. Filters live in the URL so the
 * server component re-fetches with them (and they're shareable/back-button
 * friendly); the text search is debounced before it touches the URL.
 */
export function RunsFilters({
  workflows,
  status,
  workflowId,
  q,
}: {
  workflows: { id: string; name: string }[];
  status?: string;
  workflowId?: string;
  q?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(q ?? "");

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") params.set(key, value);
      else params.delete(key);
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [router, pathname, searchParams],
  );

  // Debounce the text search so each keystroke doesn't push a new URL.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (search !== (searchParams.get("q") ?? "")) {
        setParam("q", search || null);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [search, setParam, searchParams]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by workflow or run id…"
          className="pl-8"
          aria-label="Search runs"
        />
      </div>

      <Select
        value={status ?? "all"}
        onValueChange={(value) => setParam("status", value)}
      >
        <SelectTrigger className="sm:w-40" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={workflowId ?? "all"}
        onValueChange={(value) => setParam("workflow", value)}
      >
        <SelectTrigger className="sm:w-52" aria-label="Filter by workflow">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All workflows</SelectItem>
          {workflows.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
