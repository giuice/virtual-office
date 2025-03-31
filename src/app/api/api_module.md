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
2Ad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messagingcontext.tsx
2Ad4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/searchcontext.tsx
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Ai1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Ai2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Ai3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Abc8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-feed.tsx
3Abc9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-item.tsx
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Ada3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/useconversations.ts
3Ada4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/usemessages.ts
3Ada5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/usesocketevents.ts
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
3Afb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Aga1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/setup-dynamo-tables.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
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
4Agae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/update.ts
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

last_KEY_edit: Assigned keys: 2Ad1, 2Ad2, 2Ad3, 2Ad4, 2Ae2, 2Af1, 2Af6, 2Ag1, 2Ai1, 2Ai2, 2Ai3, 3Abc8, 3Abc9, 3Ada1, 3Ada2, 3Ada3, 3Ada4, 3Ada5, 3Afa1, 3Afa2, 3Afa3, 3Afa4, 3Afa5, 3Afa6, 3Afa7, 3Afa8, 3Afa9, 3Afa10, 3Afa11, 3Afb1, 3Aga1, 4Aaaa1, 4Aaab1, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agae1, 4Agae2, 4Agae3, 4Agae5, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Aacbd1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Ai3 -> 2Ai2 (s)

---GRID_START---
X 2Ad1 2Ad2 2Ad3 2Ad4 2Ae2 2Af1 2Af6 2Ag1 2Ai1 2Ai2 2Ai3 3Abc8 3Abc9 3Ada1 3Ada2 3Ada3 3Ada4 3Ada5 3Afa1 3Afa2 3Afa3 3Afa4 3Afa5 3Afa6 3Afa7 3Afa8 3Afa9 3Afa10 3Afa11 3Afb1 3Aga1 4Aaaa1 4Aaab1 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agae1 4Agae2 4Agae3 4Agae5 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbc1 5Aacbd1 5Aacbe1 5Agaea1 5Agaea2
2Ad1 = oSppsppSSp6s3p11SpSSp5sp4sp9ssp
2Ad2 = Sops3ppSSp5sp4ssp5ssSs4SSssSssSsSssppsppsppSs
2Ad3 = ppop3sp3sS7p31sp6
2Ad4 = pspop42ssp8
2Ae2 = ssppoppssp22SSp8sp11spp
2Af1 = psp3ospsp24ssSs3pS3s7pspsSS
2Af6 = ppsppsop3SSssSsSsp3sp3sp9s3pps6SSsSSpsSss
2Ag1 = Sp3spposp22SSp5sp4sp9spp
2Ai1 = SSppsspsosp19Spssp9sSp9ssp
2Ai2 = pSp6sosp3sp3spsspssSpssSsp3ssppspsspspsp5sppss
2Ai3 = ppsp3SppsoS4s3p3sp23s3pSp6
3Abc8 = ppSp3Sp3SoS6p13ssp16sp3spp
3Abc9 = ppSp3sp3SSoSsS3p14sp20spp
3Ada1 = ppSp3sp3S3oS4p31sp6
3Ada2 = ppSp3SppsSSsSoS3p3sp3sp19sSssSsppspp
3Ada3 = ssSp3sp3sS4oSSp13ssp13sspsp3spp
3Ada4 = spSp3Sp3sS5oSp13ssp16sp3spp
3Ada5 = spSp3sp3sS6op14sp16sp3Spp
3Afa1 = p9sp8osSSsS6pSppssp16sp4
3Afa2 = p18sossSSs5psppssp16sp4
3Afa3 = psp7sp8SsoSsS6pSppSSs8pssp5sppss
3Afa4 = psp4sppssp3sp3SsSosS6pspps3ps4p3sSssSssSspss
3Afa5 = p18sSssoSs5psp3sp16sp4
3Afa6 = p9sp8S5oS5pSppsspps4p3sp6sppss
3Afa7 = p9sp8SsSSsSoS4pSppssp10sp5sp4
3Afa8 = p6sppSp4sp3SsSSsSSoS3pspps6ps3psspps3Sspss
3Afa9 = p18SsSSsS3oSSpsppssp16sp4
3Afa10 = psp7sp8SsSSsS4oSpSppsspps9p5sppss
3Afa11 = psp7sp8SsSSsS5opSppSSpps8p6sppss
3Afb1 = SSp6SSp19op8sp4Sp7sppsp
3Aga1 = psp7sp8SsSssSSssSSpoppS3s3S3s4ppsppsspss
4Aaaa1 = SsppSppSsppsp3ssp14oSp20spp
4Aaab1 = SsppSppSsppsspps3p13Sop3sp4sp11spp
4Agaa1 = psp3sp12ssSsps5SpSppoS12ppSspSSsSS
4Agab1 = pSp3sp3sp8ssSs7SpSppSoS11ssSppSSpSS
4Agab2 = pSp3Ssppsp10ssp3sp4SppSSoS10spSspSSsSS
4Agab3 = psp3ssp13sp4sp4spsS3oS9ssSssSSsSS
4Agab4 = psp3ssp13sspspspsspsppS4oS8ssSssSSsSS
4Agac1 = sSp3spspsp10sspspsps4ppS5oS7spSspSSsSS
4Agac2 = psp18sspsp3sspSppS6osS5ppSppSSsSS
4Agad1 = psp3Ssppsp10sspspspsspSppS6soS5ssSs3SsSS
4Agae1 = pSppsSsppsp10sp4spsspSpsS8oS4ssSssSSsSS
4Agae2 = psp3Sspsp11sp4spsspsppS9oS3ssSSpS5
4Agae3 = sSp3s3Ssp17ssSsppS10oSSpsSspSSsSS
4Agae5 = psp3ssp13sspspspsspsppS11oSssSspSSsSS
5Aacaa1 = psp3ssppssp3sp5sSppsspsppsppS12oS4sS5
5Aacab1 = p3spsSp3sp3Ssp5sp12s5ps3psSoS4ssSss
5Aacac1 = p3spsSp3sp3ssp5sp12spsspps5SSoS3psSss
5Aacad1 = psp3ssp7sp6Sp3sp4sppS15oSsS5
5Aacba1 = ppsppsSp3SspsSs3p3sp3sp7sps4pssSssS4oSsS3s
5Aacbb1 = p6Sp7sp6sp3sp10ssppssp3sSSsSos5
5Aacbc1 = psp3sp3sp8s3Ss3Ss5ppS7sS5spSssoSsSS
5Aacbd1 = p6sp14sp3sp4sppS13ssSSsSoS3
5Aacbe1 = sp3ssSssppssps3Sp13s3ps7SssS5ssSoSS
5Agaea1 = sSp3Sspssp10sspspsps4ppS13ssSSsS3oS
5Agaea2 = psp3Ssppsp10sspspspsspsppS13ssSssS4o
---GRID_END---

---mini_tracker_end---
