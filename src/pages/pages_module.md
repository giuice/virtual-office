# Module: pages

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
2Aa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/layout.tsx
2Ad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/authcontext.tsx
2Ad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/companycontext.tsx
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/aws-config.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Ai1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Ai2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
3Aab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/layout.tsx
3Aba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-members.tsx
3Aba2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-settings.tsx
3Aba3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/invite-user-dialog.tsx
3Aba5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/user-profile.tsx
3Abb5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/index.tsx
3Abd2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/search/global-search.tsx
3Abe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/shell/dashboard-header.tsx
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
4Aaba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/company/page.tsx
4Aabb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/dashboard/page.tsx
4Aabc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/floor-plan/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
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

last_KEY_edit: Assigned keys: 2Aa3, 2Ad1, 2Ad2, 2Ae2, 2Af1, 2Af3, 2Af6, 2Ag1, 2Ai1, 2Ai2, 3Aab1, 3Aba1, 3Aba2, 3Aba3, 3Aba5, 3Abb5, 3Abd2, 3Abe1, 3Afa1, 3Afa2, 3Afa3, 3Afa4, 3Afa5, 3Afa6, 3Afa7, 3Afa8, 3Afa9, 3Afa10, 3Afa11, 3Afa12, 3Afb1, 3Aga1, 3Aga2, 4Aaab1, 4Aaac1, 4Aaba1, 4Aabb1, 4Aabc2, 4Aafa1, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbc1, 5Aacbd1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Ai2 -> 3Afa12 (s)

---GRID_START---
X 2Aa3 2Ad1 2Ad2 2Ae2 2Af1 2Af3 2Af6 2Ag1 2Ai1 2Ai2 3Aab1 3Aba1 3Aba2 3Aba3 3Aba5 3Abb5 3Abd2 3Abe1 3Afa1 3Afa2 3Afa3 3Afa4 3Afa5 3Afa6 3Afa7 3Afa8 3Afa9 3Afa10 3Afa11 3Afa12 3Afb1 3Aga1 3Aga2 4Aaab1 4Aaac1 4Aaba1 4Aabb1 4Aabc2 4Aafa1 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbc1 5Aacbd1 5Aacbe1 5Agaea1 5Agaea2
2Aa3 = osp5spps7Sp15s3SSp25
2Ad1 = soSsSppSSppssSSppsSp11SppSSp3sp5sp4sp10ssp
2Ad2 = pSossppsSSps4p3Spssp5sspSspssp3ssSSssSssSsSs3ppsppsppSs
2Ae2 = pssop3sspSps3ppsp15S3spsp7ssp12spp
2Af1 = pSspops4p8Sp19s3Ss4S3sps6pspsSS
2Af3 = p5op13sp12sp6sp23
2Af6 = p4spop14sp3sp15s3pps4pssSSsSSpsSss
2Ag1 = sSs3pposps8p15SSs4p5sp4sp10spp
2Ai1 = pSSssppsosp8Sp11Sppssp13sSp10ssp
2Ai2 = ppSpsp3sop5sppspsspssSs4Ssp8ssppspsspsspsp5sppss
3Aab1 = sppSp3sppopsp3sSp15SsSssp25
3Aba1 = s3p4sp3oS4sSp15S6p24
3Aba2 = s4p3sppsSoS3sSp15S6p24
3Aba3 = sSssp3sp3SSoSs3p15SSsSsSp24
3Aba5 = sSssp3sp3S3oSsSp15S6p24
3Abb5 = sp6spspSSsSosSp15s3SSsp24
3Abd2 = sp6spps6oSp15s6p24
3Abe1 = Sspsp3sppS3sS3op15S5sp24
3Afa1 = pSSpSp3Ssp8osSSsS7pSSp6ssp3sp5sp7sp4
3Afa2 = p5sp12sossSSs5ppsSp6ssp9sp7sp4
3Afa3 = ppsp6sp8SsoSsS7pSSp6SSs8pSssp5sppss
3Afa4 = ppsp3sppsp8SsSosS6spssp6s3ps4p3ssSssSssSspss
3Afa5 = p18sSssoSs5ppsp8sp9sp7sp4
3Afa6 = p9sp8S5oS6pSSp6sspps4p3Ssp6sppss
3Afa7 = p9sp8SsSSsSoS5pSsp6ssp9spsp5sp4
3Afa8 = p6sppSp8SsSSsSSoS3spssp6s6ps3pSsspps3Sspss
3Afa9 = p9sp8SsSSsS3oS3pssp6ssppsppsp3ssp6sppsp
3Afa10 = ppsp6sp8SsSSsS4oSSpSSp6sspps10p5sppss
3Afa11 = ppsp6sp8SsSSsS5oSpSSp6SSpps7Ssp6sppss
3Afa12 = p9sp8SpSspSSsS3opsp31
3Afb1 = pSSp5SSp20op13sp4Sp8sppsp
3Aga1 = ppsp6sp8SsSssSSssSSspoSp6S3s3S3ssSssppsppsspss
3Aga2 = p5sp12S3spSs3SSppSop6S7sS6ppSppSSpSS
4Aaab1 = sSsSp3SspS5ssSp15oS3sSp3sp3ssp12spp
4Aaac1 = sSsSp3SspsS4ssSp15SoS4p9sp11Ssp
4Aaba1 = sppSp3sppS3sSssSp15SSoSSsp24
4Aabb1 = Sppsp3sppsS5sSp15S3oSSp24
4Aabc2 = Sp6sppsSSsSSsSp15sS3osp24
4Aafa1 = ps4ppsp3S4s3p15SSsSsop24
4Agaa1 = ppspssp12ssSsps5SppSSp6oS13ppSspSSsSS
4Agab1 = ppSpsp4sp8ssSs7SppSSp6SoS12ssSppSSpSS
4Agab2 = ppSpSpsppsp10ssp3sp5SSp6SSoS11spSspSSsSS
4Agab3 = ppspspsp13sp4sp5sSsp5S3oS10ssSssSSsSS
4Agab4 = ppspspsp13sspsps4ppsSp6S4oS9ssSssSSsSS
4Agac1 = psSpsppspsp8spsspspspsspssSp6S5oS8spSspSSsSS
4Agac2 = ppspsp15sspsp3ssppSSp6S6osS6ppSppSSsSS
4Agad1 = ppssSpsppsp10sspsps4ppSssp5S6soS6ssSs3SsSS
4Agae1 = ppSsSpsppsp10sp4spssppSSsp5S8oS5ssSssSSsSS
4Agae2 = ppspSpspsp11sp4spssppsSpsp4S9oS4ssSSpS5
4Agae3 = psSpspssSsp17sspSsSp6S10oS3psSspSSsSS
4Agae4 = ppsp6sp8ssSssSsSssSppSSp6S11oSSppSppSSpSS
4Agae5 = ppspspsp13sspsps4ppsSp6S12oSssSspSSsSS
5Aacaa1 = ppspspsppsp10sSppsspsp3sSp6S13oS4sS5
5Aacab1 = p4spSp14sp18s5ps3ppsSoS4ssSss
5Aacac1 = p4spSp14sp18spsspps4psSSoS3psSss
5Aacad1 = ppspspsp14Sp3sp5sSp6S16oSsS5
5Aacba1 = p4spSp14sp3sp13sps4pssSspsS4oSsS3s
5Aacbb1 = p6Sp14sp3sp16ssppssp4sSSsSos5
5Aacbc1 = ppspsp4sp8s3Ss3Ss3pssSp6S7sS6spSssoSsSS
5Aacbd1 = p6sp14sp3sp5sSp6S14ssSSsSoS3
5Aacbe1 = pspsspSssp24sSp4sps7SspsS5ssSoSS
5Agaea1 = psSpSpspssp10sspsps4pssSpsp4S14ssSSsS3oS
5Agaea2 = ppspSpsppsp10sspspspssppsSp6S14ssSssS4o
---GRID_END---

---mini_tracker_end---
