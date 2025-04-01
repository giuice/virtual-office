# Module: hooks

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
2Ae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usenotification.ts
2Ae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Aba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-members.tsx
3Aba2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-settings.tsx
3Aba3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/invite-user-dialog.tsx
3Aba4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/message-feed.tsx
3Aba5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/user-profile.tsx
3Abb5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/index.tsx
3Abb7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-chat-integration.tsx
3Abc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/chatwindow.tsx
3Abc10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/room-messaging.tsx
3Abc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversationlist.tsx
3Abc4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/messagelist.tsx
3Abc7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-composer.tsx
3Abc8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-feed.tsx
3Abc9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-item.tsx
3Abd2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/search/global-search.tsx
3Abe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/shell/dashboard-header.tsx
3Abf16: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/sonner.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Aib3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iconversationrepository.ts
3Aib6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Aaba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/company/page.tsx
4Aabb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/dashboard/page.tsx
4Aabd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/office/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agac2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/create.ts
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/create.ts
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/remove-from-company.ts
4Aiaa6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasemessagerepository.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Aa3, 2Ad1, 2Ad2, 2Ae1, 2Ae2, 2Ae3, 2Ae4, 2Ae5, 2Af6, 2Ag1, 2Aj1, 2Aj4, 3Aba1, 3Aba2, 3Aba3, 3Aba4, 3Aba5, 3Abb5, 3Abb7, 3Abc1, 3Abc2, 3Abc4, 3Abc7, 3Abc8, 3Abc9, 3Abc10, 3Abd2, 3Abe1, 3Abf16, 3Ada2, 3Aib3, 3Aib6, 4Aaaa1, 4Aaab1, 4Aaac1, 4Aaba1, 4Aabb1, 4Aabd1, 4Aafa1, 4Agab1, 4Agab3, 4Agac2, 4Agad1, 4Agae1, 4Agae4, 4Aiaa6, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbb1, 5Aacbd1, 5Aacbe1
last_GRID_edit: Applied suggestion: 2Aj4 -> 3Aib6 (S)

---GRID_START---
X 2Aa3 2Ad1 2Ad2 2Ae1 2Ae2 2Ae3 2Ae4 2Ae5 2Af6 2Ag1 2Aj1 2Aj4 3Aba1 3Aba2 3Aba3 3Aba4 3Aba5 3Abb5 3Abb7 3Abc1 3Abc2 3Abc4 3Abc7 3Abc8 3Abc9 3Abc10 3Abd2 3Abe1 3Abf16 3Ada2 3Aib3 3Aib6 4Aaaa1 4Aaab1 4Aaac1 4Aaba1 4Aabb1 4Aabd1 4Aafa1 4Agab1 4Agab3 4Agac2 4Agad1 4Agae1 4Agae4 4Aiaa6 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbb1 5Aacbd1 5Aacbe1
2Aa3 = osps3p3spps7ppssSsSsSSp3s4Ssp16
2Ad1 = soSsspsspSSpssSpSp10sp4S3ppssp14s
2Ad2 = pSosspsppsSps3psp15ssp3s8pssp6
2Ae1 = s3oSppSspps6psS3sSSp3sSs4pps3p7s5pss
2Ae2 = s3SoppSSs9S7s3pSpSs15ps6
2Ae3 = sp4opsp3sp3sp7ssp3ssp24
2Ae4 = pssp3oppssppsspsp10sp4S4sSs7pspssppss
2Ae5 = pspSSsposppsppspssSs3S3spspSpspsppsp10sppspsS
2Af6 = p3sSppsoppSp3spps3ppSsp4S3p7ssppspS9
2Ag1 = sSspspspposps3pssp8ssp4S3ssSsppsp6sp4s
2Aj1 = pSSpspsppsop21s3p5spsspps4ppss
2Aj4 = p3s3psSppop3spsSsspsSSsp3S3p13SpsppSssp
3Aba1 = s5p4sppoSSsSSspssps4Sp4S7p15
3Aba2 = s5psppsppSoSsSSsppssSsSsSp4S7p15
3Aba3 = sSs3psspsppSSopSsspps7p4S3sS3p15
3Aba4 = spps3ppspps3posSs5SSspSp3sp3sSsp16
3Aba5 = sSs3psspsppS3soSspsSsS3sSp4S7p15
3Abb5 = sp3sppspspsSSsSSoSSs3S3sSp4s4SSsp15
3Abb7 = sppsSppSsppSs5SoSSsS4sspSps7p16
3Abc1 = p3SSppssppsp3spSSoS6sppspsp22
3Abc2 = p3SSppssppsspps3SSoS4sspps3p4sp17
3Abc4 = sppSSppsp4s4SssSSoS3sSSp4s3pSsp16
3Abc7 = sppsSppSp3sps5S4oS3sppspsppspsp17
3Abc8 = SppSSspSSppSsSsS8oSSsspSps5SSsp14s
3Abc9 = sppSSspSsppSs3S9oSsSpspspsspSssp13ss
3Abc10 = Sp3sppsp3ssSssS4ssS3ossp4s4Sssp15
3Abd2 = sp3sp4spps3ps5Ss4oSp4s7p15
3Abe1 = SsppspsspsppSSsS3sppSpsSsSop4S6sp15
3Abf16 = Sppspsp22op25
3Ada2 = p3SSspSSppSp6SsspsSsp4oSSp13SsSssSSss
3Aib3 = p3sp4SppSp8sp8SoSp13S4sSSsp
3Aib6 = p3sSppsSppSp3spps3ps3p4SSop13Ss4SSsp
4Aaaa1 = sSs3pSppSspS3pSssppspspssSp4oS6psppsp9s
4Aaab1 = sSs3pSspSspS3pSssppsps4Sp4SoS5s5pps4ppss
4Aaac1 = sSppspSppSspS3pSsspps6Sp4SSoS4pps3pps4ppsS
4Aaba1 = sp3spSppsppSSssSssp4spssSp4S3oSSsp15
4Aabb1 = SppsspsspsppS6spsSsS3sSp4S4oSSp15
4Aabd1 = s5pSppSppS3sSSsppspSs3Sp4S5oSp4sp10
4Aafa1 = ps4psppsppS3pSsp5s5p4S3sSSossp3sp9
4Agab1 = ppspspspsp24sp4soS5pS5sSs
4Agab3 = ppspspspspsp21ssp4sSoS4sS7s
4Agac2 = ppspspsppsp23ssp4SSoS3pS5sSS
4Agad1 = ppspspsp3sp22ssp4S3oSSpS5sSS
4Agae1 = ppspspspspsp21s3ppspS4oSsS8
4Agae4 = ppspspsp31sS5opS4s4
4Aiaa6 = p4sp3SppSp17S3p8sppspos4SSsp
5Aacaa1 = pps3pspSpsp18sSspssp4S6soS7
5Aacab1 = ppssp3sSpssp17SSspssp4S6sSoS6
5Aacac1 = p3sspspSssp18sSspssp4S6sSSoS5
5Aacad1 = p3sspspSpsp18s3pssp4S6sS3oS4
5Aacba1 = p3ssppsSppSp17S3p7S5sS5oS3
5Aacbb1 = p4sp3Sppsp17S3p7sSssSsS6oSS
5Aacbd1 = p3sspssSpssp12sp4s3pssp4S5ssS6oS
5Aacbe1 = pspsspsSSssp12ssp4sppssSp4ssS3spS7o
---GRID_END---

---mini_tracker_end---
