# Module: repositories

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
2Ai: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Aj3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Abc6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversation-list.tsx
3Abc8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-feed.tsx
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Aia: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations
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
4Aiaa: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase
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

last_KEY_edit: Assigned keys: 2Ad2, 2Ae1, 2Ae2, 2Af1, 2Af6, 2Ai, 2Aj1, 2Aj3, 2Aj4, 3Abc6, 3Abc8, 3Ada1, 3Ada2, 3Afa4, 3Aia, 3Aib, 3Aib1, 3Aib2, 3Aib3, 3Aib4, 3Aib5, 3Aib6, 3Aib7, 3Aib8, 3Aib9, 3Aib10, 3Aib11, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa, 4Aiaa1, 4Aiaa2, 4Aiaa3, 4Aiaa4, 4Aiaa5, 4Aiaa6, 4Aiaa7, 4Aiaa8, 4Aiaa9, 4Aiaa10, 4Aiaa11, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbd1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestions (2025-04-02T12:03:03.621873)

---GRID_START---
X 2Ad2 2Ae1 2Ae2 2Af1 2Af6 2Ai 2Aj1 2Aj3 2Aj4 3Abc6 3Abc8 3Ada1 3Ada2 3Afa4 3Aia 3Aib 3Aib1 3Aib2 3Aib3 3Aib4 3Aib5 3Aib6 3Aib7 3Aib8 3Aib9 3Aib10 3Aib11 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa 4Aiaa1 4Aiaa2 4Aiaa3 4Aiaa4 4Aiaa5 4Aiaa6 4Aiaa7 4Aiaa8 4Aiaa9 4Aiaa10 4Aiaa11 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbd1 5Agaea1 5Agaea2
2Ad2 = ospsppSSp5sp3sp5SpSps12Sssp8spSpssp5ss
2Ae1 = soSpsp3sS4p5sppsp32s5pspp
2Ae2 = pSopSp3sS4p8SSp25sp9s3pp
2Af1 = sppospsp10sp4sSpSpS3s3S7sspsspsppsspsps5psSS
2Af6 = psSsop3S3sSsppspSpsSSp4sps3p3s5pspspSppSSp4S7ss
2Ai = p5op57
2Aj1 = Sppspposp15SpSppsspspssps3Spsp8sp3s4pps3
2Aj3 = Sp5sosp3ssp9sp15sp5sp4spSp9s
2Aj4 = psspSppsoSSsSsp4SpsSSp22sppSSp5sppSsspp
3Abc6 = pSSpSp3SoSSsp5sppssp36sp3
3Abc8 = pSSpSp3SSoSSp8ssp40
3Ada1 = pSSpsp3sSSoSp5sppssp35spspp
3Ada2 = pSSpSppsSsSSosp4SpsSSp22sppSSp4sSssSSspp
3Afa4 = sp3sppssp3sop4sppsp23sppsp9ssp3
3Aia = p14op48
3Aib = p15op47
3Aib1 = p4sp11oS4sSsSsps4p4spsp5Ss7p5spssp3
3Aib2 = sppsp12SosSssS4pS4s4SsSSsSSpsSsSspsSsSps5ppSs
3Aib3 = psppSp3SspsSsppSsosSSsp22SpsSSp4S3sSSspp
3Aib4 = p16SSsoSssS3ps4Ss7psspsspSsp6s5ppss
3Aib5 = p4sp3sp3sp3SsSSosSspsp4sp4sp7spssSsp9ssp3
3Aib6 = psSpSp3Ss3SsppssSssosSSp20spSSpsspps4SSsps
3Aib7 = ppSsSp3Ss3Sp3SSssSsoSp3s3SppssSSsspsspSs4pSp4s3pSs4
3Aib8 = SppSppSsp8sSpSsSSosSpS5s3S7psSsSs3Sspps5psSS
3Aib9 = p16SSpSpSpsoSpspssppsS3ssppsps3SpspSSsp8ss
3Aib10 = SppSppSp9sSpSsppSSopS5pssS7psspSp3SsSps4p3SS
3Aib11 = p26op26Sp9
4Agab1 = sppSsp11sSpsppsSsSpoS14psSs3ps3SpS5sS3
4Agab2 = sppSppsp9sSpsppsSpSpSoS13psSsSsps3SpS5ssSS
4Agab3 = sppSspsp9sSpsppsSsSpSSoS12pS3s5SspS9
4Agab4 = sppssp11sSpsspSSsSpS3oS11pSSsSs6pS9
4Agac1 = sppsspsp10spSp3SpSpS4oS10ps3Sspps3pS5sS3
4Agac2 = sppsp13spsp3sp3S5oSsS7ppspSp3sp3S5sS3
4Agad1 = sppSppsp10spspps4pS6oS8ppspspps3ppS5sS3
4Agad2 = sppSppsp10spsppssSspS5sSoS7p7spsppS4spsSS
4Agad3 = sppSsp11sSpsspS4pS8oS6pSs4pSsSspS9
4Agad4 = sppSspsp10spsppS4pS9oS5psspsppssSppS4ssS3
4Agae1 = sppSspsp9sSpsppsSsSpS10oS4pS4ssS4pS9
4Agae2 = sppSspsp10SpsppsSsSpS11oS3psSsSspsSsSpS5sS3
4Agae3 = SppSspSsp9sp5SpSpS12oSSpssSsspsSsSpS9
4Agae4 = sppsp13SpsppsSpSpS13oSps4ppsspspS4s3SS
4Agae5 = sppsspsp10SpsppsSsSpS14ops4p3SsSpS5sS3
4Aiaa = p42op20
4Aiaa1 = p3ssp11SspsspSs3pssSSsp3SsSs4poS9ppsspsSpss
4Aiaa2 = p3sp12sSpsppsSsspS4s3pssSSs3pSoS3sSSsSppsp5Ss
4Aiaa3 = p4Sppssp3ssppssSps5ppssSssp3spSsSsspSSoS7pS3sSSsSS
4Aiaa4 = p3sp12sSpSspsS3psSsS3spssSSs3pS3oSsS4s4psppSs
4Aiaa5 = p16s4SSssp3s5p3sps3p3S4oSSsSSp3sppspss
4Aiaa6 = ppspSp3Sp3SsppspSpsSpssp4ssp6sp5SsSsSossSSps4SSs3
4Aiaa7 = p3sSp3Sp3Sp3ssSp3Ssp3s4ppssSsSs3ppS5soSpsp5Ss4
4Aiaa8 = sppsppssp8sSp3spS3ps7pssS3sSpS4ssSosSspssp4SS
4Aiaa9 = p17sp3spsSspssSsspssS3sspspSsS4psoSp3sp4ss
4Aiaa10 = Sppsp3Sp9Sp6sSpSSs3p3spS3sSpS6sSSosp7SS
4Aiaa11 = p26Sp19sp3spsop9
5Aacaa1 = sspsSpsp5sp4sSsps3pspS15p3Sspsp5oS8
5Aacab1 = sspsSpspsp3Sp4sSsps3pspS15pssSspspsp3SoS7
5Aacac1 = pspsSpsp5sp3ssSsps3pspS15pspSs3pssppSSoS6
5Aacad1 = pspsSpsp5sp4s3pspspspS15p3sppsp5S3oS5
5Aacba1 = ps3Sp3SppsSsppssSssSSsp3S7sSsS3sSpspSspSSp4S4oS4
5Aacbb1 = ppspSp3ssppSsppspSpsSsp4ssSSs3pSsSsSsspSpSpsSsp4S5oS3
5Aacbd1 = ps3Spspsppssp5spps3p3SsS5sS5sSp3sppssp4S6oSS
5Agaea1 = sppSspsp10SpsppsSsSpS15psS3s3SsSpS7oS
5Agaea2 = sppSspssp9spspssSsSpS15pssSs4SsSpS8o
---GRID_END---

---mini_tracker_end---
