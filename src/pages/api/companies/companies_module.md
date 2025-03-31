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
2Ad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/companycontext.tsx
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ai2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
3Afa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/announcements.ts
3Afa10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/spaces.ts
3Afa11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/users.ts
3Afa2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/client.ts
3Afa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/companies.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afa5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/index.ts
3Afa6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/invitations.ts
3Afa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/meetingnotes.ts
3Afa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/messages.ts
3Afa9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/operations.ts
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/update.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad2, 2Af1, 2Af6, 2Ai2, 3Afa1, 3Afa2, 3Afa3, 3Afa4, 3Afa5, 3Afa6, 3Afa7, 3Afa8, 3Afa9, 3Afa10, 3Afa11, 3Aga1, 4Aaab1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 5Aacab1, 5Aacac1, 5Aacba1, 5Aacbb1, 5Aacbe1
last_GRID_edit: Applied suggestion: 2Ai2 -> 3Afa11 (s)

---GRID_START---
X 2Ad2 2Af1 2Af6 2Ai2 3Afa1 3Afa2 3Afa3 3Afa4 3Afa5 3Afa6 3Afa7 3Afa8 3Afa9 3Afa10 3Afa11 3Aga1 4Aaab1 4Agab1 4Agab2 4Agab3 4Agab4 5Aacab1 5Aacac1 5Aacba1 5Aacbb1 5Aacbe1
2Ad2 = ospSppssp5s4SSssp5
2Af1 = sossp13sSs5ps
2Af6 = psop4sp3sp6s3S5
2Ai2 = SspospsspssSs4pssp7
3Afa1 = p3sosSSsS7psp8
3Afa2 = p4sossSSs6psp8
3Afa3 = sppsSsoSsS7pSs3p5
3Afa4 = spssSsSosS6spssps5p
3Afa5 = p4sSssoSs6psp8
3Afa6 = p3sS5oS6psppsp5
3Afa7 = p3sSsSSsSoS5psp8
3Afa8 = ppsSSsSSsSSoS3sps4ppssp
3Afa9 = p3sSsSSsS3oSSspsppsp5
3Afa10 = sppsSsSSsS4oSSpsppsp5
3Afa11 = sppsSsSSsS5oSpSppsp5
3Aga1 = sppsSsSssSSssSSopSSssp5
4Aaab1 = sp15oppsp5s
4Agab1 = Ssps3Ss7SSpoS3ssp3
4Agab2 = SSssppssp3sp3SpSoSSspsps
4Agab3 = s3p3sp4sp3ssSSoSs5
4Agab4 = s3p3sspsps5pS3os5
5Aacab1 = psSp4sp9s4oS4
5Aacac1 = psSp4sp9spssSoS3
5Aacba1 = psSp4sp3sp6s3SSoSS
5Aacbb1 = ppSp4sp3sp7ssS3os
5Aacbe1 = psSp13sps3S3so
---GRID_END---

---mini_tracker_end---
