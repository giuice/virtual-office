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
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useconversations.ts
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usemessages.ts
2Ae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usenotification.ts
2Ae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Aj2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/common.ts
2Aj3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Aba4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/message-feed.tsx
3Abb13: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/types.ts
3Abb14: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/types.tsx
3Abb5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/index.tsx
3Abc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/chatwindow.tsx
3Abc10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/room-messaging.tsx
3Abc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversationlist.tsx
3Abc5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/roommessaging.tsx
3Abc7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-composer.tsx
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Afa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/announcements.ts
3Afa10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/spaces.ts
3Afa11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/users.ts
3Afa12: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/utils.ts
3Afa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/companies.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afa6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/invitations.ts
3Afa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/meetingnotes.ts
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
3Aib5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imeetingnoterepository.ts
3Aib8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/create.ts
4Agad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/delete.ts
4Agad4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/update.ts
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Agae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/update.ts
4Aiaa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseconversationrepository.ts
4Aiaa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseuserrepository.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ae1, 2Ae2, 2Ae3, 2Ae4, 2Ae5, 2Af1, 2Ag1, 2Aj1, 2Aj2, 2Aj3, 2Aj4, 3Aba4, 3Abb5, 3Abb13, 3Abb14, 3Abc1, 3Abc2, 3Abc5, 3Abc7, 3Abc10, 3Ada1, 3Ada2, 3Afa1, 3Afa3, 3Afa4, 3Afa6, 3Afa7, 3Afa10, 3Afa11, 3Afa12, 3Aga1, 3Aib5, 3Aib8, 4Aaaa1, 4Aaab1, 4Aaac1, 4Agab3, 4Agac1, 4Agad1, 4Agad2, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae5, 4Aiaa3, 4Aiaa8, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacbb1, 5Aacbc1, 5Aacbd1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Aj4 -> 2Ae5 (s)

---GRID_START---
X 2Ae1 2Ae2 2Ae3 2Ae4 2Ae5 2Af1 2Ag1 2Aj1 2Aj2 2Aj3 2Aj4 3Aba4 3Abb5 3Abb13 3Abb14 3Abc1 3Abc2 3Abc5 3Abc7 3Abc10 3Ada1 3Ada2 3Afa1 3Afa3 3Afa4 3Afa6 3Afa7 3Afa10 3Afa11 3Afa12 3Aga1 3Aib5 3Aib8 4Aaaa1 4Aaab1 4Aaac1 4Agab3 4Agac1 4Agad1 4Agad2 4Agad4 4Agae1 4Agae2 4Agae3 4Agae5 4Aiaa3 4Aiaa8 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacbb1 5Aacbc1 5Aacbd1 5Aacbe1 5Agaea1 5Agaea2
2Ae1 = oSppSp5ssp3S3spSSp11ssp12s4ppsspp
2Ae2 = SoppSpsspps3ppS4sSSp11s4psppsp5sps3psspp
2Ae3 = ppopsp5ssp9sp35
2Ae4 = p3oppssp25S3spsppsp5spssppsspp
2Ae5 = SSspop5spsppssSSsSSp12sp13sp4sSpp
2Af1 = p5ossp24Sp3SsS6sps5ppssSS
2Ag1 = pspspsosp4sp20S3psp5sp5sp4spp
2Aj1 = pspspssopsp22Ss10Ssps5ps5
2Aj2 = p8op42sp5
2Aj3 = p7spospsSsp6s10psp10sp12s
2Aj4 = s3psp4sos3ps6Sppsp6sp13sppsppspsp3
3Aba4 = s3p7soSps3pssp37
3Abb5 = psppspsppssSoS3sSsSpsp11s3p21
3Abb13 = p9SspSoSp42
3Abb14 = p9spsSSop42
3Abc1 = SSppsp5ssSppoS5sp35
3Abc2 = SSppsp5s3ppSosSsSsp35
3Abc5 = SSppSp5spSppSsosSSsp11ssp22
3Abc7 = sSppSp5s3ppSSsoSSsp13sp21
3Abc10 = psppsp5ssSppSsSSosp12s3p21
3Ada1 = SSppSp5sp4S4soSp35
3Ada2 = SSspSp4sSpspps4pSoppsp6sp13spsSssSpsspp
3Afa1 = p9sp12oS8p21sp4
3Afa3 = p9sp12SoS7p6ssppssp9sppss
3Afa4 = p9ssp10sSSoS4ssp6ssp6spSsspsSppss
3Afa6 = p9sp12S3oS5p6ssp13sppss
3Afa7 = p9sp12S4oS4sp20sp4
3Afa10 = p9sp12S5oS3p7spps3p8sppss
3Afa11 = p9sp12S6oSSp6sspps3p8sppss
3Afa12 = p9sp12SSsS4osp26
3Aga1 = p9sp12SSsS4sop6sSppSssp3sp4sppss
3Aib5 = p10sp10sp4sp4osp12sp5sp5
3Aib8 = p5SpSpsp21sop3SSssS5sSs4ppspSS
4Aaaa1 = sspSppSsp4sp4spsp13oSSsp4sp12spp
4Aaab1 = sspSspSsp4sp4spsp13SoSspsppspsp3s4pps3p
4Aaac1 = pspSppSsp4sp5ssp13SSopsspps3p3s4ppsSsp
4Agab3 = pspspSpsp24SsspoS9sS5pSsSS
4Agac1 = p5s3p15s3ppspspSppsSoS7ssS4sS5
4Agad1 = pspspSpsp15s3psspSpspssSSoS6psS4ssS4
4Agad2 = p5Spsp24sp3S3oS5ppS4ppsS3
4Agad4 = p5Spsp24Sp3S4oS4psS4ssS4
4Agae1 = pspspSpsp15sp3sspSpSs3S5oS10sS4
4Agae2 = p5Spsp15sp3sspspSppsS6oSSsS5ssS4
4Agae3 = p5SsSpsp17sspspSpssS7oS13
4Agae5 = p5spsp24Sp3S8osS5ssSsSS
4Aiaa3 = p10sp10sppsp6ssp3Ssp3SsSsoS4sSpspSS
4Aiaa8 = p5spsp24Sp3s3psS5opssp5SS
5Aacaa1 = sspspspsp13sppSp5spspssS10poS9
5Aacab1 = sp3sspsppsp10Sppsp7spssS10sSoS8
5Aacac1 = sspsps3p13sppsp7spssS10sSSoS7
5Aacad1 = sspspspsp13sp10spssS9spS3oS6
5Aacbb1 = psp6spsp10Sppsp6sp4SsspsSsSsSpS4osS4
5Aacbc1 = p7sp14ssSs4psp6Ssps3SsppS4soSSss
5Aacbd1 = ssps3psppsp10sp10spssS3sS5spS6oS3
5Aacbe1 = sspsSs3p13sp11ssSsS7sppS7oSS
5Agaea1 = p5Spsp15s3psspspSpssS16sSSoS
5Agaea2 = p5Spspsp13s3psspspSp3S16sS3o
---GRID_END---

---mini_tracker_end---
