"""Agent tools for task management, notes, search, and more."""

from agent.tools.tasks import TASK_TOOLS, execute_task_tool
from agent.tools.notes import NOTE_TOOLS, execute_note_tool
from agent.tools.web_search import WEB_SEARCH_TOOLS, execute_web_search_tool
from agent.tools.file_reader import FILE_READER_TOOLS, execute_file_reader_tool
from agent.tools.calculator import CALCULATOR_TOOLS, execute_calculator_tool
from agent.tools.datetime_tool import DATETIME_TOOLS, execute_datetime_tool

ALL_TOOLS = (
    TASK_TOOLS
    + NOTE_TOOLS
    + WEB_SEARCH_TOOLS
    + FILE_READER_TOOLS
    + CALCULATOR_TOOLS
    + DATETIME_TOOLS
)

TOOL_EXECUTORS = {
    "create_task": execute_task_tool,
    "list_tasks": execute_task_tool,
    "update_task": execute_task_tool,
    "complete_task": execute_task_tool,
    "delete_task": execute_task_tool,
    "save_note": execute_note_tool,
    "get_note": execute_note_tool,
    "list_notes": execute_note_tool,
    "search_notes": execute_note_tool,
    "delete_note": execute_note_tool,
    "web_search": execute_web_search_tool,
    "read_file": execute_file_reader_tool,
    "list_directory": execute_file_reader_tool,
    "calculate": execute_calculator_tool,
    "unit_convert": execute_calculator_tool,
    "get_current_datetime": execute_datetime_tool,
    "date_difference": execute_datetime_tool,
    "add_to_date": execute_datetime_tool,
}


def execute_tool(name: str, tool_input: dict) -> str:
    """Execute a tool by name and return the result string."""
    executor = TOOL_EXECUTORS.get(name)
    if executor is None:
        return f"Error: Unknown tool '{name}'"
    try:
        return executor(name, tool_input)
    except Exception as e:
        return f"Error executing {name}: {e}"
