# Module: supabase

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
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Aj3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Aib1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iannouncementrepository.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iconversationrepository.ts
3Aib4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iinvitationrepository.ts
3Aib5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imeetingnoteactionitemrepository.ts
3Aib6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imeetingnoterepository.ts
3Aib7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
3Aib8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacerepository.ts
3Aib9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacereservationrepository.ts
3Aib10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
3Aib11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/index.ts
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
4Aiaa: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase
4Aiaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseannouncementrepository.ts
4Aiaa2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasecompanyrepository.ts
4Aiaa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseconversationrepository.ts
4Aiaa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseinvitationrepository.ts
4Aiaa5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasemeetingnoteactionitemrepository.ts
4Aiaa6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasemeetingnoterepository.ts
4Aiaa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasemessagerepository.ts
4Aiaa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasespacerepository.ts
4Aiaa9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasespacereservationrepository.ts
4Aiaa10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseuserrepository.ts
4Aiaa11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/index.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad2, 2Af1, 2Af6, 2Aj3, 2Aj4, 3Ada2, 3Afa4, 3Aib1, 3Aib2, 3Aib3, 3Aib4, 3Aib5, 3Aib6, 3Aib7, 3Aib8, 3Aib9, 3Aib10, 3Aib11, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa, 4Aiaa1, 4Aiaa2, 4Aiaa3, 4Aiaa4, 4Aiaa5, 4Aiaa6, 4Aiaa7, 4Aiaa8, 4Aiaa9, 4Aiaa10, 4Aiaa11, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacba1, 5Aacbb1, 5Aacbd1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestions (2025-04-02T12:03:07.826072)

---GRID_START---
X 2Ad2 2Af1 2Af6 2Aj3 2Aj4 3Ada2 3Afa4 3Aib1 3Aib2 3Aib3 3Aib4 3Aib5 3Aib6 3Aib7 3Aib8 3Aib9 3Aib10 3Aib11 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa 4Aiaa1 4Aiaa2 4Aiaa3 4Aiaa4 4Aiaa5 4Aiaa6 4Aiaa7 4Aiaa8 4Aiaa9 4Aiaa10 4Aiaa11 5Aacaa1 5Aacab1 5Aacac1 5Aacba1 5Aacbb1 5Aacbd1 5Agaea1 5Agaea2
2Ad2 = ospSppspsp5SpSps12Sssp8spSpssp4ss
2Af1 = sosp5sp4sSpSpS3s3S7sspsspsppsspsps4psSS
2Af6 = psopSSsspSpsSSp4sps3p3s5pspspSppSSp4S6ss
2Aj3 = Sppospsp29sp4spSp9
2Aj4 = ppSsoSsppSpsSSp22sppSSp5spSsspp
3Ada2 = ppSpSosppSpsSSp22sppSSp4sSsSSspp
3Afa4 = sps4oppsppsp23sppsp8ssp3
3Aib1 = ppsp4oS4sSsSsps4p4spsp5Ss7p5s3p3
3Aib2 = ssp5SosSssS4pS4s4SsSSsSSpsSsSspsSsSps4ppSs
3Aib3 = ppSpSSsSsosSSsp22SpsSSp4S5spp
3Aib4 = p7SSsoSssS3ps4Ss7psspsspSsp6s4ppss
3Aib5 = ppspsspSsSSosSspsp4sp4sp7spssSsp8ssp3
3Aib6 = ppSpSSs3SssosSSp20spSSpsspps3SSsps
3Aib7 = psSpSSpSSssSsoSp3s3SppssSSsspsspSs4pSp4s3Ss4
3Aib8 = SSp5sSpSsSSoSSpS5s3S7psSsSs3Sspps4psSS
3Aib9 = p7SSpSpSpSoSpspssppsS3ssppsps3SpspSSsp7ss
3Aib10 = SSp5sSpSsppSSopS5pssS7psspSp3SsSps3p3SS
3Aib11 = p17op26Sp8
4Agab1 = sSsp4sSpsppsSsSpoS14psSs3ps3SpS4sS3
4Agab2 = sSp5sSpsppsSpSpSoS13psSsSsps3SpS4ssSS
4Agab3 = sSsp4sSpsppsSsSpSSoS12pS3s5SspS8
4Agab4 = s3p4sSpsspSSsSpS3oS11pSSsSs6pS8
4Agac1 = s3p5spSp3SpSpS4oS10ps3Sspps3pS4sS3
4Agac2 = ssp6spsp3sp3S5oSsS7ppspSp3sp3S4sS3
4Agad1 = sSp6spspps4pS6oS8ppspspps3ppS4sS3
4Agad2 = sSp6spsppssSspS5sSoS7p7spsppS3spsSS
4Agad3 = sSsp4sSpsspS4pS8oS6pSs4pSsSspS8
4Agad4 = sSsp5spsppS4pS9oS5psspsppssSppS3ssS3
4Agae1 = sSsp4sSpsppsSsSpS10oS4pS4ssS4pS8
4Agae2 = sSsp5SpsppsSsSpS11oS3psSsSspsSsSpS4sS3
4Agae3 = SSsp5sp5SpSpS12oSSpssSsspsSsSpS8
4Agae4 = ssp6SpsppsSpSpS13oSps4ppsspspS3s3SS
4Agae5 = s3p5SpsppsSsSpS14ops4p3SsSpS4sS3
4Aiaa = p33op19
4Aiaa1 = pssp4SspsspSs3pssSSsp3SsSs4poS9pps3Spss
4Aiaa2 = psp5sSpsppsSsspS4s3pssSSs3pSoS3sSSsSppsp4Ss
4Aiaa3 = ppSs6Sps5ppssSssp3spSsSsspSSoS7pS5sSS
4Aiaa4 = psp5sSpSspsS3psSsS3spssSSs3pS3oSsS4s5ppSs
4Aiaa5 = p7s4SSssp3s5p3sps3p3S4oSSsSSp3spspss
4Aiaa6 = ppSpSSsspSpsSpssp4ssp6sp5SsSsSossSSps3SSs3
4Aiaa7 = psSpSSpssSp3Ssp3s4ppssSsSs3ppS5soSpsp4Ss4
4Aiaa8 = sspsp3sSp3spS3ps7pssS3sSpS4ssSosSspssp3SS
4Aiaa9 = p8sp3spsSspssSsspssS3sspspSsS4psoSp3sp3ss
4Aiaa10 = SspSp4Sp6sSpSSs3p3spS3sSpS6sSSosp6SS
4Aiaa11 = p17Sp19sp3spsop8
5Aacaa1 = ssSppsppsSsps3pspS15p3Sspsp5oS7
5Aacab1 = ssSpsSppsSsps3pspS15pssSspspsp3SoS6
5Aacac1 = psSppspssSsps3pspS15pspSs3pssppSSoS5
5Aacba1 = psSpSSs3SssSSsp3S7sSsS3sSpspSspSSp4S3oS4
5Aacbb1 = ppSpsSsspSpsSsp4ssSSs3pSsSsSsspSpSpsSsp4S4oS3
5Aacbd1 = psSpssp3spps3p3SsS5sS5sSp3sppssp4S5oSS
5Agaea1 = sSsp5SpsppsSsSpS15psS3s3SsSpS6oS
5Agaea2 = sSsp5spspssSsSpS15pssSs4SsSpS7o
---GRID_END---

---mini_tracker_end---
