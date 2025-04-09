# STRATEGY PLUGIN

<PROGRESS_TRACKER>
 - write_file/edit_file progress.md each step and state change on implementations/tasks, details instructions later
</PROGRESS_TRACKER>


## I. MANDATORY WORKFLOW SEQUENCE
AFTER EACH STEP you MUST EXECUTE <PROGRESS_TRACKER> 
1. **FIRST**: Create implementation plan (IP) and 
2. **SECOND**: Create tasks (T) linked to implementation plan
3. **THIRD**: Decompose complex tasks into subtasks if needed
4. **FOURTH**: Update all cross-references

⚠️ **WARNING**: NEVER create a task without first creating its parent implementation plan.

## II. ENTERING/EXITING THIS PHASE

**Enter if**: `memorybankrules.md` shows `CURRENT_PHASE: Strategy`
**Exit when**: Plans and tasks created, linked, and prioritized
**Exit action**: Update `memorybankrules.md` with `NEXT_PHASE: Execution`

## III. IMPLEMENTATION PLAN CREATION

❗ **PRE-CHECK**: Plan name follows `IP{number}_{plan_name}` format and stored in `memory-bank/implementation_plans/`

1. Use write_file to create implementation plan:
   ```
   memory-bank/implementation_plans/IP{number}_{plan_name}.md
   ```

2. Template:
   ```
   # IP{number}_{plan_name}
   
   ## Overview
   [High-level description]
   
   ## Goals
   - [Goal 1]
   - [Goal 2]
   
   ## Technical Approach
   [Description]
   
   ## Related Tasks
   - T{ip_number}_{task_number}_{task_name} - [Brief description]
   
   ## Timeline & Risks
   [Timeline and risk information]
   ```

3. **CRITICAL** use write_file or edit_file `memory-bank/progress.md` with:
   ```
   ## Implementation Plans
   - IP1_UserDashboard: 0% (not started)
   ```

## IV. TASK CREATION
❗ **PRE-CHECK**: Parent plan EXISTS, task follows `T{ip_number}_{task_number}_{task_name}` format

1. Use write_file to create task:
   ```
   memory-bank/tasks/T{ip_number}_{task_number}_{task_name}_instructions.md
   ```

2. Template:
   ```
   # T{ip_number}_{task_number}_{task_name} Instructions
   
   ## Objective
   [Clear statement of purpose]
   
   ## Context
   [Background]
   [Implementation Plan: IP{number}_{plan_name}]
   
   ## Dependencies
   [Required modules/files]
   
   ## Steps
   1. [First step]
   2. [Second step]
   
   ## Expected Output
   [Deliverables]
   ```

3. Update the parent implementation plan's "Related Tasks" section:
   ```
   ## Related Tasks
   - T{ip_number}_{task_number}_{task_name} - [Brief description]
   ```

4. **CRITICAL** use write_file or edit_file `memory-bank/progress.md` with:
   ```
   ## Task Tracking
   - T1_1_DashboardLayout: 0% (not started) [IP1_UserDashboard]
   ```

## V. SUBTASK CREATION (FOR COMPLEX TASKS)
❗ **PRE-CHECK**: Parent task EXISTS, subtask follows `T{ip_number}_{task_number}_{subtask_number}_{subtask_name}`

1. Use write_file to create subtask:
   ```
   memory-bank/tasks/T{ip_number}_{task_number}_{subtask_number}_{subtask_name}_instructions.md
   ```

2. Use same template as tasks

3. Update parent task with subtask references:
   ```
   ## Subtasks
   - T1_1_1_GridSystem
   - T1_1_2_Responsiveness
   ```

4. **CRITICAL** use write_file or edit_file `memory-bank/progress.md` with:
   ```
   ## Task Tracking
   - T1_1_DashboardLayout: 0% [IP1_UserDashboard]
     - T1_1_1_GridSystem: 0%
     - T1_1_2_Responsiveness: 0%
   ```

## VI. TASK PRIORITIZATION
1. Assess dependencies and align with project objectives
2. **CRITICAL** use write_file or edit_file `memory-bank/progress.md` with:
   ```
   ### Task Priorities
   1. T1_1_DashboardLayout (Highest) - Required for all dashboard work [IP1]
   2. T2_1_ProfileSettings (High) - Security requirement [IP2]
   ```

## VII. RELATIONSHIP VERIFICATION
Before proceeding, verify:
- Every implementation plan has appropriate tasks listed
- Every task references its parent implementation plan
- Every subtask is referenced by its parent task
- `memory-bank/progress.md` shows correct hierarchy and priorities

## VIII. MANDATORY UPDATE PROTOCOL (MUP)
After EVERY significant action:

1. Update `memorybankrules.md`:
   ```
   <PHASE_MARKER>
   CURRENT_PHASE: Strategy
   NEXT_PHASE: [next phase]
   LAST_ACTION: [what you just did]
   NEXT_ACTION: [what should be done next]
   </PHASE_MARKER>
   ```

2. Update `memory-bank/activeContext.md` with:
   - Action completed
   - Current state
   - Next steps

3. Update `memory-bank/changelog.md` for significant changes

## IX. TRANSITION CHECKLIST
Before transitioning to Execution phase, verify:
- All implementation plans have at least one associated task
- All tasks reference their parent implementation plan
- All implementation plans list their associated tasks
- Complex tasks are decomposed into subtasks if needed
- `memorybankrules.md` updated with `NEXT_PHASE: Execution`

## X. REQUIRED RESPONSE FORMAT
<MUP_COMPLETED_ACTIONS>
I have made the following file modifications:
1. EDITED `memorybankrules.md`: [quoted text]
2. EDITED `memory-bank/activeContext.md`: [quoted text]
3. EDITED `memory-bank/changelog.md`: [quoted text or "No significant changes"]
4. EDITED `memory-bank/progress.md`: [shows correct hierarchy and priorities - YES/NO]
5. EDITED ADDITIONAL FILES: [quoted relevant text]
6. VERIFICATION: All files properly updated.
7. NEXT ACTION: [next action]
</MUP_COMPLETED_ACTIONS>