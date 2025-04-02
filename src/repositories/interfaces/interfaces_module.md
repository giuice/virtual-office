# Module: interfaces

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
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useconversations.ts
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usemessages.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Abc6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversation-list.tsx
3Abc8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-feed.tsx
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Aib: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces
3Aib1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iannouncementrepository.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iconversationrepository.ts
3Aib4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iinvitationrepository.ts
3Aib5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imeetingnoteactionitemrepository.ts
3Aib6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imeetingnoterepository.ts
3Aib7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
3Aib8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacerepository.ts
3Aib9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacereservationrepository.ts
3Aib10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
3Aib11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/index.ts
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
4Aiaa5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasemeetingnoteactionitemrepository.ts
4Aiaa6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasemeetingnoterepository.ts
4Aiaa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasemessagerepository.ts
4Aiaa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasespacerepository.ts
4Aiaa9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasespacereservationrepository.ts
4Aiaa10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseuserrepository.ts
4Aiaa11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/index.ts
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

last_KEY_edit: Assigned keys: 2Ad2, 2Ae1, 2Ae2, 2Af1, 2Af6, 2Aj1, 2Aj4, 3Abc6, 3Abc8, 3Ada1, 3Ada2, 3Afa4, 3Aib, 3Aib1, 3Aib2, 3Aib3, 3Aib4, 3Aib5, 3Aib6, 3Aib7, 3Aib8, 3Aib9, 3Aib10, 3Aib11, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa1, 4Aiaa2, 4Aiaa3, 4Aiaa4, 4Aiaa5, 4Aiaa6, 4Aiaa7, 4Aiaa8, 4Aiaa9, 4Aiaa10, 4Aiaa11, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbd1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestions (2025-04-02T12:03:10.100161)

---GRID_START---
X 2Ad2 2Ae1 2Ae2 2Af1 2Af6 2Aj1 2Aj4 3Abc6 3Abc8 3Ada1 3Ada2 3Afa4 3Aib 3Aib1 3Aib2 3Aib3 3Aib4 3Aib5 3Aib6 3Aib7 3Aib8 3Aib9 3Aib10 3Aib11 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa1 4Aiaa2 4Aiaa3 4Aiaa4 4Aiaa5 4Aiaa6 4Aiaa7 4Aiaa8 4Aiaa9 4Aiaa10 4Aiaa11 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbd1 5Agaea1 5Agaea2
2Ad2 = ospspSp5sppsp5SpSps12Sssp9Spssp5ss
2Ae1 = soSpspsS4p4sppsp31s5pspp
2Ae2 = pSopSppS4p8Sp35sspp
2Af1 = spposSp8sp4sSpSpS3s3S7s4psppsppsps5psSS
2Af6 = psSsopS3sSspspSpsSSp4sps3p3s5psspSppSSp4S7ss
2Aj1 = SppSpop16Sppsppsp5sSSp14sp5ss
2Aj4 = psppSpoSSsSsp3SpsSSp21sppSSp5sppSsspp
3Abc6 = pSSpSpSoSSsp4sppssp35sp3
3Abc8 = pSSpSpSSoSSp7ssp39
3Ada1 = pSSpspsSSoSp4sppssp34spspp
3Ada2 = pSSpSpSsSSosp3SpsSSp21sppSSp4sSssSSspp
3Afa4 = sp3spsp3sop3sppsp22sppsp9ssp3
3Aib = p12op46
3Aib1 = p4sp8oS4sSsSsps4p4spsp4Ss7p5spssp3
3Aib2 = sppsp9SosSssS4pS4s4SsSSsSSsSsSspsSsSps5ppSs
3Aib3 = psppSpSspsSspSsosSSsp21SpsSSp4S3sSSspp
3Aib4 = p13SSsoSssS3ps4Ss7ps4pSsp6s5ppss
3Aib5 = p4spsp3sppSsSSosSspsp4sp4sp6spssSsp9ssp3
3Aib6 = psppSpSs3SspssSssosSSp19spSSpsspps4SSsps
3Aib7 = ppSsSpSs3SppSSssSsoSp3s3SppssSSsspssSs4pSp4s3pSs4
3Aib8 = SppSp9sSpSsSSosSpS5s3S7sSsSs3Sspps5psSS
3Aib9 = p13SSpSpSpsoSpspssppsS3sspps4SpspSSsp8ss
3Aib10 = SppSpSp7sSpSsppSSopS5pssS7sspSp3SsSps4p3SS
3Aib11 = p23op25Sp9
4Agab1 = sppSsp8sSpsppsSsSpoS14sSs3psSsSpS5sS3
4Agab2 = sppSpsp7sSpsppsSpSpSoS13sSsSsps3SpS5ssSS
4Agab3 = sppSsp8sSpsppsSsSpSSoS15s4SSspS9
4Agab4 = sppssp8sSpsspSSsSpS3oS13sSs3SsspS9
4Agac1 = spps3p8spSp3SpSpS4oS10s3Ssp3sspS5sS3
4Agac2 = sppsp10spsp3sp3S5oSsS7pspSp7S5sS3
4Agad1 = sppSp10spspps4pS6oS8pspsppspsppS5sS3
4Agad2 = sppSp10spsppssSspS5sSoS7p6spsppS4spsSS
4Agad3 = sppSsp8sSpsspS4pS8oS7s4pS3spS9
4Agad4 = sppSsp9spsppS4pS9oS5sspsppssSppS4ssS3
4Agae1 = sppSssp7sSpsppsSsSpS10oS8ssS4pS9
4Agae2 = sppSsSp8SpsppsSsSpS11oS3sSsSsps3SpS5sS3
4Agae3 = SppSsSp8sp5SpSpS12oSSssSssps3SpS9
4Agae4 = sppsp10SpsppsSpSpS13oSs4ppsspspS4s3SS
4Agae5 = sppssp9SpsppsSsSpS14os4p3ssSpS5sS3
4Aiaa1 = p3ssp8SspsspSs3pssSSsp3SsSs4oS9ppsspsSpss
4Aiaa2 = p3sp9sSpsppsSsspS4s3pssSSs3SoS3sSSsSppsp5Ss
4Aiaa3 = p4Spsp3sspssSps5ppssSssp3spSsSssSSoS7pS3sSSsSS
4Aiaa4 = p3sp9sSpSspsS3psSsS3spssSSs3S3oSsS4s4psppSs
4Aiaa5 = p13s4SSssp3s5p3sps3ppS4oS5p3sppspss
4Aiaa6 = p4SpSp3SspspSpsSpssp4ssp6sp4SsSsSosS3ps4SSs3
4Aiaa7 = p3sSpSp3SppssSp3Ssp3s4ppssSsSs3pS5sospsp5Ss4
4Aiaa8 = p13sSp3spS3pSsSSp4SsSs4S6soSSsp7Ss
4Aiaa9 = p14sp3spsSspssSsspssS3sspsSsS4pSoSp3sp4ss
4Aiaa10 = Sppsp10Sp6sSpSSs3p3spS3sS7sSSosp7SS
4Aiaa11 = p23Sp18sp3spsop9
5Aacaa1 = sspsSp5sp3sSsps3pspS15ppSspsp5oS8
5Aacab1 = sspsSssp3Sp3sSsps3pspS15ssSspsp5SoS7
5Aacac1 = pspsSp5sppssSsps3pspS15spSs3ppsppSSoS6
5Aacad1 = pspsSp5sp3s3pspspspS15ppsppsp5S3oS5
5Aacba1 = pspsSpSppsSspssSssSSsp3S7sSsS3sSspSspSSp4S4oS4
5Aacbb1 = ppspSpssppSspspSpsSsp4ssSSs3pSsSsSssSpSpsSsp4S5oS3
5Aacbd1 = ps3Spsppssp4spps3p3SsS5sS5sSppsppssp4S6oSS
5Agaea1 = sppSssp8SpsppsSsSpS15sS3s3SsSpS7oS
5Agaea2 = sppSssp8spspssSsSpS15ssSs6SpS8o
---GRID_END---

---mini_tracker_end---
