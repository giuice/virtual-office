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
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
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
3Afc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/supabase/client.ts
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

last_KEY_edit: Assigned keys: 2Ad2, 2Ae1, 2Ae2, 2Ae5, 2Af1, 2Af6, 2Aj1, 2Aj3, 2Aj4, 3Aba4, 3Abb6, 3Abb7, 3Abc1, 3Abc2, 3Abc6, 3Abc7, 3Abc8, 3Abc9, 3Ada1, 3Ada2, 3Afa1, 3Afa4, 3Afa7, 3Afb1, 3Afc1, 3Aib1, 3Aib2, 3Aib3, 3Aib4, 3Aib5, 3Aib6, 3Aib7, 3Aib8, 3Aib9, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa1, 4Aiaa2, 4Aiaa3, 4Aiaa4, 4Aiaa5, 4Aiaa6, 4Aiaa7, 4Aiaa8, 4Aiaa9, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbd1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Aj4 -> 2Ae5 (s)

---GRID_START---
X 2Ad2 2Ae1 2Ae2 2Ae5 2Af1 2Af6 2Aj1 2Aj3 2Aj4 3Aba4 3Abb6 3Abb7 3Abc1 3Abc2 3Abc6 3Abc7 3Abc8 3Abc9 3Ada1 3Ada2 3Afa1 3Afa4 3Afa7 3Afb1 3Afc1 3Aib1 3Aib2 3Aib3 3Aib4 3Aib5 3Aib6 3Aib7 3Aib8 3Aib9 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa1 4Aiaa2 4Aiaa3 4Aiaa4 4Aiaa5 4Aiaa6 4Aiaa7 4Aiaa8 4Aiaa9 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbd1 5Agaea1 5Agaea2
2Ad2 = osppspSSp13spSppsp5Sps12Sssp7spssp5ss
2Ae1 = soSSpsppspSsS3sS4p7sppsp27s5pspp
2Ae2 = pSoSpSppssS10p10Sp23sp7s3pp
2Ae5 = pSSopsppspSSssS6p10sp28sppspspp
2Af1 = sp3ossp19sp4sSpS3s3S7s4psppssps5psSS
2Af6 = psSssoppSs5SpSssSpsp3spSpsSp3sps3p3s5psspSppSp3S7ss
2Aj1 = Sp3sposp15Sp8Sp3spspssps3Spsp7sps4pps3
2Aj3 = Sp5sosp10s4Sp8sp13sp19s
2Aj4 = ps3pSpsosSSssSsSSsSpsp5SpsSp20sppSp4sppSsspp
3Aba4 = ppsppsppsos4SsSSp12sp36
3Abb6 = pS3psppSsoS9p10sp36
3Abb7 = psSSpsppSsSoS8p10sp36
3Abc1 = pSSspsppssSSoS6sp10sp36
3Abc2 = pSSspsppssS3oS5sp7sppsp36
3Abc6 = pS3pSppS6oS4sp7sppsp32sp3
3Abc7 = psSSp4ssS5oS3sp10sp36
3Abc8 = pS3pSppS8oS3p10sp36
3Abc9 = pS3psppS9oSsp10sp33spp
3Ada1 = pS3psppspS8oSp7sppsp31spspp
3Ada2 = pS3pSpsSpSSs4SsSopsp5SpsSp20sppSp3sSssSSspp
3Afa1 = p7sp12oSSppsp41
3Afa4 = sp4spssp10sSoSp4sppsp20sppsp7ssp3
3Afa7 = p7sp12SSop6sp37
3Afb1 = Sp5SSp15op8sp5sp7Sp11ssp7
3Afc1 = p24op25sp6sp9
3Aib1 = p5sp14sp4oS4sSsps4p4spsp4Ss6p4spssp3
3Aib2 = sp3sp20SosSssSSpS4s4SsSSsSSsSsSspsSps5ppSs
3Aib3 = psp3SppSp4ssp3sSpsp3SsosSSsp19SpsSp3S3sSSspp
3Aib4 = p25SSsoSssSps4Ss7ps4pSsp4s5ppss
3Aib5 = p5sppsp10sppsppSsSSosSsp4sp4sp6spssSsp7ssp3
3Aib6 = psSspSppSs10Spsp3ssSssosp19sppSp3s4SSsps
3Aib7 = p4sp20SSssSsoSps3SppssSSsspssSs4pSp7spss
3Aib8 = Sp3SpSsp15spsSpSspSosS5s3S7sSsSspsSs6psSS
3Aib9 = p32sop23Sp9
4Agab1 = sp3Ssp19sSpsppsSpoS14sSs3psspS5sS3
4Agab2 = sp3Sp20sSpsppsSpSoS13sSsSspsspS5ssSS
4Agab3 = sp3Sssp18sSpsppsSpSSoS15s5pS9
4Agab4 = sp3ssp19sSpsspSSpS3oS13sSs4pS9
4Agac1 = sp3s3p16sppspSp3SpS4oS10s3SsppspS5sS3
4Agac2 = sp3sp21spsp3spS5oSsS7pspSp3spS5sS3
4Agad1 = sp3Spsp19spsppsspS6oS8pspsppsspS5sS3
4Agad2 = sp3Spsp19spsppsspS5sSoS7p6sppS4spsSS
4Agad3 = sp3Ssp19sSpsspSSpS8oS7s4pSspS9
4Agad4 = sp3Sssp19spsppSSpS9oS5sspsppsspS4ssS3
4Agae1 = sp3Sssp18sSpsppsSpS10oS8ssSSpS9
4Agae2 = sp3Sssp19SpsppsSpS11oS3sSsSspsSpS5sS3
4Agae3 = Sp3SsSsp15Sppsp5SpS12oSSssSsspsSpS9
4Agae4 = sp3sp21SpsppsSpS13oSs4ppsspS4s3SS
4Agae5 = sp3s3p19SpsppsSpS14os4p3SpS5sS3
4Aiaa1 = p4ssp19SspsspSspssSSsp3SsSs4oS7ppsspsSpss
4Aiaa2 = p4sp19ssSpsppsSpS4s3pssSSs3SoS3sSSspsp5Ss
4Aiaa3 = p5Sppsp10spsp3ssSps4pssSssp3spSsSssSSoS5pS3sSSsSS
4Aiaa4 = p4sp20sSpSspsSpsSsS3spssSSs3S3oSsSSps3psppSs
4Aiaa5 = p25s4Spssps5p3sps3ppS4oSSsp3sppspss
4Aiaa6 = ppsppSppSp10Spsp3spSpsSp5ssp6sp4SsSsSossps4SSs3
4Aiaa7 = p4sp20ssp4Ssps4ppssSsSs3pS5soSp6spss
4Aiaa8 = sp3spsp19Sp5Sps7pssS3sS5ssSospssp4SS
4Aiaa9 = p24sp7sSp16sp5sop7sp
5Aacaa1 = ssppsSsp12sp3sppsSspspspS15ppSspsp3oS8
5Aacab1 = sspssSspsp10Sp3sppsSspspspS15ssSspspspSoS7
5Aacac1 = psppsSsp12sp5ssSspspspS15spSs3pspSSoS6
5Aacad1 = psppsSsp12sp6s3pspspS15ppsppsp3S3oS5
5Aacba1 = ps4SppSp9sSpsp3ssSssSpspS7sSsS3sSspSspSp3S4oS4
5Aacbb1 = ppsppSppsp5sp4Spsp3spSpsSsppssSSs3pSsSsSssSpSpsSsppS5oS3
5Aacbd1 = ps4Sspsp8s3p7sppspspSsS5sS5sSppsppsp3S6oSS
5Agaea1 = sp3Sssp19SpsppsSpS15sS3s3SsS7oS
5Agaea2 = sp3Ss3p18spspssSpS15ssSs4SpS8o
---GRID_END---

---mini_tracker_end---
