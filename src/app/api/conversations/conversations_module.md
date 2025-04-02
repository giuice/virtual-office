# Module: conversations

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
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iconversationrepository.ts
3Aib4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iinvitationrepository.ts
3Aib7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
3Aib10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Aaca: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations
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
4Aiaa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseconversationrepository.ts
4Aiaa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseinvitationrepository.ts
4Aiaa9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasespacereservationrepository.ts
5Aacaa: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Af1, 2Af6, 2Aj1, 3Ada2, 3Aib2, 3Aib3, 3Aib4, 3Aib7, 3Aib10, 4Aaca, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa3, 4Aiaa4, 4Aiaa9, 5Aacaa, 5Aacaa1, 5Aacab, 5Aacab1, 5Aacac, 5Aacac1, 5Aacad, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Aacbd1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestions (2025-04-02T12:01:43.955788)

---GRID_START---
X 2Af1 2Af6 2Aj1 3Ada2 3Aib2 3Aib3 3Aib4 3Aib7 3Aib10 4Aaca 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa3 4Aiaa4 4Aiaa9 5Aacaa 5Aacaa1 5Aacab 5Aacab1 5Aacac 5Aacac1 5Aacad 5Aacad1 5Aacba1 5Aacbb1 5Aacbc1 5Aacbd1 5Aacbe1 5Agaea1 5Agaea2
2Af1 = osspsp3SpsS3sSpSsS5sSpsppspspspsp3sS3
2Af6 = sopSpSpSp5sp12sp3SpSpSpS3pSSps
2Aj1 = spop5Sp3sppsp5sSSp6spspspsp4s3
3Ada2 = pSpopSpSp18sp3spSpspsSspsspp
3Aib2 = sp3osSpSppS4p4SsSSsSSsSspspspspsp5Ss
3Aib3 = pSpSsosSp18Sp3SpSpSpsSSp5
3Aib4 = p4SsopSppsppsSsp3sp6Sppspspspssp6
3Aib7 = pSpSpSpop18sp3spspsppSSpsp3
3Aib10 = SpSpSpSpoppS5pssS7pSspspspspsp5SS
4Aaca = p9op34
4Agaa1 = sp9osSppssSppssSspsp4spspspsp3s4
4Agab1 = Sp3SpspSpsoS14pSspSpSpSpSSspSsSS
4Agab2 = SpspSp3SpSSoS13pSspSpSpSpSSpsSsSS
4Agab3 = SsppSp3SppSSoS12pSSpSpSpSpS3pSsSS
4Agab4 = sp3SpspSppS3oS11pSspSpSpSpS3pSsSS
4Agac1 = Spsp3SpSpsS4oS10pSspSpSpSpSSsS5
4Agac2 = p6sp3sS5oSsS7psppSpSpSpSSpS5
4Agad1 = Sp7spS7oS8ppspSpSpSpSSpsS4
4Agad2 = sp7sppS5sSoS7ppspSpSpSpSp3sS3
4Agad3 = Sp3Sp3SppS8oS6pSSpSpSpSpS3pSsSS
4Agad4 = Sp3spspSpsS9oS5psSpSpSpSpSsppS4
4Agae1 = SpspSp3SpsS10oS4pSSpSpSpSpS3pS4
4Agae2 = SpSpSp3SpS12oS3pSspSpSpSpSSpsS4
4Agae3 = SpSpsp3SpsS12oSSpsspSpSpSpS8
4Agae4 = sp3Sp3SppS13oSpsppSpSpSpSsppspSS
4Agae5 = Sp3Sp3SpsS14opsspSpSpSpSSspSsSS
4Aiaa3 = pspssSpsp18oSSpSpSpSpsSSp5
4Aiaa4 = sp3SpSpSppS5sppSsSSs3SoSpspspsp7SS
4Aiaa9 = p4sp3sppssSsspssS3sspsSSop5sp7Ss
5Aacaa = p29op14
5Aacaa1 = sSs3Ss3psS16sppopSpSpS8
5Aacab = p31op12
5Aacab1 = sSsSsSs3psS16sppSpopSpS8
5Aacac = p33op10
5Aacac1 = sSs3Ss3psS16sspSpSpopS8
5Aacad = p35op8
5Aacad1 = sSs5pspsS15sp3SpSpSpoS7
5Aacba1 = pSpSpSsSp3S7pSsS3sSSp3SpSpSpSoS6
5Aacbb1 = pSpspSpSp3spSSsp3SpSpSpsSp3SpSpSpSSosS4
5Aacbc1 = p12sppSSsp4sSp6SpSpSpSSsoSSps
5Aacbd1 = sSpsp3sppsS7sS5sSp4SpSpSpS4oS3
5Aacbe1 = SSssp6s5S4sS4psp4SpSpSpS5oSS
5Agaea1 = SpspSp3SpsS15pSSpSpSpSpS3pSSoS
5Agaea2 = Ssspsp3SpsS15pSspSpSpSpS3sS3o
---GRID_END---

---mini_tracker_end---
