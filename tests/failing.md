
# Failing Tests Analysis (2025-08-10)

## Security Tests

- All server security tests now pass after fixing 404 handling and switching to Bun's built-in MIME type detection.

## Directory Index Serving > Basic Directory Index Serving > should handle mixed scenarios correctly

- **File**: `test/integration/directory-index-serving.test.js`
- **Status**: **FAILING**
- **Resolution**: This test is the only remaining failure. Review the test structure and expectations to ensure they match the current implementation and standard web server behavior.
