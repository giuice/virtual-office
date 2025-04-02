# Module: search

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
2Ad3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/searchcontext.tsx
3Aba5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/user-profile.tsx
3Abb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/floorplancanvas.tsx
3Abb5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/index.tsx
3Abb6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/message-dialog.tsx
3Abb8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-dialog.tsx
3Abb9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-management.tsx
3Abb11: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-templates.tsx
3Abb12: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-tooltip.tsx
3Abb15: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/user-avatar.tsx
3Abb16: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/user-hover-card.tsx
3Abc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversationlist.tsx
3Abc3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/messageinput.tsx
3Abc4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/messagelist.tsx
3Abc6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/conversation-list.tsx
3Abc7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-composer.tsx
3Abc8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-feed.tsx
3Abc9: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/message-item.tsx
3Abc10: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/messaging/room-messaging.tsx
3Abd: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/search
3Abd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/search/searchbar.tsx
3Abd2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/search/global-search.tsx
3Abe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/shell/dashboard-header.tsx
4Aabc2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/floor-plan/page.tsx
4Aabd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/office/page.tsx
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad3, 3Aba5, 3Abb1, 3Abb5, 3Abb6, 3Abb8, 3Abb9, 3Abb11, 3Abb12, 3Abb15, 3Abb16, 3Abc2, 3Abc3, 3Abc4, 3Abc6, 3Abc7, 3Abc8, 3Abc9, 3Abc10, 3Abd, 3Abd1, 3Abd2, 3Abe1, 4Aabc2, 4Aabd1
last_GRID_edit: Applied suggestions (2025-04-02T12:02:22.321680)

---GRID_START---
X 2Ad3 3Aba5 3Abb1 3Abb5 3Abb6 3Abb8 3Abb9 3Abb11 3Abb12 3Abb15 3Abb16 3Abc2 3Abc3 3Abc4 3Abc6 3Abc7 3Abc8 3Abc9 3Abc10 3Abd 3Abd1 3Abd2 3Abe1 4Aabc2 4Aabd1
2Ad3 = op19Ssp3
3Aba5 = posSs5SSsS3sS3ppsS3
3Abb1 = psoSsS4ssp3spspSppssSs
3Abb5 = pSSoS7s3SsS3ppsS3
3Abb6 = pssSoS3sSsS8pps4
3Abb8 = psS3oS5p3SpSsSppS3s
3Abb9 = psS4oSSsSp3SpSsSppssSs
3Abb11 = psS5oSssp3SsSsSppssSs
3Abb12 = psSSsS3oSSsppssS3ppsSSs
3Abb15 = pSsS3ssSoSSpSSssSsppsSSs
3Abb16 = pSsSsSSsSSospsSsS3ppsSSs
3Abc2 = pspsSp3sSsoS6sppsp3
3Abc3 = pSpsSp6SoS5sppssps
3Abc4 = pSpsSp4SsSSoS4sppSSpp
3Abc6 = pSsS5sS5oS4ppS3s
3Abc7 = pspsSpps4S4oS3ppsp3
3Abc8 = pSsS6sS6oSSppssSS
3Abc9 = pSpSSs3S9oSppsSss
3Abc10 = pS8sSs3S4oppssSs
3Abd = p19op5
3Abd1 = Sp19oSspp
3Abd2 = s5Ss7SSs4pSoSss
3Abe1 = pSsSsSssS3psSSpsSspsSoSS
4Aabc2 = pS3sS6p3SpSsSppsSoS
4Aabd1 = pSsSs7pspspSssppsSSo
---GRID_END---

---mini_tracker_end---
