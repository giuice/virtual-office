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
2Ab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/nav.tsx
2Ad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/companycontext.tsx
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useconversations.ts
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usemessages.ts
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
2Ah1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/providers/theme-provider.tsx
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
3Aaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/layout.tsx
3Aab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/layout.tsx
3Aad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/setup-aws/page.tsx
3Aae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/test-aws/page.tsx
3Abb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/floorplancanvas.tsx
3Abb10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-template-selector.tsx
3Abb11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-templates.tsx
3Abb15: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/user-avatar.tsx
3Abb16: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/user-hover-card.tsx
3Abb4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/floor-plan.tsx
3Abb5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/index.tsx
3Abb6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/message-dialog.tsx
3Abb7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-chat-integration.tsx
3Abb8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-dialog.tsx
3Abb9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-management.tsx
3Abc10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/room-messaging.tsx
3Abc3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/messageinput.tsx
3Abc4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/messagelist.tsx
3Abc5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/roommessaging.tsx
3Abc6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversation-list.tsx
3Abc7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-composer.tsx
3Abc8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-feed.tsx
3Abc9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-item.tsx
3Abd2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/search/global-search.tsx
3Abe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/shell/dashboard-header.tsx
3Abe2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/shell/dashboard-shell.tsx
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Aabc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/floor-plan/layout.tsx
4Aabc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/floor-plan/page.tsx
4Aabd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/office/page.tsx
4Aabe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/settings/page.tsx
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agac2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/create.ts
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/create.ts
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
5Aabba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/dashboard/components/companyoverviewcard.tsx
5Aabba2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/dashboard/components/quicklinksgrid.tsx
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Aa3, 2Ab2, 2Ad2, 2Ae1, 2Ae2, 2Ae5, 2Ah1, 2Aj1, 3Aaa1, 3Aab1, 3Aad1, 3Aae1, 3Abb1, 3Abb4, 3Abb5, 3Abb6, 3Abb7, 3Abb8, 3Abb9, 3Abb10, 3Abb11, 3Abb15, 3Abb16, 3Abc3, 3Abc4, 3Abc5, 3Abc6, 3Abc7, 3Abc8, 3Abc9, 3Abc10, 3Abd2, 3Abe1, 3Abe2, 4Aaaa1, 4Aaab1, 4Aaac1, 4Aabc1, 4Aabc2, 4Aabd1, 4Aabe1, 4Agab1, 4Agab3, 4Agac1, 4Agac2, 4Agad1, 4Agae1, 4Agae2, 4Agae3, 5Aabba1, 5Aabba2, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacbd1, 5Aacbe1, 5Agaea1
last_GRID_edit: Applied suggestion: 2Ae5 -> 2Ae2 (S)

---GRID_START---
X 2Aa3 2Ab2 2Ad2 2Ae1 2Ae2 2Ae5 2Ah1 2Aj1 3Aaa1 3Aab1 3Aad1 3Aae1 3Abb1 3Abb4 3Abb5 3Abb6 3Abb7 3Abb8 3Abb9 3Abb10 3Abb11 3Abb15 3Abb16 3Abc3 3Abc4 3Abc5 3Abc6 3Abc7 3Abc8 3Abc9 3Abc10 3Abd2 3Abe1 3Abe2 4Aaaa1 4Aaab1 4Aaac1 4Aabc1 4Aabc2 4Aabd1 4Aabe1 4Agab1 4Agab3 4Agac1 4Agac2 4Agad1 4Agae1 4Agae2 4Agae3 5Aabba1 5Aabba2 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacbd1 5Aacbe1 5Agaea1
2Aa3 = ospssp3sspps13pssSsSsSs5Sssp9sp7
2Ab2 = sop6ssp11ssp7sps3pps3p10sp7
2Ad2 = pposp3Sp26s3ppsps7Sppssp4s
2Ae1 = spsoSSp9Ssp6S4sSSp4ssp3sp11s6p
2Ae2 = sppSoSp8sSSp6S7s3ps3ppsp15ssp
2Ae5 = p3SSop8sSSp6SsS5spsppsp16sppsSp
2Ah1 = p6opsp49
2Aj1 = ppSp4op26s3p5ssps3Spps7
3Aaa1 = ssp4spop23s8p18
3Aab1 = ssp7op21sSsSSs3Ssp17
3Aad1 = p10oSp11sp3spsp6sp21
3Aae1 = p10Sop22s3p21
3Abb1 = sp11oSSsS5ssppsspspSsspsppsSsp9ssp7
3Abb4 = sp11SoSsS5sSppSSpSsSssps4SSsp8SSp7
3Abb5 = sp3ssp6SSoS8ssSSsS3sSps4SSsp8SSp7
3Abb6 = sppS3p6ssSoS3sSSsS8ssps7p8Ssp7
3Abb7 = sppsSSp6S4oS4s4S6ssps3pssp10sp7
3Abb8 = sp11S5oS5s3SsSsS3ps4Sssp8ssp7
3Abb9 = sp11S6oSSsSs3SsSsSssps4Sssp8SSp7
3Abb10 = sp11S3sS3oSssppsSsSsSssps4Sssp8sSp7
3Abb11 = sp11S8ossppsSsSsSssps4Sssp8SSp7
3Abb15 = ssp10ssSSsSs3oSpSpSssSssSp3ssSssp8sSp7
3Abb16 = ssp10sSSssSSssSopspSsS3sSs5Sssp8sSp7
3Abc3 = sppS3p4sp3sSs3p4oS6s3ps3ppsp18
3Abc4 = sppSSsp8sSs3ppSsSoS5sSSps3pssp10sp7
3Abc5 = p3S3p6sS4s4ppSSoSsS3p3ssp3sp18
3Abc6 = sppS3p6sS13oS6ps3pSsp9sSp7
3Abc7 = sppsSSp4sp3sSSs6SSsSoS3sp4sp21
3Abc8 = SppS3p6sS8sS6oSSssps3pSSp9sSp5sp
3Abc9 = sppS3p4sppsS3s4S8oSsSppsspssp10sp4ssp
3Abc10 = Ssppssp6S9sSssS5ossps3pSsp9sSp7
3Abd2 = sp3sp4spps5Ss6SpSs4oSps3pssp10sp7
3Abe1 = SsppssppsSppssSssSs3SSsSpSpsSsSoS4sS3p8sSp7
3Abe2 = ssp6ssp12sp9SosppSSssp17
4Aaaa1 = s5ppssSps10ps5pspssSsoSSpsSspsp3sppssp5sp
4Aaab1 = sps4pssSpsps8ps5ps4SpSoSpsSs3ps3psSs8
4Aaac1 = spspspps5ps12ps6SpSSopSSspps13Ss
4Aabc1 = ssp6sspps4ps6p9sSp3oSssp17
4Aabc2 = Ssp6ssppS3ssS6pspSpSsSsSSssSSoSSp8SSp7
4Aabd1 = s5p3sSppsSSs12pSs3SsS3sSosp5sppSSp7
4Aabe1 = sp8sp3s3ps6p9Ss5Ssop8ssp7
4Agab1 = ppsp32sp5oS7ppS5sS
4Agab3 = ppsp4sp26ssp5SoS6ppS5sS
4Agac1 = ppsp4sp28sp4SSoS5ppS7
4Agac2 = ppsp32ssp4S3oS4ppS7
4Agad1 = ppsp4sp27ssp4S4oS3ppS7
4Agae1 = ppsp4sp26s3ppspS5oSSppS7
4Agae2 = ppsp4sp28sp4S6oSppS7
4Agae3 = ppSp4Sp27ssp4S7oppS7
5Aabba1 = p12sS3psSsSssp3spspspspsSspSSsp8oSp7
5Aabba2 = ssp10sSSs3S5pspSpSsSsSps3pSSsp8Sop7
5Aacaa1 = ppssp3sp27ssp4S8ppoS6
5Aacab1 = ppsspspsp27ssp4S8ppSoS5
5Aacac1 = p3sp3sp27ssp4S8ppSSoS4
5Aacad1 = p3sp3sp27ssp4S8ppS3oS3
5Aacbd1 = p3s3psp21sp5ssp4S8ppS4oSS
5Aacbe1 = p3ssSpsp20ssp4ssSp4ssS6ppS5oS
5Agaea1 = ppsp4sp27ssp4S8ppS6o
---GRID_END---

---mini_tracker_end---
