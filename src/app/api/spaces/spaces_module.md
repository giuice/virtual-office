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
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iinvitationrepository.ts
3Aib8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacerepository.ts
3Aib9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacereservationrepository.ts
3Aib10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/update.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agac2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/create.ts
4Agad: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/create.ts
4Agad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/delete.ts
4Agad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/get.ts
4Agad4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/update.ts
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Agae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/remove-from-company.ts
4Agae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/update.ts
4Aiaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseannouncementrepository.ts
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
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Af1, 3Aib2, 3Aib4, 3Aib8, 3Aib9, 3Aib10, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa1, 4Aiaa2, 4Aiaa4, 4Aiaa8, 4Aiaa9, 4Aiaa10, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Aacbd1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestions (2025-04-02T12:02:55.544713)

---GRID_START---
X 2Af1 3Aib2 3Aib4 3Aib8 3Aib9 3Aib10 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa1 4Aiaa2 4Aiaa4 4Aiaa8 4Aiaa9 4Aiaa10 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbc1 5Aacbd1 5Aacbe1 5Agaea1 5Agaea2
2Af1 = osp3SsS3sSppSsS5sSp5spspsp3sS3
3Aib2 = soS4pS4pspssSsSSsSSsS3sSssppsp4Ss
3Aib4 = pSoS3psppsSsps4p5ssSp4sppsp6
3Aib8 = pSSoSSpspsSpspssSSsppspsS4p5sppsp3
3Aib9 = pS3oSpspssp3sS3sspps3S3sp9ss
3Aib10 = S5opS5ppssS7ssSSsSs4p5SS
4Agaa1 = sp5osSppsspSps3Sspsp6sspsp3s4
4Agab1 = SSs3SsoS5pS9sS3sS6spSsSS
4Agab2 = SSp3S3oS4pS9psSssS6psSsSS
4Agab3 = SSpssSpSSoS3pS9sS4sS6pSsSS
4Agab4 = sSsSsSpS3oSSpS9sS3ssS6pSsSS
4Agac1 = SpSppSsS4oSpS9ppSpssS5sS5
4Agac2 = ps3ppsS5opSsS7psSsppS5sS5
4Agad = p13op26
4Agad1 = Ss5S7poS8ps4pS5ssS4
4Agad2 = s4SspS5spSoS7p4spS4sppsS3
4Agad3 = SSsS3sS6pSSoS7s3SsS6sSsSS
4Agad4 = SssS3sS6pS3oS5s4SpS4s3S4
4Agae1 = SSpssSsS6pS4oS4sS11pS4
4Agae2 = SSppsS8pS5oS3psSssS6psS4
4Agae3 = Ssp3SsS6pS6oSSpps3S12
4Agae4 = sSpspSpS6pS7oSps3psS4sppspSS
4Agae5 = SSppsSsS6pS8opps3S6spSsSS
4Aiaa1 = ps5pspssp5Sssp4oS5p4sSp5
4Aiaa2 = pSsSsspSsSSpspspssSspspSoS4p9sp
4Aiaa4 = pS5pS6pspssSSs3SSoS3psppsp4SS
4Aiaa8 = pSpS3pSsSSpspspssSs4S3oSSp9Ss
4Aiaa9 = pspSSspssSssppssS3sspsS4oSppsp6Ss
4Aiaa10 = sSppsSpSSs3p4spS3sS6op9SS
5Aacaa1 = psp3ssS6pS9p6oS10
5Aacab1 = s3ppssS6pS9ppsp3SoS9
5Aacac1 = p5spS6pS9p4spSSoS8
5Aacad1 = sp4ssS6pS9p6S3oS7
5Aacba1 = ps3p3S6pSsSsS3sSspsp3S4oS6
5Aacbb1 = p7spSSsspspSsSpSpsSp5S5osS4
5Aacbc1 = p8sppSSpspsspsSp8S5soSSps
5Aacbd1 = sppsppsS6pSsS5sSp6S7oS3
5Aacbe1 = Sp5s5SSpSSsS4psp6S8oSS
5Agaea1 = SSppsSsS6pS9psS10pSSoS
5Agaea2 = SsppsSsS6pS9ppSssS7sS3o
---GRID_END---

---mini_tracker_end---
