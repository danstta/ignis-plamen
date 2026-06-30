import {
  Bot,
  BrainCircuit,
  CloudCog,
  Plug,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { NotionIcon } from "@/components/icons/notion";
import { GoogleDriveIcon } from "@/components/icons/google-drive";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>> | LucideIcon;

/** Brand logo per connection provider id (from lib/connections/registry). */
const ICONS: Record<string, IconComponent> = {
  notion: NotionIcon,
  "google-drive": GoogleDriveIcon,
  openai: Bot,
  anthropic: BrainCircuit,
  "azure-foundry": CloudCog,
};

/**
 * Renders a connection provider's brand logo, falling back to a generic plug
 * for providers without a registered icon. Size/color via `className`.
 */
export function ProviderIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const Icon = ICONS[type] ?? Plug;
  return <Icon className={className} aria-hidden="true" />;
}
