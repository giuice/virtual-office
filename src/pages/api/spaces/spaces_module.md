# Module: spaces

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
2Ae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
3Aib1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iannouncementrepository.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iinvitationrepository.ts
3Aib5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imeetingnoterepository.ts
3Aib7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacerepository.ts
3Aib8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agac2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/create.ts
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/create.ts
4Agad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/delete.ts
4Agad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/get.ts
4Agad4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/update.ts
4Aiaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseannouncementrepository.ts
4Aiaa2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasecompanyrepository.ts
4Aiaa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseconversationrepository.ts
4Aiaa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseinvitationrepository.ts
4Aiaa5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasemeetingnoterepository.ts
4Aiaa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasespacerepository.ts
4Aiaa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseuserrepository.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad1, 2Ad2, 2Ae4, 2Af6, 2Aj1, 3Aib1, 3Aib2, 3Aib4, 3Aib5, 3Aib7, 3Aib8, 4Aaab1, 4Aaac1, 4Aafa1, 4Agaa1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Aiaa1, 4Aiaa2, 4Aiaa3, 4Aiaa4, 4Aiaa5, 4Aiaa7, 4Aiaa8, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Aacbd1, 5Aacbe1
last_GRID_edit: Applied suggestion: 2Aj1 -> 2Ae4 (s)

---GRID_START---
X 2Ad1 2Ad2 2Ae4 2Af6 2Aj1 3Aib1 3Aib2 3Aib4 3Aib5 3Aib7 3Aib8 4Aaab1 4Aaac1 4Aafa1 4Agaa1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Aiaa1 4Aiaa2 4Aiaa3 4Aiaa4 4Aiaa5 4Aiaa7 4Aiaa8 5Aacba1 5Aacbb1 5Aacbc1 5Aacbd1 5Aacbe1
2Ad1 = oSspSp6SSsp5sp9sps
2Ad2 = SospSpsp3Ssps7p6sppspp
2Ae4 = ssopsp6SSspssp13ss
2Af6 = p3opsppsp7sps3pSp4SSpSS
2Aj1 = SSspop5Sssp3sspsp6spps3
3Aib1 = p3spoS4sp7spSs5pssp3
3Aib2 = psp3SoSsSSp4s3SssSsSssSsp4
3Aib4 = p5SSoSsSp4s7pSsppsp4
3Aib5 = p3spSsSoSsp7spspssSppssp3
3Aib7 = p5SSsSoSp5ssS3s4Sppsp3
3Aib8 = pSppSsSSsSop4s3SSsSsSssSsppsp
4Aaab1 = SsSpsp6oSSpssp13ss
4Aaac1 = SpSpsp6SoSpssp13sS
4Aafa1 = s3p8SSop3sp14
4Agaa1 = psp12osSpssp10ss
4Agac2 = pssp3sspps3psoSsSSpspSppsSsS3
4Agad1 = ps4pssps4pSSoS3pspspssSssSS
4Agad2 = psppspsspssppspsSoSSp5spsppsS
4Agad3 = pspspsSssSSp3sS3oSSs4SsSSsSs
4Agad4 = sspsspsspSSp3sS4osspsps5SS
4Aiaa1 = p3spSs3Ssp7SsoS6sSp3
4Aiaa2 = p5sSspsSp4sspssSoS5p5
4Aiaa3 = p3Spssps3p7spSSoS6psp
4Aiaa4 = p5sSSssSp4SspssS3oS3sp4
4Aiaa5 = p5s3Sssp7spS4oSspsp3
4Aiaa7 = p5ssppSsp5ssSsS5oSpsp3
4Aiaa8 = psppspSp3Sp4sspssS4sSop5
5Aacba1 = p3Sps4psp4SSsSsspSsp3oS4
5Aacbb1 = p3Spsppssp5sspSsSpSpsspSosSS
5Aacbc1 = ssppsp10Sspssp7SsoSS
5Aacbd1 = ppsSsp5s3psSSsSSppsp4S3oS
5Aacbe1 = spsSsp6sSpsS3sSp7S4o
---GRID_END---

---mini_tracker_end---
