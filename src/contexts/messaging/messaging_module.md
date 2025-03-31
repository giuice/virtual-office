# Module: messaging

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
2Aa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/layout.tsx
2Ad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/authcontext.tsx
2Ad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/companycontext.tsx
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usenotification.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ai2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Ai3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Aba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-members.tsx
3Aba2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-settings.tsx
3Aba3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/invite-user-dialog.tsx
3Aba4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/message-feed.tsx
3Aba5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/user-profile.tsx
3Abb5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/index.tsx
3Abb7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-chat-integration.tsx
3Abc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/chatwindow.tsx
3Abc10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/room-messaging.tsx
3Abc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversationlist.tsx
3Abc4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/messagelist.tsx
3Abc5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/roommessaging.tsx
3Abc7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-composer.tsx
3Abc9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-item.tsx
3Abd2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/search/global-search.tsx
3Abe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/shell/dashboard-header.tsx
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Ada3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/useconversations.ts
3Ada4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/usemessages.ts
3Ada5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/usesocketevents.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/messages.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Aaba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/company/page.tsx
4Aabb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/dashboard/page.tsx
4Aabd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/office/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Aa3, 2Ad1, 2Ad2, 2Ae1, 2Af6, 2Ai2, 2Ai3, 3Aba1, 3Aba2, 3Aba3, 3Aba4, 3Aba5, 3Abb5, 3Abb7, 3Abc1, 3Abc2, 3Abc4, 3Abc5, 3Abc7, 3Abc9, 3Abc10, 3Abd2, 3Abe1, 3Ada1, 3Ada2, 3Ada3, 3Ada4, 3Ada5, 3Afa4, 3Afa8, 4Aaaa1, 4Aaab1, 4Aaac1, 4Aaba1, 4Aabb1, 4Aabd1, 4Aafa1, 5Aacaa1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbe1
last_GRID_edit: Applied suggestion: 2Ai3 -> 2Ai2 (s)

---GRID_START---
X 2Aa3 2Ad1 2Ad2 2Ae1 2Af6 2Ai2 2Ai3 3Aba1 3Aba2 3Aba3 3Aba4 3Aba5 3Abb5 3Abb7 3Abc1 3Abc2 3Abc4 3Abc5 3Abc7 3Abc9 3Abc10 3Abd2 3Abe1 3Ada1 3Ada2 3Ada3 3Ada4 3Ada5 3Afa4 3Afa8 4Aaaa1 4Aaab1 4Aaac1 4Aaba1 4Aabb1 4Aabd1 4Aafa1 5Aacaa1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbe1
2Aa3 = ospsp3s7ppspsSSsSsps3pps4SSp7
2Ad1 = soSp4ssSpSp10spps3ppS3ppssp5s
2Ad2 = pSoppSps3psp13sppsps3pps3psp3
2Ae1 = sppoppsp3sp8sp4sppsp15
2Af6 = p4opSp3spps3p3sp3sSsSs3p7sSsS3
2Ai2 = ppSpposp5sp11sp3sSp7sp5
2Ai3 = p3sSsop3spsSsspssSsppSSs4p9spSpp
3Aba1 = s3p4oSSsSSsps3ps3Sppssp3S7p6
3Aba2 = s3p4SoSsSSsppsSssSsSpps3ppS7p6
3Aba3 = sSsp4SSopSsspps8ps3ppS3sS3p6
3Aba4 = sppssps3posSs4psSspSp3sp6sSsp7
3Aba5 = sSsp4S3soSspsSssSSsSsps3ppS7p6
3Abb5 = sp4ssSSsSSoSSssSsSSsSpspsspps4SSsp6
3Abb7 = sp3spSs5SoSSsS4ssSSsSSpps6p7
3Abc1 = p4spsp3spSSoS6spSsSSsp15
3Abc2 = p4spsspps3SSoSsSSsspssSSsp6sp8
3Abc4 = sp6s4SssSSoS3sS3pSSspps3pSsp7
3Abc5 = p6ssSspsS3sSosSSppSsS3ppssppssp7
3Abc7 = sp5sps5S4soSSspSssSSp4spsp8
3Abc9 = SppsspSs3S9oSsSSsS3p3sspSssp5s
3Abc10 = Sp5ssSssS4ssS3os3ppsspps4Sssp6
3Abd2 = sp6s3ps5Sps3oSp3sp3s7p6
3Abe1 = Ssp5SSsS3sppSppSsSop3ssppS6sp6
3Ada1 = sp3spSppspspSSsS4sppoS4p12spp
3Ada2 = p3sSsSp5sSssps3p3SoS3ssp7s3Sss
3Ada3 = s3psps4pspsS4sSp3SSoSSpps3ps3pspsps
3Ada4 = ssppSps7S7s3S3oSpps7p3sps
3Ada5 = sspsspspsspssSs3S3spsS4op3sppspsp3spS
3Afa4 = ppsps3p17sp3oSp7SsSssp
3Afa8 = p4sSp18sp3Sop7sps3p
4Aaaa1 = sSsp4S3pSssppssppssSppssp3oS6p5s
4Aaab1 = sSsp4S3pSssppssps3Spps3ppSoS5p5s
4Aaac1 = sSsp4S3pSssppsps4Sppssp3SSoS4p5S
4Aaba1 = sp6SSssSssp6ssSp3sp3S3oSSsp6
4Aabb1 = Sp6S6spsSssSSsSpps3ppS4oSSp6
4Aabd1 = Sssp4S3sSSsppssps3Sppssp3S5oSp6
4Aafa1 = pssp4S3pSsp6s4pps3ppS3sSSop6
5Aacaa1 = ppspssp18sp3Ssp7oS3sS
5Aacac1 = p4Spsp17ssppsp8SoS4
5Aacad1 = ppspsp19sp3Ssp7SSoSsS
5Aacba1 = p4SpSp16sSs5p7S3oSS
5Aacbb1 = p4Sp19sp3ssp7sSsSos
5Aacbe1 = psppSp14sp4s3SppssSp4S4so
---GRID_END---

---mini_tracker_end---
