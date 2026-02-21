"""Note-taking tool - save, retrieve, search, and organize notes."""

import json
from datetime import datetime
from pathlib import Path

from agent.config import NOTES_DIR, ensure_data_dirs

NOTE_TOOLS = [
    {
        "name": "save_note",
        "description": "Save a note with a title and content. Notes are persisted to disk. Use this when the user wants to jot down ideas, save information, or keep records.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "The note title (used as filename, keep it short and descriptive)"
                },
                "content": {
                    "type": "string",
                    "description": "The note content (supports plain text)"
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional tags for organization"
                }
            },
            "required": ["title", "content"]
        }
    },
    {
        "name": "get_note",
        "description": "Retrieve a note by its title.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "The title of the note to retrieve"
                }
            },
            "required": ["title"]
        }
    },
    {
        "name": "list_notes",
        "description": "List all saved notes with their titles, tags, and creation dates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tag": {
                    "type": "string",
                    "description": "Optional tag to filter notes by"
                }
            }
        }
    },
    {
        "name": "search_notes",
        "description": "Search through all notes for a keyword or phrase.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to look for in note titles and content"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "delete_note",
        "description": "Delete a note by its title.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "The title of the note to delete"
                }
            },
            "required": ["title"]
        }
    }
]


def _sanitize_filename(title: str) -> str:
    """Convert a title to a safe filename."""
    safe = "".join(c if c.isalnum() or c in " -_" else "_" for c in title)
    return safe.strip().replace(" ", "_").lower()


def _note_path(title: str) -> Path:
    return NOTES_DIR / f"{_sanitize_filename(title)}.json"


def execute_note_tool(name: str, tool_input: dict) -> str:
    """Execute a note management tool."""
    ensure_data_dirs()
    if name == "save_note":
        return _save_note(tool_input)
    elif name == "get_note":
        return _get_note(tool_input)
    elif name == "list_notes":
        return _list_notes(tool_input)
    elif name == "search_notes":
        return _search_notes(tool_input)
    elif name == "delete_note":
        return _delete_note(tool_input)
    return f"Unknown note tool: {name}"


def _save_note(params: dict) -> str:
    path = _note_path(params["title"])
    note = {
        "title": params["title"],
        "content": params["content"],
        "tags": params.get("tags", []),
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }

    if path.exists():
        existing = json.loads(path.read_text())
        note["created_at"] = existing.get("created_at", note["created_at"])

    path.write_text(json.dumps(note, indent=2))
    return json.dumps({"status": "saved", "title": params["title"], "path": str(path)})


def _get_note(params: dict) -> str:
    path = _note_path(params["title"])
    if not path.exists():
        # Try fuzzy match
        for p in NOTES_DIR.glob("*.json"):
            if _sanitize_filename(params["title"]) in p.stem:
                path = p
                break
        else:
            return f"Note '{params['title']}' not found. Use list_notes to see available notes."

    note = json.loads(path.read_text())
    return json.dumps(note, indent=2)


def _list_notes(params: dict) -> str:
    notes = []
    tag_filter = params.get("tag")

    for path in sorted(NOTES_DIR.glob("*.json")):
        note = json.loads(path.read_text())
        if tag_filter and tag_filter not in note.get("tags", []):
            continue
        notes.append({
            "title": note["title"],
            "tags": note.get("tags", []),
            "created_at": note["created_at"],
            "preview": note["content"][:100] + ("..." if len(note["content"]) > 100 else "")
        })

    if not notes:
        return "No notes found. Save one with the save_note tool."
    return json.dumps({"count": len(notes), "notes": notes}, indent=2)


def _search_notes(params: dict) -> str:
    query = params["query"].lower()
    results = []

    for path in NOTES_DIR.glob("*.json"):
        note = json.loads(path.read_text())
        title_match = query in note["title"].lower()
        content_match = query in note["content"].lower()
        tag_match = any(query in t.lower() for t in note.get("tags", []))

        if title_match or content_match or tag_match:
            # Find matching snippet
            snippet = ""
            if content_match:
                idx = note["content"].lower().index(query)
                start = max(0, idx - 40)
                end = min(len(note["content"]), idx + len(query) + 40)
                snippet = "..." + note["content"][start:end] + "..."
            results.append({
                "title": note["title"],
                "match_in": [k for k, v in [("title", title_match), ("content", content_match), ("tags", tag_match)] if v],
                "snippet": snippet
            })

    if not results:
        return f"No notes found matching '{params['query']}'."
    return json.dumps({"count": len(results), "results": results}, indent=2)


def _delete_note(params: dict) -> str:
    path = _note_path(params["title"])
    if not path.exists():
        return f"Note '{params['title']}' not found."
    path.unlink()
    return json.dumps({"status": "deleted", "title": params["title"]})
