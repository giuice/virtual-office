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
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useconversations.ts
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usemessages.ts
2Ae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Aj2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/common.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Abc6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversation-list.tsx
3Abc8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-feed.tsx
3Abc9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-item.tsx
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Aib1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iannouncementrepository.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iconversationrepository.ts
3Aib4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iinvitationrepository.ts
3Aib5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imeetingnoterepository.ts
3Aib6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
3Aib7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacerepository.ts
3Aib8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
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

last_KEY_edit: Assigned keys: 2Ad1, 2Ad2, 2Ae1, 2Ae2, 2Ae4, 2Ae5, 2Af1, 2Ag1, 2Aj1, 2Aj2, 2Aj4, 3Abc6, 3Abc8, 3Abc9, 3Ada1, 3Ada2, 3Afa4, 3Afb1, 3Aib1, 3Aib2, 3Aib3, 3Aib4, 3Aib5, 3Aib6, 3Aib7, 3Aib8, 4Aaaa1, 4Aaab1, 4Aaac1, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae4, 4Agae5, 4Aiaa1, 4Aiaa2, 4Aiaa3, 4Aiaa4, 4Aiaa5, 4Aiaa6, 4Aiaa7, 4Aiaa8, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Aacbd1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Aj4 -> 2Ae5 (s)

---GRID_START---
X 2Ad1 2Ad2 2Ae1 2Ae2 2Ae4 2Ae5 2Af1 2Ag1 2Aj1 2Aj2 2Aj4 3Abc6 3Abc8 3Abc9 3Ada1 3Ada2 3Afa4 3Afb1 3Aib1 3Aib2 3Aib3 3Aib4 3Aib5 3Aib6 3Aib7 3Aib8 4Aaaa1 4Aaab1 4Aaac1 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae4 4Agae5 4Aiaa1 4Aiaa2 4Aiaa3 4Aiaa4 4Aiaa5 4Aiaa6 4Aiaa7 4Aiaa8 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbc1 5Aacbd1 5Aacbe1 5Agaea1 5Agaea2
2Ad1 = oSs4pSSp8Sp8S3p5sp4sp18sps3
2Ad2 = Sos3pspSp7sSpsp5Sssps15p7s3psppsppss
2Ae1 = ssoSpSp4sS5p4sppsppssp24s5ppsspp
2Ae2 = ssSopSpsspsS5p7Spps3pspsppssp3spsp6sppsps4psspp
2Ae4 = ssppoppssp17S3pspsppssp3spsp9spssp3sspp
2Ae5 = spSSpop4sS5p7sp3sp25sppsppsSpp
2Af1 = psp4opsp10sp4sSp3sS3s3S6s4pspps7ps3SS
2Ag1 = Sppsspposp17S3p5ssp18sp5spp
2Aj1 = SSpsspssop8Sp7Ss3p3spspssps3psp7s5pps5
2Aj2 = p9op47sp5
2Aj4 = ppsspsp4oS3sSsp3SpsSp22sppSp3sppSspsp3
3Abc6 = ppSSpSp4SoS3sp4sppspps3p28sp5
3Abc8 = ppSSpSp4SSoS3p7spps3p27sp3spp
3Abc9 = ppSSpSp4S3oSsp7sp3ssp30sspp
3Ada1 = ppSSpSp4sS3oSp4sppsp32sppsp3
3Ada2 = ppSSpSp4SsSsSosp3SpsSp22sppSppsSssSSpsspp
3Afa4 = psp8sp4sop3sppsp5s3ps4p6sppsppsppSssSssSspss
3Afb1 = SSp6Sp8op7sp8sp17ssp4sppsp
3Aib1 = p18oS4sSsp4s4p4spsp3Ss6p3spssp5
3Aib2 = psp4sp11SosSssSSp4S4s4SsS4sSsSspsSs5p4Ss
3Aib3 = ppsp7SsppsSspSsosSSsp21SpsSppS3sSSpsp3
3Aib4 = p18SSsoSssSp4s4Ss11pSsp3s5p4ss
3Aib5 = p10sp4sppSsSSosSsp7sp4sp5spssSsp6ssp5
3Aib6 = ppsSpsp4Ss4SspssSssosp21sppSpps4SSpspps
3Aib7 = p6sp11SSssSsoSp4s3SppssSSs4Ss4pSp6sp3ss
3Aib8 = pSp4SpSp8ssSpSspSop4S5s3S6sSsSspsSs5ppspSS
4Aaaa1 = Ss3SppSsppssp13oSSp3sp7sp19spp
4Aaab1 = Ss3SspSspps3p12SoSpspsppssp3sp11s4p3s3p
4Aaac1 = SppsSppSspps3p12SSop5s3p3ssp10s4p3sSsp
4Agaa1 = psp4sp9sp12os6Sps3Sssp8s5pSs4
4Agab1 = pspsspSp9spsSpsppsSpspsoS13sSs3pssS5sSSsSS
4Agab2 = psp4Sp9spsSpsppsSp3sSoS12sSsSspssS5s4SS
4Agab3 = pspsspSpsp9sSpsppsSsspsSSoS14s5S8sSS
4Agab4 = psp4sp9spsSpsspSSp3sS3oS12sSs4S8sSS
4Agac1 = ssp4s3p7sspspSp3SppssS4oS9s3SsppsS5sS5
4Agac2 = pspsspssp8sppspsp3sps3S5oSsS6pspSp3sS5sS5
4Agad1 = pspsspSpsp7sppspsppsspssS7oS7pspsppssS5ssS4
4Agad2 = psp4Spsp10spsppssp4S5sSoS6p6spS4sppsS3
4Agad3 = psp4Sp11sSpsspSSp3sS8oS6s4pSsS6sSsSS
4Agad4 = ssp4Spsp10spsppSSp3sS9oS4sspsppssS4s3S4
4Agae1 = pspsspSpsp9sSpsppsSs4S10oS7ssS8sS4
4Agae2 = psp4Spsp10SpsppsSppsS12oSSsSsSspsS6ssS4
4Agae4 = pspsspsp12SpsppsSp3sS12oSs4ppssS4sspssSS
4Agae5 = psp4spsp7sppSpsppsSp3sS13os4p3S6ssSsSS
4Aiaa1 = p6sp11SspsspSsp4ssSSsp3SsSs3oS7psspsSp3ss
4Aiaa2 = p6sp11sSpsppsSp4S4s3pssSSssSoS3sSSpsp7Ss
4Aiaa3 = p10sp4sspssSps4p4ssSssp3spSs3SSoS8sSSpspSS
4Aiaa4 = p6sp11sSpSspsSp4sSsS3spssSSssS3oSsSSs3psp4Ss
4Aiaa5 = p18s4Spssp4s5p3spssppS4oSSsppsppsp3ss
4Aiaa6 = p3sp6Sp4SspspSpsSp8ssp6sp3SsSsSos6SSpspss
4Aiaa7 = p6sp11ssp4Ssp4s4ppssSsSsspS5soSp5sp3ss
4Aiaa8 = psp4spsp10Sp5Sp4s7pssSSsS5ssSopssp6SS
5Aacaa1 = ps4pspsp6sSspsSspspsps3S14ppSspsppoS10
5Aacab1 = pssppsspspsp4SsspsSspspsps3S14ssSspspsSoS9
5Aacac1 = pps3ps3p6sspssSspspsps3S14spSs3psSSoS8
5Aacad1 = ps4pspsp6sSpps3pspsps3S14ppsppsppS3oS7
5Aacba1 = ppsspssp3SpspsSspssSssSpsp3sS7sSsSSsSspSspSppS4oS6
5Aacbb1 = p3sp5s3p3SspspSpsSsp5ssSSs3pSsSs3SpSpsSspS5osS4
5Aacbc1 = ssp4spsp7Ssp11SSsS4sps4psp8S5soSSss
5Aacbd1 = pps5pspspps4p3sppspsps3SsS5sS4sSppsppsppS7oS3
5Aacbe1 = sps3Ss3p3sspsp10ssSs5S4sS3ssp8S8oSS
5Agaea1 = ssp4Spsp7sspSpsppsSps3S14sS3s3S7sSSoS
5Agaea2 = ssp4Spsp7sppspspssSp3sS14ssSs4S7sS3o
---GRID_END---

---mini_tracker_end---
