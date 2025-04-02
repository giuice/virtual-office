# Module: types

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
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useconversations.ts
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Aj: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Aj2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/common.ts
2Aj3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Aba4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/message-feed.tsx
3Abb6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/message-dialog.tsx
3Abb7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-chat-integration.tsx
3Abb13: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/types.ts
3Abc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/chatwindow.tsx
3Abc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversationlist.tsx
3Abc6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversation-list.tsx
3Abc8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-feed.tsx
3Abc9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-item.tsx
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/messages.ts
3Afb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
3Aib3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iconversationrepository.ts
3Aib7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
3Aib10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Aiaa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseconversationrepository.ts
4Aiaa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasemessagerepository.ts
4Aiaa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasespacerepository.ts
4Aiaa10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseuserrepository.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad1, 2Ad2, 2Ae1, 2Ae5, 2Af1, 2Af6, 2Aj, 2Aj1, 2Aj2, 2Aj3, 2Aj4, 3Aba4, 3Abb6, 3Abb7, 3Abb13, 3Abc1, 3Abc2, 3Abc6, 3Abc8, 3Abc9, 3Ada1, 3Ada2, 3Afa4, 3Afa8, 3Afb1, 3Aga1, 3Aib3, 3Aib7, 3Aib10, 4Agab2, 4Agac1, 4Agae1, 4Agae2, 4Agae3, 4Aiaa3, 4Aiaa7, 4Aiaa8, 4Aiaa10, 5Aacab1, 5Aacba1, 5Aacbb1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestions (2025-04-02T12:03:12.162416)

---GRID_START---
X 2Ad1 2Ad2 2Ae1 2Ae5 2Af1 2Af6 2Aj 2Aj1 2Aj2 2Aj3 2Aj4 3Aba4 3Abb6 3Abb7 3Abb13 3Abc1 3Abc2 3Abc6 3Abc8 3Abc9 3Ada1 3Ada2 3Afa4 3Afa8 3Afb1 3Aga1 3Aib3 3Aib7 3Aib10 4Agab2 4Agac1 4Agae1 4Agae2 4Agae3 4Aiaa3 4Aiaa7 4Aiaa8 4Aiaa10 5Aacab1 5Aacba1 5Aacbb1 5Aacbe1 5Agaea1 5Agaea2
2Ad1 = oSspSppSp16Sp4sspsSp10
2Ad2 = SospSppSpSp14Sp3SSssSSp3Sp4sp
2Ae1 = ssoSpsp4ssSspS7p4sp11sppspp
2Ae5 = ppSopsp4spSSpssS5p16sppSpp
2Af1 = SSppospsp16Sp3SSsS3pps3ppsSS
2Af6 = pps3op4Spsp4SSssSsp3SSp6sSppS4ps
2Aj = p6op37
2Aj1 = SSppsppopsp14Sp3Ss4Sppspspps3
2Aj2 = p8op31sp3
2Aj3 = pSp5sposp3Sp6ssSSsp7sspsSp5s
2Aj4 = ppsspSp3sosSSs3S3sSsp3SSp6sSppsSsp3
3Aba4 = ppsp7sosppssS3p24
3Abb6 = ppSSpsp4SsoSpS7p22
3Abb7 = ppsSp6SpSosS7p22
3Abb13 = p9Ssppsop29
3Abc1 = ppSsp6ssSSpoS5sp22
3Abc2 = ppSsp6ssSSpSoS4sp22
3Abc6 = ppSSpSp4S4pSSoS3sp5sp16
3Abc8 = ppSSpSp4S4pS3oS3p5sp16
3Abc9 = ppSSpsp4S4pS4oSsp22
3Ada1 = ppSSpsp4spSSpS5oSp5sp16
3Ada2 = ppSSpSp3sSpSSps3SsSosp3SSp6sSppS3spp
3Afa4 = p5sp3ssp10soSpssp3sp3sp3spspss
3Afa8 = p9Sp12Sopsp18
3Afb1 = SSppSppSpSp14op4SspsSp10
3Aga1 = p9sp12sspop4sSssp8ss
3Aib3 = ppsppSp4Sp10Ssp3oSp6SSppS3p3
3Aib7 = p5Sp4Sp6sspsSp4Sop6sSppsSSp3
3Aib10 = pSppSppSp20oS5ppSSsp3SS
4Agab2 = sSppSppsp16Sp3SoS4ppsS3psSS
4Agac1 = ssppsppsp14spssppSSoS3spssSSsS3
4Agae1 = psppSppsp17SppS3oS3pS8
4Agae2 = sSppSppsp16ssppS4oSspS4sS3
4Agae3 = SSppSppSpsp14SsppS5oSpS8
4Aiaa3 = p5sp3ssp10ssp3SsppsSsSoS6pSS
4Aiaa7 = p5Sp4Sp10Sp4SSp6SosspSSp3
4Aiaa8 = p4sppspsp18SssS4soSsp3SS
4Aiaa10 = pSppsp4Sp18SSsS4sSop4SS
5Aacab1 = pps3Spsppsp10Ssp3SssS6pspoS5
5Aacba1 = p5Sp4Sp10Sp4SSpS7ppSoS4
5Aacbb1 = p5Sppspsp10Ssp3SSppsSsS3ppSSoS3
5Aacbe1 = ppsSsSpsp13sp7sS4p4S3oSS
5Agaea1 = psppSppsp14sppsppS7pS6oS
5Agaea2 = p4Sspspsp12sppsppS7pS7o
---GRID_END---

---mini_tracker_end---
