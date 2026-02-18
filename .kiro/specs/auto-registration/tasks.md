# Implementation Plan: Auto-Registration

## Overview

This plan implements automatic registration of the first chat as the 'main' group in NanoClaw. The implementation is structured to minimize changes to existing code while adding the auto-registration capability in a testable, channel-agnostic way.

## Tasks

- [x] 1. Create auto-registration module with core logic
  - Create `src/auto-registration.ts` with `attemptAutoRegistration()`, `hasMainGroup()`, and `initializeGroupFolders()` functions
  - Implement logic to check if main group exists using database query
  - Implement folder structure creation (groups/main/, logs/, conversations/)
  - Implement AGENTS.md template file creation for main and global
  - _Requirements: 1.4, 1.6, 4.1, 4.2, 5.3, 5.4, 5.5_

- [ ]* 1.1 Write property test for auto-registration success
  - **Property 1: Auto-registration succeeds for first chat**
  - **Validates: Requirements 1.4, 4.1, 4.2**

- [ ]* 1.2 Write property test for folder structure creation
  - **Property 3: Folder structure is created during auto-registration**
  - **Validates: Requirements 1.6**

- [ ]* 1.3 Write property test for JID preservation
  - **Property 4: JID format is preserved**
  - **Validates: Requirements 2.2**

- [ ]* 1.4 Write property test for main group exclusivity
  - **Property 5: Auto-registration only when no main group exists**
  - **Validates: Requirements 3.1**

- [ ]* 1.5 Write property test for subsequent chat rejection
  - **Property 6: Subsequent chats are not auto-registered**
  - **Validates: Requirements 3.2**

- [ ]* 1.6 Write property test for chat name correctness
  - **Property 8: Chat name is set correctly**
  - **Validates: Requirements 4.3**

- [ ]* 1.7 Write property test for requiresTrigger flag
  - **Property 9: Main group does not require trigger**
  - **Validates: Requirements 4.4**

- [ ]* 1.8 Write property test for AGENTS.md creation
  - **Property 10: Main AGENTS.md is created with template**
  - **Property 11: Global AGENTS.md is created if missing**
  - **Validates: Requirements 5.4, 5.5**

- [ ]* 1.9 Write unit tests for edge cases
  - Test empty chat name (should use JID as fallback)
  - Test special characters in chat names
  - Test folder creation failure (should rollback database write)
  - _Requirements: 1.4, 1.6_

- [x] 2. Add database helper function
  - Add `hasGroupWithFolder(folder: string): boolean` function to `src/db.ts`
  - Implement query to check if a group with specified folder exists
  - _Requirements: 3.1_

- [ ]* 2.1 Write unit test for hasGroupWithFolder
  - Test returns true when group exists
  - Test returns false when group doesn't exist
  - Test with 'main' folder specifically
  - _Requirements: 3.1_

- [x] 3. Integrate auto-registration into orchestrator
  - Modify `main()` function in `src/index.ts` to wrap `onMessage` callback
  - Add auto-registration check before storing messages for unregistered chats
  - Reload `registeredGroups` from database after successful auto-registration
  - Determine if chat is private by checking JID format and message context
  - _Requirements: 1.3, 1.4, 1.5, 2.3_

- [ ]* 3.1 Write property test for message processing continuation
  - **Property 2: Message processing continues after auto-registration**
  - **Validates: Requirements 1.5**

- [ ]* 3.2 Write property test for metadata storage
  - **Property 7: Metadata is stored for all chats**
  - **Validates: Requirements 3.3**

- [ ]* 3.3 Write integration tests for orchestrator
  - Test auto-registration triggered by Telegram private chat
  - Test auto-registration triggered by WhatsApp group chat
  - Test second message does not re-register
  - Test existing manual registration still works
  - _Requirements: 1.3, 1.4, 1.5, 2.1, 3.4_

- [x] 4. Update channel implementations for private chat detection
  - Modify `src/channels/telegram.ts` to pass chat type information
  - Modify `src/channels/whatsapp.ts` to pass chat type information (if needed)
  - Ensure `onMessage` callback receives sufficient context to determine if chat is private
  - _Requirements: 4.1_

- [ ]* 4.1 Write unit tests for channel integration
  - Test Telegram private chat detection
  - Test Telegram group chat detection
  - Test WhatsApp private chat detection
  - Test WhatsApp group chat detection
  - _Requirements: 4.1, 4.2_

- [x] 5. Add logging for auto-registration events
  - Log successful auto-registration with chat JID, name, and type
  - Log failed auto-registration attempts with reason
  - Log when auto-registration is skipped (main already exists)
  - _Requirements: 1.4, 3.1, 3.2_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Update documentation
  - Update README.md with simplified setup instructions
  - Add note about auto-registration to setup section
  - Document that first message auto-registers as 'main'
  - Keep existing manual registration docs for reference
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (minimum 100 iterations each)
- Unit tests validate specific examples and edge cases
- Auto-registration is idempotent and safe to retry on failure
- Existing manual registration functionality is preserved
