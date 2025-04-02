# Module: (auth)

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
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useconversations.ts
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usemessages.ts
2Ae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
3Aaa: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)
3Aaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/layout.tsx
3Aab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/layout.tsx
3Aad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/setup-aws/page.tsx
3Aba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-members.tsx
3Aba2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-settings.tsx
3Aba3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/invite-user-dialog.tsx
3Aba5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/user-profile.tsx
3Abb4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/floor-plan.tsx
3Abb5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/index.tsx
3Abb8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-dialog.tsx
3Abb16: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/user-hover-card.tsx
3Abc6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversation-list.tsx
3Abc8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-feed.tsx
3Abc9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-item.tsx
3Abe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/shell/dashboard-header.tsx
4Aaaa: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Aaba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/company/page.tsx
4Aabb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/dashboard/page.tsx
4Aabc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/floor-plan/page.tsx
4Aabd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/office/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
5Aabba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/dashboard/components/companyoverviewcard.tsx
5Aabba2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/dashboard/components/quicklinksgrid.tsx
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Aa3, 2Ad1, 2Ad2, 2Ae1, 2Ae2, 2Ae4, 2Ag1, 3Aaa, 3Aaa1, 3Aab1, 3Aad1, 3Aba1, 3Aba2, 3Aba3, 3Aba5, 3Abb4, 3Abb5, 3Abb8, 3Abb16, 3Abc6, 3Abc8, 3Abc9, 3Abe1, 4Aaaa, 4Aaaa1, 4Aaab, 4Aaab1, 4Aaac, 4Aaac1, 4Aaba1, 4Aabb1, 4Aabc2, 4Aabd1, 4Aafa1, 4Agab2, 4Agab3, 4Agae1, 5Aabba1, 5Aabba2, 5Aacbd1, 5Aacbe1
last_GRID_edit: Applied suggestions (2025-04-02T12:01:19.696150)

---GRID_START---
X 2Aa3 2Ad1 2Ad2 2Ae1 2Ae2 2Ae4 2Ag1 3Aaa 3Aaa1 3Aab1 3Aad1 3Aba1 3Aba2 3Aba3 3Aba5 3Abb4 3Abb5 3Abb8 3Abb16 3Abc6 3Abc8 3Abc9 3Abe1 4Aaaa 4Aaaa1 4Aaab 4Aaab1 4Aaac 4Aaac1 4Aaba1 4Aabb1 4Aabc2 4Aabd1 4Aafa1 4Agab2 4Agab3 4Agae1 5Aabba1 5Aabba2 5Aacbd1 5Aacbe1
2Aa3 = oppssp3ssps9SsSpspspspsSsp5spp
2Ad1 = poSspsSp4spSSp9SpSpSp3spsp6
2Ad2 = pSosp9ssp9spspsp3ssSssp4
2Ae1 = s3oSp8ssp4S3ppspsp5sp6ss
2Ae2 = sppSop9spsppS3spspspsp3sp6ss
2Ae4 = psp3osppSp14SpSpSsppSp7s
2Ag1 = pSp3soppsps4p7spSpSpSsppSsp6s
3Aaa = p7op33
3Aaa1 = sp7op13spspspsppssp8
3Aab1 = sp4Ssppop12SpSpSpsSssSp8
3Aad1 = p10op10sp6sp12
3Aba1 = ssp4sp4oS3sS3s3SpSpSpS6p3sspp
3Aba2 = sp5sp4SoS5sSSsSpSpSpS6p3SSpp
3Aba3 = sSssppsp4SSoSpssps4pSpSpSpspSSp7
3Aba5 = sSs3psp4S3osSsS5pSpSpS6p3Sspp
3Abb4 = sp10sSpsoS5sspspspspsSSp4SSpp
3Abb5 = sp3sp6SSsSSoS6pspspssS3p4SSpp
3Abb8 = sp10SSssSSoS3sSpspspspsSsp4sspp
3Abb16 = sp10SspS4oS4pspspspSSsp4sSpp
3Abc6 = sppSSp6sSsS5oS3pspsps3Sssp3sSpp
3Abc8 = SppSSp6sSsS6oSspspspspsSSsp3sSps
3Abc9 = sppSSp5s4SsSsS3oSp3spsppssp5s3
3Abe1 = Sp3spspsSpSSsSsS4sSopSpSpS5sp3sSpp
4Aaaa = p23op17
4Aaaa1 = sSs3SSpsSpS4s6pSpopSpS3sSSs5ps
4Aaab = p25op15
4Aaab1 = sSs3SSpsSpS4s7SpSpopS3sSSs3Ss3
4Aaac = p27op13
4Aaac1 = sSspsSSps3S4s7SpSpSpoSsS3pps4S
4Aaba1 = p5ssppSpSSpSpsppsppSpSpSpSoS3sp3Sspp
4Aabb1 = sp8spSSsSsSsSsspSpSpSpsSoSSsp3SSpp
4Aabc2 = Sp7sspSSpS7sSpspspS3oSp4SSpp
4Aabd1 = s5SSpsSpS6s3SsSpSpSpS4oSppsSSpp
4Aafa1 = ppsp3sp4S4p4sspspSpSpSsspSop3sp3
4Agab2 = psSp21spsp7oSSppSs
4Agab3 = ppsp21spsp7SoSppSs
4Agae1 = ppsp21spspsp3spSSoppSS
5Aabba1 = p11sSpS3s4pspspSpsS4sp3oSpp
5Aabba2 = sp10sSpsSSsS3sSpspspssS3p4Sopp
5Aacbd1 = p3ssp16sp4spsp5S3ppoS
5Aacbe1 = p3s4p13ssppspspSp5ssSppSo
---GRID_END---

---mini_tracker_end---
