# Module: auth

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
3Afa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/announcements.ts
3Afa2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/client.ts
3Afa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/companies.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afa6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/invitations.ts
3Afa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/messages.ts
3Afa10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/spaces.ts
3Afa11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/users.ts
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
3Aga2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/test-aws.ts
4Agaa: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agac2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/create.ts
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/create.ts
4Agad4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/update.ts
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Agae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/update.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad2, 2Af1, 3Afa1, 3Afa2, 3Afa3, 3Afa4, 3Afa6, 3Afa8, 3Afa10, 3Afa11, 3Aga1, 3Aga2, 4Agaa, 4Agaa1, 4Agab1, 4Agab2, 4Agac1, 4Agac2, 4Agad1, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae5, 5Aacaa1, 5Aacab1, 5Aacad1, 5Aacbd1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestions (2025-04-02T12:02:49.354938)

---GRID_START---
X 2Ad2 2Af1 3Afa1 3Afa2 3Afa3 3Afa4 3Afa6 3Afa8 3Afa10 3Afa11 3Aga1 3Aga2 4Agaa 4Agaa1 4Agab1 4Agab2 4Agac1 4Agac2 4Agad1 4Agad4 4Agae1 4Agae2 4Agae3 4Agae5 5Aacaa1 5Aacab1 5Aacad1 5Aacbd1 5Aacbe1 5Agaea1 5Agaea2
2Ad2 = osp3sp7s5pssSSs3p3ss
2Af1 = sop11sSSssS5s6SS
3Afa1 = pposS8psp17
3Afa2 = ppsossSs3pSpsp17
3Afa3 = ppS>oS7pSp17
3Afa4 = spSsSoS4sspsp17
3Afa6 = ppS4oS5psp17
3Afa8 = ppSsS3oSSsspsp17
3Afa10 = ppSsS4oS3psp17
3Afa11 = ppS>S5oSSpSp17
3Aga1 = ppSpSsSsSSoSpSp17
3Aga2 = ppS3sSsS3opSp17
4Agaa = p12op18
4Agaa1 = s4Ss4S3pos4SssSs9
4Agab1 = sSp11soS13sSS
4Agab2 = sSp11sSoS11ssSS
4Agac1 = ssp11sSSoS14
4Agac2 = ssp11sS3oS13
4Agad1 = pSp11S5oS12
4Agad4 = sSp11sS5oS11
4Agae1 = sSp11sS6oS10
4Agae2 = SSp11S8oS9
4Agae3 = SSp11sS8oS8
4Agae5 = ssp11sS9oS4sSS
5Aacaa1 = ssp11sS10oS6
5Aacab1 = ssp11sS11oS5
5Aacad1 = psp11sS12oS4
5Aacbd1 = psp11sSsS11oS3
5Aacbe1 = psp11s3S7sS4oSS
5Agaea1 = sSp11sS15oS
5Agaea2 = sSp11sS16o
---GRID_END---

---mini_tracker_end---
