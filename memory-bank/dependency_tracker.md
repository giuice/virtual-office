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

# MATRIX (Row depends on Column)
# Symbols: > (depends on), < (depended by), x (mutual), - (none), d (doc)
    | K1 | K2 | K3 | K4 | K5 | K6 | K7 | K8 | K9 |
K1  | -  | -  | >  | >  | -  | >  | -  | -  | -  |
K2  | -  | -  | -  | -  | -  | >  | >  | >  | -  |
K3  | <  | -  | -  | <  | -  | >  | -  | -  | -  |
K4  | <  | -  | >  | -  | >  | >  | -  | -  | -  |
K5  | -  | -  | -  | <  | -  | -  | -  | -  | -  |
K6  | <  | <  | <  | <  | -  | -  | <  | <  | -  |
K7  | >  | >  | -  | -  | -  | >  | -  | -  | -  |
K8  | -  | <  | >  | >  | -  | >  | -  | -  | -  |
K9  | <  | <  | -  | -  | -  | -  | -  | -  | -  |
[DEP_MATRIX_END]
