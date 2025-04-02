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
2Ad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/authcontext.tsx
2Ad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/companycontext.tsx
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useconversations.ts
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usemessages.ts
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
2Af: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/avatar-utils.ts
2Af3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/aws-config.ts
2Af4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo.d.ts
2Af5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Af7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/utils.ts
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Aj3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Abb6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/message-dialog.tsx
3Abb14: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/types.tsx
3Abb15: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/user-avatar.tsx
3Abb16: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/user-hover-card.tsx
3Abc6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversation-list.tsx
3Abc8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-feed.tsx
3Abc9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-item.tsx
3Abf17: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/status-avatar.tsx
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Afa: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo
3Afa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/announcements.ts
3Afa2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/client.ts
3Afa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/companies.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afa5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/index.ts
3Afa6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/invitations.ts
3Afa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/meetingnotes.ts
3Afa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/messages.ts
3Afa9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/operations.ts
3Afa10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/spaces.ts
3Afa11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/users.ts
3Afa12: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/utils.ts
3Afb: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase
3Afb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Afc: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/supabase
3Afc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/supabase/client.ts
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
3Aga2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/test-aws.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iconversationrepository.ts
3Aib7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
3Aib10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/update.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/create.ts
4Agad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/delete.ts
4Agad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/get.ts
4Agad4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/update.ts
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Agae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/remove-from-company.ts
4Agae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/update.ts
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
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad1, 2Ad2, 2Ae1, 2Ae2, 2Ae5, 2Af, 2Af1, 2Af2, 2Af3, 2Af4, 2Af5, 2Af6, 2Af7, 2Aj1, 2Aj3, 2Aj4, 3Abb6, 3Abb14, 3Abb15, 3Abb16, 3Abc6, 3Abc8, 3Abc9, 3Abf17, 3Ada1, 3Ada2, 3Afa, 3Afa1, 3Afa2, 3Afa3, 3Afa4, 3Afa5, 3Afa6, 3Afa7, 3Afa8, 3Afa9, 3Afa10, 3Afa11, 3Afa12, 3Afb, 3Afb1, 3Afc, 3Afc1, 3Aga1, 3Aga2, 3Aib2, 3Aib3, 3Aib7, 3Aib10, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa3, 4Aiaa7, 4Aiaa10, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbd1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestions (2025-04-02T12:02:36.975125)

---GRID_START---
X 2Ad1 2Ad2 2Ae1 2Ae2 2Ae5 2Af 2Af1 2Af2 2Af3 2Af4 2Af5 2Af6 2Af7 2Aj1 2Aj3 2Aj4 3Abb6 3Abb14 3Abb15 3Abb16 3Abc6 3Abc8 3Abc9 3Abf17 3Ada1 3Ada2 3Afa 3Afa1 3Afa2 3Afa3 3Afa4 3Afa5 3Afa6 3Afa7 3Afa8 3Afa9 3Afa10 3Afa11 3Afa12 3Afb 3Afb1 3Afc 3Afc1 3Aga1 3Aga2 3Aib2 3Aib3 3Aib7 3Aib10 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa3 4Aiaa7 4Aiaa10 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbd1 5Aacbe1 5Agaea1 5Agaea2
2Ad1 = oSsp3Sp6Sp26Sp10sppsp5sSp15
2Ad2 = Sosp3sp3sppSSp12Spssp5ssppSp4sppSssSs3pps4SssppSsspsp4ss
2Ae1 = ssoSSp6sp3sSp3S3pSSp20sp20s5psspp
2Ae2 = ppSoSp6Sp4Sp3S3pSSp21Sp24ssp3
2Ae5 = ppSSop6sp3sSp3S3pSSp42sppspsSpp
2Af = p5op71
2Af1 = Ssp4op4spsp13Sp12Sp4spsSsS3ssSsS5ssps7pssSS
2Af2 = p7op8ssSsp3Sp53
2Af3 = p8op19sp15sp4sp27
2Af4 = p9oSp20sp45
2Af5 = psp7Sop17SppSsp3ssp6Sp4SSps3p22
2Af6 = ppsSspsp4op3Ssp3SSspsSp4sp3sp11SSppsps3pps5psSSpS8ss
2Af7 = p12op64
2Aj1 = SSp4sp6osp25Sp7Sppsspsp3s3Spsp3s4pps4
2Aj3 = pSp11sospsp7spspsspssSps3pSppsp17sppspSp9s
2Aj4 = ppspsp6SppsoSp3S3psSp4sp15SSp16sSppsppSssp3
3Abb6 = ppS3ppsp3sp3SopSsS3pSSp51
3Abb14 = p7sp6sppossp3Sp53
3Abb15 = p7Sp8SsoSSsSSp53
3Abb16 = p7sp8ssSoS4p53
3Abc6 = ppS3p6Sp3SSpSSoSSpSsp21sp29
3Abc8 = ppS3p6Sp3SSpsSSoSpSSp21sp29
3Abc9 = ppS3p6sp3SSpS4oSSsp47sspp
3Abf17 = p7Sp9S3ppSop53
3Ada1 = ppS3p6sp3sSp3S3poSp20ssp23spsp3
3Ada2 = ppS3p6SppsSSp3sSspSop4sp3sp11SSp16sSpsSssSSsspp
3Afa = p26op50
3Afa1 = pSp4Sp7sp12osSSsS7p4SSp4ssp3sp7sp14
3Afa2 = p8spSp16sossSSs5p5sSp4ssp11sp14
3Afa3 = psp12sp12SsoSsS7p4SSp4SSps3p4sspSsp3sp7ss
3Afa4 = psp9sppssp9spSsSosS6sp4sspsppssppssp7s3ppSssSs3pss
3Afa5 = p9sSp16sSssoSs5p5sp6sp11sp14
3Afa6 = p10sp3sp12S5oS6p4SSp4ssppssp7Ssp11ss
3Afa7 = p14sp12SsSSsSoS5p4Ssp4ssp11sp4sp9
3Afa8 = p11sppSp10spSsSSsSSoS3sp4ssp4ssps3p4sspSsp3spps4pss
3Afa9 = p27SsSSsS3oS3p4ssp4ssppsp8ssp11sp
3Afa10 = psp8sp3sp12SsSSsS4oSSp4SSp4ssppssp4s5p3sp7ss
3Afa11 = psp8sp3sp12SsSSsS5oSp4SSp4SSppssp4s3Ssp11ss
3Afa12 = p14sp12SpSspSSsS3op4sp33
3Afb = p39op37
3Afb1 = SSp4Sp6SSp25op10Sppsp5sSp5ssp6sp
3Afc = p41op35
3Afc1 = p42op34
3Aga1 = p14sp12SsSssSSssSSsp4oSp4SSps3p4SssSsp3sppsppspss
3Aga2 = p8spSp16S3spSs3SSp5Sop4SSpS3p4S5p3SppSppSpSS
3Aib2 = psp4sp38osSSpS4sppSsSSsSSssSs5p3Ss
3Aib3 = ppsp8Sp3Sp8sSp4sp14sosp16SSpS3sSSsp3
3Aib7 = p3Sppsp4Sp3Sp4ssppsSp19SsoppspsSp3SSssps3Sps3pSsspss
3Aib10 = pSp4Sp6Sp31SppopS5ssS7ppSs4p4SS
4Agaa1 = psp4spspSp16ssSsps5Sp5SSp4osSs3Sps3Ss3p3s5ps4
4Agab1 = psp4Sp3Ssp15ssSs7Sp5S3psSsoS13ssS6sSsSS
4Agab2 = sSp4Sp6sp26Sp4SppS3oS12ppS6pSsSS
4Agab3 = psp4Sp3sspsp15sp4sp8sSSpsSsSSoS12ssS7sSS
4Agab4 = psp4sp3ssp17sspsps4p5sSSpSSsS3oS10s3S7sSS
4Agac1 = ssp4sp3sspsp13spsspspspssppsppsSsppSsS4oS9spsS5sS4
4Agad1 = p6Sp41sS6oS8p3S5pS4
4Agad2 = p6sp41spS6oS7p3S4ppsS3
4Agad3 = psp4Sp4sp33SpSSsS7oS6sSsS7sSS
4Agad4 = psp4Sp4spsp31spSSsS8oS5pspS4ssS4
4Agae1 = psp4Sp4spsp15sp4spssp5S3psSsS9oS17
4Agae2 = ssp4Sp4spsp15sp4spssppsppsSSpsS12oS3ssS6sS4
4Agae3 = SSp4Sp4spSsp21ssppSppsSsppSsS11oS3sS11
4Agae4 = psp4sp20ssSssSsSssSp5S3psSsS12oSs3S4s4SS
4Agae5 = psp4sp4spsp15sspsps4p5sSSpsSsS13ospS6sSsSS
4Aiaa3 = p11Sppssp9sp4sp14sSsppspSssppspSsSssoS5sSSspSS
4Aiaa7 = p6sp4Sp3Sp9Sp19sSSppspssp3SsSs3pSosp4Ssspss
4Aiaa10 = pSp4sp7Sp30SppSpSSs3ppspS3sSSsop8SS
5Aacaa1 = pssp3sp4Spsp11sp3sSppsspsp3sppsSsSs3S15ppoS9
5Aacab1 = psspspsp4Spspsp9Sp4sp9sp4sSs3S15ppSoS8
5Aacac1 = ppsp3sp4Spsp11sp4sp14sSs3S15ppSSoS7
5Aacad1 = pssp3sp4Spsp11sp4Sp3sp8sSsspssS14sppS3oS6
5Aacba1 = ppspspsp4Sp3Sp8sSp4sp3sp10sSSpsS6pSsS3sS3pS4oS5
5Aacbb1 = p3sp7Sp3sp9Sp4sp3sp11SsppspSSsppSsSsSssSspS5oS4
5Aacbd1 = pps3psp4Spspsp6spssp4sp3sp8sSpsspsS6sS5sSsspS6oS3
5Aacbe1 = ppspSpsp4Spsp8sppsp23s5S3sS4ssp3S7oSS
5Agaea1 = psp4Sp4spsp15sspsps4ppsppsSSpsSsS15sS9oS
5Agaea2 = psp4Sp4spssp14sspspspssp5sSspsSsS15sS10o
---GRID_END---

---mini_tracker_end---
