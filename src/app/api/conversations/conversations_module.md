# Module: conversations

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
2Ad2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/companycontext.tsx
2Ae1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useconversations.ts
2Ae4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/useprotectedroute.ts
2Ae5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/hooks/usesocketevents.ts
2Af1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/api.ts
2Ag1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/accept-invite.tsx
2Aj1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/auth.ts
2Aj4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/types/messaging.ts
3Ada2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/contexts/messaging/types.ts
3Afb1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/lib/firebase/config.ts
3Aib1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iannouncementrepository.ts
3Aib2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/icompanyrepository.ts
3Aib3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iconversationrepository.ts
3Aib4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iinvitationrepository.ts
3Aib6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/imessagerepository.ts
3Aib8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/interfaces/iuserrepository.ts
4Aaab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/login/page.tsx
4Aaac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/(auth)/signup/page.tsx
4Agaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/pages/api/auth/signup.ts
4Aiaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseannouncementrepository.ts
4Aiaa2: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasecompanyrepository.ts
4Aiaa3: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseconversationrepository.ts
4Aiaa4: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseinvitationrepository.ts
4Aiaa5: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasemeetingnoterepository.ts
4Aiaa6: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabasemessagerepository.ts
4Aiaa8: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/repositories/implementations/supabase/supabaseuserrepository.ts
5Aacaa1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/archive/route.ts
5Aacab1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/create/route.ts
5Aacac1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/get/route.ts
5Aacad1: f:/cursos2/react/collab-office-app-anthropic/virtual-office/src/app/api/conversations/read/route.ts
---KEY_DEFINITIONS_END---

last_KEY_edit: Assigned keys: 2Ad2, 2Ae1, 2Ae4, 2Ae5, 2Af1, 2Ag1, 2Aj1, 2Aj4, 3Ada2, 3Afb1, 3Aib1, 3Aib2, 3Aib3, 3Aib4, 3Aib6, 3Aib8, 4Aaab1, 4Aaac1, 4Agaa1, 4Aiaa1, 4Aiaa2, 4Aiaa3, 4Aiaa4, 4Aiaa5, 4Aiaa6, 4Aiaa8, 5Aacaa1, 5Aacab1, 5Aacac1, 5Aacad1
last_GRID_edit: Applied suggestion: 2Aj4 -> 2Ae5 (s)

---GRID_START---
X 2Ad2 2Ae1 2Ae4 2Ae5 2Af1 2Ag1 2Aj1 2Aj4 3Ada2 3Afb1 3Aib1 3Aib2 3Aib3 3Aib4 3Aib6 3Aib8 4Aaab1 4Aaac1 4Agaa1 4Aiaa1 4Aiaa2 4Aiaa3 4Aiaa4 4Aiaa5 4Aiaa6 4Aiaa8 5Aacaa1 5Aacab1 5Aacac1 5Aacad1
2Ad2 = osspspSppSpsp3Sspsp6s3ps
2Ae1 = sopSp3sSp3spspsp9s4
2Ae4 = spoppssp9SSp8spss
2Ae5 = pSpop3sSp5spsp10spp
2Af1 = sp3opsp4sp3Spps3pspps5
2Ag1 = ppspposp9SSp10sp
2Aj1 = SpspssoppSp5Sssp7s5
2Aj4 = pspsp3oSp3SpSp6sppSppspp
3Ada2 = pSpSp3Sop3SpSp6sppSpsSss
3Afb1 = Sp5Sppop5sp10sspp
3Aib1 = p10oS3ssp3Ss5p3sp
3Aib2 = sp3sp5SosSsSp3sSsSspSs4
3Aib3 = psp5SSpSsosSp6SpsSpS3s
3Aib4 = p10SSsosSp3sspSspps4
3Aib6 = pspsp3SSpssSsop6sppSps4
3Aib8 = Sp3SpSppssSpSpop3sSsSspSs4
4Aaab1 = ssSspSsp9oSp8s4
4Aaac1 = ppSppSsp9Sop8s4
4Agaa1 = sp3sp13op7s4
4Aiaa1 = p4sp5Sspspsp3oS6pssp
4Aiaa2 = p4sp5sSpspSp3SoS3sSpspp
4Aiaa3 = p7sspssSpssp3SSoS7s
4Aiaa4 = p4sp5sSpSpSp3S3oSsSs3p
4Aiaa5 = p10s4psp3S4oSsppsp
4Aiaa6 = p7SSpspSpSp4SsSsSos5
4Aiaa8 = sp3spsp4Sp3Sp3S4ssopssp
5Aacaa1 = s3pspspsspsSs6ppSspspoS3
5Aacab1 = sspsspssSspsSs8SspssSoSS
5Aacac1 = pssps3pspssSs7pSs4SSoS
5Aacad1 = s3pspspspps8ppsppspS3o
---GRID_END---

---mini_tracker_end---
