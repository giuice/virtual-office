import type { Config } from "tailwindcss";

export default {
    darkMode: 'selector',
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
        colors: {
            background: 'hsl(var(--background))',
            foreground: 'hsl(var(--foreground))',
            card: {
                DEFAULT: 'hsl(var(--card))',
                foreground: 'hsl(var(--card-foreground))'
            },
            popover: {
                DEFAULT: 'hsl(var(--popover))',
                foreground: 'hsl(var(--popover-foreground))'
            },
            primary: {
                DEFAULT: 'hsl(var(--primary))',
                foreground: 'hsl(var(--primary-foreground))'
            },
            secondary: {
                DEFAULT: 'hsl(var(--secondary))',
                foreground: 'hsl(var(--secondary-foreground))'
            },
            muted: {
                DEFAULT: 'hsl(var(--muted))',
                foreground: 'hsl(var(--muted-foreground))'
            },
            accent: {
                DEFAULT: 'hsl(var(--accent))',
                foreground: 'hsl(var(--accent-foreground))'
            },
            destructive: {
                DEFAULT: 'hsl(var(--destructive))',
                foreground: 'hsl(var(--destructive-foreground))'
            },
            border: 'hsl(var(--border))',
            input: 'hsl(var(--input))',
            ring: 'hsl(var(--ring))',
            chart: {
                '1': 'hsl(var(--chart-1))',
                '2': 'hsl(var(--chart-2))',
                '3': 'hsl(var(--chart-3))',
                '4': 'hsl(var(--chart-4))',
                '5': 'hsl(var(--chart-5))'
            },
            // Virtual Office theme colors
            vo: {
                'bg-base': 'var(--vo-bg-base)',
                'bg-surface': 'var(--vo-bg-surface)',
                'text-primary': 'var(--vo-text-primary)',
                'text-muted': 'var(--vo-text-muted)',
                'accent': 'var(--vo-accent)',
                'accent-secondary': 'var(--vo-accent-secondary)',
                'signal-critical': 'var(--vo-signal-critical)',
                'signal-warning': 'var(--vo-signal-warning)',
                'signal-success': 'var(--vo-signal-success)',
                'glass-bg': 'var(--vo-glass-bg)',
                'glass-border': 'var(--vo-glass-border)',
                'border-subtle': 'var(--vo-border-subtle)',
                'hover-bg': 'var(--vo-hover-bg)',
                'card-bg': 'var(--vo-card-bg)',
                'card-border': 'var(--vo-card-border)',
                'pill-bg': 'var(--vo-pill-bg)',
                'pill-text': 'var(--vo-pill-text)',
                'beacon': 'var(--vo-beacon-color)',
            }
        },
        boxShadow: {
            'vo-glass': 'var(--vo-glass-shadow)',
            'vo-card-hover': 'var(--vo-card-hover-shadow)',
            'vo-active': '0 4px 12px var(--vo-active-shadow)',
            'vo-beacon': '0 0 10px var(--vo-beacon-glow)',
        },
        borderRadius: {
            lg: 'var(--radius)',
            md: 'calc(var(--radius) - 2px)',
            sm: 'calc(var(--radius) - 4px)'
        },
        transitionTimingFunction: {
            'vo-elastic': 'var(--vo-ease-elastic)',
        },
        transitionDuration: {
            'vo': 'var(--vo-transition-speed)',
        },
    }
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
