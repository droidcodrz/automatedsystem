"""Task management tool - create, list, update, and complete tasks."""

import json
import uuid
from datetime import datetime

from agent.config import TASKS_FILE, ensure_data_dirs

TASK_TOOLS = [
    {
        "name": "create_task",
        "description": "Create a new task with a title, optional description, priority, and due date. Use this when the user wants to add something to their to-do list.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "The task title (short, actionable description)"
                },
                "description": {
                    "type": "string",
                    "description": "Optional detailed description of the task"
                },
                "priority": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "urgent"],
                    "description": "Task priority level. Defaults to 'medium'."
                },
                "due_date": {
                    "type": "string",
                    "description": "Optional due date in YYYY-MM-DD format"
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional list of tags for categorization"
                }
            },
            "required": ["title"]
        }
    },
    {
        "name": "list_tasks",
        "description": "List all tasks, optionally filtered by status, priority, or tag. Use this to show the user their current tasks.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["pending", "in_progress", "completed", "all"],
                    "description": "Filter by task status. Defaults to showing non-completed tasks."
                },
                "priority": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "urgent"],
                    "description": "Filter by priority level"
                },
                "tag": {
                    "type": "string",
                    "description": "Filter by tag"
                }
            }
        }
    },
    {
        "name": "update_task",
        "description": "Update an existing task's title, description, priority, status, or due date.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "The ID of the task to update"
                },
                "title": {"type": "string", "description": "New title"},
                "description": {"type": "string", "description": "New description"},
                "priority": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "urgent"]
                },
                "status": {
                    "type": "string",
                    "enum": ["pending", "in_progress", "completed"]
                },
                "due_date": {"type": "string", "description": "New due date (YYYY-MM-DD)"}
            },
            "required": ["task_id"]
        }
    },
    {
        "name": "complete_task",
        "description": "Mark a task as completed by its ID or title.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "The ID of the task to complete"
                },
                "title": {
                    "type": "string",
                    "description": "The title (or partial title) of the task to complete. Used if task_id is not provided."
                }
            }
        }
    },
    {
        "name": "delete_task",
        "description": "Delete a task permanently by its ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "The ID of the task to delete"
                }
            },
            "required": ["task_id"]
        }
    }
]


def _load_tasks() -> list[dict]:
    """Load tasks from the JSON file."""
    ensure_data_dirs()
    if not TASKS_FILE.exists():
        return []
    with open(TASKS_FILE, "r") as f:
        return json.load(f)


def _save_tasks(tasks: list[dict]):
    """Save tasks to the JSON file."""
    ensure_data_dirs()
    with open(TASKS_FILE, "w") as f:
        json.dump(tasks, f, indent=2)


def execute_task_tool(name: str, tool_input: dict) -> str:
    """Execute a task management tool."""
    if name == "create_task":
        return _create_task(tool_input)
    elif name == "list_tasks":
        return _list_tasks(tool_input)
    elif name == "update_task":
        return _update_task(tool_input)
    elif name == "complete_task":
        return _complete_task(tool_input)
    elif name == "delete_task":
        return _delete_task(tool_input)
    return f"Unknown task tool: {name}"


def _create_task(params: dict) -> str:
    tasks = _load_tasks()
    task = {
        "id": str(uuid.uuid4())[:8],
        "title": params["title"],
        "description": params.get("description", ""),
        "priority": params.get("priority", "medium"),
        "status": "pending",
        "due_date": params.get("due_date"),
        "tags": params.get("tags", []),
        "created_at": datetime.now().isoformat(),
        "completed_at": None
    }
    tasks.append(task)
    _save_tasks(tasks)
    return json.dumps({"status": "created", "task": task}, indent=2)


def _list_tasks(params: dict) -> str:
    tasks = _load_tasks()
    if not tasks:
        return "No tasks found. Create one with the create_task tool."

    status_filter = params.get("status", "all")
    priority_filter = params.get("priority")
    tag_filter = params.get("tag")

    filtered = tasks
    if status_filter and status_filter != "all":
        filtered = [t for t in filtered if t["status"] == status_filter]
    if priority_filter:
        filtered = [t for t in filtered if t["priority"] == priority_filter]
    if tag_filter:
        filtered = [t for t in filtered if tag_filter in t.get("tags", [])]

    if not filtered:
        return "No tasks match the given filters."

    return json.dumps({"count": len(filtered), "tasks": filtered}, indent=2)


def _update_task(params: dict) -> str:
    tasks = _load_tasks()
    task_id = params["task_id"]

    for task in tasks:
        if task["id"] == task_id:
            for field in ["title", "description", "priority", "status", "due_date"]:
                if field in params:
                    task[field] = params[field]
            _save_tasks(tasks)
            return json.dumps({"status": "updated", "task": task}, indent=2)

    return f"Task with ID '{task_id}' not found."


def _complete_task(params: dict) -> str:
    tasks = _load_tasks()
    task_id = params.get("task_id")
    title = params.get("title", "").lower()

    for task in tasks:
        if task["id"] == task_id or (title and title in task["title"].lower()):
            task["status"] = "completed"
            task["completed_at"] = datetime.now().isoformat()
            _save_tasks(tasks)
            return json.dumps({"status": "completed", "task": task}, indent=2)

    return "Task not found. Use list_tasks to see available tasks."


def _delete_task(params: dict) -> str:
    tasks = _load_tasks()
    task_id = params["task_id"]

    for i, task in enumerate(tasks):
        if task["id"] == task_id:
            deleted = tasks.pop(i)
            _save_tasks(tasks)
            return json.dumps({"status": "deleted", "task": deleted}, indent=2)

    return f"Task with ID '{task_id}' not found."
