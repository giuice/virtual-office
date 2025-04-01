# Module: supabase

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
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usemessages.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/supabase/client.ts
3Aib1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iannouncementrepository.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iconversationrepository.ts
3Aib4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iinvitationrepository.ts
3Aib5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imeetingnoterepository.ts
3Aib6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
3Aib7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacerepository.ts
3Aib8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
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
4Aiaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseannouncementrepository.ts
4Aiaa2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasecompanyrepository.ts
4Aiaa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseconversationrepository.ts
4Aiaa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseinvitationrepository.ts
4Aiaa5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasemeetingnoterepository.ts
4Aiaa6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasemessagerepository.ts
4Aiaa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasespacerepository.ts
4Aiaa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseuserrepository.ts
4Aiaa9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/index.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad2, 2Ae2, 2Af1, 2Af6, 2Aj1, 2Aj4, 3Ada2, 3Afa4, 3Afc1, 3Aib1, 3Aib2, 3Aib3, 3Aib4, 3Aib5, 3Aib6, 3Aib7, 3Aib8, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa1, 4Aiaa2, 4Aiaa3, 4Aiaa4, 4Aiaa5, 4Aiaa6, 4Aiaa7, 4Aiaa8, 4Aiaa9, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbd1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Aj4 -> 2Ae2 (s)

---GRID_START---
X 2Ad2 2Ae2 2Af1 2Af6 2Aj1 2Aj4 3Ada2 3Afa4 3Afc1 3Aib1 3Aib2 3Aib3 3Aib4 3Aib5 3Aib6 3Aib7 3Aib8 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa1 4Aiaa2 4Aiaa3 4Aiaa4 4Aiaa5 4Aiaa6 4Aiaa7 4Aiaa8 4Aiaa9 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbd1 5Agaea1 5Agaea2
2Ad2 = opspSppsppsp5Ss12Sssp7spssp5ss
2Ae2 = popSpsSp7Sp22sp7s3pp
2Af1 = spossp5sp4sS4s3S7s4psppssps5psSS
2Af6 = pSsopSSspspSpsSppsps3p3s5psspSppSp3S7ss
2Aj1 = Spspop11Sppspspssps3Spsp7sps4pps3
2Aj4 = pspSpoSsp3SpsSp19sppSp4sppSsspp
3Ada2 = pSpSpSosp3SpsSp19sppSp3sSssSSspp
3Afa4 = sppspssop3sppsp19sppsp7ssp3
3Afc1 = p8op24sp6sp9
3Aib1 = p3sp5oS4sSs5p4spsp4Ss6p4spssp3
3Aib2 = spsp6SosSssS6s4SsSSsSSsSsSspsSps5ppSs
3Aib3 = p3SpSSspSsosSSsp18SpsSp3S3sSSspp
3Aib4 = p9SSsoSssSs4Ss7ps4pSsp4s5ppss
3Aib5 = p3spssppSsSSosSsp3sp4sp6spssSsp7ssp3
3Aib6 = pSpSpSSspssSssosp18sppSp3s4SSsps
3Aib7 = ppsp6SSssSsoSs3SppssSSsspssSs4pSp7spss
3Aib8 = SpSpSp4sSpSspSoS5s3S7sSsSspsSs6psSS
4Agab1 = spSsp5sSpsppsSoS14sSs3psspS5sS3
4Agab2 = spSp6sSpsppsSSoS13sSsSspsspS5ssSS
4Agab3 = spSssp4sSpsppsS3oS15s5pS9
4Agab4 = spssp5sSpsspS5oS13sSs4pS9
4Agac1 = sps3p5spSp3S5oS10s3SsppspS5sS3
4Agac2 = spsp7spsp3sS5oSsS7pspSp3spS5sS3
4Agad1 = spSpsp5spsppssS6oS8pspsppsspS5sS3
4Agad2 = spSpsp5spsppssS5sSoS7p6sppS4spsSS
4Agad3 = spSsp5sSpsspS10oS7s4pSspS9
4Agad4 = spSssp5spsppS11oS5sspsppsspS4ssS3
4Agae1 = spSssp4sSpsppsS11oS8ssSSpS9
4Agae2 = spSssp5SpsppsS12oS3sSsSspsSpS5sS3
4Agae3 = SpSsSp5sp5S13oSSssSsspsSpS9
4Agae4 = spsp7SpsppsS14oSs4ppsspS4s3SS
4Agae5 = sps3p5SpsppsS15os4p3SpS5sS3
4Aiaa1 = ppssp5SspsspSs3SSsp3SsSs4oS7ppsspsSpss
4Aiaa2 = ppsp5ssSpsppsS5s3pssSSs3SoS3sSSspsp5Ss
4Aiaa3 = p3Sps3pssSps6Sssp3spSsSssSSoS5pS3sSSsSS
4Aiaa4 = ppsp6sSpSspsSsSsS3spssSSs3S3oSsSSps3psppSs
4Aiaa5 = p9s4Sps7p3sps3ppS4oSSsp3sppspss
4Aiaa6 = pspSpSSspspSpsSp4ssp6sp4SsSsSossps4SSs3
4Aiaa7 = ppsp6ssp4Ss5ppssSsSs3pS5soSp6spss
4Aiaa8 = spspsp5Sp5Ss7pssS3sS5ssSospssp4SS
4Aiaa9 = p8sp7sp16sp5sop7sp
5Aacaa1 = spsSspsp3sSspspsS15ppSspsp3oS8
5Aacab1 = spsSssSp3sSspspsS15ssSspspspSoS7
5Aacac1 = ppsSspsppssSspspsS15spSs3pspSSoS6
5Aacad1 = ppsSspsp3s3pspsS15ppsppsp3S3oS5
5Aacba1 = pssSpSSspssSssSpsS7sSsS3sSspSspSp3S4oS4
5Aacbb1 = pspSpsSspspSpsSspssSSs3pSsSsSssSpSpsSsppS5oS3
5Aacbd1 = pssSs3p4sppspsSsS5sS5sSppsppsp3S6oSS
5Agaea1 = spSssp5SpsppsS16sS3s3SsS7oS
5Agaea2 = spSssp5spspssS16ssSs4SpS8o
---GRID_END---

---mini_tracker_end---
