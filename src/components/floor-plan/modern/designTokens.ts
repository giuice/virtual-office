// src/components/floor-plan/modern/designTokens.ts
// This file contains design tokens for the modern floor plan UI components

/**
 * Design system tokens for the floor plan UI components
 * Using a cozy, elegant aesthetic with Tailwind 4
 */
export const floorPlanTokens = {
  // Space card design tokens
  spaceCard: {
    // Border radii
    borderRadius: "rounded-lg",
    
    // Shadow styles - note the changes in Tailwind 4 naming
    shadow: {
      default: "shadow-xs",  // Previously shadow-sm in Tailwind 3
      hover: "shadow-sm",   // Previously shadow in Tailwind 3
      active: "shadow-md"
    },
    
    // Transition properties
    transition: "transition-all duration-200",
    
    // Hover scale factor - subtle growth on hover
    hoverScale: "hover:scale-[1.02]",

    // Interactive state variants (Tailwind v4 naming where applicable)
    states: {
      base: "bg-card text-card-foreground border border-border",
      hover: "hover:bg-accent/40 hover:shadow-sm",
      active: "active:shadow-md active:translate-y-[0.5px]",
      selected: "data-[selected=true]:ring-3 data-[selected=true]:ring-primary/40",
      disabled: "disabled:opacity-50 disabled:pointer-events-none",
      focus: "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/50",
    },
    
    // Space status indicators
    statusColors: {
      available: "bg-emerald-100 border-emerald-500", // Available spaces
      occupied: "bg-blue-100 border-blue-500", // Spaces with people
      locked: "bg-amber-100 border-amber-500", // Locked spaces
      maintenance: "bg-rose-100 border-rose-500" // Spaces under maintenance
    },
    
    // Space type colors (these could also be implemented as subtle background patterns)
    typeColors: {
      workspace: "bg-emerald-50/80 border-emerald-400/50",
      conference: "bg-blue-50/80 border-blue-400/50",
      social: "bg-amber-50/80 border-amber-400/50",
      breakout: "bg-violet-50/80 border-violet-400/50",
      private_office: "bg-rose-50/80 border-rose-400/50",
      open_space: "bg-cyan-50/80 border-cyan-400/50",
      lounge: "bg-indigo-50/80 border-indigo-400/50",
      lab: "bg-teal-50/80 border-teal-400/50"
    },
    
    // Padding and spacing
    padding: {
      default: "p-4",
      compact: "p-3",
      expanded: "p-5"
    },
    
    // Content area
    content: {
      header: "mb-3",
      body: "mb-3",
      footer: "mt-auto" // Pushes footer to bottom of card
    }
  },
  
  // User avatar design tokens
  avatar: {
    size: {
      xs: "h-6 w-6",
      sm: "h-8 w-8", 
      md: "h-10 w-10",
      lg: "h-12 w-12"
    },
    
    border: "border-2 border-background",
    
    // Status indicator
    statusIndicator: {
      size: "h-3 w-3",
      position: "-bottom-0.5 -right-0.5",
      online: "bg-emerald-500",
      away: "bg-amber-500",
      busy: "bg-rose-500",
      offline: "bg-gray-400"
    },
    
    // Group positioning
    group: {
      overlap: "-ml-3", // Overlapping avatars in a group
      ring: "ring-2 ring-background", // Ring to separate from background
      container: "flex items-center" // Container styling for avatar group
    }
  },
  
  // Status badges design tokens
  statusBadge: {
    base: "text-xs font-medium rounded-full px-2 py-0.5",
    colors: {
      available: "bg-emerald-100 text-emerald-800",
      occupied: "bg-blue-100 text-blue-800",
      locked: "bg-amber-100 text-amber-800",
      maintenance: "bg-rose-100 text-rose-800"
    }
  },
  
  // Space capacity indicators
  capacityIndicator: {
    container: "flex items-center gap-1 text-xs text-muted-foreground",
    icon: {
      base: "h-3.5 w-3.5",
      low: "text-emerald-500",  // <33% full
      medium: "text-amber-500", // 33-66% full
      high: "text-rose-500"     // >66% full
    }
  },
  
  // Floor plan layout
  floorPlanLayout: {
    // Grid layout options
    grid: {
      default: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4",
      compact: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3",
      spaced: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
    },
    
    // Container styles
    container: {
      base: "relative w-full h-[calc(100vh-12rem)] p-4 bg-background rounded-lg border border-border overflow-auto",
      scrollBehavior: "scroll-smooth"
    },

    // Zone section + header
    zone: {
      section: "mb-8",
      header: "sticky top-0 z-10 -mx-1 px-1 py-2 bg-background/80 supports-[backdrop-filter]:bg-background/60 backdrop-blur border-b border-border text-xs font-semibold tracking-wide text-muted-foreground",
    }
  }
};

/**
 * Helper functions to work with the design system
 */
export const floorPlanHelpers = {
  // Get space type styling
  getSpaceTypeClasses: (type: string): string => {
    return floorPlanTokens.spaceCard.typeColors[type as keyof typeof floorPlanTokens.spaceCard.typeColors] || 
      "bg-muted/50 border-muted-foreground";
  },
  
  // Get space status styling
  getSpaceStatusClasses: (status: string, hasUsers: boolean): string => {
    // If space has users, it's considered occupied regardless of status
    if (hasUsers && status === 'available') {
      return floorPlanTokens.spaceCard.statusColors.occupied;
    }
    
    return floorPlanTokens.spaceCard.statusColors[status as keyof typeof floorPlanTokens.spaceCard.statusColors] || 
      floorPlanTokens.spaceCard.statusColors.available;
  },
  
  // Get avatar status color
  getAvatarStatusColor: (status: string): string => {
    return floorPlanTokens.avatar.statusIndicator[status as keyof typeof floorPlanTokens.avatar.statusIndicator] ||
      floorPlanTokens.avatar.statusIndicator.offline;
  },
  
  // Get capacity indicator color based on current utilization percentage
  getCapacityIndicatorColor: (currentUsers: number, capacity: number): string => {
    if (!capacity) return floorPlanTokens.capacityIndicator.icon.low;
    
    const utilizationPercentage = (currentUsers / capacity) * 100;
    
    if (utilizationPercentage < 33) {
      return floorPlanTokens.capacityIndicator.icon.low;
    } else if (utilizationPercentage < 66) {
      return floorPlanTokens.capacityIndicator.icon.medium;
    } else {
      return floorPlanTokens.capacityIndicator.icon.high;
    }
  }
};
