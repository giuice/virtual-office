"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";
export { AvatarImage } from "./avatar-image";
export { AvatarFallback } from "./avatar-fallback";

const Avatar = ({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & {
  ref?: React.Ref<React.ComponentRef<typeof AvatarPrimitive.Root>>;
}) => <AvatarPrimitive.Root ref={ref} className={cn("relative flex size-10 shrink-0 overflow-hidden rounded-full", className)} {...props} />;
Avatar.displayName = AvatarPrimitive.Root.displayName;
export { Avatar };
