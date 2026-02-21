"""File reader tool - read and summarize local files."""

import json
import os
from pathlib import Path

FILE_READER_TOOLS = [
    {
        "name": "read_file",
        "description": "Read the contents of a local file. Supports text files, code files, JSON, CSV, and more. Use this when the user wants to view, analyze, or summarize a file.",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file to read (absolute or relative to current directory)"
                },
                "max_lines": {
                    "type": "integer",
                    "description": "Maximum number of lines to read. Defaults to 200. Use for large files."
                },
                "line_offset": {
                    "type": "integer",
                    "description": "Start reading from this line number (0-indexed). Defaults to 0."
                }
            },
            "required": ["file_path"]
        }
    },
    {
        "name": "list_directory",
        "description": "List files and directories at a given path. Use this to explore a directory structure.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Directory path to list. Defaults to current directory."
                },
                "pattern": {
                    "type": "string",
                    "description": "Optional glob pattern to filter files (e.g., '*.py', '*.txt')"
                }
            }
        }
    }
]


def execute_file_reader_tool(name: str, tool_input: dict) -> str:
    """Execute a file reader tool."""
    if name == "read_file":
        return _read_file(tool_input)
    elif name == "list_directory":
        return _list_directory(tool_input)
    return f"Unknown file reader tool: {name}"


def _read_file(params: dict) -> str:
    file_path = Path(params["file_path"]).expanduser()
    max_lines = params.get("max_lines", 200)
    offset = params.get("line_offset", 0)

    if not file_path.exists():
        return f"File not found: {file_path}"
    if not file_path.is_file():
        return f"Not a file: {file_path}"
    if file_path.stat().st_size > 10 * 1024 * 1024:  # 10MB limit
        return f"File too large ({file_path.stat().st_size / 1024 / 1024:.1f} MB). Max is 10MB."

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
    except Exception as e:
        return f"Error reading file: {e}"

    total_lines = len(all_lines)
    selected = all_lines[offset:offset + max_lines]
    content = "".join(selected)

    return json.dumps({
        "file": str(file_path),
        "total_lines": total_lines,
        "showing_lines": f"{offset + 1}-{offset + len(selected)}",
        "truncated": total_lines > offset + max_lines,
        "content": content
    }, indent=2)


def _list_directory(params: dict) -> str:
    dir_path = Path(params.get("path", ".")).expanduser()
    pattern = params.get("pattern")

    if not dir_path.exists():
        return f"Directory not found: {dir_path}"
    if not dir_path.is_dir():
        return f"Not a directory: {dir_path}"

    entries = []
    try:
        if pattern:
            items = sorted(dir_path.glob(pattern))
        else:
            items = sorted(dir_path.iterdir())

        for item in items[:100]:  # Limit to 100 entries
            stat = item.stat()
            entries.append({
                "name": item.name,
                "type": "directory" if item.is_dir() else "file",
                "size": stat.st_size if item.is_file() else None,
                "extension": item.suffix if item.is_file() else None
            })
    except PermissionError:
        return f"Permission denied: {dir_path}"

    return json.dumps({
        "path": str(dir_path.resolve()),
        "count": len(entries),
        "entries": entries
    }, indent=2)
