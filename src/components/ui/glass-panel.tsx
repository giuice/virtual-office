import * as React from "react"
import { cn } from "@/lib/utils"
import { useMouseGlow } from "@/hooks/ui/use-mouse-glow"

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  withGlow?: boolean
}

const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, interactive = false, withGlow = false, children, ...props }, forwardedRef) => {
    // Use the mouse glow hook if requested, otherwise use the forwarded ref
    const glowRef = useMouseGlow<HTMLDivElement>()
    
    // Combine refs
    const ref = React.useCallback(
      (node: HTMLDivElement) => {
        if (typeof forwardedRef === 'function') {
          forwardedRef(node)
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node
        }
        if (withGlow) {
          (glowRef as React.MutableRefObject<HTMLDivElement | null>).current = node
        }
      },
      [forwardedRef, withGlow, glowRef]
    )

    return (
      <div
        ref={ref}
        className={cn(
          "group relative overflow-hidden rounded-2xl border border-vo-card-border bg-vo-card-bg p-6 backdrop-blur-xl",
          "transition-all duration-vo ease-vo-elastic",
          interactive && "cursor-pointer hover:-translate-y-1 hover:scale-[1.01] hover:border-vo-card-hover-border hover:shadow-vo-card-hover hover:z-10",
          className
        )}
        {...props}
      >
        {/* SVG Noise Texture for tactile feel */}
        <div 
          className="pointer-events-none absolute inset-0 z-0 opacity-[0.04]"
          style={{
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")"
          }}
        />

        {/* Dynamic Specular Highlight (Mouse tracking) */}
        {withGlow && (
          <div 
            className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background: "radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255,255,255,0.08), transparent 40%)"
            }}
          />
        )}

        {/* Content Wrapper to ensure it sits above the noise/glow */}
        <div className="relative z-20 h-full w-full">
          {children}
        </div>
      </div>
    )
  }
)
GlassPanel.displayName = "GlassPanel"

export { GlassPanel }
