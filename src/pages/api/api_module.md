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
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Aj3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
3Afa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/announcements.ts
3Afa2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/client.ts
3Afa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/companies.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afa6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/invitations.ts
3Afa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/meetingnotes.ts
3Afa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/messages.ts
3Afa9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/operations.ts
3Afa10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/spaces.ts
3Afa11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/users.ts
3Afb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Aga: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
3Aga2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/test-aws.ts
3Aib1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iannouncementrepository.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iinvitationrepository.ts
3Aib8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacerepository.ts
3Aib9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacereservationrepository.ts
3Aib10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
4Agaa: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agab: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/update.ts
4Agac: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agac2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/create.ts
4Agad: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/create.ts
4Agad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/delete.ts
4Agad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/get.ts
4Agad4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/update.ts
4Agae: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Agae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/remove-from-company.ts
4Agae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/update.ts
4Aiaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseannouncementrepository.ts
4Aiaa2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasecompanyrepository.ts
4Aiaa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseinvitationrepository.ts
4Aiaa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasespacerepository.ts
4Aiaa9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasespacereservationrepository.ts
4Aiaa10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseuserrepository.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad1, 2Ad2, 2Af1, 2Af6, 2Ag1, 2Aj1, 2Aj3, 3Afa1, 3Afa2, 3Afa3, 3Afa4, 3Afa6, 3Afa7, 3Afa8, 3Afa9, 3Afa10, 3Afa11, 3Afb1, 3Aga, 3Aga1, 3Aga2, 3Aib1, 3Aib2, 3Aib4, 3Aib8, 3Aib9, 3Aib10, 4Aaaa1, 4Aaab1, 4Aafa1, 4Agaa, 4Agaa1, 4Agab, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac, 4Agac1, 4Agac2, 4Agad, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa1, 4Aiaa2, 4Aiaa4, 4Aiaa8, 4Aiaa9, 4Aiaa10, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Aacbd1, 5Aacbe1, 5Agaea, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestions (2025-04-02T12:02:47.262757)

---GRID_START---
X 2Ad1 2Ad2 2Af1 2Af6 2Ag1 2Aj1 2Aj3 3Afa1 3Afa2 3Afa3 3Afa4 3Afa6 3Afa7 3Afa8 3Afa9 3Afa10 3Afa11 3Afb1 3Aga 3Aga1 3Aga2 3Aib1 3Aib2 3Aib4 3Aib8 3Aib9 3Aib10 4Aaaa1 4Aaab1 4Aafa1 4Agaa 4Agaa1 4Agab 4Agab1 4Agab2 4Agab3 4Agab4 4Agac 4Agac1 4Agac2 4Agad 4Agad1 4Agad2 4Agad3 4Agad4 4Agae 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa1 4Aiaa2 4Aiaa4 4Aiaa8 4Aiaa9 4Aiaa10 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbc1 5Aacbd1 5Aacbe1 5Agaea 5Agaea1 5Agaea2
2Ad1 = oSSpSSpSp9Sp9SSsp4sp3sp5sppssp14spspss
2Ad2 = SospsS3ppsp4spSpsppspSpSs3psps4pssps4pssSssp3spSsspsppsp3ss
2Af1 = Ssos3pSp9Sp4spSpSppspspS3spsspS4pS3s6ps6ps3pSS
2Af6 = ppsop6sppsp7sp11s4psppspssps3pssp5S6pSSpss
2Ag1 = Sssposp21SSsp8ssp8sp10sp5sp3
2Aj1 = SSspsosp10Sp6SpSssp5ssppsppsspspssSpsp3spps4pps3pss
2Aj3 = pSp3sospps3SpspSpsp4sp23sp5spSp11s
3Afa1 = S3p3sosS8ppSSsp9spsp4sp10sp13sp5
3Afa2 = p7sossSs5ppsSp10spsp15sp13sp5
3Afa3 = p7S>oS7ppSSp10Sp37
3Afa4 = pspsppsSsSoS6ppssp10spsspspsspsp7ssp6SssSssSsppss
3Afa6 = p6sS4oS5ppSSp10spsppspsspsp7Ssp12sp3ss
3Afa7 = p6sSsS3oS4ppSsp10spsp15sp7sp5sp5
3Afa8 = p3sppSSsS4oS3ppssp10sps4psppsp4sspSsp6spps3Ssppss
3Afa9 = p7SsS5oSSppssp10spsppsp4sp7ssp12sp3sp
3Afa10 = psp4sSsS6oSppSSp10spsppspsspsp4s5p6sp5sp3ss
3Afa11 = p7S>S7oppSSp10Sp37
3Afb1 = S3ppSSp10op6sp9Sp3sp8sSp8ssp4sp3sp
3Aga = p18op50
3Aga1 = psp4sSsSsSSssSSppoSp10SpSSsspsSpSp4SssSsp6sppsppssppss
3Aga2 = p7S3sSs3SSppSop10SpS4pSSpsp4S5p6SppSppSSppSS
3Aib1 = p3sp3sp13oSSsSsp6s4p6sppsp4Ss3p4spssp6
3Aib2 = pssp18SoS4p6S4psspssSspSSsSSsS3sSs5p5Ss
3Aib4 = p21SSoS3p6s4pSsps4pssps4Sp3s5p5ss
3Aib8 = pSSppSsp10sp3sSSoSSp6S4pSspssSSpS5sS3sps5ppsppSS
3Aib9 = p21S4oSp6spssp4sS3psspps3S3sp10ss
3Aib10 = pSSppSp15sS4op6S4pSppssSSpS5ssSSsSs4p6SS
4Aaaa1 = SsppSsp21oSSp4ssp10sp18sp3
4Aaab1 = SsppSsp21SoSp3s3p3spsp4spsp8s4p3sspsp
4Aafa1 = s3psp22SSop3spsp6sp6sp19
4Agaa = p30op38
4Agaa1 = pssp4ssSs6SppSSp10ops4psspSpsspsSs3p6s5pSsspss
4Agab = p32op36
4Agab1 = psSsp3ssps6p3SSsSsSsSpsspspoS3pSSpS4pS5sSs3S6sSSspSS
4Agab2 = ssSspsp4sppsp3SpSSsSsSpSssppspSoSSpSSpS4pS5sSSssS6s4pSS
4Agab3 = psSspsp7sp5sSsSsSsSs3pspSSoSpSSpS4pS7ssSsS8spSS
4Agab4 = ps3p6ssps3p3sSsSsSsSp4spS3opSSpS4pS8s3S8spSS
4Agac = p37op31
4Agac1 = s6psppsspspspspsSpsSSpSp4spS4poSpS4pS5ssSs3S5sS3pSS
4Agac2 = psspsp5ssp3sp3SSps3p3sppspS4pSopSsSSpS5psSsppS5sS3pSS
4Agad = p40op28
4Agad1 = psSspsp4ssps3p3Ssps5psppSpS4pSSpoS3pS5ps4pS5ssSSpSS
4Agad2 = psSppsp16s3Ssppsp3S4pSspSoSSpS5p4spS4sppsSpSS
4Agad3 = psSsp17sSsS3p4spS4pSSpSSoSpS6s3SsS6sSspSS
4Agad4 = ssSspsp16ssS3p4spS4pSSpS3opS5s4SpS4s3SSpSS
4Agae = p45op23
4Agae1 = psSspsp7spsp3SSsSsSsSssppspS4pSSpS4poS16sSSpSS
4Agae2 = ssSspsp7spspspsSpSsSsSp4SpS4pSSpS4pSoS3sS3sS6ssSSpSS
4Agae3 = sSSssSsp8spSpsSpspSpSpsppspS4pSSpS4pSSoSSs3SsS10pSS
4Agae4 = pssp4sspsSsSssp3SSpSsSpSppspspS4pSSpS4pS3oSs4psS4ssSsspSS
4Agae5 = ps3psp4ssps3p3sSpSsSsSp4spS4pSSpS4pS4os3SsS6ssSspSS
4Aiaa1 = ppssp17Ss5p6ssSSpsp4SspSs4oS5psspsSp4ss
4Aiaa2 = ppsp18sSsSssp6S4psspspsspSSs3SoSSsSpsp8Ss
4Aiaa4 = ppsp18sS5p6sSsSpSSpspsspSSs3SSoS3s3psp5Ss
4Aiaa8 = pssppssp14sSpS3p6s4psspspsspS3sS4osSpssp7SS
4Aiaa9 = p22spsSsp6ssSspsppssSSpSsspsSsSsoSppsp7ss
4Aiaa10 = pSsp3Sp15SppsSp6SSsspsp4sppS3sS6op10SS
5Aacaa1 = pssSpsp4SpsspspspsSps3pspsppspS4pSSpS4pS5ppsp3oS8pSS
5Aacab1 = pssSpsp4sp6sp4s3pspsppspS4pSSpS4pS5s4ppSoS7pSS
5Aacac1 = ppsSssp4sp10s4pspsppspS4pSSpS4pS5sps3pSSoS6pSS
5Aacad1 = pssSpsp4Sppsp5sSps3pspsppspS4pSSpS4pS5p6S3oS5pSS
5Aacba1 = ppsSp6sppsp7s4p6spS4pSSpSsSspS3sSspsp3S4oS4pSS
5Aacbb1 = p3Sp6sppsp7sp11ssSSpsspspSspSsSssSp5S5osSSpSS
5Aacbc1 = s3ppspsspSssSsspspsSp10SpSsSSpSSpspsspssSSsp6S5soSSpss
5Aacbd1 = ppsSpsp4sppsp5sSp3sp3sppspSsSSpSSpSsSSpS3sSp6S7oSpSS
5Aacbe1 = spsSssp21ssppsps4pSSpSSsSpS3ssp6S8opSS
5Agaea = p66opp
5Agaea1 = ssSspsp4ssps3pspsSpSsSsSpsppspS4pSSpS4pS5sS3sS7sSSpoS
5Agaea2 = ssSspssp3sspspsp3sSpssSsSp4spS4pSSpS4pS5s3SsS7sSSpSo
---GRID_END---

---mini_tracker_end---
