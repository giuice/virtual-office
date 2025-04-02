# Module: [id]

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
2Ad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/companycontext.tsx
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacereservationrepository.ts
3Aib10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/update.ts
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
4Aiaa2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasecompanyrepository.ts
4Aiaa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseinvitationrepository.ts
4Aiaa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasespacerepository.ts
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
5Agaea: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad2, 2Af1, 2Af6, 2Aj1, 3Aib2, 3Aib9, 3Aib10, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa2, 4Aiaa4, 4Aiaa8, 4Aiaa9, 4Aiaa10, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Aacbd1, 5Aacbe1, 5Agaea, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestions (2025-04-02T12:02:59.560080)

---GRID_START---
X 2Ad2 2Af1 2Af6 2Aj1 3Aib2 3Aib9 3Aib10 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa2 4Aiaa4 4Aiaa8 4Aiaa9 4Aiaa10 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbc1 5Aacbd1 5Aacbe1 5Agaea 5Agaea1 5Agaea2
2Ad2 = oSpSspSssSppsp5sSSsp5Sp10ss
2Af1 = SosSspSsS3sSpSsS5sSp4spspsp3sSpSS
2Af6 = psop7sp17S6pSSpss
2Aj1 = SSpoppSppsppsp5sSSp8sp4spspss
3Aib2 = ssppoSSpS4p4SsSSsS5sSssp8Ss
3Aib9 = p4SoSpspssppsS3ssppssS3sp10ss
3Aib10 = SSpS3opS5pssS7sSSsSs4p6SS
4Agaa1 = ssp5osSppssSppssSspsp5sspsp3sspss
4Agab1 = sSppSsSsoS17sS6spSspSS
4Agab2 = SSpsSpS3oS13sSssS6psSspSS
4Agab3 = pSspSsSpSSoS16sS6pSspSS
4Agab4 = psppSsSpS3oS14ssS6pSspSS
4Agac1 = sSpsppSsS4oS10pSpssS5sS3pSS
4Agac2 = p7sS5oSsS7psp3S5pS3pSS
4Agad1 = pSp3ssS7oS8p3spS5psSSpSS
4Agad2 = psp3SspS5sSoS7p3spS4p3sSpSS
4Agad3 = pSppS3pS8oS6sS3sS6pSspSS
4Agad4 = pSppsSSsS9oS5pssSpS4sppSSpSS
4Agae1 = sSpsSsSsS10oS15pSSpSS
4Agae2 = SSpSSsS13oS3sSssS6psSSpSS
4Agae3 = SSpSspSsS12oSSps3S10pSS
4Agae4 = ssppSpSpS13oSs3psS4sppsppSS
4Agae5 = pSppSsSsS14ops3S6spSspSS
4Aiaa2 = p4SsspSsSSp4spSspspoSSsSp10Ss
4Aiaa4 = p4S3pS5sppSsSSs3SoS3psp8Ss
4Aiaa8 = p4S3pSsSSp4SsSs4SSoSSp10Ss
4Aiaa9 = p4sSspssSsspssS3sspssSSoSppsp7ss
4Aiaa10 = SsppSsSpSSs3p3spS3sS5op10SS
5Aacaa1 = ppSpspssS15p5oS8pSS
5Aacab1 = psSsspssS15psp3SoS7pSS
5Aacac1 = ppSp3spS15p3spSSoS6pSS
5Aacad1 = psSp3ssS15p5S3oS5pSS
5Aacba1 = ppSp5S7pSsS3sSp5S4oS4pSS
5Aacbb1 = ppSp5spSSsp3SpSpSpsp5S5osSSpSS
5Aacbc1 = p3sp5sppSSsp4sSp7S5soSSpss
5Aacbd1 = psSp4sS7sS5sSp5S7oSpSS
5Aacbe1 = pSSsp3s5S4sS4psp5S8opSS
5Agaea = p37opp
5Agaea1 = sSssSsSsS18sS7sSSpoS
5Agaea2 = sSs4SsS15s4S7sSSpSo
---GRID_END---

---mini_tracker_end---
