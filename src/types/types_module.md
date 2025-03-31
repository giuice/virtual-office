# Module: types

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
2Ad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messagingcontext.tsx
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usenotification.ts
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Ai1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Ai2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Ai3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Aba4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/message-feed.tsx
3Abb13: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/types.ts
3Abb14: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/types.tsx
3Abb5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/index.tsx
3Abc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/chatwindow.tsx
3Abc10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/room-messaging.tsx
3Abc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversationlist.tsx
3Abc5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/roommessaging.tsx
3Abc7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-composer.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Ada3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/useconversations.ts
3Ada4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/usemessages.ts
3Ada5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/usesocketevents.ts
3Afa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/announcements.ts
3Afa10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/spaces.ts
3Afa11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/users.ts
3Afa12: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/utils.ts
3Afa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/companies.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afa6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/invitations.ts
3Afa7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/meetingnotes.ts
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/get.ts
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Agae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/remove-from-company.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacbc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad3, 2Ae1, 2Ae2, 2Af1, 2Ag1, 2Ai1, 2Ai2, 2Ai3, 3Aba4, 3Abb5, 3Abb13, 3Abb14, 3Abc1, 3Abc2, 3Abc5, 3Abc7, 3Abc10, 3Ada2, 3Ada3, 3Ada4, 3Ada5, 3Afa1, 3Afa3, 3Afa4, 3Afa6, 3Afa7, 3Afa10, 3Afa11, 3Afa12, 3Aga1, 4Aaaa1, 4Aaab1, 4Aaac1, 4Agab1, 4Agab2, 4Agac1, 4Agad1, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacbc1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Ai3 -> 3Afa4 (s)

---GRID_START---
X 2Ad3 2Ae1 2Ae2 2Af1 2Ag1 2Ai1 2Ai2 2Ai3 3Aba4 3Abb5 3Abb13 3Abb14 3Abc1 3Abc2 3Abc5 3Abc7 3Abc10 3Ada2 3Ada3 3Ada4 3Ada5 3Afa1 3Afa3 3Afa4 3Afa6 3Afa7 3Afa10 3Afa11 3Afa12 3Aga1 4Aaaa1 4Aaab1 4Aaac1 4Agab1 4Agab2 4Agac1 4Agad1 4Agae1 4Agae2 4Agae3 4Agae4 5Aacaa1 5Aacab1 5Aacac1 5Aacbc1 5Aacbe1 5Agaea1 5Agaea2
2Ad3 = op6sp4S4sS4p27
2Ae1 = pop5ssp8sppsp27
2Ae2 = ppopssp24S3p3ssp7spp
2Af1 = p3os3p26sSsS3sppsspsSS
2Ag1 = ppssosp3sp20S3ppsp3sp5spp
2Ai1 = pps3osp23s3p5sSp5ssp
2Ai2 = p3spsospsSsp5sp3s9p3s5ps3ppspss
2Ai3 = ssp4sos9Ss3ppsp18ssp4
3Aba4 = psp5soSps3pssppsp28
3Abb5 = p4spssSoS3sSsSspssp9s3p15
3Abb13 = p6SspSoSp36
3Abb14 = p6s3SSop36
3Abc1 = Sp6ssSppoS4sSSsp27
3Abc2 = Sp6s3ppSosSssSSsp27
3Abc5 = Sp6spSppSsosSsS3p9ssp16
3Abc7 = Sp6s3ppSSsoSssSSp11sp15
3Abc10 = sp6ssSppSsSSoppssp9s3p15
3Ada2 = Ssp4sSpspps4poS3ppsp17sSspspp
3Ada3 = Sp6sp4S3spSoSSp9s3p9sspspp
3Ada4 = Sp6s3ppS4sSSoSp9s3p12spp
3Ada5 = Ssp5spsppssSSsS3op10sp13Spp
3Afa1 = p6sp14oS8p3sp6sp3sp3
3Afa3 = p6sp14SoS7p3Ss5pSp3spss
3Afa4 = p6ssp9sp3SSoS4ssp3s4p3sSssSpss
3Afa6 = p6sp14S3oS5p3spssp3Sp3spss
3Afa7 = p6sp14S4oS4p3sp6sp3sp3
3Afa10 = p6sp14S5oS3p3spps5p3spss
3Afa11 = p6sp14S6oSSp3Sps5Sp3spss
3Afa12 = p6sp14SSsS4osp18
3Aga1 = p6sp14SSsS4sop3SSsSSssSsppspss
4Aaaa1 = ppSpSsp3sp4spspssp10oSSp12spp
4Aaab1 = ppSpSsp3sp4spsps3p9SoSp3ssp7spp
4Aaac1 = ppSpSsp3sp5sspssp10SSop5sp6Ssp
4Agab1 = p3sppsp14sSs4SpSp3oS8ssSpSS
4Agab2 = p3Sppsp15ssp5Sp3SoS7spSsSS
4Agac1 = p3sspsp15s3ppspsp3SSoS6spSsSS
4Agad1 = ppsSppsp15s3psspSpspS3oS5s4SS
4Agae1 = ppsSppsp15sp3sspSpspS4oS4ssSsSS
4Agae2 = p3Spsp16sp3sspsppsS5oS3ssS4
4Agae3 = p3ssSsp19sspsp3S6oSSpsSsSS
4Agae4 = p6sp14sSsSssSpSp3S7oSppSpSS
5Aacaa1 = p6sp10sp5Sp5sp3S8oS6
5Aacab1 = p3sp3sp9Ssp4sp9s6ppSoSpSss
5Aacac1 = p3sp3sp9ssp4sp9spps4pSSopSss
5Aacbc1 = p6sp14ssSs4psp3S3sS5pposSS
5Aacbe1 = pps4p11s3Sp9ssSps4SspS3soSS
5Agaea1 = p3Spssp15s3psspsppsS9ssSSoS
5Agaea2 = p3Sppsp15s3psspsp3S9ssS3o
---GRID_END---

---mini_tracker_end---
