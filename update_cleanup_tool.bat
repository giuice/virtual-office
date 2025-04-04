@echo off
REM Update cleanup companies tool dependencies
python -m cline_utils.dependency_system.dependency_processor add-dependency --tracker cline_docs/module_relationship_tracker.md --source-key 4Aada --target-key 3Aib --dep-type ">"
python -m cline_utils.dependency_system.dependency_processor add-dependency --tracker cline_docs/module_relationship_tracker.md --source-key 4Aada --target-key 3Aia --dep-type ">"