# Module: lib

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
2Ad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messagingcontext.tsx
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/avatar-utils.ts
2Af3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/aws-config.ts
2Af4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo.d.ts
2Af5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Af7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/utils.ts
2Ai1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Ai2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Ai3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Aad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/setup-aws/page.tsx
3Aba4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/message-feed.tsx
3Aba5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/user-profile.tsx
3Abb12: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-tooltip.tsx
3Abb14: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/types.tsx
3Abb16: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/user-hover-card.tsx
3Abb5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/index.tsx
3Abb6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/message-dialog.tsx
3Abb7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-chat-integration.tsx
3Abb8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-dialog.tsx
3Abc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/chatwindow.tsx
3Abc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversationlist.tsx
3Abc9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-item.tsx
3Abe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/shell/dashboard-header.tsx
3Abf1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/avatar.tsx
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Ada3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/useconversations.ts
3Ada5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/usesocketevents.ts
3Afa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/announcements.ts
3Afa10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/spaces.ts
3Afa11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/users.ts
3Afa12: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/utils.ts
3Afa2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/client.ts
3Afa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/companies.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afa5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/index.ts
3Afa6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/invitations.ts
3Afa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/meetingnotes.ts
3Afa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/messages.ts
3Afa9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/operations.ts
3Afb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
3Aga2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/test-aws.ts
4Aabc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/floor-plan/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/update.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agac2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/create.ts
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/get.ts
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Agae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/remove-from-company.ts
4Agae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/update.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad2, 2Ad3, 2Af1, 2Af2, 2Af3, 2Af4, 2Af5, 2Af6, 2Af7, 2Ai1, 2Ai2, 2Ai3, 3Aad1, 3Aba4, 3Aba5, 3Abb5, 3Abb6, 3Abb7, 3Abb8, 3Abb12, 3Abb14, 3Abb16, 3Abc1, 3Abc2, 3Abc9, 3Abe1, 3Abf1, 3Ada1, 3Ada2, 3Ada3, 3Ada5, 3Afa1, 3Afa2, 3Afa3, 3Afa4, 3Afa5, 3Afa6, 3Afa7, 3Afa8, 3Afa9, 3Afa10, 3Afa11, 3Afa12, 3Afb1, 3Aga1, 3Aga2, 4Aabc2, 4Aafa1, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Aacbd1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Ai3 -> 2Ai2 (s)

---GRID_START---
X 2Ad2 2Ad3 2Af1 2Af2 2Af3 2Af4 2Af5 2Af6 2Af7 2Ai1 2Ai2 2Ai3 3Aad1 3Aba4 3Aba5 3Abb5 3Abb6 3Abb7 3Abb8 3Abb12 3Abb14 3Abb16 3Abc1 3Abc2 3Abc9 3Abe1 3Abf1 3Ada1 3Ada2 3Ada3 3Ada5 3Afa1 3Afa2 3Afa3 3Afa4 3Afa5 3Afa6 3Afa7 3Afa8 3Afa9 3Afa10 3Afa11 3Afa12 3Afb1 3Aga1 3Aga2 4Aabc2 4Aafa1 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbc1 5Aacbd1 5Aacbe1 5Agaea1 5Agaea2
2Ad2 = opsp3sppSSp3sp14spSpssp5sspSp3ssSSssSssSsSs3ppsppsppSs
2Ad3 = pop5sp3sppspSsp4S3ppS4p34sp6
2Af1 = spop4spssp20Sp15s3Ss4S3sps6pspsSS
2Af2 = p3op9s4ps4p3ssp19sp25
2Af3 = p4op7sp19sp12sppsp23
2Af4 = p5oSp28sp36
2Af5 = sp4Sop3sp21SppSsp3ssp3SppSSs4Ssp11sp4
2Af6 = pssp4op3Spsppssp4s3ppsSssp3sp3sp11s3pps4pssSSsSSpsSss
2Af7 = p8op63
2Ai1 = Spsp6osp32Sp13sSp10ssp
2Ai2 = Spsp3sppsosp3ssp3sp7sppspsspssSs4Ssp4ssppspsspsspsp5sppss
2Ai3 = psp5SppsopspsSSp4ssSppSSssp3sp27sspSp6
3Aad1 = p4sp7opsp9sp22sp24
3Aba4 = p3sp3sp3sposSs5SssSSp20Sp25
3Aba5 = sspsp8ssoSs4pSpsSSsspssp15SSp24
3Abb5 = p3sp6sspSSoS7sSSppspsp15Ssp24
3Abb6 = pSpsp3sppsSpssSoSSspsS3spS4p15sp25
3Abb7 = psp5sp3SpssSSoSs3S3spSSsSp15sp25
3Abb8 = p3sp9ssS3oS3s3Sp20Sp25
3Abb12 = p3sp9ssSssSosSpsSSsp19Sp25
3Abb14 = p3sp6sppspSpsSsosp24Sp25
3Abb16 = p3sp9S3ssSSsopsSSsp19Ssp24
3Abc1 = pSp5sp3spspS3sp3oSSppSsSsp41
3Abc2 = pSp5sp3sps3SSsspsSoSps3Ssp41
3Abc9 = pSp5sp3SsS5sSpS3oSpSsSSp15ssp21spp
3Abe1 = p3sp9S3ssSSpSppSosp3sp15Ssp24
3Abf1 = p3sp10sp4spspspsop19sp25
3Ada1 = pSp5sp3SppspSSp4SsSppoS3p34sp6
3Ada2 = pSp5SppsSp3sSSp4s3ppSoSSp3sp3sp22sSssSsppspp
3Ada3 = sSp5sp3sppspSsp4S3ppSSoSp16sp15spsp3spp
3Ada5 = pSp5sp3sppssSSp4ssSspS3op34sp3Spp
3Afa1 = SpSp7sp20osSSsS7pSSppssp3sp5sp7sp4
3Afa2 = p4spSp24sossSSs5ppsSppssp9sp7sp4
3Afa3 = sp9sp20SsoSsS7pSSppSSs8pSssp5sppss
3Afa4 = sp6sppssp16sppSsSosS6spsspps3ps4p3ssSssSssSspss
3Afa5 = p5sSp24sSssoSs5ppsp4sp9sp7sp4
3Afa6 = p6sp3sp20S5oS6pSSppsspps4p3Ssp6sppss
3Afa7 = p10sp20SsSSsSoS5pSsppssp9spsp5sp4
3Afa8 = p7sppSp17sppSsSSsSSoS3spsspps6ps3pSsspps3Sspss
3Afa9 = p10sp20SsSSsS3oS3pssppssppsppsp3ssp6sppsp
3Afa10 = sp5sp3sp20SsSSsS4oSSpSSppsspps10p5sppss
3Afa11 = sp5sp3sp20SsSSsS5oSpSSppSSpps7Ssp6sppss
3Afa12 = p10sp20SpSspSSsS3opsp27
3Afb1 = Sp8SSp32op9sp4Sp8sppsp
3Aga1 = p10sp20SsSssSSssSSspoSppS3s3S3ssSssppsppsspss
3Aga2 = p4spSp24S3spSs3SSppSoppS7sS6ppSppSSpSS
4Aabc2 = p3sp9S3ssS4ppsSsp19osp24
4Aafa1 = spsp9spSsp5sppssp3sp16sop24
4Agaa1 = spspspSp24ssSsps5SppSSppoS13ppSspSSsSS
4Agab1 = Spsp3Sp3sp20ssSs7SppSSppSoS12ssSppSSpSS
4Agab2 = SpSp3ssppsp22ssp3sp5SSppSSoS11spSspSSsSS
4Agab3 = spsp3ssp25sp4sp5sSppS3oS10ssSssSSsSS
4Agab4 = spsp3ssp25sspsps4ppsSppS4oS9ssSssSSsSS
4Agac1 = Spsp3sp3sp20spsspspspsspssSppS5oS8spSspSSsSS
4Agac2 = spsp3Sp26sspsp3ssppSSppS6osS6ppSppSSsSS
4Agad1 = spSp3ssppsp22sspsps4ppSsppS6soS6ssSs3SsSS
4Agae1 = SpSp4sppsp22sp4spssppSSppS8oS5ssSssSSsSS
4Agae2 = spSp4spsp23sp4spssppsSppS9oS4ssSSpS5
4Agae3 = Spsp4spSsp29sspSsSppS10oS3psSspSSsSS
4Agae4 = sp9sp20ssSssSsSssSppSSppS11oSSppSppSSpSS
4Agae5 = spsp4sp25sspsps4ppsSppS12oSssSspSSsSS
5Aacaa1 = spsp4sppsp17sp4sSppsspsp3sSppS13oS4sS5
5Aacab1 = ppsp4Sp3sp16Sp5sp14s5ps3ppsSoS4ssSss
5Aacac1 = ppsp4Sp3sp16ssp4sp14spsspps4psSSoS3psSss
5Aacad1 = spsp4sp20sp5Sp3sp5sSppS16oSsS5
5Aacba1 = pssp4Sp3Sp15sSssp3sp3sp9sps4pssSspsS4oSsS3s
5Aacbb1 = p7Sp20sp5sp3sp12ssppssp4sSSsSops4
5Aacbc1 = spsp3sp3sp20s3Ss3Ss3pssSppS7sS6spSspoSsSS
5Aacbd1 = p7sp26sp3sp5sSppS14ssSSsSoS3
5Aacbe1 = ppsp4Spsp14sp3ssSp17sps7SspsS5ssSoSS
5Agaea1 = SpSp4spssp22sspsps4pssSppS14ssSSsS3oS
5Agaea2 = spSp4sppsp22sspspspssppsSppS14ssSssS4o
---GRID_END---

---mini_tracker_end---
