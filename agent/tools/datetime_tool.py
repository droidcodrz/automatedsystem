"""Date and time tool - current time, date calculations, and scheduling."""

import json
from datetime import datetime, timedelta

DATETIME_TOOLS = [
    {
        "name": "get_current_datetime",
        "description": "Get the current date and time in a specified timezone or UTC. Use when the user asks about the current time or date.",
        "input_schema": {
            "type": "object",
            "properties": {
                "format": {
                    "type": "string",
                    "description": "Output format. 'full' for complete datetime, 'date' for date only, 'time' for time only. Defaults to 'full'."
                }
            }
        }
    },
    {
        "name": "date_difference",
        "description": "Calculate the difference between two dates. Use when the user asks how many days between dates, or how long until a date.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date1": {
                    "type": "string",
                    "description": "First date in YYYY-MM-DD format, or 'today' for current date"
                },
                "date2": {
                    "type": "string",
                    "description": "Second date in YYYY-MM-DD format, or 'today' for current date"
                }
            },
            "required": ["date1", "date2"]
        }
    },
    {
        "name": "add_to_date",
        "description": "Add or subtract days, weeks, or months from a date. Use for calculating future or past dates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "description": "Starting date in YYYY-MM-DD format, or 'today' for current date"
                },
                "days": {
                    "type": "integer",
                    "description": "Number of days to add (negative to subtract)"
                },
                "weeks": {
                    "type": "integer",
                    "description": "Number of weeks to add (negative to subtract)"
                }
            },
            "required": ["date"]
        }
    }
]


def _parse_date(date_str: str) -> datetime:
    """Parse a date string, supporting 'today' as a special value."""
    if date_str.lower() == "today":
        return datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return datetime.strptime(date_str, "%Y-%m-%d")


def execute_datetime_tool(name: str, tool_input: dict) -> str:
    """Execute a datetime tool."""
    if name == "get_current_datetime":
        return _get_current_datetime(tool_input)
    elif name == "date_difference":
        return _date_difference(tool_input)
    elif name == "add_to_date":
        return _add_to_date(tool_input)
    return f"Unknown datetime tool: {name}"


def _get_current_datetime(params: dict) -> str:
    now = datetime.now()
    fmt = params.get("format", "full")

    result = {
        "timezone": "local",
        "day_of_week": now.strftime("%A"),
    }

    if fmt == "date":
        result["date"] = now.strftime("%Y-%m-%d")
    elif fmt == "time":
        result["time"] = now.strftime("%H:%M:%S")
    else:
        result["datetime"] = now.strftime("%Y-%m-%d %H:%M:%S")
        result["date"] = now.strftime("%Y-%m-%d")
        result["time"] = now.strftime("%H:%M:%S")
        result["iso"] = now.isoformat()

    return json.dumps(result, indent=2)


def _date_difference(params: dict) -> str:
    try:
        date1 = _parse_date(params["date1"])
        date2 = _parse_date(params["date2"])
    except ValueError as e:
        return json.dumps({"error": f"Invalid date format: {e}. Use YYYY-MM-DD."})

    diff = date2 - date1
    total_days = diff.days
    weeks = abs(total_days) // 7
    remaining_days = abs(total_days) % 7

    return json.dumps({
        "date1": date1.strftime("%Y-%m-%d (%A)"),
        "date2": date2.strftime("%Y-%m-%d (%A)"),
        "difference": {
            "total_days": total_days,
            "weeks": weeks,
            "remaining_days": remaining_days,
            "description": f"{abs(total_days)} days ({weeks} weeks and {remaining_days} days)"
        }
    }, indent=2)


def _add_to_date(params: dict) -> str:
    try:
        date = _parse_date(params["date"])
    except ValueError as e:
        return json.dumps({"error": f"Invalid date format: {e}. Use YYYY-MM-DD."})

    days = params.get("days", 0)
    weeks = params.get("weeks", 0)

    total_days = days + (weeks * 7)
    result_date = date + timedelta(days=total_days)

    return json.dumps({
        "original_date": date.strftime("%Y-%m-%d (%A)"),
        "added": f"{days} days, {weeks} weeks (total: {total_days} days)",
        "result_date": result_date.strftime("%Y-%m-%d (%A)")
    }, indent=2)
