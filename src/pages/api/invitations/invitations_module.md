# Module: invitations

## Purpose & Responsibility
{1-2 paragraphs on module purpose & responsibility}

## Interfaces
* `{InterfaceName}`: {purpose}
* `{Method1}`: {description}
* `{Method2}`: {description}
* Input: [Data received]
* Output: [Data provided]
...

## Implementation Details
* Files: [List with 1-line descriptions]
* Important algorithms: [List with 1-line descriptions]
* Data Models
    * `{Model1}`: {description}
    * `{Model2}`: {description}

## Current Implementation Status
* Completed: [List of completed items]
* In Progress: [Current work]
* Pending: [Future work]

## Implementation Plans & Tasks
* `implementation_plan_{filename1}.md`
* [Task1]: {brief description}
* [Task2]: {brief description}
* `implementation_plan_{filename2}.md`
* [Task1]: {brief description}
* [Task2]: {brief description} 
...

## Mini Dependency Tracker
---mini_tracker_start---

---KEY_DEFINITIONS_START---
Key Definitions:
2Ad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/authcontext.tsx
2Ad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/companycontext.tsx
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
3Afb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Aib4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iinvitationrepository.ts
3Aib10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/update.ts
4Agac: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agac2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/create.ts
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/create.ts
4Agad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/delete.ts
4Agad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/get.ts
4Agad4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/update.ts
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Agae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/remove-from-company.ts
4Agae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/update.ts
4Aiaa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseinvitationrepository.ts
4Aiaa9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasespacereservationrepository.ts
4Aiaa10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseuserrepository.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad1, 2Ad2, 2Af1, 2Ag1, 2Aj1, 3Afb1, 3Aib4, 3Aib10, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa4, 4Aiaa9, 4Aiaa10, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Aacbd1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestions (2025-04-02T12:02:53.473611)

---GRID_START---
X 2Ad1 2Ad2 2Af1 2Ag1 2Aj1 3Afb1 3Aib4 3Aib10 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa4 4Aiaa9 4Aiaa10 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbc1 5Aacbd1 5Aacbe1 5Agaea1 5Agaea2
2Ad1 = oS5p4sp3sp6sSp16
2Ad2 = SospSSpSssSp3sspsppsSSsp3Sp9sp
2Af1 = SsopsSpSsS3spssS7sSppspspsp3sS3
2Ag1 = Spposp9ssp6sp13spp
2Aj1 = SSssoSpSppsp3sppsppsSSp6sp6s3
3Afb1 = S3pSop4Sp3sp6sSp16
3Aib4 = p6oSpsppspSspspsp5Sp3sppsp6
3Aib10 = pSSpSpSopS4pSpssS8sSs4p5SS
4Agaa1 = pssp5osSp3ssSppssSspsp3sspsp3s4
4Agab1 = psSp3sSsoS3pS12sS6spSsSS
4Agab2 = sSSpsSpS3oSSpS12sS6psSsSS
4Agab3 = ppSp4SpSSoSpS13sS6pSsSS
4Agab4 = ppsp3sSpS3opS12ssS6pSsSS
4Agac = p13op25
4Agac1 = s6SSsS4poS11ssS5sS5
4Agac2 = ps3ppspsS4pSoSsS7sppS5sS5
4Agad1 = ppSp4sS5pSSoS8pspS5psS4
4Agad2 = psSpspsspS4pSsSoS7pspS4p3sS3
4Agad3 = ppSp4SpS4pS4oS8sS6pSsSS
4Agad4 = ppSp3sSsS4pS5oS5sSpS4sppS4
4Agae1 = psSpsppSsS4pS6oS13pS4
4Agae2 = sSSpSspS6pS7oS4sS6psS4
4Agae3 = S3sSSpSsS4pS8oSSssS12
4Agae4 = pssp4SpS4pS9oSspsS4sppspSS
4Agae5 = ppSp4SsS4pS10ossS6spSsSS
4Aiaa4 = p6SSpS4pSsppSsSSs3oSSpsp7SS
4Aiaa9 = p7spssSspspssS3sspsSoSppsp6Ss
4Aiaa10 = pSsp4SpSSsspsp3spS3sS3op9SS
5Aacaa1 = p7ssS4pS11p3oS10
5Aacab1 = ppspsps3S4pS11sppSoS9
5Aacac1 = p7spS4pS11pspSSoS8
5Aacad1 = ppsp4ssS4pS11p3S3oS7
5Aacba1 = p6sppS4pS3pSsS3sSp3S4oS6
5Aacbb1 = p9spSSpssppSpSpSpsp3S5osS4
5Aacbc1 = p10sp3SSsp4sSp5S5soSSps
5Aacbd1 = ppsp5sS4pS3sS5sSp3S7oS3
5Aacbe1 = ppSssp3s5pS4sS4psp3S8oSS
5Agaea1 = psSpsppSsS4pS20pSSoS
5Agaea2 = ppSpsppSsS4pS12sS7sS3o
---GRID_END---

---mini_tracker_end---
