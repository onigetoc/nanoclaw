# Requirements Document: OpenCode SDK Migration

## Introduction

NanoClaw is a personal AI assistant that runs securely in containers, connecting to messaging platforms (WhatsApp, Telegram) and routing messages to AI agents. This document specifies the requirements for migrating from the Claude SDK (@anthropic-ai/claude-agent-sdk) to the OpenCode SDK (@opencode-ai/sdk) while maintaining all existing functionality.

## Glossary

- **NanoClaw**: The orchestrator system that manages messaging channels, containers, and agent execution
- **Agent_Runner**: The containerized process that executes AI agent sessions using the SDK
- **Container_Runner**: The host process that spawns and manages agent containers
- **Session**: A persistent conversation context maintained by the SDK
- **IPC**: Inter-process communication mechanism for host-container messaging
- **Channel**: A messaging platform integration (WhatsApp, Telegram)
- **Group**: A registered chat group with its own isolated agent context
- **MCP_Server**: Model Context Protocol server providing custom tools to agents
- **Direct_Mode**: Non-containerized execution mode for Windows/Linux platforms

## Requirements

### Requirement 1: SDK Package Migration

**User Story:** As a developer, I want to replace the Claude SDK with the OpenCode SDK, so that NanoClaw can use OpenCode's AI capabilities.

#### Acceptance Criteria

1. THE System SHALL use @opencode-ai/sdk package instead of @anthropic-ai/claude-agent-sdk
2. THE System SHALL remove all dependencies on @anthropic-ai/claude-agent-sdk from package.json
3. THE System SHALL update all import statements to reference @opencode-ai/sdk
4. THE System SHALL maintain compatibility with existing Node.js runtime requirements

### Requirement 2: Session Management Migration

**User Story:** As a system operator, I want session management to work with OpenCode SDK, so that conversation context is preserved across messages.

#### Acceptance Criteria

1. WHEN creating a new session, THE Agent_Runner SHALL use client.session.create()
2. WHEN resuming an existing session, THE Agent_Runner SHALL use the session ID from the database
3. WHEN a session is created, THE System SHALL store the new session ID in the database
4. WHEN a session completes, THE System SHALL persist the session ID for future messages
5. THE System SHALL maintain backward compatibility with existing session IDs in the database

### Requirement 3: Message Streaming Migration

**User Story:** As a user, I want to receive real-time responses from the agent, so that I see output as it's generated.

#### Acceptance Criteria

1. WHEN sending messages to a session, THE Agent_Runner SHALL use client.session.chat()
2. WHEN streaming responses, THE Agent_Runner SHALL use client.event.list() for real-time events
3. WHEN a message.updated event is received, THE System SHALL emit the response via the output protocol
4. WHEN multiple messages are piped during a session, THE System SHALL handle them sequentially
5. THE System SHALL maintain the existing OUTPUT_START_MARKER and OUTPUT_END_MARKER protocol

### Requirement 4: API Initialization Migration

**User Story:** As a developer, I want the OpenCode client to initialize correctly, so that the agent can connect to the AI service.

#### Acceptance Criteria

1. WHEN initializing the client, THE Agent_Runner SHALL create an Opencode instance
2. WHEN environment variables contain OPENCODE_BASE_URL, THE System SHALL use it for the baseURL configuration
3. WHEN no base URL is provided, THE System SHALL use the default local OpenCode instance
4. THE System SHALL pass timeout and retry configuration to the client constructor
5. THE System SHALL handle authentication credentials from environment variables

### Requirement 5: Tool and Hook System Migration

**User Story:** As a developer, I want MCP tools and hooks to work with OpenCode SDK, so that agents retain their custom capabilities.

#### Acceptance Criteria

1. WHEN configuring the session, THE Agent_Runner SHALL register the MCP server using OpenCode's MCP configuration format
2. WHEN tools are invoked, THE System SHALL maintain compatibility with the existing IPC-based MCP server
3. WHEN PreCompact hooks are triggered, THE System SHALL archive conversations using OpenCode's hook system
4. WHEN PreToolUse hooks are triggered, THE System SHALL sanitize Bash commands to remove secrets
5. THE System SHALL maintain all existing tool permissions and security constraints

### Requirement 6: File Operations Migration

**User Story:** As an agent, I want to read and write files using OpenCode SDK, so that I can perform file-based tasks.

#### Acceptance Criteria

1. WHEN reading files, THE Agent_Runner SHALL use client.file.read() if needed for explicit file operations
2. WHEN checking file status, THE Agent_Runner SHALL use client.file.status() if needed
3. THE System SHALL maintain existing file access patterns through SDK tools
4. THE System SHALL preserve all file security constraints and mount restrictions
5. THE System SHALL maintain compatibility with both container and direct mode file paths

### Requirement 7: Error Handling Migration

**User Story:** As a system operator, I want errors to be handled gracefully, so that failures are logged and recoverable.

#### Acceptance Criteria

1. WHEN API errors occur, THE System SHALL catch Opencode.APIError exceptions
2. WHEN connection errors occur, THE System SHALL catch Opencode.APIConnectionError exceptions
3. WHEN timeout errors occur, THE System SHALL catch Opencode.APIConnectionTimeoutError exceptions
4. WHEN errors are caught, THE System SHALL log them with appropriate context
5. WHEN errors occur, THE System SHALL return error status via the container output protocol

### Requirement 8: Configuration and Environment Migration

**User Story:** As a system operator, I want configuration to work with OpenCode SDK, so that the system can be deployed in different environments.

#### Acceptance Criteria

1. WHEN secrets are provided, THE System SHALL pass them to the OpenCode client via environment variables
2. WHEN running in direct mode, THE System SHALL configure the client for non-containerized execution
3. WHEN running in container mode, THE System SHALL configure the client for containerized execution
4. THE System SHALL maintain existing environment variable naming conventions where possible
5. THE System SHALL document any new environment variables required by OpenCode SDK

### Requirement 9: Session Context and System Prompts

**User Story:** As an agent, I want to receive appropriate system context, so that I understand my environment and capabilities.

#### Acceptance Criteria

1. WHEN initializing a session, THE Agent_Runner SHALL provide system prompts via OpenCode's configuration
2. WHEN loading global memory, THE System SHALL append AGENTS.md content to the system prompt
3. WHEN generating environment context, THE System SHALL include platform-specific paths and configuration
4. THE System SHALL maintain the existing format for environment context messages
5. THE System SHALL preserve all existing memory and context loading mechanisms

### Requirement 10: Multi-Platform Compatibility

**User Story:** As a user on Windows/Linux/macOS, I want NanoClaw to work on my platform, so that I can use it regardless of my operating system.

#### Acceptance Criteria

1. WHEN running on macOS, THE System SHALL use container mode with Apple Container
2. WHEN running on Windows, THE System SHALL use direct mode without containers
3. WHEN running on Linux, THE System SHALL use direct mode without containers
4. WHEN in direct mode, THE System SHALL configure OpenCode client with real host paths
5. THE System SHALL maintain all existing platform detection and mode selection logic

### Requirement 11: Backward Compatibility

**User Story:** As an existing NanoClaw user, I want my data and configuration to continue working, so that the migration is seamless.

#### Acceptance Criteria

1. THE System SHALL maintain compatibility with existing SQLite database schema
2. THE System SHALL continue to work with existing session IDs stored in the database
3. THE System SHALL preserve all existing IPC protocols and file formats
4. THE System SHALL maintain compatibility with existing AGENTS.md files
5. THE System SHALL continue to support all existing messaging channels without changes

### Requirement 12: Logging and Debugging

**User Story:** As a developer, I want comprehensive logging, so that I can debug issues and monitor system behavior.

#### Acceptance Criteria

1. WHEN debug logging is enabled, THE System SHALL log all SDK operations
2. WHEN errors occur, THE System SHALL log full error details including stack traces
3. WHEN sessions are created or resumed, THE System SHALL log session IDs
4. WHEN messages are sent or received, THE System SHALL log message metadata
5. THE System SHALL maintain existing log file formats and locations

### Requirement 13: Container Build and Deployment

**User Story:** As a system operator, I want the container image to build with OpenCode SDK, so that agents can run in isolated environments.

#### Acceptance Criteria

1. WHEN building the container, THE System SHALL install @opencode-ai/sdk
2. WHEN building the container, THE System SHALL remove @anthropic-ai/claude-agent-sdk
3. THE Container SHALL include all required dependencies for OpenCode SDK
4. THE Container SHALL maintain existing entrypoint and startup scripts
5. THE Container SHALL preserve all existing security constraints and isolation

### Requirement 14: Documentation and References

**User Story:** As a developer, I want documentation to reflect OpenCode SDK usage, so that I can understand and maintain the system.

#### Acceptance Criteria

1. THE System SHALL update all code comments referencing Claude SDK to reference OpenCode SDK
2. THE System SHALL update README files to document OpenCode SDK usage
3. THE System SHALL update AGENTS.md files to reference OpenCode where appropriate
4. THE System SHALL preserve references to "Claude" where they refer to the AI model, not the SDK
5. THE System SHALL document any breaking changes or migration steps for users
