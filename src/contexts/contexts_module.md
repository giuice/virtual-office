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
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ai2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Ai3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Aba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-members.tsx
3Aba2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-settings.tsx
3Aba3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/invite-user-dialog.tsx
3Aba4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/message-feed.tsx
3Aba5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/user-profile.tsx
3Abb3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/roomscontext.tsx
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
3Afa11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/users.ts
3Afa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/companies.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/messages.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Aaba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/company/page.tsx
4Aabb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/dashboard/page.tsx
4Aabd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/office/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/update.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agac2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/create.ts
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/get.ts
4Agae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Agae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/remove-from-company.ts
4Agae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/update.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Aa3, 2Ad1, 2Ad2, 2Ad3, 2Ad4, 2Ae1, 2Ae2, 2Af1, 2Af6, 2Ai2, 2Ai3, 3Aba1, 3Aba2, 3Aba3, 3Aba4, 3Aba5, 3Abb3, 3Abb5, 3Abb7, 3Abc1, 3Abc2, 3Abc4, 3Abc5, 3Abc7, 3Abc9, 3Abc10, 3Abd2, 3Abe1, 3Ada1, 3Ada2, 3Ada3, 3Ada4, 3Ada5, 3Afa3, 3Afa4, 3Afa8, 3Afa11, 4Aaaa1, 4Aaab1, 4Aaac1, 4Aaba1, 4Aabb1, 4Aabd1, 4Aafa1, 4Agaa1, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 5Aacaa1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Ai3 -> 2Ai2 (s)

---GRID_START---
X 2Aa3 2Ad1 2Ad2 2Ad3 2Ad4 2Ae1 2Ae2 2Af1 2Af6 2Ai2 2Ai3 3Aba1 3Aba2 3Aba3 3Aba4 3Aba5 3Abb3 3Abb5 3Abb7 3Abc1 3Abc2 3Abc4 3Abc5 3Abc7 3Abc9 3Abc10 3Abd2 3Abe1 3Ada1 3Ada2 3Ada3 3Ada4 3Ada5 3Afa3 3Afa4 3Afa8 3Afa11 4Aaaa1 4Aaab1 4Aaac1 4Aaba1 4Aabb1 4Aabd1 4Aafa1 4Agaa1 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agae2 4Agae3 4Agae4 4Agae5 5Aacaa1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbc1 5Aacbe1 5Agaea1 5Agaea2
2Aa3 = osp3sp5s5pssppspsSSsSsps3p4s4SSp20
2Ad1 = soSp3sp4ssSpSp11spps3p4S3ppssp3sp3sp8ssp
2Ad2 = pSopspsspSps3pssp13sppssps4pps5Ss3Ss3psppspSs
2Ad3 = p3op4spsp4sppsS6sppS5p24sp5
2Ad4 = ppspop11sp9sp28sp7
2Ae1 = sp4op4sp3sp9sp4sppsp30
2Ae2 = pssp3op5sspsp11sp9S4sSsp16spp
2Af1 = ppsp4osp34s5pSSspsps3ppsSS
2Af6 = p3sp3sopSp3sp3s3p3sp3sSsSspssp9sspps3pssSsSSpSss
2Ai2 = ppSp6osp6sp11sp3ssSsp10spspsspsp4spss
2Ai3 = p3spsppSsop3sppsSsspssSsppSSs3psp20spSp5
3Aba1 = s3p8oSSsSpSsps3ps3Sppssp5S7p19
3Aba2 = s3p3sp4SoSsSpSsppsSssSsSpps3p4S7p19
3Aba3 = sSsp3sp4SSopSpsspps8ps3p4S3sS3p19
3Aba4 = sp4sppsps3pospSs4psSspSp3sp8sSsp20
3Aba5 = sSssppsp4S3sopSspsSssSSsSsps3p4S7p19
3Abb3 = ppspsp11ossp3sp40
3Abb5 = sp8ssSSsSSsoSSssSsSSsSpspssp4s4SSsp19
3Abb7 = sppsp4spSs6SoSSsS4ssSSsSSp4s6p20
3Abc1 = p3Sp4spsp3sppSSoS6spSsSSsp30
3Abc2 = p3Sp4spssppsspsSSoSsSSsspssSSsp8sp21
3Abc4 = sppSp7s4SpssSSoS3sS3pSSsp4s3pSsp20
3Abc5 = p3Sp6ssSspssS3sSosSSppSsS3p4ssppssp20
3Abc7 = sppSp6sps4psS4soSSspSssSSp6spsp21
3Abc9 = SppSpsppspSs3SSpS7oSsSSsS3p5sspSssp16spp
3Abc10 = Sppsp6ssSssSpS3ssS3os3ppssp4s4Sssp19
3Abd2 = sp3sp6s3psps4Sps3oSp3sp5s7p19
3Abe1 = Ssp4sp4SSsSSpSsppSppSsSop3ssp4S6sp19
3Ada1 = sppSp4spSppspsppSSsS4sppoS4p24sp5
3Ada2 = p3SpsppSsSp6sSssps3p3SoS3pssp18s3Sspspp
3Ada3 = s3Sp4sps4psppsS4sSp3SSoSSp4s3ps3p11spsppspp
3Ada4 = sspSp4Sps6psS7s3S3oSp4s7p13sppspp
3Ada5 = sspSpsppspspsspspsSs3S3spsS4op5sppspsp13sppSpp
3Afa3 = ppsp6sp23oS3p7Ss6pSssp4spss
3Afa4 = ppsp5s3p18sp3SoSSp7sps4ppssSsSssSpss
3Afa8 = p8sSp19sp3SSoSp7s4psspSssps3Spss
3Afa11 = ppsp6sp23S3op7Sps6Ssp5spss
4Aaaa1 = sSsp3Sp4S3pSpssppssppssSppssp5oS6p16spp
4Aaab1 = sSsp3Sp4S3pSpssppssps3Spps3p4SoS5psp14spp
4Aaac1 = sSsp3Sp4S3pSpssppsps4Sppssp5SSoS4p6sp9Ssp
4Aaba1 = sp5Sp4SSssSpssp6ssSp3sp5S3oSSsp19
4Aabb1 = Sp5sp4S5pSspsSssSSsSpps3p4S4oSSp19
4Aabd1 = Sssp3Sp4S3sSpSsppssps3Sppssp5S5oSp19
4Aafa1 = pssp3ssp3S3pSpsp6s4pps3p4S3sSSop19
4Agaa1 = ppsp4sp25SssSp7oS10pSspSsSS
4Agab3 = ppsp4ssp24spsppsp5SoS9sSssSsSS
4Agab4 = ppsp4ssp24s4p7SSoS8sSssSsSS
4Agac1 = psSp4spsp23s4p7S3oS7pSspSsSS
4Agac2 = ppsp30sspsp7S4osS5pSppSsSS
4Agad1 = ppsp4Sssp23s4p7S4soS5sSps3SS
4Agae2 = ppsp4Ssp24spssppsp4S6oS4sSSpS4
4Agae3 = psSp4s3p26sp7S7oS3sSspSsSS
4Agae4 = ppsp6sp23SsSSp7S8oSSpSppSpSS
4Agae5 = ppsp4ssp24s4p7S9oSsSspSsSS
5Aacaa1 = ppsp5ssp19sp3sSsp8S10oS3sS4
5Aacac1 = p4sppsSpsp18ssp3sp10sspps3psSoS3pSss
5Aacad1 = ppsp4ssp20sp4Ssp8S12oSsS4
5Aacba1 = p3sp3sSpSp17sSs3pssp8s4ppSspsS3oSsSSs
5Aacbb1 = p8Sp20sp4ssp9ssppsp4sSsSos4
5Aacbc1 = ppsp6sp23sSSsp7S5sS5pSssosSS
5Aacbe1 = psp4ssSp15sp4s3Sp4ssSp4s6SspsS4ssoSS
5Agaea1 = psSp4Sssp23s4ppsp4S11sSSsSSoS
5Agaea2 = ppsp4Sssp23s4p7S11sSssS3o
---GRID_END---

---mini_tracker_end---
