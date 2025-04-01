# Module: contexts

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
2Ad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/searchcontext.tsx
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useconversations.ts
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usemessages.ts
2Ae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usenotification.ts
2Ae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Aj3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Aba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-members.tsx
3Aba2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-settings.tsx
3Aba3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/invite-user-dialog.tsx
3Aba5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/user-profile.tsx
3Abb3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/roomscontext.tsx
3Abc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/chatwindow.tsx
3Abc10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/room-messaging.tsx
3Abc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversationlist.tsx
3Abc5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/roommessaging.tsx
3Abc6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversation-list.tsx
3Abc7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-composer.tsx
3Abc9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-item.tsx
3Abd2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/search/global-search.tsx
3Abe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/shell/dashboard-header.tsx
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Afa11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/users.ts
3Afa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/companies.ts
3Afa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/conversations.ts
3Afa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/dynamo/messages.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imeetingnoterepository.ts
3Aib6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aabb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/dashboard/page.tsx
4Aabd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/office/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Agab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/cleanup.ts
4Agab2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/create.ts
4Agab3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/get.ts
4Agab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/companies/update.ts
4Agac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/accept.ts
4Agac2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/invitations/create.ts
4Agad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/create.ts
4Agad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/delete.ts
4Agad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/get.ts
4Agad4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/spaces/update.ts
4Agae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/by-company.ts
4Agae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/create.ts
4Agae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/get-by-firebase-id.ts
4Agae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/remove-from-company.ts
4Agae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/update.ts
4Aiaa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseconversationrepository.ts
4Aiaa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseuserrepository.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
5Aacba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/create/route.ts
5Aacbc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/react/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
5Agaea1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/index.ts
5Agaea2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/users/[id]/status.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Aa3, 2Ad1, 2Ad2, 2Ad3, 2Ae1, 2Ae2, 2Ae3, 2Ae4, 2Ae5, 2Af1, 2Af6, 2Aj3, 2Aj4, 3Aba1, 3Aba2, 3Aba3, 3Aba5, 3Abb3, 3Abc1, 3Abc2, 3Abc5, 3Abc6, 3Abc7, 3Abc9, 3Abc10, 3Abd2, 3Abe1, 3Ada1, 3Ada2, 3Afa3, 3Afa4, 3Afa8, 3Afa11, 3Aib2, 3Aib5, 3Aib6, 4Aaaa1, 4Aaab1, 4Aabb1, 4Aabd1, 4Aafa1, 4Agaa1, 4Agab1, 4Agab2, 4Agab3, 4Agab4, 4Agac1, 4Agac2, 4Agad1, 4Agad2, 4Agad3, 4Agad4, 4Agae1, 4Agae2, 4Agae3, 4Agae4, 4Agae5, 4Aiaa3, 4Aiaa8, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1, 5Aacba1, 5Aacbc1, 5Aacbd1, 5Aacbe1, 5Agaea1, 5Agaea2
last_GRID_edit: Applied suggestion: 2Aj4 -> 2Ae5 (s)

---GRID_START---
X 2Aa3 2Ad1 2Ad2 2Ad3 2Ae1 2Ae2 2Ae3 2Ae4 2Ae5 2Af1 2Af6 2Aj3 2Aj4 3Aba1 3Aba2 3Aba3 3Aba5 3Abb3 3Abc1 3Abc2 3Abc5 3Abc6 3Abc7 3Abc9 3Abc10 3Abd2 3Abe1 3Ada1 3Ada2 3Afa3 3Afa4 3Afa8 3Afa11 3Aib2 3Aib5 3Aib6 4Aaaa1 4Aaab1 4Aabb1 4Aabd1 4Aafa1 4Agaa1 4Agab1 4Agab2 4Agab3 4Agab4 4Agac1 4Agac2 4Agad1 4Agad2 4Agad3 4Agad4 4Agae1 4Agae2 4Agae3 4Agae4 4Agae5 4Aiaa3 4Aiaa8 5Aacaa1 5Aacab1 5Aacac1 5Aacad1 5Aacba1 5Aacbc1 5Aacbd1 5Aacbe1 5Agaea1 5Agaea2
2Aa3 = ospps3p6s4p4s3SsSsp8ssSsp29
2Ad1 = soSpsspssp4ssSSp9sp9SSpssp5sp4sppsp9sps3
2Ad2 = pSos3pspspSps5p11sspssppssps15Sssps3pspsppss
2Ad3 = ppsop6spsp3ssS3pSSsspSSp6sp27sp5
2Ae1 = s3poSppSpsps5pS4sSp3SSp6s6p18s5psspp
2Ae2 = s3pSoppSpSps5pS6s3SSp6Ss5pspsppssp3sppsp3sps3psspp
2Ae3 = sp5opsp3sp10sp4sp40
2Ae4 = pssp4op6s3p9sp9SSsSspspsppssp3sppsp3spssppsspp
2Ae5 = psppSSspopspsppsspssS4spsSSp6spssp21sppspsSpp
2Af1 = ppsp6osp22sp6ssS3s3S7ssps6pssSS
2Af6 = p3ssSppssopSp5sspSpsp3sSpssppsSp6sps3psps5psSpS5pSSss
2Aj3 = ppSp8osp15s3Ssp21sp13s
2Aj4 = p3s4pspSsop5s3SsSsppsSpsp3sSp21sppsppSpsp3
3Aba1 = s3pssp7oS3pps3ps3Sp9S5p28
3Aba2 = s3psspsp5SoSSp3SSssSsSp9S5p28
3Aba3 = sSspsspssp4SSoSp3s8p8S5p28
3Aba5 = sSs4pssp4S3oppssSsSSsSsp8S5p28
3Abb3 = ppssp13oppsp48
3Abc1 = p3S3ppspspsp5oS6spSsp6sp33
3Abc2 = p3S3ppspspssppspSosS3sspSsp6sppsp30
3Abc5 = p3S3ppSp3ssSs3SsoSsSSppSsp7s4p29
3Abc6 = sp3SSppSpSpSsSsSpS3oS6sp6s3Sssp28
3Abc7 = sppSsSppSp3sps3pSSsSoSSspSsp6sppsp30
3Abc9 = sppS3spSpspSs3SpS5oSsSSsp6spsSssp24sspp
3Abc10 = Sppspsppsp3ssSsSpSsS4os3p8ssSssp28
3Abd2 = sppspsp7s4psspSs3oSp9s5p28
3Abe1 = Ssp3spssp4SSsSp4SpSsSop9S4sp28
3Ada1 = sppS3ppSpspsppsspS6sppoSp6sppsp24spsp3
3Ada2 = p3S3spSpSsSp5s6p3SopssppsSp21spsSssSpsspp
3Afa3 = ppsp8sp17oS3p8Spps5p4spSsppsp4sppss
3Afa4 = ppsp7s3p15sSoSSppsp5sp3s4p6s3pSpsSsSppss
3Afa8 = p10sSp16sSSoSp8spps3psp4spSsppsppssSppss
3Afa11 = ppsp8sp17S3op8Sp3s4p4ssSsp7sppss
3Aib2 = ppsp6sp23ossp6S4s4SsSSsSSsSs5p3Ss
3Aib5 = p10spsp15sp4sosp9sp4sp6sp5sp5
3Aib6 = p3ssSppspSpSp5ssps3p3sSpsppssop21sps4Spspps
4Aaaa1 = sSspsspSp5S4p3ssppssSp9oS4p3sp7sp13spp
4Aaab1 = sSspsspSsp4S4p3ssps3Sp9SoS3pspsppssp3spsp4s4pps3p
4Aabb1 = Sp3sspssp4S4ppssSsSSsSsp8SSoSSp28
4Aabd1 = s3psspSp5S4p3ssps3Sp9S3oSp11sp16
4Aafa1 = psspsspspsp3S4p4sps4p9S4opspsp4sp5sp13
4Agaa1 = ppsp6sp19SssSp8os6Sps3Ss3pps5Ss4
4Agab1 = ppsppspspSsp22Sp3sppssoS14ssS5pSsSS
4Agab2 = ppsp6Sp23Sp7sSoS13ssS5s3SS
4Agab3 = ppsppspspSsp18spspSppssppssSSoS13sS7sSS
4Agab4 = ppsp6ssp18s4Ssp6sS3oS11ssS7sSS
4Agac1 = pssp6ssp18s5p7sS4oS10ssS10
4Agac2 = ppsppspspsp19sspssp3sp3sS5oSsS7psS10
4Agad1 = ppsppspspSsp18s5p3sp3S7oS8psS5sS4
4Agad2 = ppsp6Sp23sp6spS5sSoS7ppS4spsS3
4Agad3 = ppsp6Ssp22Ssp6sS8oS6ssS5sSsSS
4Agad4 = pssp6Ssp22sp7sS9oS5psS4ssS4
4Agae1 = ppsppspspSsp22SppsspspsS10oS11sS4
4Agae2 = ppsp6Ssp18spssSp7S12oS3sS6sS4
4Agae3 = psSp6Sssp20ssp3sp3sS12oS14
4Agae4 = ppsppspspsp19SsS3p6ssS13oSssS4sSssSS
4Agae5 = ppsp6ssp18s4Sp7sS14osS6sSsSS
4Aiaa3 = p10Spsp15spspps3p6ssSssp3spSsSssoS4sSpspSS
4Aiaa8 = ppsp6sp23Sp8s7pssS3sSSopssp5SS
5Aacaa1 = ppspsspspsSp17ssSspspspsp3sS16poS9
5Aacab1 = ppspsp3ssSpsp15Sp4spspsp3sS16sSoS8
5Aacac1 = p4sspspsSp17spsppspspsp3sS16sSSoS7
5Aacad1 = ppspsspspsSp17spSspspspsp3sS15spS3oS6
5Aacba1 = p3s3ppssSpSp14sSpsspssSp5sS7sSsS3sSSpS4oS5
5Aacbc1 = pssp26sSSsp8SpsS4sps4SSsppS5oSSss
5Aacbd1 = p4ssps3Spsp10sp3ssp6spsp3sSsS5sS5sSspS6oS3
5Aacbe1 = psppsspsSsSp12sp4sp7ssp3s5S4sS4ssppS7oSS
5Agaea1 = pssp6Ssp18s4Sp3sp3sS22sSSoS
5Agaea2 = pssp6Sssp17s5psp5sS22sS3o
---GRID_END---

---mini_tracker_end---
