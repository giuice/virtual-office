# Module: contexts

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
2Ad: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts
2Ad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/authcontext.tsx
2Ad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/companycontext.tsx
2Ad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/searchcontext.tsx
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useconversations.ts
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usemessages.ts
2Ae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Aj3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Aba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-members.tsx
3Aba3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/invite-user-dialog.tsx
3Aba5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/user-profile.tsx
3Abb6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/message-dialog.tsx
3Abb7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-chat-integration.tsx
3Abc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/chatwindow.tsx
3Abc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversationlist.tsx
3Abc3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/messageinput.tsx
3Abc4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/messagelist.tsx
3Abc5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/roommessaging.tsx
3Abc6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversation-list.tsx
3Abc7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-composer.tsx
3Abc8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-feed.tsx
3Abc9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-item.tsx
3Abd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/search/searchbar.tsx
3Abd2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/search/global-search.tsx
3Ada: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iconversationrepository.ts
3Aib7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
3Aib10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Aabd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/office/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Agae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/remove-from-company.ts
4Aiaa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseconversationrepository.ts
4Aiaa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasemessagerepository.ts
4Aiaa10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseuserrepository.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad, 2Ad1, 2Ad2, 2Ad3, 2Ae1, 2Ae2, 2Ae4, 2Ae5, 2Af1, 2Af6, 2Ag1, 2Aj1, 2Aj3, 2Aj4, 3Aba1, 3Aba3, 3Aba5, 3Abb6, 3Abb7, 3Abc1, 3Abc2, 3Abc3, 3Abc4, 3Abc5, 3Abc6, 3Abc7, 3Abc8, 3Abc9, 3Abd1, 3Abd2, 3Ada, 3Ada1, 3Ada2, 3Afa4, 3Afb1, 3Aib2, 3Aib3, 3Aib7, 3Aib10, 4Aaaa1, 4Aaab1, 4Aaac1, 4Aabd1, 4Aafa1, 4Agaa1, 4Agab1, 4Agab2, 4Agac1, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Aiaa3, 4Aiaa7, 4Aiaa10, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbd1, 5Aacbe1, 5Agaea1
last_GRID_edit: Applied suggestions (2025-04-02T12:02:30.869333)

---GRID_START---
X 2Ad 2Ad1 2Ad2 2Ad3 2Ae1 2Ae2 2Ae4 2Ae5 2Af1 2Af6 2Ag1 2Aj1 2Aj3 2Aj4 3Aba1 3Aba3 3Aba5 3Abb6 3Abb7 3Abc1 3Abc2 3Abc3 3Abc4 3Abc5 3Abc6 3Abc7 3Abc8 3Abc9 3Abd1 3Abd2 3Ada 3Ada1 3Ada2 3Afa4 3Afb1 3Aib2 3Aib3 3Aib7 3Aib10 4Aaaa1 4Aaab1 4Aaac1 4Aabd1 4Aafa1 4Agaa1 4Agab1 4Agab2 4Agac1 4Agae1 4Agae2 4Agae3 4Agae4 4Aiaa3 4Aiaa7 4Aiaa10 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbd1 5Aacbe1 5Agaea1
2Ad = op63
2Ad1 = poSps4SpSSppsSSp17Sp4S3ssppsspssp11ss
2Ad2 = pSos4psppSSps3p16sSsppSssps8SsppSsspsp4s
2Ad3 = ppsop5sp3sppsppSSppSpSpSSspSSp26sp4
2Ae1 = psspoSpSpsp3s4SsS6sSSp3SSp3sppsspssp11s5pssp
2Ae2 = psspSopSpSp3s4S11pspSSp4Sps5psppsppsp3sps6p
2Ae4 = pssp3op3sp4ssp22S4spsppsppsp3spssppssp
2Ae5 = psppSSpopsp3spssSSssSsS5p3SSp7sp15sppspsSp
2Af1 = pSsp5ospSp22SsppSp4ssSSsS3spps6pssS
2Af6 = p3ssSpssop3Sp3spssp3SpSsp3sSsppSSp7sps4pSSpS8s
2Ag1 = pSp4sp3op3s3p22S4sp3sppsp11sp
2Aj1 = pSSp5Sppop22Sp3Sp7s3SSp5sp5ss
2Aj3 = ppSp9osp18ssSp15spspSp9
2Aj4 = p3s3pspSppsop3SSssppsSsSSp3sSsppSSp14sSppsppSsspp
3Aba1 = psspssp4sp3oS3spsppsspsspsp9S5p20
3Aba3 = pSsps4ppsp3SoSSp3Sps5pspsp7S5p20
3Aba5 = pSs6ppsp3SSosspsSSsSsSSpspsp7S5p20
3Abb6 = p4SSpSpsp3S3soS10pspSSp31
3Abb7 = p4sSpSp5SspsSoSSssS5p3SSp9sp21
3Abc1 = p3S3pspsp3sp3SSoS8pspSsp31
3Abc2 = p3S3pspsp3sspsS3oSSsS4pspSsp31
3Abc3 = p4SSpSp7S3sSSoS6pspSp32
3Abc4 = p4SSpsp8SSsS3oS5pSpSp32
3Abc5 = p3S3pSp5s4S3sSSoSsSSp3Ssp6sspsp21
3Abc6 = p4SSpSpSp3SssS8oS3pSpSsp4sps5p20
3Abc7 = p3SsSpSp5spssS6sSoSSpspSsp31
3Abc8 = p4SSpSpSp3SssS10oSpspSSp4sppssSsp20
3Abc9 = p3S3pSpsp3SssS11opspSsp7s4p17ssp
3Abd1 = p3Sp24oSp34
3Abd2 = p3spsp8s4ps3SpSs3Sop9sspssp20
3Ada = p30op33
3Ada1 = p3S3pSpsp3spssS11p3oSp4sp21spspp
3Ada2 = p3S3pSpSppsSp3SSsspps3Ssp3SosppSSp14sSpsSssSs3p
3Afa4 = ppsp6sppssp18soppsp7sppsp3ssppSpsSsp3s
3Afb1 = pSSp5SppSSp21op11SspsSp13
3Aib2 = ppsp5sp26oppSp6SSsSSsSspSs5p3S
3Aib3 = p4sp4Sp3Sp18SsppoSp14SSpS3sSSp3
3Aib7 = p5Sp3Sp3Sp10spsp4sSp3Sop14sSps3pSSspp
3Aib10 = ppSp5SppSp23Sppop6S7ppSs4p4S
4Aaaa1 = pSspssSp3Sp3S3p6ssp4sp9oS4ppspsp13sp
4Aaab1 = pSspssSsppSp3S3p6sspsspsp9SoS3psspspsp4s4pps3
4Aaac1 = pSp3sSp3Sp3S3p7spssp11SSoSSp17sSp
4Aabd1 = psspssSp3Sp3S3psp4sspSspsp9S3oSp4sp15
4Aafa1 = pssps3pspsp3S3p7spsspsp9S4opsp5sp12
4Agaa1 = ppsp5sp24sp10os4Sssp3s5ps3
4Agab1 = ppsppsspSsp25SppSpsppssoS6spS6sSsS
4Agab2 = pssp5Sppsp22SSppSssp3sSoS5spS6pssS
4Agac1 = pssp5s4p21s3ppSp5sSSoS4spsS5sS3
4Agae1 = ppsppsspSspsp23SppSsspspsS3oS4pS10
4Agae2 = pssp5SspSp22sSppSp5S5oSSspS6pS3
4Agae3 = psSp5SssSsp21SsppSpsp3sS5oSSpS10
4Agae4 = ppsppsspsp24spSppSp4ssS6ospsS4spssS
4Aiaa3 = p9Sppssp18sspsSsp7s3SsSsoS5sSSspS
4Aiaa7 = p9Sp3Sp18Sp3SSp14Sosp4SSspp
4Aiaa10 = ppSp5sp3Sp22SppSp6SSsS3sSsop8S
5Aacaa1 = ppsps3psSp22sSpsSsspsp3sS8ppoS8
5Aacab1 = ppspsppssSpspsp18SppsSsspsp3sS8ppSoS7
5Aacac1 = p4s3psSp22sspsSsspsp3sS8ppSSoS6
5Aacad1 = ppsps3psSp22sSpsspspsp3sS7sppS3oS5
5Aacba1 = p3s3pssSp3Sp17sSspsSSp6sS6sSSpS4oS4
5Aacbb1 = p5sp3Sp3sp18sp3SSp7spsSpSpSSpS5oS3
5Aacbd1 = p4s5Sp3sp13sp3ssp4sppssppsSsS4s3pS6oSS
5Aacbe1 = pspps3SsSssp15sp4sp6ssSpps3S4sp3S7oS
5Agaea1 = pssp5Sspsp21spSppSpsp3sS8pS9o
---GRID_END---

---mini_tracker_end---
