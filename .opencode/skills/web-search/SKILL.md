---
name: web-search
description: Performs web searches and provides the results. Use this skill when the user asks to look up information online, conduct web research, find articles, or obtain up-to-date information about a topic.
---

# Web Search

This skill allows the agent to perform web searches and provide results to the user.

## Features

- Search for up-to-date information on the web
- Extract content from specific URLs
- Summarize search results
- Verify information across multiple sources

## Usage

When the user requests a web search, use the available tools:

1. **remote_web_search** – To search for information  
   - Rephrase the user's query to optimize search results  
   - Perform multiple searches if necessary to cover the topic  
   - Prioritize recent and official sources  

2. **webFetch** – To read the full content of a page  
   - Use after identifying relevant URLs  
   - **"truncated" mode** for a quick preview  
   - **"full" mode** for complete content  
   - **"selective" mode** to retrieve specific information  

## Workflow

1. Understand the user's request  
2. Perform one or more web searches  
3. Analyze the results (titles, snippets, dates)  
4. If necessary, read the full content of the most relevant pages  
5. Synthesize the gathered information  
6. Present the results with sources  

## Best Practices

- Always cite sources with links  
- Check the publication date of information  
- Prefer official and reliable sources  
- Perform multiple searches for complex topics  
- Summarize information clearly and concisely  
- Never reproduce more than 30 consecutive words from a source  

## Example Queries

- "Search for the latest news about [topic]"  
- "Find information about [technology/library]"  
- "Look up the documentation for [tool]"  
- "What are the best practices for [task]?"  
- "Compare [option A] and [option B]"