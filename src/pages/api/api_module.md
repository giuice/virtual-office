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
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Ai1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Ai2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
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
3Afb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
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
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad1, 2Ad2, 2Ae2, 2Af1, 2Af3, 2Af6, 2Ag1, 2Ai1, 2Ai2, 3Afa1, 3Afa2, 3Afa3, 3Afa4, 3Afa5, 3Afa6, 3Afa7, 3Afa8, 3Afa9, 3Afa10, 3Afa11, 3Afa12, 3Afb1, 3Aga1, 3Aga2, 4Aaab1, 4Aaac1, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Aacbd1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Ai2 -> 3Afa12 (s)

---GRID_START---
X 2Ad1 2Ad2 2Ae2 2Af1 2Af3 2Af6 2Ag1 2Ai1 2Ai2 3Afa1 3Afa2 3Afa3 3Afa4 3Afa5 3Afa6 3Afa7 3Afa8 3Afa9 3Afa10 3Afa11 3Afa12 3Afb1 3Aga1 3Aga2 4Aaab1 4Aaac1 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbc1 5Aacbd1 5Aacbe1 5Agaea1 5Agaea2
2Ad1 = oSsSppSSpSp11SppSSp5sp4sp10ssp
2Ad2 = SossppsS3pssp5sspSsps3SSssSssSsSs3ppsppsppSs
2Ae2 = ssop3ssp16SSp7ssp12spp
2Af1 = Sspops4Sp16ssSs4S3sps6pspsSS
2Af3 = p4op5sp12sppsp23
2Af6 = p3spop6sp3sp11s3pps4pssSSsSSpsSss
2Ag1 = Ss3pposp16SSp5sp4sp10spp
2Ai1 = SSssppsosSp11Sppssp9sSp10ssp
2Ai2 = pSpsp3sospsspssSs4Ssp4ssppspsspsspsp5sppss
3Afa1 = SSpSp3SsosSSsS7pSSppssp3sp5sp7sp4
3Afa2 = p4sp4sossSSs5ppsSppssp9sp7sp4
3Afa3 = psp6sSsoSsS7pSSppSSs8pSssp5sppss
3Afa4 = psp3sppsSsSosS6spsspps3ps4p3ssSssSssSspss
3Afa5 = p9sSssoSs5ppsp4sp9sp7sp4
3Afa6 = p8sS5oS6pSSppsspps4p3Ssp6sppss
3Afa7 = p8sSsSSsSoS5pSsppssp9spsp5sp4
3Afa8 = p5sppSSsSSsSSoS3spsspps6ps3pSsspps3Sspss
3Afa9 = p8sSsSSsS3oS3pssppssppsppsp3ssp6sppsp
3Afa10 = psp6sSsSSsS4oSSpSSppsspps10p5sppss
3Afa11 = psp6sSsSSsS5oSpSSppSSpps7Ssp6sppss
3Afa12 = p8sSpSspSSsS3opsp27
3Afb1 = SSp5SSp12op9sp4Sp8sppsp
3Aga1 = psp6sSsSssSSssSSspoSppS3s3S3ssSssppsppsspss
3Aga2 = p4sp4S3spSs3SSppSoppS7sS6ppSppSSpSS
4Aaab1 = SsSp3Ssp16oSp3sp3ssp12spp
4Aaac1 = SsSp3Ssp16Sop9sp11Ssp
4Agaa1 = pspssp4ssSsps5SppSSppoS13ppSspSSsSS
4Agab1 = pSpsp4s3Ss7SppSSppSoS12ssSppSSpSS
4Agab2 = pSpSpsppsppssp3sp5SSppSSoS11spSspSSsSS
4Agab3 = pspspsp5sp4sp5sSspS3oS10ssSssSSsSS
4Agab4 = pspspsp5sspsps4ppsSppS4oS9ssSssSSsSS
4Agac1 = sSpsppspsspsspspspsspssSppS5oS8spSspSSsSS
4Agac2 = pspsp7sspsp3ssppSSppS6osS6ppSppSSsSS
4Agad1 = pssSpsppsppsspsps4ppSsspS6soS6ssSs3SsSS
4Agae1 = pSsSpsppsppsp4spssppSSspS8oS5ssSssSSsSS
4Agae2 = pspSpspsp3sp4spssppsSpsS9oS4ssSSpS5
4Agae3 = sSpspssSsp9sspSsSppS10oS3psSspSSsSS
4Agae4 = psp6s3SssSsSssSppSSppS11oSSppSppSSpSS
4Agae5 = pspspsp5sspsps4ppsSppS12oSssSspSSsSS
5Aacaa1 = pspspsppsppsSppsspsp3sSppS13oS4sS5
5Aacab1 = p3spSp6sp14s5ps3ppsSoS4ssSss
5Aacac1 = p3spSp6sp14spsspps4psSSoS3psSss
5Aacad1 = pspspsp6Sp3sp5sSppS16oSsS5
5Aacba1 = p3spSp6sp3sp9sps4pssSspsS4oSsS3s
5Aacbb1 = p5Sp6sp3sp12ssppssp4sSSsSos5
5Aacbc1 = pspsp4s4Ss3Ss3pssSppS7sS6spSssoSsSS
5Aacbd1 = p5sp6sp3sp5sSppS14ssSSsSoS3
5Aacbe1 = spsspSssp16sSsps7SspsS5ssSoSS
5Agaea1 = sSpSpspssppsspsps4pssSpsS14ssSSsS3oS
5Agaea2 = pspSpsppsppsspspspssppsSppS14ssSssS4o
---GRID_END---

---mini_tracker_end---
