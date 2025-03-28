# Module: pages

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
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/aws-config.ts
2Af5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Ai1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Ai2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
3Aab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/layout.tsx
3Aba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-members.tsx
3Aba2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-settings.tsx
3Aba3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/invite-user-dialog.tsx
3Aba5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/user-profile.tsx
3Abb6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/index.tsx
3Abd2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/search/global-search.tsx
3Abe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/shell/dashboard-header.tsx
3Afa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
3Aga2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/test-aws.ts
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Aaba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/company/page.tsx
4Aabb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/dashboard/page.tsx
4Aabc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/floor-plan/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/update.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agac2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/create.ts
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Agad4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/remove-from-company.ts
4Agad5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/update.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react/route.ts
5Agada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad1, 2Ad2, 2Ae2, 2Af1, 2Af3, 2Af5, 2Af6, 2Ag1, 2Ai1, 2Ai2, 3Aab1, 3Aba1, 3Aba2, 3Aba3, 3Aba5, 3Abb6, 3Abd2, 3Abe1, 3Afa1, 3Aga1, 3Aga2, 4Aaab1, 4Aaac1, 4Aaba1, 4Aabb1, 4Aabc2, 4Aafa1, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agad5, 5Aacaa1, 5Aacab1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Agada1, 5Agada2
last_GRID_edit: Applied suggestion: 2Ai2 -> 2Ai1 (s)

---GRID_START---
X 2Ad1 2Ad2 2Ae2 2Af1 2Af3 2Af5 2Af6 2Ag1 2Ai1 2Ai2 3Aab1 3Aba1 3Aba2 3Aba3 3Aba5 3Abb6 3Abd2 3Abe1 3Afa1 3Aga1 3Aga2 4Aaab1 4Aaac1 4Aaba1 4Aabb1 4Aabc2 4Aafa1 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agad5 5Aacaa1 5Aacab1 5Aacba1 5Aacbb1 5Aacbc1 5Agada1 5Agada2
2Ad1 = oSsSp3SSppssSSppsSppSSp3sp5sp3sp7sp
2Ad2 = SosSpspsSSps4p3Sspssp3sS3ssS6sp4sSs
2Ae2 = ssop4sspSps3ppsp3S3spsp7sp11
2Af1 = SSpoppssSsp8Sp8ssSssSsS3pSs3psSS
2Af3 = p4op15sp6sp18
2Af5 = psp3op3sp9SSp6SSs4Ss3Ssp4s3
2Af6 = p3sppop22s3pps3psS4pss
2Ag1 = Ss3p3osps8p3SSs4p9sp9
2Ai1 = SSsSp3sosp8Sppssp12sSp7sp
2Ai2 = pSpspsppsop5sppSsp8ssppspspsSp6ss
3Aab1 = ppSp4sppopsp3sSp3SsSssp20
3Aba1 = ssp5sp3oS4sSp3S6p19
3Aba2 = s3p4sppsSoS3sSp3S6p19
3Aba3 = Sssp4sp3SSoSs3p3SSsSsSp19
3Aba5 = Sssp4sp3S3oSsSp3S6p19
3Abb6 = p7spspSSsSosSp3s3SSsp19
3Abd2 = p7spps6oSp3s6p19
3Abe1 = spsp4sppS3sS3op3S5sp19
3Afa1 = SSpSp4SSp8op13sp3Sp6ssp
3Aga1 = psp3Sp3sp9oSp6S3s3SSssSsp4s3
3Aga2 = p4sSp13Sop6S12p4sSS
4Aaab1 = SsSp4SspS5ssSp3oS5p3sp3sp11
4Aaac1 = SsSp4SspsS4ssSp3SoS4p8sp8sp
4Aaba1 = ppSp4sppS3sSssSp3SSoSSsp19
4Aabb1 = ppsp4sppsS5sSp3S3oSSp19
4Aabc2 = p7sppsSSsSSsSp3S4osp19
4Aafa1 = s3p4sp3S4s3p3SSsSsop19
4Agaa1 = pSpssSp13SSp6oS11ppspS3
4Agab1 = pSpspSp3sp9SSp6SoS10psppS3
4Agab2 = pSpSpssppsp9SSp6SSoS9spspsSS
4Agab3 = pspspssp12sSsp5S3oS8s5SS
4Agab4 = pspspssp12sSp6S4oS7s4S3
4Agac1 = sSpSpsp3sp8ssSp6S5oS6spspS3
4Agac2 = pSpspSp13SSp6S6oS5p4S3
4Agad1 = pSsSpssppsp9SSsp5S7oS4s5SS
4Agad2 = pSpSpsspsp10sSpsp4S8oS3ssSpS3
4Agad3 = sSpSps3Ssp8SsSp6S9oSSpsspS3
4Agad4 = pSp3Sp3Sp9SSp6S10oSp4sSS
4Agad5 = pspSpssp12sSp6S11os3pS3
5Aacaa1 = p3sppSp22s4pssppsoS3s3
5Aacab1 = p3sppSp21spsspps3psSoSSpss
5Aacba1 = p3sppSp20sps4psSspsSSoS3s
5Aacbb1 = p6Sp23ssppsp4S3os3
5Aacbc1 = pspspsp12s3p6SSssS3sSSsSspSsoSS
5Agada1 = sSpSpsspssp8ssSpsp4S12ssSsSoS
5Agada2 = pspSpssppsp9sSp6S12s4SSo
---GRID_END---

---mini_tracker_end---
