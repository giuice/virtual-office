# Module: floor-plan

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
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useconversations.ts
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usemessages.ts
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
2Af2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/avatar-utils.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Aj3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Aba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-members.tsx
3Aba2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-settings.tsx
3Aba3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/invite-user-dialog.tsx
3Aba4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/message-feed.tsx
3Aba5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/user-profile.tsx
3Abb: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan
3Abb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/floorplancanvas.tsx
3Abb2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/roomcomponent.tsx
3Abb3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/roomscontext.tsx
3Abb4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/floor-plan.tsx
3Abb5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/index.tsx
3Abb6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/message-dialog.tsx
3Abb7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-chat-integration.tsx
3Abb8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-dialog.tsx
3Abb9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-management.tsx
3Abb10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-template-selector.tsx
3Abb11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-templates.tsx
3Abb12: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-tooltip.tsx
3Abb13: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/types.ts
3Abb14: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/types.tsx
3Abb15: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/user-avatar.tsx
3Abb16: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/user-hover-card.tsx
3Abc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/chatwindow.tsx
3Abc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversationlist.tsx
3Abc3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/messageinput.tsx
3Abc4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/messagelist.tsx
3Abc5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/roommessaging.tsx
3Abc6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversation-list.tsx
3Abc7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-composer.tsx
3Abc8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-feed.tsx
3Abc9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-item.tsx
3Abc10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/room-messaging.tsx
3Abd2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/search/global-search.tsx
3Abe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/shell/dashboard-header.tsx
3Abf1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/avatar.tsx
3Abf2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/badge.tsx
3Abf3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/button.tsx
3Abf4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/card.tsx
3Abf5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/dialog.tsx
3Abf7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/hover-card.tsx
3Abf10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/popover.tsx
3Abf17: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/status-avatar.tsx
3Abf18: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/switch.tsx
3Abf21: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/tooltip.tsx
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Aaba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/company/page.tsx
4Aabb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/dashboard/page.tsx
4Aabc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/floor-plan/layout.tsx
4Aabc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/floor-plan/page.tsx
4Aabd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/office/page.tsx
4Aabe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/settings/page.tsx
4Aafa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/tools/cleanup-companies/page.tsx
5Aabba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/dashboard/components/companyoverviewcard.tsx
5Aabba2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/dashboard/components/quicklinksgrid.tsx
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Aa3, 2Ab2, 2Ae1, 2Ae2, 2Ae5, 2Af2, 2Af6, 2Aj3, 2Aj4, 3Aba1, 3Aba2, 3Aba3, 3Aba4, 3Aba5, 3Abb, 3Abb1, 3Abb2, 3Abb3, 3Abb4, 3Abb5, 3Abb6, 3Abb7, 3Abb8, 3Abb9, 3Abb10, 3Abb11, 3Abb12, 3Abb13, 3Abb14, 3Abb15, 3Abb16, 3Abc1, 3Abc2, 3Abc3, 3Abc4, 3Abc5, 3Abc6, 3Abc7, 3Abc8, 3Abc9, 3Abc10, 3Abd2, 3Abe1, 3Abf1, 3Abf2, 3Abf3, 3Abf4, 3Abf5, 3Abf7, 3Abf10, 3Abf17, 3Abf18, 3Abf21, 3Ada1, 3Ada2, 4Aaab1, 4Aaac1, 4Aaba1, 4Aabb1, 4Aabc1, 4Aabc2, 4Aabd1, 4Aabe1, 4Aafa1, 5Aabba1, 5Aabba2
last_GRID_edit: Applied suggestions (2025-04-02T12:02:18.305546)

---GRID_START---
X 2Aa3 2Ab2 2Ae1 2Ae2 2Ae5 2Af2 2Af6 2Aj3 2Aj4 3Aba1 3Aba2 3Aba3 3Aba4 3Aba5 3Abb 3Abb1 3Abb2 3Abb3 3Abb4 3Abb5 3Abb6 3Abb7 3Abb8 3Abb9 3Abb10 3Abb11 3Abb12 3Abb13 3Abb14 3Abb15 3Abb16 3Abc1 3Abc2 3Abc3 3Abc4 3Abc5 3Abc6 3Abc7 3Abc8 3Abc9 3Abc10 3Abd2 3Abe1 3Abf1 3Abf2 3Abf3 3Abf4 3Abf5 3Abf7 3Abf10 3Abf17 3Abf18 3Abf21 3Ada1 3Ada2 4Aaab1 4Aaac1 4Aaba1 4Aabb1 4Aabc1 4Aabc2 4Aabd1 4Aabe1 4Aafa1 5Aabba1 5Aabba2
2Aa3 = os3p5s5pspps13ppsspssSsSsSp4sppsp4s3SsSsspps
2Ab2 = sop24sspssp9spsp3spsspsp5s5p3s
2Ae1 = spoSSpsps4psp6Ssp9S6sSSp13SSsppsppspspp
2Ae2 = spSoSpSps6p5sSSp9S9s3p10SSs4ppspspp
2Ae5 = ppSSopspsppspsp5sSSp9ssSsS5spsp10SSsppsp7
2Af2 = p5op6ssp5sspsp3s3Ssp11ssp6Sp9sp5
2Af6 = ppsSspopSp3sp7ssp9ssp3SpSsp13sSp11
2Aj3 = p7osp10sp7Ssp37
2Aj4 = pps3pSsop3sp6sSSp5sp3ssppsSsSSsp12sSp11
3Aba1 = spssp5oSSsSpsppsSSsSSs4psSps5ps4Sp4sppsp4S4pSSsSss
3Aba2 = spssp5SoSsSpsppSSssS4ssppsppssSSsSsSsSp3sp8S4pSSsS3
3Aba3 = sps3p4SSopSp4ssSs6p3sppSs9p4sp7SSsSpsSpSpp
3Aba4 = sppspssps3posp4sSs9SSsspspSsSSspSp3sp3sp6sSpSsspSs
3Aba5 = sps4p3S3sopsppsSs8pSSpsSSsSsS3sSsppsp3Sp4S4pSSsSSs
3Abb = p14op51
3Abb1 = sp8ssppspoSsSSsS6sSs3p3sspspSsspps5psp6ssSsppss
3Abb2 = p15Sops10p12sp4sp14sp5
3Abb3 = p15spos11p6sp30
3Abb4 = sp8sSs3pSssoSsS8sSsp3SSpSsSssp3sp3sp4s3SsSSssSS
3Abb5 = spps3pssSSsSSpSssSoS12s3SSsS3sSp3sp3sp4s3SsSSssSS
3Abb6 = spS3sspSSsSssps4SoS3sSsS3sS10ssp3sSppsppSSs3Ss5Ss
3Abb7 = spsSSpspSs5pSssS3oS4s5SSssS6ssp4sppsppSSs4pssp3s
3Abb8 = sp4sp3SSs3pSssS4oS8s5SsSsS3p3sSppsp4s3SsSsspss
3Abb9 = sp8SSs3pSssS5oS4ssSs5SsSsSssp3ssppsp4s3SsSs3SS
3Abb10 = sp8sSs3pSssSSsS3oS4s4ppsSsSsSssp3ssppssp3s5Ss4S
3Abb11 = sp8sSs3pSssS7oS3s3p3sSsSsSssp3ssppssp3s5Ss3SS
3Abb12 = ssp3sp3s5pSssSSssS4oSsSSssps4S3sSs7SsSpps5Ss4S
3Abb13 = ssp3spSs3pssps3S3sS5oSsSpsps3pS3sSs4pssSsp6s4ppsS
3Abb14 = sp4spsp4sppSpsS3sSsSSsSossp19Sp8sSp3ss
3Abb15 = ssp3Sp3sppSSpsppsSSsSs3SssoSpSpSpSssSssSSs4psSp5spSsSsspsS
3Abb16 = ssp3sp3SssSSpsppSSssSSssSSsSopspspSsS3sSs5SsSsp3s3SsSs4S
3Abc1 = ppSSspspsp3sppsppsS3s5p4oS9sp5sp5Ssp11
3Abc2 = ppSSspspssppssp5sSSs3psspSsSoSSsS4sspsp9Sp4sp7
3Abc3 = spS3p4ssSpSp5sSs3p7SSoS6s3p4sp5Spsspsppspspp
3Abc4 = spSSsp4s4Sp5sSs3ppsspSsS3oS5sSSsp3spssppSpsspSpssp3s
3Abc5 = ppS3p3ssSspspspsS4s6p3SsSSoSsS3p6sp5Sssppsppsp4
3Abc6 = spS3pSpSsSsSSpsppS8sspS7oS6p3ssppsppSs4SpSspssS
3Abc7 = spsSSp3sps4p5sSSs5ppssS4sSoS3sp5sp5Sppspsp7
3Abc8 = SpS3pSpSsSsSSpsppS10psS8oSSssp3sp3sppSSs3SpSSpssS
3Abc9 = spS3pspSs3SSp4sS3s4SSpS10oSsSp7SppSs3pSpsspsps
3Abc10 = Sspssp3ssSssSpSspS10psSSs3S5ossp3ssppssp3s3SpSspssS
3Abd2 = sppsp5s3pspspps4Ss5ps5SpSs4oSp4sp7s4psspsps
3Abe1 = Ssps3p3SSsSSpsppsSssSs3SSpSSppsSpSpsSsSosppssppSp4S4sS3ssS
3Abf1 = p5sp7sp12sspSspspsp7sossSpspSsp8sp5
3Abf2 = p26sspssp12soSspsppsp14
3Abf3 = p15ssp9sspssp12sSospSspsp13s
3Abf4 = psp8spsspspps3ps6pssp5spspspsSssopsppSp6spSsppsS
3Abf5 = sp8spsp3sp4SsSs4pps3ps5pps3p4ossp16
3Abf7 = psp13sp10ssppSp12ssSssoSpsSp13
3Abf10 = psp13sp10sspssp3sp10spsSopsSp13
3Abf17 = sp4Sp3sppsSp4s8S5p3spspsSspSSp6op7spSpspps
3Abf18 = psp13sp8s4ppsp9spps3Spsspop13s
3Abf21 = p26Sp21SSppop13
3Ada1 = ppS3pspsp11SSp9S9p13oSp11
3Ada2 = ppS3pSpSp11SSp9sp3sspSsp13Sop11
4Aaab1 = sps3p4S3pSp4s9p3spps4ps4Sp12oS3psSsSSs
4Aaac1 = sppsp5S3pSp4s9ppssppssps6Sp12SoSSpSSsSss
4Aaba1 = sspsp5SSssSp4s9p3sp5spspssSp12SSoSsS3sSs
4Aabb1 = Ss4p4S5psppS3sSSs4pSSpssSsSsS3sSp3sp3sp4S3osS6
4Aabc1 = ssp13spps3ps9p11sp14ssoSssp3
4Aabc2 = Ssp3sp3SSsSSpSspSSssS5sS3p3spSpSsSsSsppSp3Sp4sS4oSSsSS
4Aabd1 = s4p5S3sSpsppSSs8psspps4pSs3Sp3sp8S4sSosS3
4Aabe1 = sp8sspssp4s3ps5ppssp11Sp7sp4ssSSsSsopss
4Aafa1 = ppssp5S3pSp4s3pps4p3sppsppsps5p12SSsSpsSposs
5Aabba1 = p9sSpSSpsppS3psSsSs5p5spspspsp3sp8SsSSpSSssoS
5Aabba2 = ssp7sSpsspsppSSs3S5sSSp3spSpSsSsSppsSp3ssp3s3SpSSssSo
---GRID_END---

---mini_tracker_end---
