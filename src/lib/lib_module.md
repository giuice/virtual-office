# Module: lib

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
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/avatar-utils.ts
2Af3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/aws-config.ts
2Af4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo.d.ts
2Af5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Af7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/utils.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Ai2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
3Aba4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/message-feed.tsx
3Aba5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/user-profile.tsx
3Abb13: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-tooltip.tsx
3Abb15: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/types.tsx
3Abb17: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/user-hover-card.tsx
3Abb6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/index.tsx
3Abb7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/message-dialog.tsx
3Abc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/chatwindow.tsx
3Abc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversationlist.tsx
3Abc9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-item.tsx
3Abe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/shell/dashboard-header.tsx
3Abf1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/avatar.tsx
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/usesocketevents.ts
3Afa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Aga2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/test-aws.ts
4Aabc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/floor-plan/page.tsx
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
4Agad5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/update.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react/route.ts
5Agada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad2, 2Ad3, 2Af1, 2Af2, 2Af3, 2Af4, 2Af5, 2Af6, 2Af7, 2Ag1, 2Ai2, 3Aba4, 3Aba5, 3Abb6, 3Abb7, 3Abb13, 3Abb15, 3Abb17, 3Abc1, 3Abc2, 3Abc9, 3Abe1, 3Abf1, 3Ada1, 3Ada5, 3Afa1, 3Aga2, 4Aabc2, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad5, 5Aacaa1, 5Aacab1, 5Aacba1, 5Aacbc1, 5Agada1, 5Agada2
last_GRID_edit: Applied suggestion: 2Ai2 -> 4Agad3 (s)

---GRID_START---
X 2Ad2 2Ad3 2Af1 2Af2 2Af3 2Af4 2Af5 2Af6 2Af7 2Ag1 2Ai2 3Aba4 3Aba5 3Abb6 3Abb7 3Abb13 3Abb15 3Abb17 3Abc1 3Abc2 3Abc9 3Abe1 3Abf1 3Ada1 3Ada5 3Afa1 3Aga2 4Aabc2 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad5 5Aacaa1 5Aacab1 5Aacba1 5Aacbc1 5Agada1 5Agada2
2Ad2 = opSp3sppsSpsp12SppS3ssS5sp3sSs
2Ad3 = pop5sp4spSp3S3ppSSp16sp3
2Af1 = Spop4spssp14SppssSssSsS4s4SS
2Af2 = p3op7s3ps3p3ssp4sp17
2Af3 = p4op21spsp16
2Af4 = p5op39
2Af5 = sp5op3sp15SpSSs4Ss4p3s3
2Af6 = pssp4op3sppsp3s3ppssp5s3pps4S3pss
2Af7 = p8op36
2Ag1 = spsp6oppssp7sp5sp9sp7
2Ai2 = Spsp3sp3oppsppsp8Sp3ssppspspsp5ss
3Aba4 = p3sp3sp3osSs3SssSSp5Sp17
3Aba5 = sspsp5spsoSsspSpsSSs3ppSp17
3Abb6 = p3sp5ssSSoS5sSSp5Sp17
3Abb7 = pSp5sp3ssSospsS3spSSppsp17
3Abb13 = p3sp7ssSsosSpsSSsp4Sp17
3Abb15 = p3sp6sspSpsosp9Sp17
3Abb17 = p3sp7S3sSsopsSSsp4Sp17
3Abc1 = pSp5sp3spSSp3oSSppSsp20
3Abc2 = pSp5sp3s3SspsSoSps3p20
3Abc9 = pSp5sp3S5pS3oSpSSppsp17
3Abe1 = p3sp5spS3sSpSppSosp4Sp17
3Abf1 = p3sp8sppspspspsop4sp17
3Ada1 = pSp5sp4spSp3SsSppoSp16sp3
3Ada5 = pSp5sp4spSp3ssSppSop16sp3
3Afa1 = SpSp7Sp14op7sp3Sp4ssp
3Aga2 = p4spSp19opS11p3sSS
4Aabc2 = p3sp5spS3sS3ppsSsp4op17
4Agaa1 = SpspspSp19SpoS10ppsS3
4Agab1 = Spsp3Sp3sp15SpSoS9pspS3
4Agab2 = SpSp3ssppsp15SpSSoS8spssSS
4Agab3 = spsp3ssp18SpS3oS7s4SS
4Agab4 = spsp3ssp18SpS4oS6s3S3
4Agac1 = SpSp3sp3sp14sSpS5oS5spsS3
4Agac2 = Spsp3Sp19SpS6oS4p3S3
4Agad1 = SpSp3ssppsp15SpS7oS3s4SS
4Agad2 = SpSp3ssp18SpS8oSSssS4
4Agad3 = SpSp3sspssp14SSpS9oSpssS3
4Agad5 = spSp3ssp18SpS10os3S3
5Aacaa1 = ppsp4Sp22s4psspsoSSs3
5Aacab1 = ppsp4Sp21spsspps4SoSpss
5Aacba1 = pssp4Sp15ssp3sps4psSssSSoSSs
5Aacbc1 = spsp3sp18sspSSssS3sS3spSoSS
5Agada1 = SpSp3ssppsp14sSpS11ssSSoS
5Agada2 = spSp3ssppsp15SpS11s3SSo
---GRID_END---

---mini_tracker_end---
