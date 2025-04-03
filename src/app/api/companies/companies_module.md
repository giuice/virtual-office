# Module: companies

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
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
3Afb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Aib1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iannouncementrepository.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iinvitationrepository.ts
3Aib8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacerepository.ts
3Aib9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/ispacereservationrepository.ts
3Aib10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agab: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies
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
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad1, 2Ad2, 2Af1, 2Af6, 2Aj1, 3Afb1, 3Aib1, 3Aib2, 3Aib4, 3Aib8, 3Aib9, 3Aib10, 4Aaaa1, 4Aaab1, 4Aafa1, 4Agaa1, 4Agab, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa1, 4Aiaa2, 4Aiaa4, 4Aiaa8, 4Aiaa9, 4Aiaa10, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Aacbd1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestions (2025-04-02T12:02:51.411919)

---GRID_START---
X 2Ad1 2Ad2 2Af1 2Af6 2Aj1 3Afb1 3Aib1 3Aib2 3Aib4 3Aib8 3Aib9 3Aib10 4Aaaa1 4Aaab1 4Aafa1 4Agaa1 4Agab 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa1 4Aiaa2 4Aiaa4 4Aiaa8 4Aiaa9 4Aiaa10 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbc1 5Aacbd1 5Aacbe1 5Agaea1 5Agaea2
2Ad1 = oSSpSSp6SSp4sppsp6sSp19
2Ad2 = SospSSpsp3Ss4ps5p5sSSsp4spSp9sp
2Af1 = SsossSpsp3SppsspS3sSpSsS5sSspsspspspsp3ssSS
2Af6 = ppsoppsp10s4p11sp5S6pSSps
2Aj1 = SSspoSp5Sssp4sspsp5sSSp5sp3sp4s5
3Afb1 = S3pSop12Sppsp6sSp19
3Aib1 = p3sppoS4sp5s4p11Spssp7sp5
3Aib2 = pssp3SoS4p5S4p4SsSSsSSsS3sSssp7Ss
3Aib4 = p6SSosSSp5s4Ssp3sp5spSp4sppsp6
3Aib8 = p6SSsoSSp5spsSppssSSsppsps3SSp12
3Aib9 = p6S4oSp5spssppsS3sspps3S3sp9ss
3Aib10 = pSSpSpsS4op5S5pssS7ssSSsSs4p5SS
4Aaaa1 = Ssppsp7oSSp3ssp7sp18spp
4Aaab1 = Ssppsp7SoSpps3p7sp17sspp
4Aafa1 = pssp9SSoppspsp29
4Agaa1 = pssp12ops6SppssSspsp6sspsp3s4
4Agab = p16op32
4Agab1 = psSsppsSs3Sps3poS14sSs3S6spSsSS
4Agab2 = ssSssSsSsppSsspspSoS13ssSssS6s4SS
4Agab3 = psSsspsSs3Ss4pSSoS14ssSsS6pSsSS
4Agab4 = ps3ppsSsSsSp3spS3oS14s3S6pSsSS
4Agac1 = ssSpssppSppSp3spS4oS10ppSpssS5sS5
4Agac2 = p8sp6spS5oSsS7ppsp3S5pS5
4Agad1 = ppSp6s3p3SpS6oS8p4spS5psS4
4Agad2 = ppsp6sSsp5S5sSoS7p4spS4p3sS3
4Agad3 = ppSp4SpS3p5S8oS6ssS3sS6pSsSS
4Agad4 = ppSp4ssS3p3spS9oS5ppssSpS4sppS4
4Agae1 = psSpsppSpssSsspspS10oS4sS11pS4
4Agae2 = sSSpSspSppsSp3SpS11oS3psSssS6psS4
4Agae3 = S3pSSpsp3Sp3spS12oSSpps3S12
4Agae4 = pssp4SpspSp5S13oSps3psS4sppspSS
4Agae5 = ppSp4SppsSp3spS14opps3S6spSsSS
4Aiaa1 = ppssppSs5p5ssSSp4spsp4oS5p5Sp5
4Aiaa2 = p7Sps3p5SsSSp4spSspspSoS4p9sp
4Aiaa4 = ppsp3sSSsSSp5sSsSSsppSsSSs3SSoS3psp7SS
4Aiaa8 = psspspsSpS3p5s4p4SsSs4S3oSSp9Ss
4Aiaa9 = p7spSSsp5ssSsspssS3sspsS4oSppsp6Ss
4Aiaa10 = pSsp4SppsSp5SSs3p3spS3sS6op9SS
5Aacaa1 = p3Sp3sp3sp3spS15p6oS10
5Aacab1 = ppsSsppssppsp3spS15ppsp3SoS9
5Aacac1 = p3Sp7sp5S15p4spSSoS8
5Aacad1 = ppsSp7sp3spS15p6S3oS7
5Aacba1 = p3Sp4sp8S7pSsS3sSp6S4oS6
5Aacbb1 = p3Sppsp10ssSSsp3SpSpSpsSp5S5osS4
5Aacbc1 = p4sp13sppSSsp4sSp8S5soSSps
5Aacbd1 = ppsSsp8spspSsS5sS5sSp6S7oS3
5Aacbe1 = ppsSsp7sspsps4S4sS4psp6S8oSS
5Agaea1 = psSpsppSppsSp3spS15psS10pSSoS
5Agaea2 = ppSssppsppsSp3spS15ppSssS7sS3o
---GRID_END---

---mini_tracker_end---
