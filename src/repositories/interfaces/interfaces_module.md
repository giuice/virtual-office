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
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Aj3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Aba4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/message-feed.tsx
3Abb6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/message-dialog.tsx
3Abb7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-chat-integration.tsx
3Abc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/chatwindow.tsx
3Abc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversationlist.tsx
3Abc6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversation-list.tsx
3Abc7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-composer.tsx
3Abc8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-feed.tsx
3Abc9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-item.tsx
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Afa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/announcements.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/meetingnotes.ts
3Afb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Aib1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iannouncementrepository.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iconversationrepository.ts
3Aib4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iinvitationrepository.ts
3Aib5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imeetingnoterepository.ts
3Aib6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
3Aib7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacerepository.ts
3Aib8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
3Aib9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/index.ts
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

last_KEY_edit: Assigned keys: 2Ad2, 2Ae1, 2Ae5, 2Af1, 2Af6, 2Aj3, 2Aj4, 3Aba4, 3Abb6, 3Abb7, 3Abc1, 3Abc2, 3Abc6, 3Abc7, 3Abc8, 3Abc9, 3Ada1, 3Ada2, 3Afa1, 3Afa4, 3Afa7, 3Afb1, 3Aib1, 3Aib2, 3Aib3, 3Aib4, 3Aib5, 3Aib6, 3Aib7, 3Aib8, 3Aib9, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa1, 4Aiaa2, 4Aiaa3, 4Aiaa4, 4Aiaa5, 4Aiaa6, 4Aiaa7, 4Aiaa9, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbd1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Aj4 -> 2Ae5 (s)

---GRID_START---
X 2Ad2 2Ae1 2Ae5 2Af1 2Af6 2Aj3 2Aj4 3Aba4 3Abb6 3Abb7 3Abc1 3Abc2 3Abc6 3Abc7 3Abc8 3Abc9 3Ada1 3Ada2 3Afa1 3Afa4 3Afa7 3Afb1 3Aib1 3Aib2 3Aib3 3Aib4 3Aib5 3Aib6 3Aib7 3Aib8 3Aib9 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa1 4Aiaa2 4Aiaa3 4Aiaa4 4Aiaa5 4Aiaa6 4Aiaa7 4Aiaa9 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbd1 5Agaea1 5Agaea2
2Ad2 = ospspSp13spSpsp5Sps12Sssp8ssp5ss
2Ae1 = soSpspspSsS3sS4p6sppsp26s5pspp
2Ae5 = pSopspspSSssS6p9sp27sppspspp
2Af1 = spposp18sp4sSpS3s3S7s4psppsps5psSS
2Af6 = ps3opSs5SpSssSpsppspSpsSp3sps3p3s5psspSppSppS7ss
2Aj3 = Sp4osp10s4Sp7sp13sp18s
2Aj4 = psspSsosSSssSsSSsSpsp4SpsSp20sppSp3sppSsspp
3Aba4 = p4spsos4SsSSp11sp35
3Abb6 = pSSpspSsoS9p9sp35
3Abb7 = psSpspSsSoS8p9sp35
3Abc1 = pSspspssSSoS6sp9sp35
3Abc2 = pSspspssS3oS5sp6sppsp35
3Abc6 = pSSpSpS6oS4sp6sppsp31sp3
3Abc7 = psSp3ssS5oS3sp9sp35
3Abc8 = pSSpSpS8oS3p9sp35
3Abc9 = pSSpspS9oSsp9sp32spp
3Ada1 = pSSpspspS8oSp6sppsp30spspp
3Ada2 = pSSpSsSpSSs4SsSopsp4SpsSp20sppSppsSssSSspp
3Afa1 = p5sp12oSSpsp40
3Afa4 = sp3s3p10sSoSp3sppsp20sppsp6ssp3
3Afa7 = p5sp12SSop5sp36
3Afb1 = Sp4Sp15op7sp5sp7Sp10ssp7
3Aib1 = p4sp13sp3oS4sSsps4p4spsp4Ss6p3spssp3
3Aib2 = sppsp18SosSssSSpS4s4SsSSsSSsSsSspsps5ppSs
3Aib3 = psppSpSp4ssp3sSpsppSsosSSsp19SpsSppS3sSSspp
3Aib4 = p22SSsoSssSps4Ss7ps4pSsp3s5ppss
3Aib5 = p4spsp10sppspSsSSosSsp4sp4sp6spssSsp6ssp3
3Aib6 = psspSpSs10SpsppssSssosp19sppSpps4SSsps
3Aib7 = p3sp18SSssSsoSps3SppssSSsspssSs4pSp6spss
3Aib8 = SppSpsp15ssSpSspSosS5s3S7sSsSsps7psSS
3Aib9 = p29sop22Sp9
4Agab1 = sppSsp17sSpsppsSpoS14sSs3pspS5sS3
4Agab2 = sppSp18sSpsppsSpSoS13sSsSspspS5ssSS
4Agab3 = sppSsp17sSpsppsSpSSoS15s4pS9
4Agab4 = sppssp17sSpsspSSpS3oS13sSs3pS9
4Agac1 = sppssp16spspSp3SpS4oS10s3Ssp3S5sS3
4Agac2 = sppsp19spsp3spS5oSsS7pspSp4S5sS3
4Agad1 = sppSp19spsppsspS6oS8pspsppspS5sS3
4Agad2 = sppSp19spsppsspS5sSoS7p6spS4spsSS
4Agad3 = sppSsp17sSpsspSSpS8oS7s4pSpS9
4Agad4 = sppSsp18spsppSSpS9oS5sspsppspS4ssS3
4Agae1 = sppSsp17sSpsppsSpS10oS8ssSpS9
4Agae2 = sppSsp18SpsppsSpS11oS3sSsSspspS5sS3
4Agae3 = SppSssp15Spsp5SpS12oSSssSsspspS9
4Agae4 = sppsp19SpsppsSpS13oSs4ppspS4s3SS
4Agae5 = sppssp18SpsppsSpS14os4p4S5sS3
4Aiaa1 = p3ssp17SspsspSspssSSsp3SsSs4oS6ppsspsSpss
4Aiaa2 = p3sp18sSpsppsSpS4s3pssSSs3SoS3sSspsp5Ss
4Aiaa3 = p4Spsp10spsppssSps4pssSssp3spSsSssSSoS4pS3sSSsSS
4Aiaa4 = p3sp18sSpSspsSpsSsS3spssSSs3S3oSsSps3psppSs
4Aiaa5 = p22s4Spssps5p3sps3ppS4oSSp3sppspss
4Aiaa6 = p4SpSp10SpsppspSpsSp5ssp6sp4SsSsSosps4SSs3
4Aiaa7 = p3sp18ssp4Ssps4ppssSsSs3pS5sop6spss
4Aiaa9 = p29sSp16sp5op7sp
5Aacaa1 = sspsSp12sp3spsSspspspS15ppSspsppoS8
5Aacab1 = s4Spsp10Sp3spsSspspspS15ssSspsppSoS7
5Aacac1 = pspsSp12sp4ssSspspspS15spSs3ppSSoS6
5Aacad1 = pspsSp12sp5s3pspspS15ppsppsppS3oS5
5Aacba1 = ps3SpSp9sSpsppssSssSpspS7sSsS3sSspSspSppS4oS4
5Aacbb1 = p4Spsp5sp4SpsppspSpsSsppssSSs3pSsSsSssSpSpsSspS5oS3
5Aacbd1 = ps3Spsp8s3p6sppspspSsS5sS5sSppsppsppS6oSS
5Agaea1 = sppSsp18SpsppsSpS15sS3s4S7oS
5Agaea2 = sppSssp17spspssSpS15ssSs4pS8o
---GRID_END---

---mini_tracker_end---
