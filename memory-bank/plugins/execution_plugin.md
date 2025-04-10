# EXECUTION PLUGIN v4

> ⚠️ **CRITICAL:** ALWAYS use file tools to check if files exist BEFORE reading. ALWAYS perform the Mandatory Update Protocol (MUP) after EVERY step. NEVER proceed without updating all required files.

## EXECUTION WORKFLOW
1. CHECK files → 
2. READ context → 
3. VERIFY state → 
4. EXECUTE step → 
5. TEST changes → 
6. PERFORM MUP → 
7. GET confirmation

## INITIALIZATION SEQUENCE

**STEP 1: Read Rules File**
```
read_file memorybankrules.md
read_file memory-bank/activeContext.md
read_file memory-bank/progress.md
```

**STEP 2: Find Implementation Plan**
1. Check NEXT_ACTION in memorybankrules.md or in rule files to identify current/next task (e.g., T1_4_RealtimeIntegration)
2. Extract implementation number (e.g., 1 from T1_4)
3. Check if implementation plan exists:
   ```
   list_directory memory-bank/implementation_plans
   ```
4. Look for any file that starts with "IP{number}_"
5. If found, read the file:
   ```
   read_file memory-bank/implementation_plans/IP{number}_{PlanName}.md
   ```
6. If not found, check progress.md then ASK USER:
   ```
   I cannot find the implementation plan for task T{number}. Can you help me locate it or should I create a new one?
   ```

**STEP 3: Find Task Instructions**
1. Check if task file exists:
   ```
   list_directory memory-bank/tasks
   ```
2. Look for file matching T{implementation_number}_{task_number}_{TaskName}
3. Read the task file:
   ```
   read_file memory-bank/tasks/T{implementation_number}_{task_number}_{TaskName}_instructions.md
   ```
4. If not found, ASK USER for guidance


## TASK EXECUTION PROCESS

**FOR EACH STEP:**
1. Read the file(s) you'll be modifying
2. Verify current state matches expectations
3. Execute the step from task instructions
4. Test changes with user:
   ```
   Please test these changes to confirm they work as expected.
   Do they function correctly?
   ```
5. Update task status:
   ```
   edit_file memory-bank/tasks/T{implementation_number}_{task_number}_{TaskName}_instructions.md
   ```
   Mark step as complete:
   ```
   ## Steps
   1. ✅ [Completed step]
   2. ⬜ [Next step]
   ```
6. **PERFORM MUP** (see section below)
7. Get user confirmation before proceeding

## MANDATORY UPDATE PROTOCOL (MUP)

After EVERY step completion, you MUST:

1. Update `memorybankrules.md`:
   ```
   edit_file memorybankrules.md
   ```
   Replace phase marker with:
   ```
   <PHASE_MARKER>
   CURRENT_PHASE: Execution
   NEXT_PHASE: Execution
   LAST_ACTION: Completed Step X of T{implementation_number}_{task_number}_{TaskName}
   NEXT_ACTION: Execute Step Y of T{implementation_number}_{task_number}_{TaskName}
   REQUIRED_BEFORE_TRANSITION: None
   </PHASE_MARKER>
   ```

2. Update `memory-bank/activeContext.md`:
   ```
   edit_file memory-bank/activeContext.md
   ```
   Add dated entry:
   ```
   ## [YYYY-MM-DD]
   - Completed step [number] of task T{implementation_number}_{task_number}_{TaskName}
   - [Specific details about what changed]
   - Next: [Next step description]
   ```

3. Update `memory-bank/progress.md`:
   ```
   edit_file memory-bank/progress.md
   ```
   Update with exact format:
   ```
   ## Implementation Plans
   - IP{implementation_number}_{PlanName}: [X]% ([status])
   
   ## Task Tracking
   - T{implementation_number}_{task_number}_{TaskName}: [Y]% ([status]) [IP{implementation_number}_{PlanName}]
     - [Any subtasks listed here with percentages]
   
   ### Task Priorities
   1. T{implementation_number}_{task_number}_{TaskName} (priority) - rationale [IP{implementation_number}]
   2. [Other tasks with priorities]
   ```

4. If task is complete, update `memory-bank/changelog.md`:
   ```
   edit_file memory-bank/changelog.md
   ```
   Add:
   ```
   ## Recent Changes
   - **[YYYY-MM-DD]:** Completed T{implementation_number}_{task_number}_{TaskName}.
   ```

5. Verify all updates by reading back files:
   ```
   read_file memorybankrules.md
   read_file memory-bank/activeContext.md
   read_file memory-bank/progress.md
   ```

## TASK COMPLETION

When all steps in a task are complete:
1. Update task percentage to 100%
2. Update parent implementation plan status
3. Update `memorybankrules.md` to indicate completion:
   ```
   <PHASE_MARKER>
   CURRENT_PHASE: Execution
   NEXT_PHASE: Strategy
   LAST_ACTION: Completed T{implementation_number}_{task_number}_{TaskName}
   NEXT_ACTION: Transition to Strategy Phase
   REQUIRED_BEFORE_TRANSITION: User Action Required
   </PHASE_MARKER>
   ```

## ERROR HANDLING

If errors occur:
1. Stop immediately
2. Document the error:
   ```
   ERROR ENCOUNTERED:
   Command: [exact command that failed]
   Error: [exact error message]
   Context: [what you were trying to do]
   ```
3. Suggest solutions and ask for guidance

## EVIDENCE REQUIRED

After each step:
```
STEP COMPLETION:
1. Step X of T{implementation_number}_{task_number}_{TaskName} complete
2. Files modified:
   - [file1]: [specific changes made]
   - [file2]: [specific changes made]
3. MUP COMPLETED: All required files updated
4. CURRENT STATUS: [X/Y] steps complete

USER VERIFICATION REQUIRED:
Please confirm the changes work correctly before I proceed to the next step.
```