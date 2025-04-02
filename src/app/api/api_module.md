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
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useconversations.ts
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usemessages.ts
2Ae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Aj2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/common.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Aac: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Aib1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iannouncementrepository.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iconversationrepository.ts
3Aib4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iinvitationrepository.ts
3Aib7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
3Aib10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Aaca: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations
4Aacb: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages
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
4Aiaa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseconversationrepository.ts
4Aiaa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseinvitationrepository.ts
4Aiaa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasemessagerepository.ts
4Aiaa9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasespacereservationrepository.ts
5Aacaa: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacba: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbc: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react
5Aacbc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react/route.ts
5Aacbd: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Aacbe: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ae1, 2Ae2, 2Ae4, 2Ae5, 2Af1, 2Af6, 2Ag1, 2Aj1, 2Aj2, 2Aj4, 3Aac, 3Ada2, 3Aib1, 3Aib2, 3Aib3, 3Aib4, 3Aib7, 3Aib10, 4Aaaa1, 4Aaab1, 4Aaac1, 4Aaca, 4Aacb, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa3, 4Aiaa4, 4Aiaa7, 4Aiaa9, 5Aacaa, 5Aacaa1, 5Aacab, 5Aacab1, 5Aacac, 5Aacac1, 5Aacad, 5Aacad1, 5Aacba, 5Aacba1, 5Aacbb, 5Aacbb1, 5Aacbc, 5Aacbc1, 5Aacbd, 5Aacbd1, 5Aacbe, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestions (2025-04-02T12:01:41.866539)

---GRID_START---
X 2Ae1 2Ae2 2Ae4 2Ae5 2Af1 2Af6 2Ag1 2Aj1 2Aj2 2Aj4 3Aac 3Ada2 3Aib1 3Aib2 3Aib3 3Aib4 3Aib7 3Aib10 4Aaaa1 4Aaab1 4Aaac1 4Aaca 4Aacb 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa3 4Aiaa4 4Aiaa7 4Aiaa9 5Aacaa 5Aacaa1 5Aacab 5Aacab1 5Aacac 5Aacac1 5Aacad 5Aacad1 5Aacba 5Aacba1 5Aacbb 5Aacbb1 5Aacbc 5Aacbc1 5Aacbd 5Aacbd1 5Aacbe 5Aacbe1 5Agaea1 5Agaea2
2Ae1 = oSpSpsp3spSppsp3ssp24spspspspsp5spspp
2Ae2 = SopSpSsspspSp4Sps3p3spsppssp3sppsp6sp3spspspsp3spspp
2Ae4 = ppop3ssp10S3p3spsppssp3sppsp6sp3spsp7spspp
2Ae5 = SSpopsp3spSp7sp26sp5sp5spSpp
2Af1 = p4ospsp5sppsSp5sS3s3S7sspssppspspspspsp3spspsSS
2Af6 = sSpssop3SpSppSpSp9sp12spSppSpSpSpSpSpSp3SpSps
2Ag1 = pssp3osp10S3p7ssp6sp11sp11spp
2Aj1 = psspspsop9Ss3p4sspspssps3Spsp5spspspsp5spsps3
2Aj2 = p8op45sp8
2Aj4 = sspspSp3opSppSpSp22spSp4sp5Spsp3sp4
3Aac = p10op52
3Ada2 = SSpSpSp3SpoppSpSp22spSppspSpspspSpSp3spspp
3Aib1 = p12oS4sp6s4p4spsp4s3p6sp3spsp8
3Aib2 = p4sp7SosS3p6S4s4SsSSsSSsSsspspspspspsp8Ss
3Aib3 = sp4Sp3SpSSsossp22SpSppSpSpSpspSpSp3sp4
3Aib4 = p12SSsosSp6s4Ss7psspSp3spspspspsp8ss
3Aib7 = pSppsSp3SpS3ssop7s3SppssSSssps4Sppspspsp3Spsp3sppss
3Aib10 = p4SppSp4sSpSpop6S5pssS7pSpspspspspsp10SS
4Aaaa1 = ssSp3Ssp10oSSp4ssp7sp25spp
4Aaab1 = ssSsppSsp10SoSp3s3ppssp3sp9spspspsp7spssp
4Aaac1 = psSp3Ssp10SSop7s3p3ssp8spspspsp7spSsp
4Aaca = p21op41
4Aacb = p22op40
4Agaa1 = p4sp18os6Sps3Ss3p5spspspspsp3Spsps3
4Agab1 = psspSp7sSpssSpsp3soS14s4pSpSpSpSpSpspSpSpsSS
4Agab2 = p4Sppsp4sSpssSssp3sSoS13sSsspSpSpSpSpSpspspspsSS
4Agab3 = psspSspsp4sSpssSssp3sSSoS13ssSpSpSpSpSpSpSpSpSpsSS
4Agab4 = p4sp7sSpsSSp5sS3oS11sSsspSpSpSpSpSpSpSpSpsSS
4Agac1 = p4spssp5spSpSppsppsS4oS10sSpspSpSpSpSpSpspSpSpS3
4Agac2 = psspspsp6spsp3ssppsS5oSsS7pSp3SpSpSpSpSpspSpSpS3
4Agad1 = psspSppsp5sps3pssppS7oS8ps3pSpSpSpSpSpspspSpS3
4Agad2 = p4Sppsp5sps3p6S5sSoS7ppsspSpSpSpSpsp5spS3
4Agad3 = p4Sp7sSpsSSp5sS8oS6ssSSpSpSpSpSpSpSpspSpsSS
4Agad4 = p4Sppsp5spsSSp5sS9oS5pssSpSpSpSpSpspspspSpS3
4Agae1 = psspSppsp4sSpssSs3ppsS10oS8pSpSpSpSpSpSpspSpS3
4Agae2 = p4Sppsp5SpssSppsppS12oS3sSsspSpSpSpSpSpspspSpS3
4Agae3 = p4SpsSp5sp3Sp5sS12oSSpspspSpSpSpSpSpSpSpSpS3
4Agae4 = psspsp8SpssSp5sS13oSs3ppSpSpSpSpspsp3spsSS
4Agae5 = p4sppsp5SpssSp5sS14osspspSpSpSpSpSpspspSpsSS
4Aiaa3 = p5sp3sps3Spsp7ssSssp3spSspssoS3pSpSpSpspSpSp3sppSS
4Aiaa4 = p4sp7sSpSsSp6sSsS3spssSSs3SoSSpspspsp3sp8Ss
4Aiaa7 = p4sSp3SpSssSpSp7s4ppssSsSspspSSop10Spsp3sppss
4Aiaa9 = p13sp3sp6ssSsspssS3sspsSSpop5sp12Ss
5Aacaa = p43op19
5Aacaa1 = s3psSpsp3spsSs3pssppsS16sp3opSpSpSpSpSpSpSpS3
5Aacab = p45op17
5Aacab1 = sppssSpspspSpsSs3pssppsS16sp3SpopSpSpSpSpSpSpS3
5Aacac = p47op15
5Aacac1 = s3psSssp3s3Ss3pssppsS16spspSpSpopSpSpSpSpSpS3
5Aacad = p49op13
5Aacad1 = s3psSpsp3sps3pspssppsS15sp4SpSpSpopSpSpSpSpS3
5Aacba = p51op11
5Aacba1 = sspssSp3SpSssSsSp6sS7sSsS3sSSsSppSpSpSpSpopSpSpSpS3
5Aacbb = p53op9
5Aacbb1 = psp3SppsspSspSpsp7ssSSs3pSsSsSssSpsppSpSpSpSpSpopspSpS3
5Aacbc = p55op7
5Aacbc1 = p4sppsp15SSsS4sps4Spsp5SpSpSpSpSpspopSpSss
5Aacbd = p57op5
5Aacbd1 = s5SpspspsppspsppssppsSsS5sS5sSspsppSpSpSpSpSpSpSpopS3
5Aacbe = p59op3
5Aacbe1 = s3SsSssp3sp6ssSpps5S4sS4ssp5SpSpSpSpSpSpSpSpoSS
5Agaea1 = p4Sppsp5SpssSpssppsS17sSpSpSpSpSpSpSpspSpSoS
5Agaea2 = p4Sspsp5spssSp5sS16s3pSpSpSpSpSpSpspSpSSo
---GRID_END---

---mini_tracker_end---
