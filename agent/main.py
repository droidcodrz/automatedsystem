"""CLI interface for the Personal Productivity & Research Agent.

Run with:
    python -m agent.main
"""

import os
import sys

from dotenv import load_dotenv

from agent.agent import ProductivityAgent
from agent.config import ensure_data_dirs

BANNER = """
 ====================================================
  Personal Productivity & Research Agent
  Powered by Claude (Anthropic)
 ====================================================

 Available capabilities:
   - Task management (create, list, complete tasks)
   - Note taking (save, search, organize notes)
   - Web search (research any topic)
   - File reading (read & summarize local files)
   - Calculations (math, unit conversions)
   - Date/time utilities (current time, date math)

 Commands:
   /help    - Show this help message
   /reset   - Clear conversation history
   /history - Show conversation stats
   /quit    - Exit the agent

 Type your message to get started!
"""

HELP_TEXT = """
Examples of what you can ask:

  Task Management:
    "Add a task to review the quarterly report by Friday"
    "Show me my pending tasks"
    "Mark the report review task as complete"

  Notes:
    "Save a note about the meeting decisions"
    "Search my notes for anything about API design"
    "List all my notes tagged with 'project'"

  Research:
    "Search the web for the latest Python 3.13 features"
    "What are the current best practices for REST API design?"

  Files:
    "Read the file at ./README.md"
    "List all Python files in the current directory"

  Calculations:
    "Calculate 15% tip on $67.50"
    "Convert 72 fahrenheit to celsius"
    "What is sqrt(144) + log10(1000)?"

  Date & Time:
    "What day is it today?"
    "How many days until December 25, 2025?"
    "What date is 3 weeks from today?"
"""


def main():
    """Run the interactive CLI agent."""
    load_dotenv()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY environment variable is not set.")
        print("Set it with: export ANTHROPIC_API_KEY='your-key-here'")
        print("Or create a .env file with: ANTHROPIC_API_KEY=your-key-here")
        sys.exit(1)

    ensure_data_dirs()

    agent = ProductivityAgent(api_key=api_key)

    print(BANNER)

    while True:
        try:
            user_input = input("\nYou: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n\nGoodbye!")
            break

        if not user_input:
            continue

        # Handle commands
        if user_input.startswith("/"):
            command = user_input.lower()
            if command in ("/quit", "/exit", "/q"):
                print("Goodbye!")
                break
            elif command == "/help":
                print(HELP_TEXT)
                continue
            elif command == "/reset":
                agent.reset()
                print("Conversation history cleared.")
                continue
            elif command == "/history":
                stats = agent.get_history_summary()
                print(f"\nConversation Stats:")
                print(f"  User messages:    {stats['user_messages']}")
                print(f"  Agent responses:  {stats['assistant_messages']}")
                print(f"  Tool call rounds: {stats['tool_call_rounds']}")
                print(f"  Total messages:   {stats['total_messages']}")
                continue
            else:
                print(f"Unknown command: {user_input}. Type /help for available commands.")
                continue

        # Send to agent
        print("\nAgent: ", end="", flush=True)
        try:
            response = agent.chat(user_input, stream=True)
            # Response is already printed by streaming, but if streaming
            # didn't print (e.g., only tool calls with final response),
            # we print it here
            if not response:
                print("(No response generated)")
        except Exception as e:
            print(f"\nError: {e}")
            print("Try again or type /help for assistance.")


if __name__ == "__main__":
    main()
