"""Tests for agent tools."""

import json
import os
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

# Ensure agent package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.tools.calculator import execute_calculator_tool
from agent.tools.datetime_tool import execute_datetime_tool
from agent.tools.file_reader import execute_file_reader_tool
from agent.tools.tasks import execute_task_tool, _load_tasks, _save_tasks
from agent.tools.notes import execute_note_tool
from agent.config import TASKS_FILE, NOTES_DIR, ensure_data_dirs


# ============================================================
# Calculator Tests
# ============================================================

class TestCalculator:
    def test_basic_arithmetic(self):
        result = json.loads(execute_calculator_tool("calculate", {"expression": "2 + 3 * 4"}))
        assert result["result"] == 14

    def test_sqrt(self):
        result = json.loads(execute_calculator_tool("calculate", {"expression": "sqrt(144)"}))
        assert result["result"] == 12.0

    def test_trig(self):
        result = json.loads(execute_calculator_tool("calculate", {"expression": "sin(pi / 2)"}))
        assert abs(result["result"] - 1.0) < 1e-10

    def test_division_by_zero(self):
        result = json.loads(execute_calculator_tool("calculate", {"expression": "1 / 0"}))
        assert "error" in result

    def test_unsafe_names_blocked(self):
        result = json.loads(execute_calculator_tool("calculate", {"expression": "os.system('ls')"}))
        assert "error" in result

    def test_unit_convert_length(self):
        result = json.loads(execute_calculator_tool("unit_convert", {
            "value": 1, "from_unit": "km", "to_unit": "meters"
        }))
        assert "1000" in result["result"]

    def test_unit_convert_temperature(self):
        result = json.loads(execute_calculator_tool("unit_convert", {
            "value": 100, "from_unit": "celsius", "to_unit": "fahrenheit"
        }))
        assert "212" in result["result"]

    def test_unit_convert_data(self):
        result = json.loads(execute_calculator_tool("unit_convert", {
            "value": 1, "from_unit": "GB", "to_unit": "MB"
        }))
        assert "1024" in result["result"]

    def test_unit_convert_incompatible(self):
        result = json.loads(execute_calculator_tool("unit_convert", {
            "value": 1, "from_unit": "km", "to_unit": "kg"
        }))
        assert "error" in result


# ============================================================
# DateTime Tests
# ============================================================

class TestDatetime:
    def test_get_current_datetime(self):
        result = json.loads(execute_datetime_tool("get_current_datetime", {}))
        assert "date" in result
        assert "day_of_week" in result

    def test_get_date_only(self):
        result = json.loads(execute_datetime_tool("get_current_datetime", {"format": "date"}))
        assert "date" in result
        assert "datetime" not in result

    def test_date_difference(self):
        result = json.loads(execute_datetime_tool("date_difference", {
            "date1": "2025-01-01", "date2": "2025-01-31"
        }))
        assert result["difference"]["total_days"] == 30

    def test_date_difference_with_today(self):
        result = json.loads(execute_datetime_tool("date_difference", {
            "date1": "today", "date2": "today"
        }))
        assert result["difference"]["total_days"] == 0

    def test_add_to_date(self):
        result = json.loads(execute_datetime_tool("add_to_date", {
            "date": "2025-01-01", "days": 10
        }))
        assert "2025-01-11" in result["result_date"]

    def test_add_weeks(self):
        result = json.loads(execute_datetime_tool("add_to_date", {
            "date": "2025-01-01", "weeks": 2
        }))
        assert "2025-01-15" in result["result_date"]

    def test_invalid_date(self):
        result = json.loads(execute_datetime_tool("date_difference", {
            "date1": "not-a-date", "date2": "2025-01-01"
        }))
        assert "error" in result


# ============================================================
# Task Tests
# ============================================================

class TestTasks:
    def setup_method(self):
        """Clear tasks before each test."""
        ensure_data_dirs()
        _save_tasks([])

    def test_create_task(self):
        result = json.loads(execute_task_tool("create_task", {
            "title": "Test task", "priority": "high"
        }))
        assert result["status"] == "created"
        assert result["task"]["title"] == "Test task"
        assert result["task"]["priority"] == "high"

    def test_list_tasks(self):
        execute_task_tool("create_task", {"title": "Task 1"})
        execute_task_tool("create_task", {"title": "Task 2"})
        result = json.loads(execute_task_tool("list_tasks", {}))
        assert result["count"] == 2

    def test_complete_task(self):
        create_result = json.loads(execute_task_tool("create_task", {"title": "Finish report"}))
        task_id = create_result["task"]["id"]
        result = json.loads(execute_task_tool("complete_task", {"task_id": task_id}))
        assert result["status"] == "completed"
        assert result["task"]["status"] == "completed"

    def test_complete_task_by_title(self):
        execute_task_tool("create_task", {"title": "Write documentation"})
        result = json.loads(execute_task_tool("complete_task", {"title": "documentation"}))
        assert result["status"] == "completed"

    def test_delete_task(self):
        create_result = json.loads(execute_task_tool("create_task", {"title": "Delete me"}))
        task_id = create_result["task"]["id"]
        result = json.loads(execute_task_tool("delete_task", {"task_id": task_id}))
        assert result["status"] == "deleted"
        tasks_result = execute_task_tool("list_tasks", {})
        assert "No tasks" in tasks_result

    def test_update_task(self):
        create_result = json.loads(execute_task_tool("create_task", {"title": "Old title"}))
        task_id = create_result["task"]["id"]
        result = json.loads(execute_task_tool("update_task", {
            "task_id": task_id, "title": "New title", "priority": "urgent"
        }))
        assert result["task"]["title"] == "New title"
        assert result["task"]["priority"] == "urgent"

    def test_list_empty(self):
        result = execute_task_tool("list_tasks", {})
        assert "No tasks" in result


# ============================================================
# Notes Tests
# ============================================================

class TestNotes:
    def setup_method(self):
        """Clear notes before each test."""
        ensure_data_dirs()
        for f in NOTES_DIR.glob("*.json"):
            f.unlink()

    def test_save_note(self):
        result = json.loads(execute_note_tool("save_note", {
            "title": "Test Note", "content": "This is a test note."
        }))
        assert result["status"] == "saved"

    def test_get_note(self):
        execute_note_tool("save_note", {
            "title": "My Note", "content": "Important content here."
        })
        result = json.loads(execute_note_tool("get_note", {"title": "My Note"}))
        assert result["content"] == "Important content here."

    def test_list_notes(self):
        execute_note_tool("save_note", {"title": "Note 1", "content": "Content 1"})
        execute_note_tool("save_note", {"title": "Note 2", "content": "Content 2"})
        result = json.loads(execute_note_tool("list_notes", {}))
        assert result["count"] == 2

    def test_search_notes(self):
        execute_note_tool("save_note", {
            "title": "Meeting Notes", "content": "Discussed API design patterns."
        })
        execute_note_tool("save_note", {
            "title": "Shopping List", "content": "Milk, eggs, bread."
        })
        result = json.loads(execute_note_tool("search_notes", {"query": "API design"}))
        assert result["count"] == 1
        assert result["results"][0]["title"] == "Meeting Notes"

    def test_delete_note(self):
        execute_note_tool("save_note", {"title": "Delete Me", "content": "Temporary."})
        result = json.loads(execute_note_tool("delete_note", {"title": "Delete Me"}))
        assert result["status"] == "deleted"

    def test_list_notes_with_tag(self):
        execute_note_tool("save_note", {
            "title": "Tagged Note", "content": "With tag.", "tags": ["work"]
        })
        execute_note_tool("save_note", {
            "title": "Untagged", "content": "No tag."
        })
        result = json.loads(execute_note_tool("list_notes", {"tag": "work"}))
        assert result["count"] == 1


# ============================================================
# File Reader Tests
# ============================================================

class TestFileReader:
    def test_read_file(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("Line 1\nLine 2\nLine 3\n")
            f.flush()
            result = json.loads(execute_file_reader_tool("read_file", {"file_path": f.name}))
            assert result["total_lines"] == 3
            assert "Line 1" in result["content"]
        os.unlink(f.name)

    def test_read_file_with_offset(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            for i in range(10):
                f.write(f"Line {i}\n")
            f.flush()
            result = json.loads(execute_file_reader_tool("read_file", {
                "file_path": f.name, "line_offset": 5, "max_lines": 3
            }))
            assert "Line 5" in result["content"]
            assert result["truncated"] is True
        os.unlink(f.name)

    def test_file_not_found(self):
        result = execute_file_reader_tool("read_file", {"file_path": "/nonexistent/file.txt"})
        assert "not found" in result.lower()

    def test_list_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            Path(tmpdir, "test.py").write_text("pass")
            Path(tmpdir, "test.txt").write_text("hello")
            result = json.loads(execute_file_reader_tool("list_directory", {"path": tmpdir}))
            assert result["count"] == 2

    def test_list_directory_with_pattern(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            Path(tmpdir, "a.py").write_text("pass")
            Path(tmpdir, "b.py").write_text("pass")
            Path(tmpdir, "c.txt").write_text("hello")
            result = json.loads(execute_file_reader_tool("list_directory", {
                "path": tmpdir, "pattern": "*.py"
            }))
            assert result["count"] == 2


# ============================================================
# Integration: Tool Dispatcher
# ============================================================

class TestToolDispatcher:
    def test_execute_known_tool(self):
        from agent.tools import execute_tool
        result = execute_tool("calculate", {"expression": "1 + 1"})
        parsed = json.loads(result)
        assert parsed["result"] == 2

    def test_execute_unknown_tool(self):
        from agent.tools import execute_tool
        result = execute_tool("nonexistent_tool", {})
        assert "Unknown tool" in result


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
