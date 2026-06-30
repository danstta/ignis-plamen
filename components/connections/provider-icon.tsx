import {
  Plug,
  type LucideIcon,
} from "lucide-react";
import {
  AnthropicDark,
  AnthropicLight,
  GoogleDrive,
  MicrosoftAzure,
  Notion,
  OpenAIDark,
  OpenAILight,
} from "@ridemountainpig/svgl-react";
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>> | LucideIcon;

function ThemedSvglIcon({
  light: Light,
  dark: Dark,
  className,
}: {
  light: IconComponent;
  dark: IconComponent;
  className?: string;
}) {
  return (
    <>
      <Light className={cn(className, "dark:hidden")} aria-hidden="true" />
      <Dark className={cn(className, "hidden dark:block")} aria-hidden="true" />
    </>
  );
}

/** Brand logo per connection provider id (from lib/connections/registry). */
const ICONS: Record<string, IconComponent> = {
  notion: Notion,
  "google-drive": GoogleDrive,
  "azure-foundry": MicrosoftAzure,
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
  if (type === "openai") {
    return (
      <ThemedSvglIcon
        light={OpenAILight}
        dark={OpenAIDark}
        className={className}
      />
    );
  }

  if (type === "anthropic") {
    return (
      <ThemedSvglIcon
        light={AnthropicLight}
        dark={AnthropicDark}
        className={className}
      />
    );
  }

  const Icon = ICONS[type] ?? Plug;
  return <Icon className={className} aria-hidden="true" />;
}
