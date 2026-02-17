# Design Document: OpenCode SDK Migration

## Overview

This document describes the technical design for migrating NanoClaw from the Claude SDK (@anthropic-ai/claude-agent-sdk) to the OpenCode SDK (@opencode-ai/sdk). The migration maintains all existing functionality while adapting to OpenCode's session-based API, streaming event system, and configuration model.

The migration affects three primary areas:
1. **Agent Runner** (container/agent-runner/src/index.ts) - Core SDK integration
2. **Container Runner** (src/container-runner.ts) - Container spawning and configuration
3. **Package Dependencies** - SDK package replacement and version management

## Architecture

### Current Architecture (Claude SDK)

```
┌─────────────────────────────────────────────────────────────┐
│                     Host Process (src/)                      │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  Channels  │→ │ Container    │→ │  Group Queue     │   │
│  │ (WhatsApp, │  │ Runner       │  │  (Orchestrator)  │   │
│  │  Telegram) │  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↓ spawn container
┌─────────────────────────────────────────────────────────────┐
│              Container (agent-runner/)                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Agent Runner (index.ts)                             │  │
│  │  • Uses query() from @anthropic-ai/claude-agent-sdk  │  │
│  │  • Streams messages via AsyncIterable                │  │
│  │  • Registers MCP server via mcpServers config        │  │
│  │  • Handles hooks (PreCompact, PreToolUse)            │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MCP Server (ipc-mcp-stdio.ts)                       │  │
│  │  • Provides custom tools via stdio transport         │  │
│  │  • Writes IPC files for host communication           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Target Architecture (OpenCode SDK)

```
┌─────────────────────────────────────────────────────────────┐
│                     Host Process (src/)                      │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  Channels  │→ │ Container    │→ │  Group Queue     │   │
│  │ (WhatsApp, │  │ Runner       │  │  (Orchestrator)  │   │
│  │  Telegram) │  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↓ spawn container
┌─────────────────────────────────────────────────────────────┐
│              Container (agent-runner/)                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Agent Runner (index.ts)                                 │  │
│  │  • Uses Opencode client from @opencode-ai/sdk           │  │
│  │  • Creates sessions via client.session.create()         │  │
│  │  • Sends messages via client.session.chat()             │  │
│  │  • Streams events via client.event.list()               │  │
│  │  • Registers MCP server (OpenCode format)               │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  MCP Server (ipc-mcp-stdio.ts)                           │  │
│  │  • Unchanged - continues to provide tools via stdio      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. OpenCode Client Initialization

**Location:** container/agent-runner/src/index.ts

**Current Implementation:**
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

// No explicit client initialization - query() is a standalone function
```

**New Implementation:**
```typescript
import Opencode from '@opencode-ai/sdk';

function createOpencodeClient(sdkEnv: Record<string, string | undefined>): Opencode {
  return new Opencode({
    baseURL: sdkEnv.OPENCODE_BASE_URL || undefined,
    timeout: 60000, // 60 seconds
    maxRetries: 2,
    logLevel: process.env.LOG_LEVEL === 'debug' ? 'debug' : 'info',
    defaultHeaders: {
      'User-Agent': 'NanoClaw/1.0'
    }
  });
}
```

### 2. Session Management

**Current Implementation:**
```typescript
// Session ID passed via resume option
for await (const message of query({
  prompt: stream,
  options: {
    resume: sessionId,
    resumeSessionAt: resumeAt,
    // ...
  }
})) {
  // Handle messages
}
```

**New Implementation:**
```typescript
// Create or resume session explicitly
let currentSessionId: string;

if (!sessionId) {
  const session = await client.session.create();
  currentSessionId = session.id;
  log(`Created new session: ${currentSessionId}`);
} else {
  currentSessionId = sessionId;
  log(`Resuming session: ${currentSessionId}`);
}

// Send message to session
const response = await client.session.chat(currentSessionId, {
  parts: [
    {
      type: 'text',
      text: prompt
    }
  ]
});
```

### 3. Event Streaming

**Current Implementation:**
```typescript
// Claude SDK streams messages via AsyncIterator
for await (const message of query({...})) {
  if (message.type === 'result') {
    writeOutput({
      status: 'success',
      result: message.result,
      newSessionId
    });
  }
}
```

**New Implementation:**
```typescript
// OpenCode SDK streams events via client.event.list()
const eventStream = await client.event.list();

for await (const event of eventStream) {
  switch (event.type) {
    case 'message.updated':
      // Extract text from message parts
      const textParts = event.properties.info.parts
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('');
      
      if (textParts) {
        writeOutput({
          status: 'success',
          result: textParts,
          newSessionId: currentSessionId
        });
      }
      break;
    
    case 'session.error':
      log(`Session error: ${event.properties.error}`);
      writeOutput({
        status: 'error',
        result: null,
        error: event.properties.error,
        newSessionId: currentSessionId
      });
      break;
    
    case 'session.updated':
      // Session state changed
      log(`Session updated: ${event.properties.info.id}`);
      break;
  }
}
```

### 4. MCP Server Configuration

**Current Implementation:**
```typescript
for await (const message of query({
  prompt: stream,
  options: {
    mcpServers: {
      nanoclaw: {
        command: 'node',
        args: [mcpServerPath],
        env: {
          NANOCLAW_CHAT_JID: containerInput.chatJid,
          // ...
        },
      },
    },
    // ...
  }
})) {
  // ...
}
```

**New Implementation:**
```typescript
// OpenCode SDK uses similar MCP configuration
// Need to verify exact format in OpenCode SDK documentation
// Assuming similar structure:

await client.session.init(currentSessionId, {
  mcpServers: {
    nanoclaw: {
      command: 'node',
      args: [mcpServerPath],
      env: {
        NANOCLAW_CHAT_JID: containerInput.chatJid,
        NANOCLAW_GROUP_FOLDER: containerInput.groupFolder,
        NANOCLAW_IS_MAIN: containerInput.isMain ? '1' : '0',
        NANOCLAW_IPC_DIR: ipcBaseDir,
      },
    },
  },
  systemPrompt: systemAppend,
  workingDirectory: groupDir,
  additionalDirectories: extraDirs.length > 0 ? extraDirs : undefined,
});
```

### 5. Hook System Migration

**Current Implementation:**
```typescript
for await (const message of query({
  prompt: stream,
  options: {
    hooks: {
      PreCompact: [{ hooks: [createPreCompactHook()] }],
      PreToolUse: [{ matcher: 'Bash', hooks: [createSanitizeBashHook()] }],
    },
    // ...
  }
})) {
  // ...
}
```

**New Implementation:**
```typescript
// OpenCode SDK hook system - need to verify exact API
// Assuming similar callback-based approach:

const hooks = {
  onBeforeCompact: async (context) => {
    // Archive transcript before compaction
    await archiveTranscript(context.transcriptPath, context.sessionId);
  },
  onBeforeToolUse: async (tool, input) => {
    if (tool === 'Bash') {
      // Sanitize bash commands
      return {
        ...input,
        command: sanitizeBashCommand(input.command)
      };
    }
    return input;
  }
};

// Register hooks with session
await client.session.configure(currentSessionId, { hooks });
```

### 6. Error Handling

**Current Implementation:**
```typescript
try {
  for await (const message of query({...})) {
    // Process messages
  }
} catch (err) {
  log(`Agent error: ${errorMessage}`);
  writeOutput({
    status: 'error',
    result: null,
    error: errorMessage
  });
}
```

**New Implementation:**
```typescript
try {
  const response = await client.session.chat(currentSessionId, {...});
  // Process response
} catch (error) {
  if (error instanceof Opencode.APIError) {
    log(`API Error (${error.status}): ${error.name}`);
    
    if (error instanceof Opencode.AuthenticationError) {
      log('Authentication failed - check credentials');
    } else if (error instanceof Opencode.RateLimitError) {
      log('Rate limited - retry after delay');
    } else if (error instanceof Opencode.NotFoundError) {
      log('Resource not found');
    }
    
    writeOutput({
      status: 'error',
      result: null,
      error: error.message,
      newSessionId: currentSessionId
    });
  } else if (error instanceof Opencode.APIConnectionError) {
    log(`Connection failed: ${error.message}`);
    writeOutput({
      status: 'error',
      result: null,
      error: 'Connection failed'
    });
  } else {
    throw error;
  }
}
```

## Data Models

### ContainerInput (Unchanged)

```typescript
interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  secrets?: Record<string, string>;
  directMode?: {
    ipcDir: string;
    groupDir: string;
    globalDir?: string;
    projectDir?: string;
  };
}
```

### ContainerOutput (Unchanged)

```typescript
interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}
```

### OpenCode Client Configuration

```typescript
interface OpencodeClientConfig {
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'off';
  defaultHeaders?: Record<string, string>;
  fetchOptions?: RequestInit;
}
```

### Session Message Parts

```typescript
interface MessagePart {
  type: 'text' | 'file' | 'image';
  text?: string;
  source?: {
    type: 'path' | 'url';
    path?: string;
    url?: string;
  };
}

interface ChatRequest {
  parts: MessagePart[];
}
```

## Data Flow

### Message Flow (Current vs New)

**Current Flow (Claude SDK):**
```
User Message → Container Runner → Agent Runner
                                      ↓
                                  query() function
                                      ↓
                                  AsyncIterator<Message>
                                      ↓
                                  Parse message.type
                                      ↓
                                  writeOutput()
                                      ↓
                                  Container stdout → Host
```

**New Flow (OpenCode SDK):**
```
User Message → Container Runner → Agent Runner
                                      ↓
                                  client.session.chat()
                                      ↓
                                  client.event.list()
                                      ↓
                                  AsyncIterator<Event>
                                      ↓
                                  Parse event.type
                                      ↓
                                  writeOutput()
                                      ↓
                                  Container stdout → Host
```

### Session Lifecycle

```
1. Container spawned with ContainerInput
   ↓
2. Read sessionId from input
   ↓
3. If sessionId exists:
     Resume existing session
   Else:
     Create new session via client.session.create()
   ↓
4. Send initial message via client.session.chat()
   ↓
5. Stream events via client.event.list()
   ↓
6. Process message.updated events → writeOutput()
   ↓
7. Wait for IPC messages (piped input)
   ↓
8. Send follow-up messages via client.session.chat()
   ↓
9. Repeat steps 5-8 until _close sentinel
   ↓
10. Container exits, session persists in database
```

## Implementation Strategy

### Phase 1: Package Migration
1. Update container/agent-runner/package.json
   - Remove @anthropic-ai/claude-agent-sdk
   - Add @opencode-ai/sdk
2. Update container/Dockerfile
   - Remove claude-code global install
   - Add opencode-cli if needed
3. Run npm install in agent-runner directory

### Phase 2: Core SDK Integration
1. Update imports in container/agent-runner/src/index.ts
2. Implement createOpencodeClient() function
3. Replace query() calls with session-based API
4. Implement event streaming loop
5. Update error handling for OpenCode exceptions

### Phase 3: Session Management
1. Implement session creation logic
2. Implement session resumption logic
3. Update session ID persistence
4. Test session continuity across messages

### Phase 4: MCP and Hooks
1. Migrate MCP server configuration
2. Implement hook system for PreCompact
3. Implement hook system for PreToolUse
4. Test custom tools via MCP

### Phase 5: Testing and Validation
1. Test in container mode (macOS)
2. Test in direct mode (Windows/Linux)
3. Test all messaging channels
4. Test scheduled tasks
5. Test group registration and management
6. Verify backward compatibility with existing sessions

## Testing Strategy

### Unit Tests

1. **Client Initialization**
   - Test client creation with default config
   - Test client creation with custom baseURL
   - Test client creation with environment variables

2. **Session Management**
   - Test session creation
   - Test session resumption with valid ID
   - Test session resumption with invalid ID

3. **Message Handling**
   - Test single message send
   - Test multiple message pipeline
   - Test message with file attachments

4. **Error Handling**
   - Test APIError handling
   - Test ConnectionError handling
   - Test TimeoutError handling

5. **Event Streaming**
   - Test message.updated event parsing
   - Test session.error event handling
   - Test session.updated event handling

### Integration Tests

1. **End-to-End Message Flow**
   - Send message from WhatsApp → verify agent response
   - Send message from Telegram → verify agent response
   - Test multi-turn conversation

2. **Session Persistence**
   - Create session → exit → resume → verify context preserved
   - Test session across container restarts

3. **MCP Tools**
   - Test send_message tool
   - Test schedule_task tool
   - Test list_tasks tool
   - Test register_group tool (main group only)

4. **Platform Compatibility**
   - Test container mode on macOS
   - Test direct mode on Windows
   - Test direct mode on Linux

5. **Scheduled Tasks**
   - Test cron-based task execution
   - Test interval-based task execution
   - Test one-time task execution

### Property-Based Tests

Property-based tests will be defined after completing the prework analysis in the next section.


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified the following redundancies:

- **2.3 and 2.4** both test session ID persistence - can be combined into one property
- **2.5 and 11.2** both test backward compatibility with existing session IDs - redundant
- **7.4 and 12.2** both test error logging - can be combined
- **7.1, 7.2, 7.3** test different error types but can be combined into one comprehensive error handling property

The following properties represent the unique, testable behavioral requirements:

### Property 1: Session ID Persistence

*For any* session created by the Agent_Runner, the session ID must be stored in the database and retrievable for future message processing.

**Validates: Requirements 2.3, 2.4**

### Property 2: Backward Compatible Session IDs

*For any* session ID that exists in the database prior to migration, the system must successfully resume that session using the OpenCode SDK.

**Validates: Requirements 2.5, 11.2**

### Property 3: Message Event Output

*For any* message.updated event received from the OpenCode event stream, the system must emit the message content via the OUTPUT_START_MARKER/OUTPUT_END_MARKER protocol.

**Validates: Requirements 3.3, 3.5**

### Property 4: Sequential Message Processing

*For any* sequence of messages piped to an active session via IPC, the messages must be processed and responded to in the order they were received.

**Validates: Requirements 3.4**

### Property 5: Base URL Configuration

*For any* value set in the OPENCODE_BASE_URL environment variable, the OpenCode client must be initialized with that value as its baseURL.

**Validates: Requirements 4.2**

### Property 6: Authentication Credential Handling

*For any* authentication credentials provided in environment variables (ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN), they must be passed to the OpenCode client and not exposed to Bash tool subprocesses.

**Validates: Requirements 4.5, 5.4**

### Property 7: MCP Tool Compatibility

*For any* MCP tool invocation that worked with Claude SDK, the same tool invocation must work with OpenCode SDK using the IPC-based MCP server.

**Validates: Requirements 5.2**

### Property 8: PreCompact Hook Archiving

*For any* session compaction event, the full transcript must be archived to the conversations/ directory before compaction occurs.

**Validates: Requirements 5.3**

### Property 9: File Operation Compatibility

*For any* file operation (read, write, edit) that succeeded with Claude SDK, the same operation must succeed with OpenCode SDK.

**Validates: Requirements 6.3**

### Property 10: Cross-Platform File Path Handling

*For any* file path used in container mode or direct mode, the path must resolve correctly to the intended file in both execution modes.

**Validates: Requirements 6.5**

### Property 11: Comprehensive Error Handling

*For any* error thrown by the OpenCode SDK (APIError, APIConnectionError, APIConnectionTimeoutError), the system must catch the error, log it with context, and return an error status via the container output protocol.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

### Property 12: Secret Environment Variable Isolation

*For any* secret provided to the Agent_Runner, it must be available to the OpenCode client but must not appear in the environment of Bash tool subprocesses.

**Validates: Requirements 8.1**

### Property 13: System Prompt Injection

*For any* session initialization, the system prompt must include the global AGENTS.md content (if present) and platform-specific environment context.

**Validates: Requirements 9.1, 9.2, 9.3, 9.4**

### Property 14: Direct Mode Path Configuration

*For any* execution in direct mode, the OpenCode client must be configured with real host paths (not container mount points) for IPC, group, and project directories.

**Validates: Requirements 10.4**

### Property 15: Database Schema Compatibility

*For any* existing NanoClaw database, the migrated system must successfully read and write all existing tables (sessions, messages, chats, tasks, router_state) without schema changes.

**Validates: Requirements 11.1**

### Property 16: IPC Protocol Preservation

*For any* IPC operation (message send, task schedule, group register), the file format and protocol must remain unchanged from the Claude SDK implementation.

**Validates: Requirements 11.3**

### Property 17: AGENTS.md File Compatibility

*For any* existing AGENTS.md file in group directories, the file must be loaded and used as memory context without modification.

**Validates: Requirements 11.4**

### Property 18: Messaging Channel Compatibility

*For any* messaging channel operation (WhatsApp, Telegram), the behavior must be identical to the Claude SDK implementation.

**Validates: Requirements 11.5**

### Property 19: Debug Logging Completeness

*For any* SDK operation when debug logging is enabled, the operation must be logged with sufficient detail to trace execution.

**Validates: Requirements 12.1**

### Property 20: Session Operation Logging

*For any* session creation or resumption, the session ID must be logged with appropriate context (group, mode, timestamp).

**Validates: Requirements 12.3**

### Property 21: Message Metadata Logging

*For any* message sent or received, the message metadata (length, timestamp, chat JID) must be logged.

**Validates: Requirements 12.4**

### Property 22: Log Format Preservation

*For any* log entry written by the migrated system, the format must match the existing log format (timestamp, level, context, message).

**Validates: Requirements 12.5**

## Error Handling

### Error Categories

1. **SDK Initialization Errors**
   - Missing or invalid OPENCODE_BASE_URL
   - Network connectivity issues
   - Authentication failures
   - Mitigation: Fail fast with clear error messages, log full context

2. **Session Management Errors**
   - Invalid session ID format
   - Session not found on server
   - Session creation failures
   - Mitigation: Retry with exponential backoff, fall back to new session creation

3. **Message Streaming Errors**
   - Event stream disconnection
   - Malformed event data
   - Timeout during streaming
   - Mitigation: Reconnect stream, buffer messages, implement timeout handling

4. **MCP Server Errors**
   - MCP server process crash
   - Tool invocation failures
   - IPC communication failures
   - Mitigation: Restart MCP server, log tool errors, implement IPC retry logic

5. **File Operation Errors**
   - Path resolution failures
   - Permission denied errors
   - File not found errors
   - Mitigation: Validate paths before operations, log full paths, respect security constraints

### Error Recovery Strategies

1. **Transient Errors**: Retry with exponential backoff (max 3 attempts)
2. **Authentication Errors**: Fail immediately, require user intervention
3. **Session Errors**: Fall back to creating new session
4. **Stream Errors**: Reconnect and resume from last known state
5. **Fatal Errors**: Log full context, exit container with error status

### Error Logging Requirements

All errors must be logged with:
- Error type and message
- Stack trace (for exceptions)
- Context (session ID, group, operation)
- Timestamp
- Recovery action taken

## Testing Strategy

### Dual Testing Approach

The migration requires both unit tests and property-based tests to ensure correctness:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs
- Both are complementary and necessary for comprehensive coverage

### Unit Test Coverage

1. **Client Initialization**
   - Default configuration (no env vars)
   - Custom baseURL from environment
   - Timeout and retry configuration
   - Authentication credential handling

2. **Session Management**
   - New session creation
   - Session resumption with valid ID
   - Session resumption with invalid ID (error case)
   - Session ID persistence to database

3. **Message Handling**
   - Single message send and receive
   - Multiple message pipeline
   - Message with file attachments
   - Empty message handling (edge case)

4. **Event Streaming**
   - message.updated event parsing
   - session.error event handling
   - session.updated event handling
   - Stream disconnection and reconnection

5. **Error Handling**
   - APIError with different status codes
   - APIConnectionError scenarios
   - APIConnectionTimeoutError scenarios
   - Error logging verification

6. **Platform-Specific**
   - Container mode initialization (macOS)
   - Direct mode initialization (Windows)
   - Direct mode initialization (Linux)
   - Path resolution in both modes

### Property-Based Test Configuration

Each property test must:
- Run minimum 100 iterations (due to randomization)
- Reference its design document property number
- Use tag format: **Feature: opencode-sdk-migration, Property {number}: {property_text}**
- Generate diverse test inputs (sessions, messages, paths, configurations)

### Integration Test Scenarios

1. **End-to-End Message Flow**
   - WhatsApp message → agent response → verify output
   - Telegram message → agent response → verify output
   - Multi-turn conversation with context preservation

2. **Session Continuity**
   - Create session → send message → exit container
   - Resume session → send follow-up → verify context preserved
   - Test across multiple container restarts

3. **MCP Tool Integration**
   - send_message tool → verify IPC file created
   - schedule_task tool → verify task in database
   - list_tasks tool → verify correct filtering
   - register_group tool → verify group activation

4. **Cross-Platform Compatibility**
   - Run full test suite in container mode (macOS)
   - Run full test suite in direct mode (Windows)
   - Run full test suite in direct mode (Linux)
   - Verify identical behavior across platforms

5. **Backward Compatibility**
   - Load existing database with Claude SDK sessions
   - Resume old sessions with OpenCode SDK
   - Verify all existing data remains accessible
   - Test migration path for existing users

### Performance Testing

1. **Session Creation Latency**: < 2 seconds
2. **Message Response Time**: < 5 seconds for first token
3. **Event Stream Latency**: < 500ms for event delivery
4. **Container Startup Time**: < 10 seconds
5. **Memory Usage**: < 500MB per container

### Security Testing

1. **Secret Isolation**: Verify secrets not in Bash subprocess env
2. **File Access**: Verify mount restrictions enforced
3. **IPC Security**: Verify group isolation maintained
4. **Container Escape**: Verify no privilege escalation possible

## Migration Checklist

### Pre-Migration

- [ ] Backup existing database
- [ ] Document current Claude SDK version
- [ ] Test current system functionality
- [ ] Review OpenCode SDK documentation
- [ ] Identify breaking changes

### Migration Steps

- [ ] Update package.json dependencies
- [ ] Update Dockerfile
- [ ] Rebuild container image
- [ ] Update import statements
- [ ] Implement OpenCode client initialization
- [ ] Migrate session management
- [ ] Migrate message streaming
- [ ] Migrate MCP configuration
- [ ] Migrate hook system
- [ ] Update error handling
- [ ] Update logging
- [ ] Test in container mode
- [ ] Test in direct mode
- [ ] Run integration tests
- [ ] Run property-based tests
- [ ] Verify backward compatibility

### Post-Migration

- [ ] Update documentation
- [ ] Update AGENTS.md files
- [ ] Deploy to production
- [ ] Monitor for errors
- [ ] Verify session continuity
- [ ] Collect user feedback

## Rollback Plan

If critical issues are discovered:

1. **Immediate Rollback**
   - Revert to previous container image
   - Restore Claude SDK dependencies
   - Restart services

2. **Data Preservation**
   - Database remains compatible (no schema changes)
   - Session IDs remain valid
   - No data loss expected

3. **Gradual Migration**
   - Run both SDKs in parallel (different groups)
   - Migrate groups incrementally
   - Monitor each group for issues

## Open Questions

1. **OpenCode SDK Hook System**: Does OpenCode SDK support hooks similar to Claude SDK's PreCompact and PreToolUse? If not, how should we implement conversation archiving and command sanitization?

2. **OpenCode MCP Configuration**: What is the exact format for MCP server configuration in OpenCode SDK? Does it match Claude SDK's format?

3. **OpenCode Session Resumption**: Does OpenCode SDK support resuming sessions at specific message UUIDs (resumeSessionAt)?

4. **OpenCode Tool Permissions**: How does OpenCode SDK handle tool permissions and the allowDangerouslySkipPermissions flag?

5. **OpenCode Streaming Protocol**: Does OpenCode SDK's event stream support piping new messages into an active session, or do we need to call session.chat() for each message?

These questions should be answered through OpenCode SDK documentation review and testing before implementation begins.
