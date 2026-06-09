"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

const AvatarImage = ({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image> & {
  ref?: React.Ref<React.ComponentRef<typeof AvatarPrimitive.Image>>;
}) => <AvatarPrimitive.Image ref={ref} className={cn("aspect-square size-full", className)} {...props} />;
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

export { AvatarImage };
