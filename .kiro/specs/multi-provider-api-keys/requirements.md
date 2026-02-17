# Requirements Document: Multi-Provider API Key Management

## Introduction

NanoClaw is migrating from Claude SDK (single API key) to OpenCode SDK which supports multiple AI providers. This feature enables secure, flexible configuration of API keys for multiple providers (Google, Anthropic, Groq, OpenAI) with cross-platform support and future-proofing for Electron GUI integration.

## Glossary

- **Provider**: An AI service provider (Google, Anthropic, Groq, OpenAI)
- **API_Key**: Authentication credential for accessing a provider's API
- **System_Environment_Variable**: OS-level environment variable set via shell commands
- **Dotenv_File**: The .env file in the project root containing key-value pairs
- **OpenCode_SDK**: The SDK that interfaces with multiple AI providers
- **Agent_Runner**: The containerized process that executes AI agent operations
- **Model_Identifier**: Format: provider/provider/model-name (e.g., google/google/gemini-3-pro)

## Requirements

### Requirement 1: Multi-Provider Support

**User Story:** As a NanoClaw user, I want to configure API keys for multiple AI providers, so that I can use different models from Google, Anthropic, Groq, and OpenAI.

#### Acceptance Criteria

1. THE System SHALL support API keys for Google, Anthropic, Groq, and OpenAI providers
2. WHEN a model identifier is provided in format provider/provider/model-name, THE System SHALL extract the provider name
3. THE System SHALL recognize these model identifier formats:
   - google/google/gemini-3-pro
   - anthropic/anthropic/claude-3-5-sonnet
   - groq/groq/llama-3.3-70b
   - openai/openai/gpt-4o
4. THE System SHALL map provider names to their corresponding environment variable names

### Requirement 2: Flexible Configuration Priority

**User Story:** As a developer, I want API keys to be loaded from system environment variables first and .env file second, so that I can override .env settings without modifying files.

#### Acceptance Criteria

1. WHEN loading configuration, THE System SHALL check system environment variables before reading the .env file
2. WHEN a key exists in both system environment and .env file, THE System SHALL use the system environment variable value
3. THE System SHALL load the .env file only if it exists
4. WHEN the .env file does not exist, THE System SHALL continue with only system environment variables

### Requirement 3: Cross-Platform Environment Variable Support

**User Story:** As a user on Windows, macOS, or Linux, I want clear instructions for setting environment variables on my platform, so that I can configure API keys correctly.

#### Acceptance Criteria

1. THE Documentation SHALL provide Windows PowerShell commands for setting environment variables
2. THE Documentation SHALL provide Windows CMD commands for setting environment variables
3. THE Documentation SHALL provide macOS/Linux shell commands for setting environment variables
4. THE Documentation SHALL explain temporary vs permanent environment variable configuration for each platform

### Requirement 4: Required Environment Variables

**User Story:** As a system integrator, I want to know which environment variables are required for each provider, so that I can configure the system correctly.

#### Acceptance Criteria

1. THE System SHALL recognize ANTHROPIC_API_KEY for Anthropic provider
2. THE System SHALL recognize GOOGLE_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY for Google provider
3. THE System SHALL recognize GROQ_API_KEY for Groq provider
4. THE System SHALL recognize OPENAI_API_KEY for OpenAI provider
5. THE System SHALL recognize OPENCODE_BASE_URL as an optional configuration variable
6. WHEN OPENCODE_BASE_URL is not provided, THE System SHALL use a default local URL

### Requirement 5: Configuration Validation

**User Story:** As a NanoClaw operator, I want to be notified at startup which providers are configured, so that I can verify my configuration is correct.

#### Acceptance Criteria

1. WHEN the System starts, THE System SHALL validate that at least one provider API key is configured
2. WHEN no provider API keys are found, THE System SHALL log an error message and fail to start
3. WHEN provider API keys are found, THE System SHALL log which providers are configured without exposing key values
4. THE System SHALL log only the provider names (e.g., "Configured providers: Google, Anthropic")

### Requirement 6: Runtime Error Handling

**User Story:** As a user, I want clear error messages when a requested provider's API key is missing, so that I can fix configuration issues quickly.

#### Acceptance Criteria

1. WHEN a model is requested for a provider without a configured API key, THE System SHALL return a descriptive error message
2. THE Error_Message SHALL include the provider name and the expected environment variable name
3. THE Error_Message SHALL not expose any API key values
4. THE System SHALL continue running and handle subsequent requests normally

### Requirement 7: Backward Compatibility

**User Story:** As an existing NanoClaw user, I want my current .env configuration to continue working, so that the migration doesn't break my setup.

#### Acceptance Criteria

1. THE System SHALL continue to read the .env file if it exists
2. WHEN existing .env keys are present, THE System SHALL use them for the corresponding providers
3. THE System SHALL maintain the existing sdkEnv object merging pattern (process.env + containerInput.secrets)
4. THE System SHALL not require changes to existing .env files for basic operation

### Requirement 8: Future Electron GUI Support

**User Story:** As a future Electron GUI developer, I want the API key management architecture to support GUI-based configuration, so that users can set keys through a settings interface.

#### Acceptance Criteria

1. THE System SHALL use a configuration loading mechanism that can be called programmatically
2. THE Configuration_Module SHALL expose functions that can be invoked by GUI code
3. THE System SHALL support setting environment variables via child_process.spawn() for setx/export commands
4. THE Architecture SHALL not hard-code assumptions about how environment variables are set

### Requirement 9: Documentation Requirements

**User Story:** As a new NanoClaw user, I want comprehensive documentation on API key setup, so that I can configure the system without confusion.

#### Acceptance Criteria

1. THE README SHALL include a section explaining multi-provider API key configuration
2. THE README SHALL provide command-line examples for Windows PowerShell
3. THE README SHALL provide command-line examples for Windows CMD
4. THE README SHALL provide command-line examples for macOS/Linux shells
5. THE .env.example file SHALL list all provider API key variables with descriptive comments
6. THE Documentation SHALL explain the priority order (system env vars > .env file)

### Requirement 10: Security and Privacy

**User Story:** As a security-conscious user, I want API keys to be handled securely, so that they are not exposed in logs or error messages.

#### Acceptance Criteria

1. THE System SHALL never log complete API key values
2. WHEN logging configuration status, THE System SHALL only log provider names
3. THE System SHALL not include API keys in error messages
4. WHEN displaying configuration information, THE System SHALL mask or omit sensitive values
