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
2Aa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/layout.tsx
2Ad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/authcontext.tsx
2Ad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/companycontext.tsx
2Ad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messagingcontext.tsx
2Ad4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/searchcontext.tsx
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usenotification.ts
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Af5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Ai3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Aae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/test-aws/page.tsx
3Aba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-members.tsx
3Aba2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-settings.tsx
3Aba3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/invite-user-dialog.tsx
3Aba4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/message-feed.tsx
3Aba5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/user-profile.tsx
3Abb3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/roomscontext.tsx
3Abb6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/index.tsx
3Abb8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-chat-integration.tsx
3Abb9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-dialog.tsx
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
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Aaba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/company/page.tsx
4Aabb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/dashboard/page.tsx
4Aabd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/office/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/update.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Agad5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/update.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react/route.ts
5Agada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Aa3, 2Ad1, 2Ad2, 2Ad3, 2Ad4, 2Ae1, 2Ae2, 2Af5, 2Af6, 2Ag1, 2Ai3, 3Aae1, 3Aba1, 3Aba2, 3Aba3, 3Aba4, 3Aba5, 3Abb3, 3Abb6, 3Abb8, 3Abb9, 3Abc1, 3Abc2, 3Abc4, 3Abc5, 3Abc7, 3Abc9, 3Abc10, 3Abd2, 3Abe1, 3Ada1, 3Ada2, 3Ada3, 3Ada4, 3Ada5, 3Aga1, 4Aaaa1, 4Aaab1, 4Aaac1, 4Aaba1, 4Aabb1, 4Aabd1, 4Aafa1, 4Agab3, 4Agab4, 4Agac1, 4Agad3, 4Agad5, 5Aacab1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Agada1, 5Agada2
last_GRID_edit: Applied suggestion: 2Ai3 -> 2Af6 (S)

---GRID_START---
X 2Aa3 2Ad1 2Ad2 2Ad3 2Ad4 2Ae1 2Ae2 2Af5 2Af6 2Ag1 2Ai3 3Aae1 3Aba1 3Aba2 3Aba3 3Aba4 3Aba5 3Abb3 3Abb6 3Abb8 3Abb9 3Abc1 3Abc2 3Abc4 3Abc5 3Abc7 3Abc9 3Abc10 3Abd2 3Abe1 3Ada1 3Ada2 3Ada3 3Ada4 3Ada5 3Aga1 4Aaaa1 4Aaab1 4Aaac1 4Aaba1 4Aabb1 4Aabd1 4Aafa1 4Agab3 4Agab4 4Agac1 4Agad3 4Agad5 5Aacab1 5Aacba1 5Aacbb1 5Aacbc1 5Agada1 5Agada2
2Aa3 = osp3sp6s5pssSppspsSSsSspsspps4SSp12
2Ad1 = soSp3sppSppssSpSp12spps3pS3ppssppssp5sp
2Ad2 = pSopspsspspps3psp15spps4pps4SSsp3sSs
2Ad3 = p3op4spsp5sppspS6sppS5p14sp4
2Ad4 = ppspop12sp10sp19sp5
2Ae1 = sp4op4sp4sp10sp4sp22
2Ae2 = pssp3oppsp3sspsp12sp6S4sSsp11
2Af5 = ppsp4op27Sp7s5p3s3
2Af6 = p3sp4opSp4sp5ssp3sp3sS3sp8sspssS3pss
2Ag1 = pSsp3sppopps3pspsp9ssp6S3ssSsp3sp7
2Ai3 = p3spsppSpop4sppsspsspssSsppSSs3p13sSp4
3Aae1 = p11op4sp16spps3p3Sp11
3Aba1 = s3p6sppoSSsSpSsSps3ps3SppssppS7p11
3Aba2 = s3p3sppsppSoSsSpSsSppsSssSsSpps3pS7p11
3Aba3 = sSsp3sppsppSSopSps3pps8ps3pS3sS3p11
3Aba4 = sp4sppspspsspospSs5psSspSp3sp5sSsp12
3Aba5 = sSssppsppspsS3sopSsspsSssSSsSspsSspS7p11
3Abb3 = p4sp12ossp4sp29
3Abb6 = sp8sspSSsSSsoS3ssSsSSsSpspspps4SSsp11
3Abb8 = sppsp6sps6SoS3sS4ssSSsSsps6p12
3Abb9 = Sp11SSs3pSSos6S3p3spps4Sssp11
3Abc1 = p3Sp4spsp4sppSSsoS6spSssSsp19
3Abc2 = p3Sp4spspsppsspsSsSoSsSSsspssSSsp5sp13
3Abc4 = sppSp8s4Sps3SSoS3sS3pSSsps3pSsp12
3Abc5 = p3Sp6spsSspssSSsSsSosSSppSsSSspssppssp12
3Abc7 = sppSp6spps4psSsS3soSSspSssSSp3spsp13
3Abc9 = SppSpsppspSps3SSpSSsS5oSsSSsS3ppsspSssp11
3Abc10 = Sppsp6spsSssSpS4ssS3os3ppspps4Sssp11
3Abd2 = sp3sp4spps3pspssSssSps3oSp3spps7p11
3Abe1 = Ssp4sppsppSSsSSpSsSppSppSsSop3sppS6sp11
3Ada1 = sppSp4spSp3spsppSpSsS4sppoS4p14sp4
3Ada2 = p3SpsppSpSp7sSpssps3p3SoS3p13sSsp3
3Ada3 = s3Sp4Spsps3psppspsS3sSp3SSoSSps3ps3p5ssp4
3Ada4 = sspSp4Sps6SpsSsS6s3S3oSps7p6sp4
3Ada5 = pspSp4spsppsspsppsps4SSp3S4oppsppspsp6sp4
3Aga1 = ppsp4Sp27op7s5p3s3
4Aaaa1 = sSsp3SppSpsS3pSps3ppssppssSppssppoS6p11
4Aaab1 = sSsp3SppSpsS3pSps3ppssps3Spps3pSoS5sp10
4Aaac1 = sSsp3SppSpsS3pSps3ppsps4SppssppSSoS4p9sp
4Aaba1 = sp5SppsppSSssSps3p6ssSp3sppS3oSSsp11
4Aabb1 = Sp5sppsppS5pSsSpsSssSSsSpps3pS4oSSp11
4Aabd1 = Sssp3SppSppS3sSpSssppssps3SppssppS5oSp11
4Aafa1 = pssp3sppspS4pSpspsp5s4pps3pS3sSSop11
4Agab3 = ppsp4ssp26spsp5oS4s4SS
4Agab4 = ppsp4ssp26sp7SoS3s3S3
4Agac1 = psSp4sp27sp7SSoSSpspS3
4Agad3 = psSp4s3p25sp7S3oSsspS3
4Agad5 = ppsp4ssp26sp7S4osspS3
5Aacab1 = p4sp3Spsp20ssp10sspssoSSpss
5Aacba1 = p3sp4SpSp19sSs3p8s5SoS3s
5Aacbb1 = p8Sp22sp11ssp3SSos3
5Aacbc1 = ppsp4sp27sp7sS4pSsoSS
5Agada1 = psSp4ssp26sppsp4S5sSsSoS
5Agada2 = ppsp4ssp26sp7S5s3SSo
---GRID_END---

---mini_tracker_end---
