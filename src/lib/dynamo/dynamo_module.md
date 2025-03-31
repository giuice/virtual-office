# Module: dynamo

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
2Af3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/aws-config.ts
2Af4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo.d.ts
2Af5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ai2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Ai3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Afa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/announcements.ts
3Afa10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/spaces.ts
3Afa11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/users.ts
3Afa12: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/utils.ts
3Afa2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/client.ts
3Afa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/companies.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afa5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/index.ts
3Afa6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/invitations.ts
3Afa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/meetingnotes.ts
3Afa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/messages.ts
3Afa9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/operations.ts
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
3Aga2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/test-aws.ts
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/update.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agac2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/create.ts
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/get.ts
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Agae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/remove-from-company.ts
4Agae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/update.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad2, 2Af3, 2Af4, 2Af5, 2Af6, 2Ai2, 2Ai3, 3Ada2, 3Afa1, 3Afa2, 3Afa3, 3Afa4, 3Afa5, 3Afa6, 3Afa7, 3Afa8, 3Afa9, 3Afa10, 3Afa11, 3Afa12, 3Aga1, 3Aga2, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Aacbd1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Ai3 -> 2Ai2 (s)

---GRID_START---
X 2Ad2 2Af3 2Af4 2Af5 2Af6 2Ai2 2Ai3 3Ada2 3Afa1 3Afa2 3Afa3 3Afa4 3Afa5 3Afa6 3Afa7 3Afa8 3Afa9 3Afa10 3Afa11 3Afa12 3Aga1 3Aga2 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbc1 5Aacbd1 5Agaea1 5Agaea2
2Ad2 = op4Sp4ssp5ssp3sSSssSssSsSs3ppsppspSs
2Af3 = pop7sp11ssp22
2Af4 = ppoSp8sp32
2Af5 = ppSop5SppSsp3ssp26
2Af6 = p4opSSp3sp3sp8s3pps4pssSSsSSps3
2Ai2 = Sp4os3psspssSs5ppssppspsspsspsp5spss
2Ai3 = p4SsoSp3sp24sspSp5
3Ada2 = p4SsSop3sp3sp19sSssSsp4
3Afa1 = p5spposSSsS9ssp9sp7sp3
3Afa2 = pspSp4sossSSs5psSssp9sp7sp3
3Afa3 = sp4sppSsoSsS11s8pSssp5spss
3Afa4 = sp3s4SsSosS6s6ps4p3ssSssSssSs3
3Afa5 = ppsSp4sSssoSs5psppsp9sp7sp3
3Afa6 = p3spsppS5oS8sspps4p3Ssp6spss
3Afa7 = p5sppSsSSsSoS6s3p9spsp5sp3
3Afa8 = p4sSpsSsSSsSSoS3s9ps3pSsspps3Ss3
3Afa9 = p5sppSsSSsS3oS3s4ppsppsp3ssp6spsp
3Afa10 = sppspsppSsSSsS4oS4sspps10p5spss
3Afa11 = sppspsppSsSSsS5oS5pps7Ssp6spss
3Afa12 = p5sppSpSspSSsS3osp24
3Aga1 = p5sppSsSssSSssSSsoS4s3S3ssSssppspps4
3Aga2 = psp6S3spSs3SSpSoS7sS6ppSppS4
4Agaa1 = ssp6ssSsps5SpSSoS13ppSspS4
4Agab1 = Sp4sppssSs7SpS3oS12psSppS4
4Agab2 = Sp3ssp4ssp3sp4S4oS11spSspS4
4Agab3 = sp3sp5sp4sp4sS4oS10ssSssS4
4Agab4 = sp3sp5sspsps4psS5oS9ssSssS4
4Agac1 = Sp4sp4sspspspsspsS6oS8spSspS4
4Agac2 = sp9sspsp3sspS8osS6ppSppS4
4Agad1 = sp3ssp4sspsps4pSsS6soS6ssSpssS3
4Agae1 = Sp3ssp4sp4spsspS10oS5ssSssS4
4Agae2 = sp3sp5sp4spsspsS10oS4ssSSpS4
4Agae3 = Sp3ssp11sspsS11oS3psSspS4
4Agae4 = sp4sppssSssSsSssSpS13oSSppSppS4
4Agae5 = sp3sp5sspsps4psS13oSssSspS4
5Aacaa1 = sp3sspsppsSppsspsppsS14oS4sS4
5Aacab1 = p4SpsSp3sp12s4ps3ppsSoS4ps3
5Aacac1 = p4Spssp3sp11spsspps4psSSoS3ps3
5Aacad1 = sp3sppsp3Sp3sp4sS17oSsS4
5Aacba1 = p4SpSSp3sp3sp6sps4ppsSspsS4oSsSSs
5Aacbb1 = p4Sppsp3sp3sp9ssppssp4sSSsSops3
5Aacbc1 = sp4spps3Ss3Ss3psS8sS6ppSspoS3
5Aacbd1 = p4sp6sp3sp4sS15ssSSsSoSS
5Agaea1 = Sp3ssp4sspsps4psS15ssSSsSSoS
5Agaea2 = sp3ssp4sspspspsspsS15ssSssS3o
---GRID_END---

---mini_tracker_end---
