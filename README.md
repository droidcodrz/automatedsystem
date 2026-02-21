# Personal Productivity & Research Agent

An AI-powered productivity agent built with the Anthropic Claude API. This agent uses Claude's tool use capabilities to autonomously manage tasks, take notes, search the web, read files, perform calculations, and handle date/time queries through an interactive CLI.

## Why This Agent?

In today's world of information overload and constant context switching, this agent serves as a unified assistant that can:

- **Manage your workload** -- create, track, and complete tasks with priorities and due dates
- **Capture knowledge** -- save, search, and organize notes without leaving the terminal
- **Research anything** -- search the web and get synthesized answers
- **Work with files** -- read and summarize code, documents, and data files
- **Do the math** -- calculations, unit conversions, and date arithmetic on demand

The agent uses a **manual agentic loop** -- Claude autonomously decides which tools to call, executes them, and reasons over the results before responding.

## Architecture

```
User Input
    |
    v
+-------------------+
|   CLI Interface    |  (agent/main.py)
|   (REPL loop)     |
+-------------------+
    |
    v
+-------------------+
|  ProductivityAgent |  (agent/agent.py)
|  - Agentic loop   |
|  - Chat history    |
|  - Streaming       |
+-------------------+
    |         |
    v         v
+-------+  +------------------+
| Claude |  |  Local Tools     |
|  API   |  |  - Tasks         |
|        |  |  - Notes         |
|        |  |  - Web Search    |
|        |  |  - File Reader   |
|        |  |  - Calculator    |
|        |  |  - Date/Time     |
+-------+  +------------------+
```

**Agentic loop flow:**
1. User sends a message
2. Agent sends message + tool definitions to Claude
3. Claude responds with text and/or tool_use requests
4. Agent executes requested tools locally
5. Agent sends tool results back to Claude
6. Repeat until Claude responds with final text (end_turn)

## Setup

### Prerequisites
- Python 3.10+
- An [Anthropic API key](https://console.anthropic.com/)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd automatedsystem

# Install dependencies
pip install -r requirements.txt

# Set your API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

## Usage

### Interactive CLI

```bash
python -m agent.main
```

This starts an interactive session where you can chat naturally with the agent.

### Example Interactions

**Task Management:**
```
You: Add a task to review the Q4 report by Friday, high priority
Agent: I've created your task: "Review the Q4 report" with high priority, due Friday.

You: Show me my pending tasks
Agent: Here are your 3 pending tasks...
```

**Note Taking:**
```
You: Save a note titled "API Design Decisions" about choosing REST over GraphQL for simplicity
Agent: Note saved: "API Design Decisions"

You: Search my notes for anything about API
Agent: Found 1 result matching "API"...
```

**Web Research:**
```
You: What are the latest features in Python 3.13?
Agent: [searches the web and synthesizes results]
```

**File Operations:**
```
You: Read the file at ./agent/config.py and summarize what it does
Agent: [reads file and provides summary]
```

**Calculations:**
```
You: Convert 72 fahrenheit to celsius
Agent: 72°F = 22.22°C

You: What is 15% tip on $67.50?
Agent: 15% of $67.50 is $10.13, making the total $77.63.
```

**Date/Time:**
```
You: How many days until December 25, 2025?
Agent: There are X days until December 25, 2025.
```

### CLI Commands

| Command    | Description                    |
|------------|--------------------------------|
| `/help`    | Show help and examples         |
| `/reset`   | Clear conversation history     |
| `/history` | Show conversation statistics   |
| `/quit`    | Exit the agent                 |

### Programmatic Usage

```python
from agent.agent import ProductivityAgent

agent = ProductivityAgent()

# Simple question
response = agent.chat("What's 25% of 340?")
print(response)

# Multi-turn conversation (agent remembers context)
agent.chat("Create a task to buy groceries")
agent.chat("Add milk and eggs to that task's description")
agent.chat("Show my tasks")
```

## Tools

| Tool | Description |
|------|-------------|
| `create_task` | Create tasks with title, description, priority, due date, tags |
| `list_tasks` | List/filter tasks by status, priority, or tag |
| `update_task` | Update any task field |
| `complete_task` | Mark a task complete by ID or title |
| `delete_task` | Remove a task permanently |
| `save_note` | Save a note with title, content, and tags |
| `get_note` | Retrieve a note by title |
| `list_notes` | List all notes, optionally filtered by tag |
| `search_notes` | Full-text search across all notes |
| `delete_note` | Delete a note |
| `web_search` | Search the web via DuckDuckGo |
| `read_file` | Read local files with line offset/limit support |
| `list_directory` | List directory contents with glob filtering |
| `calculate` | Evaluate math expressions (arithmetic, trig, logs, etc.) |
| `unit_convert` | Convert units (length, weight, temperature, data, time) |
| `get_current_datetime` | Get current date/time |
| `date_difference` | Calculate days between two dates |
| `add_to_date` | Add days/weeks to a date |

## Project Structure

```
automatedsystem/
├── agent/
│   ├── __init__.py
│   ├── main.py              # CLI entry point
│   ├── agent.py             # Core agent with agentic loop
│   ├── config.py            # Configuration and constants
│   └── tools/
│       ├── __init__.py      # Tool registry and dispatcher
│       ├── tasks.py         # Task management (CRUD + priorities)
│       ├── notes.py         # Note taking (save/search/organize)
│       ├── web_search.py    # Web search via DuckDuckGo
│       ├── file_reader.py   # File reading and directory listing
│       ├── calculator.py    # Math and unit conversions
│       └── datetime_tool.py # Date/time utilities
├── data/                    # Persistent storage (tasks, notes)
├── tests/
│   └── test_tools.py        # Tool unit tests (36 tests)
├── requirements.txt
├── .env.example
└── .gitignore
```

## Running Tests

```bash
python -m pytest tests/ -v
```

## Configuration

Edit `agent/config.py` to customize:
- `MODEL` -- Claude model to use (default: `claude-sonnet-4-5`)
- `MAX_TOKENS` -- Max response tokens (default: 4096)
- `SYSTEM_PROMPT` -- Agent personality and guidelines
- `DATA_DIR` -- Where tasks and notes are stored

## License

MIT
