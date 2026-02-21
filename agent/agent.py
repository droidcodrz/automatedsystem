"""Core agent implementation with manual agentic loop.

This module implements the agent using a manual agentic loop pattern,
giving full control over tool execution, conversation history, and
error handling. The agent uses the Claude API with tool use to
autonomously decide which tools to call.
"""

import json

import anthropic

from agent.config import MODEL, MAX_TOKENS, SYSTEM_PROMPT
from agent.tools import ALL_TOOLS, execute_tool


class ProductivityAgent:
    """An AI agent for personal productivity, powered by Claude.

    Uses a manual agentic loop: sends messages to Claude, detects tool use
    requests, executes tools locally, feeds results back, and repeats
    until Claude produces a final text response.
    """

    def __init__(self, api_key: str | None = None):
        """Initialize the agent.

        Args:
            api_key: Anthropic API key. If None, reads from ANTHROPIC_API_KEY env var.
        """
        if api_key:
            self.client = anthropic.Anthropic(api_key=api_key)
        else:
            self.client = anthropic.Anthropic()
        self.messages: list[dict] = []
        self.model = MODEL
        self.max_tokens = MAX_TOKENS
        self.tools = ALL_TOOLS
        self.max_iterations = 10  # Safety limit for tool call loops

    def reset(self):
        """Clear conversation history."""
        self.messages = []

    def chat(self, user_message: str, stream: bool = False) -> str:
        """Send a message and get a response, executing any tool calls.

        This implements the agentic loop:
        1. Send user message + conversation history to Claude
        2. If Claude responds with tool_use blocks, execute each tool
        3. Send tool results back to Claude
        4. Repeat until Claude responds with end_turn

        Args:
            user_message: The user's input message.
            stream: If True, stream the response text to stdout.

        Returns:
            The agent's final text response.
        """
        self.messages.append({"role": "user", "content": user_message})

        for _ in range(self.max_iterations):
            if stream:
                response = self._stream_response()
            else:
                response = self._get_response()

            # If Claude is done (no more tool calls), extract and return text
            if response.stop_reason == "end_turn":
                assistant_text = self._extract_text(response)
                self.messages.append({"role": "assistant", "content": response.content})
                return assistant_text

            # Extract tool use blocks
            tool_use_blocks = [b for b in response.content if b.type == "tool_use"]

            if not tool_use_blocks:
                # No tools and not end_turn — return what we have
                assistant_text = self._extract_text(response)
                self.messages.append({"role": "assistant", "content": response.content})
                return assistant_text

            # Append assistant's response (preserving tool_use blocks)
            self.messages.append({"role": "assistant", "content": response.content})

            # Execute each tool and collect results
            tool_results = []
            for tool_block in tool_use_blocks:
                result = execute_tool(tool_block.name, tool_block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_block.id,
                    "content": result
                })

            # Send tool results back
            self.messages.append({"role": "user", "content": tool_results})

        return "I've reached the maximum number of tool iterations. Please try breaking your request into smaller steps."

    def _get_response(self) -> anthropic.types.Message:
        """Make a non-streaming API call."""
        return self.client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=SYSTEM_PROMPT,
            tools=self.tools,
            messages=self.messages
        )

    def _stream_response(self) -> anthropic.types.Message:
        """Make a streaming API call, printing text as it arrives."""
        with self.client.messages.stream(
            model=self.model,
            max_tokens=self.max_tokens,
            system=SYSTEM_PROMPT,
            tools=self.tools,
            messages=self.messages
        ) as stream:
            for event in stream:
                if event.type == "content_block_delta":
                    if event.delta.type == "text_delta":
                        print(event.delta.text, end="", flush=True)

            response = stream.get_final_message()

        # Print newline after streaming text
        if any(b.type == "text" for b in response.content):
            print()

        return response

    @staticmethod
    def _extract_text(response: anthropic.types.Message) -> str:
        """Extract text content from a response."""
        text_parts = [b.text for b in response.content if b.type == "text"]
        return "\n".join(text_parts)

    def get_history_summary(self) -> dict:
        """Get a summary of the conversation history."""
        user_msgs = sum(1 for m in self.messages if m.get("role") == "user"
                        and isinstance(m.get("content"), str))
        assistant_msgs = sum(1 for m in self.messages if m.get("role") == "assistant")
        tool_calls = sum(
            1 for m in self.messages
            if m.get("role") == "user" and isinstance(m.get("content"), list)
            and any(isinstance(c, dict) and c.get("type") == "tool_result" for c in m["content"])
        )
        return {
            "user_messages": user_msgs,
            "assistant_messages": assistant_msgs,
            "tool_call_rounds": tool_calls,
            "total_messages": len(self.messages)
        }
