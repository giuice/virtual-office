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
2Ad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/companycontext.tsx
2Ad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messagingcontext.tsx
2Ad4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/searchcontext.tsx
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo.ts
2Ai3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Abc8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-feed.tsx
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Ada3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/useconversations.ts
3Ada4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/usemessages.ts
3Ada5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/usesocketevents.ts
3Afa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
3Aga2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/test-aws.ts
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/update.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
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

last_KEY_edit: Assigned keys: 2Ad2, 2Ad3, 2Ad4, 2Af1, 2Af5, 2Ai3, 3Abc8, 3Ada1, 3Ada2, 3Ada3, 3Ada4, 3Ada5, 3Afa1, 3Aga1, 3Aga2, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agad5, 5Aacaa1, 5Aacab1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Agada1, 5Agada2
last_GRID_edit: Applied suggestion: 2Ai3 -> 3Ada5 (s)

---GRID_START---
X 2Ad2 2Ad3 2Ad4 2Af1 2Af5 2Ai3 3Abc8 3Ada1 3Ada2 3Ada3 3Ada4 3Ada5 3Afa1 3Aga1 3Aga2 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agad1 4Agad2 4Agad3 4Agad4 4Agad5 5Aacaa1 5Aacab1 5Aacba1 5Aacbb1 5Aacbc1 5Agada1 5Agada2
2Ad2 = opsSsp4sppSspS3ssS5sp4sSs
2Ad3 = pop3sS6p16sp4
2Ad4 = spop24sp5
2Af1 = Sppop8SppssSssS4pSs3psSS
2Af5 = sp3op8S4s7Ssp4s3
2Ai3 = psp3oS3s3p14ssSp4
3Abc8 = pSp3SoS5p16sp4
3Ada1 = pSp3SSoS4p16sp4
3Ada2 = pSp3S3oS3p14SsSsp3
3Ada3 = sSp3sS3oSSp15ssp4
3Ada4 = pSp3sS4oSp16sp4
3Ada5 = pSp3sS5op16sp4
3Afa1 = SppSp8op7sppSp6ssp
3Aga1 = sp3Sp8oS4s3SssSsp4s3
3Aga2 = p4Sp8SoS11p4sSS
4Agaa1 = SppsSp8SSoS10ppspS3
4Agab1 = SppsSp8S3oS9psppS3
4Agab2 = SppSsp8S4oS8spspsSS
4Agab3 = sppssp8sS4oS7s5SS
4Agab4 = sppssp8sS5oS6s4S3
4Agac1 = SppSsp7ssS6oS5spspS3
4Agad1 = SppSsp8S8oS4s5SS
4Agad2 = SppSsp8sS8oS3ssSpS3
4Agad3 = SppSsp7SsS9oSSpsspS3
4Agad4 = Sp3Sp8S11oSp4sSS
4Agad5 = sppSsp8sS11os3pS3
5Aacaa1 = p3spsppSp8s6ppsoS3s3
5Aacab1 = ppsspsppssp6spssps3psSoSSpss
5Aacba1 = pspspSssSs3p3sps5SspsSSoS3s
5Aacbb1 = p8sp9sspsp4S3os3
5Aacbc1 = sppssp7s3SSssSSsSSsSspSsoSS
5Agada1 = SppSsp7ssS12ssSsSoS
5Agada2 = sppSsp8sS12s4SSo
---GRID_END---

---mini_tracker_end---
