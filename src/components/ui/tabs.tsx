// src/components/ui/tabs.tsx
"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
export { TabsTrigger } from "./tabs-trigger";
export { TabsContent } from "./tabs-content";

const Tabs = TabsPrimitive.Root;
const TabsList = ({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  ref?: React.Ref<React.ElementRef<typeof TabsPrimitive.List>>;
}) => <TabsPrimitive.List ref={ref} className={cn("inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground", className)} {...props} />;
TabsList.displayName = TabsPrimitive.List.displayName;
export { Tabs, TabsList };
