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
2Ad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/authcontext.tsx
2Ad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/companycontext.tsx
2Ae: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useconversations.ts
2Ae2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usemessages.ts
2Ae3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usenotification.ts
2Ae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
2Af6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/messaging-api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Aab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/layout.tsx
3Aba3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/invite-user-dialog.tsx
3Aba5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/dashboard/user-profile.tsx
3Abb6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/message-dialog.tsx
3Abb7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/floor-plan/room-chat-integration.tsx
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
3Abf16: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/components/ui/sonner.tsx
3Ada1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/messagingcontext.tsx
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Aib3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iconversationrepository.ts
3Aib7: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
4Aaaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/create-company/page.tsx
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Aaba1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/company/page.tsx
4Aabd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(dashboard)/office/page.tsx
5Aacbb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/get/route.ts
5Aacbd1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/status/route.ts
5Aacbe1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/messages/typing/route.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad1, 2Ad2, 2Ae, 2Ae1, 2Ae2, 2Ae3, 2Ae4, 2Ae5, 2Af6, 2Ag1, 2Aj4, 3Aab1, 3Aba3, 3Aba5, 3Abb6, 3Abb7, 3Abc1, 3Abc2, 3Abc3, 3Abc4, 3Abc5, 3Abc6, 3Abc7, 3Abc8, 3Abc9, 3Abc10, 3Abf16, 3Ada1, 3Ada2, 3Aib3, 3Aib7, 4Aaaa1, 4Aaab1, 4Aaac1, 4Aaba1, 4Aabd1, 5Aacbb1, 5Aacbd1, 5Aacbe1
last_GRID_edit: Applied suggestions (2025-04-02T12:02:34.954897)

---GRID_START---
X 2Ad1 2Ad2 2Ae 2Ae1 2Ae2 2Ae3 2Ae4 2Ae5 2Af6 2Ag1 2Aj4 3Aab1 3Aba3 3Aba5 3Abb6 3Abb7 3Abc1 3Abc2 3Abc3 3Abc4 3Abc5 3Abc6 3Abc7 3Abc8 3Abc9 3Abc10 3Abf16 3Ada1 3Ada2 3Aib3 3Aib7 4Aaaa1 4Aaab1 4Aaac1 4Aaba1 4Aabd1 5Aacbb1 5Aacbd1 5Aacbe1
2Ad1 = oSpsspsspSppSSp17S3pspps
2Ad2 = Sopsspsppsppssp17ssppsp3
2Ae = ppop36
2Ae1 = sspoSppSspspssSsS6sSSpsSSspssppspss
2Ae2 = sspSoppSSsspssS11spSSpSs8
2Ae3 = p5opsppsp12sspspsp10
2Ae4 = ssp4oppspSssp17S5pss
2Ae5 = sppSSspospspssSSssSsS5spSSp3sp4sS
2Af6 = p3sSppsopSp3s4p3SpSsppsS3p5S3
2Ag1 = Ssppspsppops3p17S3sSpps
2Aj4 = p3s3psSpop3SSssp3SsSSspsS3p5ssp
3Aab1 = p6Sppspop19SSsSSp3
3Aba3 = SspsspsspsppoSSsppSsps5p5S3sSp3
3Aba5 = SspsspsspsppSosspsSSsSsS3p5S5p3
3Abb6 = p3SSppSspSpSsoS11pSSp10
3Abb7 = p3sSppSspSpssSoSSssS6pSSpps5p3
3Abc1 = p3SSppsspsp3SSoS9pSsp10
3Abc2 = p3SSppsspsppsS3oSSsS4spSssp9
3Abc3 = p3SSppSp4S3sSSoS6spSp11
3Abc4 = p3SSppsp4sSSsS3oS5spSp3s3psp3
3Abc5 = p3SSppSp5sS3sSSoSsS3pSsp6sp3
3Abc6 = p3SSppSSpSpsS8oS4pSspspps3p3
3Abc7 = p3sSppSppspssS6sSoS3pSsp4sp5
3Abc8 = p3SSspSSpSpsS10oSSpSSps5Spps
3Abc9 = p3SSspSspSpsS11oSpSsp3sspspss
3Abc10 = p4sppsppspsS4s3S5op5s5p3
3Abf16 = p3spsp20op12
3Ada1 = p3SSppSspsp3S11ppoSpsp8
3Ada2 = p3SSspSSpSp3SSsspps3SsppSoSSp5Sss
3Aib3 = p3sp4SpSp6sp10SoSp5Ssp
3Aib7 = p4Sp3SpSp10spsp3sSSop5Ssp
4Aaaa1 = SspsspSppSpS3psp3sp3spsp5oS4pps
4Aaab1 = SspsspSspSpS3psp3sp3s3p5SoS3pss
4Aaac1 = Sp3spSppSpsSSpsp3sps5p5SSoSSpsS
4Aaba1 = p4spSppspSsSpsp5spspsp5S3oSp3
4Aabd1 = sspsspSppSpS3psp3s3pSssp5S4op3
5Aacbb1 = p4sp3Spsp17S3p5oSS
5Aacbd1 = p3sspssSpsp13sp3s3pssppSoS
5Aacbe1 = sppsspsSSsp13ssp3sppssSppSSo
---GRID_END---

---mini_tracker_end---
