# STRATEGY PLUGIN

> ⚠️ **CRITICAL WORKFLOW RULE:** You MUST create files in this exact sequence:
> 1. Implementation Plan FIRST
> 2. Tasks linked to that plan SECOND
> 3. Subtasks (if needed) THIRD
> ⚠️ **NEVER** create a task without first creating its parent implementation plan

## INITIALIZATION

1. Read current state:
   ```
   read_file memorybankrules.md
   read_file memory-bank/projectbrief.md
   read_file memory-bank/activeContext.md
   read_file memory-bank/progress.md
   ```

2. Create implementation plan directory if missing:
   ```
   create_directory memory-bank/implementation_plans
   ```

3. Create tasks directory if missing:
   ```
   create_directory memory-bank/tasks
   ```

## IMPLEMENTATION PLAN CREATION

1. Check next available plan number
2. Create plan using exact format:
   ```
   write_file memory-bank/implementation_plans/IP{number}_{PlanName}.md
   ```
   
   Template:
   ```
   # IP{number}_{PlanName}
   
   ## Overview
   [High-level description]
   
   ## Goals
   - [Goal 1]
   - [Goal 2]
   
   ## Technical Approach
   [Description]
   
   ## Related Tasks
   - T{number}_{task_number}_{TaskName} - [Brief description]
   
   ## Timeline & Risks
   [Timeline and risk information]
   ```

3. Update progress tracking:
   ```
   edit_file memory-bank/progress.md
   ```
   
   Add:
   ```
   ## Implementation Plans
   - IP{number}_{PlanName}: 0% (not started)
   ```

## TASK CREATION

1. Confirm parent plan exists
2. Create task with exact format:
   ```
   write_file memory-bank/tasks/T{implementation_number}_{task_number}_{TaskName}_instructions.md
   ```
   
   Template:
   ```
   # T{implementation_number}_{task_number}_{TaskName} Instructions
   
   ## Objective
   [Clear statement of purpose]
   
   ## Context
   [Background]
   [Implementation Plan: IP{implementation_number}_{PlanName}]
   
   ## Dependencies
   [Required modules/files]
   
   ## Steps
   1. ⬜ [First step]
   2. ⬜ [Second step]
   
   ## Expected Output
   [Deliverables]
   ```

3. Update parent implementation plan:
   ```
   edit_file memory-bank/implementation_plans/IP{implementation_number}_{PlanName}.md
   ```
   
   Add to "Related Tasks" section:
   ```
   - T{implementation_number}_{task_number}_{TaskName} - [Brief description]
   ```

4. Update progress tracking:
   ```
   edit_file memory-bank/progress.md
   ```
   
   Add to "Task Tracking" section:
   ```
   - T{implementation_number}_{task_number}_{TaskName}: 0% (not started) [IP{implementation_number}_{PlanName}]
   ```

## SUBTASK CREATION

1. Confirm parent task exists
2. Create subtask with exact format:
   ```
   write_file memory-bank/tasks/T{implementation_number}_{task_number}_{subtask_number}_{SubtaskName}_instructions.md
   ```
   
   Use same template as tasks

3. Update parent task:
   ```
   edit_file memory-bank/tasks/T{implementation_number}_{task_number}_{TaskName}_instructions.md
   ```
   
   Add "Subtasks" section:
   ```
   ## Subtasks
   - T{implementation_number}_{task_number}_{subtask_number}_{SubtaskName}
   ```

4. Update progress tracking:
   ```
   edit_file memory-bank/progress.md
   ```
   
   Add subtask under parent task:
   ```
   - T{implementation_number}_{task_number}_{TaskName}: 0% [IP{implementation_number}_{PlanName}]
     - T{implementation_number}_{task_number}_{subtask_number}_{SubtaskName}: 0%
   ```

## TASK PRIORITIZATION

1. Assess dependencies and objectives
2. Update progress tracking:
   ```
   edit_file memory-bank/progress.md
   ```
   
   Add "Task Priorities" section:
   ```
   ### Task Priorities
   1. T{implementation_number}_{task_number}_{TaskName} (Highest) - [rationale] [IP{implementation_number}]
   2. T{implementation_number}_{task_number}_{TaskName} (High) - [rationale] [IP{implementation_number}]
   ```

## RELATIONSHIP VERIFICATION

Before proceeding to execution phase, verify:
1. Every implementation plan has at least one task
2. Every task references its parent plan
3. Every subtask references its parent task
4. Progress.md shows correct hierarchy

## PHASE TRANSITION

When planning complete:
1. Update memorybankrules.md:
   ```
   edit_file memorybankrules.md
   ```
   
   Update phase marker:
   ```
   <PHASE_MARKER>
   CURRENT_PHASE: Strategy
   NEXT_PHASE: Execution
   LAST_ACTION: Completed Strategy Phase - Tasks Planned
   NEXT_ACTION: Begin Task Execution
   REQUIRED_BEFORE_TRANSITION: User Action Required
   </PHASE_MARKER>
   ```

2. Update activeContext.md with strategy summary:
   ```
   edit_file memory-bank/activeContext.md
   ```
   
   Add strategy results:
   ```
   ## Strategy [Date]
   - Created IP{number}_{PlanName}
   - Defined tasks: T{implementation_number}_{task_number}_{TaskName}
   - Priorities established
   - Ready for execution phase
   ```

## MANDATORY UPDATE PROTOCOL (MUP)

After EACH file creation or update:
1. Update memorybankrules.md with current status
2. Update activeContext.md with planning progress
3. Verify progress.md shows correct hierarchical structure

## EVIDENCE REQUIRED

After completing planning for each implementation:
```
PLANNING COMPLETE:

1. Implementation Plan:
   - IP{number}_{PlanName} created
   
2. Tasks Defined:
   - T{implementation_number}_{task_number}_{TaskName}
   - T{implementation_number}_{task_number}_{TaskName}
   
3. Priorities Established:
   1. T{implementation_number}_{task_number}_{TaskName} (Highest)
   2. T{implementation_number}_{task_number}_{TaskName} (High)

4. Files Modified:
   - memorybankrules.md: [key changes]
   - activeContext.md: [key changes]
   - progress.md: [maintains correct hierarchy - YES/NO]
   
USER VERIFICATION REQUIRED:
Please confirm these plans are correct before proceeding.
```