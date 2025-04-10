[DEP_MATRIX_START]
# KEY DEFINITIONS
K1: src/hooks/queries/useSpaces.ts
K2: src/hooks/mutations/useSpaceMutations.ts
K3: src/repositories/interfaces/ISpaceRepository.ts
K4: src/repositories/implementations/supabase/SupabaseSpaceRepository.ts
K5: src/lib/supabase/client.ts
K6: src/types/database.ts
K7: src/components/floor-plan
K8: src/api/spaces
K9: src/providers/QueryProvider.tsx
K10: src/hooks/useLastSpace.ts
K11: src/utils/debug-logger.ts
K12: src/components/floor-plan/space-debug-panel.tsx
K13: src/components/floor-plan/room-templates.tsx
K14: src/components/floor-plan/dom-floor-plan.tsx
K15: src/components/ui

# MATRIX (Row depends on Column)
# Symbols: > (depends on), < (depended by), x (mutual), - (none), d (doc)
    | K1 | K2 | K3 | K4 | K5 | K6 | K7 | K8 | K9 | K10| K11| K12| K13| K14| K15|
K1  | -  | -  | >  | >  | -  | >  | -  | -  | -  | -  | -  | -  | -  | -  | -  |
K2  | -  | -  | -  | -  | -  | >  | >  | >  | -  | -  | -  | -  | -  | -  | -  |
K3  | <  | -  | -  | <  | -  | >  | -  | -  | -  | -  | -  | -  | -  | -  | -  |
K4  | <  | -  | >  | -  | >  | >  | -  | -  | -  | -  | -  | -  | -  | -  | -  |
K5  | -  | -  | -  | <  | -  | -  | -  | -  | -  | -  | -  | -  | -  | -  | -  |
K6  | <  | <  | <  | <  | -  | -  | <  | <  | -  | -  | -  | -  | -  | -  | -  |
K7  | >  | >  | -  | -  | -  | >  | -  | -  | -  | >  | >  | >  | >  | >  | >  |
K8  | -  | <  | >  | >  | -  | >  | -  | -  | -  | -  | -  | -  | -  | -  | -  |
K9  | <  | <  | -  | -  | -  | -  | -  | -  | -  | -  | -  | -  | -  | -  | -  |
K10 | -  | -  | -  | -  | -  | >  | -  | -  | -  | -  | -  | -  | -  | -  | -  |
K11 | -  | -  | -  | -  | -  | -  | -  | -  | -  | -  | -  | -  | -  | -  | -  |
K12 | -  | -  | -  | -  | -  | >  | -  | -  | -  | -  | >  | -  | -  | -  | >  |
K13 | -  | -  | -  | -  | -  | >  | -  | -  | -  | -  | -  | -  | -  | -  | >  |
K14 | -  | -  | -  | -  | -  | >  | -  | -  | -  | -  | -  | -  | -  | -  | >  |
K15 | <  | -  | -  | -  | -  | -  | <  | -  | -  | -  | -  | <  | <  | <  | -  |
[DEP_MATRIX_END]
