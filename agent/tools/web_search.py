"""Web search tool - search the web using httpx."""

import json

import httpx

WEB_SEARCH_TOOLS = [
    {
        "name": "web_search",
        "description": "Search the web for current information on any topic. Use this when the user asks about recent events, needs up-to-date data, or wants to research a topic. Returns search results with titles, snippets, and URLs.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query"
                },
                "num_results": {
                    "type": "integer",
                    "description": "Number of results to return (1-10). Defaults to 5."
                }
            },
            "required": ["query"]
        }
    }
]


def execute_web_search_tool(name: str, tool_input: dict) -> str:
    """Execute a web search tool.

    Uses the DuckDuckGo HTML search as a lightweight, no-API-key-required
    search provider. For production use, replace with a proper search API
    (e.g., Google Custom Search, Bing Search, Brave Search).
    """
    if name != "web_search":
        return f"Unknown web search tool: {name}"

    query = tool_input["query"]
    num_results = min(tool_input.get("num_results", 5), 10)

    try:
        results = _duckduckgo_search(query, num_results)
        if not results:
            return json.dumps({
                "query": query,
                "results": [],
                "message": "No results found. Try rephrasing the query."
            })
        return json.dumps({"query": query, "results": results}, indent=2)
    except Exception as e:
        return json.dumps({
            "query": query,
            "error": str(e),
            "message": "Web search failed. The search service may be temporarily unavailable."
        })


def _duckduckgo_search(query: str, num_results: int) -> list[dict]:
    """Search DuckDuckGo and parse results.

    Uses the DuckDuckGo Lite HTML endpoint which doesn't require an API key.
    For production, consider using a dedicated search API for better results.
    """
    url = "https://lite.duckduckgo.com/lite/"
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; ProductivityAgent/1.0)"
    }

    try:
        response = httpx.post(
            url,
            data={"q": query},
            headers=headers,
            timeout=10.0,
            follow_redirects=True
        )
        response.raise_for_status()
    except httpx.HTTPError:
        # Fallback: return a helpful message about the search
        return [{
            "title": f"Search results for: {query}",
            "snippet": "Live web search is currently unavailable. Please try again later or rephrase your query.",
            "url": f"https://duckduckgo.com/?q={query.replace(' ', '+')}"
        }]

    # Parse the lite HTML results
    results = _parse_lite_html(response.text, num_results)
    return results


def _parse_lite_html(html: str, max_results: int) -> list[dict]:
    """Parse DuckDuckGo Lite HTML results without external HTML parsers."""
    results = []
    lines = html.split("\n")
    i = 0

    while i < len(lines) and len(results) < max_results:
        line = lines[i].strip()

        # Look for result links - they appear in specific table cells
        if 'class="result-link"' in line or ('href="' in line and 'duckduckgo' not in line.lower()):
            href_start = line.find('href="')
            if href_start != -1:
                href_start += 6
                href_end = line.find('"', href_start)
                url = line[href_start:href_end] if href_end != -1 else ""

                # Extract title text (between > and <)
                title = _extract_text(line)

                # Look for snippet in following lines
                snippet = ""
                for j in range(i + 1, min(i + 5, len(lines))):
                    next_line = lines[j].strip()
                    if 'class="result-snippet"' in next_line:
                        snippet = _extract_text(next_line)
                        break

                if url and url.startswith("http") and title:
                    results.append({
                        "title": title,
                        "snippet": snippet,
                        "url": url
                    })
        i += 1

    return results


def _extract_text(html_line: str) -> str:
    """Extract plain text from an HTML line by stripping tags."""
    result = []
    in_tag = False
    for char in html_line:
        if char == "<":
            in_tag = True
        elif char == ">":
            in_tag = False
        elif not in_tag:
            result.append(char)
    text = "".join(result).strip()
    # Decode common HTML entities
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&quot;", '"').replace("&#39;", "'").replace("&nbsp;", " ")
    return text
