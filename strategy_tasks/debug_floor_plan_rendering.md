# Task Instruction: Debug Floor Plan Rendering

**Goal:** Identify and fix the root cause of the floor plan rendering incorrectly (showing black boxes, missing details, and not displaying users).

**Priority:** Critical

**Dependencies:** None

**Steps:**

1.  **Verify Data Flow (Logging):**
    *   Add `console.log` in `/api/spaces/get.ts` to log the `spaces` data fetched from DynamoDB.
    *   Add `console.log` in `CompanyContext.tsx` (within `loadCompanyData`) to log the `fetchedSpaces` received from the API.
    *   Add `console.log` in `floor-plan.tsx` to log the `spaces` received from `useCompany`.
    *   **Action:** Execute these changes and analyze the browser/server console logs during page load.
    *   **Expected Outcome:** Confirm if complete `Space` objects (with `name`, `type`, `position`, `userIds`, etc.) are reaching the `floor-plan.tsx` component.

2.  **Inspect Rendering Props (If Data is Correct):**
    *   If logs from Step 1 show correct data, add `console.log` inside the `spaces.map(...)` loop in `FloorPlanCanvas.tsx`.
    *   Log the `space` object and calculated properties like `roomColor`, `roomLightColor` just before the `<Group>` is rendered.
    *   **Action:** Execute and check browser console logs.
    *   **Expected Outcome:** Identify if Konva is receiving the correct props for rendering details. Check for any Konva-specific errors.

3.  **Fix Identified Issue:** Based on the findings from Step 1 or 2, implement the necessary code changes to fix the data flow or rendering logic.

4.  **Test Rendering:** Verify that room details (name, color, user count, user indicators) render correctly.

5.  **Investigate User Entry/Exit (Separate Task):** Once initial rendering is fixed, create a new task to investigate and implement the logic for updating `space.userIds` when users join/leave rooms.

**Success Criteria:**
- Floor plan renders rooms with correct shapes, positions, colors, names, and user counts based on data from `CompanyContext`.
- User indicators (circles) are displayed within rooms according to the `userIds` array.
- No JavaScript errors related to floor plan rendering occur during page load.
