---
mode: agent
---
Use the test runner to run the project's tests. Review the output, find all the failing tests, and write the list to a file `tests/failing.md`. Then investigate each failing test to determine if the test is valid, if the test is still needed, and/or if the code needs to be fixed.

It is important to first ensure that the test assertions are still valid with the current implementation first. This is intended to handle the scenario where the implementation has changed but the test was not updated to match the new implementation. We need to first determine if the test is still validating the correct expectations by checking the git history for the related code to determine if the implementation has recently change and the test needs to be updated. If the related code is removed or depricated, the test should be removed to prevent unnecessary tests and failures. If neither of these are true, and it appears to be a legitimate bug or regression, then do a brief investigation of the problem and a potential fix.

Add the details you determine about the test to the failing.md and then proceed to the next test. Repeat this process until you have investigated and documented all failing tests.

Once the information has been recorded, organize the tests in priority order. Take into account the relationship between the tests and if fixing one test may resolve other failing tests. If so, those tests should be fixed first. Update the document and add a numbered list of which tests to fix in what order.

After the priority list has been added, begin working through each item on the list one by one. As you update, remove, or fix each failing test, update the document with the latest status and your findings/changes. Mark that item as completed and continue to the next item. Do this until all failing tests are resolved.

Finally after the list is completed, run the entire test suite again to verify that the changes did not cause new test failures. If so, record them at the end of the failing.md file.
