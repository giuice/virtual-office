# EXECUTION PLUGIN v3

> ⚠️ **CRITICAL:** ALWAYS use `read_file`, `write_file` or `edit_file` for EVERY action. TEST all changes by asking the user to confirm functionality. Do NOT proceed until verification is complete.

## EXECUTION WORKFLOW
1. READ `memorybankrules.md` → 
2. READ implementation plan & task → 
3. VERIFY file state → 
4. EXECUTE step → 
5. TEST changes (with user) → 
6. UPDATE all trackers → 
7. GET confirmation

## INITIALIZATION SEQUENCE
**ALWAYS READ IN THIS ORDER:**
1. First: `read_file memorybankrules.md` - Determines current task
2. Second: Read implementation plan: 
   ```
   read_file memory-bank/implementation_plans/IP{implementation_number}_{PlanName}.md
   ```
3. Third: Read current task: 
   ```
   read_file memory-bank/tasks/T{implementation_number}_{task_number}_{TaskName}_instructions.md
   ```
4. Fourth: Read context files:
   ```
   read_file memory-bank/activeContext.md
   read_file memory-bank/progress.md
   ```

## TASK EXECUTION PROCESS

**BEFORE EACH STEP:**
- Read the file(s) you'll be modifying
- Verify current state matches your expectations
- Document what you intend to change

**FOR EACH STEP:**
1. Execute the step exactly as written in the task instructions
2. Test results - ASK USER to verify changes work correctly:
   ```
   Please test these changes to confirm they work as expected. 
   Do they function correctly?
   ```
3. Update task status in instruction file:
   ```
   edit_file memory-bank/tasks/T{implementation_number}_{task_number}_{TaskName}_instructions.md
   ```
   Mark step as complete:
   ```
   ## Steps
   1. ✅ [Completed step]
   2. ⬜ [Next step]
   ```
4. Update `memorybankrules.md` with current status:
   ```
   edit_file memorybankrules.md
   ```
   Update:
   ```
   <PHASE_MARKER>
   CURRENT_PHASE: Execution
   NEXT_PHASE: Execution
   LAST_ACTION: Completed Step X of T{implementation_number}_{task_number}_{TaskName}
   NEXT_ACTION: Execute Step Y of T{implementation_number}_{task_number}_{TaskName}
   REQUIRED_BEFORE_TRANSITION: None
   </PHASE_MARKER>
   ```
5. Update `memory-bank/activeContext.md` with step completion details
6. Update `memory-bank/progress.md` with correct percentage:
   ```
   ## Implementation Plans
   - IP{implementation_number}_{PlanName}: X% (status)
   
   ## Task Tracking
   - T{implementation_number}_{task_number}_{TaskName}: Y% (status) [IP{implementation_number}_{PlanName}]
     - [Any subtasks listed here]
   
   ### Task Priorities
   1. T{implementation_number}_{task_number}_{TaskName} (priority) - rationale [IP{implementation_number}]
   ```

## TASK COMPLETION
When all steps in a task are complete:
1. Update progress to 100%
2. Update parent implementation plan status
3. Update `changelog.md` for significant implementations:
   ```
   ## Recent Changes
   - **DATE:** Completed T{implementation_number}_{task_number}_{TaskName}.
   ```
4. Change `memorybankrules.md` to indicate completion:
   ```
   <PHASE_MARKER>
   CURRENT_PHASE: Execution
   NEXT_PHASE: Strategy
   LAST_ACTION: Completed T{implementation_number}_{task_number}_{TaskName}
   NEXT_ACTION: Transition to Strategy Phase
   REQUIRED_BEFORE_TRANSITION: User Action Required
   </PHASE_MARKER>
   ```

## SUBTASK HANDLING
For subtasks (format: T{implementation_number}_{task_number}_{subtask_number}_{SubtaskName}):
1. Complete all subtask steps first
2. Update parent task when all subtasks complete
3. Maintain proper hierarchy in progress.md

## ERROR HANDLING
If errors occur:
1. Stop immediately
2. Document the error with context
3. Ask user for guidance before proceeding

## EVIDENCE REQUIRED
After each step:
```
STEP COMPLETION:
1. Step X of T{implementation_number}_{task_number}_{TaskName} complete
2. Files modified:
   - [file1]: [specific changes made]
   - [file2]: [specific changes made]
3. TEST: [Ask user to verify changes work as expected]
4. CURRENT STATUS: [X/Y] steps complete

USER VERIFICATION REQUIRED:
Please confirm the changes work correctly before I proceed to the next step.
```