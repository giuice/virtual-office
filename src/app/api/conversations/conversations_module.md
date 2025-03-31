# Module: conversations

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
2Ad4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/searchcontext.tsx
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ai2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Ai3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Ada3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/useconversations.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/messages.ts
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/update.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/get.ts
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Agae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/update.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad2, 2Ad4, 2Af1, 2Af6, 2Ai2, 2Ai3, 3Ada2, 3Ada3, 3Afa4, 3Afa8, 3Aga1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agad1, 4Agae1, 4Agae2, 4Agae3, 4Agae5, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacbb1, 5Aacbd1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Ai3 -> 2Ai2 (s)

---GRID_START---
X 2Ad2 2Ad4 2Af1 2Af6 2Ai2 2Ai3 3Ada2 3Ada3 3Afa4 3Afa8 3Aga1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agad1 4Agae1 4Agae2 4Agae3 4Agae5 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacbb1 5Aacbd1 5Agaea1 5Agaea2
2Ad2 = osspSppssppSSssSsSsSssppsppSs
2Ad4 = sop20ssp5
2Af1 = sposp7sSs3S3s6ppSS
2Af6 = ppsopSSs3pps3ps6SSsSs3
2Ai2 = Sp3osspsSs3pps3pspsp5ss
2Ai3 = p3SsoSssp12s3p5
3Ada2 = p3SsSoSssp11sSs3p3
3Ada3 = sppspsSop14ssp5
3Afa4 = spps4poSs3ps3p3sSssSs4
3Afa8 = p3sSpspSos9psspps5
3Aga1 = p4sp3ssoSSs3SSs4ppsps3
4Agab1 = Spspsp3ssSoS10ssSpS3
4Agab2 = SpSssp3ssSSoS9spSpS3
4Agab3 = spssp5ssSSoS8ssSsS3
4Agab4 = spssp4s3S3oS7ssSsS3
4Agac1 = Spspsp3s3S4oS6spSpS3
4Agad1 = spSssp3ssS6oS5ssSsS3
4Agae1 = SpSssp4sS7oS4ssSsS3
4Agae2 = spSsp5ssS7oS3ssSpS3
4Agae3 = Sps3p5sS8oSSpsSpS3
4Agae5 = spssp4s3S9oSssSpS3
5Aacaa1 = sps5pSssS10oS3sS3
5Aacab1 = pssSpsSsspps8psSoS3s3
5Aacac1 = pssSps4ppspssps5SSoSSs3
5Aacad1 = spssppspSssS13osS3
5Aacbb1 = p3Sppspssp3sspssp3sSSsos3
5Aacbd1 = p3sp4s3S11ssSsoSS
5Agaea1 = SpSssp3s3S11ssSsSoS
5Agaea2 = spSssp3s3S11ssSsSSo
---GRID_END---

---mini_tracker_end---
