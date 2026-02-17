# Implementation Plan: OpenCode SDK Migration

## Overview

This plan outlines the step-by-step migration from Claude SDK to OpenCode SDK. The migration is structured to minimize risk by implementing changes incrementally, testing at each stage, and maintaining backward compatibility throughout.

## Tasks

- [x] 1. Update package dependencies and container configuration
  - Update container/agent-runner/package.json to remove @anthropic-ai/claude-agent-sdk and add @opencode-ai/sdk
  - Update container/Dockerfile to remove claude-code global install
  - Run npm install in agent-runner directory
  - Verify package-lock.json reflects correct dependencies
  - _Requirements: 1.1, 1.2, 1.3, 13.1, 13.2, 13.3_

- [ ] 2. Implement OpenCode client initialization
  - [x] 2.1 Create createOpencodeClient() function in container/agent-runner/src/index.ts
    - Accept sdkEnv parameter with environment variables
    - Read OPENCODE_BASE_URL from environment (optional)
    - Configure timeout (60000ms) and maxRetries (2)
    - Set logLevel based on LOG_LEVEL environment variable
    - Return configured Opencode instance
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 2.2 Write property test for base URL configuration
    - **Property 5: Base URL Configuration**
    - **Validates: Requirements 4.2**
    - Generate random base URLs, verify client uses them
    - Test with and without OPENCODE_BASE_URL set

  - [ ]* 2.3 Write unit tests for client initialization
    - Test default configuration (no env vars)
    - Test custom baseURL from environment
    - Test timeout and retry configuration
    - Test log level configuration
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 3. Migrate session management
  - [x] 3.1 Implement session creation and resumption logic
    - Check if sessionId exists in input
    - If no sessionId: call client.session.create() and store new ID
    - If sessionId exists: use it to resume session
    - Update newSessionId tracking throughout execution
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 3.2 Write property test for session ID persistence
    - **Property 1: Session ID Persistence**
    - **Validates: Requirements 2.3, 2.4**
    - Generate random sessions, verify IDs stored in database

  - [ ]* 3.3 Write property test for backward compatible session IDs
    - **Property 2: Backward Compatible Session IDs**
    - **Validates: Requirements 2.5, 11.2**
    - Use existing session IDs from database, verify resumption works

  - [ ]* 3.4 Write unit tests for session management
    - Test new session creation
    - Test session resumption with valid ID
    - Test session resumption with invalid ID (error case)
    - Test session ID persistence to database
    - _Requirements: 2.1, 2.2, 2.5_

- [x] 4. Checkpoint - Verify client and session basics work
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement message sending and event streaming
  - [x] 5.1 Replace query() with client.session.chat() and client.event.list()
    - Remove query() import and MessageStream class
    - Implement session.chat() for sending messages
    - Implement event.list() for streaming responses
    - Parse message.updated events to extract text content
    - Maintain OUTPUT_START_MARKER/OUTPUT_END_MARKER protocol
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

  - [x] 5.2 Implement IPC message piping during active session
    - Keep IPC polling loop during event streaming
    - Send follow-up messages via session.chat()
    - Handle _close sentinel to end session
    - _Requirements: 3.4_

  - [ ]* 5.3 Write property test for message event output
    - **Property 3: Message Event Output**
    - **Validates: Requirements 3.3, 3.5**
    - Generate random message events, verify output protocol

  - [ ]* 5.4 Write property test for sequential message processing
    - **Property 4: Sequential Message Processing**
    - **Validates: Requirements 3.4**
    - Generate random message sequences, verify order preserved

  - [ ]* 5.5 Write unit tests for message handling
    - Test single message send and receive
    - Test multiple message pipeline
    - Test message with file attachments
    - Test empty message handling (edge case)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 6. Migrate MCP server configuration
  - [x] 6.1 Update MCP server registration for OpenCode SDK
    - Research OpenCode SDK's MCP configuration format
    - Update mcpServers configuration in session initialization
    - Verify MCP server environment variables passed correctly
    - Test that ipc-mcp-stdio.ts continues to work unchanged
    - _Requirements: 5.1, 5.2_

  - [ ]* 6.2 Write property test for MCP tool compatibility
    - **Property 7: MCP Tool Compatibility**
    - **Validates: Requirements 5.2**
    - Generate random tool invocations, verify IPC communication works

  - [ ]* 6.3 Write unit tests for MCP integration
    - Test send_message tool invocation
    - Test schedule_task tool invocation
    - Test list_tasks tool invocation
    - Test register_group tool invocation (main group only)
    - _Requirements: 5.1, 5.2_

- [ ] 7. Implement hook system migration
  - [x] 7.1 Migrate PreCompact hook for conversation archiving
    - Research OpenCode SDK's hook system
    - Implement conversation archiving before compaction
    - Maintain existing archive format and location
    - _Requirements: 5.3_

  - [x] 7.2 Migrate PreToolUse hook for Bash command sanitization
    - Implement Bash command sanitization hook
    - Strip SECRET_ENV_VARS from subprocess environment
    - Maintain existing sanitization logic
    - _Requirements: 5.4_

  - [ ]* 7.3 Write property test for PreCompact hook archiving
    - **Property 8: PreCompact Hook Archiving**
    - **Validates: Requirements 5.3**
    - Generate random sessions, verify transcripts archived

  - [ ]* 7.4 Write property test for secret isolation
    - **Property 6: Authentication Credential Handling**
    - **Property 12: Secret Environment Variable Isolation**
    - **Validates: Requirements 4.5, 5.4, 8.1**
    - Generate random secrets, verify not in Bash subprocess env

- [x] 8. Checkpoint - Verify MCP and hooks work
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement comprehensive error handling
  - [x] 9.1 Add try-catch blocks for all OpenCode SDK operations
    - Catch Opencode.APIError and subclasses
    - Catch Opencode.APIConnectionError
    - Catch Opencode.APIConnectionTimeoutError
    - Log all errors with full context
    - Return error status via container output protocol
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 9.2 Write property test for comprehensive error handling
    - **Property 11: Comprehensive Error Handling**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
    - Generate random error scenarios, verify handling

  - [ ]* 9.3 Write unit tests for error handling
    - Test APIError with different status codes
    - Test APIConnectionError scenarios
    - Test APIConnectionTimeoutError scenarios
    - Test error logging verification
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 10. Implement system prompt and context injection
  - [x] 10.1 Update session initialization with system prompts
    - Load global AGENTS.md content (if present)
    - Generate platform-specific environment context
    - Append both to system prompt
    - Pass to OpenCode SDK session configuration
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 10.2 Write property test for system prompt injection
    - **Property 13: System Prompt Injection**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
    - Generate random AGENTS.md content, verify included in prompt

  - [ ]* 10.3 Write unit tests for context generation
    - Test global AGENTS.md loading
    - Test environment context generation (macOS, Windows, Linux)
    - Test system prompt format
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 11. Implement direct mode configuration
  - [x] 11.1 Add direct mode path configuration for OpenCode client
    - Detect direct mode from containerInput.directMode
    - Override IPC_INPUT_DIR and related paths
    - Configure client with real host paths
    - Update PATH for Windows to include Node.js
    - _Requirements: 10.2, 10.3, 10.4_

  - [ ]* 11.2 Write property test for direct mode path configuration
    - **Property 14: Direct Mode Path Configuration**
    - **Validates: Requirements 10.4**
    - Generate random direct mode configs, verify paths correct

  - [ ]* 11.3 Write property test for cross-platform file path handling
    - **Property 10: Cross-Platform File Path Handling**
    - **Validates: Requirements 6.5**
    - Generate random file paths, verify resolution in both modes

  - [ ]* 11.4 Write unit tests for platform-specific configuration
    - Test container mode initialization (macOS)
    - Test direct mode initialization (Windows)
    - Test direct mode initialization (Linux)
    - Test path resolution in both modes
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 12. Checkpoint - Verify error handling and configuration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implement logging enhancements
  - [x] 13.1 Add comprehensive logging for all SDK operations
    - Log client initialization with configuration
    - Log session creation/resumption with IDs
    - Log message send/receive with metadata
    - Log all errors with stack traces
    - Maintain existing log format
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 13.2 Write property test for debug logging completeness
    - **Property 19: Debug Logging Completeness**
    - **Validates: Requirements 12.1**
    - Enable debug logging, verify all operations logged

  - [ ]* 13.3 Write property test for session operation logging
    - **Property 20: Session Operation Logging**
    - **Validates: Requirements 12.3**
    - Generate random session operations, verify logging

  - [ ]* 13.4 Write property test for message metadata logging
    - **Property 21: Message Metadata Logging**
    - **Validates: Requirements 12.4**
    - Generate random messages, verify metadata logged

  - [ ]* 13.5 Write property test for log format preservation
    - **Property 22: Log Format Preservation**
    - **Validates: Requirements 12.5**
    - Generate random log entries, verify format matches existing

- [ ] 14. Verify backward compatibility
  - [ ]* 14.1 Write property test for database schema compatibility
    - **Property 15: Database Schema Compatibility**
    - **Validates: Requirements 11.1**
    - Use existing database, verify all operations work

  - [ ]* 14.2 Write property test for IPC protocol preservation
    - **Property 16: IPC Protocol Preservation**
    - **Validates: Requirements 11.3**
    - Generate random IPC operations, verify format unchanged

  - [ ]* 14.3 Write property test for AGENTS.md file compatibility
    - **Property 17: AGENTS.md File Compatibility**
    - **Validates: Requirements 11.4**
    - Use existing AGENTS.md files, verify loading works

  - [ ]* 14.4 Write property test for messaging channel compatibility
    - **Property 18: Messaging Channel Compatibility**
    - **Validates: Requirements 11.5**
    - Generate random channel operations, verify behavior identical

  - [ ]* 14.5 Write property test for file operation compatibility
    - **Property 9: File Operation Compatibility**
    - **Validates: Requirements 6.3**
    - Generate random file operations, verify success

- [ ] 15. Update documentation and references
  - [x] 15.1 Update code comments to reference OpenCode SDK
    - Search for "Claude SDK" references in code
    - Update to "OpenCode SDK" where appropriate
    - Preserve "Claude" references to the AI model
    - _Requirements: 14.1, 14.4_

  - [x] 15.2 Update README and AGENTS.md files
    - Update main README with OpenCode SDK information
    - Update AGENTS.md files to reference OpenCode where appropriate
    - Document new environment variables (if any)
    - Document migration steps for existing users
    - _Requirements: 14.2, 14.3, 14.5_

- [ ] 16. Integration testing
  - [ ]* 16.1 Write integration test for end-to-end message flow
    - Test WhatsApp message → agent response
    - Test Telegram message → agent response
    - Test multi-turn conversation with context
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3_

  - [ ]* 16.2 Write integration test for session continuity
    - Create session → send message → exit container
    - Resume session → send follow-up → verify context
    - Test across multiple container restarts
    - _Requirements: 2.3, 2.4, 2.5_

  - [ ]* 16.3 Write integration test for MCP tool integration
    - Test send_message tool → verify IPC file
    - Test schedule_task tool → verify database
    - Test list_tasks tool → verify filtering
    - Test register_group tool → verify activation
    - _Requirements: 5.1, 5.2_

  - [ ]* 16.4 Write integration test for cross-platform compatibility
    - Run tests in container mode (macOS)
    - Run tests in direct mode (Windows)
    - Run tests in direct mode (Linux)
    - Verify identical behavior
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 17. Final checkpoint - Complete system verification
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Build and deploy
  - [x] 18.1 Rebuild container image
    - Run ./container/build.sh
    - Verify image builds successfully
    - Test container startup
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 18.2 Test in production-like environment
    - Deploy to test environment
    - Send test messages via WhatsApp
    - Send test messages via Telegram
    - Verify all functionality works
    - Monitor logs for errors
    - _Requirements: All_

  - [x] 18.3 Create rollback plan documentation
    - Document rollback steps
    - Document data preservation strategy
    - Document gradual migration approach
    - _Requirements: All_

## Notes

- Tasks marked with `*` are optional property-based and integration tests
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end functionality
- The migration maintains backward compatibility throughout
- No database schema changes are required
- Existing session IDs remain valid
- All messaging channels continue to work unchanged
