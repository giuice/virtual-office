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
2Ab4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/theme-toggle.tsx
2Ad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/companycontext.tsx
2Ad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/searchcontext.tsx
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useconversations.ts
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usemessages.ts
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
2Af2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/avatar-utils.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Aj3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/database.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Aba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-members.tsx
3Aba2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/company-settings.tsx
3Aba3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/invite-user-dialog.tsx
3Aba4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/message-feed.tsx
3Aba5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/user-profile.tsx
3Abb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/floorplancanvas.tsx
3Abb10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-template-selector.tsx
3Abb11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-templates.tsx
3Abb12: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-tooltip.tsx
3Abb13: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/types.ts
3Abb14: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/types.tsx
3Abb15: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/user-avatar.tsx
3Abb16: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/user-hover-card.tsx
3Abb2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/roomcomponent.tsx
3Abb3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/roomscontext.tsx
3Abb4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/floor-plan.tsx
3Abb5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/index.tsx
3Abb6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/message-dialog.tsx
3Abb7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-chat-integration.tsx
3Abb8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-dialog.tsx
3Abb9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-management.tsx
3Abc1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/chatwindow.tsx
3Abc10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/room-messaging.tsx
3Abc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversationlist.tsx
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
3Abf1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/avatar.tsx
3Abf10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/popover.tsx
3Abf17: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/status-avatar.tsx
3Abf18: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/switch.tsx
3Abf19: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/tabs.tsx
3Abf2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/badge.tsx
3Abf3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/button.tsx
3Abf4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/card.tsx
3Abf5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/dialog.tsx
3Abf6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/dropdown-menu.tsx
3Abf7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/hover-card.tsx
3Aib6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
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

last_KEY_edit: Assigned keys: 2Aa3, 2Ab2, 2Ab4, 2Ad2, 2Ad3, 2Ae1, 2Ae2, 2Ae5, 2Af2, 2Af6, 2Ag1, 2Aj3, 2Aj4, 3Aba1, 3Aba2, 3Aba3, 3Aba4, 3Aba5, 3Abb1, 3Abb2, 3Abb3, 3Abb4, 3Abb5, 3Abb6, 3Abb7, 3Abb8, 3Abb9, 3Abb10, 3Abb11, 3Abb12, 3Abb13, 3Abb14, 3Abb15, 3Abb16, 3Abc1, 3Abc2, 3Abc3, 3Abc4, 3Abc5, 3Abc6, 3Abc7, 3Abc8, 3Abc9, 3Abc10, 3Abd2, 3Abe1, 3Abe2, 3Abf1, 3Abf2, 3Abf3, 3Abf4, 3Abf5, 3Abf6, 3Abf7, 3Abf10, 3Abf17, 3Abf18, 3Abf19, 3Aib6, 4Aaaa1, 4Aaab1, 4Aaac1, 4Aaba1, 4Aabb1, 4Aabc1, 4Aabc2, 4Aabd1, 4Aabe1, 4Aafa1, 5Aabba1, 5Aabba2
last_GRID_edit: Applied suggestion: 2Aj4 -> 2Ae5 (s)

---GRID_START---
X 2Aa3 2Ab2 2Ab4 2Ad2 2Ad3 2Ae1 2Ae2 2Ae5 2Af2 2Af6 2Ag1 2Aj3 2Aj4 3Aba1 3Aba2 3Aba3 3Aba4 3Aba5 3Abb1 3Abb2 3Abb3 3Abb4 3Abb5 3Abb6 3Abb7 3Abb8 3Abb9 3Abb10 3Abb11 3Abb12 3Abb13 3Abb14 3Abb15 3Abb16 3Abc1 3Abc2 3Abc3 3Abc4 3Abc5 3Abc6 3Abc7 3Abc8 3Abc9 3Abc10 3Abd2 3Abe1 3Abe2 3Abf1 3Abf2 3Abf3 3Abf4 3Abf5 3Abf6 3Abf7 3Abf10 3Abf17 3Abf18 3Abf19 3Aib6 4Aaaa1 4Aaab1 4Aaac1 4Aaba1 4Aabb1 4Aabc1 4Aabc2 4Aabd1 4Aabe1 4Aafa1 5Aabba1 5Aabba2
2Aa3 = ossppssp3spps6pps13ppsspssSsSsSsp4sp3sp3s4SsSsspps
2Ab2 = sosp26sspssp9spssp3sps3psspspps5p3s
2Ab4 = ssop23s5pssp9spsp3sppSsppsp8sp4s
2Ad2 = p3ossp5Sps3psppsp38ssp5spspp
2Ad3 = p3sop4sppsp4sppsppSssp8S9ssp13sp12
2Ae1 = sppspoSSpspps4psp5Ssp9S6sSSp15s3ppsppspspp
2Ae2 = sp4SoSpSpps6p4sSSp9S9s3p12Ss5ppspspp
2Ae5 = p5SSopsppsppspsp4sSSp9ssSsS5spsp12spsppsp7
2Af2 = p8op7ssp4sspsp3s3Ssp11spsp7Sp9sp5
2Af6 = p4ssSspoppSp3sp6ssp9ssp3SpSsp15Sp12
2Ag1 = sp9opps3psp4ssp20ssp13S3sspsSpspp
2Aj3 = p3Sp7osp9sp7Ssp39
2Aj4 = p4s4pSpsop3sp5sSSp5sp3ssppsSsSSsp14Sp12
3Aba1 = sppspssp3sppoSSsSsppsSSsSSs4psSps5ps4Sp5ssppsp3S5pSSsSss
3Aba2 = sppspssp3sppSoSsSsppSSssS4ssppsppssSSsSsSsSp4sp6spS5pSSsS3
3Aba3 = sppsps3ppsppSSopSp3ssSs6p3sppSs9p5sp7S3sSpsSpSpp
3Aba4 = sp5spsspps3posp3sSs9SSsspspSsSSspSp4sp4sppsp3sSpSsspSs
3Aba5 = spps6psppS3sosppsSs8pSSpsSSsSsS3sSpsppsp4Sp3S5pSSsSSs
3Abb1 = sp12ssppsoSsSSsS6sSs3p3sspspSssp3s3psspsppsp3ssSsppss
3Abb2 = p18Sops10p12sp5sp15sp5
3Abb3 = p3ssp13spos11p6sp32
3Abb4 = sp12sSs3SssoSsS8sSsp3SSpSsSssp4sp4sp3s4SsSSssSS
3Abb5 = sp5s3ps3SSsS3ssSoS12s3SSsS3sSp4sp4sp3s4SsSSssSS
3Abb6 = sp3S4s3pSSsSs6SoS3sSsS3sS10ssp4sSp3spps5Ss5Ss
3Abb7 = sp3ssSSpsppSs5SssS3oS4s5SSssS6ssp5sp3spps6pssp3s
3Abb8 = sp3sp3sp4SSs3SssS4oS8s5SsSsS3p4sSp3spsps4SsSsspss
3Abb9 = spsp10SSs3SssS5oS4ssSs5SsSsSssp4s3ppspsps4SsSs3SS
3Abb10 = spsp10sSs3SssSSsS3oS4s4ppsSsSsSssp4ssp3s3ps6Ss4S
3Abb11 = spsp10sSs3SssS7oS3s3p3sSsSsSssp4ssp3s3ps6Ss3SS
3Abb12 = s3p5sp4s5SssSSssS4oSsSSssps4S3sSps8Sssps6Ss4S
3Abb13 = s3p5sppSs3ps5S3sS5oSsSpsps3pS3sSps4ps3Ssp6s4ppsS
3Abb14 = sp7sppsp4spSpsS3sSsSSsSossp21Sp8sSp3ss
3Abb15 = s3p5Sp4sppSSsppsSSsSs3SssoSpSpSpSssSssSpSs4ppsSp5spSsSsspsS
3Abb16 = s3p5sp4SssSSsppSSssSSssSSsSopspspSsS3sSs6pSsSspps4SsSs4S
3Abc1 = p4S3spsppsp3spsppsS3s5p4oS9sp6sp6sp12
3Abc2 = p4S3spsppssppssp4sSSs3psspSsSoSSsS4ssppsp10sp4sp7
3Abc3 = sp3S4p5ssSpSp4sSs3p7SSoS6s3p5sp7s3psppspspp
3Abc4 = sp3S3sp5s4Sp4sSs3ppsspSsS3oS5sSSpsp3sppssp3s3pSpssp3s
3Abc5 = p4S4p4ssSspsspsS4s6p3SsSSoSsS3p7sp7ssppsppsp4
3Abc6 = sp3S4pSppSsSsSSsppS8sspS7oS6p4ssp3sps6SpSspssS
3Abc7 = sp3SsSSp4sps4p4sSSs5ppssS4sSoS3sp6sp6sppspsp7
3Abc8 = Sp3S4pSppSsSsSSsppS10psS8oSSssp4sp4spps5SpSSpssS
3Abc9 = sp3S4psppSs3SSp3sS3s4SSpS10oSsSp9SppspsspSpsspsps
3Abc10 = Ssspspssp4ssSssSSspS10psSSs3S5ossp4ssp3s3ps4SpSspssS
3Abd2 = sp3spsp3spps3psspps4Ss5ps5SpSs4oSp5sp7s5psspsps
3Abe1 = Sssp3s3psppSSsSSsppsSssSs3SSpSSppsSpSpsSsSoSsppssp3Sp3S5sS3ssS
3Abe2 = ssp31sp11Sop5sp4spsppsS3ssp3
3Abf1 = p8sp8sp11sspSspspsp7spossSppspSssp7sp5
3Abf2 = p29sspssp13soSsppsppsp14
3Abf3 = ppsp15ssp9sspssp13sSospsSspssp12s
3Abf4 = psp12sps3pps3ps6pssp5spspspspSssoppsppSsp5spSsppsS
3Abf5 = sp12spsppsp4SsSs4pps3ps5pps3p5os3ppsp13
3Abf6 = psSp10sp12sppssp15sppspsosppssp6sp6
3Abf7 = pssp15sp10ssppSp13ssSs3oSpssp13
3Abf10 = psp16sp10sspssp3sp11spspSopssp13
3Abf17 = sp7Sp4sppsSp3s8S5p3spspsSspSpSp7op7spSpspps
3Abf18 = pssp15sp8s4ppsp9sp3s3Sps3poSp12s
3Abf19 = psp12sp10s5p9sp3sppssps6pSop4sppsp5
3Aib6 = p4ssSspSppSp3sp6ssp9ssp3s4p15op12
4Aaaa1 = sspspssp3SppS3pSspps9p3spps4pspssSsp12oS4psSsSss
4Aaab1 = sppsps3ppSppS3pSp3s9p3spps4ps4Sp13SoS3psSsSSs
4Aaac1 = sp5sp3SppS3pSp3s9ppssppssps6Sp13SSoSSpSSsSss
4Aaba1 = ssp4sp3sppSSssSp3s9p3sp5spspssSsp10spS3oSsS3sSs
4Aabb1 = Ssp3s3ppsppS5sppS3sSSs4pSSpssSsSsS3sSSp3sp4sp3S4osS6
4Aabc1 = ssp16spps3ps9p11sSp5sp9ssoSssp3
4Aabc2 = Sssp5spsppSSsS3spSSssS5sS3p3spSpSsSsSSsppSp4SpspssS4oSSsSS
4Aabd1 = sspspssp3SppS3sSsppSSs8psspps4pSs3Ssp3sp8S5sSosS3
4Aabe1 = sp12sspssp3s3ps5ppssp11Ssp8sp3s3SSsSsopss
4Aafa1 = p3spssp3sppS3pSp3s3pps4p3sppsppsps5p13S3sSpsSposs
5Aabba1 = p13sSpSSsppS3psSsSs5p5spspspsp4sp8sSsSSpSSssoS
5Aabba2 = s3p10sSps3ppSSs3S5sSSp3spSpSsSsSp3sSp4sspps4SpSSssSo
---GRID_END---

---mini_tracker_end---
