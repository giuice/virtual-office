# Module: api

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
2Ae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/aws-config.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Aj3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
3Afa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/announcements.ts
3Afa10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/spaces.ts
3Afa12: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/utils.ts
3Afa2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/client.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afa5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/index.ts
3Afa6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/invitations.ts
3Afa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/meetingnotes.ts
3Afa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/messages.ts
3Afa9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/operations.ts
3Afb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
3Aga2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/test-aws.ts
3Aib1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iannouncementrepository.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iinvitationrepository.ts
3Aib5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imeetingnoterepository.ts
3Aib6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
3Aib7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacerepository.ts
3Aib8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Aabd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/office/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
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
5Aacbc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad1, 2Ad2, 2Ae4, 2Af1, 2Af3, 2Af6, 2Ag1, 2Aj1, 2Aj3, 3Afa1, 3Afa2, 3Afa4, 3Afa5, 3Afa6, 3Afa7, 3Afa8, 3Afa9, 3Afa10, 3Afa12, 3Afb1, 3Aga1, 3Aga2, 3Aib1, 3Aib2, 3Aib4, 3Aib5, 3Aib6, 3Aib7, 3Aib8, 4Aaaa1, 4Aaab1, 4Aaac1, 4Aabd1, 4Aafa1, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa1, 4Aiaa2, 4Aiaa3, 4Aiaa4, 4Aiaa5, 4Aiaa6, 4Aiaa7, 4Aiaa8, 4Aiaa9, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Aacbd1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Aj1 -> 2Ae4 (s)

---GRID_START---
X 2Ad1 2Ad2 2Ae4 2Af1 2Af3 2Af6 2Ag1 2Aj1 2Aj3 3Afa1 3Afa2 3Afa4 3Afa5 3Afa6 3Afa7 3Afa8 3Afa9 3Afa10 3Afa12 3Afb1 3Aga1 3Aga2 3Aib1 3Aib2 3Aib4 3Aib5 3Aib6 3Aib7 3Aib8 4Aaaa1 4Aaab1 4Aaac1 4Aabd1 4Aafa1 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa1 4Aiaa2 4Aiaa3 4Aiaa4 4Aiaa5 4Aiaa6 4Aiaa7 4Aiaa8 4Aiaa9 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbc1 5Aacbd1 5Aacbe1 5Agaea1 5Agaea2
2Ad1 = oSsSppSSpSp9Sp9S3ssp5sp4sppsp17sps3
2Ad2 = SossppsS3psp5spSsppsp4Ss18Sssp7spsspsppsppss
2Ae4 = ssop3ssp21S4spspsppssp3sppsp10spssp3sspp
2Af1 = Sspops3pSp13sp3sSp4ssS3s3S7s4psppssps5ps3SS
2Af3 = p4op5sp10sp12sp35
2Af6 = p3spop5sp3sp6sppsSp8s5psps5psspSppSp3S6pSSss
2Ag1 = Ss3pposp21S4sp5ssp6sp13sp5spp
2Aj1 = SSssppsosp10Sp8Ss3p5spspssps3Spsp7sps4pps5
2Aj3 = pSp5sospspssSpssSsp7sp18sp21s
3Afa1 = SSpSp4sosSsS6pSSsp11ssp3sp8sp16sp4
3Afa2 = p4sp4sosSSs4ppsSp12ssp12sp16sp4
3Afa4 = psp3sppsSsosS5spssp4sp7s3ps4p6ssppsppsp3SssSssSspss
3Afa5 = p9sSsoSs4ppsp14sp12sp16sp4
3Afa6 = p8sS4oS5pSSp12sspps4p6Ssp15sppss
3Afa7 = p8sSsSsSoS4pSsp3sp8ssp12sp10sp5sp4
3Afa8 = p5sppSSsSsSSoSSspssp12s6psp3sspSsp9spps3Sspss
3Afa9 = p9SsSsS3oSSpssp12ssppsppsp6ssp15sppsp
3Afa10 = psp6sSsSsS4oSpSSp12sspps4p3s5p9sp5sppss
3Afa12 = p8sSpspSSsSSopsp49
3Afb1 = SSp5SSp10op8sp10sp7Sp11ssp4sppsp
3Aga1 = psp6sSs3SSssSspoSp12S3s3SSp3SssSsp9sppsppsspss
3Aga2 = p4sp4SSspSs3SppSop12S7sp3S5p9SppSppSSpSS
3Aib1 = p5sp3sp12oS3sSsp6s4p4spsp4Ss6p4spssp5
3Aib2 = pspsp18SoSssSSp6S4s4SsSSsSSsSsSspsSps5p4Ss
3Aib4 = p22SSoSssSp6s4Ss7ps4pSsp4s5p4ss
3Aib5 = p5sp8sp7SsSosSsp9sp4sp6spssSsp7ssp5
3Aib6 = p5Sp5sp10s4osp24sppSp3s4SSpspps
3Aib7 = p3sp18SSsSsoSp6s3SppssSSsspssSs4pSp7sp3ss
3Aib8 = pSpSp3Ssp10sppsSSspSop6S5s3S7sSsSspsSs6ppspSS
4Aaaa1 = SsSp3Ssp21oS4p3sp7sp21spp
4Aaab1 = SsSp3Ssp21SoS3pspsppssp3spsp11s4p3s3p
4Aaac1 = SsSp3Ssp21SSoSSp5s3p3s3p11s4p3sSsp
4Aabd1 = ssSp3Sp22S3oSp11sp24
4Aafa1 = s4ppsp22S4opspsp4sp5sp21
4Agaa1 = pspssp4s3ps5ppSSp12os6Sps3Ss3p9s5pSs4
4Agab1 = pssSpsp3s9ppSSsSsppsSpsppssoS14sSs3psspS5sSSsSS
4Agab2 = pspSpsp5sp3sp4SSsSsppsSp5sSoS13sSsSspsspS5s4SS
4Agab3 = pssSpspsp7sp4sSsSsppsSssppssSSoS15s5pS8sSS
4Agab4 = pspspsp5spsps3ppsSsSsspSSp5sS3oS13sSs4pS8sSS
4Agac1 = sspsps3pspspspspspssSpsSp3SppsppsS4oS10s3SsppspS5sS5
4Agac2 = ps3ppsp4spsp3sppSSpssp3spssppsS5oSsS7pspSp3spS5sS5
4Agad1 = pssSpspsp3spsps3ppSspssppsspssppS7oS8pspsppsspS5ssS4
4Agad2 = pspSp3sp15ssppssp4spS5sSoS7p6sppS4sppsS3
4Agad3 = pspSpsp16sSsspSSp5sS8oS7s4pSspS6sSsSS
4Agad4 = sspSpspsp15ssppSSp5sS9oS5sspsppsspS4s3S4
4Agae1 = pssSpspsp7spsppSSsSsppsSs4psS10oS8ssSSpS6sS4
4Agae2 = pspSpspsp7spsppsSpSsppsSppsppS12oS3sSsSspsSpS5ssS4
4Agae3 = sSpSpssSsp8spSsSpsp4SpssppsS12oSSssSsspsSpS11
4Agae4 = ps3p5s4SsSssppSSpSsppsSp4ssS13oSs4ppsspS4ssSssSS
4Agae5 = pspspspsp3spsps3ppsSpSsppsSp5sS14os4p3SpS5ssSsSS
4Aiaa1 = p3spsp16Ss3pSsp6ssSSsp3SsSs4oS7ppsspsSp3ss
4Aiaa2 = p3sp18sSsppsSp6S4s3pssSSs3SoS3sSSspsp7Ss
4Aiaa3 = p5Sp5sp10ssps4p6ssSssp3spSsSssSSoS5pS3sSSpspSS
4Aiaa4 = p3sp18sSSspsSp6sSsS3spssSSs3S3oSsSSps3psp4Ss
4Aiaa5 = p22s3Spssp6s5p3sps3ppS4oSSsp3sppsp3ss
4Aiaa6 = p5Sp5sp10sppsSp10ssp6sp4SsSsSossps4SSpspss
4Aiaa7 = p3sp18ssp3Ssp6s4ppssSsSs3pS5soSp6sp3ss
4Aiaa8 = pspsp3sp15Sp4Sp6s7pssS3sS5ssSospssp6SS
4Aiaa9 = p28sp22sp5sop9sp
5Aacaa1 = ps3pSpsp3SppsspspssSpsspspspssppsS15ppSspsp3oS10
5Aacab1 = pspspSpsp3sp7sp3sspspspssppsS15ssSspspspSoS9
5Aacac1 = ppsspSssp3sp10s3pspspssppsS15spSs3pspSSoS8
5Aacad1 = ps3pSpsp3Sp3sp4sSpsspspspssppsS15ppsppsp3S3oS7
5Aacba1 = p3spSp5sp3sp6s4Spsp5sS7sSsS3sSspSspSp3S4oS6
5Aacbb1 = p5Sp5sp3sp6sppsSsp7ssSSs3pSsSsSssSpSpsSsppS5osS4
5Aacbc1 = sspsp3spssSs3SsspssSp12SSsS4sps4SSsp9S5soSSss
5Aacbd1 = ppsspSpsp3sp3sp4sSp4spspssppsSsS5sS5sSppsppsp3S7oS3
5Aacbe1 = spsspSssp21ssSpps5S4sS4ssp9S8oSS
5Agaea1 = sspSpspsp3spsps3pssSpSsppsSpssppsS15sS3s3SsS6sSSoS
5Agaea2 = sspSpspssppspspspsppsSpsspssSp5sS15ssSs4SpS6sS3o
---GRID_END---

---mini_tracker_end---
