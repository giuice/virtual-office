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
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/aws-config.ts
2Af5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Ai1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Ai2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
3Afa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
3Aga2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/test-aws.ts
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
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

last_KEY_edit: Assigned keys: 2Ad1, 2Ad2, 2Ae2, 2Af1, 2Af3, 2Af5, 2Af6, 2Ag1, 2Ai1, 2Ai2, 3Afa1, 3Aga1, 3Aga2, 4Aaab1, 4Aaac1, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agad5, 5Aacaa1, 5Aacab1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Agada1, 5Agada2
last_GRID_edit: Applied suggestion: 2Ai2 -> 2Ai1 (s)

---GRID_START---
X 2Ad1 2Ad2 2Ae2 2Af1 2Af3 2Af5 2Af6 2Ag1 2Ai1 2Ai2 3Afa1 3Aga1 3Aga2 4Aaab1 4Aaac1 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agad5 5Aacaa1 5Aacab1 5Aacba1 5Aacbb1 5Aacbc1 5Agada1 5Agada2
2Ad1 = oSsSp3SSpSppSSp5sp3sp7sp
2Ad2 = SosSpspsS3spssS3ssS6sp4sSs
2Ae2 = ssop4ssp4SSp7sp11
2Af1 = SSpoppssSsSp4ssSssSsS3pSs3psSS
2Af3 = p4op7sppsp18
2Af5 = psp3op3spSSppSSs4Ss3Ssp4s3
2Af6 = p3sppop10s3pps3psS4pss
2Ag1 = Ss3p3osp4SSp9sp9
2Ai1 = SSsSp3sosSppssp8sSp7sp
2Ai2 = pSpspsppsoSsp4ssppspspsSp6ss
3Afa1 = SSpSp4SSop9sp3Sp6ssp
3Aga1 = psp3Sp3spoSppS3s3SSssSsp4s3
3Aga2 = p4sSp5SoppS12p4sSS
4Aaab1 = SsSp4Ssp4oSp3sp3sp11
4Aaac1 = SsSp4Ssp4Sop8sp8sp
4Agaa1 = pSpssSp5SSppoS11ppspS3
4Agab1 = pSpspSp3spSSppSoS10psppS3
4Agab2 = pSpSpssppspSSppSSoS9spspsSS
4Agab3 = pspspssp4sSspS3oS8s5SS
4Agab4 = pspspssp4sSppS4oS7s4S3
4Agac1 = sSpSpsp3s3SppS5oS6spspS3
4Agac2 = pSpspSp5SSppS6oS5p4S3
4Agad1 = pSsSpssppspSSspS7oS4s5SS
4Agad2 = pSpSpsspsppsSpsS8oS3ssSpS3
4Agad3 = sSpSps3SsSsSppS9oSSpsspS3
4Agad4 = pSp3Sp3SpSSppS10oSp4sSS
4Agad5 = pspSpssp4sSppS11os3pS3
5Aacaa1 = p3sppSp10s4pssppsoS3s3
5Aacab1 = p3sppSp9spsspps3psSoSSpss
5Aacba1 = p3sppSp8sps4psSspsSSoS3s
5Aacbb1 = p6Sp11ssppsp4S3os3
5Aacbc1 = pspspsp4s3ppSSssS3sSSsSspSsoSS
5Agada1 = sSpSpssps4SpsS12ssSsSoS
5Agada2 = pspSpssppspsSppS12s4SSo
---GRID_END---

---mini_tracker_end---
