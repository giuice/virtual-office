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
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useconversations.ts
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
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
3Afc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/supabase/client.ts
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
3Aga2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/test-aws.ts
3Aib1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iannouncementrepository.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iconversationrepository.ts
3Aib5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imeetingnoterepository.ts
3Aib6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
3Aib7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacerepository.ts
3Aib8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Aabc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/floor-plan/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/update.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agac2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/create.ts
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
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad2, 2Ae1, 2Ae5, 2Af1, 2Af2, 2Af3, 2Af4, 2Af5, 2Af6, 2Af7, 2Aj1, 2Aj3, 2Aj4, 3Aad1, 3Aba4, 3Aba5, 3Abb5, 3Abb6, 3Abb7, 3Abb8, 3Abb12, 3Abb14, 3Abb16, 3Abc1, 3Abc2, 3Abc9, 3Abe1, 3Abf1, 3Ada1, 3Ada2, 3Afa1, 3Afa2, 3Afa3, 3Afa4, 3Afa5, 3Afa6, 3Afa7, 3Afa8, 3Afa9, 3Afa10, 3Afa11, 3Afa12, 3Afb1, 3Afc1, 3Aga1, 3Aga2, 3Aib1, 3Aib2, 3Aib3, 3Aib5, 3Aib6, 3Aib7, 3Aib8, 4Aabc2, 4Aafa1, 4Agaa1, 4Agab1, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa1, 4Aiaa2, 4Aiaa3, 4Aiaa4, 4Aiaa6, 4Aiaa7, 4Aiaa8, 4Aiaa9, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbd1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Aj4 -> 2Ae5 (s)

---GRID_START---
X 2Ad2 2Ae1 2Ae5 2Af1 2Af2 2Af3 2Af4 2Af5 2Af6 2Af7 2Aj1 2Aj3 2Aj4 3Aad1 3Aba4 3Aba5 3Abb5 3Abb6 3Abb7 3Abb8 3Abb12 3Abb14 3Abb16 3Abc1 3Abc2 3Abc9 3Abe1 3Abf1 3Ada1 3Ada2 3Afa1 3Afa2 3Afa3 3Afa4 3Afa5 3Afa6 3Afa7 3Afa8 3Afa9 3Afa10 3Afa11 3Afa12 3Afb1 3Afc1 3Aga1 3Aga2 3Aib1 3Aib2 3Aib3 3Aib5 3Aib6 3Aib7 3Aib8 4Aabc2 4Aafa1 4Agaa1 4Agab1 4Agab3 4Agab4 4Agac1 4Agac2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa1 4Aiaa2 4Aiaa3 4Aiaa4 4Aiaa6 4Aiaa7 4Aiaa8 4Aiaa9 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbd1 5Aacbe1 5Agaea1 5Agaea2
2Ad2 = ospsp3sppSSp3sp14Spssp5sspSp4sp4Sps11Sssp6spsspsp4ss
2Ae1 = soSp5sp3sppspSsp4S3ppSSp18spsp3sp21s5psspp
2Ae5 = pSop5sp3sppssSSp4ssSspSSp20sp26sppspsSpp
2Af1 = sppop4spsp19Sp16sp3sSpssSSs3S5s4pspssps5pssSS
2Af2 = p4op9s4ps4p3ssp25sp32
2Af3 = p5op7sp17sp13sp9sp30
2Af4 = p6oSp26sp51
2Af5 = sp5Sop23SppSsp3ssp4Sp9SSs3Sp25
2Af6 = ps3p4op3Spsppssp4s3ppsSp3sp3sp8spSsSp5s4ps5psspSpSp3S8ss
2Af7 = p9op76
2Aj1 = Sppsp6osp30Sp9Sp4spspps3Spsp6sps4pps4
2Aj3 = Sp9sosp3sp4sp7sspsspssSps3Spsp7sp12sp19s
2Aj4 = pssp5SppsopspsSSp4ssSppsSp3sp14SsSp19spSp4sppSssp3
3Aad1 = p5sp7opsp9sp28sp31
3Aba4 = p4sp3sp3sposSs5SssSSp23sppSp32
3Aba5 = s3psp8ssoSs4pSpsSSssp24SSp31
3Abb5 = ppspsp6sspSSoS7sSSppsp23Ssp31
3Abb6 = pSSpsp3sp3SpssSoSSspsS3spSSp20sppsp32
3Abb7 = psSp5sp3SpssSSoSs3S3spSSp20sppsp32
3Abb8 = p4sp9ssS3oS3s3Sp26Sp32
3Abb12 = p4sp9ssSssSosSpsSSsp25Sp32
3Abb14 = p4sp6sppspSpsSsosp30Sp32
3Abb16 = p4sp9S3ssSSsopsSSsp25Ssp31
3Abc1 = pSsp5sp3spspS3sp3oSSppSsp20sp35
3Abc2 = pSsp5sp3sps3SSsspsSoSpsSsp18spsp35
3Abc9 = pSSp5sp3SsS5sSpS3oSpSsp20sppssp27sspp
3Abe1 = ppspsp9S3ssSSpSppSosp25Ssp31
3Abf1 = p4sp10sp4spspspsop25sp32
3Ada1 = pSSp5sp3sppspSSp4S3ppoSp18spsp29spsp3
3Ada2 = pSSp5SppsSp3sSSp4s3ppSop3sp3sp10SsSp19spSp3sSssSSsspp
3Afa1 = SppSp7sp18osSSsS7ppSSsp8ssppsp6sp19
3Afa2 = p5spSp22sossSSs5p3sSp9ssp9sp19
3Afa3 = sp10sp18SsoSsS7ppSSp9SSs4ppsspSsp8sp7ss
3Afa4 = sp7sppssp16sSsSosS6sppssppspsp4ssps3p5ssppspsp3SssSs3pss
3Afa5 = p6sSp22sSssoSs5p3sp11sp9sp19
3Afa6 = p7sp3sp18S5oS6ppSSp9ssps3p5Ssp16ss
3Afa7 = p11sp18SsSSsSoS5ppSsp3sp5ssp9sp9sp9
3Afa8 = p8sppSp17sSsSSsSSoS3sppssp9s5p3sspSsp8spps4pss
3Afa9 = p30SsSSsS3oS3ppssp9sspsp7ssp16sp
3Afa10 = sp6sp3sp18SsSSsS4oSSppSSp9ssps3pps5p8sp7ss
3Afa11 = sp6sp3sp18SsSSsS5oSppSSp9SSps3pps3Ssp16ss
3Afa12 = p11sp18SpSspSSsS3oppsp41
3Afb1 = Sp9SSp30op9sp6sp5Sp10ssp6sp
3Afc1 = p43op25sp5sp10
3Aga1 = p11sp18SsSssSSssSSsppoSp9SSs3SppSssSsp8sppsppspss
3Aga2 = p5spSp22S3spSs3SSp3Sop9S6ppS5p8SppSppSpSS
3Aib1 = p8sp21sp15oS3sSsp3s3ppspsp4Ss5p4spssp4
3Aib2 = sppsp42Sos3SSp3S3ssSsSSsSSsSsSpsSps5p3Ss
3Aib3 = psp6Sp3Sp11sp3sSp3sp12SsoSSsp18SpSp3S3sSSsp3
3Aib5 = p8sp3sp16sp6sp9SsSosSsp5sppsp6sps3p7ssp4
3Aib6 = pssp5Sp3Spsppssp4s3ppsSp3sp12ssSsosp18spSp3s4SSspps
3Aib7 = p3sp42SSsSsoSp3ssSppSSsspssSs3pSp7sppss
3Aib8 = SppSp6Ssp30sp3sSpspSop3S4sS7sSsSpsSs6pspSS
4Aabc2 = p4sp9S3ssS4ppsSsp25osp31
4Aafa1 = sspsp9spSsp5sppssp26sopssp8sp19
4Agaa1 = sppspspSp22ssSsps5Sp3SSp9os8Ss3p8s5ps4
4Agab1 = sppSp3Ssp21ssSs7Sp3SSsSp3sSpssoS11sSsspsspS5sSsSS
4Agab3 = sppSp3sspsp21sp4sp6sSsSp3sSpssSoS13s4pS7sSS
4Agab4 = sppsp3ssp23sspsps4p3sSsSpspSSppsSSoS11sSs3pS7sSS
4Agac1 = sppsp3sspsp19spsspspspsspspsSpsp4SppsS3oS8s3SppspS5sS4
4Agac2 = sppsp3Sp24sspsp3ssp3SSpsp4sppsS4oS7pspSppspS5sS4
4Agad3 = sppSp4sp37sSpspSSppsS5oS7s3pSspS7sSS
4Agad4 = sppSp4spsp36sp3SSppsS6oS5sspspsspS4ssS4
4Agae1 = sppSp4spsp21sp4spssp3SSsSp3sSppsS7oS8sSSpS10
4Agae2 = sppSp4spsp21sp4spssp3sSpSp3sSppS9oS3sSsSpsSpS5sS4
4Agae3 = SppSp4spSsp27sspSpsSpsp4SppsS9oSSssSspsSpS10
4Agae4 = sppsp26ssSssSsSssSp3SSpSp3sSpssS10oSs4psspS4s4SS
4Agae5 = sppsp4spsp21sspsps4p3sSpSp3sSppsS11os4ppSpS5sSsSS
4Aiaa1 = p3sp4sp37SspspSsp3sSSspSsSs4oS6ppsspsSppss
4Aiaa2 = p3sp39sppsSp3sSp3S3s4SSs3SoSSsSSspsp6Ss
4Aiaa3 = p8Sp3sp16sp3sp12ssSs4p3sSsspspSsSssSSoS4pS3sSSspSS
4Aiaa4 = p3sp42sSpspsSp3ssS3ssSSs3S3osSSps3psp3Ss
4Aiaa6 = p8Sp3Sp16Sp3sp12spSsSp6ssp4sp4SsSsossps4SSspss
4Aiaa7 = p3sp42ssp3Ssp3s3ppSsSs3pS4soSp6sppss
4Aiaa8 = sppsp6sp36Sp4Sp3s7S3sS5sSospssp5SS
4Aiaa9 = p43sp8sp16sp4sop8sp
5Aacaa1 = sspsp4Spsp18sppsSppsspsppspsSpsSpspsppsS12ppSssp3oS9
5Aacab1 = s4p4Spspsp16Sp3sp8sp4sSpspsppsS12ssSsspspSoS8
5Aacac1 = pspsp4Spsp18sp3sp12ssSpspsppsS12spSsspspSSoS7
5Aacad1 = sspsp4Spsp18sp3Sp3sp6sSpsspspsppsS12ppspsp3S3oS6
5Aacba1 = ps3p4Sp3Sp15sSp3sp3sp8ssSsSpsppsS6sS3sSspSsSp3S4oS5
5Aacbb1 = p8Sp3sp16Sp3sp3sp8spSsSsp4sSSssSsSsSssSpSpSsppS5oS4
5Aacbd1 = ps3p4Spspsp12sppssp3sp3sp6sSppspspsppsS10sSppspsp3S6oS3
5Aacbe1 = psSsp4Spsp14sp3sp25s4SSsS4ssp8S7oSS
5Agaea1 = sppSp4spsp21sspsps4pspsSpSp3sSppsS12sS3ssSsS8oS
5Agaea2 = sppSp4spssp20sspspspssp3sSpsppssSppsS12ssSs3SpS9o
---GRID_END---

---mini_tracker_end---
