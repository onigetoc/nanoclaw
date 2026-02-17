# Opencode TypeScript SDK

## Introduction

The Opencode TypeScript SDK provides convenient access to the Opencode REST API from server-side TypeScript and JavaScript applications. This library enables developers to interact with AI-powered coding sessions, manage files, search codebases, and stream real-time events from the Opencode platform. It is designed for integration into development tools, CI/CD pipelines, and custom coding assistants.

The SDK is built with TypeScript for comprehensive type safety and includes features like automatic retries, timeout handling, streaming response support via Server-Sent Events, and customizable logging. It supports multiple runtimes including Node.js, Deno, Bun, Cloudflare Workers, and modern web browsers. The library follows semantic versioning and provides a clean, promise-based API for all operations.

## API Reference and Examples

### Initialize the Opencode Client

Basic client instantiation with default configuration.

```typescript
import Opencode from '@opencode-ai/sdk';

// Connect to local Opencode instance (default)
const client = new Opencode();

// Connect to custom server
const client = new Opencode({
  baseURL: 'https://api.opencode.example.com',
  timeout: 30000, // 30 seconds
  maxRetries: 3,
  logLevel: 'debug'
});

// With custom headers and fetch options
const client = new Opencode({
  baseURL: process.env.OPENCODE_BASE_URL,
  defaultHeaders: {
    'X-Custom-Header': 'value'
  },
  fetchOptions: {
    // Custom RequestInit options
  }
});
```

### Create and Manage Sessions

Create new AI coding sessions and send messages.

```typescript
import Opencode from '@opencode-ai/sdk';

const client = new Opencode();

// Create a new session
const session = await client.session.create();
console.log(`Session created: ${session.id}`);

// List all sessions
const sessions = await client.session.list();
sessions.forEach(s => {
  console.log(`Session ${s.id}: ${s.time.created}`);
});

// Send a message to the session
const response = await client.session.chat(session.id, {
  parts: [
    {
      type: 'text',
      text: 'Analyze this file and suggest improvements'
    },
    {
      type: 'file',
      source: {
        type: 'path',
        path: './src/main.ts'
      }
    }
  ]
});

// Access the assistant's response
console.log(response.parts);

// Delete a session when done
await client.session.delete(session.id);
```

### Stream Real-Time Events

Monitor session events, file changes, and system updates.

```typescript
import Opencode from '@opencode-ai/sdk';

const client = new Opencode();

// Stream all events
const stream = await client.event.list();

for await (const event of stream) {
  switch (event.type) {
    case 'message.updated':
      console.log('New message:', event.properties.info);
      break;
    case 'file.edited':
      console.log('File changed:', event.properties.file);
      break;
    case 'session.updated':
      console.log('Session updated:', event.properties.info);
      break;
    case 'session.error':
      console.error('Session error:', event.properties.error);
      break;
    case 'file.watcher.updated':
      console.log('File watch event:', event.properties.event, event.properties.file);
      break;
    default:
      console.log('Event:', event.type);
  }
}

// Cancel the stream when needed
stream.controller.abort();
```

### Search Files and Code

Find files, search code content, and lookup symbols.

```typescript
import Opencode from '@opencode-ai/sdk';

const client = new Opencode();

// Find files by name pattern
const files = await client.find.files({
  query: '*.ts'
});
console.log('TypeScript files:', files);

// Search for text in codebase
const textResults = await client.find.text({
  pattern: 'function handleRequest'
});

textResults.forEach(result => {
  console.log(`Found in ${result.path.text}:${result.line_number}`);
  console.log(`  ${result.lines.text}`);
  result.submatches.forEach(match => {
    console.log(`  Match: "${match.match.text}" at position ${match.start}-${match.end}`);
  });
});

// Find symbols (functions, classes, etc.)
const symbols = await client.find.symbols({
  query: 'UserController'
});

symbols.forEach(symbol => {
  console.log(`${symbol.name} (kind: ${symbol.kind})`);
  console.log(`  Location: ${symbol.location.uri}`);
  console.log(`  Range: line ${symbol.location.range.start.line}-${symbol.location.range.end.line}`);
});
```

### Read Files and Check Status

Access file contents and track changes.

```typescript
import Opencode from '@opencode-ai/sdk';

const client = new Opencode();

// Read file content
const fileContent = await client.file.read({
  path: './src/app.ts'
});

console.log(`Content type: ${fileContent.type}`);
console.log(`Content:\n${fileContent.content}`);

// Get file status (changed, added, deleted files)
const fileStatus = await client.file.status();

fileStatus.forEach(file => {
  console.log(`${file.status}: ${file.path}`);
  console.log(`  +${file.added} -${file.removed} lines`);
});

// Filter by status
const modifiedFiles = fileStatus.filter(f => f.status === 'modified');
const newFiles = fileStatus.filter(f => f.status === 'added');
```

### Get Application Info and Configuration

Access app metadata, modes, and provider settings.

```typescript
import Opencode from '@opencode-ai/sdk';

const client = new Opencode();

// Get app information
const app = await client.app.get();
console.log(`Hostname: ${app.hostname}`);
console.log(`CWD: ${app.path.cwd}`);
console.log(`Config path: ${app.path.config}`);
console.log(`Git repository: ${app.git}`);
console.log(`Initialized: ${app.time.initialized}`);

// Initialize the app
await client.app.init();

// Get available modes
const modes = await client.app.modes();
modes.forEach(mode => {
  console.log(`Mode: ${mode.name}`);
  console.log(`  Tools:`, Object.keys(mode.tools).filter(t => mode.tools[t]));
  if (mode.model) {
    console.log(`  Model: ${mode.model.providerID}/${mode.model.modelID}`);
  }
});

// List configured providers
const providers = await client.app.providers();
providers.forEach(provider => {
  console.log(`Provider: ${provider.id}`);
  provider.models.forEach(model => {
    console.log(`  - ${model.id} (cost: $${model.cost.input}/$${model.cost.output} per token)`);
  });
});

// Read configuration
const config = await client.config.get();
console.log('Default model:', config.model);
console.log('Keybindings:', config.keybinds);
```

### Session Operations

Manage session state, share sessions, and revert changes.

```typescript
import Opencode from '@opencode-ai/sdk';

const client = new Opencode();
const sessionId = 'session_abc123';

// Initialize session with context
await client.session.init(sessionId, {
  prompt: 'Analyze this project and suggest architecture improvements'
});

// Get session messages
const messages = await client.session.messages(sessionId);
messages.forEach(msg => {
  console.log(`${msg.type}: ${msg.time.created}`);
  msg.parts.forEach(part => {
    if (part.type === 'text') {
      console.log(`  ${part.text}`);
    }
  });
});

// Revert to a previous message
await client.session.revert(sessionId, {
  messageID: 'msg_xyz789'
});

// Restore reverted messages
await client.session.unrevert(sessionId);

// Share a session
const sharedSession = await client.session.share(sessionId);
console.log('Session shared:', sharedSession.shared);

// Unshare a session
await client.session.unshare(sessionId);

// Abort running session
await client.session.abort(sessionId);

// Summarize session
const summary = await client.session.summarize(sessionId, {
  format: 'markdown'
});
console.log('Summary:', summary);
```

### Error Handling

Handle API errors with typed error classes.

```typescript
import Opencode from '@opencode-ai/sdk';

const client = new Opencode();

try {
  const session = await client.session.create();
  await client.session.chat(session.id, {
    parts: [{ type: 'text', text: 'Hello' }]
  });
} catch (error) {
  if (error instanceof Opencode.APIError) {
    console.error(`API Error (${error.status}): ${error.name}`);
    console.error('Headers:', error.headers);
    console.error('Message:', error.message);

    // Handle specific error types
    if (error instanceof Opencode.AuthenticationError) {
      console.error('Authentication failed - check credentials');
    } else if (error instanceof Opencode.RateLimitError) {
      console.error('Rate limited - retry after delay');
    } else if (error instanceof Opencode.NotFoundError) {
      console.error('Resource not found');
    }
  } else if (error instanceof Opencode.APIConnectionError) {
    console.error('Connection failed:', error.message);
  } else if (error instanceof Opencode.APIConnectionTimeoutError) {
    console.error('Request timed out');
  } else {
    throw error;
  }
}
```

### Advanced Client Configuration

Custom logging, retries, and request handling.

```typescript
import Opencode from '@opencode-ai/sdk';
import pino from 'pino';

// Custom logger
const logger = pino({ level: 'debug' });
const client = new Opencode({
  logger: logger.child({ name: 'Opencode' }),
  logLevel: 'debug'
});

// Configure retries
const clientWithRetries = new Opencode({
  maxRetries: 5,
  timeout: 60000 // 1 minute
});

// Per-request configuration
const session = await client.session.create({
  maxRetries: 0, // Disable retries for this request
  timeout: 5000  // 5 second timeout
});

// Access raw response
const response = await client.session.list().asResponse();
console.log('Status:', response.status);
console.log('Headers:', response.headers.get('X-Custom-Header'));

// Get both data and response
const { data: sessions, response: raw } = await client.session.list().withResponse();
console.log('Data:', sessions);
console.log('Response:', raw);

// Make custom requests to undocumented endpoints
const result = await client.post('/custom/endpoint', {
  body: { custom: 'data' },
  query: { param: 'value' }
});
```

### Custom Fetch and Proxy Configuration

Configure HTTP client for specific environments.

```typescript
import Opencode from '@opencode-ai/sdk';
import * as undici from 'undici';

// Node.js with proxy
const proxyAgent = new undici.ProxyAgent('http://proxy.example.com:8080');
const client = new Opencode({
  fetchOptions: {
    dispatcher: proxyAgent
  }
});

// Bun with proxy
const bunClient = new Opencode({
  fetchOptions: {
    proxy: 'http://proxy.example.com:8080'
  }
});

// Custom fetch function
import customFetch from 'custom-fetch-lib';
const customClient = new Opencode({
  fetch: customFetch
});

// Polyfill global fetch
import fetch from 'node-fetch';
globalThis.fetch = fetch as any;
```

### Logging and Debugging

Control log levels and output for debugging.

```typescript
import Opencode from '@opencode-ai/sdk';

// Set log level via environment
process.env.OPENCODE_LOG = 'debug';

// Set log level via client option
const client = new Opencode({
  logLevel: 'debug' // 'debug' | 'info' | 'warn' | 'error' | 'off'
});

// Debug level logs all HTTP requests/responses
// Warning: May expose sensitive data in request bodies
```

### Write Application Logs

Send log entries to the Opencode server.

```typescript
import Opencode from '@opencode-ai/sdk';

const client = new Opencode();

// Write a log entry
await client.app.log({
  level: 'info',
  message: 'User action completed successfully',
  metadata: {
    userId: 'user_123',
    action: 'file_upload',
    duration: 1234
  }
});

// Log error
await client.app.log({
  level: 'error',
  message: 'Failed to process request',
  metadata: {
    errorCode: 'PARSE_ERROR',
    stack: new Error().stack
  }
});
```

## Summary and Integration

The Opencode SDK serves as a comprehensive interface for building AI-powered development tools and integrations. Primary use cases include creating custom coding assistants that interact with AI models, building development dashboards that monitor file changes and session activity in real-time, implementing automated code review systems that analyze codebases and suggest improvements, and integrating AI-powered search and navigation into IDEs and editors. The SDK's streaming capabilities make it ideal for real-time collaborative coding environments and live debugging tools.

The library integrates seamlessly into existing development workflows through its promise-based API and comprehensive TypeScript types. It can be embedded in CLI tools, web applications, CI/CD pipelines, and editor plugins. The SDK handles authentication, retries, and error recovery automatically while providing fine-grained control when needed. Its support for multiple runtimes ensures compatibility across diverse deployment environments from serverless functions to long-running services. The streaming event system enables reactive architectures where applications respond immediately to code changes, AI suggestions, and session updates.
